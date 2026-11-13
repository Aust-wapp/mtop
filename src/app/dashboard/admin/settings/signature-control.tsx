"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateOfficialSignature } from "@/lib/actions/signatures"
import { toast } from "sonner"

export function SignatureControl({ official, label, configured, existingUrl, name, designation }: {
  official: "mayor" | "city_treasurer"
  label: string
  configured: boolean
  existingUrl: string | null
  name: string
  designation: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    <Input ref={fileInputRef} id={`${official}-signature`} type="file"
      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
      aria-describedby={`${official}-signature-hint`} onChange={(event) => {
      const selected = event.target.files?.[0] ?? null
      setFile(selected)
      setPreview(selected ? URL.createObjectURL(selected) : null)
    }} />
    <p id={`${official}-signature-hint`} className="text-xs text-muted-foreground">PNG, JPG/JPEG, or WebP, up to 2 MB and 3000 × 1000 pixels. JPEG uploads are converted to WebP; a white JPG background remains visible.</p>
    <div role="region" aria-label={`${label} signatory block preview`} className="rounded-md border bg-[#fff5e5] px-4 py-5 text-center text-foreground">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Franchise Card signatory preview</p>
      <div className="mx-auto flex h-16 max-w-56 items-center justify-center">
        {(preview || existingUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview || existingUrl || ""} alt={`${label} signature preview`} className="max-h-16 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">No signature image</span>
        )}
      </div>
      <p className="mt-2 break-words text-sm font-bold uppercase">{name.trim() || "SIGNATORY NAME"}</p>
      <p className="break-words text-xs">{designation.trim() || label}</p>
    </div>
    <div className="flex gap-2">
      <Button type="button" disabled={busy} onClick={() => {
        if (file) void save(file)
        else fileInputRef.current?.click()
      }}>{busy ? "Uploading…" : file ? "Upload signature" : "Choose signature"}</Button>
      {configured && <Button type="button" variant="outline" disabled={busy} onClick={() => save(null)}>Remove signature</Button>}
    </div>
    <p className="text-xs text-muted-foreground">This previews the signatory block only, not the complete permit. Save Settings for name/title edits; upload or remove signatures separately. Issued permits retain their recorded signatories.</p>
  </div>
}
