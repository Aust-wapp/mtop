import { cn } from "@/lib/utils"
import type { PermitExpirationStatus } from "@/lib/utils/permit-expiration"

const expirationConfig: Record<
  PermitExpirationStatus,
  { label: string; dot: string; className: string }
> = {
  active: {
    label: "Active",
    dot: "bg-green-500",
    className: "bg-green-50 text-green-800 ring-1 ring-green-200",
  },
  due_for_renewal: {
    label: "Due for Renewal",
    dot: "bg-amber-500",
    className: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  },
  expired: {
    label: "Expired",
    dot: "bg-red-500",
    className: "bg-red-50 text-red-800 ring-1 ring-red-200",
  },
  abandoned: {
    label: "Abandoned",
    dot: "bg-slate-600",
    className: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
  },
}

export function ExpirationBadge({
  status,
  daysRemaining,
}: {
  status: PermitExpirationStatus
  daysRemaining?: number
}) {
  const config = expirationConfig[status]

  let detail = ""
  if (daysRemaining !== undefined) {
    if (daysRemaining < 0) {
      detail = ` (${Math.abs(daysRemaining)}d ago)`
    } else if (daysRemaining === 0) {
      detail = " (today)"
    } else {
      detail = ` (${daysRemaining}d left)`
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        config.className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
      {config.label}
      {detail}
    </span>
  )
}
