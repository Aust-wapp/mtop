"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { InspectionFormValues } from "@/lib/schemas/mtop"
import { INSPECTION_FIELDS, INSPECTION_LABELS } from "@/lib/inspection"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

async function assertInspectionAccess(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  userId: string,
  applicationId: string
) {
  const { data: roles } = await supabase
    .schema("mtop")
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)

  const roleIds = (roles ?? []).map((role) => role.role_id)
  if (roleIds.length === 0) return "You do not have permission to conduct inspections."

  const { data: permissions } = await supabase
    .schema("mtop")
    .from("role_permissions")
    .select("permission:permissions(code)")
    .in("role_id", roleIds)

  const canInspect = (permissions ?? []).some(
    (entry) =>
      (entry.permission as unknown as { code: string } | null)?.code ===
      "inspection.conduct"
  )
  if (!canInspect) return "You do not have permission to conduct inspections."

  const { data: application, error } = await supabase
    .schema("mtop")
    .from("mtop_applications")
    .select("status")
    .eq("id", applicationId)
    .single()

  if (error || !application) return "Application not found."
  if (application.status !== "for_inspection") {
    return "Inspections can only be submitted during inspection."
  }
  return null
}

export async function createInspection(
  applicationId: string,
  checklist: InspectionFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertInspectionAccess(
      supabase,
      user.id,
      applicationId
    )
    if (denied) return { error: denied, data: null }

    // Compute result: all true = passed, any false = failed
    const allPassed = INSPECTION_FIELDS.every(
      (field) => checklist[field] === true
    )
    const result = allPassed ? "passed" : "failed"

    // Build failed items list for remarks if failed
    let autoRemarks = checklist.remarks || ""
    if (!allPassed) {
      const failedItems = INSPECTION_FIELDS.filter(
        (field) => !checklist[field]
      ).map((field) => INSPECTION_LABELS[field])

      autoRemarks = `Failed items: ${failedItems.join(", ")}${checklist.remarks ? `. ${checklist.remarks}` : ""}`
    }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_inspections")
      .insert({
        application_id: applicationId,
        inspector_id: user.id,
        clean_windshields: checklist.clean_windshields,
        garbage_receptacle: checklist.garbage_receptacle,
        functioning_horn: checklist.functioning_horn,
        signal_lights: checklist.signal_lights,
        tail_light: checklist.tail_light,
        top_chain: checklist.top_chain,
        headlights_taillights: checklist.headlights_taillights,
        sidecar_light: checklist.sidecar_light,
        anti_noise_equipment: checklist.anti_noise_equipment,
        body_number_sticker: checklist.body_number_sticker,
        functional_mufflers: checklist.functional_mufflers,
        road_worthiness: checklist.road_worthiness,
        result,
        remarks: autoRemarks || null,
      })

    if (error) return { error: error.message, data: null }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null, data: { result } }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getInspection(applicationId: string) {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_inspections")
      .select("*, inspector:user_profiles!inspector_id(id, full_name)")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { error: error.message, data: null }
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}
