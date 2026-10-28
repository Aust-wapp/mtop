import { notFound } from "next/navigation"
import { ChangeUnitCertificate } from "@/components/mtop/transaction-certificate"
import { getGrantedCertificateData } from "@/lib/actions/certificates"
import { PrintControls } from "../../../print-controls"

export default async function PrintChangeUnitCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, error } = await getGrantedCertificateData(id, "change_unit")

  if (!data || data.kind !== "change_unit") {
    if (error) {
      return (
        <main className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-lg font-semibold">
            Certification of Change Unit unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </main>
      )
    }
    notFound()
  }

  return (
    <>
      <PrintControls
        title="Certification of Change Unit"
        subject={data.mtopNumber}
        hint="Print one certificate on A4 paper (portrait), at 100% scale."
      />
      <ChangeUnitCertificate data={data} />
    </>
  )
}
