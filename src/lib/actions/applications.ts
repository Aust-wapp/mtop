"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSystemSettings } from "@/lib/actions/settings"
import type {
  NewFranchiseApplicationFormValues,
  FranchiseTransactionFormValues,
} from "@/lib/schemas/mtop"
import { requiresReason } from "@/lib/schemas/mtop"
import {
  normalizeOperatorName,
  findCoOwnerMarker,
  SINGLE_OPERATOR_MESSAGE,
  composeOperatorName,
  namePart,
} from "@/lib/operator-name"
import {
  normalizeUnitIdentifier,
  unitConflictMessage,
  type UnitIdentifierConflict,
  type UnitIdentifierField,
} from "@/lib/unit-identifier"
import { reopenTargetStage, remarksRequiredMessage } from "@/lib/application-flow"
import { composeAddress } from "@/lib/address"
import { hasPermission } from "@/lib/permissions"
import {
  EXPIRED_FRANCHISE_MESSAGE,
  isBlockedByExpiry,
} from "@/lib/utils/permit-expiration"
import type {
  MtopStatus,
  TransactionType,
  TransactionTypeCode,
} from "@/types/database"

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

/**
 * Filing is the verification officer's job, and the administrator's. Everyone
 * else — inspector, assessor, cashier, approver — works applications that
 * already exist.
 *
 * Checked here and not only on the button: a server action is callable
 * directly, so a UI-only gate is not a gate. The permission itself is seeded
 * to exactly those two roles (20260413000002, 20260413000008).
 */
const CREATE_DENIED =
  "You do not have permission to file applications. Only a verification officer or an administrator can."

async function assertCanCreate(supabase: Supabase, userId: string) {
  return (await hasPermission(supabase, userId, "application.create"))
    ? null
    : CREATE_DENIED
}

async function resolveTransactionType(
  supabase: Supabase,
  code: TransactionTypeCode
): Promise<{ error: string | null; data: TransactionType | null }> {
  const { data, error } = await supabase
    .schema("mtop")
    .from("transaction_types")
    .select("*")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle()

  if (error) return { error: error.message, data: null }
  if (!data) return { error: `Unknown transaction type "${code}".`, data: null }
  return { error: null, data: data as TransactionType }
}

/**
 * The active franchise already held by this operator, if any.
 *
 * One franchise per operator is enforced by a partial unique index in the
 * database (20260413000018); this lookup exists so the app can say *which*
 * franchise is in the way instead of surfacing a duplicate-key error.
 * `excludeFranchiseId` skips the franchise being acted on, so a transfer isn't
 * blocked by the record it is itself changing.
 */
async function findOperatorsActiveFranchise(
  supabase: Supabase,
  operatorName: string,
  excludeFranchiseId?: string
) {
  if (!normalizeOperatorName(operatorName)) return null

  const { data } = await supabase
    .schema("mtop")
    .rpc("find_operator_active_franchise", {
      p_name: operatorName,
      p_exclude_franchise_id: excludeFranchiseId ?? null,
    })

  const hit = (data ?? []) as {
    id: string
    mtop_number: string | null
    applicant_name: string
  }[]

  return hit[0] ?? null
}

/**
 * The active franchise already carrying this body or plate number, if any.
 *
 * Both numbers are unique across active franchises, enforced by two partial
 * unique indexes in the database (20260413000021); this lookup exists so the
 * app can say *which* franchise holds the number instead of surfacing a
 * duplicate-key error. `excludeFranchiseId` skips the franchise being edited,
 * so a transaction is never blocked by the record it is itself changing.
 *
 * Reports one row per clashing field, so a form can put each message under the
 * input it belongs to.
 */
/** The four numbers that may only appear on one active franchise at a time. */
type UnitNumbers = {
  bodyNumber?: string | null
  plateNumber?: string | null
  motorNumber?: string | null
  chassisNumber?: string | null
}

