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

/**
 * Everything the LTO confirmation slip prints. Every field is a finished
 * string: the slip is a fill-in-the-blanks form, so a value is either typed on
 * its line or the line is left empty — there is no formatting left to do at
 * render time.
 */
export interface ConfirmationSlipData {
  mtopNumber: string
  ownerName: string
  ownerAddress: string
  cabNumber: string
  route: string
  make: string
  motorNumber: string
  chassisNumber: string
  plateNumber: string
  /** "13", with `grantedOrdinal` carrying the "th" that is set superscript. */
  grantedDay: string
  grantedOrdinal: string
  grantedMonth: string
  grantedYear: string
  orNumber: string
  amountPaid: string
  datePaid: string
  issuedAt: string
  /** Signatory, from system settings — a new mayor is not a deployment. */
  mayorName: string
  mayorDesignation: string
  mayorSignatureUrl: string | null
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th"
  if (day % 10 === 1) return "st"
  if (day % 10 === 2) return "nd"
  if (day % 10 === 3) return "rd"
  return "th"
}

/** The officer's issuance day; legacy records fall back to the grant timestamp. */
function grantedParts(grantedAt: string | null) {
  const granted = officeDateParts(grantedAt)
  if (!granted)
    return { grantedDay: "", grantedOrdinal: "", grantedMonth: "", grantedYear: "" }

  return {
    grantedDay: String(granted.day),
    grantedOrdinal: ordinalSuffix(granted.day),
    grantedMonth: MONTHS[granted.month - 1],
    grantedYear: String(granted.year),
  }
}

/** The slip writes the OR date numerically — 03/27/2026. */
function formatSlipDate(value: string | null) {
  const paid = officeDateParts(value)
  if (!paid) return ""
  const mm = String(paid.month).padStart(2, "0")
  const dd = String(paid.day).padStart(2, "0")
  return `${mm}/${dd}/${paid.year}`
}

export async function getConfirmationSlipData(applicationId: string): Promise<{
  error: string | null
  data: ConfirmationSlipData | null
}> {
  try {
    const { supabase, user } = await getAuthUser()
    if (!(await hasPermission(supabase, user.id, "application.view"))) {
      return { error: "You do not have permission to view confirmation slips.", data: null }
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

    // The slip confirms a permit the city has issued, so like the franchise
    // card it exists only once the transaction is granted.
    if (application.status !== "granted") {
      return {
        error:
          "The Confirmation Slip is only available once the MTOP is granted.",
        data: null,
      }
    }

    const franchise = application.franchise
    if (!franchise) return { error: "Franchise not found.", data: null }

    const [{ data: payments }, settingsResult] = await Promise.all([
      supabase
        .schema("mtop")
        .from("mtop_payments")
        .select("or_number, amount_paid, payment_date")
        .eq("application_id", applicationId)
        .order("payment_date", { ascending: true }),
      getSystemSettings(),
    ])

    if (settingsResult.error) return { error: settingsResult.error, data: null }
    const settings = settingsResult.data

    // Confirmation Slips use the same CURRENT Mayor configuration as regenerated
    // Franchise Cards; no signature URL is stored on the application record.
    let mayorSignatureUrl: string | null = null
    if (settings.mayor_signature_path) {
      const { data: signature, error: signatureError } = await supabase.storage
        .from("mtop-signatures")
        .createSignedUrl(settings.mayor_signature_path, 300)
      if (signatureError) return { error: `Cannot load Mayor signature: ${signatureError.message}`, data: null }
      mayorSignatureUrl = signature?.signedUrl ?? null
    }

    const paid = payments ?? []
    const total = paid.reduce(
      (sum: number, p: { amount_paid: number }) => sum + Number(p.amount_paid),
      0
    )

    return {
      error: null,
      data: {
        mtopNumber: franchise.mtop_number ?? "",
        ownerName: franchise.applicant_name ?? "",
        // The form already prints ", OZAMIZ CITY." after this blank, so the
        // city is left off the value the way the typed originals leave it off.
        ownerAddress: displayAddress(franchise, { includeCity: false }),
        cabNumber: franchise.tricycle_body_number ?? "",
        route: franchise.route ?? "",
        make: franchise.make ?? "",
        motorNumber: franchise.motor_number ?? "",
        chassisNumber: franchise.chassis_number ?? "",
        plateNumber: franchise.plate_number ?? "",
        ...grantedParts(application.date_issued ?? application.granted_at),
        // One line, however many receipts paid for the transaction.
        orNumber: paid.map((p) => p.or_number).join(", "),
        amountPaid:
          paid.length > 0
            ? total.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : "",
        datePaid: formatSlipDate(paid[0]?.payment_date ?? null),
        issuedAt: paid.length > 0 ? "OZAMIZ CITY" : "",
        mayorName: settings.mayor_name,
        mayorDesignation: settings.mayor_designation,
        mayorSignatureUrl,
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}
