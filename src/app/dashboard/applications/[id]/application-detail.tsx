"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/shared/status-badge"
import { ApprovalStepper } from "@/components/shared/approval-stepper"
import { TimelineLog } from "@/components/shared/timeline-log"
import { HistoryTimeline } from "@/components/shared/history-timeline"
import { useGuardedAction } from "@/components/shared/guarded-action"
import { RequirementChecklist } from "@/components/mtop/requirement-checklist"
import { FranchisePhotosCard } from "@/components/mtop/franchise-photos-card"
import { TricycleDetailsCard } from "@/components/mtop/tricycle-details-card"
import { InspectionChecklist } from "@/components/mtop/inspection-checklist"
import { FeeAssessmentForm } from "@/components/mtop/fee-assessment-form"
import { PaymentForm } from "@/components/mtop/payment-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  User,
  Phone,
  Hash,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Printer,
  ArrowRight,
  History,
  RotateCcw,
} from "lucide-react"
import { format } from "date-fns"
import { updateApplicationStatus, reopenApplication } from "@/lib/actions/applications"
import { checkNegativeList } from "@/lib/actions/requirements"
import { usePermissions } from "@/lib/hooks/use-permissions"
import { getFranchiseStatusDisplay } from "@/lib/utils/franchise-status"
import { cn } from "@/lib/utils"
import { isBlocking } from "@/lib/requirements"
import { InfoItem } from "@/components/shared/info-item"
import {
  reopenTargetStage,
  remarksRequiredMessage,
  stageName,
  stagePermission,
} from "@/lib/application-flow"
import { ExpirationBadge } from "@/components/shared/expiration-badge"
import { FranchiseStatusBadge } from "@/components/shared/franchise-status-badge"
import type { MtopStatus, TransactionTypeCode } from "@/types/database"
import type { FranchiseHistoryEvent } from "@/lib/audit"
import type { SystemSettings } from "@/lib/actions/settings"
import { FORM_FOR_TRANSACTION } from "@/lib/forms/print-data"

/**
 * What the overlay says while a decision is being recorded. Granting is named
 * apart from the rest because it is the one that does more than move a status:
 * it issues the number, replaces the unit, transfers the owner.
 */
function busyLabelFor(
  status: MtopStatus,
  action: "approved" | "rejected" | "returned" | "forwarded"
): string {
  if (status === "granted") return "Granting the MTOP…"
  if (action === "rejected") return "Rejecting the application…"
  if (action === "returned") return "Returning the application…"
  return `Forwarding to ${stageName(status)}…`
}

/** What the clerk is asked before a decision is recorded. */
function confirmFor(
  status: MtopStatus,
  action: "approved" | "rejected" | "returned" | "forwarded"
) {
  if (status === "granted")
    return {
      title: "Approve and grant the MTOP?",
      description:
        "Granting applies this transaction to the franchise. Once granted, the record is settled and can only be changed by filing another transaction.",
      confirmLabel: "Approve & Grant",
    }
  if (action === "rejected")
    return {
      title: "Reject this application?",
      description:
        "A rejection is final — the application cannot be reopened, and the operator has to file again.",
      confirmLabel: "Reject",
      destructive: true,
    }
  if (action === "returned")
    return {
      title: "Return this application?",
      description:
        "It is paused with your remarks until the deficiency is settled. Nothing already cleared is undone.",
      confirmLabel: "Return",
      destructive: true,
    }
  return {
    title: `Forward to ${stageName(status)}?`,
    description: `The application moves on to ${stageName(status)}.`,
    confirmLabel: "Forward",
  }
}

function grantedTransactionLabel(code?: string, name?: string): string {
  switch (code) {
    case "new_franchise":
      return "MTOP Granted"
    case "renewal":
      return "Renewal Granted"
    case "change_unit":
      return "Change Unit Granted"
    case "change_ownership":
      return "Change Ownership Granted"
    case "closure":
      return "Closure Granted"
    case "annual_confirmation":
      return "Confirmation Granted"
    case "reissuance":
      return "Re-Issuance Granted"
    default:
      return `${name ?? "Application"} Granted`
  }
}

