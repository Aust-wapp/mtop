import { z } from "zod"
import { isValidLostPlateReplacementFee } from "@/lib/fees"
import { findCoOwnerMarker, SINGLE_OPERATOR_MESSAGE } from "@/lib/operator-name"

// Franchise (stable owner + tricycle identity).
// Used both standalone and as the base for new-franchise application input.
// One part of an operator's name. Each part is checked for co-ownership
// markers on its own — see src/lib/operator-name.ts.
const namePartSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Too long")
    .refine((v) => !findCoOwnerMarker(v), SINGLE_OPERATOR_MESSAGE)

export const franchiseSchema = z.object({
  // Stored as parts and composed into applicant_name by the server action —
  // see 20260413000030_operator_name_parts.sql.
  last_name: namePartSchema(60).pipe(z.string().min(1, "Last name is required")),
  first_name: namePartSchema(60).pipe(z.string().min(1, "First name is required")),
  middle_name: namePartSchema(60).optional(),
  suffix: namePartSchema(10).optional(),
  // Address is structured: the barangay comes from mtop.barangays (a foreign
  // key, so it can be counted) and the purok is free text, since puroks have
  // no citywide register. The one-line applicant_address the rest of the
  // system reads is composed from these by the server action.
  barangay: z.string().min(1, "Select a barangay"),
  purok: z.string().trim().max(80).optional(),
  contact_number: z.string().min(7, "Contact number must be at least 7 characters"),
  tricycle_body_number: z.string().min(1, "Body number is required"),
  plate_number: z.string().min(1, "Plate number is required"),
  motor_number: z.string().min(1, "Motor number is required"),
  chassis_number: z.string().min(1, "Chassis number is required"),
  route: z.string().min(1, "Route is required"),
  // Optional: strikers operate without belonging to any association, so an
  // empty value is valid and is the default.
  association_id: z.string().uuid().optional().or(z.literal("")),
  // Printed on the Franchise Card; optional so existing franchises stay valid.
  make: z.string().trim().max(60).optional(),
  day_off: z.string().trim().max(60).optional(),
})

export type FranchiseFormValues = z.infer<typeof franchiseSchema>

// First-time application — creates a new franchise + first application together.
// This is the only transaction that does not start from an existing franchise.
export const newFranchiseApplicationSchema = franchiseSchema.extend({
  due_date: z.string().optional(),
})

export type NewFranchiseApplicationFormValues = z.infer<
  typeof newFranchiseApplicationSchema
>

// Transactions filed against a franchise that already exists. One schema for
// all six of them; which one is being filed is `transaction_type_code`, and the
// server action applies the rules specific to that transaction.
export const existingFranchiseTransactionCodes = [
  "renewal",
  "annual_confirmation",
  "change_unit",
  "change_ownership",
  "reissuance",
  "closure",
] as const

const franchiseTransactionBaseSchema = z.object({
  franchise_id: z.string().uuid(),
  transaction_type_code: z.enum(existingFranchiseTransactionCodes),
  barangay: z.string().optional(),
  purok: z.string().trim().max(80).optional(),
  contact_number: z
    .string()
    .min(7, "Contact number must be at least 7 characters")
    .optional(),
  tricycle_body_number: z.string().min(1).optional(),
  plate_number: z.string().min(1).optional(),
  route: z.string().min(1).optional(),
  make: z.string().trim().max(60).optional(),
  day_off: z.string().trim().max(60).optional(),
  association_id: z.string().uuid().optional().or(z.literal("")),
  due_date: z.string().optional(),
  // Staged, not applied — mtop.grant_franchise() applies these to the
  // franchise only once the transaction is actually granted. See
  // replace_unit / transfer_owner in 20260413000015_grant_effects.sql.
  new_motor_number: z.string().trim().optional(),
  new_chassis_number: z.string().trim().optional(),
  new_plate_number: z.string().trim().optional(),
  // The successor's name, in parts; composed into new_applicant_name by the
  // server action.
  new_last_name: namePartSchema(60).optional(),
  new_first_name: namePartSchema(60).optional(),
  new_middle_name: namePartSchema(60).optional(),
  new_suffix: namePartSchema(10).optional(),
  new_barangay: z.string().optional(),
  new_purok: z.string().trim().max(80).optional(),
  new_contact_number: z.string().trim().optional(),
  // Required for the transactions in reasonRequiredCodes; ignored elsewhere.
  reason: z.string().trim().max(1000, "Reason is too long").optional(),
})

// Transactions where the operator's stated reason goes on file — why the
// permit is being reprinted, why the franchise is closing, why the slip is
// being asked for.
export const reasonRequiredCodes = [
  "reissuance",
  "closure",
  "annual_confirmation",
] as const satisfies readonly (typeof existingFranchiseTransactionCodes)[number][]

export function requiresReason(code: string): boolean {
  return (reasonRequiredCodes as readonly string[]).includes(code)
}

