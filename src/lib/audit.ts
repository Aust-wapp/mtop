/**
 * Presentation rules for the audit trail.
 *
 * The trigger in 20260413000019_audit_trail.sql logs raw column names and raw
 * values, because that is what a trustworthy audit record is. Everything that
 * turns `{"driver_license_number": {"old": null, "new": "N01-23-456789"}}`
 * into a line a clerk can read lives here — pure, so the server action and the
 * client timeline can both use it.
 */

import { format } from "date-fns"

/**
 * Which part of the record a column belongs to. The ordinance treats the
 * operator and the driver as separate people with separate histories, so the
 * timeline can be filtered down to one of them.
 */
export type AuditFieldGroup = "operator" | "driver" | "unit" | "franchise"

export const auditGroupLabels: Record<AuditFieldGroup, string> = {
  operator: "Operator",
  driver: "Driver",
  unit: "Unit",
  franchise: "Franchise",
}

type FieldKind = "text" | "date" | "photo" | "association" | "status"

interface AuditFieldMeta {
  label: string
  group: AuditFieldGroup
  kind: FieldKind
}

/**
 * Columns of mtop.mtop_franchises. Anything missing here still renders — see
 * auditFieldMeta() — so adding a column to the table doesn't break the
 * timeline, it just shows up under a humanised version of its own name.
 */
const franchiseFields: Record<string, AuditFieldMeta> = {
  mtop_number: { label: "MTOP number", group: "franchise", kind: "text" },
  franchise_status: { label: "Franchise status", group: "franchise", kind: "status" },
  granted_until: { label: "Renewal due date", group: "franchise", kind: "date" },
  closed_at: { label: "Closed", group: "franchise", kind: "date" },
  last_confirmed_at: { label: "Last annual confirmation", group: "franchise", kind: "date" },
  last_reissued_at: { label: "Last re-issuance", group: "franchise", kind: "date" },
  association_id: { label: "Association", group: "franchise", kind: "association" },
  route: { label: "Route", group: "franchise", kind: "text" },

  applicant_name: { label: "Operator", group: "operator", kind: "text" },
  last_name: { label: "Operator last name", group: "operator", kind: "text" },
  first_name: { label: "Operator first name", group: "operator", kind: "text" },
  middle_name: { label: "Operator middle name", group: "operator", kind: "text" },
  suffix: { label: "Operator name suffix", group: "operator", kind: "text" },
  applicant_address: { label: "Operator address", group: "operator", kind: "text" },
  barangay: { label: "Barangay", group: "operator", kind: "text" },
  purok: { label: "Purok", group: "operator", kind: "text" },
  contact_number: { label: "Contact number", group: "operator", kind: "text" },
  owner_photo_url: { label: "Operator photo", group: "operator", kind: "photo" },

  driver_name: { label: "Driver", group: "driver", kind: "text" },
  driver_license_number: { label: "Driver's licence number", group: "driver", kind: "text" },
  driver_address: { label: "Driver address", group: "driver", kind: "text" },
  driver_photo_url: { label: "Driver photo", group: "driver", kind: "photo" },

  motor_number: { label: "Motor number", group: "unit", kind: "text" },
  chassis_number: { label: "Chassis number", group: "unit", kind: "text" },
  plate_number: { label: "Plate number", group: "unit", kind: "text" },
  tricycle_body_number: { label: "Body number", group: "unit", kind: "text" },
  make: { label: "Make", group: "unit", kind: "text" },
  day_off: { label: "Day off", group: "unit", kind: "text" },
}

export function auditFieldMeta(column: string): AuditFieldMeta {
  return (
    franchiseFields[column] ?? {
      label: column.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      group: "franchise",
      kind: "text",
    }
  )
}

/** Renders one side of a change. Empty values read as an em dash, not "null". */
export function formatAuditValue(
  column: string,
  value: unknown,
  associationNames: Record<string, string> = {}
): string {
  if (value === null || value === undefined || value === "") return "—"

  const { kind } = auditFieldMeta(column)

  switch (kind) {
    case "date": {
      const parsed = new Date(String(value))
      return Number.isNaN(parsed.getTime())
        ? String(value)
        : format(parsed, "MMM d, yyyy")
    }
    // A storage URL is 150 characters of noise; that a photo was put there is
    // the auditable fact, and the photo itself is on the franchise card.
    case "photo":
      return "Photo on file"
    case "association":
      return associationNames[String(value)] ?? "Unknown association"
    case "status":
      return String(value).replace(/_/g, " ")
    default:
      return String(value)
  }
}

/** One field that moved, ready to render. */
export interface HistoryChange {
  column: string
  label: string
  group: AuditFieldGroup
  from: string
  to: string
}

export type HistoryEventKind =
  | "registered"
  | "change"
  | "unit_change"
  | "ownership_change"
  | "filed"
  | "approval"

/**
 * A single line in a franchise's history, whatever table it came from. The
 * audit log, the two grant-time history tables, the applications themselves
 * and their approval logs all collapse into this one shape so the timeline
 * can show them interleaved in true chronological order.
 */
export interface FranchiseHistoryEvent {
  id: string
  kind: HistoryEventKind
  at: string
  /** Full name of whoever did it, or null when it was a system/service write. */
  actor: string | null
  title: string
  subtitle: string | null
  remarks: string | null
  applicationId: string | null
  changes: HistoryChange[]
  /** Groups touched, so the timeline's Operator / Driver filters can match. */
  groups: AuditFieldGroup[]
}

export const historyEventColors: Record<HistoryEventKind, string> = {
  registered: "bg-emerald-500",
  change: "bg-slate-400",
  unit_change: "bg-amber-500",
  ownership_change: "bg-purple-500",
  filed: "bg-blue-500",
  approval: "bg-green-500",
}
