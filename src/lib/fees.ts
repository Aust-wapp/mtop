import { differenceInDays } from "date-fns"
import type { TransactionTypeCode } from "@/types/database"

export const LOST_PLATE_REPLACEMENT_FEE = 500

export function isValidLostPlateReplacementFee(value: number): boolean {
  return value === 0 || value === LOST_PLATE_REPLACEMENT_FEE
}

export const STANDARD_FEES = {
  filing_fee: 250,
  supervision_fee: 100,
  confirmation_fee: 65,
  mayors_permit_fee: 150,
  franchise_fee: 250,
  police_clearance_fee: 50,
  health_fee: 50,
  legal_research_fee: 65,
  parking_fee: 770,
} as const

export const STANDARD_FEE_KEYS = [
  "filing_fee",
  "supervision_fee",
  "confirmation_fee",
  "mayors_permit_fee",
  "franchise_fee",
  "police_clearance_fee",
  "health_fee",
  "legal_research_fee",
  "parking_fee",
] as const

export const TRANSACTION_FEE_KEYS = [
  "change_of_motor_fee",
  "replacement_plate_fee",
  "annual_confirmation_fee",
  "reissuance_fee",
  "certification_fee",
  "closure_fee",
] as const

export const ALL_FEE_KEYS = [
  ...STANDARD_FEE_KEYS,
  "late_renewal_penalty",
  ...TRANSACTION_FEE_KEYS,
] as const

export type FeeKey = (typeof ALL_FEE_KEYS)[number]
export type FeeSchedule = Record<FeeKey, number>

export const FEE_LABELS: Record<string, string> = {
  filing_fee: "Filing Fee",
  supervision_fee: "Supervision Fee",
  confirmation_fee: "Confirmation Fee",
  mayors_permit_fee: "Mayor's Permit Fee",
  franchise_fee: "Franchise Fee",
  police_clearance_fee: "Police Clearance",
  health_fee: "Health Fee",
  legal_research_fee: "Legal Research Fee",
  parking_fee: "Parking Fee",
  late_renewal_penalty: "Late Renewal Penalty",
  change_of_motor_fee: "Change of Motor (Power Train)",
  replacement_plate_fee: "Replacement of Lost Plate",
  annual_confirmation_fee: "Annual Confirmation Fee",
  reissuance_fee: "Re-Issuance Fee",
  certification_fee: "Certification Fee",
  closure_fee: "Payment of Closure",
}

const ZERO_FEE_SCHEDULE: FeeSchedule = {
  filing_fee: 0,
  supervision_fee: 0,
  confirmation_fee: 0,
  mayors_permit_fee: 0,
  franchise_fee: 0,
  police_clearance_fee: 0,
  health_fee: 0,
  legal_research_fee: 0,
  parking_fee: 0,
  late_renewal_penalty: 0,
  change_of_motor_fee: 0,
  replacement_plate_fee: 0,
  annual_confirmation_fee: 0,
  reissuance_fee: 0,
  certification_fee: 0,
  closure_fee: 0,
}

const STANDARD_FEE_BUNDLE = {
  ...STANDARD_FEES,
}

const TRANSACTION_FEE_SCHEDULES: Record<
  TransactionTypeCode,
  Partial<FeeSchedule>
> = {
  new_franchise: STANDARD_FEE_BUNDLE,
  renewal: STANDARD_FEE_BUNDLE,
  change_ownership: STANDARD_FEE_BUNDLE,
  change_unit: {
    ...STANDARD_FEE_BUNDLE,
    parking_fee: 0,
    change_of_motor_fee: 1000,
  },
  annual_confirmation: {
    annual_confirmation_fee: 100,
  },
  reissuance: {
    reissuance_fee: 150,
  },
  closure: {
    certification_fee: 100,
    closure_fee: 500,
  },
}

const APPLICABLE_FEE_KEYS: Record<TransactionTypeCode, readonly FeeKey[]> = {
  new_franchise: STANDARD_FEE_KEYS,
  renewal: [...STANDARD_FEE_KEYS, "late_renewal_penalty"],
  change_ownership: STANDARD_FEE_KEYS,
  change_unit: [
    ...STANDARD_FEE_KEYS.filter((key) => key !== "parking_fee"),
    "change_of_motor_fee",
  ],
  annual_confirmation: ["annual_confirmation_fee"],
  reissuance: ["reissuance_fee"],
  closure: ["certification_fee", "closure_fee"],
}

/**
 * Return every assessment row for a transaction. Fees outside its schedule
 * remain present at zero so the assessment layout stays consistent.
 */
export function feeScheduleFor(
  transactionCode: string | null | undefined,
  latePenalty = 0
): FeeSchedule {
  if (
    !transactionCode ||
    !Object.hasOwn(TRANSACTION_FEE_SCHEDULES, transactionCode)
  ) {
    return { ...ZERO_FEE_SCHEDULE }
  }

  const code = transactionCode as TransactionTypeCode

  return {
    ...ZERO_FEE_SCHEDULE,
    ...TRANSACTION_FEE_SCHEDULES[code],
    late_renewal_penalty: code === "renewal" ? latePenalty : 0,
  }
}

/** Fees an assessor may adjust for a transaction; all other rows stay zero. */
export function feeKeysFor(
  transactionCode: string | null | undefined
): readonly FeeKey[] {
  if (
    !transactionCode ||
    !Object.hasOwn(APPLICABLE_FEE_KEYS, transactionCode)
  ) {
    return []
  }

  return [
    ...APPLICABLE_FEE_KEYS[transactionCode as TransactionTypeCode],
    "replacement_plate_fee",
  ]
}

/** Sum displayed assessment rows so the amount follows the actual line items. */
export function calculateFeeTotal(
  fees: Partial<Record<FeeKey, number | string | null | undefined>>
): number {
  return ALL_FEE_KEYS.reduce(
    (total, key) => total + Number(fees[key] ?? 0),
    0
  )
}

export function calculateLatePenalty(
  dueDate: Date,
  renewalDate: Date
): number {
  const daysLate = differenceInDays(renewalDate, dueDate)
  if (daysLate <= 0) return 0
  if (daysLate <= 30) return 50.0
  const additionalMonths = Math.ceil((daysLate - 30) / 30)
  return 50.0 + additionalMonths * 75.0
}
