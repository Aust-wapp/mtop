import { notFound } from "next/navigation"
import localFont from "next/font/local"
import { getFranchiseCardData } from "@/lib/actions/card"
import { FranchiseCard } from "@/components/mtop/franchise-card"
import { PrintControls } from "../../print-controls"
import { DownloadPdfButton } from "./download-pdf-button"

// The permit's own typography, independent of the app's Plus Jakarta Sans.
// Self-hosted from src/app/fonts — see that folder's README for why.
// Declared as the files' real weight ranges: Oswald and Playfair ship as
// variable fonts, so one file covers every weight the card asks for.
const oswald = localFont({
  src: "../../../fonts/Oswald-Variable.woff2",
  weight: "200 700",
  display: "swap",
  variable: "--card-oswald",
})
const playfair = localFont({
  src: "../../../fonts/PlayfairDisplay-Variable.woff2",
  weight: "400 900",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  variable: "--card-playfair",
})
const poppins = localFont({
  src: [
    { path: "../../../fonts/Poppins-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../../fonts/Poppins-Italic.woff2", weight: "400", style: "italic" },
    { path: "../../../fonts/Poppins-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../../fonts/Poppins-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
  display: "swap",
  variable: "--card-poppins",
})

export default async function PrintMtopCardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, error } = await getFranchiseCardData(id)

  if (!data) {
    if (error) {
      return (
        <main className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-lg font-semibold">Franchise Card unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </main>
      )
    }
    notFound()
  }

  return (
    <main
      className={`${oswald.variable} ${playfair.variable} ${poppins.variable} print-card-page`}
    >
      <PrintControls
        title="Franchise Card"
        subject={data.mtopNumber}
        actions={<DownloadPdfButton filename={`MTOP-${data.mtopNumber || id}`} applicationId={id} />}
        hint="Print on 8.5 × 13 in (long bond) at 100% scale, background graphics on."
      />
      <div className="card-stage">
        <FranchiseCard data={data} />
      </div>
    </main>
  )
}
