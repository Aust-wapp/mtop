-- Retire historical signatory snapshots: permits and their confirmation slips
-- must display the Mayor/Treasurer currently configured in Admin Settings.
-- Migration 20261113000002 has already been applied in the MTOP sandbox,
-- so reverse it with a new migration rather than editing applied history.
--
-- Keep the private mtop-signatures bucket and signatory_audit intact.
-- The saved-current-signature deletion guard replaces the old guard that
-- referenced historical snapshot rows.

DROP TRIGGER IF EXISTS capture_franchise_card_signatories ON mtop.mtop_applications;
DROP FUNCTION IF EXISTS mtop.capture_franchise_card_signatories();

DROP POLICY IF EXISTS "MTOP admins clean orphaned signatures" ON storage.objects;
CREATE POLICY "MTOP admins clean orphaned signatures" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'mtop-signatures'
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

-- Snapshot rows are intentionally discarded. The current officials are read
-- from system_settings for every new card/confirmation slip generation.
-- This does not delete any storage objects or alter existing applications.
DROP TABLE IF EXISTS mtop.franchise_card_signatories;
