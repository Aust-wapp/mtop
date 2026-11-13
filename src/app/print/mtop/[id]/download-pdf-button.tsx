"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export function DownloadPdfButton({ filename }: { filename: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function download() {
    const card = document.querySelector<HTMLElement>(".mtop-card")
    if (!card) return
    setBusy(true)
    setError("")
    try {
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
