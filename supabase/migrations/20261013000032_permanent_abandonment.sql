-- Persist abandonment as a one-way franchise lifecycle state. The existing
-- expiration calculation uses a strict `daysRemaining < -graceDays` boundary;
-- the sweep below keeps that boundary and only transitions active franchises.

ALTER TABLE mtop.mtop_franchises
  ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMPTZ;

COMMENT ON COLUMN mtop.mtop_franchises.abandoned_at IS
  'When this franchise was classified as abandoned. Abandonment is permanent.';

INSERT INTO mtop.system_settings (key, value)
VALUES ('abandonment_grace_days', '120'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- The threshold controls a permanent lifecycle transition, so only users with
-- the existing admin.manage permission may change it through direct database
-- access or the settings server action.
DROP POLICY IF EXISTS "Authenticated users can insert system_settings"
  ON mtop.system_settings;
DROP POLICY IF EXISTS "Authenticated users can update system_settings"
  ON mtop.system_settings;

CREATE POLICY "Administrators can insert system_settings"
  ON mtop.system_settings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM mtop.user_roles AS user_role
      JOIN mtop.role_permissions AS role_permission
        ON role_permission.role_id = user_role.role_id
      JOIN mtop.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE user_role.user_id = auth.uid()
        AND permission.code = 'admin.manage'
    )
  );

CREATE POLICY "Administrators can update system_settings"
  ON mtop.system_settings FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM mtop.user_roles AS user_role
      JOIN mtop.role_permissions AS role_permission
        ON role_permission.role_id = user_role.role_id
      JOIN mtop.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE user_role.user_id = auth.uid()
        AND permission.code = 'admin.manage'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM mtop.user_roles AS user_role
      JOIN mtop.role_permissions AS role_permission
        ON role_permission.role_id = user_role.role_id
      JOIN mtop.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE user_role.user_id = auth.uid()
        AND permission.code = 'admin.manage'
    )
  );

CREATE OR REPLACE FUNCTION mtop.enforce_permanent_abandonment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_closure_grant TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.franchise_status <> 'active' OR NEW.abandoned_at IS NOT NULL THEN
      RAISE EXCEPTION 'New franchises must begin active and cannot have an abandonment timestamp'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.franchise_status IS DISTINCT FROM OLD.franchise_status THEN
      v_closure_grant := current_setting('mtop.application_grant', true);

      IF OLD.franchise_status = 'active'
         AND NEW.franchise_status = 'abandoned'
         AND current_setting('mtop.abandonment_sweep', true) = 'true' THEN
        NULL;
      ELSIF OLD.franchise_status = 'active'
            AND NEW.franchise_status = 'closed'
            AND v_closure_grant ~ ('^' || OLD.id::text || ':[0-9a-f-]{36}:close_franchise$')
            AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
        NULL;
      ELSIF OLD.franchise_status = 'abandoned'
            AND NEW.franchise_status = 'closed'
            AND v_closure_grant ~ ('^' || OLD.id::text || ':[0-9a-f-]{36}:close_franchise$')
            AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
        -- Closure records remain valid, but cannot replace the permanent
        -- abandoned lifecycle status.
        NEW.franchise_status := 'abandoned';
      ELSE
        RAISE EXCEPTION 'Franchise lifecycle status can only change through a valid sweep or grant'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF OLD.abandoned_at IS NOT NULL
       AND NEW.abandoned_at IS DISTINCT FROM OLD.abandoned_at THEN
      RAISE EXCEPTION 'The abandonment timestamp cannot be changed'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.franchise_status = 'abandoned'
       AND OLD.franchise_status NOT IN ('active', 'abandoned') THEN
      RAISE EXCEPTION 'Only an active franchise can be classified as abandoned'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.franchise_status = 'abandoned' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.abandoned_at := coalesce(NEW.abandoned_at, now());
    ELSE
      NEW.abandoned_at := coalesce(NEW.abandoned_at, OLD.abandoned_at, now());
    END IF;
  ELSIF NEW.abandoned_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only an abandoned franchise can have an abandonment timestamp'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_permanent_abandonment
  ON mtop.mtop_franchises;
CREATE TRIGGER enforce_permanent_abandonment
  BEFORE INSERT OR UPDATE OF franchise_status, abandoned_at, closed_at
  ON mtop.mtop_franchises
  FOR EACH ROW
  EXECUTE FUNCTION mtop.enforce_permanent_abandonment();

