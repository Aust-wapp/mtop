-- Capture the officials at the moment an application becomes a granted permit.
-- Legacy grants remain absent: current settings cannot establish who signed them.
CREATE TABLE mtop.franchise_card_signatories (
  application_id uuid PRIMARY KEY REFERENCES mtop.mtop_applications(id),
  mayor_name text NOT NULL,
  mayor_designation text NOT NULL,
  mayor_signature_path text,
  treasurer_name text NOT NULL,
  treasurer_designation text NOT NULL,
  treasurer_signature_path text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mtop.franchise_card_signatories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permit viewers read card signatories"
  ON mtop.franchise_card_signatories FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM mtop.user_roles ur
    JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
    JOIN mtop.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid() AND p.code = 'application.view'
  ));
GRANT SELECT ON mtop.franchise_card_signatories TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON mtop.franchise_card_signatories FROM authenticated, service_role;

-- Only orphaned uploads may be cleaned up; referenced historical images stay.
CREATE POLICY "MTOP admins clean orphaned signatures" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'mtop-signatures'
    AND NOT EXISTS (
      SELECT 1 FROM mtop.franchise_card_signatories s
      WHERE s.mayor_signature_path = name OR s.treasurer_signature_path = name
    )
    AND NOT EXISTS (
      SELECT 1 FROM mtop.system_settings s
      WHERE s.key IN ('mayor_signature_path', 'city_treasurer_signature_path')
        AND s.value #>> '{}' = name
    )
    AND EXISTS (
      SELECT 1 FROM mtop.user_roles ur
      JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
      JOIN mtop.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = auth.uid() AND p.code = 'admin.manage'
    )
  );

CREATE FUNCTION mtop.capture_franchise_card_signatories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = mtop, public AS $$
BEGIN
  INSERT INTO mtop.franchise_card_signatories (
    application_id, mayor_name, mayor_designation, mayor_signature_path,
    treasurer_name, treasurer_designation, treasurer_signature_path
  ) VALUES (
    NEW.id,
    coalesce((SELECT value #>> '{}' FROM mtop.system_settings WHERE key = 'mayor_name'), ''),
    coalesce((SELECT value #>> '{}' FROM mtop.system_settings WHERE key = 'mayor_designation'), 'City Mayor'),
    nullif((SELECT value #>> '{}' FROM mtop.system_settings WHERE key = 'mayor_signature_path'), ''),
    coalesce((SELECT value #>> '{}' FROM mtop.system_settings WHERE key = 'city_treasurer_name'), ''),
    coalesce((SELECT value #>> '{}' FROM mtop.system_settings WHERE key = 'city_treasurer_designation'), 'City Treasurer'),
    nullif((SELECT value #>> '{}' FROM mtop.system_settings WHERE key = 'city_treasurer_signature_path'), '')
  );
  RETURN NULL;
END $$;

CREATE TRIGGER capture_franchise_card_signatories
AFTER UPDATE OF status ON mtop.mtop_applications
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'granted')
EXECUTE FUNCTION mtop.capture_franchise_card_signatories();
