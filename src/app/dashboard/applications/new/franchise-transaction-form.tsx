"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react"
import { format } from "date-fns"
import {
  franchiseTransactionSchema,
  type FranchiseTransactionFormValues,
  existingFranchiseTransactionCodes,
  requiresReason,
} from "@/lib/schemas/mtop"
import { createFranchiseTransaction } from "@/lib/actions/applications"
import { useUnitIdentifierCheck } from "@/lib/hooks/use-unit-identifier-check"
import type { TransactionType } from "@/types/database"
import type { FranchiseSearchHit } from "./franchise-lookup"
import { RequirementsPreview } from "./requirements-preview"
import { ReadOnlyField } from "./read-only-field"
import { AssociationSelect } from "@/components/mtop/association-select"
import { BarangaySelect } from "@/components/mtop/barangay-select"

type ExistingCode = (typeof existingFranchiseTransactionCodes)[number]

export function FranchiseTransactionForm({
  transactionType,
  franchise,
  onBack,
  onSubmitted,
}: {
  transactionType: TransactionType
  franchise: FranchiseSearchHit
  onBack: () => void
  onSubmitted: (applicationId: string) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const isChangeUnit = transactionType.code === "change_unit"
  const isChangeOwnership = transactionType.code === "change_ownership"
  const needsReason = requiresReason(transactionType.code)

  // Body, plate, motor and chassis are unique across active franchises.
  // Tracked off register()'s own onChange rather than watch(), which React
  // Compiler refuses to memoize around. This franchise is excluded from the
  // lookup, so leaving its own numbers alone never flags them.
  const [bodyNumber, setBodyNumber] = useState(
    franchise.tricycle_body_number ?? ""
  )
  // On a change of unit the plate under test is the staged one — the current
  // plate belongs to the unit being replaced and is not editable here.
  const [motorNumber, setMotorNumber] = useState("")
  const [chassisNumber, setChassisNumber] = useState("")
  const [plateNumber, setPlateNumber] = useState(
    isChangeUnit ? "" : franchise.plate_number ?? ""
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FranchiseTransactionFormValues>({
    resolver: zodResolver(franchiseTransactionSchema),
    defaultValues: {
      franchise_id: franchise.id,
      transaction_type_code: transactionType.code as ExistingCode,
      barangay: franchise.barangay ?? "",
      purok: franchise.purok ?? "",
      contact_number: franchise.contact_number ?? "",
      tricycle_body_number: franchise.tricycle_body_number ?? "",
      plate_number: franchise.plate_number ?? "",
      route: franchise.route ?? "",
      make: franchise.make ?? "",
      day_off: franchise.day_off ?? "",
      association_id: franchise.association_id ?? "",
      due_date: "",
      reason: "",
    },
  })

  const bodyNumberField = register("tricycle_body_number")
  const plateNumberField = register(
    isChangeUnit ? "new_plate_number" : "plate_number"
  )
  // Motor and chassis are only editable on a change of unit, where they are
  // the incoming unit's and staged until grant. On every other transaction
  // they belong to the franchise and are not on this form at all.
  const motorNumberField = register("new_motor_number")
  const chassisNumberField = register("new_chassis_number")

  const unitConflicts = useUnitIdentifierCheck({
    bodyNumber,
    plateNumber,
    motorNumber: isChangeUnit ? motorNumber : "",
    chassisNumber: isChangeUnit ? chassisNumber : "",
    excludeFranchiseId: franchise.id,
    labels: isChangeUnit
      ? {
          plate_number: "New plate number",
          motor_number: "New motor number",
          chassis_number: "New chassis number",
        }
      : undefined,
  })

  async function onSubmit(data: FranchiseTransactionFormValues) {
    setServerError(null)
    const result = await createFranchiseTransaction(data)
    if (result.error || !result.data) {
      setServerError(result.error ?? "Failed to file this transaction")
      return
    }
    onSubmitted(result.data.id)
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="gap-1.5 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to franchise search
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 lg:col-span-2"
        >
          <input type="hidden" {...register("franchise_id")} />
          <input type="hidden" {...register("transaction_type_code")} />

          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Franchise Identity (locked)
              </CardTitle>
              <CardDescription>
                These fields identify the franchise and do not change when
                filing {transactionType.name.toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                <ReadOnlyField
                  label="MTOP Number"
                  value={franchise.mtop_number}
                  mono
                />
                <ReadOnlyField label="Owner" value={franchise.applicant_name} />
                <ReadOnlyField
                  label="Motor Number"
                  value={franchise.motor_number}
                  mono
                />
                <ReadOnlyField
                  label="Chassis Number"
                  value={franchise.chassis_number}
                  mono
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details on File</CardTitle>
              <CardDescription>
                {isChangeOwnership
                  ? "Correct anything about the unit that has changed. The current owner's address and contact number stay on file until the transfer is granted."
                  : "Correct anything that has changed since the last transaction."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!isChangeOwnership && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="barangay">Barangay</Label>
                    <BarangaySelect
                      id="barangay"
                      invalid={!!errors.barangay}
                      // A franchise recorded before the address was structured
                      // has no barangay yet; the picker then simply starts
                      // empty and the old free-text line stays on file until
                      // someone chooses one.
                      currentBarangay={franchise.barangay ?? null}
                      {...register("barangay")}
                    />
                    {errors.barangay && (
                      <p className="text-xs text-destructive">
                        {errors.barangay.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="purok">Purok (optional)</Label>
                    <Input
                      id="purok"
                      placeholder="e.g. Purok 5"
                      {...register("purok")}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                {!isChangeOwnership && (
                  <div className="space-y-2">
                    <Label htmlFor="contact_number">Contact Number</Label>
                    <Input
                      id="contact_number"
                      {...register("contact_number")}
                      aria-invalid={!!errors.contact_number}
                    />
                    {errors.contact_number && (
                      <p className="text-xs text-destructive">
                        {errors.contact_number.message}
                      </p>
                    )}
                  </div>
                )}

                {/* Plate number is part of the unit being replaced on a change
                    of unit — captured in "New Unit Details" instead, not here. */}
                {!isChangeUnit && (
                  <div className="space-y-2">
                    <Label htmlFor="plate_number">Plate Number</Label>
                    <Input
                      id="plate_number"
                      {...plateNumberField}
                      onChange={(e) => {
                        plateNumberField.onChange(e)
                        setPlateNumber(e.target.value)
                      }}
                      aria-invalid={!!unitConflicts.plate_number}
                    />
                    {unitConflicts.plate_number && (
                      <p className="text-xs text-destructive">
                        {unitConflicts.plate_number}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="tricycle_body_number">Body Number</Label>
                  <Input
                    id="tricycle_body_number"
                    {...bodyNumberField}
                    onChange={(e) => {
                      bodyNumberField.onChange(e)
                      setBodyNumber(e.target.value)
                    }}
                    aria-invalid={!!unitConflicts.tricycle_body_number}
                  />
                  {unitConflicts.tricycle_body_number && (
                    <p className="text-xs text-destructive">
                      {unitConflicts.tricycle_body_number}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="route">Route</Label>
                  <Input id="route" {...register("route")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" {...register("make")} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="day_off">Day Off</Label>
                  <Input id="day_off" {...register("day_off")} />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="association_id">Association (optional)</Label>
                  <AssociationSelect
                    id="association_id"
                    currentAssociation={
                      franchise.association_id
                        ? {
                            id: franchise.association_id,
                            name:
                              franchise.association?.name ??
                              "Current association",
                          }
                        : null
                    }
                    {...register("association_id")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date (optional)</Label>
                <Input id="due_date" type="date" {...register("due_date")} />
              </div>
            </CardContent>
          </Card>

          {needsReason && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Reason</CardTitle>
                <CardDescription>
                  Why the operator is filing {transactionType.name.toLowerCase()}.
                  Kept on the application record.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="reason" className="sr-only">
                  Reason
                </Label>
                <Textarea
                  id="reason"
                  rows={3}
                  placeholder={
                    transactionType.code === "reissuance"
                      ? "e.g. Original permit lost"
                      : transactionType.code === "closure"
                        ? "e.g. Unit sold for scrap; operator leaving the trade"
                        : "e.g. Required by LTO for registration renewal"
                  }
                  {...register("reason")}
                  aria-invalid={!!errors.reason}
                />
                {errors.reason && (
                  <p className="text-xs text-destructive">
                    {errors.reason.message}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Change of unit — the new motor/chassis/plate are staged here and
              only applied to the franchise once this transaction is granted
              (mtop.grant_franchise, replace_unit effect). */}
          {isChangeUnit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">New Unit Details</CardTitle>
                <CardDescription>
                  Takes effect only once this transaction is granted — the
                  current unit stays on record until then. Replacing the unit
                  does not extend the franchise:{" "}
                  {franchise.granted_until
                    ? `the renewal due date stays ${format(new Date(franchise.granted_until), "MMM d, yyyy")}.`
                    : "the renewal due date is unchanged."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new_motor_number">New Motor Number</Label>
                    <Input
                      id="new_motor_number"
                      {...motorNumberField}
                      onChange={(e) => {
                        motorNumberField.onChange(e)
                        setMotorNumber(e.target.value)
                      }}
                      aria-invalid={
                        !!errors.new_motor_number || !!unitConflicts.motor_number
                      }
                    />
                    {errors.new_motor_number ? (
                      <p className="text-xs text-destructive">
                        {errors.new_motor_number.message}
                      </p>
                    ) : unitConflicts.motor_number ? (
                      <p className="text-xs text-destructive">
                        {unitConflicts.motor_number}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_chassis_number">New Chassis Number</Label>
                    <Input
                      id="new_chassis_number"
                      {...chassisNumberField}
                      onChange={(e) => {
                        chassisNumberField.onChange(e)
                        setChassisNumber(e.target.value)
                      }}
                      aria-invalid={
                        !!errors.new_chassis_number ||
                        !!unitConflicts.chassis_number
                      }
                    />
                    {errors.new_chassis_number ? (
                      <p className="text-xs text-destructive">
                        {errors.new_chassis_number.message}
                      </p>
                    ) : unitConflicts.chassis_number ? (
                      <p className="text-xs text-destructive">
                        {unitConflicts.chassis_number}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_plate_number">
                      New Plate Number (optional)
                    </Label>
                    <Input
                      id="new_plate_number"
                      placeholder="Leave blank to keep the current plate"
                      {...plateNumberField}
                      onChange={(e) => {
                        plateNumberField.onChange(e)
                        setPlateNumber(e.target.value)
                      }}
                      aria-invalid={!!unitConflicts.plate_number}
                    />
                    {unitConflicts.plate_number && (
                      <p className="text-xs text-destructive">
                        {unitConflicts.plate_number}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Change of ownership — the successor's details are staged here and
              only applied to the franchise once this transaction is granted
              (mtop.grant_franchise, transfer_owner effect). */}
          {isChangeOwnership && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">New Owner Information</CardTitle>
                <CardDescription>
                  Takes effect only once this transaction is granted — the
                  current owner stays on record until then.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="new_applicant_name">New Owner&apos;s Full Name</Label>
                  <Input
                    id="new_applicant_name"
                    {...register("new_applicant_name")}
                    aria-invalid={!!errors.new_applicant_name}
                  />
                  {errors.new_applicant_name && (
                    <p className="text-xs text-destructive">
                      {errors.new_applicant_name.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new_barangay">
                      New Owner&apos;s Barangay
                    </Label>
                    <BarangaySelect
                      id="new_barangay"
                      invalid={!!errors.new_barangay}
                      {...register("new_barangay")}
                    />
                    {errors.new_barangay && (
                      <p className="text-xs text-destructive">
                        {errors.new_barangay.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_purok">
                      New Owner&apos;s Purok (optional)
                    </Label>
                    <Input
                      id="new_purok"
                      placeholder="e.g. Purok 5"
                      {...register("new_purok")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_contact_number">
                      New Owner&apos;s Contact Number
                    </Label>
                    <Input
                      id="new_contact_number"
                      {...register("new_contact_number")}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              File {transactionType.name}
            </Button>
          </div>
        </form>

        <div>
          <RequirementsPreview
            key={transactionType.id}
            transactionTypeId={transactionType.id}
            transactionName={transactionType.name}
          />
        </div>
      </div>
    </div>
  )
}
