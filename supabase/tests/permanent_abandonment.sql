-- Run with psql against a migrated local database. All fixture writes, audit
-- events and setting changes are rolled back when the script finishes.
BEGIN;

DO $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_franchise_a UUID := gen_random_uuid();
  v_franchise_b UUID := gen_random_uuid();
  v_franchise_c UUID := gen_random_uuid();
  v_franchise_e UUID := gen_random_uuid();
  v_franchise_f UUID := gen_random_uuid();
  v_franchise_g UUID := gen_random_uuid();
  v_renewal_type UUID;
  v_confirmation_type UUID;
  v_closure_type UUID;
  v_renewal_application UUID := gen_random_uuid();
  v_granted_history_application UUID := gen_random_uuid();
  v_closure_application UUID := gen_random_uuid();
  v_active_closure_application UUID := gen_random_uuid();
  v_blocked_application UUID := gen_random_uuid();
  v_abandoned_at TIMESTAMPTZ;
  v_sweep_count BIGINT;
  v_status mtop.franchise_status;
  v_application_status mtop.mtop_status;
BEGIN
  SELECT id INTO STRICT v_renewal_type
  FROM mtop.transaction_types
  WHERE code = 'renewal';

  SELECT id INTO STRICT v_confirmation_type
  FROM mtop.transaction_types
  WHERE code = 'annual_confirmation';

  SELECT id INTO STRICT v_closure_type
  FROM mtop.transaction_types
  WHERE code = 'closure';

  UPDATE mtop.system_settings
  SET value = '120'::jsonb
  WHERE key = 'abandonment_grace_days';

  INSERT INTO mtop.mtop_franchises (
    id, applicant_name, motor_number, chassis_number, granted_until
  ) VALUES
    (v_franchise_a, 'Abandonment Test A ' || v_franchise_a,
     'AB-A-' || v_franchise_a, 'CH-A-' || v_franchise_a, v_today - 121),
    (v_franchise_c, 'Abandonment Test C ' || v_franchise_c,
     'AB-C-' || v_franchise_c, 'CH-C-' || v_franchise_c, v_today - 95),
    (v_franchise_g, 'Active Closure Test ' || v_franchise_g,
     'AB-G-' || v_franchise_g, 'CH-G-' || v_franchise_g, v_today + 365);

  -- Existing granted decisions stay granted when the franchise later changes
  -- lifecycle state. This insert exercises the normal grant effect first.
  INSERT INTO mtop.mtop_applications (
    id, franchise_id, transaction_type_id, status, granted_at
  ) VALUES (
    v_granted_history_application, v_franchise_a, v_confirmation_type,
    'granted', now()
  );

  INSERT INTO mtop.mtop_applications (
    id, franchise_id, transaction_type_id, status
  ) VALUES (
    v_renewal_application, v_franchise_a, v_renewal_type, 'for_verification'
  );

  BEGIN
    UPDATE mtop.mtop_franchises
    SET franchise_status = 'abandoned'
    WHERE id = v_franchise_c;
    RAISE EXCEPTION 'a direct premature abandonment unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_c)
     <> 'active' THEN
    RAISE EXCEPTION 'a direct write bypassed the configured abandonment threshold';
  END IF;

  -- 120-day configuration: this sweep is the migration's historical dynamic
  -- abandonment backfill, and it must persist both status and timestamp.
  SELECT mtop.abandon_due_franchises() INTO v_sweep_count;
  SELECT franchise_status, abandoned_at
  INTO v_status, v_abandoned_at
  FROM mtop.mtop_franchises
  WHERE id = v_franchise_a;
  IF v_status <> 'abandoned' OR v_abandoned_at IS NULL THEN
    RAISE EXCEPTION '120-day sweep did not persist franchise A';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM mtop.audit_logs
    WHERE table_name = 'mtop_franchises'
      AND record_id = v_franchise_a
      AND changes -> 'franchise_status' ->> 'new' = 'abandoned'
      AND changes ? 'abandoned_at'
  ) THEN
    RAISE EXCEPTION 'abandonment did not create the expected franchise audit entry';
  END IF;

  -- Re-running the sweep must not replace the classification timestamp.
  SELECT mtop.abandon_due_franchises() INTO v_sweep_count;
  IF v_sweep_count <> 0 THEN
    RAISE EXCEPTION 'repeated sweep was not idempotent';
  END IF;
  IF (SELECT abandoned_at FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     IS DISTINCT FROM v_abandoned_at THEN
    RAISE EXCEPTION 'repeated sweep changed franchise A abandonment timestamp';
  END IF;

  -- This 125-day-old franchise was not classified by the earlier sweep.
  INSERT INTO mtop.mtop_franchises (
    id, applicant_name, motor_number, chassis_number, granted_until
  ) VALUES (
    v_franchise_b, 'Abandonment Test B ' || v_franchise_b,
    'AB-B-' || v_franchise_b, 'CH-B-' || v_franchise_b, v_today - 125
  );

  -- 120 -> 130: A stays abandoned; the unclassified 125-day-old B follows 130.
  UPDATE mtop.system_settings SET value = '130'::jsonb
  WHERE key = 'abandonment_grace_days';
  PERFORM mtop.abandon_due_franchises();
  IF (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     <> 'abandoned'
     OR (SELECT abandoned_at FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     IS DISTINCT FROM v_abandoned_at THEN
    RAISE EXCEPTION 'franchise A changed after 120 -> 130';
  END IF;
  IF (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_b)
     <> 'active' THEN
    RAISE EXCEPTION 'unclassified franchise B did not follow the 130-day threshold';
  END IF;

  -- Return to 120, then lower to 90. B and C become newly eligible; A remains
  -- abandoned with the same timestamp.
  UPDATE mtop.system_settings SET value = '120'::jsonb
  WHERE key = 'abandonment_grace_days';
  PERFORM mtop.abandon_due_franchises();
  UPDATE mtop.system_settings SET value = '90'::jsonb
  WHERE key = 'abandonment_grace_days';
  PERFORM mtop.abandon_due_franchises();
  IF EXISTS (
    SELECT 1 FROM mtop.mtop_franchises
    WHERE id IN (v_franchise_a, v_franchise_b, v_franchise_c)
      AND franchise_status <> 'abandoned'
  ) THEN
    RAISE EXCEPTION 'already or newly eligible franchises did not remain/become abandoned at 90 days';
  END IF;
  IF (SELECT abandoned_at FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     IS DISTINCT FROM v_abandoned_at THEN
    RAISE EXCEPTION 'franchise A timestamp changed after threshold decrease';
  END IF;

  -- 90 -> 150: the previously abandoned records remain permanent, while an
  -- unclassified 140-day record follows the larger threshold and a 151-day
  -- record is newly classified.
  INSERT INTO mtop.mtop_franchises (
    id, applicant_name, motor_number, chassis_number, granted_until
  ) VALUES
    (v_franchise_e, 'Abandonment Test E ' || v_franchise_e,
     'AB-E-' || v_franchise_e, 'CH-E-' || v_franchise_e, v_today - 140),
    (v_franchise_f, 'Abandonment Test F ' || v_franchise_f,
     'AB-F-' || v_franchise_f, 'CH-F-' || v_franchise_f, v_today - 151);
  UPDATE mtop.system_settings SET value = '150'::jsonb
  WHERE key = 'abandonment_grace_days';
  PERFORM mtop.abandon_due_franchises();
  IF EXISTS (
    SELECT 1 FROM mtop.mtop_franchises
    WHERE id IN (v_franchise_a, v_franchise_b, v_franchise_c)
      AND franchise_status <> 'abandoned'
  ) THEN
    RAISE EXCEPTION 'an earlier abandoned status reversed after 90 -> 150';
  END IF;
  IF (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_e)
     <> 'active'
     OR (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_f)
     <> 'abandoned' THEN
    RAISE EXCEPTION 'new franchises did not follow the 150-day threshold';
  END IF;

  -- A renewal filed while active cannot be granted after the sweep wins the
  -- franchise row lock. Its application decision remains unchanged on error.
  BEGIN
    UPDATE mtop.mtop_applications
    SET status = 'granted', granted_at = now()
    WHERE id = v_renewal_application;
    RAISE EXCEPTION 'an abandoned renewal was unexpectedly granted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  SELECT status INTO v_application_status
  FROM mtop.mtop_applications WHERE id = v_renewal_application;
  IF v_application_status <> 'for_verification' THEN
    RAISE EXCEPTION 'failed abandoned renewal changed the application decision status';
  END IF;

  BEGIN
    UPDATE mtop.mtop_franchises
    SET franchise_status = 'active'
    WHERE id = v_franchise_a;
    RAISE EXCEPTION 'direct status reversal unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     <> 'abandoned' THEN
    RAISE EXCEPTION 'direct status update reversed franchise A';
  END IF;

  BEGIN
    UPDATE mtop.mtop_franchises
    SET abandoned_at = now() + interval '1 day'
    WHERE id = v_franchise_a;
    RAISE EXCEPTION 'direct timestamp change unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Once the renewal is rejected, closure remains available. Granting it sets
  -- closed_at while retaining the permanent abandoned lifecycle status.
  UPDATE mtop.mtop_applications
  SET status = 'rejected'
  WHERE id = v_renewal_application;
  BEGIN
    INSERT INTO mtop.mtop_applications (
      id, franchise_id, transaction_type_id, status
    ) VALUES (
      v_blocked_application, v_franchise_a, v_renewal_type, 'for_verification'
    );
    RAISE EXCEPTION 'a new renewal filing against an abandoned franchise succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  INSERT INTO mtop.mtop_applications (
    id, franchise_id, transaction_type_id, status
  ) VALUES (
    v_closure_application, v_franchise_a, v_closure_type, 'for_verification'
  );
  UPDATE mtop.mtop_applications
  SET status = 'granted', granted_at = now()
  WHERE id = v_closure_application;
  IF (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     <> 'abandoned'
     OR (SELECT abandoned_at FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     IS DISTINCT FROM v_abandoned_at
     OR (SELECT closed_at FROM mtop.mtop_franchises WHERE id = v_franchise_a)
     IS NULL THEN
    RAISE EXCEPTION 'closure did not preserve abandonment and record its date';
  END IF;

  -- The original granted/rejected application outcomes survive every sweep.
  IF (SELECT status FROM mtop.mtop_applications
      WHERE id = v_granted_history_application) <> 'granted'
     OR (SELECT status FROM mtop.mtop_applications
         WHERE id = v_renewal_application) <> 'rejected' THEN
    RAISE EXCEPTION 'a lifecycle sweep changed historical application decisions';
  END IF;

  -- Normal closure of an active franchise keeps its existing behavior.
  INSERT INTO mtop.mtop_applications (
    id, franchise_id, transaction_type_id, status
  ) VALUES (
    v_active_closure_application, v_franchise_g, v_closure_type,
    'for_verification'
  );
  UPDATE mtop.mtop_applications
  SET status = 'granted', granted_at = now()
  WHERE id = v_active_closure_application;
  IF (SELECT franchise_status FROM mtop.mtop_franchises WHERE id = v_franchise_g)
     <> 'closed'
     OR (SELECT closed_at FROM mtop.mtop_franchises WHERE id = v_franchise_g)
     IS NULL THEN
    RAISE EXCEPTION 'normal closure behavior changed';
  END IF;
END;
$$;

ROLLBACK;
