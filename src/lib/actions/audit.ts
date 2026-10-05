"use server"

import { createClient } from "@/lib/supabase/server"
import { getStatusLabel } from "@/components/shared/status-badge"
import {
  auditFieldMeta,
  formatAuditValue,
  type AuditFieldGroup,
  type FranchiseHistoryEvent,
  type HistoryChange,
  type HistoryEventKind,
} from "@/lib/audit"
import type { ApprovalAction, MtopStatus } from "@/types/database"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

type AuditChanges = Record<string, { old: unknown; new: unknown }>

type ActorRef = { full_name: string | null } | null

function actorName(actor: ActorRef | ActorRef[]): string | null {
  // PostgREST hands back an object for a to-one embed, but the generated
  // types widen it to an array often enough that both are worth handling.
  const one = Array.isArray(actor) ? actor[0] : actor
  return one?.full_name ?? null
}

/**
 * Turns one audit row's `changes` object into rendered before/after lines,
 * dropping any column the timeline has no business showing.
 */
function toChanges(
  changes: AuditChanges,
  associationNames: Record<string, string>
): HistoryChange[] {
  return Object.entries(changes ?? {}).map(([column, pair]) => {
    const meta = auditFieldMeta(column)
    return {
      column,
      label: meta.label,
      group: meta.group,
      from: formatAuditValue(column, pair?.old, associationNames),
      to: formatAuditValue(column, pair?.new, associationNames),
    }
  })
}

function groupsOf(changes: HistoryChange[]): AuditFieldGroup[] {
  return [...new Set(changes.map((c) => c.group))]
}

/**
 * Titles a plain column-level edit by what it touched, so the timeline reads
 * "Driver details updated" rather than "mtop_franchises updated".
 */
function changeTitle(groups: AuditFieldGroup[]): string {
  if (groups.length !== 1) return "Franchise record updated"
  switch (groups[0]) {
    case "driver":
      return "Driver details updated"
    case "operator":
      return "Operator details updated"
    case "unit":
      return "Unit details updated"
    default:
      return "Franchise record updated"
  }
}

/**
 * Everything that has ever happened to one franchise, newest first.
 *
 * Five sources are merged, because no single table holds the whole story:
 *
 *   mtop.audit_logs                    every column change, from the trigger
 *   mtop.franchise_unit_history        unit replacements, tied to their application
 *   mtop.franchise_ownership_history   ownership transfers, likewise
 *   mtop.mtop_applications             transactions filed against the franchise
 *   mtop.approval_logs                 each stage those transactions passed
 *
 * The audit log overlaps the two history tables on purpose — the history rows
 * name the application that authorised the change, which the trigger can't
 * know — so both are shown, the richer one first at the same timestamp.
 */
