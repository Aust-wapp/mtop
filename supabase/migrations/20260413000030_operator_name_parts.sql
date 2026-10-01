-- The operator's name, in four parts.
--
-- The forms now ask for last name, first name, middle name and suffix
-- separately. Like the address (20260413000020), the parts are stored and the
-- one readable line is kept beside them: applicant_name stays the column the
-- card, search, reports, the audit trail and the one-franchise-per-operator
-- index all read, composed by the server actions as
-- "First Middle Last Suffix" — the order the existing records are written in.
--
-- No backfill. Splitting "Ernesto J. Dela Cruz" by machine guesses wrong on
-- exactly the names that matter (Dela Cruz, De los Santos), so franchises
-- registered before this keep a NULL in each part and their applicant_name
-- as typed.
--
-- A change of ownership stages the successor's parts as new_* on the
-- application, and grant_franchise()'s transfer_owner branch moves them onto
-- the franchise with new_applicant_name.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE mtop.mtop_franchises
  ADD COLUMN IF NOT EXISTS last_name   TEXT,
  ADD COLUMN IF NOT EXISTS first_name  TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS suffix      TEXT;

ALTER TABLE mtop.mtop_applications
  ADD COLUMN IF NOT EXISTS new_last_name   TEXT,
  ADD COLUMN IF NOT EXISTS new_first_name  TEXT,
  ADD COLUMN IF NOT EXISTS new_middle_name TEXT,
  ADD COLUMN IF NOT EXISTS new_suffix      TEXT;

-- ---------------------------------------------------------------------------
-- 2. Carry the parts across on a transfer
-- ---------------------------------------------------------------------------
-- Only the transfer_owner branch changes. The rest is unchanged from
-- 20260413000026_mtop_number_grant_year.sql.

