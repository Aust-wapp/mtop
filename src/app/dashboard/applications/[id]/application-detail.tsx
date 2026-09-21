"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/layout/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/shared/status-badge"
import { ApprovalStepper } from "@/components/shared/approval-stepper"
import { TimelineLog } from "@/components/shared/timeline-log"
import { DocumentChecklist } from "@/components/mtop/document-checklist"
import { FranchisePhotosCard } from "@/components/mtop/franchise-photos-card"
import { InspectionChecklist } from "@/components/mtop/inspection-checklist"
import { FeeAssessmentForm } from "@/components/mtop/fee-assessment-form"
import { PaymentForm } from "@/components/mtop/payment-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  User,
  Bike,
  MapPin,
  Phone,
  Calendar,
  Hash,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Printer,
} from "lucide-react"
import { format } from "date-fns"
import {
  reopenReturnedApplication,
  returnApplication,
  updateApplicationStatus,
} from "@/lib/actions/applications"
import { checkNegativeList } from "@/lib/actions/documents"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { getExpirationStatus } from "@/lib/utils/permit-expiration"
import { ExpirationBadge } from "@/components/shared/expiration-badge"
import type { MtopStatus } from "@/types/database"
import type { SystemSettings } from "@/lib/actions/settings"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ApplicationDetail({ application, settings }: { application: any; settings: SystemSettings }) {
  const router = useRouter()
  const { can } = usePermissions()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [remarks, setRemarks] = useState("")
  const [negativeListMatches, setNegativeListMatches] = useState<
    { id: string; applicant_name: string; reason: string }[]
  >([])

  const franchise = application.franchise

  // Check negative list on mount
  useEffect(() => {
    const name = franchise?.applicant_name
    if (name) {
      checkNegativeList(name).then((result) => {
        if (!result.error && result.data) {
          setNegativeListMatches(result.data)
        }
      })
    }
  }, [franchise?.applicant_name])

  const isOnNegativeList = negativeListMatches.length > 0

  async function handleStatusChange(
    newStatus: MtopStatus,
    action:
      | "approved"
      | "rejected"
      | "returned"
      | "forwarded"
      | "reopened"
      | "resubmitted"
  ) {
    if (action === "returned" && !remarks.trim()) {
      setError("Remarks are required when returning an application.")
      return
    }

    setLoading(true)
    setError(null)

    const result =
      action === "returned"
        ? await returnApplication(application.id, remarks)
        : action === "reopened"
        ? await reopenReturnedApplication(application.id)
        : await updateApplicationStatus(
            application.id,
            newStatus,
            action,
            remarks || undefined
          )

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
    setLoading(false)
    setRemarks("")
  }

  const docs = application.documents ?? []
  const verifiedCount = docs.filter(
    (d: { is_verified: boolean }) => d.is_verified
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title={franchise?.mtop_number ?? "Pending MTOP Number"}
        subtitle={`${franchise?.applicant_name ?? ""} — ${franchise?.route ?? "No route"}`}
        actions={
          <div className="flex flex-col items-end gap-2">
            {application.status === "granted" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(`/print/mtop/${application.id}`, "_blank")
                }
              >
                <Printer className="h-4 w-4" />
                Print Franchise Card
              </Button>
            )}
            <StatusBadge status={application.status} />
            {application.status === "returned" && can("application.verify") && (
              <Button
                size="sm"
                onClick={() =>
                  handleStatusChange("for_verification", "reopened")
                }
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Re-open for Verification
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Granted Banner with Expiration Info */}
      {application.status === "granted" && (() => {
        const expirationInfo = franchise?.granted_until
          ? getExpirationStatus(
              franchise.granted_until,
              settings.renewal_window_days
            )
          : null

        return (
          <>
            {expirationInfo?.status === "expired" ? (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800 flex items-center gap-2">
                  Permit Expired
                  <ExpirationBadge status="expired" daysRemaining={expirationInfo.daysRemaining} />
                </AlertTitle>
                <AlertDescription className="text-red-700">
                  This permit was granted on{" "}
                  {format(new Date(application.granted_at), "MMMM d, yyyy")} and
                  expired on{" "}
                  {format(expirationInfo.expirationDate, "MMMM d, yyyy")}.
                  The operator needs to apply for renewal.
                </AlertDescription>
              </Alert>
            ) : expirationInfo?.status === "due_for_renewal" ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 flex items-center gap-2">
                  Due for Renewal
                  <ExpirationBadge status="due_for_renewal" daysRemaining={expirationInfo.daysRemaining} />
                </AlertTitle>
                <AlertDescription className="text-amber-700">
                  This permit was granted on{" "}
                  {format(new Date(application.granted_at), "MMMM d, yyyy")} and
                  expires on{" "}
                  {format(expirationInfo.expirationDate, "MMMM d, yyyy")}.
                  The operator should apply for renewal soon.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 flex items-center gap-2">
                  MTOP Granted
                  {expirationInfo && (
                    <ExpirationBadge status="active" daysRemaining={expirationInfo.daysRemaining} />
                  )}
                </AlertTitle>
                <AlertDescription className="text-green-700">
                  This application has been approved and the MTOP permit has been
                  granted
                  {application.granted_at &&
                    ` on ${format(new Date(application.granted_at), "MMMM d, yyyy")}`}
                  .
                  {expirationInfo && (
                    <> Expires on {format(expirationInfo.expirationDate, "MMMM d, yyyy")}.</>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )
      })()}

      {/* Rejected Banner */}
      {application.status === "rejected" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Application Rejected</AlertTitle>
          <AlertDescription>
            This application has been rejected. See the activity log for details.
          </AlertDescription>
        </Alert>
      )}

      {/* Negative List Warning */}
      {isOnNegativeList && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Negative List Match</AlertTitle>
          <AlertDescription>
            This applicant matches {negativeListMatches.length} entry(ies) on
            the negative list:
            {negativeListMatches.map((m) => (
              <span key={m.id} className="block mt-1">
                <strong>{m.applicant_name}</strong> — {m.reason}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content — 2/3 */}
        <div className="space-y-6 lg:col-span-2">
          {/* Applicant Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-4 w-4" />
                Applicant Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <InfoItem label="Full Name" value={franchise?.applicant_name} />
                <InfoItem
                  label="Contact Number"
                  value={franchise?.contact_number}
                  icon={<Phone className="h-3.5 w-3.5" />}
                />
                <InfoItem
                  label="Address"
                  value={franchise?.applicant_address}
                  className="sm:col-span-2"
                />
              </dl>
            </CardContent>
          </Card>

          {/* Photos & Driver Details — franchise-level, feeds the Franchise Card */}
          {franchise && (
            <FranchisePhotosCard
              franchiseId={franchise.id}
              applicationId={application.id}
              ownerPhotoUrl={franchise.owner_photo_url ?? null}
              driverPhotoUrl={franchise.driver_photo_url ?? null}
              driverName={franchise.driver_name ?? null}
              driverLicenseNumber={franchise.driver_license_number ?? null}
              driverAddress={franchise.driver_address ?? null}
              make={franchise.make ?? null}
              dayOff={franchise.day_off ?? null}
              canEdit={
                can("application.verify") && application.status !== "granted"
              }
            />
          )}

          {/* Tricycle Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bike className="h-4 w-4" />
                Tricycle Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <InfoItem
                  label="Body Number"
                  value={franchise?.tricycle_body_number}
                  mono
                />
                <InfoItem
                  label="Plate Number"
                  value={franchise?.plate_number}
                  mono
                />
                <InfoItem
                  label="Motor Number"
                  value={franchise?.motor_number}
                  mono
                />
                <InfoItem
                  label="Chassis Number"
                  value={franchise?.chassis_number}
                  mono
                />
                <InfoItem
                  label="Route"
                  value={franchise?.route}
                  icon={<MapPin className="h-3.5 w-3.5" />}
                />
                <InfoItem
                  label="Fiscal Year"
                  value={application.fiscal_year?.toString()}
                  icon={<Calendar className="h-3.5 w-3.5" />}
                />
              </dl>
            </CardContent>
          </Card>

          {/* Document Verification Checklist */}
          <DocumentChecklist
            documents={docs}
            applicationId={application.id}
            canVerify={
              can("application.verify") &&
              application.status === "for_verification"
            }
          />

          {/* Inspection — show from for_inspection stage onward */}
          {application.status !== "for_verification" && (
            <InspectionChecklist
              applicationId={application.id}
              existingInspection={application.inspection}
              canInspect={can("inspection.conduct")}
              status={application.status}
            />
          )}

          {/* Assessment & Payment — show from for_assessment stage onward */}
          {["for_assessment", "for_approval", "granted"].includes(
            application.status
          ) && (
            <>
              <FeeAssessmentForm
                applicationId={application.id}
                dueDate={application.due_date}
                existingAssessment={application.assessment}
                canAssess={can("assessment.create")}
                canApproveAssessment={can("assessment.approve")}
                status={application.status}
              />

              {application.assessment && (
                <PaymentForm
                  applicationId={application.id}
                  assessmentId={application.assessment.id}
                  totalAmount={Number(application.assessment.total_amount)}
                  isAssessmentApproved={!!application.assessment.approved_at}
                  existingPayments={application.payments ?? []}
                  canRecord={can("payment.record")}
                  status={application.status}
                />
              )}
            </>
          )}

          {/* Stage Actions */}
          <StageActions
            status={application.status}
            can={can}
            loading={loading}
            remarks={remarks}
            onRemarksChange={setRemarks}
            onAction={handleStatusChange}
            verifiedCount={verifiedCount}
            totalDocs={docs.length}
            inspection={application.inspection}
            assessment={application.assessment}
            payments={application.payments}
            isOnNegativeList={isOnNegativeList}
          />
        </div>

        {/* Sidebar — 1/3 */}
        <div className="space-y-6">
          {/* Approval Stepper */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalStepper status={application.status} />
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SummaryRow
                label="MTOP #"
                value={franchise?.mtop_number ?? "—"}
                mono
              />
              <SummaryRow
                label="Applicant"
                value={franchise?.applicant_name ?? "—"}
              />
              <SummaryRow
                label="Submitted"
                value={format(
                  new Date(application.submitted_at),
                  "MMM d, yyyy"
                )}
              />
              {application.due_date && (
                <SummaryRow
                  label="Due Date"
                  value={format(new Date(application.due_date), "MMM d, yyyy")}
                />
              )}
              {application.granted_at && (
                <SummaryRow
                  label="Granted"
                  value={format(
                    new Date(application.granted_at),
                    "MMM d, yyyy"
                  )}
                />
              )}
              {application.status === "granted" && franchise?.granted_until && (
                <SummaryRow
                  label="Expires"
                  value={format(new Date(franchise.granted_until), "MMM d, yyyy")}
                />
              )}
              {application.assessment && (
                <>
                  <Separator />
                  <SummaryRow
                    label="Total Fees"
                    value={`₱${Number(application.assessment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
                  />
                </>
              )}
              {application.creator && (
                <>
                  <Separator />
                  <SummaryRow
                    label="Created By"
                    value={application.creator.full_name}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineLog logs={application.approval_logs ?? []} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function InfoItem({
  label,
  value,
  icon,
  mono,
  className,
}: {
  label: string
  value?: string | null
  icon?: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd className="flex items-center gap-1.5 text-sm">
        {icon}
        <span className={mono ? "font-mono" : undefined}>
          {value || "—"}
        </span>
      </dd>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : "font-medium"}>{value}</span>
    </div>
  )
}

function StageActions({
  status,
  can,
  loading,
  remarks,
  onRemarksChange,
  onAction,
  verifiedCount,
  totalDocs,
  inspection,
  assessment,
  payments,
  isOnNegativeList,
}: {
  status: MtopStatus
  can: (p: string) => boolean
  loading: boolean
  remarks: string
  onRemarksChange: (v: string) => void
  onAction: (
    status: MtopStatus,
    action:
      | "approved"
      | "rejected"
      | "returned"
      | "forwarded"
      | "reopened"
      | "resubmitted"
  ) => void
  verifiedCount: number
  totalDocs: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inspection: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments: any[]
  isOnNegativeList: boolean
}) {
  if (status === "returned") return null

  // Determine which actions are available based on current status and permissions
  let title = ""
  let description = ""
  let forwardLabel = ""
  let forwardStatus: MtopStatus | null = null
  let canForward = false
  let canReturn = true
  let isGrantAction = false

  switch (status) {
    case "for_verification":
      title = "Verification Actions"
      description = "Verify all documents before forwarding to inspection."
      forwardLabel = "Forward to Inspection"
      forwardStatus = "for_inspection"
      canForward =
        can("application.verify") &&
        verifiedCount === totalDocs &&
        !isOnNegativeList
      canReturn = can("application.verify")
      break
    case "for_inspection":
      title = "Inspection Actions"
      description = "Complete the inspection before forwarding to assessment."
      forwardLabel = "Forward to Assessment"
      forwardStatus = "for_assessment"
      canForward =
        can("inspection.conduct") && inspection?.result === "passed"
      canReturn = can("inspection.conduct")
      break
    case "for_assessment":
      title = "Assessment Actions"
      description = "Assess fees and record payment before forwarding."
      forwardLabel = "Forward to Approval"
      forwardStatus = "for_approval"
      canForward =
        can("payment.record") &&
        assessment?.approved_at &&
        payments?.length > 0
      canReturn = can("assessment.create")
      break
    case "for_approval":
      title = "Approval Actions"
      description = "Review the complete application and grant the MTOP."
      forwardLabel = "Approve & Grant MTOP"
      forwardStatus = "granted"
      canForward = can("application.grant")
      canReturn = can("application.approve")
      // Use "approved" action for granting instead of "forwarded"
      isGrantAction = true
      break
    default:
      return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Hash className="h-4 w-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Remarks */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="remarks">
            Remarks (required for return)
          </label>
          <textarea
            id="remarks"
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-[80px]"
            placeholder="Add remarks..."
            value={remarks}
            onChange={(e) => onRemarksChange(e.target.value)}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {forwardStatus && canForward && (
            <Button
              onClick={() =>
                onAction(
                  forwardStatus!,
                  isGrantAction
                    ? "approved"
                    : "forwarded"
                )
              }
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {forwardLabel}
            </Button>
          )}

          {canReturn && (
            <Button
              variant="outline"
              onClick={() =>
                onAction(
                  "returned",
                  "returned"
                )
              }
              disabled={loading}
            >
              Return
            </Button>
          )}

          {status === "for_approval" && can("application.approve") && (
            <Button
              variant="destructive"
              onClick={() => onAction("rejected", "rejected")}
              disabled={loading}
            >
              Reject
            </Button>
          )}
        </div>

        {/* Hints */}
        {status === "for_verification" && isOnNegativeList && (
          <p className="text-xs text-destructive">
            Cannot forward — applicant is on the negative list.
          </p>
        )}
        {status === "for_verification" &&
          !isOnNegativeList &&
          verifiedCount < totalDocs && (
            <p className="text-xs text-muted-foreground">
              {totalDocs - verifiedCount} document(s) still need verification
              before forwarding.
            </p>
          )}
        {status === "for_inspection" && !inspection && (
          <p className="text-xs text-muted-foreground">
            Inspection has not been conducted yet.
          </p>
        )}
        {status === "for_inspection" &&
          inspection?.result === "failed" && (
            <p className="text-xs text-destructive">
              Inspection failed. Return to applicant for corrections.
            </p>
          )}
      </CardContent>
    </Card>
  )
}
