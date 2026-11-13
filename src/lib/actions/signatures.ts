"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"

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
    path = `${official}/${crypto.randomUUID()}.${png ? "png" : "webp"}`
    const { error } = await supabase.storage.from("mtop-signatures").upload(path, bytes, {
      contentType: png ? "image/png" : "image/webp",
      upsert: false,
    })
    if (error) return { error: error.message }
  }

  const { error } = await supabase.schema("mtop").from("system_settings").upsert({
    key: `${official}_signature_path`, value: path, updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/admin/settings")
  revalidatePath("/print/mtop", "layout")
  return { error: null }
}