async function findUnitIdentifierConflicts(
  supabase: Supabase,
  numbers: UnitNumbers,
  excludeFranchiseId?: string
): Promise<UnitIdentifierConflict[]> {
  const body = numbers.bodyNumber ?? ""
  const plate = numbers.plateNumber ?? ""
  const motor = numbers.motorNumber ?? ""
  const chassis = numbers.chassisNumber ?? ""
  if (![body, plate, motor, chassis].some((v) => normalizeUnitIdentifier(v)))
    return []

  const { data } = await supabase
    .schema("mtop")
    .rpc("find_unit_identifier_conflict", {
      p_body_number: body || null,
      p_plate_number: plate || null,
      p_motor_number: motor || null,
      p_chassis_number: chassis || null,
      p_exclude_franchise_id: excludeFranchiseId ?? null,
    })

  return (data ?? []) as UnitIdentifierConflict[]
}

/**
 * The one conflict to report when a filing is refused, reported in the order
 * the clerk fills the fields in, so the message points at the first thing they
 * would look at rather than whichever query happened to match.
 */
/**
 * On a change of unit the number being tested is the incoming one, so
 * "Plate number" alone would read as the plate already on the franchise.
 * The body number is not staged — it stays with the franchise — so it keeps
 * its own label.
 */
const STAGED_FIELD_LABEL: Partial<Record<UnitIdentifierField, string>> = {
  plate_number: "New plate number",
  motor_number: "New motor number",
  chassis_number: "New chassis number",
}

const UNIT_FIELD_ORDER: UnitIdentifierField[] = [
  "tricycle_body_number",
  "plate_number",
  "motor_number",
  "chassis_number",
]

async function findUnitIdentifierConflict(
  supabase: Supabase,
  numbers: UnitNumbers,
  excludeFranchiseId?: string
): Promise<UnitIdentifierConflict | null> {
  const hits = await findUnitIdentifierConflicts(
    supabase,
    numbers,
    excludeFranchiseId
  )
  for (const field of UNIT_FIELD_ORDER) {
    const hit = hits.find((h) => h.field === field)
    if (hit) return hit
  }
  return hits[0] ?? null
}

/**
 * Copies the transaction's checklist onto the new application. The list lives
 * in mtop.transaction_requirements, so adding or removing a requirement is a
 * data change — no migration, no code change here.
 */
