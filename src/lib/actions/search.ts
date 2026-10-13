"use server"

import { createClient } from "@/lib/supabase/server"
import type { FranchiseStatus, MtopStatus } from "@/types/database"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export interface FranchiseSearchRow {
  franchise_id: string
  mtop_number: string | null
  applicant_name: string
  plate_number: string | null
  tricycle_body_number: string | null
  route: string | null
  granted_until: string | null
  franchise_status: FranchiseStatus
  // Where to send the user. Null when the franchise has no application at all,
  // which should not happen — a franchise is always created with one.
  latest_application_id: string | null
  latest_status: MtopStatus | null
  latest_transaction: string | null
}

/**
 * Powers the topbar search. Matches MTOP number or owner name and resolves each
 * hit to its most recent application, because that is the page staff actually
 * want — there is no standalone franchise page.
 */
export async function searchFranchisesGlobal(
  query: string,
  limit = 8
): Promise<{ error: string | null; data: FranchiseSearchRow[] }> {
  try {
    const { supabase } = await getAuthUser()
    const { error: sweepError } = await supabase
      .schema("mtop")
      .rpc("abandon_due_franchises")
    if (sweepError) return { error: sweepError.message, data: [] }

    const trimmed = query.trim()
    if (!trimmed) return { error: null, data: [] }

    // Escape the PostgREST `or` filter metacharacters so a stray comma or
    // parenthesis in the query can't change the shape of the filter.
    const safe = trimmed.replace(/[,()\\]/g, " ")

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_franchises")
      .select(
        `id, mtop_number, applicant_name, plate_number, tricycle_body_number,
         route, granted_until, franchise_status,
         applications:mtop_applications(
           id, status, created_at,
           transaction_type:transaction_types(name)
         )`
      )
      .or(`mtop_number.ilike.%${safe}%,applicant_name.ilike.%${safe}%`)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message, data: [] }

    const rows = (data ?? []) as unknown as {
      id: string
      mtop_number: string | null
      applicant_name: string
      plate_number: string | null
      tricycle_body_number: string | null
      route: string | null
      granted_until: string | null
      franchise_status: FranchiseStatus
      applications?: {
        id: string
        status: MtopStatus
        created_at: string
        transaction_type: { name: string } | null
      }[]
    }[]

    return {
      error: null,
      data: rows.map((f) => {
        const latest = [...(f.applications ?? [])].sort((a, b) =>
          b.created_at.localeCompare(a.created_at)
        )[0]

        return {
          franchise_id: f.id,
          mtop_number: f.mtop_number,
          applicant_name: f.applicant_name,
          plate_number: f.plate_number,
          tricycle_body_number: f.tricycle_body_number,
          route: f.route,
          granted_until: f.granted_until,
          franchise_status: f.franchise_status,
          latest_application_id: latest?.id ?? null,
          latest_status: latest?.status ?? null,
          latest_transaction: latest?.transaction_type?.name ?? null,
        }
      }),
    }
  } catch (e) {
    return { error: (e as Error).message, data: [] }
  }
}
