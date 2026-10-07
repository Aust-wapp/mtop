import Link from "next/link"
import { FileText } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { FORM_KINDS, PAPER_FORMS } from "@/lib/forms/print-data"

export function FormsContent() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Print Forms"
        subtitle="Blank applications for applicants to complete by hand. Each A4 sheet contains two copies."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {FORM_KINDS.map((kind) => {
          const form = PAPER_FORMS[kind]
          return (
            <article
              key={kind}
              className="flex flex-col rounded-lg border bg-card p-5"
            >
              <FileText className="mb-3 size-5 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">{form.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{form.description}</p>
              <Link
                href={`/print/forms/${kind}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonVariants({ size: "sm" })} mt-5 self-start`}
              >
                Preview / Open Form
              </Link>
            </article>
          )
        })}
      </div>
    </div>
  )
}
