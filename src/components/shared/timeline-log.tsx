import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import type { ApprovalAction, MtopStatus } from "@/types/database"
import { getStatusLabel } from "./status-badge"

interface LogEntry {
  id: string
  stage: MtopStatus
  action: ApprovalAction
  remarks: string | null
  created_at: string
  actor?: { id: string; full_name: string } | null
  returned_from?: Extract<MtopStatus, "for_verification" | "for_inspection"> | null
}

const actionColors: Record<ApprovalAction, string> = {
  approved: "bg-green-500",
  forwarded: "bg-blue-500",
  rejected: "bg-red-500",
  returned: "bg-orange-500",
  reopened: "bg-amber-500",
  resubmitted: "bg-blue-500",
}

export function TimelineLog({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity yet.</p>
    )
  }

  return (
    <div className="space-y-4">
      {logs.map((log, index) => (
        <div key={log.id} className="flex gap-3">
          {/* Timeline dot + line */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full mt-1.5 shrink-0",
                actionColors[log.action]
              )}
            />
            {index < logs.length - 1 && (
              <div className="w-px flex-1 bg-border mt-1" />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 min-w-0">
            <p className="text-sm">
              <span className="font-medium">
                {log.actor?.full_name ?? "System"}
              </span>{" "}
              <span className="text-muted-foreground capitalize">
                {log.action}
              </span>{" "}
              <span className="text-muted-foreground">at</span>{" "}
              <span className="font-medium">
                {getStatusLabel(log.stage)}
                {log.action === "returned" && log.returned_from && (
                  <span className="text-muted-foreground font-normal">
                    {` (from ${log.returned_from.replace("for_", "")})`}
                  </span>
                )}
              </span>
            </p>
            {log.remarks && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {log.remarks}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {formatDistanceToNow(new Date(log.created_at), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
