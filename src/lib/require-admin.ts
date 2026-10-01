import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"

/**
 * Whether the signed-in user holds `admin.manage`, for Server Component pages.
 *
 * The sidebar already hides admin links from everyone else, but that only
 * decides what to render — a URL typed or bookmarked still reaches the page, so
 * the page asks again on the server.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  return hasPermission(supabase, user.id, "admin.manage")
}
