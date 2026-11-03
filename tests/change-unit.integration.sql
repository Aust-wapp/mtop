-- Run on the positively identified local MTOP database only.
-- Synthetic franchises, applications, history rows, and audit rows roll back.
-- The current application-status enum has no cancelled state.
BEGIN;
DO $$
DECLARE
  v_actor UUID;
  v_type UUID;
  v_franchise UUID;
  v_pending UUID;
  v_first UUID;
  v_second UUID;
  v_make TEXT;
  v_motor TEXT;
  v_chassis TEXT;
  v_previous_make TEXT;
  v_new_make TEXT;
BEGIN
  SELECT ur.user_id INTO v_actor
  FROM mtop.user_roles ur
  JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
  JOIN mtop.permissions p ON p.id = rp.permission_id
  WHERE p.code = 'application.grant'
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No local grant officer for Change Unit integration test';
  END IF;

  SELECT id INTO v_type
  FROM mtop.transaction_types
  WHERE code = 'change_unit' AND grant_effect::text = 'replace_unit';
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Change Unit transaction type is not configured';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO mtop.mtop_franchises (
    applicant_name, make, motor_number, chassis_number, plate_number,
    mtop_number, granted_until
  ) VALUES (
    'ZZTEST Change Unit Brand Owner', 'Honda', 'ZZTEST-CU-OLD-MOTOR-1',
    'ZZTEST-CU-OLD-CHASSIS-1', 'ZZTEST-CU-PLATE-11',
    'ZZTEST-CU-MTOP-1', DATE '2029-12-31'
  ) RETURNING id INTO v_franchise;

  -- Filing and rejection leave the registered unit untouched.
  INSERT INTO mtop.mtop_applications (
    franchise_id, transaction_type_id, status, new_make,
    new_motor_number, new_chassis_number
  ) VALUES (
    v_franchise, v_type, 'for_verification', 'Kawasaki',
    'ZZTEST-CU-PENDING-MOTOR', 'ZZTEST-CU-PENDING-CHASSIS'
  ) RETURNING id INTO v_pending;

  SELECT make, motor_number, chassis_number
  INTO v_make, v_motor, v_chassis
  FROM mtop.mtop_franchises WHERE id = v_franchise;
  IF (v_make, v_motor, v_chassis) IS DISTINCT FROM
     ('Honda'::TEXT, 'ZZTEST-CU-OLD-MOTOR-1'::TEXT, 'ZZTEST-CU-OLD-CHASSIS-1'::TEXT) THEN
    RAISE EXCEPTION 'Pending or rejected Change Unit changed the current motorcycle';
  END IF;

  UPDATE mtop.mtop_applications SET status = 'rejected' WHERE id = v_pending;
  SELECT make, motor_number, chassis_number
  INTO v_make, v_motor, v_chassis
  FROM mtop.mtop_franchises WHERE id = v_franchise;
  IF (v_make, v_motor, v_chassis) IS DISTINCT FROM
     ('Honda'::TEXT, 'ZZTEST-CU-OLD-MOTOR-1'::TEXT, 'ZZTEST-CU-OLD-CHASSIS-1'::TEXT) THEN
    RAISE EXCEPTION 'Rejected Change Unit changed the current motorcycle';
  END IF;

  INSERT INTO mtop.mtop_applications (
    franchise_id, transaction_type_id, status, new_make,
    new_motor_number, new_chassis_number
  ) VALUES (
    v_franchise, v_type, 'for_approval', 'Yamaha',
    'ZZTEST-CU-YAMAHA-MOTOR', 'ZZTEST-CU-YAMAHA-CHASSIS'
  ) RETURNING id INTO v_first;

  -- Reaching the review stage still must not change the registered unit.
  SELECT make, motor_number, chassis_number
  INTO v_make, v_motor, v_chassis
  FROM mtop.mtop_franchises WHERE id = v_franchise;
  IF (v_make, v_motor, v_chassis) IS DISTINCT FROM
     ('Honda'::TEXT, 'ZZTEST-CU-OLD-MOTOR-1'::TEXT, 'ZZTEST-CU-OLD-CHASSIS-1'::TEXT) THEN
    RAISE EXCEPTION 'For-approval Change Unit changed the current motorcycle';
  END IF;

  PERFORM mtop.approve_and_grant(v_first, DATE '2026-11-03', NULL, 'test first replacement');

  SELECT make, motor_number, chassis_number
  INTO v_make, v_motor, v_chassis
  FROM mtop.mtop_franchises WHERE id = v_franchise;
  IF (v_make, v_motor, v_chassis) IS DISTINCT FROM
     ('Yamaha'::TEXT, 'ZZTEST-CU-YAMAHA-MOTOR'::TEXT, 'ZZTEST-CU-YAMAHA-CHASSIS'::TEXT) THEN
    RAISE EXCEPTION 'Granted first replacement was not applied to the franchise';
  END IF;

  SELECT previous_make, new_make INTO v_previous_make, v_new_make
  FROM mtop.franchise_unit_history WHERE application_id = v_first;
  IF (v_previous_make, v_new_make) IS DISTINCT FROM ('Honda'::TEXT, 'Yamaha'::TEXT) THEN
    RAISE EXCEPTION 'First unit history did not preserve Honda to Yamaha';
  END IF;

  INSERT INTO mtop.mtop_applications (
    franchise_id, transaction_type_id, status, new_make,
    new_motor_number, new_chassis_number
  ) VALUES (
    v_franchise, v_type, 'for_approval', 'Suzuki',
    'ZZTEST-CU-SUZUKI-MOTOR', 'ZZTEST-CU-SUZUKI-CHASSIS'
  ) RETURNING id INTO v_second;

  PERFORM mtop.approve_and_grant(v_second, DATE '2026-11-03', NULL, 'test second replacement');

  SELECT previous_make, new_make INTO v_previous_make, v_new_make
  FROM mtop.franchise_unit_history WHERE application_id = v_second;
  IF (v_previous_make, v_new_make) IS DISTINCT FROM ('Yamaha'::TEXT, 'Suzuki'::TEXT) THEN
    RAISE EXCEPTION 'Second unit history did not preserve Yamaha to Suzuki';
  END IF;

  SELECT previous_make, new_make INTO v_previous_make, v_new_make
  FROM mtop.franchise_unit_history WHERE application_id = v_first;
  IF (v_previous_make, v_new_make) IS DISTINCT FROM ('Honda'::TEXT, 'Yamaha'::TEXT) THEN
    RAISE EXCEPTION 'Second replacement changed the first certification snapshot';
  END IF;

  SELECT make INTO v_make FROM mtop.mtop_franchises WHERE id = v_franchise;
  IF v_make IS DISTINCT FROM 'Suzuki' THEN
    RAISE EXCEPTION 'Current franchise make is %, expected Suzuki', v_make;
  END IF;

  RAISE NOTICE 'PASS: staged, rejected, approved, and consecutive Change Unit brand history';
END;
$$;
ROLLBACK;
