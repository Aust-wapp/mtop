"use client"

import { useState, useMemo } from "react"
import { useGuardedAction } from "@/components/shared/guarded-action"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Calculator,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react"
import { createAssessment, approveAssessment } from "@/lib/actions/assessments"
import {
  STANDARD_FEES,
  FEE_LABELS,
  calculateLatePenalty,
  feeScheduleFor,
  feeKeysFor,
} from "@/lib/fees"
import type { MtopStatus } from "@/types/database"

interface FeeAssessmentFormProps {
  applicationId: string
  dueDate: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingAssessment: any | null
  canAssess: boolean
  canApproveAssessment: boolean
  status: MtopStatus
  /** Which transaction is being priced; a closure is priced differently. */
  transactionCode?: string | null
  /** Administrators may restate the fees at any stage before granting. */
  adminEdit?: boolean
}

export function FeeAssessmentForm({
  applicationId,
  dueDate,
  existingAssessment,
  canAssess,
  canApproveAssessment,
  status,
  transactionCode,
  adminEdit = false,
}: FeeAssessmentFormProps) {
  const [reassessing, setReassessing] = useState(false)

  const canRecord = (status === "for_assessment" || adminEdit) && canAssess
  // Fees can be re-stated while the assessment is still unapproved — an
  // application returned over a wrong amount is reopened at this stage and
  // would otherwise have nowhere to correct it. Once the CTO head has
  // approved, the figure is what the operator was told to pay, so revising it
  // is not a matter of editing a form — except for an administrator, who can
  // correct a mistake that was only noticed after approval.
  const canRevise =
    canRecord && (!existingAssessment?.approved_at || adminEdit)

  if (existingAssessment && !reassessing) {
    return (
      <AssessmentResult
        assessment={existingAssessment}
        applicationId={applicationId}
        canApprove={canApproveAssessment}
        status={status}
        onRevise={canRevise ? () => setReassessing(true) : undefined}
      />
    )
  }

  if (!canRecord) {
    return null
  }

  return (
    <AssessmentFormInner
      applicationId={applicationId}
      dueDate={dueDate}
      transactionCode={transactionCode}
      // A revision starts from the figures already assessed, so only the line
      // that was wrong has to be retyped.
      previous={existingAssessment}
      onCancel={existingAssessment ? () => setReassessing(false) : undefined}
      onSaved={() => setReassessing(false)}
    />
  )
}

