"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { hasPermission } from "@/lib/permissions"
import { prepareOfficialSignature } from "@/lib/signature-image"

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
    let prepared
    try {
      prepared = await prepareOfficialSignature(file)
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Invalid signature image." }
    }

    path = `${official}/${crypto.randomUUID()}.${prepared.extension}`
    const { error } = await supabase.storage.from("mtop-signatures").upload(path, prepared.bytes, {
      contentType: prepared.contentType,
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
  revalidatePath("/print/confirmation", "layout")
  return { error: null }
}
