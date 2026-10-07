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
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Calculator,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react"
import { createAssessment, approveAssessment } from "@/lib/actions/assessments"
import {
  STANDARD_FEE_KEYS,
  TRANSACTION_FEE_KEYS,
  FEE_LABELS,
  calculateFeeTotal,
  calculateLatePenalty,
  feeScheduleFor,
  feeKeysFor,
  LOST_PLATE_REPLACEMENT_FEE,
  type FeeKey,
} from "@/lib/fees"
import type { MtopStatus } from "@/types/database"

const FEE_SECTIONS = [
  { title: "Standard Fees", keys: STANDARD_FEE_KEYS },
  { title: "Late Renewal Penalty", keys: ["late_renewal_penalty"] as const },
  { title: "Other / Transaction Fees", keys: TRANSACTION_FEE_KEYS },
] as const

interface FeeAssessmentFormProps {
  applicationId: string
  dueDate: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingAssessment: any | null
  canAssess: boolean
  canApproveAssessment: boolean
  status: MtopStatus
  /** Selects the fee schedule for this application. */
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
      key={`${applicationId}:${transactionCode ?? "unknown"}:${dueDate ?? "none"}:${existingAssessment?.id ?? "new"}`}
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

  const applicableFeeKeys = new Set(feeKeysFor(transactionCode))
  const [fees, setFees] = useState<Record<FeeKey, number>>(() => {
    const base = feeScheduleFor(
      transactionCode,
      dueDate ? calculateLatePenalty(new Date(dueDate), new Date()) : 0
    )
    if (!previous) return base
    for (const key of applicableFeeKeys) {
      if (previous[key] !== undefined && previous[key] !== null) {
        const previousValue = Number(previous[key])
        if (key === "replacement_plate_fee") {
          base[key] =
            previousValue === LOST_PLATE_REPLACEMENT_FEE
              ? LOST_PLATE_REPLACEMENT_FEE
              : 0
          continue
        }

        base[key] = previousValue
      }
    }
    return base
  })

  function updateFee(key: FeeKey, value: string) {
    const num = parseFloat(value) || 0
    setFees((prev) => ({ ...prev, [key]: num }))
  }

  const total = useMemo(
    () => calculateFeeTotal(fees),
    [fees]
  )

  async function handleSubmit() {
    const ok = await guard.confirm({
      title: previous
        ? "Submit the revised assessment?"
        : "Submit this assessment?",
      description: `Total due: ${formatFeeCurrency(total)}. It goes to the CTO head for approval before payment is taken.`,
      confirmLabel: "Submit",
    })
    if (!ok) return

    guard.start("Saving the assessment…")
    setSubmitting(true)
    setError(null)

    // Every column is sent; the ones this transaction cannot be charged are
    // simply zero. The action vets the same thing, so a stale form can't
    // price a closure as a renewal.
    const amount = (key: FeeKey) => Number(fees[key] ?? 0)
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
      annual_confirmation_fee: amount("annual_confirmation_fee"),
      reissuance_fee: amount("reissuance_fee"),
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

        {FEE_SECTIONS.map(({ title, keys }, sectionIndex) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            {title === "Late Renewal Penalty" &&
              transactionCode === "renewal" && (
                <p className="text-xs text-muted-foreground">
                  {dueDate
                    ? `Permit expiry: ${dueDate} — charged only for days past it`
                    : "Applies to a late renewal only"}
                </p>
              )}
            {keys.map((key) => (
              <AssessmentInputRow
                key={key}
                feeKey={key}
                value={fees[key]}
                readOnly={!applicableFeeKeys.has(key)}
                disabled={submitting}
                onChange={(value) => updateFee(key, value)}
                onOptionalToggle={(checked) =>
                  setFees((prev) => ({
                    ...prev,
                    replacement_plate_fee: checked
                      ? LOST_PLATE_REPLACEMENT_FEE
                      : 0,
                  }))
                }
              />
            ))}
            {sectionIndex < FEE_SECTIONS.length - 1 && <Separator />}
          </div>
        ))}

        <Separator />

        {/* Total */}
        <div className="flex items-center justify-between rounded-lg border-2 px-4 py-3">
          <span className="text-sm font-semibold">Total Amount</span>
          <span className="text-lg font-bold">
            {formatFeeCurrency(total)}
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

function AssessmentInputRow({
  feeKey,
  value,
  readOnly,
  disabled,
  onChange,
  onOptionalToggle,
}: {
  feeKey: FeeKey
  value: number
  readOnly: boolean
  disabled: boolean
  onChange: (value: string) => void
  onOptionalToggle: (checked: boolean) => void
}) {
  const inputId = `assessment-${feeKey}`

  if (feeKey === "replacement_plate_fee") {
    const checked = value === LOST_PLATE_REPLACEMENT_FEE
    const checkboxId = `${inputId}-toggle`

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={checked}
            onCheckedChange={(nextChecked) =>
              onOptionalToggle(nextChecked === true)
            }
            disabled={disabled || readOnly}
          />
          <Label className="text-sm" htmlFor={checkboxId}>
            {FEE_LABELS[feeKey]}
          </Label>
        </div>
        <div className="flex w-32 items-center gap-1.5">
          <span className="text-sm text-muted-foreground">₱</span>
          <Input
            id={`${inputId}-amount`}
            type="number"
            step="0.01"
            min="0"
            value={value}
            readOnly
            aria-readonly="true"
            className="h-7 text-right text-sm read-only:bg-muted read-only:text-muted-foreground"
            disabled={disabled}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="flex-1 text-sm" htmlFor={inputId}>
        {FEE_LABELS[feeKey]}
      </Label>
      <div className="flex w-32 items-center gap-1.5">
        <span className="text-sm text-muted-foreground">₱</span>
        <Input
          id={inputId}
          type="number"
          step="0.01"
          min="0"
          value={value}
          readOnly={readOnly}
          aria-readonly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 text-right text-sm read-only:bg-muted read-only:text-muted-foreground"
          disabled={disabled}
        />
      </div>
    </div>
  )
}

function formatFeeCurrency(amount: number) {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
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

  async function handleApprove() {
    const ok = await guard.confirm({
      title: "Approve this assessment?",
      description: `${formatFeeCurrency(Number(assessment.total_amount))} becomes the amount the operator is told to pay, and the cashier can take payment against it.`,
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
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {FEE_SECTIONS.map(({ title, keys }, sectionIndex) => (
          <div key={title} className="space-y-2">
            <p className="text-sm font-medium">{title}</p>
            {keys.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="flex-1 text-muted-foreground">
                  {FEE_LABELS[key]}
                </span>
                <span className="w-32 text-right tabular-nums">
                  {formatFeeCurrency(Number(assessment[key] ?? 0))}
                </span>
              </div>
            ))}
            {sectionIndex < FEE_SECTIONS.length - 1 && <Separator />}
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between font-semibold">
          <span>Total</span>
          <span>
            {formatFeeCurrency(Number(assessment.total_amount))}
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
