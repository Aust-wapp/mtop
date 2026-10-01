"use client"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

/**
 * The on-screen bar above a printable document: what it is, how to print it,
 * and the button. Hidden from the print itself by `.no-print`.
 */
export function PrintControls({
  title,
  subject,
  hint,
  actions,
}: {
  title: string
  subject?: string
  hint: string
  /** Extra buttons, shown beside Print. */
  actions?: React.ReactNode
}) {
  return (
    <div className="no-print flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
      <div className="text-sm">
        <span className="font-medium">{title}</span>
        {subject && <span className="text-muted-foreground"> — {subject}</span>}
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>
    </div>
  )
}
