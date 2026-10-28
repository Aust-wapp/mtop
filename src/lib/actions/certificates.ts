"use server"

import { displayAddress } from "@/lib/address"
import {
  formatCertificateDate,
  formatCertificateGivenDate,
  formatCertificationFee,
} from "@/lib/certificate-format"
import {
  findLatestGrantedClosureApplication,
  type ClosureApplicationCandidate,
} from "@/lib/certificate-access"
import { createClient } from "@/lib/supabase/server"

export interface CertificateVehicle {
  make: string
  motorNumber: string
  chassisNumber: string
  plateNumber: string
}

interface CertificateCommonData {
  mtopNumber: string
  applicantName: string
  applicantAddress: string
  givenDate: string
  certificationFee: string
  orNumber: string
  issueDate: string
  cityTreasurerName: string
}

export interface ChangeUnitCertificateData extends CertificateCommonData {
  kind: "change_unit"
  previousUnit: CertificateVehicle
  newUnit: CertificateVehicle
}

export interface ClosureCertificateData extends CertificateCommonData {
  kind: "closure"
  closureDate: string
  vehicle: CertificateVehicle
}

export type GrantedCertificateData =
  | ChangeUnitCertificateData
  | ClosureCertificateData

export type GrantedCertificateKind = GrantedCertificateData["kind"]

export async function getGrantedClosureApplicationIdForFranchise(
  franchiseId: string
): Promise<{ error: string | null; applicationId: string | null }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        error: "You must be signed in to access this franchise record.",
        applicationId: null,
      }
    }

    const { data: franchise, error: franchiseError } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("franchise_status")
      .eq("id", franchiseId)
      .maybeSingle()

    if (franchiseError) {
      return { error: franchiseError.message, applicationId: null }
    }

    if (franchise?.franchise_status !== "closed") {
      return { error: null, applicationId: null }
    }

    const { data: applications, error: applicationsError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        "id, status, granted_at, submitted_at, transaction_type:transaction_types(code)"
      )
      .eq("franchise_id", franchiseId)
      .eq("status", "granted")
      .order("granted_at", { ascending: false })

    if (applicationsError) {
      return { error: applicationsError.message, applicationId: null }
    }

    const closureApplication = findLatestGrantedClosureApplication(
      (applications ?? []) as ClosureApplicationCandidate[]
    )

    return { error: null, applicationId: closureApplication?.id ?? null }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to check for a Granted Closure application.",
      applicationId: null,
    }
  }
}

function certificateVehicle(
  unit: Partial<CertificateVehicle> | null | undefined
): CertificateVehicle {
  return {
    make: unit?.make ?? "",
    motorNumber: unit?.motorNumber ?? "",
    chassisNumber: unit?.chassisNumber ?? "",
    plateNumber: unit?.plateNumber ?? "",
  }
}

export async function getGrantedCertificateData(
  applicationId: string,
  kind: GrantedCertificateKind
): Promise<{
  error: string | null
  data: GrantedCertificateData | null
}> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: "You must be signed in to print this certification.", data: null }
    }

    const { data: application, error: applicationError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        "*, franchise:mtop_franchises(*), transaction_type:transaction_types(code)"
      )
      .eq("id", applicationId)
      .maybeSingle()

    if (applicationError) {
      return { error: applicationError.message, data: null }
    }
    if (!application) return { error: null, data: null }

    const expectedCode = kind
    if (
      application.status !== "granted" ||
      application.transaction_type?.code !== expectedCode
    ) {
      return {
        error: `This certification is only available for granted ${kind === "closure" ? "Closure" : "Change Unit"} applications.`,
        data: null,
      }
    }

    const franchise = application.franchise
    if (!franchise) {
      return { error: "The franchise record for this application is unavailable.", data: null }
    }

    const [paymentResult, assessmentResult, settingResult, unitHistoryResult] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("or_number, payment_date")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: true }),
        supabase
          .schema("mtop")
          .from("mtop_assessments")
          .select("certification_fee")
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("system_settings")
          .select("value")
          .eq("key", "city_treasurer_name")
          .maybeSingle(),
        kind === "change_unit"
          ? supabase
              .schema("mtop")
              .from("franchise_unit_history")
              .select(
                "previous_make, previous_motor_number, previous_chassis_number, previous_plate_number, new_make, new_motor_number, new_chassis_number, new_plate_number"
              )
              .eq("application_id", applicationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

    if (paymentResult.error) {
      return { error: paymentResult.error.message, data: null }
    }
    if (assessmentResult.error) {
      return { error: assessmentResult.error.message, data: null }
    }
    if (settingResult.error) {
      return { error: settingResult.error.message, data: null }
    }
    if (unitHistoryResult.error) {
      return { error: unitHistoryResult.error.message, data: null }
    }

    let applicantName = franchise.applicant_name
    let applicantAddress = displayAddress(franchise)
    if (kind === "change_unit" && application.granted_at) {
      const { data: laterOwnership, error: ownershipError } = await supabase
        .schema("mtop")
        .from("franchise_ownership_history")
        .select("previous_applicant_name, previous_applicant_address")
        .eq("franchise_id", franchise.id)
        .gt("changed_at", application.granted_at)
        .order("changed_at", { ascending: true })
        .limit(1)

      if (ownershipError) {
        return { error: ownershipError.message, data: null }
      }

      const ownerAtGrant = laterOwnership?.[0]
      if (ownerAtGrant) {
        applicantName = ownerAtGrant.previous_applicant_name
        applicantAddress =
          ownerAtGrant.previous_applicant_address ?? applicantAddress
      }
    }

    const payments = paymentResult.data ?? []
    const firstPayment = payments[0]
    const settingValue = settingResult.data?.value
    const cityTreasurerName =
      typeof settingValue === "string" ? settingValue : ""
    const common: CertificateCommonData = {
      mtopNumber: franchise.mtop_number ?? "",
      applicantName,
      applicantAddress,
      givenDate: formatCertificateGivenDate(
        application.granted_at ??
          (kind === "closure" ? franchise.closed_at : null)
      ),
      certificationFee: formatCertificationFee(
        assessmentResult.data?.certification_fee
      ),
      orNumber: payments.map((payment) => payment.or_number).join(", "),
      issueDate: formatCertificateDate(firstPayment?.payment_date),
      cityTreasurerName,
    }

    if (kind === "closure") {
      return {
        error: null,
        data: {
          ...common,
          kind,
          closureDate: formatCertificateDate(
            application.granted_at ?? franchise.closed_at
          ),
          vehicle: certificateVehicle({
            make: franchise.make ?? "",
            motorNumber: franchise.motor_number,
            chassisNumber: franchise.chassis_number,
            plateNumber: franchise.plate_number ?? "",
          }),
        },
      }
    }

    const history = unitHistoryResult.data
    if (!history) {
      return {
        error: "The unit history for this granted Change Unit application is unavailable.",
        data: null,
      }
    }

    return {
      error: null,
      data: {
        ...common,
        kind,
        previousUnit: certificateVehicle({
          make: history.previous_make ?? "",
          motorNumber: history.previous_motor_number ?? "",
          chassisNumber: history.previous_chassis_number ?? "",
          plateNumber: history.previous_plate_number ?? "",
        }),
        newUnit: certificateVehicle({
          make: history.new_make ?? application.new_make ?? "",
          motorNumber: history.new_motor_number,
          chassisNumber: history.new_chassis_number,
          plateNumber: history.new_plate_number ?? "",
        }),
      },
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to load certificate data.",
      data: null,
    }
  }
}
