import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

function getSafeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/dashboard"
  }

  return value
}

function redirectToAuth(origin: string, error: string) {
  const url = new URL("/auth", origin)
  url.searchParams.set("error", error)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const nextPath = getSafeNextPath(searchParams.get("next"))

  if (!code) {
    return redirectToAuth(origin, "auth_callback_error")
  }

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    return redirectToAuth(origin, "auth_callback_error")
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    await supabase.auth.signOut()
    return redirectToAuth(origin, "auth_callback_error")
  }

  const adminSupabase = createAdminClient()
  const { data: linked, error: linkError } = await adminSupabase
    .schema("mtop")
    .rpc("link_google_user_profile", { p_auth_user_id: user.id })

  if (linkError) {
    console.error(
      "Unable to link the authenticated Google user to an MTOP profile.",
      linkError.code ?? "unknown"
    )
    await supabase.auth.signOut()
    return redirectToAuth(origin, "auth_callback_error")
  }

  if (linked !== true) {
    await supabase.auth.signOut()
    return redirectToAuth(origin, "unauthorized")
  }

  const forwardedHost = request.headers.get("x-forwarded-host")
  const isLocalEnv = process.env.NODE_ENV === "development"
  const redirectOrigin =
    !isLocalEnv && forwardedHost ? "https://" + forwardedHost : origin

  return NextResponse.redirect(new URL(nextPath, redirectOrigin))
}