export const franchiseTransactionSchema = franchiseTransactionBaseSchema.superRefine(
  (data, ctx) => {
    if (requiresReason(data.transaction_type_code) && !data.reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "State the reason for this transaction",
      })
    }

    if (data.transaction_type_code === "change_unit") {
      if (!data.new_motor_number) {
        ctx.addIssue({
          code: "custom",
          path: ["new_motor_number"],
          message: "New motor number is required for a change of unit",
        })
      }
      if (!data.new_chassis_number) {
        ctx.addIssue({
          code: "custom",
          path: ["new_chassis_number"],
          message: "New chassis number is required for a change of unit",
        })
      }
    }

    if (data.transaction_type_code === "change_ownership") {
      if (!data.new_last_name) {
        ctx.addIssue({
          code: "custom",
          path: ["new_last_name"],
          message: "The new owner's last name is required",
        })
      }
      if (!data.new_first_name) {
        ctx.addIssue({
          code: "custom",
          path: ["new_first_name"],
          message: "The new owner's first name is required",
        })
      }
    }

    // The successor's barangay is what the franchise ends up carrying once the
    // transfer is granted, so it is as required here as it is on a new
    // franchise — otherwise the record keeps the previous owner's address.
    if (
      data.transaction_type_code === "change_ownership" &&
      !data.new_barangay
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["new_barangay"],
        message: "Select the new owner's barangay",
      })
    }
  }
)

export type FranchiseTransactionFormValues = z.infer<
  typeof franchiseTransactionSchema
>

// Inspection schema
export const inspectionSchema = z.object({
  clean_windshields: z.boolean(),
  garbage_receptacle: z.boolean(),
  functioning_horn: z.boolean(),
  signal_lights: z.boolean(),
  tail_light: z.boolean(),
  top_chain: z.boolean(),
  headlights_taillights: z.boolean(),
  sidecar_light: z.boolean(),
  anti_noise_equipment: z.boolean(),
  body_number_sticker: z.boolean(),
  functional_mufflers: z.boolean(),
  road_worthiness: z.boolean(),
  remarks: z.string().optional(),
})

export type InspectionFormValues = z.infer<typeof inspectionSchema>

// Assessment schema
export const assessmentSchema = z.object({
  filing_fee: z.coerce.number().min(0),
  supervision_fee: z.coerce.number().min(0),
  confirmation_fee: z.coerce.number().min(0),
  mayors_permit_fee: z.coerce.number().min(0),
  franchise_fee: z.coerce.number().min(0),
  police_clearance_fee: z.coerce.number().min(0),
  health_fee: z.coerce.number().min(0),
  legal_research_fee: z.coerce.number().min(0),
  parking_fee: z.coerce.number().min(0),
  late_renewal_penalty: z.coerce.number().min(0),
  change_of_motor_fee: z.coerce.number().min(0),
  replacement_plate_fee: z.coerce
    .number()
    .refine(
      isValidLostPlateReplacementFee,
      "Replacement of Lost Plate must be ₱0 or ₱500"
    )
    .default(0),
  annual_confirmation_fee: z.coerce.number().min(0).default(0),
  reissuance_fee: z.coerce.number().min(0).default(0),
  // Closure only; default 0 so other transactions don't have to mention them.
  certification_fee: z.coerce.number().min(0).default(0),
  closure_fee: z.coerce.number().min(0).default(0),
})

export type AssessmentFormValues = z.infer<typeof assessmentSchema>

// Payment schema
export const paymentSchema = z.object({
  or_number: z.string().min(1, "OR number is required"),
  // Coerced because <input type="number"> hands react-hook-form a string.
  amount_paid: z.coerce.number().positive("Amount must be greater than 0"),
  payment_date: z.string().optional(),
  payment_method: z.enum(["cash", "check"]),
})

// Input = what the form fields hold pre-coercion; Values = what the action gets.
export type PaymentFormInput = z.input<typeof paymentSchema>
export type PaymentFormValues = z.infer<typeof paymentSchema>

// Status transition remarks
export const statusActionSchema = z.object({
  remarks: z.string().optional(),
})

export const returnActionSchema = z.object({
  remarks: z.string().min(1, "Remarks are required when returning an application"),
})

// System settings schema
export const systemSettingsSchema = z.object({
  permit_validity_years: z.coerce.number().int().min(1).max(10),
  renewal_window_days: z.coerce.number().int().min(1).max(365),
  // Free-form: local numbers are written many ways ((088) 521-1234, 0917-…).
  ctms_contact_number: z
    .string()
    .trim()
    .max(50, "Contact number is too long")
    .default(""),
  // Printed under "APPROVED:" on the confirmation slip.
  mayor_name: z
    .string()
    .trim()
    .max(80, "Name is too long")
    .default(""),
})

export type SystemSettingsFormValues = z.infer<typeof systemSettingsSchema>
