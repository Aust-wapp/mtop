import { cn } from "@/lib/utils"
import { Check } from "lucide-react"
import type { MtopStatus } from "@/types/database"

const STAGES: { key: MtopStatus; label: string }[] = [
  { key: "for_verification", label: "Verification" },
  { key: "for_inspection", label: "Inspection" },
  { key: "for_assessment", label: "Assessment" },
  { key: "for_approval", label: "Approval" },
  { key: "granted", label: "Granted" },
]

const stageOrder: Record<string, number> = {
  for_verification: 0,
  for_inspection: 1,
  for_assessment: 2,
  for_approval: 3,
  granted: 4,
}

export function ApprovalStepper({ status }: { status: MtopStatus }) {
  const currentIndex = stageOrder[status] ?? -1
  const isTerminal = status === "rejected"
  const isReturned = status === "returned"

  return (
    <div className="space-y-1">
      {STAGES.map((stage, index) => {
        const isCompleted = currentIndex > index
        const isCurrent = currentIndex === index && !isTerminal
        const isUpcoming = currentIndex < index || isTerminal || isReturned

        return (
          <div key={stage.key} className="flex items-center gap-3">
            {/* Step indicator */}
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium",
                isCompleted &&
                  "border-green-600 bg-green-600 text-white",
                isCurrent &&
                  "border-primary bg-primary text-primary-foreground",
                isUpcoming &&
                  "border-muted-foreground/30 text-muted-foreground/50"
              )}
            >
              {isCompleted ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                index + 1
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                "text-sm",
                isCompleted && "font-medium text-foreground",
                isCurrent && "font-semibold text-foreground",
                isUpcoming && "text-muted-foreground"
              )}
            >
              {stage.label}
            </span>
          </div>
        )
      })}

      {/* Terminal status indicator */}
      {isReturned && (
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-amber-600 bg-amber-600 text-white text-xs font-medium">
            !
          </div>
          <span className="text-sm font-semibold text-amber-700">
            Returned — Re-open for Verification
          </span>
        </div>
      )}

      {isTerminal && (
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-red-600 bg-red-600 text-white text-xs font-medium">
            !
          </div>
          <span className="text-sm font-semibold text-red-600 capitalize">
            Rejected
          </span>
        </div>
      )}
    </div>
  )
}
