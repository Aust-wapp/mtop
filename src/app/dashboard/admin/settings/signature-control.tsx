"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateOfficialSignature } from "@/lib/actions/signatures"
import { toast } from "sonner"

export function SignatureControl({ official, label, configured, existingUrl }: {
  official: "mayor" | "city_treasurer"
  label: string
  configured: boolean
  existingUrl: string | null
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  async function save(nextFile: File | null) {
    setBusy(true)
    try {
      const result = await updateOfficialSignature(official, nextFile)
      if (result.error) toast.error(result.error)
      else {
        toast.success(`${label} signature updated`)
        window.location.reload()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update signature.")
    } finally {
      setBusy(false)
    }
  }

  return <div className="space-y-2">
    <label htmlFor={`${official}-signature`} className="text-sm font-medium">{label} signature</label>
    <Input id={`${official}-signature`} type="file" accept="image/png,image/webp" onChange={(event) => {
      const selected = event.target.files?.[0] ?? null
      setFile(selected)
      setPreview(selected ? URL.createObjectURL(selected) : null)
    }} />
    {(preview || existingUrl) && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview || existingUrl || ""} alt={`${label} signature preview`} className="h-16 w-48 object-contain" />
    )}
    <div className="flex gap-2">
      <Button type="button" disabled={!file || busy} onClick={() => save(file)}>Upload signature</Button>
      {configured && <Button type="button" variant="outline" disabled={busy} onClick={() => save(null)}>Remove signature</Button>}
    </div>
    {configured && !preview && <p className="text-xs text-muted-foreground">Signature configured. Select an image to preview and replace it.</p>}
  </div>
}
