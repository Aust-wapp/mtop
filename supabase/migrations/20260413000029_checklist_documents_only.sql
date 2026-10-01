-- The checklist asks for papers, on every transaction.
--
-- Migration 28 took the Payments, Inspection, In person and Photos rows off
-- the change-of-ownership checklist. The same reasoning holds for every
-- transaction, so this migration does it for all of them:
--
--   payment     Money owed belongs in the fee assessment, where the amount is
--               stated, approved by the CTO head and matched to an official
--               receipt.
--   inspection  Recorded on mtop_inspections and shown on its own card; the
--               stage gate is what enforces it.
--   appearance  An attestation with no artifact behind it.
--   photo       The portraits live on the franchise and are captured on the
--               photos card.
--
-- The workflow is untouched: requires_inspection, the photos card and the fee
-- assessment all stay. Only the duplicate checklist ticks go. The catalogue
-- rows in mtop.requirements stay too — granted and rejected applications still
-- reference them.
--
-- Second, a free-text reason on the application. A re-issuance (lost or
-- damaged permit), a closure, and an annual confirmation slip each need the
-- operator's stated reason on file; createFranchiseTransaction requires it for
-- those three and leaves it NULL on the rest.

-- ---------------------------------------------------------------------------
-- 1. Off the matrix
-- ---------------------------------------------------------------------------

DELETE FROM mtop.transaction_requirements tr
USING mtop.requirements r
WHERE tr.requirement_id = r.id
  AND r.kind IN ('payment', 'inspection', 'appearance', 'photo');

-- ---------------------------------------------------------------------------
-- 2. Off the applications already in flight
-- ---------------------------------------------------------------------------
-- getApplication() treats a row with no matrix rule as mandatory, so without
-- this an application already filed would keep items nobody can clear.
-- Granted and rejected applications keep theirs: that is what was actually
-- asked of the operator at the time.

DELETE FROM mtop.mtop_application_requirements ar
USING mtop.mtop_applications a, mtop.requirements r
WHERE ar.application_id = a.id
  AND ar.requirement_id = r.id
  AND r.kind IN ('payment', 'inspection', 'appearance', 'photo')
  AND a.status NOT IN ('granted', 'rejected');

-- ---------------------------------------------------------------------------
-- 3. Reason
-- ---------------------------------------------------------------------------

ALTER TABLE mtop.mtop_applications
  ADD COLUMN IF NOT EXISTS reason TEXT;

COMMENT ON COLUMN mtop.mtop_applications.reason IS
  'Operator''s stated reason. Required at filing for reissuance, closure and '
  'annual_confirmation; NULL on other transactions.';

-- ---------------------------------------------------------------------------
-- 4. Prove it
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left      INT;
  v_in_flight INT;
BEGIN
  SELECT count(*)
  INTO v_left
  FROM mtop.transaction_requirements tr
  JOIN mtop.requirements r ON r.id = tr.requirement_id
  WHERE r.kind IN ('payment', 'inspection', 'appearance', 'photo');

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'Checklists still list % non-document requirement(s)', v_left;
  END IF;

  SELECT count(*)
  INTO v_in_flight
  FROM mtop.mtop_application_requirements ar
  JOIN mtop.mtop_applications a ON a.id = ar.application_id
  JOIN mtop.requirements r      ON r.id = ar.requirement_id
  WHERE a.status NOT IN ('granted', 'rejected')
    AND r.kind IN ('payment', 'inspection', 'appearance', 'photo');

  IF v_in_flight <> 0 THEN
    RAISE EXCEPTION
      'Applications in flight still carry % non-document row(s)', v_in_flight;
  END IF;
END
$$;
