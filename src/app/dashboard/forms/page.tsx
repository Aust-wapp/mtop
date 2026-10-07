import { notFound } from "next/navigation"
import { canViewPrintForms } from "@/lib/actions/print-forms"
import { FormsContent } from "./forms-content"

export default async function FormsPage() {
  if (!(await canViewPrintForms())) notFound()
  return <FormsContent />
}
