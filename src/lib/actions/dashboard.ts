"use server"

import { createClient } from "@/lib/supabase/server"
import { getSystemSettings } from "@/lib/actions/settings"
import type { MtopStatus } from "@/types/database"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

const PIPELINE_STATUSES: MtopStatus[] = [
  "for_verification",
  "for_inspection",
  "for_assessment",
  "for_approval",
  "granted",
]

export async function getDashboardStats() {
  try {
    const { supabase } = await getAuthUser()
    const currentYear = new Date().getFullYear()

    // Fetch all counts in parallel
    const [totalResult, pendingResult, grantedResult, revenueResult] =
      await Promise.all([
        // Total applications this year
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear),

        // Pending (all non-terminal statuses)
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear)
          .in("status", [
            "for_verification",
            "for_inspection",
            "for_assessment",
            "for_approval",
          ]),

        // Granted this year
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear)
          .eq("status", "granted"),

        // Total revenue (sum of payments)
        supabase
          .schema("mtop")
          .from("mtop_payments")
          .select("amount_paid"),
      ])

    const revenue = (revenueResult.data ?? []).reduce(
      (sum: number, p: { amount_paid: number }) => sum + Number(p.amount_paid),
      0
    )

    return {
      error: null,
      data: {
        totalApplications: totalResult.count ?? 0,
        pending: pendingResult.count ?? 0,
        granted: grantedResult.count ?? 0,
        revenue,
      },
    }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getPipelineCounts() {
  try {
    const { supabase } = await getAuthUser()
    const currentYear = new Date().getFullYear()

    const results = await Promise.all(
      PIPELINE_STATUSES.map((status) =>
        supabase
          .schema("mtop")
          .from("mtop_applications")
          .select("*", { count: "exact", head: true })
          .eq("fiscal_year", currentYear)
          .eq("status", status)
      )
    )

    const pipeline = PIPELINE_STATUSES.map((status, i) => ({
      status,
      count: results[i].count ?? 0,
    }))

    return { error: null, data: pipeline }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getRecentActivity(limit = 10) {
  try {
    const { supabase } = await getAuthUser()

    const { data, error } = await supabase
      .schema("mtop")
      .from("approval_logs")
      .select(
        "*, actor:user_profiles!actor_id(id, full_name), application:mtop_applications!application_id(id, franchise:mtop_franchises(mtop_number, applicant_name))"
      )
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message, data: null }
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function getRenewalStats() {
  try {
    const { supabase } = await getAuthUser()
    const { data: settings } = await getSystemSettings()

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select("granted_until")
      .eq("franchise_status", "active")
      .not("granted_until", "is", null)

    if (error) return { error: error.message, data: null }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueWindowMs = settings.renewal_window_days * 24 * 60 * 60 * 1000

    let expired = 0
    let dueForRenewal = 0
    let active = 0

    for (const row of data ?? []) {
      const expiry = new Date(row.granted_until)
      expiry.setHours(0, 0, 0, 0)
      const diff = expiry.getTime() - today.getTime()
      if (diff < 0) expired++
      else if (diff <= dueWindowMs) dueForRenewal++
      else active++
    }

    return { error: null, data: { expired, dueForRenewal, active } }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}
