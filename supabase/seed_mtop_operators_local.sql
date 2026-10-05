-- Local-only synthetic data for manually reviewing the MTOP Operators pages.
-- Run explicitly with:
--   docker exec -i supabase_db_mtop psql -v ON_ERROR_STOP=1 -U postgres -d postgres < supabase/seed_mtop_operators_local.sql
--
-- This does not truncate or delete anything. It refuses to run against a
-- non-local PostgreSQL socket, another database, or a schema past migration 30.
-- Deterministic IDs make a complete rerun a no-op. A partial seed aborts.

BEGIN;

SELECT (
  (SELECT count(*) FROM mtop.mtop_franchises
   WHERE id BETWEEN '11110000-0000-4000-8000-000000000001'::uuid
                AND '11110000-0000-4000-8000-000000000006'::uuid) = 6
  AND (SELECT count(*) FROM mtop.mtop_applications
       WHERE id BETWEEN '22220000-0000-4000-8000-000000000001'::uuid
                    AND '22220000-0000-4000-8000-000000000012'::uuid) = 12
  AND (SELECT count(*) FROM mtop.approval_logs
       WHERE id BETWEEN '33330000-0000-4000-8000-000000000001'::uuid
                    AND '44440000-0000-4000-8000-000000000012'::uuid) = 24
  AND (SELECT count(*) FROM mtop.franchise_unit_history
       WHERE application_id = '22220000-0000-4000-8000-000000000004') = 1
  AND (SELECT count(*) FROM mtop.franchise_ownership_history
       WHERE application_id = '22220000-0000-4000-8000-000000000006') = 1
  AND (SELECT count(*) FROM mtop.audit_logs
       WHERE record_id BETWEEN '11110000-0000-4000-8000-000000000001'::uuid
                           AND '11110000-0000-4000-8000-000000000006'::uuid
         AND table_name = 'mtop_franchises') = 18
) AS synthetic_seed_complete \gset

\if :synthetic_seed_complete
\echo 'Synthetic MTOP seed already exists; no changes made.'
COMMIT;
\else

DO $seed_guard$
DECLARE
  v_migration_head text;
  v_existing_franchises integer;
  v_existing_applications integer;
BEGIN
  IF inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing seed: expected the local Docker PostgreSQL socket';
  END IF;

  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing seed: unexpected database or database role';
  END IF;

  SELECT max(version)::text
  INTO v_migration_head
  FROM supabase_migrations.schema_migrations;

  IF v_migration_head <> '20260413000030' THEN
    RAISE EXCEPTION 'Refusing seed: expected migration head 20260413000030, found %', v_migration_head;
  END IF;

  SELECT count(*) INTO v_existing_franchises
  FROM mtop.mtop_franchises
  WHERE id BETWEEN '11110000-0000-4000-8000-000000000001'::uuid
               AND '11110000-0000-4000-8000-000000000006'::uuid;

  SELECT count(*) INTO v_existing_applications
  FROM mtop.mtop_applications
  WHERE id BETWEEN '22220000-0000-4000-8000-000000000001'::uuid
               AND '22220000-0000-4000-8000-000000000012'::uuid;

  IF v_existing_franchises <> 0 OR v_existing_applications <> 0 THEN
    RAISE EXCEPTION 'Refusing partial synthetic seed: found % of 6 franchises and % of 12 applications',
      v_existing_franchises, v_existing_applications;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mtop.mtop_franchises
    WHERE applicant_name LIKE 'TEST OPERATOR %'
       OR applicant_name = 'TEST PREVIOUS OWNER CHARLIE'
       OR motor_number LIKE 'TEST-MOTOR-%'
       OR chassis_number LIKE 'TEST-CHASSIS-%'
       OR plate_number LIKE 'TEST-PLATE-%'
  ) THEN
    RAISE EXCEPTION 'Refusing seed: a synthetic identifier already exists outside the deterministic seed IDs';
  END IF;

  IF (SELECT count(*) FROM mtop.transaction_types WHERE code IN (
    'new_franchise', 'renewal', 'change_unit', 'change_ownership',
    'closure', 'annual_confirmation', 'reissuance'
  )) <> 7 THEN
    RAISE EXCEPTION 'Refusing seed: expected transaction types are not all present';
  END IF;
