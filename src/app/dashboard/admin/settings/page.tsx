import { PageHeader } from "@/components/layout/page-header"
import { getSystemSettings } from "@/lib/actions/settings"
import { SettingsContent } from "./settings-content"
import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"

export default async function AdminSettingsPage() {
  const { data: settings } = await getSystemSettings()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const canManage = Boolean(user && await hasPermission(supabase, user.id, "admin.manage"))
  async function preview(path: string) {
    if (!canManage || !path) return null
    const { data } = await supabase.storage.from("mtop-signatures").createSignedUrl(path, 300)
    return data?.signedUrl ?? null
  }
  const [mayorPreviewUrl, treasurerPreviewUrl] = await Promise.all([
    preview(settings.mayor_signature_path),
    preview(settings.city_treasurer_signature_path),
  ])
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings"
        subtitle="Configure permit validity, renewal monitoring, and office contact details"
      />

      <SettingsContent settings={settings} mayorPreviewUrl={mayorPreviewUrl} treasurerPreviewUrl={treasurerPreviewUrl} />
    </div>
  )
}
