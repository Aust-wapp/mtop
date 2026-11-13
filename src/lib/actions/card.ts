"use server"

import { createClient } from "@/lib/supabase/server"
import { getSystemSettings } from "@/lib/actions/settings"
import { displayAddress } from "@/lib/address"
import { officeDateParts } from "@/lib/office-time"
import { hasPermission } from "@/lib/permissions"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export interface FranchiseCardData {
  variant: "NEW" | "RENEWAL"
  year: string
  mtopNumber: string
  cabNumber: string
  validFrom: string
  validTo: string
  ownerName: string
  ownerAddress: string
  route: string
  dayOff: string
  make: string
  motorNumber: string
  chassisNumber: string
  plateNumber: string
  driverName: string
  driverAddress: string
  ownerPhotoUrl: string | null
  driverPhotoUrl: string | null
  ctmsContactNumber: string
  orNumber: string
  amountPaid: string
  datePaid: string
  mayorName: string
  mayorDesignation: string
  mayorSignatureUrl: string | null
  treasurerName: string
  treasurerDesignation: string
  treasurerSignatureUrl: string | null
  signatoryRecorded: boolean
}

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
]

/**
 * The permit runs on calendar years: granted in 2026 with 3-year validity
 * prints as 01 JANUARY 2026 – 31 DECEMBER 2028. This is presentation only —
 * mtop_franchises.granted_until still drives renewal reminders.
 *
 * The year is the one the office granted it in, not the one the server was
 * having at the time — the same reckoning that numbers the permit.
 */
function calendarValidity(grantedAt: string | null, validityYears: number) {
  const granted = officeDateParts(grantedAt)
  if (!granted) return { from: "", to: "", year: "" }
  const startYear = granted.year
  const endYear = startYear + Math.max(1, validityYears) - 1
  return {
    from: `01 JANUARY ${startYear}`,
    to: `31 DECEMBER ${endYear}`,
    year: String(startYear),
  }
}

function printedDate(value: string | null): string {
  const parts = officeDateParts(value)
  return parts ? `${String(parts.day).padStart(2, "0")} ${MONTHS[parts.month - 1]} ${parts.year}` : ""
}

function formatDatePaid(value: string | null) {
  const paid = officeDateParts(value)
  if (!paid) return ""
  const month = MONTHS[paid.month - 1]
  return `${month[0]}${month.slice(1).toLowerCase()} ${paid.day}, ${paid.year}`
}

