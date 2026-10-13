import { notFound } from "next/navigation"
import { getFranchise } from "@/lib/actions/franchises"
import { getFranchiseHistory } from "@/lib/actions/audit"
import { getSystemSettings } from "@/lib/actions/settings"
import { FranchiseDetail } from "./franchise-detail"
import type { FranchiseRecord, FranchiseTransaction } from "./franchise-detail"

export default async function FranchiseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ data, error }, historyResult, { data: settings }] =
    await Promise.all([
      getFranchise(id),
      getFranchiseHistory(id),
      getSystemSettings(),
    ])

  if (error || !data) {
    notFound()
  }

  return (
    <FranchiseDetail
      franchise={data.franchise as unknown as FranchiseRecord}
      applications={data.applications as unknown as FranchiseTransaction[]}
      history={historyResult.data}
      historyError={historyResult.error}
      renewalWindowDays={settings.renewal_window_days}
      abandonmentGraceDays={settings.abandonment_grace_days}
    />
  )
}
