-- Keep official signatures separate from the public document bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mtop-signatures', 'mtop-signatures', false, 2097152, ARRAY['image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "MTOP staff read official signatures" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'mtop-signatures' AND EXISTS (
    SELECT 1 FROM mtop.user_roles ur WHERE ur.user_id = auth.uid()
  ));

CREATE POLICY "MTOP admins upload official signatures" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'mtop-signatures' AND EXISTS (
      SELECT 1 FROM mtop.user_roles ur
      JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
      JOIN mtop.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = auth.uid() AND p.code = 'admin.manage'
    )
  );

-- The server writes a new immutable object per replacement; old objects remain
-- available for historically issued documents and audit investigation.
CREATE TABLE mtop.signatory_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid REFERENCES mtop.user_profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mtop.signatory_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read signatory audit" ON mtop.signatory_audit
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM mtop.user_roles ur JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
    JOIN mtop.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid() AND p.code = 'admin.manage'
  ));
GRANT SELECT ON mtop.signatory_audit TO authenticated;
CREATE FUNCTION mtop.audit_signatory_setting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = mtop, public AS $$
BEGIN
  IF NEW.key IN ('mayor_name', 'mayor_designation', 'mayor_signature_path',
                 'city_treasurer_name', 'city_treasurer_designation', 'city_treasurer_signature_path')
     AND (TG_OP = 'INSERT' OR OLD.value IS DISTINCT FROM NEW.value) THEN
    INSERT INTO mtop.signatory_audit(key, old_value, new_value, actor_id)
    VALUES (NEW.key, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.value END, NEW.value, auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_signatory_setting AFTER INSERT OR UPDATE ON mtop.system_settings
FOR EACH ROW EXECUTE FUNCTION mtop.audit_signatory_setting();
