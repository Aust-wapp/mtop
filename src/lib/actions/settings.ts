"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { systemSettingsSchema, type SystemSettingsFormValues } from "@/lib/schemas/mtop"
import { hasPermission } from "@/lib/permissions"
import { DEFAULT_ABANDONMENT_GRACE_DAYS } from "@/lib/utils/permit-expiration"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export interface SystemSettings {
  permit_validity_years: number
  renewal_window_days: number
  abandonment_grace_days: number
  ctms_contact_number: string
  /** Signatory on the confirmation slip. Seeded by 20260413000025. */
  mayor_name: string
  /** Signatory on the City Treasurer's Office certifications. */
  city_treasurer_name: string
}

const DEFAULTS: SystemSettings = {
  permit_validity_years: 3,
  renewal_window_days: 90,
  abandonment_grace_days: DEFAULT_ABANDONMENT_GRACE_DAYS,
  ctms_contact_number: "",
  mayor_name: "",
  city_treasurer_name: "CITY TREASURER",
}

export async function getSystemSettings(): Promise<{
  error: string | null
  data: SystemSettings
}> {
  try {
    const { supabase } = await getAuthUser()

    const { error: sweepError } = await supabase
      .schema("mtop")
      .rpc("abandon_due_franchises")
    if (sweepError) return { error: sweepError.message, data: DEFAULTS }

    const { data, error } = await supabase
      .schema("mtop")
      .from("system_settings")
      .select("key, value")
      .in("key", [
        "permit_validity_years",
        "renewal_window_days",
        "abandonment_grace_days",
        "ctms_contact_number",
        "mayor_name",
        "city_treasurer_name",
      ])

    if (error) return { error: error.message, data: DEFAULTS }

    const settings = { ...DEFAULTS }
    for (const row of data ?? []) {
      if (row.key === "permit_validity_years") {
        settings.permit_validity_years = Number(row.value) || DEFAULTS.permit_validity_years
      }
      if (row.key === "renewal_window_days") {
        settings.renewal_window_days = Number(row.value) || DEFAULTS.renewal_window_days
      }
      if (row.key === "abandonment_grace_days") {
        const value = Number(row.value)
        settings.abandonment_grace_days = Number.isSafeInteger(value) && value >= 0
          ? value
          : DEFAULTS.abandonment_grace_days
      }
      if (row.key === "ctms_contact_number") {
        settings.ctms_contact_number =
          typeof row.value === "string" ? row.value : DEFAULTS.ctms_contact_number
      }
      if (row.key === "mayor_name") {
        settings.mayor_name =
          typeof row.value === "string" ? row.value : DEFAULTS.mayor_name
      }
      if (row.key === "city_treasurer_name") {
        settings.city_treasurer_name =
          typeof row.value === "string"
            ? row.value
            : DEFAULTS.city_treasurer_name
      }
    }

    return { error: null, data: settings }
  } catch (e) {
    return { error: (e as Error).message, data: DEFAULTS }
  }
}

export async function updateSystemSettings(input: SystemSettingsFormValues) {
  try {
    const { supabase, user } = await getAuthUser()
    if (!(await hasPermission(supabase, user.id, "admin.manage"))) {
      return { error: "You do not have permission to update system settings." }
    }

    const validation = systemSettingsSchema.safeParse(input)
    if (!validation.success) {
      return {
        error: validation.error.issues[0]?.message ?? "Invalid settings input.",
      }
    }
    const settings = validation.data

    const updates = [
      {
        key: "permit_validity_years",
        value: settings.permit_validity_years,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        key: "renewal_window_days",
        value: settings.renewal_window_days,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        key: "abandonment_grace_days",
        value: settings.abandonment_grace_days,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        key: "ctms_contact_number",
        value: settings.ctms_contact_number?.trim() ?? "",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        key: "mayor_name",
        value: settings.mayor_name?.trim() ?? "",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      {
        key: "city_treasurer_name",
        value: settings.city_treasurer_name?.trim() ?? "",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
    ]

    for (const row of updates) {
      const { error } = await supabase
        .schema("mtop")
        .from("system_settings")
        .upsert(row, { onConflict: "key" })

      if (error) return { error: error.message }
    }

    const { error: sweepError } = await supabase
      .schema("mtop")
      .rpc("abandon_due_franchises")
    if (sweepError) return { error: sweepError.message }

    revalidatePath("/dashboard")
    revalidatePath("/dashboard/applications")
    revalidatePath("/dashboard/operators")
    revalidatePath("/dashboard/admin/settings")

    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
