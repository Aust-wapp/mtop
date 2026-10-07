"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Saves the sheet on screen as an A4 PDF, without going through the browser's
 * print dialog.
 *
 * The sheet is photographed at 4x and placed on the page as one image: the
 * forms are blank, so there is no text to select or search, and what matters
 * is that the PDF looks exactly like the preview. The libraries are loaded on
 * click, so the print page does not carry them until someone asks for a PDF.
 */
export function DownloadPdfButton({ filename }: { filename: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    const sheet = document.querySelector<HTMLElement>(".mtop-form-sheet")
    if (!sheet) return

    setBusy(true)
    setError(null)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ])

      const canvas = await html2canvas(sheet, {
        scale: 4,
        backgroundColor: "#ffffff",
        useCORS: true,
      })

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
      const width = pdf.internal.pageSize.getWidth()
      const height = (canvas.height / canvas.width) * width
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, width, height)
      pdf.save(`${filename}.pdf`)
    } catch (e) {
      setError((e as Error).message || "Could not create the PDF.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button variant="outline" onClick={download} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download PDF
      </Button>
    </div>
  )
}