CREATE OR REPLACE FUNCTION mtop.abandon_due_franchises()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_setting JSONB;
  v_setting_text TEXT;
  v_grace_days NUMERIC := 120;
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_abandoned BIGINT;
  v_previous_sweep TEXT;
BEGIN
  -- Locking the setting row serializes a sweep against a concurrent threshold
  -- update. A sweep therefore uses either the old or new complete value.
  SELECT value INTO v_setting
  FROM mtop.system_settings
  WHERE key = 'abandonment_grace_days'
  FOR SHARE;

  IF FOUND THEN
    v_setting_text := v_setting #>> '{}';
    IF v_setting_text ~ '^[0-9]+$' THEN
      BEGIN
        v_grace_days := v_setting_text::numeric;
      EXCEPTION WHEN numeric_value_out_of_range THEN
        v_grace_days := 120;
      END;
    END IF;
  END IF;

  v_previous_sweep := current_setting('mtop.abandonment_sweep', true);
  PERFORM set_config('mtop.abandonment_sweep', 'true', true);

  UPDATE mtop.mtop_franchises AS franchise
  SET franchise_status = 'abandoned',
      abandoned_at = now(),
      updated_at = now()
  WHERE franchise.franchise_status = 'active'
    AND franchise.granted_until IS NOT NULL
    AND (v_today - franchise.granted_until)::numeric > v_grace_days;

  GET DIAGNOSTICS v_abandoned = ROW_COUNT;

  PERFORM set_config(
    'mtop.abandonment_sweep', coalesce(v_previous_sweep, ''), true
  );

  RETURN v_abandoned;
END;
$$;

COMMENT ON FUNCTION mtop.abandon_due_franchises() IS
  'Idempotently classifies active franchises beyond the configured post-expiry grace period.';

GRANT EXECUTE ON FUNCTION mtop.abandon_due_franchises() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION mtop.abandon_due_franchises() FROM PUBLIC;

-- Preserve every abandonment already stored, assigning a timestamp when the
-- old row has no historical timestamp. Then persist all rows the old dynamic
-- rule currently classifies as abandoned under the saved grace setting.
DO $$
DECLARE
  v_setting JSONB;
  v_setting_text TEXT;
  v_grace_days NUMERIC := 120;
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_previous_sweep TEXT;
BEGIN
  SELECT value INTO v_setting
  FROM mtop.system_settings
  WHERE key = 'abandonment_grace_days';

  IF FOUND THEN
    v_setting_text := v_setting #>> '{}';
    IF v_setting_text ~ '^[0-9]+$' THEN
      BEGIN
        v_grace_days := v_setting_text::numeric;
      EXCEPTION WHEN numeric_value_out_of_range THEN
        v_grace_days := 120;
      END;
    END IF;
  END IF;

  UPDATE mtop.mtop_franchises AS franchise
  SET abandoned_at = CASE
    WHEN franchise.granted_until IS NOT NULL
     AND (v_today - franchise.granted_until)::numeric > v_grace_days
    THEN ((franchise.granted_until + (v_grace_days + 1)::integer)::timestamp
          AT TIME ZONE 'Asia/Manila')
    ELSE now()
  END,
  updated_at = now()
  WHERE franchise.franchise_status = 'abandoned'
    AND franchise.abandoned_at IS NULL;

  -- The old application derived abandonment from the expiry date. Preserve
  -- that historical classification and infer when it first crossed the
  -- configured boundary, rather than stamping every legacy row with the
  -- migration execution time.
  v_previous_sweep := current_setting('mtop.abandonment_sweep', true);
  PERFORM set_config('mtop.abandonment_sweep', 'true', true);

  UPDATE mtop.mtop_franchises AS franchise
  SET franchise_status = 'abandoned',
      abandoned_at = (
        (franchise.granted_until + (v_grace_days + 1)::integer)::timestamp
        AT TIME ZONE 'Asia/Manila'
      ),
      updated_at = now()
  WHERE franchise.franchise_status = 'active'
    AND franchise.granted_until IS NOT NULL
    AND (v_today - franchise.granted_until)::numeric > v_grace_days;

  PERFORM set_config(
    'mtop.abandonment_sweep', coalesce(v_previous_sweep, ''), true
  );
END;
$$;

