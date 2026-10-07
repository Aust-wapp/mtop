import { notFound } from "next/navigation"
import { FormPreview } from "@/components/forms/form-preview"
import { canViewPrintForms } from "@/lib/actions/print-forms"
import { isFormKind } from "@/lib/forms/print-data"
import "../forms.css"

export default async function ApplicationFormPage({
  params,
}: {
  params: Promise<{ kind: string }>
}) {
  const { kind } = await params
  if (!isFormKind(kind)) notFound()
  if (!(await canViewPrintForms())) notFound()
  return <FormPreview kind={kind} />
}