CREATE OR REPLACE FUNCTION mtop.grant_franchise(
  p_application_id UUID,
  p_granted_at TIMESTAMPTZ,
  p_validity_years INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_app       RECORD;
  v_franchise RECORD;
  v_number    TEXT;
  v_until     DATE;
  v_holder    TEXT;
BEGIN
  SELECT
    a.id, a.franchise_id, a.created_by,
    a.new_motor_number, a.new_chassis_number, a.new_plate_number,
    a.new_applicant_name, a.new_applicant_address, a.new_contact_number,
    a.new_barangay, a.new_purok,
    a.new_last_name, a.new_first_name, a.new_middle_name, a.new_suffix,
    t.grant_effect
  INTO v_app
  FROM mtop.mtop_applications a
  JOIN mtop.transaction_types t ON t.id = a.transaction_type_id
  WHERE a.id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application % not found', p_application_id;
  END IF;

  SELECT * INTO v_franchise
  FROM mtop.mtop_franchises
  WHERE id = v_app.franchise_id
  FOR UPDATE;

  v_number := v_franchise.mtop_number;

  CASE v_app.grant_effect
    WHEN 'issue_number' THEN
      v_until := (mtop.grant_date(p_granted_at) + (p_validity_years || ' years')::interval)::date;
      IF v_number IS NULL THEN
        v_number := mtop.next_mtop_number(mtop.grant_year(p_granted_at));
      END IF;
      UPDATE mtop.mtop_franchises
      SET mtop_number = v_number,
          granted_until = v_until,
          franchise_status = 'active',
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'extend_validity' THEN
      v_until := (mtop.grant_date(p_granted_at) + (p_validity_years || ' years')::interval)::date;
      UPDATE mtop.mtop_franchises
      SET granted_until = v_until,
          franchise_status = 'active',
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'replace_unit' THEN
      IF v_app.new_motor_number IS NULL OR v_app.new_chassis_number IS NULL THEN
        RAISE EXCEPTION
          'Cannot grant a change-of-unit application without a new motor and chassis number (application %)',
          p_application_id;
      END IF;

      -- One plate per active franchise: the incoming unit's plate must not
      -- already be on someone else's record.
      IF v_app.new_plate_number IS NOT NULL THEN
        SELECT coalesce(f.mtop_number, '(ungranted)') || ' - ' || f.applicant_name
        INTO v_holder
        FROM mtop.mtop_franchises f
        WHERE f.franchise_status = 'active'
          AND f.id <> v_app.franchise_id
          AND mtop.normalize_unit_identifier(f.plate_number)
              = mtop.normalize_unit_identifier(v_app.new_plate_number)
        LIMIT 1;

        IF v_holder IS NOT NULL THEN
          RAISE EXCEPTION
            'Plate number % is already on another active franchise (%). Correct the plate before granting this change of unit.',
            v_app.new_plate_number, v_holder;
        END IF;
      END IF;

      -- Motor and chassis are the unit's permanent identity, stamped by the
      -- manufacturer, so the incoming unit must not already be on another
      -- active franchise either. Staged at filing and applied here, so the
      -- same race the plate has applies to them.
      SELECT coalesce(f.mtop_number, '(ungranted)') || ' - ' || f.applicant_name
      INTO v_holder
      FROM mtop.mtop_franchises f
      WHERE f.franchise_status = 'active'
        AND f.id <> v_app.franchise_id
        AND mtop.normalize_unit_identifier(f.motor_number)
            = mtop.normalize_unit_identifier(v_app.new_motor_number)
      LIMIT 1;

      IF v_holder IS NOT NULL THEN
        RAISE EXCEPTION
          'Motor number % is already on another active franchise (%). Correct it before granting this change of unit.',
          v_app.new_motor_number, v_holder;
      END IF;

      SELECT coalesce(f.mtop_number, '(ungranted)') || ' - ' || f.applicant_name
      INTO v_holder
      FROM mtop.mtop_franchises f
      WHERE f.franchise_status = 'active'
        AND f.id <> v_app.franchise_id
        AND mtop.normalize_unit_identifier(f.chassis_number)
            = mtop.normalize_unit_identifier(v_app.new_chassis_number)
      LIMIT 1;

      IF v_holder IS NOT NULL THEN
        RAISE EXCEPTION
          'Chassis number % is already on another active franchise (%). Correct it before granting this change of unit.',
          v_app.new_chassis_number, v_holder;
      END IF;

      INSERT INTO mtop.franchise_unit_history (
        franchise_id, application_id, changed_by,
        previous_motor_number, previous_chassis_number, previous_plate_number,
        new_motor_number, new_chassis_number, new_plate_number
      ) VALUES (
        v_app.franchise_id, p_application_id, v_app.created_by,
        v_franchise.motor_number, v_franchise.chassis_number, v_franchise.plate_number,
        v_app.new_motor_number, v_app.new_chassis_number,
        coalesce(v_app.new_plate_number, v_franchise.plate_number)
      );

      UPDATE mtop.mtop_franchises
      SET motor_number = v_app.new_motor_number,
          chassis_number = v_app.new_chassis_number,
          plate_number = coalesce(v_app.new_plate_number, plate_number),
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'transfer_owner' THEN
      IF v_app.new_applicant_name IS NULL THEN
        RAISE EXCEPTION
          'Cannot grant a change-of-ownership application without a new owner name (application %)',
          p_application_id;
      END IF;

      -- One franchise per operator: the successor must not already hold one.
      SELECT coalesce(f.mtop_number, 'an application in progress')
      INTO v_holder
      FROM mtop.mtop_franchises f
      WHERE f.franchise_status = 'active'
        AND f.id <> v_app.franchise_id
        AND mtop.normalize_operator_name(f.applicant_name)
            = mtop.normalize_operator_name(v_app.new_applicant_name)
      LIMIT 1;

      IF v_holder IS NOT NULL THEN
        RAISE EXCEPTION
          '% already holds an active franchise (%). An operator may only hold one franchise, so this transfer cannot be granted.',
          v_app.new_applicant_name, v_holder;
      END IF;

      INSERT INTO mtop.franchise_ownership_history (
        franchise_id, application_id, changed_by,
        previous_applicant_name, previous_applicant_address, previous_contact_number,
        new_applicant_name, new_applicant_address, new_contact_number
      ) VALUES (
        v_app.franchise_id, p_application_id, v_app.created_by,
        v_franchise.applicant_name, v_franchise.applicant_address, v_franchise.contact_number,
        v_app.new_applicant_name, v_app.new_applicant_address, v_app.new_contact_number
      );

      UPDATE mtop.mtop_franchises
      SET applicant_name = v_app.new_applicant_name,
          -- The successor's name parts replace the previous owner's outright,
          -- NULLs included: an application filed before the name was split
          -- has none, and keeping the old owner's would contradict
          -- applicant_name.
          last_name = v_app.new_last_name,
          first_name = v_app.new_first_name,
          middle_name = v_app.new_middle_name,
          suffix = v_app.new_suffix,
          applicant_address = coalesce(v_app.new_applicant_address, applicant_address),
          -- Staged barangay/purok move together with the composed line, so the
          -- structured address never describes the previous owner.
          barangay = coalesce(v_app.new_barangay, barangay),
          purok = CASE
                    WHEN v_app.new_barangay IS NOT NULL THEN v_app.new_purok
                    ELSE purok
                  END,
          contact_number = coalesce(v_app.new_contact_number, contact_number),
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'confirm_year' THEN
      UPDATE mtop.mtop_franchises
      SET last_confirmed_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'reprint_permit' THEN
      UPDATE mtop.mtop_franchises
      SET last_reissued_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'close_franchise' THEN
      UPDATE mtop.mtop_franchises
      SET franchise_status = 'closed',
          closed_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    ELSE
      RAISE EXCEPTION 'Unhandled grant effect: %', v_app.grant_effect;
  END CASE;

  RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION mtop.grant_franchise(UUID, TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;