function AssessmentFormInner({
  applicationId,
  dueDate,
  transactionCode,
  previous,
  onCancel,
  onSaved,
}: {
  applicationId: string
  dueDate: string | null
  transactionCode?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previous?: any | null
  onCancel?: () => void
  onSaved?: () => void
}) {
  const guard = useGuardedAction()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A closure owes the certification fee and the payment for closure and
  // nothing else; everything else owes the annual schedule. A revision starts
  // from what was assessed before, a first assessment from the schedule.
  const isClosure = transactionCode === "closure"
  const [fees, setFees] = useState<Record<string, number>>(() => {
    const base = feeScheduleFor(
      transactionCode,
      dueDate ? calculateLatePenalty(new Date(dueDate), new Date()) : 0
    )
    if (!previous) return base
    return Object.fromEntries(
      Object.keys(base).map((key) => [key, Number(previous[key] ?? base[key])])
    )
  })

  // Optional fee toggles
  const [changeOfMotor, setChangeOfMotor] = useState(
    Number(previous?.change_of_motor_fee ?? 0) > 0
  )
  const [replacementPlate, setReplacementPlate] = useState(
    Number(previous?.replacement_plate_fee ?? 0) > 0
  )

  function updateFee(key: string, value: string) {
    const num = parseFloat(value) || 0
    setFees((prev) => ({ ...prev, [key]: num }))
  }

  function toggleChangeOfMotor(checked: boolean) {
    setChangeOfMotor(checked)
    setFees((prev) => ({
      ...prev,
      change_of_motor_fee: checked ? 1000.0 : 0,
    }))
  }

  function toggleReplacementPlate(checked: boolean) {
    setReplacementPlate(checked)
    setFees((prev) => ({
      ...prev,
      replacement_plate_fee: checked ? 500.0 : 0,
    }))
  }

  const total = useMemo(
    () => Object.values(fees).reduce((sum, v) => sum + v, 0),
    [fees]
  )

  async function handleSubmit() {
    const ok = await guard.confirm({
      title: previous ? "Submit the revised assessment?" : "Submit this assessment?",
      description: `Total due: ₱${total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}. It goes to the CTO head for approval before payment is taken.`,
      confirmLabel: "Submit",
    })
    if (!ok) return

    guard.start("Saving the assessment…")
    setSubmitting(true)
    setError(null)

    // Every column is sent; the ones this transaction cannot be charged are
    // simply zero. The action vets the same thing, so a stale form can't
    // price a closure as a renewal.
    const amount = (key: string) => Number(fees[key] ?? 0)
    const result = await createAssessment(applicationId, {
      filing_fee: amount("filing_fee"),
      supervision_fee: amount("supervision_fee"),
      confirmation_fee: amount("confirmation_fee"),
      mayors_permit_fee: amount("mayors_permit_fee"),
      franchise_fee: amount("franchise_fee"),
      police_clearance_fee: amount("police_clearance_fee"),
      health_fee: amount("health_fee"),
      legal_research_fee: amount("legal_research_fee"),
      parking_fee: amount("parking_fee"),
      late_renewal_penalty: amount("late_renewal_penalty"),
      change_of_motor_fee: amount("change_of_motor_fee"),
      replacement_plate_fee: amount("replacement_plate_fee"),
      certification_fee: amount("certification_fee"),
      closure_fee: amount("closure_fee"),
    })

    if (result.error) {
      setError(result.error)
      setSubmitting(false)
      guard.stop()
      return
    }

    // Swapping back to the result unmounts this form, so wait for the
    // refreshed figures before doing it.
    guard.finish(() => {
      setSubmitting(false)
      onSaved?.()
    })
  }

  const standardFeeKeys = Object.keys(STANDARD_FEES)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Fee Assessment
        </CardTitle>
        <CardDescription>
          Per Ordinance No. 1059-13, Section 4E.02
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* A closure is priced on its own terms: these two, and nothing
            else. The annual fees do not apply because nothing is being
            granted for a year. */}
        {isClosure ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Closure Fees</p>
            {feeKeysFor(transactionCode).map((key) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Label className="text-sm flex-1">{FEE_LABELS[key]}</Label>
                <div className="flex items-center gap-1.5 w-32">
                  <span className="text-sm text-muted-foreground">₱</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fees[key] ?? 0}
                    onChange={(e) => updateFee(key, e.target.value)}
                    className="text-right h-7 text-sm"
                    disabled={submitting}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
          {/* Standard fees */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Standard Fees</p>
            {standardFeeKeys.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4"
              >
                <Label className="text-sm flex-1">{FEE_LABELS[key]}</Label>
                <div className="flex items-center gap-1.5 w-32">
                  <span className="text-sm text-muted-foreground">₱</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fees[key]}
                    onChange={(e) => updateFee(key, e.target.value)}
                    className="text-right h-7 text-sm"
                    disabled={submitting}
                  />
                </div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Late renewal penalty */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Late Renewal Penalty</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">{FEE_LABELS.late_renewal_penalty}</Label>
                <p className="text-xs text-muted-foreground">
                  {dueDate
                    ? `Permit expiry: ${dueDate} — charged only for days past it`
                    : "Applies to a late renewal only"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 w-32">
                <span className="text-sm text-muted-foreground">₱</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fees.late_renewal_penalty}
                  onChange={(e) =>
                    updateFee("late_renewal_penalty", e.target.value)
                  }
                  className="text-right h-7 text-sm"
                  disabled={submitting}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Optional fees */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Other Fees (if applicable)</p>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={changeOfMotor}
                  onCheckedChange={(c) => toggleChangeOfMotor(c as boolean)}
                  disabled={submitting}
                />
                <Label className="text-sm cursor-pointer">
                  {FEE_LABELS.change_of_motor_fee}
                </Label>
              </div>
              <div className="flex items-center gap-1.5 w-32">
                <span className="text-sm text-muted-foreground">₱</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fees.change_of_motor_fee}
                  onChange={(e) =>
                    updateFee("change_of_motor_fee", e.target.value)
                  }
                  className="text-right h-7 text-sm"
                  disabled={!changeOfMotor || submitting}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={replacementPlate}
                  onCheckedChange={(c) => toggleReplacementPlate(c as boolean)}
                  disabled={submitting}
                />
                <Label className="text-sm cursor-pointer">
                  {FEE_LABELS.replacement_plate_fee}
                </Label>
              </div>
              <div className="flex items-center gap-1.5 w-32">
                <span className="text-sm text-muted-foreground">₱</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fees.replacement_plate_fee}
                  onChange={(e) =>
                    updateFee("replacement_plate_fee", e.target.value)
                  }
                  className="text-right h-7 text-sm"
                  disabled={!replacementPlate || submitting}
                />
              </div>
            </div>
          </div>

          </>
        )}

        <Separator />

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg border-2 px-4 py-3">
          <span className="text-sm font-semibold">Total Amount</span>
          <span className="text-lg font-bold">
            ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {previous ? "Submit Revised Assessment" : "Submit Assessment"}
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
      {guard.element}
    </Card>
  )
}

