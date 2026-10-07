import type { TransactionTypeCode } from "@/types/database"

export const FORM_KINDS = [
  "new-franchise",
  "renewal",
  "change-ownership",
  "change-unit",
  "closure",
  "annual-confirmation",
  "reissuance",
] as const

export type FormKind = (typeof FORM_KINDS)[number]

export interface PaperField {
  label: string
  wide?: boolean
}

export interface PaperBox {
  title: string
  rows: PaperField[][]
}

export type PaperSection =
  | { kind: "box"; box: PaperBox }
  | { kind: "paired-boxes"; boxes: [PaperBox, PaperBox] }
  | { kind: "reason"; choices: string[]; lines: number }
export interface PaperFormConfig {
  title: string
  orientation: "portrait" | "landscape"
  description: string
  sections: PaperSection[]
  declaration?: boolean
  payment?: boolean
}

const field = (label: string, wide = false): PaperField => ({ label, wide })
const box = (title: string, rows: PaperField[][]): PaperSection => ({
  kind: "box",
  box: { title, rows },
})

const ownerDetails = box("Registered Owner / Operator", [
  [field("Full Name", true), field("Contact No.")],
  [field("Barangay / Address", true), field("Purok")],
])

// Driver identity is retained from the office form. Staff maintains these
// fields later on the franchise card, outside application filing.
const driverDetails = box("Driver", [
  [field("Driver Name", true), field("Driver's License No.")],
  [field("Driver Address", true)],
])

const existingUnit = box("Unit Described as Follows", [
  [field("MTOP No."), field("Body / Cab No."), field("Plate No.")],
  [field("Motor / Engine No."), field("Chassis No.")],
  [field("Make"), field("Day Off"), field("Due Date")],
  [field("Association", true), field("Route", true)],
])

export const PAPER_FORMS: Record<FormKind, PaperFormConfig> = {
  "new-franchise": {
    title: "New Franchise", orientation: "portrait",
    description: "New operator, driver and tricycle application.", declaration: true,
    sections: [ownerDetails, driverDetails, box("Unit Described as Follows", [
      [field("Body / Cab No."), field("Plate No.")],
      [field("Motor / Engine No."), field("Chassis No.")],
      [field("Make"), field("Day Off")],
      [field("Association", true), field("Route", true)],
    ])],
  },
  renewal: {
    title: "Renewal of Franchise", orientation: "portrait",
    description: "Renew an existing franchise with owner, driver and unit details.", declaration: true,
    sections: [ownerDetails, driverDetails, existingUnit],
  },
  "change-ownership": {
    title: "Change of Ownership", orientation: "portrait",
    description: "Current and incoming owners with the unit on file.", declaration: true,
    sections: [
      { kind: "paired-boxes", boxes: [
        { title: "Current Owner", rows: [[field("Full Name")], [field("Contact No.")]] },
        { title: "New Owner", rows: [[field("Full Name")], [field("Barangay / Address")], [field("Purok"), field("Contact No.")]] },
      ] },
      existingUnit,
    ],
  },
  "change-unit": {
    title: "Motor Vehicle Change Unit", orientation: "portrait",
    description: "Old and replacement unit details side by side.", declaration: true,
    sections: [
      box("Franchise / Operator", [
        [field("MTOP No."), field("Current Owner", true)],
        [field("Barangay / Address", true), field("Contact No.")],
      ]),
      { kind: "paired-boxes", boxes: [
        { title: "Old / Current Unit", rows: [
          [field("Motor No.")], [field("Chassis No.")], [field("Plate No.")],
          [field("Current Body / Cab No.")],
        ] },
        { title: "New / Replacement Unit", rows: [
          [field("New Motor No.")], [field("New Chassis No.")],
          [field("New Plate No.")],
        ] },
      ] },
      box("Details to Confirm or Update", [
        [field("Body / Cab No."), field("Make"), field("Day Off")],
        [field("Purok"), field("Association"), field("Due Date")],
        [field("Route", true)],
      ]),
    ],
  },
  closure: {
    title: "Closure of Franchise", orientation: "portrait",
    description: "Closure request with reason and unit description.",
    sections: [
      box("Franchise / Registered Owner", [
        [field("MTOP No."), field("Body / Cab No.")],
        [field("Registered Owner", true), field("Contact No.")],
        [field("Barangay / Address", true), field("Purok")],
      ]),
      { kind: "reason", choices: ["BIR Clearance", "LTO / Change Classification", "Others"], lines: 2 },
      box("Unit Description", [
        [field("Plate No."), field("Make"), field("Route")],
        [field("Motor / Engine No."), field("Chassis No.")],
        [field("Day Off"), field("Association", true), field("Due Date")],
      ]),
    ],
  },
  "annual-confirmation": {
    title: "Confirmation Slip", orientation: "portrait",
    description: "Blank annual confirmation application, separate from the issued slip.", payment: true,
    sections: [
      box("Application / Registered Owner", [
        [field("MTOP No.")],
        [field("Registered Owner", true), field("Contact No.")],
        [field("Barangay / Address", true), field("Purok")],
      ]),
      { kind: "reason", choices: ["BIR Clearance", "Renew Expired LTO O.R.", "Others"], lines: 2 },
      box("Unit Description", [
        [field("Body / Cab No."), field("Plate No."), field("Route")],
        [field("Motor / Engine No."), field("Chassis No.")],
        [field("Make"), field("Day Off"), field("Association"), field("Due Date")],
      ]),
    ],
  },
  reissuance: {
    title: "Re-Issuance of Franchise", orientation: "portrait",
    description: "Replacement franchise document request.", payment: true,
    sections: [
      box("Franchise / Requester", [
        [field("MTOP No.")],
        [field("Requester / Owner", true), field("Contact No.")],
        [field("Barangay / Address", true), field("Purok")],
      ]),
      { kind: "reason", choices: ["Closure", "LTO Clearance", "BIR Clearance", "Others"], lines: 2 },
      box("Unit Described as Follows", [
        [field("Body / Cab No."), field("Plate No."), field("Route")],
        [field("Motor / Engine No."), field("Chassis No.")],
        [field("Make"), field("Day Off"), field("Association"), field("Due Date")],
      ]),
    ],
  },
}

export const FORM_FOR_TRANSACTION: Partial<Record<TransactionTypeCode, FormKind>> = {
  new_franchise: "new-franchise",
  renewal: "renewal",
  change_ownership: "change-ownership",
  change_unit: "change-unit",
  closure: "closure",
  annual_confirmation: "annual-confirmation",
  reissuance: "reissuance",
}

export function isFormKind(value: string): value is FormKind {
  return FORM_KINDS.some((kind) => kind === value)
}
