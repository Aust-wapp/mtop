"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSystemSettings } from "@/lib/actions/settings"
import type {
  NewFranchiseApplicationFormValues,
  RenewalApplicationFormValues,
} from "@/lib/schemas/mtop"
import type { MtopStatus } from "@/types/database"

const DOCUMENT_TYPES = [
  "application_form",
  "ctms_clearance",
  "lto_or",
  "voters_certificate",
  "barangay_certification",
  "barangay_endorsement",
  "ctc",
  "police_clearance",
  "drivers_license",
  "affidavit_no_franchise",
] as const

const ACTIVE_STATUSES: MtopStatus[] = [
  "for_verification",
  "for_inspection",
  "for_assessment",
  "for_approval",
  "returned",
]

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

type Supabase = Awaited<ReturnType<typeof getAuthUser>>["supabase"]

async function hasPermission(
  supabase: Supabase,
  userId: string,
  permission: string
) {
  const { data: userRoles } = await supabase
    .schema("mtop")
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)

  if (!userRoles || userRoles.length === 0) return false

  const { data: rolePermissions } = await supabase
    .schema("mtop")
    .from("role_permissions")
    .select("permission:permissions(code)")
    .in(
      "role_id",
      userRoles.map((role) => role.role_id)
    )

  return (rolePermissions ?? []).some(
    (entry) =>
      (entry.permission as unknown as { code: string } | null)?.code ===
      permission
  )
}

function permissionForTransition(
  current: MtopStatus,
  next: MtopStatus
) {
  if (current === "for_verification" && next === "for_inspection")
    return "application.verify"
  if (current === "for_verification" && next === "returned")
    return "application.verify"
  if (current === "for_inspection" && next === "for_assessment")
    return "inspection.conduct"
  if (current === "for_inspection" && next === "returned")
    return "inspection.conduct"
  if (current === "for_assessment" && next === "for_approval")
    return "payment.record"
  if (current === "for_assessment" && next === "returned")
    return "assessment.create"
  if (current === "for_approval" && next === "granted")
    return "application.grant"
  if (current === "for_approval" && next === "rejected")
    return "application.approve"
  if (current === "for_approval" && next === "returned")
    return "application.approve"
  if (current === "returned" && next === "for_verification")
    return "application.verify"
  return null
}

async function seedApplicationChildren(
  supabase: Supabase,
  applicationId: string,
  actorId: string
) {
  const documentRecords = DOCUMENT_TYPES.map((docType) => ({
    application_id: applicationId,
    document_type: docType,
  }))

  const { error: docError } = await supabase
    .schema("mtop")
    .from("mtop_documents")
    .insert(documentRecords)

  if (docError) return docError.message

  const { error: logError } = await supabase
    .schema("mtop")
    .from("approval_logs")
    .insert({
      application_id: applicationId,
      stage: "for_verification" as MtopStatus,
      action: "forwarded",
      actor_id: actorId,
      remarks: "Application submitted",
    })

  return logError?.message ?? null
}

