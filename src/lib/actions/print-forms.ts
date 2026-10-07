"use server"

import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"

export async function canViewPrintForms(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return Boolean(user && await hasPermission(supabase, user.id, "application.view"))
}
