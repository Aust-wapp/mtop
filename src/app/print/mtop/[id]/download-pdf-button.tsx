"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { getFranchiseCardData } from "@/lib/actions/card"
import { refreshCardSignatureImages } from "@/lib/card-pdf-images"

export function DownloadPdfButton({ filename, applicationId }: { filename: string; applicationId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function download() {
    const card = document.querySelector<HTMLElement>(".mtop-card")
    if (!card) return
    setBusy(true)
    setError("")
    try {
      if (card.querySelector('img[alt="City Mayor signature"], img[alt="City Treasurer signature"]')) {
        const refreshed = await getFranchiseCardData(applicationId)
        if (refreshed.error || !refreshed.data) {
          throw new Error(refreshed.error ?? "Could not refresh card signatures.")
        }
        await refreshCardSignatureImages(card, refreshed.data)
      }
      await Promise.all(Array.from(card.querySelectorAll("img")).map(async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve, reject) => {
            image.addEventListener("load", () => resolve(), { once: true })
            image.addEventListener("error", () => reject(new Error("A card image failed to load.")), { once: true })
          })
        }
        if (image.naturalWidth === 0) throw new Error("A card image failed to load.")
      }))
      await document.fonts.ready
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")])
      const canvas = await html2canvas(card, { scale: 2, backgroundColor: "#fff5e5", useCORS: true })
      const pdf = new jsPDF({ unit: "in", format: [8.5, 13], orientation: "portrait" })
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 8.5, 13)
      pdf.save(`${filename}.pdf`)
    } catch (cause) {
      setError((cause as Error).message || "Could not create the PDF.")
    } finally {
      setBusy(false)
    }
  }
  return <div className="flex items-center gap-2">
    {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    <Button type="button" variant="outline" disabled={busy} onClick={download}>{busy ? "Creating PDF…" : "Download PDF"}</Button>
  </div>
}
