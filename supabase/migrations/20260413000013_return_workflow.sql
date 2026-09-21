-- Return workflow support.
-- Returned applications are recoverable and must re-enter verification.

ALTER TABLE mtop.mtop_applications
  ADD COLUMN IF NOT EXISTS returned_from mtop.mtop_status;

ALTER TABLE mtop.approval_logs
  ADD COLUMN IF NOT EXISTS returned_from mtop.mtop_status;

ALTER TABLE mtop.approval_logs
  DROP CONSTRAINT IF EXISTS approval_logs_action_check;

ALTER TABLE mtop.approval_logs
  ADD CONSTRAINT approval_logs_action_check
  CHECK (
    action IN ('approved', 'rejected', 'returned', 'forwarded', 'reopened', 'resubmitted')
  );

ALTER TABLE mtop.mtop_applications
  DROP CONSTRAINT IF EXISTS mtop_applications_returned_from_check;

ALTER TABLE mtop.mtop_applications
  ADD CONSTRAINT mtop_applications_returned_from_check
  CHECK (
    returned_from IS NULL
    OR returned_from IN ('for_verification', 'for_inspection')
  );

ALTER TABLE mtop.approval_logs
  DROP CONSTRAINT IF EXISTS approval_logs_returned_from_check;

ALTER TABLE mtop.approval_logs
  ADD CONSTRAINT approval_logs_returned_from_check
  CHECK (
    action = 'returned'
    OR returned_from IS NULL
  );

-- Permission lookup used by the status-transition guard. It snapshots no
-- application data and only answers whether the authenticated user currently
-- has a named MTOP permission.
CREATE OR REPLACE FUNCTION mtop.has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = mtop, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM mtop.user_roles ur
    JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
    JOIN mtop.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
      AND p.code = p_permission
  );
$$;

REVOKE ALL ON FUNCTION mtop.has_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mtop.has_permission(TEXT) TO authenticated, service_role;

-- Enforce the workflow even when an authenticated caller bypasses the UI and
-- writes mtop_applications directly through PostgREST.
CREATE OR REPLACE FUNCTION mtop.validate_application_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  required_permission TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    IF NEW.status <> 'returned' AND NEW.returned_from IS NOT NULL THEN
      RAISE EXCEPTION 'returned_from is only valid while an application is returned';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'for_verification' AND NEW.status = 'for_inspection' THEN
    required_permission := 'application.verify';
  ELSIF OLD.status = 'for_verification' AND NEW.status = 'returned' THEN
    required_permission := 'application.verify';
    IF NEW.returned_from IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Verification returns must record returned_from=for_verification';
    END IF;
  ELSIF OLD.status = 'for_inspection' AND NEW.status = 'for_assessment' THEN
    required_permission := 'inspection.conduct';
  ELSIF OLD.status = 'for_inspection' AND NEW.status = 'returned' THEN
    required_permission := 'inspection.conduct';
    IF NEW.returned_from IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Inspection returns must record returned_from=for_inspection';
    END IF;
  ELSIF OLD.status = 'for_assessment' AND NEW.status = 'for_approval' THEN
    required_permission := 'payment.record';
  ELSIF OLD.status = 'for_assessment' AND NEW.status = 'returned' THEN
    -- Existing assessment return behavior remains available, but it does not
    -- participate in the new verification/inspection return provenance.
    required_permission := 'assessment.create';
    IF NEW.returned_from IS NOT NULL THEN
      RAISE EXCEPTION 'Assessment returns cannot use verification/inspection returned_from';
    END IF;
  ELSIF OLD.status = 'for_approval' AND NEW.status = 'granted' THEN
    required_permission := 'application.grant';
  ELSIF OLD.status = 'for_approval' AND NEW.status = 'rejected' THEN
    required_permission := 'application.approve';
  ELSIF OLD.status = 'for_approval' AND NEW.status = 'returned' THEN
    -- Existing approval return behavior remains available, but it does not
    -- participate in the new verification/inspection return provenance.
    required_permission := 'application.approve';
    IF NEW.returned_from IS NOT NULL THEN
      RAISE EXCEPTION 'Approval returns cannot use verification/inspection returned_from';
    END IF;
  ELSIF OLD.status = 'returned' AND NEW.status = 'for_verification' THEN
    required_permission := 'application.verify';
    NEW.returned_from := NULL;
  ELSE
    RAISE EXCEPTION 'Invalid application status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NOT mtop.has_permission(required_permission) THEN
    RAISE EXCEPTION 'Permission denied for application transition requiring %', required_permission;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_application_status_transition
  ON mtop.mtop_applications;

CREATE TRIGGER validate_application_status_transition
BEFORE UPDATE OF status ON mtop.mtop_applications
FOR EACH ROW
EXECUTE FUNCTION mtop.validate_application_status_transition();

GRANT EXECUTE ON FUNCTION mtop.validate_application_status_transition()
  TO authenticated, service_role;
