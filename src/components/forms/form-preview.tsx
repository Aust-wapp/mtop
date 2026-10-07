"use client"

import Link from "next/link"
import { Download, Printer } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ApplicationPaper } from "@/components/forms/application-forms"
import { PAPER_FORMS, type FormKind } from "@/lib/forms/print-data"

export function FormPreview({ kind }: { kind: FormKind }) {
  const form = PAPER_FORMS[kind]

  return (
    <main className="forms-preview">
      <style>{`@page { size: A4 ${form.orientation}; margin: 0; }`}</style>
      <div className="forms-toolbar">
        <div>
          <strong>{form.title} — Print Preview</strong>
          <p>A4 {form.orientation} · two identical blank forms · print at 100%</p>
        </div>
        <div className="forms-toolbar-actions">
          <Link
            href="/dashboard/forms"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to Forms
          </Link>
          <a
            href={`/api/forms/${kind}/pdf`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" /> Download PDF
          </a>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </div>
      <div className="forms-stage">
        <div
          className={`forms-sheet forms-sheet--${form.orientation}`}
          aria-label="Two blank application forms on one A4 sheet"
        >
          <ApplicationPaper kind={kind} />
          <ApplicationPaper kind={kind} />
        </div>
      </div>
    </main>
  )
}
