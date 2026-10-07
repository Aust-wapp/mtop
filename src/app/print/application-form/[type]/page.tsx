import { notFound } from "next/navigation"
import {
  APPLICATION_FORM_TITLES,
  APPLICATION_FORM_TYPES,
  ApplicationFormSheet,
  type ApplicationFormType,
} from "@/components/mtop/application-form-sheet"
import { PrintControls } from "../../print-controls"
import { DownloadPdfButton } from "./download-pdf-button"
import { isAdmin } from "@/lib/require-admin"

/**
 * This route prints on A4 in portrait, not the 8.5 x 13in the rest of /print
 * uses. `@page` is document-wide, so it is restated here,
 * after print.css, rather than changed there.
 */
const SHEET_CSS = `
  .mtop-form-sheet {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-shadow: 0 8px 32px rgb(0 0 0 / 45%);
  }
  @media print {
    @page { size: A4 portrait; margin: 0; }
    .mtop-form-sheet { box-shadow: none; break-inside: avoid; }
  }
`

export default async function PrintApplicationFormPage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params

  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-lg font-semibold">Printable Forms unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only an administrator can print these forms.
        </p>
      </main>
    )
  }

  if (!(APPLICATION_FORM_TYPES as readonly string[]).includes(type)) notFound()

  const title = APPLICATION_FORM_TITLES.find((f) => f.type === type)!.title

  return (
    <main className="print-card-page">
      <style>{SHEET_CSS}</style>
      <PrintControls
        title="Application Form"
        subject={title}
        hint="One form to a sheet. Print on A4, portrait, at 100% scale, margins none, background graphics on."
        actions={<DownloadPdfButton filename={`printable-form-${type}`} />}
      />
      <div className="card-stage">
        <ApplicationFormSheet type={type as ApplicationFormType} />
      </div>
    </main>
  )
}
