import { cn } from "@/lib/utils"
import { getFranchiseStatusLabel } from "@/lib/utils/franchise-status"
import type { FranchiseStatus } from "@/types/database"

export function FranchiseStatusBadge({
  status,
}: {
  status: FranchiseStatus
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        status === "active"
          ? "bg-green-50 text-green-800 ring-green-200"
          : "bg-slate-100 text-slate-700 ring-slate-200"
      )}
    >
      {getFranchiseStatusLabel(status)}
    </span>
  )
}