END
$seed_guard$;

INSERT INTO mtop.mtop_franchises (
  id, applicant_name, applicant_address, contact_number,
  tricycle_body_number, plate_number, motor_number, chassis_number,
  route, driver_name, driver_license_number, driver_address, make, day_off,
  franchise_status, barangay, purok
) VALUES
  ('11110000-0000-4000-8000-000000000001', 'TEST OPERATOR ALPHA',
   'TEST ADDRESS ALPHA, SAMPLE DISTRICT', '09990001001', 'TEST-BODY-A1',
   'TEST-PLATE-A1', 'TEST-MOTOR-A1', 'TEST-CHASSIS-A1', 'TEST ROUTE NORTH',
   'TEST DRIVER ALPHA', 'TEST-LICENSE-A1', 'TEST DRIVER ADDRESS ALPHA', 'TEST HONDA', 'MONDAY',
   'active', NULL, NULL),
  ('11110000-0000-4000-8000-000000000002', 'TEST OPERATOR BRAVO',
   'TEST ADDRESS BRAVO, SAMPLE DISTRICT', '09990001002', 'TEST-BODY-B1',
   'TEST-PLATE-B1', 'TEST-MOTOR-B1', 'TEST-CHASSIS-B1', 'TEST ROUTE EAST',
   'TEST DRIVER BRAVO', 'TEST-LICENSE-B1', 'TEST DRIVER ADDRESS BRAVO', 'TEST YAMAHA', 'TUESDAY',
   'active', NULL, NULL),
  ('11110000-0000-4000-8000-000000000003', 'TEST PREVIOUS OWNER CHARLIE',
   'TEST OLD ADDRESS CHARLIE, SAMPLE DISTRICT', '09990001003', 'TEST-BODY-C1',
   'TEST-PLATE-C1', 'TEST-MOTOR-C1', 'TEST-CHASSIS-C1', 'TEST ROUTE SOUTH',
   'TEST DRIVER CHARLIE', 'TEST-LICENSE-C1', 'TEST DRIVER ADDRESS CHARLIE', 'TEST SUZUKI', 'WEDNESDAY',
   'active', NULL, NULL),
  ('11110000-0000-4000-8000-000000000004', 'TEST OPERATOR DELTA',
   'TEST ADDRESS DELTA, SAMPLE DISTRICT', '09990001004', 'TEST-BODY-D1',
   'TEST-PLATE-D1', 'TEST-MOTOR-D1', 'TEST-CHASSIS-D1', 'TEST ROUTE WEST',
   'TEST DRIVER DELTA', 'TEST-LICENSE-D1', 'TEST DRIVER ADDRESS DELTA', 'TEST TVS', 'THURSDAY',
   'active', NULL, NULL),
  ('11110000-0000-4000-8000-000000000005', 'TEST OPERATOR ECHO',
   'TEST ADDRESS ECHO, SAMPLE DISTRICT', '09990001005', 'TEST-BODY-E1',
   'TEST-PLATE-E1', 'TEST-MOTOR-E1', 'TEST-CHASSIS-E1', 'TEST ROUTE CENTRAL',
   'TEST DRIVER ECHO', 'TEST-LICENSE-E1', 'TEST DRIVER ADDRESS ECHO', 'TEST BAJAJ', 'FRIDAY',
   'active', NULL, NULL),
  ('11110000-0000-4000-8000-000000000006', 'TEST OPERATOR FOXTROT',
   'TEST ADDRESS FOXTROT, SAMPLE DISTRICT', '09990001006', 'TEST-BODY-F1',
   'TEST-PLATE-F1', 'TEST-MOTOR-F1', 'TEST-CHASSIS-F1', 'TEST ROUTE CENTRAL',
   'TEST DRIVER FOXTROT', 'TEST-LICENSE-F1', 'TEST DRIVER ADDRESS FOXTROT', 'TEST HONDA', 'SATURDAY',
   'active', NULL, NULL);