export async function createNewFranchiseApplication(
  input: NewFranchiseApplicationFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()

    // Same motor + chassis = same vehicle = same franchise. Block duplicates.
    const { data: existing, error: existingError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("id, mtop_number")
      .eq("motor_number", input.motor_number)
      .eq("chassis_number", input.chassis_number)
      .maybeSingle()

    if (existingError) return { error: existingError.message, data: null }
    if (existing) {
      return {
        error: `A franchise already exists for this motor + chassis${
          existing.mtop_number ? ` (${existing.mtop_number})` : ""
        }. Use the renewal flow instead.`,
        data: null,
      }
    }

    const { data: franchise, error: franchiseError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .insert({
        applicant_name: input.applicant_name,
        applicant_address: input.applicant_address,
        contact_number: input.contact_number,
        tricycle_body_number: input.tricycle_body_number,
        plate_number: input.plate_number,
        motor_number: input.motor_number,
        chassis_number: input.chassis_number,
        route: input.route,
        make: input.make?.trim() || null,
        day_off: input.day_off?.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (franchiseError) return { error: franchiseError.message, data: null }

    const { data: application, error: appError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .insert({
        franchise_id: franchise.id,
        due_date: input.due_date || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (appError) return { error: appError.message, data: null }

    const childError = await seedApplicationChildren(
      supabase,
      application.id,
      user.id
    )
    if (childError) return { error: childError, data: null }

    revalidatePath("/dashboard/applications")
    return { error: null, data: application }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function createRenewalApplication(
  input: RenewalApplicationFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()
    const { data: settings } = await getSystemSettings()

    const { data: franchise, error: franchiseError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("id, mtop_number, granted_until")
      .eq("id", input.franchise_id)
      .single()

    if (franchiseError) return { error: franchiseError.message, data: null }
    if (!franchise.granted_until || !franchise.mtop_number) {
      return {
        error:
          "This franchise has not been granted yet — it cannot be renewed until its first application is granted.",
        data: null,
      }
    }

    // Renewal opens once today is within renewal_window_days of expiry.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(franchise.granted_until)
    const earliestRenewal = new Date(expiry)
    earliestRenewal.setDate(
      earliestRenewal.getDate() - settings.renewal_window_days
    )

    if (today < earliestRenewal) {
      return {
        error: `Too early to renew. Renewal opens on ${earliestRenewal
          .toISOString()
          .slice(0, 10)} (within ${settings.renewal_window_days} days of expiry).`,
        data: null,
      }
    }

    const { data: inflight, error: inflightError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("id, status")
      .eq("franchise_id", franchise.id)
      .in("status", ACTIVE_STATUSES)
      .limit(1)

    if (inflightError) return { error: inflightError.message, data: null }
    if (inflight && inflight.length > 0) {
      return {
        error:
          "This franchise already has an in-flight application. Complete or reject it before filing a renewal.",
        data: null,
      }
    }

    const franchiseUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (input.applicant_address !== undefined)
      franchiseUpdates.applicant_address = input.applicant_address
    if (input.contact_number !== undefined)
      franchiseUpdates.contact_number = input.contact_number
    if (input.plate_number !== undefined)
      franchiseUpdates.plate_number = input.plate_number
    if (input.tricycle_body_number !== undefined)
      franchiseUpdates.tricycle_body_number = input.tricycle_body_number
    if (input.route !== undefined) franchiseUpdates.route = input.route

    const { error: updateError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .update(franchiseUpdates)
      .eq("id", franchise.id)

    if (updateError) return { error: updateError.message, data: null }

    const { data: application, error: appError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .insert({
        franchise_id: franchise.id,
        due_date: input.due_date || null,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (appError) return { error: appError.message, data: null }

    const childError = await seedApplicationChildren(
      supabase,
      application.id,
      user.id
    )
    if (childError) return { error: childError, data: null }

    revalidatePath("/dashboard/applications")
    return { error: null, data: application }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function searchFranchises(query: string, limit = 10) {
  try {
    const { supabase } = await getAuthUser()
    const trimmed = query.trim()
    if (!trimmed) return { error: null, data: [] }

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select(
        "*, applications:mtop_applications(id, status, fiscal_year, granted_at)"
      )
      .or(
        `mtop_number.ilike.%${trimmed}%,applicant_name.ilike.%${trimmed}%`
      )
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message, data: null }

    const results = (data ?? []).map(
      (f: {
        applications?: { status: MtopStatus }[]
      } & Record<string, unknown>) => {
        const apps = f.applications ?? []
        const hasActive = apps.some((a) => ACTIVE_STATUSES.includes(a.status))
        const { applications: _drop, ...franchise } = f
        void _drop
        return {
          ...franchise,
          has_active_application: hasActive,
        }
      }
    )

    return { error: null, data: results }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export interface ApplicationFilters {
  status?: MtopStatus
  search?: string
  page?: number
  pageSize?: number
}

export async function getApplications(filters: ApplicationFilters = {}) {
  try {
    const { supabase } = await getAuthUser()
    const { status, search, page = 1, pageSize = 20 } = filters

    let query = supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("*, franchise:mtop_franchises(*)", { count: "exact" })
      .order("created_at", { ascending: false })

    if (status) {
      query = query.eq("status", status)
    }

    if (search) {
      const trimmed = search.trim()
      const { data: matches } = await supabase
        .schema("mtop")
        .from("mtop_franchises")
        .select("id")
        .or(`mtop_number.ilike.%${trimmed}%,applicant_name.ilike.%${trimmed}%`)

      const ids = (matches ?? []).map((m: { id: string }) => m.id)
      if (ids.length === 0) {
        return { error: null, data: [], count: 0 }
      }
      query = query.in("franchise_id", ids)
    }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) return { error: error.message, data: null, count: 0 }
    return { error: null, data, count: count ?? 0 }
  } catch (e) {
    return { error: (e as Error).message, data: null, count: 0 }
  }
}

export async function getApplication(id: string) {
  try {
    const { supabase } = await getAuthUser()

    const [appResult, docsResult, inspResult, assessResult, payResult, logsResult] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select(
            "*, franchise:mtop_franchises(*), creator:user_profiles!created_by(id, full_name, email)"
          )
          .eq("id", id)
          .single(),
        supabase
          .schema("mtop")
          .from("mtop_documents")
          .select("*")
          .eq("application_id", id)
          .order("document_type"),
        supabase
          .schema("mtop")
          .from("mtop_inspections")
          .select("*, inspector:user_profiles!inspector_id(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("mtop_assessments")
          .select("*, assessor:user_profiles!assessed_by(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("*, receiver:user_profiles!received_by(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .schema("mtop")
          .from("approval_logs")
          .select("*, actor:user_profiles!actor_id(id, full_name)")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
      ])

    if (appResult.error) return { error: appResult.error.message, data: null }

    return {
      error: null,
      data: {
        ...appResult.data,
        documents: docsResult.data ?? [],
        inspection: inspResult.data ?? null,
        assessment: assessResult.data ?? null,
        payments: payResult.data ?? [],
        approval_logs: logsResult.data ?? [],
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function updateApplicationStatus(
  id: string,
  status: MtopStatus,
  action:
    | "approved"
    | "rejected"
    | "returned"
    | "forwarded"
    | "reopened"
    | "resubmitted",
  remarks?: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { data: current, error: currentError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("status")
      .eq("id", id)
      .single()

    if (currentError || !current) {
      return { error: currentError?.message ?? "Application not found." }
    }

    if (action === "returned" && !remarks?.trim()) {
      return { error: "A return reason is required." }
    }

    const requiredPermission = permissionForTransition(current.status, status)
    if (!requiredPermission) {
      return {
        error: `Invalid application status transition: ${current.status} → ${status}`,
      }
    }

    if (!(await hasPermission(supabase, user.id, requiredPermission))) {
      return { error: "You do not have permission for this workflow action." }
    }

    if (action === "reopened" && (current.status !== "returned" || status !== "for_verification")) {
      return { error: "Returned applications can only be reopened for verification." }
    }

    if (action === "resubmitted" && (current.status !== "for_verification" || status !== "for_inspection")) {
      return { error: "Resubmission must move the application to inspection." }
    }

    const returnedFrom =
      action === "returned" &&
      (current.status === "for_verification" || current.status === "for_inspection")
        ? current.status
        : null

    const updateData: Record<string, unknown> = {
      status,
      ...(returnedFrom ? { returned_from: returnedFrom } : {}),
    }
    let grantedAt: Date | null = null
    if (status === "granted") {
      grantedAt = new Date()
      updateData.granted_at = grantedAt.toISOString()
    }

    const { data: updated, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .update(updateData)
      .eq("id", id)
      .select("franchise_id")
      .single()

    if (error) return { error: error.message }

    if (status === "granted" && grantedAt && updated?.franchise_id) {
      const { data: settings } = await getSystemSettings()
      const { error: rpcError } = await supabase
        .schema("mtop")
        .rpc("grant_franchise", {
          p_franchise_id: updated.franchise_id,
          p_granted_at: grantedAt.toISOString(),
          p_validity_years: settings.permit_validity_years,
        })
      if (rpcError) return { error: rpcError.message }
    }

    const { error: logError } = await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: id,
        stage: status,
        action,
        actor_id: user.id,
        remarks: remarks || null,
        returned_from: returnedFrom,
      })

    if (logError) return { error: logError.message }

    revalidatePath("/dashboard/applications")
    revalidatePath(`/dashboard/applications/${id}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function returnApplication(applicationId: string, reason: string) {
  return updateApplicationStatus(
    applicationId,
    "returned",
    "returned",
    reason
  )
}

export async function reopenReturnedApplication(applicationId: string) {
  return updateApplicationStatus(
    applicationId,
    "for_verification",
    "reopened",
    "Returned application reopened for verification"
  )
}

export async function resubmitApplicationForInspection(applicationId: string) {
  try {
    const { supabase } = await getAuthUser()

    const { data: documents, error: documentsError } = await supabase
      .schema("mtop")
      .from("mtop_documents")
      .select("is_verified")
      .eq("application_id", applicationId)

    if (documentsError) return { error: documentsError.message }

    const verifiedCount = (documents ?? []).filter(
      (document) => document.is_verified
    ).length
    if (verifiedCount !== (documents ?? []).length) {
      return {
        error: "All documents must be verified before forwarding to inspection.",
      }
    }

    const { data: application, error: applicationError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("status, franchise:mtop_franchises(applicant_name)")
      .eq("id", applicationId)
      .single()

    if (applicationError || !application) {
      return { error: applicationError?.message ?? "Application not found." }
    }

    const applicantName = (
      application.franchise as unknown as { applicant_name: string } | null
    )?.applicant_name
    if (!applicantName) return { error: "Applicant information is missing." }

    const { data: negativeMatches, error: negativeError } = await supabase
      .schema("mtop")
      .from("mtop_negative_list")
      .select("id")
      .eq("is_active", true)
      .ilike("applicant_name", `%${applicantName}%`)

    if (negativeError) return { error: negativeError.message }
    if ((negativeMatches ?? []).length > 0) {
      return { error: "Cannot forward — applicant is on the negative list." }
    }

    return updateApplicationStatus(
      applicationId,
      "for_inspection",
      "resubmitted",
      "Verification completed after correction"
    )
  } catch (e) {
    return { error: (e as Error).message }
  }
}