SELECT mtop.abandon_due_franchises();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'mtop.mtop_franchises'::regclass
      AND conname = 'mtop_franchises_abandoned_at_consistent'
  ) THEN
    ALTER TABLE mtop.mtop_franchises
      ADD CONSTRAINT mtop_franchises_abandoned_at_consistent
      CHECK (
        (franchise_status = 'abandoned' AND abandoned_at IS NOT NULL)
        OR (franchise_status <> 'abandoned' AND abandoned_at IS NULL)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION mtop.guard_abandoned_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_franchise_status mtop.franchise_status;
  v_grant_effect TEXT;
  v_new_work BOOLEAN;
  v_new_grant BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_work := TRUE;
    v_new_grant := NEW.status = 'granted';
  ELSE
    v_new_work := NEW.franchise_id IS DISTINCT FROM OLD.franchise_id
      OR NEW.transaction_type_id IS DISTINCT FROM OLD.transaction_type_id;
    v_new_grant := NEW.status = 'granted'
      AND OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  IF NOT v_new_work AND NOT v_new_grant THEN
    RETURN NEW;
  END IF;

  SELECT franchise_status INTO v_franchise_status
  FROM mtop.mtop_franchises
  WHERE id = NEW.franchise_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Franchise % not found', NEW.franchise_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT grant_effect::text INTO v_grant_effect
  FROM mtop.transaction_types
  WHERE id = NEW.transaction_type_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction type % not found', NEW.transaction_type_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_franchise_status = 'abandoned'
     AND v_grant_effect <> 'close_franchise'
     AND (v_new_work OR v_new_grant) THEN
    RAISE EXCEPTION 'An abandoned franchise can only be closed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'granted' AND NEW.granted_at IS NULL THEN
    NEW.granted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_abandoned_application
  ON mtop.mtop_applications;
CREATE TRIGGER guard_abandoned_application
  BEFORE INSERT OR UPDATE OF franchise_id, transaction_type_id, status
  ON mtop.mtop_applications
  FOR EACH ROW
  EXECUTE FUNCTION mtop.guard_abandoned_application();

CREATE OR REPLACE FUNCTION mtop.apply_granted_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_effect TEXT;
  v_validity_setting JSONB;
  v_validity_text TEXT;
  v_validity_years INTEGER := 3;
  v_previous_token TEXT;
BEGIN
  SELECT t.grant_effect::text
  INTO v_effect
  FROM mtop.mtop_applications a
  JOIN mtop.transaction_types t ON t.id = a.transaction_type_id
  WHERE a.id = NEW.id;

  SELECT value INTO v_validity_setting
  FROM mtop.system_settings
  WHERE key = 'permit_validity_years';

  IF FOUND THEN
    v_validity_text := v_validity_setting #>> '{}';
    IF v_validity_text ~ '^[0-9]{1,2}$' THEN
      v_validity_years := greatest(1, least(v_validity_text::integer, 10));
    END IF;
  END IF;

  v_previous_token := current_setting('mtop.application_grant', true);
  PERFORM set_config(
    'mtop.application_grant',
    NEW.franchise_id::text || ':' || NEW.id::text || ':' || v_effect,
    true
  );
  PERFORM mtop.grant_franchise(NEW.id, coalesce(NEW.granted_at, now()), v_validity_years);
  PERFORM set_config('mtop.application_grant', coalesce(v_previous_token, ''), true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_granted_application_after_insert
  ON mtop.mtop_applications;
CREATE TRIGGER apply_granted_application_after_insert
  AFTER INSERT ON mtop.mtop_applications
  FOR EACH ROW
  WHEN (NEW.status = 'granted')
  EXECUTE FUNCTION mtop.apply_granted_application();

DROP TRIGGER IF EXISTS apply_granted_application_after_update
  ON mtop.mtop_applications;
CREATE TRIGGER apply_granted_application_after_update
  AFTER UPDATE OF status ON mtop.mtop_applications
  FOR EACH ROW
  WHEN (NEW.status = 'granted' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION mtop.apply_granted_application();

-- The grant routine now runs from the application trigger in the same
-- transaction as the decision. Keep direct execution for the service role,
-- but prevent clients from bypassing the application transition.
REVOKE EXECUTE ON FUNCTION mtop.grant_franchise(UUID, TIMESTAMPTZ, INTEGER)
  FROM authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION mtop.grant_franchise(UUID, TIMESTAMPTZ, INTEGER)
  TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'mtop_abandonment_sweep';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  -- 16:15 UTC is 00:15 in Ozamiz. Reads and settings updates also sweep, so a
  -- quiet system still persists the transition shortly after the Manila day
  -- boundary.
  PERFORM cron.schedule(
    'mtop_abandonment_sweep',
    '15 16 * * *',
    'SELECT mtop.abandon_due_franchises();'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