export function ApplicationDetail({
  application,
  settings,
  franchiseHistory,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  application: any
  settings: SystemSettings
  franchiseHistory: FranchiseHistoryEvent[]
}) {
  const { can } = usePermissions()
  const [error, setError] = useState<string | null>(null)
  // Asks before each decision, then holds the overlay up until the page in
  // front of the clerk is the one the decision produced.
  const guard = useGuardedAction()
  const [remarks, setRemarks] = useState("")
  // Set to the decision that was attempted with the field empty, so the field
  // itself shows the problem — and names it — rather than leaving the alert at
  // the top of the page to do all the work.
  const [remarksMissing, setRemarksMissing] = useState<
    "returned" | "rejected" | null
  >(null)
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
    action: "approved" | "rejected" | "returned" | "forwarded"
  ) {
    // Same rule the server enforces, read from the same place, so the form
    // cannot drift from what updateApplicationStatus() will accept.
    const remarksRequired = remarksRequiredMessage(action)
    if (remarksRequired && !remarks.trim()) {
      setRemarksMissing(action as "returned" | "rejected")
      setError(remarksRequired)
      return
    }

    setRemarksMissing(null)
    if (!(await guard.confirm(confirmFor(newStatus, action)))) return

    guard.start(busyLabelFor(newStatus, action))
    setError(null)

    const result = await updateApplicationStatus(
      application.id,
      newStatus,
      action,
      remarks || undefined
    )

    if (result.error) {
      setError(result.error)
      guard.stop()
      return
    }

    setRemarks("")
    guard.finish()
  }

  // A returned application resumes at the stage it was returned from; the
  // server derives that stage itself, this only needs to say so on the button.
  const reopenStage = reopenTargetStage(application.approval_logs ?? [])

  async function handleReopen() {
    const ok = await guard.confirm({
      title: `Reopen at ${stageName(reopenStage)}?`,
      description:
        "The application resumes where it was returned from, with everything already cleared left as it is.",
      confirmLabel: "Reopen",
    })
    if (!ok) return

    guard.start("Reopening the application…")
    setError(null)

    const result = await reopenApplication(application.id, remarks || undefined)

    if (result.error) {
      setError(result.error)
      guard.stop()
      return
    }

    setRemarks("")
    guard.finish()
  }

  // An administrator can correct any stage until the permit is granted. An
  // error found at approval shouldn't mean walking the application back
  // through the flow, and the admin role already carries every permission —
  // what stood in their way was the stage each component checks for itself.
  // Granting is the line: once the permit exists, the record behind it is
  // settled and is corrected by filing a transaction, not by editing.
  const adminEdit = can("admin.manage") && application.status !== "granted"

  const requirements = application.requirements ?? []
  const transactionType = application.transaction_type
  const paperFormKind = transactionType?.code
    ? FORM_FOR_TRANSACTION[transactionType.code as TransactionTypeCode]
    : undefined
  const franchiseStatusDisplay = getFranchiseStatusDisplay(
    franchise?.franchise_status,
    franchise?.granted_until,
    settings.renewal_window_days
  )
  const grantedTransactionTitle = grantedTransactionLabel(
    transactionType?.code,
    transactionType?.name
  )
  // Only mandatory, non-conditional items gate the forward button.
  const blockingItems = requirements.filter(isBlocking)
  const blockingCleared = blockingItems.filter(
    (r: { is_verified: boolean }) => r.is_verified
  ).length

  // The overlay blocks the pointer; `inert` closes the keyboard route into the
  // page behind it, so a decision in flight cannot be raced by a tab and a
  // return key. Both end together when the refreshed page arrives.
  const busy = guard.busy

  return (
    <div className="space-y-6" inert={busy || undefined}>
      <PageHeader
        title={franchise?.mtop_number ?? "Pending MTOP Number"}
        subtitle={`${transactionType?.name ?? "Application"} · ${franchise?.applicant_name ?? ""} — ${franchise?.route ?? "No route"}`}
        actions={
          <div className="flex items-center gap-2">
            {franchise?.id && (
              <Link
                href={`/dashboard/franchises/${franchise.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <History className="h-4 w-4" />
                Franchise record
              </Link>
            )}
            {paperFormKind && (
              <Link
                href={`/print/forms/${paperFormKind}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Printer className="h-4 w-4" />
                Print Blank Application Form
              </Link>
            )}
            {application.status === "granted" && (
              <>
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
                {/* The LTO's copy of the confirmation. Every granted
                    transaction can produce one, not just the annual
                    confirmation slip. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/print/confirmation/${application.id}`,
                      "_blank"
                    )
                  }
                >
                  <Printer className="h-4 w-4" />
                  Print Confirmation Slip
                </Button>
              </>
            )}
            <StatusBadge status={application.status} />
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* The application result and the current franchise state are distinct. */}
      {application.status === "granted" && (() => {
        const expirationInfo = franchiseStatusDisplay.expiration
        const grantedOn = application.granted_at
          ? format(new Date(application.granted_at), "MMMM d, yyyy")
          : null

        if (
          franchise?.franchise_status &&
          !franchiseStatusDisplay.isActive
        ) {
          const statusLabel = franchiseStatusDisplay.statusLabel ??
            franchise.franchise_status

          return (
            <Alert className="border-slate-200 bg-slate-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="flex items-center gap-2 text-slate-800">
                {grantedTransactionTitle}
                <FranchiseStatusBadge status={franchise.franchise_status} />
              </AlertTitle>
              <AlertDescription className="text-slate-700">
                {transactionType?.code === "closure" ? (
                  <>
                    This closure application was granted
                    {grantedOn ? ` on ${grantedOn}` : ""}. The franchise is
                    now closed.
                  </>
                ) : (
                  <>
                    This {transactionType?.name?.toLowerCase() ?? "transaction"}
                    {grantedOn ? ` was granted on ${grantedOn}` : " was granted"}.
                    The franchise is currently {statusLabel.toLowerCase()}.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )
        }

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
                  {grantedTransactionTitle}
                  {expirationInfo && (
                    <ExpirationBadge status="active" daysRemaining={expirationInfo.daysRemaining} />
                  )}
                </AlertTitle>
                <AlertDescription className="text-green-700">
                  This {transactionType?.name?.toLowerCase() ?? "application"}
                  {grantedOn ? ` was granted on ${grantedOn}` : " was granted"}.
                  {expirationInfo && (
                    <> Expires on {format(expirationInfo.expirationDate, "MMMM d, yyyy")}.</>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )
      })()}

      {/* Returned Banner — carries the reason forward, since the whole point
          of a return is the deficiency written in the remarks. */}
      {application.status === "returned" && (() => {
        const lastReturn = (application.approval_logs ?? []).find(
          (log: { action: string }) => log.action === "returned"
        )

        return (
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-800">
              Application Returned
            </AlertTitle>
            <AlertDescription className="text-orange-700">
              {lastReturn?.remarks && (
                <span className="block italic">
                  &ldquo;{lastReturn.remarks}&rdquo;
                </span>
              )}
              <span className="block">
                Returned
                {lastReturn?.actor?.full_name && ` by ${lastReturn.actor.full_name}`}
                {lastReturn?.created_at &&
                  ` on ${format(new Date(lastReturn.created_at), "MMMM d, yyyy")}`}
                . Reopen it below once the deficiency has been settled — it
                keeps everything already cleared and resumes at{" "}
                {stageName(reopenStage)}.
              </span>
            </AlertDescription>
          </Alert>
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

      {/* Pending change — only change_unit / change_ownership stage a change
          on the application to apply later. Shown at every stage so approvers
          can see exactly what granting this application will do. */}
      {(transactionType?.grant_effect === "replace_unit" ||
        transactionType?.grant_effect === "transfer_owner") && (
        <PendingChangeCard
          transactionType={transactionType}
          application={application}
          franchise={franchise}
        />
      )}

      {/* Reissuance, closure and annual confirmation carry the operator's
          stated reason from filing. */}
      {application.reason && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Reason for {transactionType?.name ?? "this application"}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">
            {application.reason}
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
              atVerification={application.status === "for_verification"}
            />
          )}

          {/* Tricycle Details — read-only except to an administrator, who may
              correct a mis-keyed record until the permit is granted. A unit
              that genuinely changed goes through a change-of-unit transaction,
              which keeps the old numbers as history. */}
          {franchise && (
            <TricycleDetailsCard
              franchise={franchise}
              applicationId={application.id}
              fiscalYear={application.fiscal_year?.toString()}
              canEdit={adminEdit}
            />
          )}

          {/* Requirement checklist for this transaction.
              Editable at any stage before the permit is settled, not only at
              for_verification: a deficiency is often raised later — an
              inspector or assessor returns the application over a missing
              document — and the counter has to be able to attach it when the
              operator brings it in, whether that is before or after the
              application is reopened. Same rule as the photos card above. */}
          <RequirementChecklist
            requirements={requirements}
            applicationId={application.id}
            transactionName={transactionType?.name}
            // One scanned PDF standing in for the whole folder, which is how
            // the counter actually receives the documents.
            bundle={{
              url: application.requirements_file_url ?? null,
              name: application.requirements_file_name ?? null,
              size: application.requirements_file_size ?? null,
              uploadedAt: application.requirements_uploaded_at ?? null,
            }}
            canVerify={
              (can("application.verify") &&
                application.status !== "granted" &&
                application.status !== "rejected") ||
              adminEdit
            }
          />

          {/* Inspection — only for transactions that require one, and only from
              the for_inspection stage onward. Annual confirmation, re-issuance
              and closure never enter this stage. */}
          {transactionType?.requires_inspection !== false &&
            application.status !== "for_verification" && (
            <InspectionChecklist
              applicationId={application.id}
              existingInspection={application.inspection}
              canInspect={can("inspection.conduct")}
              status={application.status}
              adminEdit={adminEdit}
            />
          )}

          {/* Assessment & Payment — show from for_assessment stage onward, and
              to an administrator wherever an assessment already exists, so a
              returned application's fees are reachable without reopening it
              first. */}
          {(["for_assessment", "for_approval", "granted"].includes(
            application.status
          ) ||
            (adminEdit && !!application.assessment)) && (
            <>
              <FeeAssessmentForm
                applicationId={application.id}
                // A renewal is late from the day the permit expired, which
                // the franchise already knows. mtop_applications.due_date is
                // no longer asked for at filing; it is still read for older
                // applications that had one typed in.
                dueDate={
                  transactionType?.code === "renewal"
                    ? franchise?.granted_until ?? application.due_date
                    : application.due_date
                }
                existingAssessment={application.assessment}
                canAssess={can("assessment.create")}
                canApproveAssessment={can("assessment.approve")}
                status={application.status}
                transactionCode={transactionType?.code}
                adminEdit={adminEdit}
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
                  adminEdit={adminEdit}
                />
              )}
            </>
          )}

          {/* Stage Actions */}
          <StageActions
            status={application.status}
            can={can}
            loading={busy}
            remarks={remarks}
            onRemarksChange={(value) => {
              setRemarks(value)
              if (remarksMissing && value.trim()) setRemarksMissing(null)
            }}
            remarksMissing={remarksMissing}
            onAction={handleStatusChange}
            blockingCleared={blockingCleared}
            blockingTotal={blockingItems.length}
            requiresInspection={transactionType?.requires_inspection !== false}
            inspection={application.inspection}
            assessment={application.assessment}
            payments={application.payments}
            isOnNegativeList={isOnNegativeList}
            reopenStage={reopenStage}
            onReopen={handleReopen}
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
                  label={
                    franchise?.franchise_status &&
                    !franchiseStatusDisplay.isActive
                      ? franchiseStatusDisplay.historicalValidityLabel
                      : "Expires"
                  }
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

          {/* Recent changes to the franchise itself — a different question
              from "what happened to this application", which is why it sits
              beside the activity log rather than inside it. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Franchise history</CardTitle>
              <CardDescription>
                Recent changes to the operator, driver and unit on record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <HistoryTimeline
                events={franchiseHistory}
                showFilters={false}
                emptyMessage="Nothing recorded for this franchise yet."
              />
              {franchise?.id && (
                <Link
                  href={`/dashboard/franchises/${franchise.id}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  View the full audit trail
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Portalled out of this element, so `inert` above does not reach it. */}
      {guard.element}
    </div>
  )
}

function PendingChangeCard({
  transactionType,
  application,
  franchise,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactionType: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  application: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  franchise: any
}) {
  const isGranted = application.status === "granted"
  const verb = isGranted ? "was applied on grant" : "applies once this application is granted"

  const rows: { label: string; from: string; to: string }[] =
    transactionType.grant_effect === "replace_unit"
      ? [
          {
            label: "Motor Number",
            from: franchise?.motor_number ?? "—",
            to: application.new_motor_number ?? "—",
          },
          {
            label: "Chassis Number",
            from: franchise?.chassis_number ?? "—",
            to: application.new_chassis_number ?? "—",
          },
          {
            label: "Plate Number",
            from: franchise?.plate_number ?? "—",
            to: application.new_plate_number ?? franchise?.plate_number ?? "—",
          },
        ]
      : [
          {
            label: "Owner",
            from: franchise?.applicant_name ?? "—",
            to: application.new_applicant_name ?? "—",
          },
          {
            label: "Address",
            from: franchise?.applicant_address ?? "—",
            to: application.new_applicant_address ?? franchise?.applicant_address ?? "—",
          },
          {
            label: "Contact Number",
            from: franchise?.contact_number ?? "—",
            to: application.new_contact_number ?? franchise?.contact_number ?? "—",
          },
        ]

  return (
    <Alert className="border-blue-200 bg-blue-50">
      <ArrowRight className="h-4 w-4 text-blue-600" />
      <AlertTitle className="text-blue-800">
        {transactionType.grant_effect === "replace_unit"
          ? "Change of Unit"
          : "Change of Ownership"}{" "}
        pending
      </AlertTitle>
      <AlertDescription className="text-blue-700">
        <p className="mb-2">This change {verb}.</p>
        <dl className="space-y-1">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-wrap items-center gap-1.5 text-sm">
              <dt className="font-medium">{row.label}:</dt>
              <dd className="flex items-center gap-1.5">
                <span className={isGranted ? "line-through opacity-60" : ""}>
                  {row.from}
                </span>
                <ArrowRight className="h-3 w-3" />
                <span className="font-semibold">{row.to}</span>
              </dd>
            </div>
          ))}
        </dl>
      </AlertDescription>
    </Alert>
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
  remarksMissing,
  onAction,
  blockingCleared,
  blockingTotal,
  requiresInspection,
  inspection,
  assessment,
  payments,
  isOnNegativeList,
  reopenStage,
  onReopen,
}: {
  status: MtopStatus
  can: (p: string) => boolean
  loading: boolean
  remarks: string
  onRemarksChange: (v: string) => void
  remarksMissing: "returned" | "rejected" | null
  onAction: (
    status: MtopStatus,
    action: "approved" | "rejected" | "returned" | "forwarded"
  ) => void
  blockingCleared: number
  blockingTotal: number
  requiresInspection: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inspection: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payments: any[]
  isOnNegativeList: boolean
  reopenStage: MtopStatus
  onReopen: () => void
}) {
  // Determine which actions are available based on current status and permissions
  let title = ""
  let description = ""
  let forwardLabel = ""
  let forwardStatus: MtopStatus | null = null
  let canForward = false
  let canReturn = true
  let isGrantAction = false
  let isReopen = false
  // Permission to act at this stage at all, before any data prerequisite. A
  // viewer without it gets an explanation instead of a form they cannot submit.
  let canAct = false

  switch (status) {
    case "for_verification":
      title = "Verification Actions"
      // Transactions without a physical inspection skip straight to assessment.
      description = requiresInspection
        ? "Clear every required item before forwarding to inspection."
        : "Clear every required item before forwarding to assessment."
      forwardLabel = requiresInspection
        ? "Forward to Inspection"
        : "Forward to Assessment"
      forwardStatus = requiresInspection ? "for_inspection" : "for_assessment"
      canForward =
        can("application.verify") &&
        blockingCleared === blockingTotal &&
        !isOnNegativeList
      canReturn = can("application.verify")
      canAct = can("application.verify")
      break
    case "for_inspection":
      title = "Inspection Actions"
      description = "Complete the inspection before forwarding to assessment."
      forwardLabel = "Forward to Assessment"
      forwardStatus = "for_assessment"
      canForward =
        can("inspection.conduct") && inspection?.result === "passed"
      canReturn = can("inspection.conduct")
      canAct = can("inspection.conduct")
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
      // Two offices share this stage: the assessment officer prices it, the
      // cashier takes the money and forwards it.
      canAct = can("payment.record") || can("assessment.create")
      break
    case "for_approval":
      title = "Approval Actions"
      description = "Review the complete application and grant the MTOP."
      forwardLabel = "Approve & Grant MTOP"
      forwardStatus = "granted"
      canForward = can("application.grant")
      canReturn = can("application.approve")
      canAct = can("application.grant") || can("application.approve")
      // Use "approved" action for granting instead of "forwarded"
      isGrantAction = true
      break
    case "returned":
      // A return parks the application without unwinding any of its work, so
      // reopening resumes at the stage it left rather than restarting it.
      title = "Returned Application"
      description = `Waiting on the operator. Reopening resumes at ${stageName(
        reopenStage
      )} with everything already cleared left as it is.`
      forwardLabel = `Reopen at ${stageName(reopenStage)}`
      canForward = can(stagePermission(reopenStage))
      canReturn = false
      canAct = canForward
      isReopen = true
      break
    default:
      return null
  }

  // Nothing here is actionable without the stage's permission — the remarks
  // box exists only to accompany an action, so showing it alone reads as a
  // form that lost its button.
  if (!canAct) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Hash className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isReopen
              ? `This application resumes at ${stageName(
                  reopenStage
                )}, which you do not have permission to act on. Ask whoever handles that stage to reopen it.`
              : `This application is at ${stageName(
                  status
                )}. You do not have permission to act on that stage, so there is nothing to do here.`}
          </p>
        </CardContent>
      </Card>
    )
  }

  // Rejecting is only ever offered at approval, and it is the one decision that
  // ends the application — so the remarks box has to say it needs a reason for
  // that too, not only for a return.
  const canReject = status === "for_approval" && can("application.approve")

  const requiredFor = [
    canReturn ? "returning" : null,
    canReject ? "rejecting" : null,
  ].filter(Boolean) as string[]

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
            {isReopen || requiredFor.length === 0 ? (
              "Remarks (optional)"
            ) : (
              <>
                Remarks{" "}
                <span className="text-muted-foreground font-normal">
                  — required when {requiredFor.join(" or ")}
                </span>
              </>
            )}
          </label>
          <textarea
            id="remarks"
            aria-invalid={remarksMissing !== null}
            className={cn(
              "flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-[80px]",
              remarksMissing &&
                "border-destructive ring-3 ring-destructive/20"
            )}
            placeholder={
              isReopen
                ? "Add remarks..."
                : canReject
                  ? "Why is this being returned or refused?"
                  : "What does the applicant need to correct?"
            }
            value={remarks}
            onChange={(e) => onRemarksChange(e.target.value)}
          />
          {remarksMissing === "returned" && (
            <p className="text-xs text-destructive">
              Say what needs to be corrected — the applicant sees this as the
              reason the application came back.
            </p>
          )}
          {remarksMissing === "rejected" && (
            <p className="text-xs text-destructive">
              Say why the application is being refused — a rejection is final,
              and this is the only record of the reason.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {isReopen && canForward && (
            <Button onClick={onReopen} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              {forwardLabel}
            </Button>
          )}

          {forwardStatus && canForward && (
            <Button
              onClick={() =>
                onAction(
                  forwardStatus!,
                  isGrantAction ? "approved" : "forwarded"
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

          {canReject && (
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
          blockingCleared < blockingTotal && (
            <p className="text-xs text-muted-foreground">
              {blockingTotal - blockingCleared} required item(s) still need to be
              cleared before forwarding.
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
        {/* Assessment is the one stage two offices share, so say which half is
            outstanding rather than leaving the missing button unexplained. */}
        {status === "for_assessment" && !canForward && (
          <p className="text-xs text-muted-foreground">
            {!can("payment.record")
              ? "The cashier forwards this to approval once the payment is recorded."
              : !assessment
                ? "No fee assessment has been created yet."
                : !assessment.approved_at
                  ? "The fee assessment has to be approved before this can be forwarded."
                  : "Record the payment before forwarding."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