function formatPeso(amount: number) {
  return `Php ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export async function getFranchiseCardData(applicationId: string, previewCurrentSignatories = false): Promise<{
  error: string | null
  data: FranchiseCardData | null
}> {
  try {
    const { supabase, user } = await getAuthUser()
    if (!(await hasPermission(supabase, user.id, "application.view"))) {
      return { error: "You do not have permission to view franchise cards.", data: null }
    }
    if (previewCurrentSignatories && !(await hasPermission(supabase, user.id, "admin.manage"))) {
      return { error: "Only administrators can preview current signatories on a historical card.", data: null }
    }

    const { data: application, error } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("*, franchise:mtop_franchises(*)")
      .eq("id", applicationId)
      .single()

    if (error || !application) {
      return { error: error?.message ?? "Application not found.", data: null }
    }

    if (application.status !== "granted") {
      return {
        error: "The Franchise Card is only available once the MTOP is granted.",
        data: null,
      }
    }

    const franchise = application.franchise
    if (!franchise) return { error: "Franchise not found.", data: null }

    const [{ data: payments }, settingsResult, { count: priorGrants }, { data: validityGrants }, signatoryResult] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("or_number, amount_paid, payment_date")
          .eq("application_id", applicationId)
          .order("payment_date", { ascending: true }),
        getSystemSettings(),
        // Any earlier granted cycle for this franchise makes this a renewal.
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("id", { count: "exact", head: true })
          .eq("franchise_id", franchise.id)
          .eq("status", "granted")
          .lt("granted_at", application.granted_at ?? new Date().toISOString()),
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("date_issued, granted_at, transaction_type:transaction_types(grant_effect)")
          .eq("franchise_id", franchise.id)
          .eq("status", "granted")
          .lte("granted_at", application.granted_at ?? new Date().toISOString())
          .order("granted_at", { ascending: false }),
        supabase.schema("mtop").from("franchise_card_signatories")
          .select("mayor_name, mayor_designation, mayor_signature_path, treasurer_name, treasurer_designation, treasurer_signature_path")
          .eq("application_id", applicationId).maybeSingle(),
      ])

    if (signatoryResult.error) return { error: signatoryResult.error.message, data: null }
    if (previewCurrentSignatories && settingsResult.error) return { error: settingsResult.error, data: null }
    const settings = settingsResult.data
    const signatories = previewCurrentSignatories ? {
      mayor_name: settings.mayor_name,
      mayor_designation: settings.mayor_designation,
      mayor_signature_path: settings.mayor_signature_path,
      treasurer_name: settings.city_treasurer_name,
      treasurer_designation: settings.city_treasurer_designation,
      treasurer_signature_path: settings.city_treasurer_signature_path,
    } : signatoryResult.data

    const paid = payments ?? []
    const total = paid.reduce(
      (sum: number, p: { amount_paid: number }) => sum + Number(p.amount_paid),
      0
    )

    const legacyValidity = calendarValidity(
      application.granted_at,
      settings.permit_validity_years
    )
    const latestValidityGrant = validityGrants?.find((grant) => {
      const type = Array.isArray(grant.transaction_type)
        ? grant.transaction_type[0]
        : grant.transaction_type
      return ["issue_number", "extend_validity"].includes(type?.grant_effect ?? "")
    })
    const issuedDate = latestValidityGrant?.date_issued ?? latestValidityGrant?.granted_at ?? null
    const validity = application.expiration_date && issuedDate
      ? {
          from: printedDate(issuedDate),
          to: printedDate(application.expiration_date),
          year: String(officeDateParts(issuedDate)?.year ?? ""),
        }
      : legacyValidity

    const signatureUrl = async (path: string) => {
      if (!path) return null
      const { data, error } = await supabase.storage.from("mtop-signatures").createSignedUrl(path, 300)
      if (error) throw error
      return data.signedUrl
    }
    const [mayorSignatureUrl, treasurerSignatureUrl] = await Promise.all([
      signatureUrl(signatories?.mayor_signature_path ?? ""),
      signatureUrl(signatories?.treasurer_signature_path ?? ""),
    ])

    return {
      error: null,
      data: {
        variant: (priorGrants ?? 0) > 0 ? "RENEWAL" : "NEW",
        year: validity.year,
        mtopNumber: franchise.mtop_number ?? "",
        cabNumber: franchise.tricycle_body_number ?? "",
        validFrom: validity.from,
        validTo: validity.to,
        ownerName: franchise.applicant_name ?? "",
        // Without the city: the permit's letterhead already says Ozamiz, and
        // the address line is the narrowest field on the card. Franchises
        // registered before the address was structured fall back to their
        // free-text line — see src/lib/address.ts.
        ownerAddress: displayAddress(franchise, { includeCity: false }),
        route: franchise.route ?? "",
        dayOff: franchise.day_off ?? "",
        make: franchise.make ?? "",
        motorNumber: franchise.motor_number ?? "",
        chassisNumber: franchise.chassis_number ?? "",
        plateNumber: franchise.plate_number ?? "",
        driverName: franchise.driver_name ?? "",
        driverAddress: franchise.driver_address ?? "",
        ownerPhotoUrl: franchise.owner_photo_url ?? null,
        driverPhotoUrl: franchise.driver_photo_url ?? null,
        ctmsContactNumber: settings.ctms_contact_number,
        orNumber: paid.map((p) => p.or_number).join(", "),
        amountPaid: paid.length > 0 ? formatPeso(total) : "",
        datePaid: formatDatePaid(paid[0]?.payment_date ?? null),
        mayorName: signatories?.mayor_name ?? "",
        mayorDesignation: signatories?.mayor_designation ?? "",
        mayorSignatureUrl,
        treasurerName: signatories?.treasurer_name ?? "",
        treasurerDesignation: signatories?.treasurer_designation ?? "",
        treasurerSignatureUrl,
        signatoryRecorded: Boolean(signatories),
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}