function AssessmentResult({
  assessment,
  applicationId,
  canApprove,
  status,
  onRevise,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assessment: any
  applicationId: string
  canApprove: boolean
  status: MtopStatus
  /** Set only while the assessment is unapproved and this stage is open. */
  onRevise?: () => void
}) {
  const guard = useGuardedAction()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isApproved = !!assessment.approved_at

  const feeEntries = [
    ["filing_fee", assessment.filing_fee],
    ["supervision_fee", assessment.supervision_fee],
    ["confirmation_fee", assessment.confirmation_fee],
    ["mayors_permit_fee", assessment.mayors_permit_fee],
    ["franchise_fee", assessment.franchise_fee],
    ["police_clearance_fee", assessment.police_clearance_fee],
    ["health_fee", assessment.health_fee],
    ["legal_research_fee", assessment.legal_research_fee],
    ["parking_fee", assessment.parking_fee],
    ["late_renewal_penalty", assessment.late_renewal_penalty],
    ["change_of_motor_fee", assessment.change_of_motor_fee],
    ["replacement_plate_fee", assessment.replacement_plate_fee],
    ["certification_fee", assessment.certification_fee],
    ["closure_fee", assessment.closure_fee],
  ].filter(([, amount]) => Number(amount) > 0) as [string, number][]

  async function handleApprove() {
    const ok = await guard.confirm({
      title: "Approve this assessment?",
      description: `₱${Number(assessment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })} becomes the amount the operator is told to pay, and the cashier can take payment against it.`,
      confirmLabel: "Approve",
    })
    if (!ok) return

    guard.start("Approving the assessment…")
    setLoading(true)
    setError(null)

    const result = await approveAssessment(assessment.id, applicationId)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      guard.stop()
      return
    }

    guard.finish()
    setLoading(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Fee Assessment
        </CardTitle>
        <CardDescription>
          Assessed by {assessment.assessor?.full_name ?? "—"}
          {isApproved && (
            <Badge className="ml-2 bg-green-100 text-green-800 hover:bg-green-100 text-xs">
              <Check className="mr-1 h-3 w-3" />
              Approved
            </Badge>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Fee breakdown */}
        {feeEntries.map(([key, amount]) => (
          <div
            key={key}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">{FEE_LABELS[key]}</span>
            <span>
              ₱{Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between font-semibold">
          <span>Total</span>
          <span>
            ₱{Number(assessment.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* CTO Head approval belongs to this stage; revising is offered
            wherever onRevise was granted. */}
        {((status === "for_assessment" && !isApproved && canApprove) ||
          onRevise) && (
          <div className="flex flex-wrap gap-2 pt-2">
            {canApprove && status === "for_assessment" && !isApproved && (
              <Button onClick={handleApprove} disabled={loading}>
                {loading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Approve Assessment
              </Button>
            )}
            {onRevise && (
              <Button variant="outline" onClick={onRevise} disabled={loading}>
                <Calculator className="mr-2 h-4 w-4" />
                Revise Assessment
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {guard.element}
    </Card>
  )
}