async function seedApplicationChildren(
  supabase: Supabase,
  applicationId: string,
  actorId: string,
  transactionTypeId: string
) {
  const { data: matrix, error: matrixError } = await supabase
    .schema("mtop")
    .from("transaction_requirements")
    .select("requirement_id")
    .eq("transaction_type_id", transactionTypeId)

  if (matrixError) return matrixError.message
  if (!matrix || matrix.length === 0) {
    return "This transaction has no requirements configured. Ask an administrator to set up its checklist."
  }

  const { error: docError } = await supabase
    .schema("mtop")
    .from("mtop_application_requirements")
    .insert(
      matrix.map((row: { requirement_id: string }) => ({
        application_id: applicationId,
        requirement_id: row.requirement_id,
      }))
    )

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

    const denied = await assertCanCreate(supabase, user.id)
    if (denied) return { error: denied, data: null }

    const { error: typeError, data: transactionType } =
      await resolveTransactionType(supabase, "new_franchise")
    if (typeError || !transactionType)
      return { error: typeError, data: null }

    // Taken in parts, stored as one line too — see src/lib/operator-name.ts.
    const applicantName = composeOperatorName(input)
    if (!namePart(input.last_name) || !namePart(input.first_name)) {
      return { error: "The operator's last and first name are required.", data: null }
    }

    // One operator per franchise.
    const coOwner = findCoOwnerMarker(applicantName)
    if (coOwner) {
      return {
        error: `${SINGLE_OPERATOR_MESSAGE} (found "${coOwner}" in the name)`,
        data: null,
      }
    }

    // One franchise per operator. The database enforces this too; checking
    // here lets us name the franchise that is in the way.
    const heldFranchise = await findOperatorsActiveFranchise(
      supabase,
      applicantName
    )
    if (heldFranchise) {
      return {
        error: `${heldFranchise.applicant_name} already holds an active franchise${
          heldFranchise.mtop_number ? ` (${heldFranchise.mtop_number})` : " (application in progress)"
        }. An operator may only hold one franchise — close the existing one first.`,
        data: null,
      }
    }

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

    // Body, plate, motor and chassis each identify one tricycle citywide. The
    // database enforces all four; checking here names the franchise in the way.
    // The motor+chassis pair check above stays: it catches the same vehicle
    // being re-registered even from a closed franchise, which these indexes
    // deliberately allow, and says something more useful when it does.
    const unitConflict = await findUnitIdentifierConflict(supabase, {
      bodyNumber: input.tricycle_body_number,
      plateNumber: input.plate_number,
      motorNumber: input.motor_number,
      chassisNumber: input.chassis_number,
    })
    if (unitConflict) {
      return { error: unitConflictMessage(unitConflict), data: null }
    }

    const { data: franchise, error: franchiseError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .insert({
        applicant_name: applicantName,
        last_name: namePart(input.last_name),
        first_name: namePart(input.first_name),
        middle_name: namePart(input.middle_name),
        suffix: namePart(input.suffix),
        barangay: input.barangay,
        purok: input.purok?.trim() || null,
        // The one readable line every other reader uses — the card, search,
        // reports and the audit trail — composed once, here, at filing time.
        applicant_address: composeAddress(input.purok, input.barangay),
        contact_number: input.contact_number,
        tricycle_body_number: input.tricycle_body_number,
        plate_number: input.plate_number,
        motor_number: input.motor_number,
        chassis_number: input.chassis_number,
        route: input.route,
        association_id: input.association_id || null,
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
        transaction_type_id: transactionType.id,
        created_by: user.id,
      })
      .select("id")
      .single()

    if (appError) return { error: appError.message, data: null }

    const childError = await seedApplicationChildren(
      supabase,
      application.id,
      user.id,
      transactionType.id
    )
    if (childError) return { error: childError, data: null }

    revalidatePath("/dashboard/applications")
    return { error: null, data: application }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

/**
 * Files any of the six transactions that act on a franchise that already
 * exists — renewal, annual confirmation, change of unit, change of ownership,
 * re-issuance or closure.
 *
 * Only the renewal-window rule is transaction-specific at filing time; the
 * rules that differ on *grant* (what happens to the MTOP number, the validity
 * date, the unit or the owner) are keyed off transaction_types.grant_effect and
 * are not applied here.
 */
export async function createFranchiseTransaction(
  input: FranchiseTransactionFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()

    const denied = await assertCanCreate(supabase, user.id)
    if (denied) return { error: denied, data: null }

    // The form enforces this too, but the action is callable directly.
    if (requiresReason(input.transaction_type_code) && !input.reason?.trim()) {
      return { error: "State the reason for this transaction.", data: null }
    }

    const { data: settings } = await getSystemSettings()

    const { error: typeError, data: transactionType } =
      await resolveTransactionType(supabase, input.transaction_type_code)
    if (typeError || !transactionType) return { error: typeError, data: null }

    const { data: franchise, error: franchiseError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("id, mtop_number, granted_until, franchise_status")
      .eq("id", input.franchise_id)
      .single()

    if (franchiseError) return { error: franchiseError.message, data: null }

    // Every one of these transactions acts on a franchise the city has already
    // granted — there is no MTOP to renew, confirm, transfer or close until then.
    if (!franchise.granted_until || !franchise.mtop_number) {
      return {
        error: `This franchise has not been granted yet — ${transactionType.name} cannot be filed until its first application is granted.`,
        data: null,
      }
    }

    if (franchise.franchise_status !== "active") {
      return {
        error: `This franchise is ${franchise.franchise_status} and cannot file new transactions.`,
        data: null,
      }
    }

    // An expired franchise may only file a renewal or a closure. Checked before
    // anything below writes to the franchise.
    if (isBlockedByExpiry(franchise.granted_until, transactionType.code)) {
      return { error: EXPIRED_FRANCHISE_MESSAGE, data: null }
    }

    // The renewal window is a renewal rule. An annual confirmation, a change of
    // unit or a closure can be filed at any point in the franchise's life.
    if (transactionType.code === "renewal") {
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
    }

    const successorName = composeOperatorName({
      last_name: input.new_last_name ?? "",
      first_name: input.new_first_name ?? "",
      middle_name: input.new_middle_name,
      suffix: input.new_suffix,
    })

    // A change of ownership names the successor up front, so the one-franchise
    // -per-operator rule can be applied at filing rather than only at grant.
    if (input.transaction_type_code === "change_ownership") {
      const successor = successorName
      if (!namePart(input.new_last_name) || !namePart(input.new_first_name)) {
        return {
          error: "The new owner's last and first name are required.",
          data: null,
        }
      }
      const successorCoOwner = findCoOwnerMarker(successor)
      if (successorCoOwner) {
        return {
          error: `${SINGLE_OPERATOR_MESSAGE} (found "${successorCoOwner}" in the new owner's name)`,
          data: null,
        }
      }

      const successorHolds = await findOperatorsActiveFranchise(
        supabase,
        successor,
        franchise.id
      )
      if (successorHolds) {
        return {
          error: `${successorHolds.applicant_name} already holds an active franchise${
            successorHolds.mtop_number ? ` (${successorHolds.mtop_number})` : ""
          }. An operator may only hold one franchise, so this transfer cannot be filed.`,
          data: null,
        }
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
          "This franchise already has an in-flight application. Complete, reject or close it before filing another transaction.",
        data: null,
      }
    }

    // Plain corrections (address, contact, route, make, day off) apply right
    // away regardless of transaction — they are not what the transaction is
    // *about*. Plate number is the exception on change_unit, and applicant
    // address/contact on change_ownership: those are the subject of the
    // transaction, so they are staged as new_* below and applied only on
    // grant, alongside motor/chassis/owner name.
    const isChangeUnit = input.transaction_type_code === "change_unit"
    const isChangeOwnership = input.transaction_type_code === "change_ownership"

    // Body, plate, motor and chassis each identify one tricycle citywide, so
    // whichever of them this transaction touches has to be free. On a change
    // of unit the numbers under test are the staged ones — the current plate,
    // motor and chassis belong to the unit being replaced and sit on this
    // franchise's own record, which is excluded below.
    const unitConflict = await findUnitIdentifierConflict(
      supabase,
      {
        bodyNumber: input.tricycle_body_number,
        plateNumber: isChangeUnit ? input.new_plate_number : input.plate_number,
        motorNumber: isChangeUnit ? input.new_motor_number : undefined,
        chassisNumber: isChangeUnit ? input.new_chassis_number : undefined,
      },
      franchise.id
    )
    if (unitConflict) {
      return {
        error: unitConflictMessage(
          unitConflict,
          isChangeUnit ? STAGED_FIELD_LABEL[unitConflict.field] : undefined
        ),
        data: null,
      }
    }

    const franchiseUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    // A change of ownership stages the successor's address instead; editing
    // the current owner's address in the same breath would apply immediately
    // and describe neither party correctly.
    if (!isChangeOwnership && input.barangay) {
      franchiseUpdates.barangay = input.barangay
      franchiseUpdates.purok = input.purok?.trim() || null
      franchiseUpdates.applicant_address = composeAddress(
        input.purok,
        input.barangay
      )
    }
    if (!isChangeOwnership && input.contact_number !== undefined)
      franchiseUpdates.contact_number = input.contact_number
    if (!isChangeUnit && input.plate_number !== undefined)
      franchiseUpdates.plate_number = input.plate_number
    if (input.tricycle_body_number !== undefined)
      franchiseUpdates.tricycle_body_number = input.tricycle_body_number
    if (input.route !== undefined) franchiseUpdates.route = input.route
    if (input.make !== undefined)
      franchiseUpdates.make = input.make?.trim() || null
    if (input.day_off !== undefined)
      franchiseUpdates.day_off = input.day_off?.trim() || null
    // "" is the picker's "No association (striker)" option, so it clears the
    // franchise's association rather than being ignored as a blank.
    if (input.association_id !== undefined)
      franchiseUpdates.association_id = input.association_id || null

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
        transaction_type_id: transactionType.id,
        created_by: user.id,
        new_motor_number: isChangeUnit ? input.new_motor_number : null,
        new_chassis_number: isChangeUnit ? input.new_chassis_number : null,
        new_plate_number: isChangeUnit ? input.new_plate_number || null : null,
        new_applicant_name: isChangeOwnership ? successorName : null,
        new_last_name: isChangeOwnership ? namePart(input.new_last_name) : null,
        new_first_name: isChangeOwnership ? namePart(input.new_first_name) : null,
        new_middle_name: isChangeOwnership
          ? namePart(input.new_middle_name)
          : null,
        new_suffix: isChangeOwnership ? namePart(input.new_suffix) : null,
        new_barangay: isChangeOwnership ? input.new_barangay || null : null,
        new_purok: isChangeOwnership ? input.new_purok?.trim() || null : null,
        new_applicant_address: isChangeOwnership
          ? composeAddress(input.new_purok, input.new_barangay) || null
          : null,
        new_contact_number: isChangeOwnership
          ? input.new_contact_number || null
          : null,
        reason: requiresReason(input.transaction_type_code)
          ? input.reason?.trim() || null
          : null,
      })
      .select("id")
      .single()

    if (appError) return { error: appError.message, data: null }

    const childError = await seedApplicationChildren(
      supabase,
      application.id,
      user.id,
      transactionType.id
    )
    if (childError) return { error: childError, data: null }

    revalidatePath("/dashboard/applications")
    return { error: null, data: application }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

/**
 * Pre-flight for the operator-name field: reports whether this person can be
 * given a franchise, so the form can say so before the clerk fills the rest of
 * it. The authoritative checks still run in createNewFranchiseApplication and
 * in the database.
 */
export async function checkOperatorAvailability(
  operatorName: string,
  excludeFranchiseId?: string
): Promise<{
  error: string | null
  coOwnerMarker: string | null
  heldFranchise: { mtop_number: string | null; applicant_name: string } | null
}> {
  try {
    const { supabase } = await getAuthUser()

    const coOwnerMarker = findCoOwnerMarker(operatorName)
    if (coOwnerMarker) {
      return { error: null, coOwnerMarker, heldFranchise: null }
    }

    const held = await findOperatorsActiveFranchise(
      supabase,
      operatorName,
      excludeFranchiseId
    )

    return {
      error: null,
      coOwnerMarker: null,
      heldFranchise: held
        ? { mtop_number: held.mtop_number, applicant_name: held.applicant_name }
        : null,
    }
  } catch (e) {
    return {
      error: (e as Error).message,
      coOwnerMarker: null,
      heldFranchise: null,
    }
  }
}

/**
 * Pre-flight for the body- and plate-number fields, so a number that is
 * already on another franchise is caught while the clerk is still on the
 * tricycle section rather than on submit. Either field may be omitted, which
 * is how a form asks about the one that just changed.
 *
 * The authoritative checks still run in the create actions and in the
 * database — this is only allowed to be faster, never to be the last word.
 */
export async function checkUnitIdentifiers(
  numbers: UnitNumbers,
  excludeFranchiseId?: string
): Promise<{ error: string | null; conflicts: UnitIdentifierConflict[] }> {
  try {
    const { supabase } = await getAuthUser()

    const conflicts = await findUnitIdentifierConflicts(
      supabase,
      numbers,
      excludeFranchiseId
    )

    return { error: null, conflicts }
  } catch (e) {
    return { error: (e as Error).message, conflicts: [] }
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
        "*, association:associations(id, name), applications:mtop_applications(id, status, fiscal_year, granted_at)"
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
      .select(
        "*, franchise:mtop_franchises(*, association:associations(id, name)), transaction_type:transaction_types(*)",
        { count: "exact" }
      )
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

    // The application row comes first: its transaction_type_id decides which
    // checklist rules to merge into the requirement rows below.
    const { data: application, error: appError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        "*, franchise:mtop_franchises(*, association:associations(id, name)), transaction_type:transaction_types(*), creator:user_profiles!created_by(id, full_name, email)"
      )
      .eq("id", id)
      .single()

    if (appError) return { error: appError.message, data: null }

    const [reqResult, matrixResult, inspResult, assessResult, payResult, logsResult] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_application_requirements")
          .select(
            "*, requirement:requirements(code, label, kind, description)"
          )
          .eq("application_id", id),
        supabase
          .schema("mtop")
          .from("transaction_requirements")
          .select("requirement_id, is_mandatory, is_conditional, note, sort_order")
          .eq("transaction_type_id", application.transaction_type_id),
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

    // Merge each application row with its catalogue entry and this
    // transaction's rules for it. A row whose requirement was later dropped
    // from the matrix still renders — it just carries no rule overrides, so it
    // is treated as mandatory, which is how it was seeded.
    const rules = new Map(
      (matrixResult.data ?? []).map(
        (r: {
          requirement_id: string
          is_mandatory: boolean
          is_conditional: boolean
          note: string | null
          sort_order: number
        }) => [r.requirement_id, r]
      )
    )

    const requirements = (reqResult.data ?? [])
      .map(
        (row: {
          requirement_id: string
          requirement: {
            code: string
            label: string
            kind: string
            description: string
          } | null
        } & Record<string, unknown>) => {
          const rule = rules.get(row.requirement_id)
          const { requirement, ...rest } = row
          return {
            ...rest,
            code: requirement?.code ?? "unknown",
            label: requirement?.label ?? "Unknown requirement",
            kind: requirement?.kind ?? "document",
            description: requirement?.description ?? "",
            is_mandatory: rule?.is_mandatory ?? true,
            is_conditional: rule?.is_conditional ?? false,
            note: rule?.note ?? null,
            sort_order: rule?.sort_order ?? 999,
          }
        }
      )
      .sort((a, b) => a.sort_order - b.sort_order)

    return {
      error: null,
      data: {
        ...application,
        requirements,
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
  action: "approved" | "rejected" | "returned" | "forwarded",
  remarks?: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    // A return is the office telling the operator what to come back with, and a
    // rejection is the record of why the franchise was refused. Neither is worth
    // anything without the reason. The form checks this too, for an immediate
    // answer; enforcing it here is what makes it a rule rather than a
    // suggestion, for this and any future caller.
    const remarksRequired = remarksRequiredMessage(action)
    if (remarksRequired && !remarks?.trim()) {
      return { error: remarksRequired }
    }

    const updateData: Record<string, unknown> = { status }
    let grantedAt: Date | null = null
    if (status === "granted") {
      grantedAt = new Date()
      updateData.granted_at = grantedAt.toISOString()
    }

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .update(updateData)
      .eq("id", id)

    if (error) return { error: error.message }

    // grant_franchise() reads the application row itself — its
    // transaction_type's grant_effect, and any new_* values staged at filing
    // (change of unit / change of ownership) — and branches accordingly. See
    // 20260413000015_grant_effects.sql for what each of the seven effects does.
    if (status === "granted" && grantedAt) {
      const { data: settings } = await getSystemSettings()
      const { error: rpcError } = await supabase
        .schema("mtop")
        .rpc("grant_franchise", {
          p_application_id: id,
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
      })

    if (logError) return { error: logError.message }

    revalidatePath("/dashboard/applications")
    revalidatePath(`/dashboard/applications/${id}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/**
 * Puts a returned application back into the pipeline.
 *
 * A return is a pause, not a rejection — the application keeps its cleared
 * requirements, inspection, assessment and payments, and still counts as the
 * franchise's one in-flight application (see
 * idx_applications_one_in_flight_per_franchise), so reopening changes nothing
 * but the status.
 *
 * The target stage is derived here rather than passed in: the caller doesn't
 * get to choose where an application re-enters the flow.
 */
export async function reopenApplication(id: string, remarks?: string) {
  try {
    const { supabase, user } = await getAuthUser()

    const { data: application, error: appError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("id, status")
      .eq("id", id)
      .single()

    if (appError) return { error: appError.message, data: null }
    if (application.status !== "returned") {
      return {
        error: "Only a returned application can be reopened.",
        data: null,
      }
    }

    const { data: logs, error: logsError } = await supabase
      .schema("mtop")
      .from("approval_logs")
      .select("stage, created_at")
      .eq("application_id", id)

    if (logsError) return { error: logsError.message, data: null }

    const stage = reopenTargetStage(
      (logs ?? []) as { stage: MtopStatus; created_at: string }[]
    )

    const { error: updateError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .update({ status: stage })
      .eq("id", id)

    if (updateError) return { error: updateError.message, data: null }

    // Logged as a forward into the stage it resumes at — approval_logs.action
    // has no "reopened" value, and the returned entry directly above it in the
    // timeline already says what this is answering.
    const { error: logError } = await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: id,
        stage,
        action: "forwarded",
        actor_id: user.id,
        remarks: remarks?.trim() || null,
      })

    if (logError) return { error: logError.message, data: null }

    revalidatePath("/dashboard/applications")
    revalidatePath(`/dashboard/applications/${id}`)
    return { error: null, data: { status: stage } }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}
