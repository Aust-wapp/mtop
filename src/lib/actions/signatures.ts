"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"
import sharp from "sharp"

type Official = "mayor" | "city_treasurer"

export async function updateOfficialSignature(official: Official, file: File | null) {
  if (official !== "mayor" && official !== "city_treasurer") {
    return { error: "Invalid official." }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await hasPermission(supabase, user.id, "admin.manage"))) {
    return { error: "You do not have permission to manage official signatures." }
  }

  let path = ""
  if (file) {
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      return { error: "Signature must be under 2 MB." }
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const png = bytes.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    const webp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    if (!(png && file.type === "image/png") && !(webp && file.type === "image/webp")) {
      return { error: "Use a valid PNG or WebP signature image." }
    }
    try {
      const image = sharp(Buffer.from(bytes), { limitInputPixels: 3_000_000 })
      const metadata = await image.metadata()
      if (metadata.format !== (png ? "png" : "webp") ||
          !metadata.width || !metadata.height ||
          metadata.width > 3000 || metadata.height > 1000 ||
          (metadata.pages ?? 1) !== 1) {
        return { error: "Signature image dimensions or contents are invalid." }
      }
      await image.stats()
    } catch {
      return { error: "Signature image cannot be decoded." }
    }
    path = `${official}/${crypto.randomUUID()}.${png ? "png" : "webp"}`
    const { error } = await supabase.storage.from("mtop-signatures").upload(path, bytes, {
      contentType: png ? "image/png" : "image/webp",
      upsert: false,
    })
    if (error) return { error: error.message }
  }

  let settingsError: string | null = null
  try {
    const { error } = await supabase.schema("mtop").from("system_settings").upsert({
      key: `${official}_signature_path`, value: path, updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" })
    settingsError = error?.message ?? null
  } catch (cause) {
    settingsError = cause instanceof Error ? cause.message : "Could not save signature settings."
  }
  if (settingsError) {
    if (path) {
      try {
        const cleanup = await supabase.storage.from("mtop-signatures").remove([path])
        if (cleanup.error) {
          return { error: `${settingsError} Upload cleanup also failed: ${cleanup.error.message}` }
        }
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "Unknown cleanup error."
        return { error: `${settingsError} Upload cleanup also failed: ${detail}` }
      }
    }
    return { error: settingsError }
  }
  revalidatePath("/dashboard/admin/settings")
  revalidatePath("/print/mtop", "layout")
  return { error: null }
}
