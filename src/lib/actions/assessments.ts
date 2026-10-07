"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  assessmentSchema,
  type AssessmentFormValues,
} from "@/lib/schemas/mtop"
import { hasPermission } from "@/lib/permissions"
import {
  assessmentFeesForStorage,
  calculateFeeTotal,
  feeKeysFor,
  type FeeSchedule,
} from "@/lib/fees"

async function getAuthUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { supabase, user }
}

export async function createAssessment(
  applicationId: string,
  fees: AssessmentFormValues
) {
  try {
    const { supabase, user } = await getAuthUser()
    if (!(await hasPermission(supabase, user.id, "assessment.create"))) {
      return {
        error: "You are not authorized to create fee assessments.",
        data: null,
      }
    }

    const parsedFees = assessmentSchema.safeParse(fees)
    if (!parsedFees.success) {
      return { error: "The assessment contains an invalid fee amount.", data: null }
    }

    // What a transaction may be charged is not the form's decision. A closure
    // schedule controls applicability; any other submitted value is zeroed.
    const { data: application, error: applicationError } = await supabase
      .schema("mtop")
      .from("mtop_applications")
      .select("id, transaction_type:transaction_types(code)")
      .eq("id", applicationId)
      .single()

    if (applicationError) {
      return { error: applicationError.message, data: null }
    }

    const transactionType = application.transaction_type as
      | { code: string }
      | { code: string }[]
      | null
    const transactionCode = Array.isArray(transactionType)
      ? transactionType[0]?.code
      : transactionType?.code

    const applicable = new Set<string>(feeKeysFor(transactionCode))
    const charged = Object.fromEntries(
      Object.entries(parsedFees.data).map(([key, value]) => [
        key,
        applicable.has(key) ? Number(value) || 0 : 0,
      ])
    ) as Record<keyof AssessmentFormValues, number>

    const totalAmount = calculateFeeTotal(charged)
    const storedFees = assessmentFeesForStorage(charged as FeeSchedule)

    const { data, error } = await supabase
      .schema("mtop")
      .from("mtop_assessments")
      .insert({
        application_id: applicationId,
        assessed_by: user.id,
        ...storedFees,
        total_amount: totalAmount,
      })
      .select("id")
      .single()

    if (error) return { error: error.message, data: null }

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null, data }
  } catch (e) {
    return { error: (e as Error).message, data: null }
  }
}

export async function approveAssessment(
  assessmentId: string,
  applicationId: string
) {
  try {
    const { supabase, user } = await getAuthUser()

    const { error } = await supabase
      .schema("mtop")
      .from("mtop_assessments")
      .update({
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", assessmentId)

    if (error) return { error: error.message }

    // Log approval
    await supabase
      .schema("mtop")
      .from("approval_logs")
      .insert({
        application_id: applicationId,
        stage: "for_assessment",
        action: "approved",
        actor_id: user.id,
        remarks: "Assessment approved by CTO Head",
      })

    revalidatePath(`/dashboard/applications/${applicationId}`)
    return { error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
