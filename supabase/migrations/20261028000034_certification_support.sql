-- Certificate data that was not captured by the original change-unit flow.
-- Existing application and history rows remain intact; their new make fields
-- are NULL because that information was not recorded at filing time.
ALTER TABLE mtop.mtop_applications
  ADD COLUMN new_make TEXT;

COMMENT ON COLUMN mtop.mtop_applications.new_make IS
  'Change-unit only: the incoming vehicle make, applied to the franchise when granted.';

ALTER TABLE mtop.franchise_unit_history
  ADD COLUMN previous_make TEXT,
  ADD COLUMN new_make TEXT;

COMMENT ON COLUMN mtop.franchise_unit_history.previous_make IS
  'Vehicle make before the change-unit application was granted.';
COMMENT ON COLUMN mtop.franchise_unit_history.new_make IS
  'Vehicle make after the change-unit application was granted.';

-- Keep the printed name editable in System Settings without hardcoding the
-- photographed signatory into the certificate or application code.
INSERT INTO mtop.system_settings (key, value)
VALUES ('city_treasurer_name', '"CITY TREASURER"'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION mtop.apply_change_unit_make_after_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_transaction_code TEXT;
  v_previous_make TEXT;
  v_history_rows INTEGER;
BEGIN
  IF NEW.status <> 'granted' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT code
  INTO v_transaction_code
  FROM mtop.transaction_types
  WHERE id = NEW.transaction_type_id;

  IF v_transaction_code IS DISTINCT FROM 'change_unit'
     OR NULLIF(btrim(NEW.new_make), '') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT make
  INTO v_previous_make
  FROM mtop.mtop_franchises
  WHERE id = NEW.franchise_id
  FOR UPDATE;

  UPDATE mtop.franchise_unit_history
  SET previous_make = v_previous_make,
      new_make = NULLIF(btrim(NEW.new_make), '')
  WHERE application_id = NEW.id
    AND franchise_id = NEW.franchise_id;

  GET DIAGNOSTICS v_history_rows = ROW_COUNT;
  IF v_history_rows <> 1 THEN
    RAISE EXCEPTION
      'Expected one unit-history row for granted change-unit application %, found %',
      NEW.id,
      v_history_rows;
  END IF;

  UPDATE mtop.mtop_franchises
  SET make = NULLIF(btrim(NEW.new_make), ''),
      updated_at = now()
  WHERE id = NEW.franchise_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION mtop.apply_change_unit_make_after_grant()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzz_apply_change_unit_make_after_grant
  ON mtop.mtop_applications;
CREATE TRIGGER zzz_apply_change_unit_make_after_grant
  AFTER UPDATE OF status ON mtop.mtop_applications
  FOR EACH ROW
  WHEN (NEW.status = 'granted' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION mtop.apply_change_unit_make_after_grant();

COMMENT ON TRIGGER zzz_apply_change_unit_make_after_grant
  ON mtop.mtop_applications IS
  'Runs after apply_granted_application_after_update so unit history and the franchise retain the granted make.';
