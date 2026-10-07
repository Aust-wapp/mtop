"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"
import type { FranchiseStatus, MtopStatus } from "@/types/database"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type OperatorDirectoryStatus = "all" | "active" | "inactive"

export interface OperatorDirectoryRecord {
  id: string
  mtop_number: string
  applicant_name: string
  franchise_status: FranchiseStatus
  plate_number: string | null
  contact_number: string | null
  date_granted: string | null
  latest_transaction: {
    name: string
    status: MtopStatus
    submitted_at: string
  } | null
}

const OPERATOR_PAGE_SIZE = 20

function embeddedOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function operatorSearchFilter(term: string): string {
  const escaped = term.replace(/[\\%_"]/g, (character) => `\\${character}`)
  return ["mtop_number", "applicant_name", "plate_number"]
    .map((field) => `${field}.ilike."%${escaped}%"`)
    .join(",")
}

/**
 * Lists numbered MTOP records and batches their application metadata for the
 * current page. An assigned MTOP number is written by the grant function, so
 * drafts and applications that were never granted cannot enter this directory.
 */
export async function getOperators({
  search = "",
  status = "all",
  page = 1,
}: {
  search?: string
  status?: OperatorDirectoryStatus
  page?: number
} = {}): Promise<{
  error: string | null
  data: OperatorDirectoryRecord[]
  count: number
}> {
  try {
    const { supabase } = await getAuthUser()
    const currentPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
    const from = (currentPage - 1) * OPERATOR_PAGE_SIZE

    let query = supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select(
        "id, mtop_number, applicant_name, franchise_status, plate_number, contact_number",
        { count: "exact" }
      )
      .not("mtop_number", "is", null)
      .order("mtop_number", { ascending: false })
      .range(from, from + OPERATOR_PAGE_SIZE - 1)

    if (status === "active") {
      query = query.eq("franchise_status", "active")
    } else if (status === "inactive") {
      query = query.neq("franchise_status", "active")
    }

    if (search.trim()) {
      query = query.or(operatorSearchFilter(search.trim()))
    }

    const { data: franchises, count, error } = await query
    if (error) return { error: error.message, data: [], count: 0 }

    const records = (franchises ?? []) as Pick<
      OperatorDirectoryRecord,
      | "id"
      | "mtop_number"
      | "applicant_name"
      | "franchise_status"
      | "plate_number"
      | "contact_number"
    >[]
    if (records.length === 0) {
      return { error: null, data: [], count: count ?? 0 }
    }

    const { data: applications, error: applicationsError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        "franchise_id, status, submitted_at, granted_at, transaction_type:transaction_types(code, name, grant_effect)"
      )
      .in(
        "franchise_id",
        records.map((record) => record.id)
      )
      .order("submitted_at", { ascending: false })

    if (applicationsError) {
      return { error: applicationsError.message, data: [], count: 0 }
    }

    type ApplicationMetadata = {
      franchise_id: string
      status: MtopStatus
      submitted_at: string
      granted_at: string | null
      transaction_type:
        | { code: string; name: string; grant_effect: string }
        | { code: string; name: string; grant_effect: string }[]
        | null
    }

    const applicationsByFranchise = new Map<string, ApplicationMetadata[]>()
    for (const application of (applications ?? []) as unknown as ApplicationMetadata[]) {
      const group = applicationsByFranchise.get(application.franchise_id) ?? []
      group.push(application)
      applicationsByFranchise.set(application.franchise_id, group)
    }

    const data = records.map((record): OperatorDirectoryRecord => {
      const related = applicationsByFranchise.get(record.id) ?? []
      const latest = related[0]
      const initialGrant = related
        .filter((application) => {
          const transaction = embeddedOne(application.transaction_type)
          return (
            application.status === "granted" &&
            transaction?.grant_effect === "issue_number" &&
            application.granted_at
          )
        })
        .sort((left, right) =>
          (left.granted_at ?? "").localeCompare(right.granted_at ?? "")
        )[0]
      const latestType = latest ? embeddedOne(latest.transaction_type) : null

      return {
        ...record,
        date_granted: initialGrant?.granted_at ?? null,
        latest_transaction:
          latest && latestType
            ? {
                name: latestType.name,
                status: latest.status,
                submitted_at: latest.submitted_at,
              }
            : null,
      }
    })

    return { error: null, data, count: count ?? 0 }
  } catch (error) {
    return {
      error: (error as Error).message,
      data: [],
      count: 0,
    }
  }
}

/**
 * The franchise really does belong to this application, and the permit has not
 * been issued yet. Shared by every edit path below; the permission each one
 * needs is checked by its own wrapper.
 */
async function assertApplicationEditable(
  supabase: SupabaseServerClient,
  applicationId: string,
  franchiseId: string
) {
  const { data: application, error } = await supabase
    .schema("mtop")
    .from("mtop_applications")
    .select("id, status, franchise_id")
    .eq("id", applicationId)
    .single()

  if (error || !application) return "Application not found."
  if (application.franchise_id !== franchiseId) {
    return "This franchise does not belong to the application."
  }
  if (application.status === "granted") {
    return "This permit has already been granted and can no longer be edited."
  }

  return null
}

/**
 * The client-side gate is UX only — re-check here that the caller may edit the
 * franchise's photos/driver details and that the permit isn't already issued.
 */
async function assertCanEditFranchise(
  supabase: SupabaseServerClient,
  userId: string,
  applicationId: string,
  franchiseId: string
) {
  if (!(await hasPermission(supabase, userId, "application.verify"))) {
    return "You do not have permission to edit franchise photos."
  }

  return assertApplicationEditable(supabase, applicationId, franchiseId)
}

/**
 * The unit's identity — motor, chassis, plate and body numbers — is what a
 * change-of-unit transaction exists to alter, with the old values kept in
 * mtop.franchise_unit_history. Editing it in place is therefore an
 * administrator's correction of a mis-keyed record, not a normal operation,
 * and is refused to everyone else. The audit trigger on mtop_franchises logs
 * the before and after either way, so a correction is never silent.
 */
async function assertAdminCanEditUnit(
  supabase: SupabaseServerClient,
  userId: string,
  applicationId: string,
  franchiseId: string
) {
  if (!(await hasPermission(supabase, userId, "admin.manage"))) {
    return "Only an administrator can correct the tricycle details. A change of unit should be filed as its own transaction."
  }

  return assertApplicationEditable(supabase, applicationId, franchiseId)
}

export async function updateFranchisePhoto(
  franchiseId: string,
  applicationId: string,
  slot: "owner" | "driver",
  url: string | null
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertCanEditFranchise(
      supabase,
      user.id,
      applicationId,
      franchiseId
    )
    if (denied) return { error: denied }

    const column = slot === "owner" ? "owner_photo_url" : "driver_photo_url"

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .update({ [column]: url })
      .eq("id", franchiseId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function updateFranchiseDriverDetails(
  franchiseId: string,
  applicationId: string,
  details: {
    driver_name: string | null
    driver_license_number: string | null
    driver_address: string | null
    make: string | null
    day_off: string | null
  }
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertCanEditFranchise(
      supabase,
      user.id,
      applicationId,
      franchiseId
    )
    if (denied) return { error: denied }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .update({
        driver_name: details.driver_name?.trim() || null,
        driver_license_number: details.driver_license_number?.trim() || null,
        driver_address: details.driver_address?.trim() || null,
        make: details.make?.trim() || null,
        day_off: details.day_off?.trim() || null,
      })
      .eq("id", franchiseId)

    if (error) return { error: error.message }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * One franchise with everything the franchise record page shows: the
 * association it belongs to, who registered it, and every transaction ever
 * filed against it, newest first.
 *
 * The franchise — not the application — is the operator's permanent record,
 * so this is the query behind /dashboard/franchises/[id]. Its audit trail is
 * fetched separately by getFranchiseHistory() in @/lib/actions/audit.
 */
export async function getFranchise(id: string) {
  try {
    const { supabase } = await getAuthUser()

    const [franchiseResult, applicationsResult] = await Promise.all([
      supabase
        .schema("mtop")
        .from("mtop_franchises")
        .select(
          "*, association:associations(id, name), creator:user_profiles!created_by(id, full_name)"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .schema("mtop")
        .from("mtop_applications")
        .select(
          "*, transaction_type:transaction_types(id, code, name, grant_effect)"
        )
        .eq("franchise_id", id)
        .order("submitted_at", { ascending: false }),
    ])

    if (franchiseResult.error) {
      return { error: franchiseResult.error.message, data: null }
    }
    if (!franchiseResult.data) {
      return { error: "Franchise not found.", data: null }
    }
    if (applicationsResult.error) {
      return { error: applicationsResult.error.message, data: null }
    }

    return {
      error: null,
      data: {
        franchise: franchiseResult.data,
        applications: applicationsResult.data ?? [],
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

/**
 * Correct the unit's details on the franchise record.
 *
 * Administrator-only, and only until the permit is granted — the same line the
 * rest of the application detail view draws. Motor and chassis numbers are
 * NOT NULL on the table, so a blank one is refused here with something
 * readable rather than a constraint violation.
 */
export async function updateFranchiseUnitDetails(
  franchiseId: string,
  applicationId: string,
  details: {
    tricycle_body_number: string | null
    plate_number: string | null
    motor_number: string
    chassis_number: string
    route: string | null
    association_id: string | null
  }
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertAdminCanEditUnit(
      supabase,
      user.id,
      applicationId,
      franchiseId
    )
    if (denied) return { error: denied }

    const motor = details.motor_number?.trim()
    const chassis = details.chassis_number?.trim()
    if (!motor) return { error: "Motor number is required." }
    if (!chassis) return { error: "Chassis number is required." }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .update({
        tricycle_body_number: details.tricycle_body_number?.trim() || null,
        plate_number: details.plate_number?.trim() || null,
        motor_number: motor,
        chassis_number: chassis,
        route: details.route?.trim() || null,
        association_id: details.association_id || null,
      })
      .eq("id", franchiseId)

    if (error) {
      // Partial unique indexes guard the body, plate, motor and chassis
      // numbers across active franchises; say so rather than surfacing a raw
      // duplicate-key error.
      if (error.code === "23505") {
        return {
          error:
            "Another active franchise already uses one of these numbers. Check the body, plate, motor and chassis numbers.",
        }
      }
      return { error: error.message }
    }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    revalidatePath(`/dashboard/franchises/${franchiseId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
