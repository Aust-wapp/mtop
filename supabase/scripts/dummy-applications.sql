-- One dummy application per transaction type, every field the printable forms
-- ask for filled in, so a printed form can be checked against the application
-- it belongs to side by side.
--
-- Not a migration — the Supabase CLI never runs it. Run it by hand against the
-- LOCAL database only:
--
--   docker exec -i supabase_db_mtop psql -U postgres < supabase/scripts/dummy-applications.sql
--
-- Safe to re-run: it removes the previous dummies first. Every dummy franchise
-- is an operator whose name starts with "DUMMY ", and nothing else is touched.
-- To remove them for good, run just the DELETE below.
--
-- Each application sits at for_verification with its requirement checklist
-- seeded and an "Application submitted" log, exactly as filing it through the
-- New Application page would leave it. The franchises behind the six
-- existing-franchise transactions are already granted (they have an MTOP
-- number and a validity date), because the system only files those against a
-- granted franchise.

BEGIN;

DELETE FROM mtop.mtop_franchises WHERE applicant_name LIKE 'DUMMY %';

DO $$
DECLARE
  admin_id uuid := (SELECT id FROM mtop.user_profiles WHERE email = 'admin@mtop.test');
  assoc_id uuid := (SELECT id FROM mtop.associations WHERE is_active ORDER BY name LIMIT 1);
  rec      record;
  fid      uuid;
  aid      uuid;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      -- code, owner, barangay, purok, contact, mtop_number, granted_until,
      -- body, plate, motor, chassis, make, route, day_off,
      -- driver, licence, driver address
      ('new_franchise',      'DUMMY JUAN DELA CRUZ',       'Aguada',           'Purok 1', '0917-100-0001', NULL,            NULL,
       'D001', 'DM-0001', 'DMMOTOR0001', 'DMCHASSIS0001', 'Honda TMX 155',   'Poblacion - Aguada',             'Sunday',
       'DUMMY PEDRO DELA CRUZ',      'N01-23-000001', 'Purok 1, Aguada, Ozamiz City'),
      ('renewal',            'DUMMY MARIA SANTOS',         'Banadero',         'Purok 2', '0917-100-0002', 'AO-2025-90002', DATE '2026-11-15',
       'D002', 'DM-0002', 'DMMOTOR0002', 'DMCHASSIS0002', 'Kawasaki Barako', 'Poblacion - Banadero',           'Tuesday',
       'DUMMY JOSE SANTOS',          'N01-23-000002', 'Purok 2, Banadero, Ozamiz City'),
      ('annual_confirmation','DUMMY ANA REYES',            'Bacolod',          'Purok 3', '0917-100-0003', 'AO-2025-90003', DATE '2028-06-30',
       'D003', 'DM-0003', 'DMMOTOR0003', 'DMCHASSIS0003', 'Yamaha Sniper',   'Poblacion - Bacolod',            'Monday',
       'DUMMY LUIS REYES',           'N01-23-000003', 'Purok 3, Bacolod, Ozamiz City'),
      ('change_unit',        'DUMMY PABLO GARCIA',         'Bagakay',          'Purok 4', '0917-100-0004', 'AO-2025-90004', DATE '2028-06-30',
       'D004', 'DM-0004', 'DMMOTOR0004', 'DMCHASSIS0004', 'Suzuki Raider',   'Poblacion - Bagakay',            'Wednesday',
       'DUMMY ROMEO GARCIA',         'N01-23-000004', 'Purok 4, Bagakay, Ozamiz City'),
      ('change_ownership',   'DUMMY ELENA RAMOS',          'Balintawak',       'Purok 5', '0917-100-0005', 'AO-2025-90005', DATE '2028-06-30',
       'D005', 'DM-0005', 'DMMOTOR0005', 'DMCHASSIS0005', 'Honda XRM',       'Poblacion - Balintawak',         'Thursday',
       'DUMMY CARLO RAMOS',          'N01-23-000005', 'Purok 5, Balintawak, Ozamiz City'),
      ('reissuance',         'DUMMY RICARDO TAN',          'Baybay San Roque', 'Purok 6', '0917-100-0006', 'AO-2025-90006', DATE '2028-06-30',
       'D006', 'DM-0006', 'DMMOTOR0006', 'DMCHASSIS0006', 'Kawasaki CT100',  'Poblacion - Baybay San Roque',   'Friday',
       'DUMMY NESTOR TAN',           'N01-23-000006', 'Purok 6, Baybay San Roque, Ozamiz City'),
      ('closure',            'DUMMY LIZA MENDOZA',         'Baybay Santa Cruz','Purok 7', '0917-100-0007', 'AO-2025-90007', DATE '2028-06-30',
       'D007', 'DM-0007', 'DMMOTOR0007', 'DMCHASSIS0007', 'Yamaha YTX',      'Poblacion - Baybay Santa Cruz',  'Saturday',
       'DUMMY ARNEL MENDOZA',        'N01-23-000007', 'Purok 7, Baybay Santa Cruz, Ozamiz City')
    ) AS t(code, owner, barangay, purok, contact, mtop_number, granted_until,
           body, plate, motor, chassis, make, route, day_off,
           driver, licence, driver_address)
  LOOP
    INSERT INTO mtop.mtop_franchises (
      mtop_number, applicant_name, barangay, purok, applicant_address,
      contact_number, tricycle_body_number, plate_number, motor_number,
      chassis_number, make, route, day_off, association_id, granted_until,
      driver_name, driver_license_number, driver_address, created_by
    ) VALUES (
      rec.mtop_number, rec.owner, rec.barangay, rec.purok,
      rec.purok || ', ' || rec.barangay || ', Ozamiz City',
      rec.contact, rec.body, rec.plate, rec.motor,
      rec.chassis, rec.make, rec.route, rec.day_off, assoc_id, rec.granted_until,
      rec.driver, rec.licence, rec.driver_address, admin_id
    ) RETURNING id INTO fid;

    INSERT INTO mtop.mtop_applications (
      franchise_id, transaction_type_id, created_by,
      -- Staged by the system at filing, applied only when granted.
      new_motor_number, new_chassis_number, new_plate_number,
      new_applicant_name, new_barangay, new_purok,
      new_applicant_address, new_contact_number
    )
    SELECT
      fid, t.id, admin_id,
      CASE WHEN rec.code = 'change_unit' THEN 'DMNEWMOTOR04' END,
      CASE WHEN rec.code = 'change_unit' THEN 'DMNEWCHASSIS04' END,
      CASE WHEN rec.code = 'change_unit' THEN 'DM-0044' END,
      CASE WHEN rec.code = 'change_ownership' THEN 'DUMMY ROBERTO RAMOS' END,
      CASE WHEN rec.code = 'change_ownership' THEN 'Banadero' END,
      CASE WHEN rec.code = 'change_ownership' THEN 'Purok 8' END,
      CASE WHEN rec.code = 'change_ownership' THEN 'Purok 8, Banadero, Ozamiz City' END,
      CASE WHEN rec.code = 'change_ownership' THEN '0917-100-0055' END
    FROM mtop.transaction_types t
    WHERE t.code = rec.code
    RETURNING id INTO aid;

    INSERT INTO mtop.mtop_application_requirements (application_id, requirement_id)
    SELECT aid, tr.requirement_id
    FROM mtop.transaction_requirements tr
    JOIN mtop.transaction_types t ON t.id = tr.transaction_type_id
    WHERE t.code = rec.code;

    INSERT INTO mtop.approval_logs (application_id, stage, action, actor_id, remarks)
    VALUES (aid, 'for_verification', 'forwarded', admin_id, 'Application submitted');
  END LOOP;
END $$;

COMMIT;
