import { notFound } from "next/navigation"
import { ClosureCertificate } from "@/components/mtop/transaction-certificate"
import { getGrantedCertificateData } from "@/lib/actions/certificates"
import { PrintControls } from "../../../print-controls"

export default async function PrintClosureCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, error } = await getGrantedCertificateData(id, "closure")

  if (!data || data.kind !== "closure") {
    if (error) {
      return (
        <main className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-lg font-semibold">
            Certification of Closure unavailable
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
        title="Certification of Closure"
        subject={data.mtopNumber}
        hint="Print one certificate on A4 paper (portrait), at 100% scale."
      />
      <ClosureCertificate data={data} />
    </>
  )
}
