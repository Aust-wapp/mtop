import { notFound } from "next/navigation"
import { getApplication } from "@/lib/actions/applications"
import { getFranchiseHistory } from "@/lib/actions/audit"
import { getGrantedClosureApplicationIdForFranchise } from "@/lib/actions/certificates"
import { getSystemSettings } from "@/lib/actions/settings"
import { ApplicationDetail } from "./application-detail"

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ data, error }, { data: settings }] = await Promise.all([
    getApplication(id),
    getSystemSettings(),
  ])

  if (error || !data) {
    notFound()
  }

  // A condensed slice of the franchise's audit trail, so a clerk working a
  // transaction can see what was recently changed on the record without
  // leaving the page. The full trail lives on /dashboard/franchises/[id].
  const isClosedNewFranchiseGrant =
    data.status === "granted" &&
    data.transaction_type?.code === "new_franchise" &&
    data.franchise?.franchise_status === "closed" &&
    typeof data.franchise_id === "string"

  const [franchiseHistoryResult, closureCertificateResult] = await Promise.all([
    getFranchiseHistory(data.franchise_id, 6),
    isClosedNewFranchiseGrant
      ? getGrantedClosureApplicationIdForFranchise(data.franchise_id)
      : Promise.resolve({ error: null, applicationId: null }),
  ])

  return (
    <ApplicationDetail
      application={data}
      settings={settings}
      franchiseHistory={franchiseHistoryResult.data}
      closureCertificateApplicationId={closureCertificateResult.applicationId}
      closureCertificateLookupError={Boolean(closureCertificateResult.error)}
    />
  )
}