WITH sample_applications (
  id, franchise_id, type_code, submitted_at, granted_at,
  new_motor_number, new_chassis_number, new_plate_number,
  new_applicant_name, new_applicant_address, new_contact_number
) AS (VALUES
  ('22220000-0000-4000-8000-000000000001'::uuid, '11110000-0000-4000-8000-000000000001'::uuid, 'new_franchise',
   '2024-02-20 09:00:00+08'::timestamptz, '2024-03-15 14:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000002'::uuid, '11110000-0000-4000-8000-000000000001'::uuid, 'renewal',
   '2026-02-12 10:00:00+08'::timestamptz, '2026-03-12 15:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000003'::uuid, '11110000-0000-4000-8000-000000000002'::uuid, 'new_franchise',
   '2024-04-02 09:00:00+08'::timestamptz, '2024-04-20 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000004'::uuid, '11110000-0000-4000-8000-000000000002'::uuid, 'change_unit',
   '2025-06-01 09:30:00+08'::timestamptz, '2025-06-20 13:00:00+08'::timestamptz,
   'TEST-MOTOR-B2', 'TEST-CHASSIS-B2', 'TEST-PLATE-B2', NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000005'::uuid, '11110000-0000-4000-8000-000000000003'::uuid, 'new_franchise',
   '2024-01-10 09:00:00+08'::timestamptz, '2024-02-01 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000006'::uuid, '11110000-0000-4000-8000-000000000003'::uuid, 'change_ownership',
   '2025-08-10 09:30:00+08'::timestamptz, '2025-09-01 13:00:00+08'::timestamptz,
   NULL, NULL, NULL, 'TEST OPERATOR CHARLIE', 'TEST NEW ADDRESS CHARLIE, SAMPLE DISTRICT', '09990001993'),
  ('22220000-0000-4000-8000-000000000007'::uuid, '11110000-0000-4000-8000-000000000004'::uuid, 'new_franchise',
   '2024-05-03 09:00:00+08'::timestamptz, '2024-05-25 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000008'::uuid, '11110000-0000-4000-8000-000000000004'::uuid, 'closure',
   '2026-01-10 09:00:00+08'::timestamptz, '2026-02-01 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000009'::uuid, '11110000-0000-4000-8000-000000000005'::uuid, 'new_franchise',
   '2025-01-10 09:00:00+08'::timestamptz, '2025-02-01 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000010'::uuid, '11110000-0000-4000-8000-000000000005'::uuid, 'annual_confirmation',
   '2026-01-05 09:00:00+08'::timestamptz, '2026-01-20 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000011'::uuid, '11110000-0000-4000-8000-000000000005'::uuid, 'reissuance',
   '2026-05-01 09:00:00+08'::timestamptz, '2026-05-15 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL),
  ('22220000-0000-4000-8000-000000000012'::uuid, '11110000-0000-4000-8000-000000000006'::uuid, 'new_franchise',
   '2026-04-01 09:00:00+08'::timestamptz, '2026-04-25 11:00:00+08'::timestamptz,
   NULL, NULL, NULL, NULL, NULL, NULL)
)
INSERT INTO mtop.mtop_applications (
  id, franchise_id, transaction_type_id, status, fiscal_year,
  submitted_at, granted_at, created_at, updated_at,
  new_motor_number, new_chassis_number, new_plate_number,
  new_applicant_name, new_applicant_address, new_contact_number
)
SELECT s.id, s.franchise_id, t.id, 'granted', extract(year from s.submitted_at)::integer,
       s.submitted_at, s.granted_at, s.submitted_at, s.granted_at,
       s.new_motor_number, s.new_chassis_number, s.new_plate_number,
       s.new_applicant_name, s.new_applicant_address, s.new_contact_number
FROM sample_applications s
JOIN mtop.transaction_types t ON t.code = s.type_code;

INSERT INTO mtop.approval_logs (id, application_id, stage, action, remarks, created_at)
SELECT ('33330000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       a.id, 'for_verification', 'forwarded', 'Synthetic local test submission', a.submitted_at
FROM mtop.mtop_applications a
JOIN generate_series(1, 12) AS n ON a.id = ('22220000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;

INSERT INTO mtop.approval_logs (id, application_id, stage, action, remarks, created_at)
SELECT ('44440000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       a.id, 'granted', 'approved', 'Synthetic local grant scenario', a.granted_at
FROM mtop.mtop_applications a
JOIN generate_series(1, 12) AS n ON a.id = ('22220000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;

DO $grant_scenarios$
DECLARE
  v_application record;
BEGIN
  FOR v_application IN
    SELECT id, granted_at
    FROM mtop.mtop_applications
    WHERE id BETWEEN '22220000-0000-4000-8000-000000000001'::uuid
                 AND '22220000-0000-4000-8000-000000000012'::uuid
    ORDER BY submitted_at, id
  LOOP
    PERFORM mtop.grant_franchise(v_application.id, v_application.granted_at, 3);
  END LOOP;
END
$grant_scenarios$;

-- The grant function records genuine unit/ownership history and franchise
-- audit changes. Align those generated timestamps with the historical sample
-- transaction dates so the Activity view tells a sensible story.
UPDATE mtop.franchise_unit_history h
SET changed_at = a.granted_at
FROM mtop.mtop_applications a
WHERE h.application_id = a.id
  AND a.id = '22220000-0000-4000-8000-000000000004';

UPDATE mtop.franchise_ownership_history h
SET changed_at = a.granted_at
FROM mtop.mtop_applications a
WHERE h.application_id = a.id
  AND a.id = '22220000-0000-4000-8000-000000000006';

WITH audit_rows AS (
  SELECT id, franchise_id,
         row_number() OVER (PARTITION BY franchise_id ORDER BY created_at, id) AS event_number
  FROM mtop.audit_logs
  WHERE table_name = 'mtop_franchises'
    AND franchise_id BETWEEN '11110000-0000-4000-8000-000000000001'::uuid
                         AND '11110000-0000-4000-8000-000000000006'::uuid
), event_times (franchise_id, event_number, event_at) AS (VALUES
  ('11110000-0000-4000-8000-000000000001'::uuid, 1, '2024-02-20 09:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000001'::uuid, 2, '2024-03-15 14:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000001'::uuid, 3, '2026-03-12 15:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000002'::uuid, 1, '2024-04-02 09:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000002'::uuid, 2, '2024-04-20 11:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000002'::uuid, 3, '2025-06-20 13:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000003'::uuid, 1, '2024-01-10 09:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000003'::uuid, 2, '2024-02-01 11:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000003'::uuid, 3, '2025-09-01 13:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000004'::uuid, 1, '2024-05-03 09:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000004'::uuid, 2, '2024-05-25 11:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000004'::uuid, 3, '2026-02-01 11:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000005'::uuid, 1, '2025-01-10 09:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000005'::uuid, 2, '2025-02-01 11:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000005'::uuid, 3, '2026-01-20 11:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000005'::uuid, 4, '2026-05-15 11:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000006'::uuid, 1, '2026-04-01 09:00:00+08'::timestamptz),
  ('11110000-0000-4000-8000-000000000006'::uuid, 2, '2026-04-25 11:00:00+08'::timestamptz)
)
UPDATE mtop.audit_logs a
SET created_at = e.event_at
FROM audit_rows r
JOIN event_times e ON e.franchise_id = r.franchise_id AND e.event_number = r.event_number
WHERE a.id = r.id;

COMMIT;

\endif