export async function getFranchiseHistory(
  franchiseId: string,
  limit?: number
): Promise<{ error: string | null; data: FranchiseHistoryEvent[] }> {
  try {
    const { supabase } = await getAuthUser()

    const [franchiseRes, auditRes, unitRes, ownerRes, appsRes] =
      await Promise.all([
        supabase
          .schema("mtop")
          .from("mtop_franchises")
          .select(
            "id, created_at, applicant_name, creator:user_profiles!created_by(full_name)"
          )
          .eq("id", franchiseId)
          .maybeSingle(),
        supabase
          .schema("mtop")
          .from("audit_logs")
          .select(
            "id, action, changes, created_at, actor:user_profiles!actor_id(full_name)"
          )
          .eq("franchise_id", franchiseId)
          .order("created_at", { ascending: false }),
        supabase
          .schema("mtop")
          .from("franchise_unit_history")
          .select("*, changer:user_profiles!changed_by(full_name)")
          .eq("franchise_id", franchiseId),
        supabase
          .schema("mtop")
          .from("franchise_ownership_history")
          .select("*, changer:user_profiles!changed_by(full_name)")
          .eq("franchise_id", franchiseId),
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select(
            "id, status, submitted_at, transaction_type:transaction_types(name), creator:user_profiles!created_by(full_name)"
          )
          .eq("franchise_id", franchiseId)
          .order("submitted_at", { ascending: false }),
      ])

    if (franchiseRes.error) return { error: franchiseRes.error.message, data: [] }
    if (!franchiseRes.data) return { error: "Franchise not found.", data: [] }
    if (auditRes.error) return { error: auditRes.error.message, data: [] }
    if (unitRes.error) return { error: unitRes.error.message, data: [] }
    if (ownerRes.error) return { error: ownerRes.error.message, data: [] }
    if (appsRes.error) return { error: appsRes.error.message, data: [] }

    const applications = (appsRes.data ?? []) as unknown as {
      id: string
      status: MtopStatus
      submitted_at: string
      transaction_type: { name: string } | { name: string }[] | null
      creator: ActorRef | ActorRef[]
    }[]

    // Approval logs are fetched per franchise in one go rather than per
    // application, so a franchise with a decade of renewals is still two
    // round trips instead of twenty.
    const applicationIds = applications.map((a) => a.id)
    const { data: logs, error: logsError } = applicationIds.length
      ? await supabase
          .schema("mtop")
          .from("approval_logs")
          .select(
            "id, application_id, stage, action, remarks, created_at, actor:user_profiles!actor_id(full_name)"
          )
          .in("application_id", applicationIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null }

    if (logsError) return { error: logsError.message, data: [] }

    // association_id changes are logged as raw uuids; resolve them in one
    // query so the timeline can name the association that was joined or left.
    const auditRows = (auditRes.data ?? []) as unknown as {
      id: string
      action: "insert" | "update" | "delete"
      changes: AuditChanges
      created_at: string
      actor: ActorRef | ActorRef[]
    }[]

    const associationIds = new Set<string>()
    for (const row of auditRows) {
      const pair = row.changes?.association_id
      if (!pair) continue
      if (typeof pair.old === "string") associationIds.add(pair.old)
      if (typeof pair.new === "string") associationIds.add(pair.new)
    }

    const associationNames: Record<string, string> = {}
    if (associationIds.size > 0) {
      const { data: associations, error: associationsError } = await supabase
        .schema("mtop")
        .from("associations")
        .select("id, name")
        .in("id", [...associationIds])
      if (associationsError) {
        return { error: associationsError.message, data: [] }
      }
      for (const a of (associations ?? []) as { id: string; name: string }[]) {
        associationNames[a.id] = a.name
      }
    }

    const events: FranchiseHistoryEvent[] = []

    for (const row of auditRows) {
      const changes = toChanges(row.changes, associationNames)
      const groups = groupsOf(changes)
      events.push({
        id: `audit:${row.id}`,
        kind: row.action === "insert" ? "registered" : "change",
        at: row.created_at,
        actor: actorName(row.actor),
        title:
          row.action === "insert"
            ? "Franchise registered"
            : row.action === "delete"
              ? "Franchise record deleted"
              : changeTitle(groups),
        subtitle: null,
        remarks: null,
        applicationId: null,
        changes,
        groups,
      })
    }

    // Franchises created before the audit trigger existed have no 'insert'
    // row. Their registration is still a real event, so it's read off the
    // franchise itself — and only when the trigger didn't already log one.
    if (!auditRows.some((r) => r.action === "insert")) {
      const franchise = franchiseRes.data as unknown as {
        created_at: string
        applicant_name: string
        creator: ActorRef | ActorRef[]
      }
      events.push({
        id: `franchise:${franchiseId}`,
        kind: "registered",
        at: franchise.created_at,
        actor: actorName(franchise.creator),
        title: "Franchise registered",
        subtitle: franchise.applicant_name,
        remarks: null,
        applicationId: null,
        changes: [],
        groups: ["franchise"],
      })
    }

    for (const row of (unitRes.data ?? []) as unknown as {
      id: string
      application_id: string | null
      changed_at: string
      previous_motor_number: string | null
      previous_chassis_number: string | null
      previous_plate_number: string | null
      new_motor_number: string
      new_chassis_number: string
      new_plate_number: string | null
      changer: ActorRef | ActorRef[]
    }[]) {
      events.push({
        id: `unit:${row.id}`,
        kind: "unit_change",
        at: row.changed_at,
        actor: actorName(row.changer),
        title: "Unit replaced",
        subtitle: "Granted change of unit",
        remarks: null,
        applicationId: row.application_id,
        changes: [
          ["motor_number", row.previous_motor_number, row.new_motor_number],
          ["chassis_number", row.previous_chassis_number, row.new_chassis_number],
          ["plate_number", row.previous_plate_number, row.new_plate_number],
        ].map(([column, from, to]) => ({
          column: column as string,
          label: auditFieldMeta(column as string).label,
          group: "unit" as const,
          from: formatAuditValue(column as string, from),
          to: formatAuditValue(column as string, to),
        })),
        groups: ["unit"],
      })
    }

    for (const row of (ownerRes.data ?? []) as unknown as {
      id: string
      application_id: string | null
      changed_at: string
      previous_applicant_name: string
      previous_applicant_address: string | null
      previous_contact_number: string | null
      new_applicant_name: string
      new_applicant_address: string | null
      new_contact_number: string | null
      changer: ActorRef | ActorRef[]
    }[]) {
      events.push({
        id: `owner:${row.id}`,
        kind: "ownership_change",
        at: row.changed_at,
        actor: actorName(row.changer),
        title: "Ownership transferred",
        subtitle: `${row.previous_applicant_name} → ${row.new_applicant_name}`,
        remarks: null,
        applicationId: row.application_id,
        changes: [
          ["applicant_name", row.previous_applicant_name, row.new_applicant_name],
          [
            "applicant_address",
            row.previous_applicant_address,
            row.new_applicant_address,
          ],
          ["contact_number", row.previous_contact_number, row.new_contact_number],
        ].map(([column, from, to]) => ({
          column: column as string,
          label: auditFieldMeta(column as string).label,
          group: "operator" as const,
          from: formatAuditValue(column as string, from),
          to: formatAuditValue(column as string, to),
        })),
        groups: ["operator"],
      })
    }

    for (const app of applications) {
      const type = Array.isArray(app.transaction_type)
        ? app.transaction_type[0]
        : app.transaction_type
      events.push({
        id: `app:${app.id}`,
        kind: "filed",
        at: app.submitted_at,
        actor: actorName(app.creator),
        title: `${type?.name ?? "Transaction"} filed`,
        subtitle: getStatusLabel(app.status),
        remarks: null,
        applicationId: app.id,
        changes: [],
        groups: ["franchise"],
      })
    }

    for (const log of (logs ?? []) as unknown as {
      id: string
      application_id: string
      stage: MtopStatus
      action: ApprovalAction
      remarks: string | null
      created_at: string
      actor: ActorRef | ActorRef[]
    }[]) {
      events.push({
        id: `log:${log.id}`,
        kind: "approval",
        at: log.created_at,
        actor: actorName(log.actor),
        title: `${log.action[0].toUpperCase()}${log.action.slice(1)} at ${getStatusLabel(log.stage)}`,
        subtitle: null,
        remarks: log.remarks,
        applicationId: log.application_id,
        changes: [],
        groups: ["franchise"],
      })
    }

    // Newest first. Grant-time rows share a timestamp with the audit rows the
    // same transaction produced, so the richer, application-linked event is
    // ordered ahead of the bare column diff.
    const kindRank: Record<HistoryEventKind, number> = {
      approval: 0,
      ownership_change: 1,
      unit_change: 2,
      filed: 3,
      change: 4,
      registered: 5,
    }
    events.sort((a, b) => {
      const byTime = new Date(b.at).getTime() - new Date(a.at).getTime()
      return byTime !== 0 ? byTime : kindRank[a.kind] - kindRank[b.kind]
    })

    return { error: null, data: limit ? events.slice(0, limit) : events }
  } catch (e) {
    return { error: (e as Error).message, data: [] }
  }
}
