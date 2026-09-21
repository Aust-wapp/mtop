"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

async function assertVerificationAccess(
  supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"],
  userId: string,
  applicationId: string,
  documentId: string
) {
  const { data: roles } = await supabase
    .schema("mtop")
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)

  const roleIds = (roles ?? []).map((role) => role.role_id)
  if (roleIds.length === 0) return "You do not have permission to verify documents."

  const { data: permissions } = await supabase
    .schema("mtop")
    .from("role_permissions")
    .select("permission:permissions(code)")
    .in("role_id", roleIds)

  const canVerify = (permissions ?? []).some(
    (entry) =>
      (entry.permission as unknown as { code: string } | null)?.code ===
      "application.verify"
  )
  if (!canVerify) return "You do not have permission to verify documents."

  const { data: application, error: applicationError } = await supabase
    .schema("mtop")
    .from("mtop_applications")
    .select("status")
    .eq("id", applicationId)
    .single()

  if (applicationError || !application) return "Application not found."
  if (application.status !== "for_verification") {
    return "Documents can only be corrected during verification."
  }

  const { data: document, error: documentError } = await supabase
    .schema("mtop")
    .from("mtop_documents")
    .select("id")
    .eq("id", documentId)
    .eq("application_id", applicationId)
    .maybeSingle()

  if (documentError || !document) return "Document not found for this application."
  return null
}

export async function verifyDocument(
  documentId: string,
  applicationId: string,
  verified: boolean
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertVerificationAccess(
      supabase,
      user.id,
      applicationId,
      documentId
    )
    if (denied) return { error: denied }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .update({
        is_verified: verified,
        verified_by: verified ? user.id : null,
        verified_at: verified ? new Date().toISOString() : null,
      })
      .eq("id", documentId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateDocumentRemarks(
  documentId: string,
  applicationId: string,
  remarks: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertVerificationAccess(
      supabase,
      user.id,
      applicationId,
      documentId
    )
    if (denied) return { error: denied }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .update({ remarks: remarks || null })
      .eq("id", documentId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateDocumentFileUrl(
  documentId: string,
  applicationId: string,
  fileUrl: string | null
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertVerificationAccess(
      supabase,
      user.id,
      applicationId,
      documentId
    )
    if (denied) return { error: denied }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .update({ file_url: fileUrl })
      .eq("id", documentId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function checkNegativeList(applicantName: string) {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .select("id, applicant_name, reason")
      .eq("is_active", true)
      .ilike("applicant_name", `%${applicantName}%`)

    if (error) return { error: error.message, data: null }
    return { error: null, data: data ?? [] }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}
