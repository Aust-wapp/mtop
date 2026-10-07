"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import {
  newFranchiseApplicationSchema,
  type NewFranchiseApplicationFormValues,
} from "@/lib/schemas/mtop";
import {
  createNewFranchiseApplication,
  checkOperatorAvailability,
} from "@/lib/actions/applications"
import { useUnitIdentifierCheck } from "@/lib/hooks/use-unit-identifier-check"
import { AssociationSelect } from "@/components/mtop/association-select"
import { BarangaySelect } from "@/components/mtop/barangay-select";
import { OperatorNameFields } from "@/components/mtop/operator-name-fields"
import { composeOperatorName } from "@/lib/operator-name"
import type { TransactionType } from "@/types/database";
import { RequirementsPreview } from "./requirements-preview";

export function NewFranchiseForm({
  transactionType,
  onBack,
  onSubmitted,
}: {
  transactionType: TransactionType;
  onBack: () => void;
  onSubmitted: (applicationId: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  // Only one operator is allowed per franchise, and an operator may hold only
  // one. Both are hard rules in the database — this just surfaces the answer
  // while the clerk is still on the first field.
  const [operatorBlock, setOperatorBlock] = useState<string | null>(null)
  // Tracked off register()'s own onChange rather than react-hook-form's
  // watch(), which React Compiler refuses to memoize around.
  const [operatorName, setOperatorName] = useState("")

  // Same story for the four numbers that identify the tricycle citywide: a
  // body, plate, motor or chassis number already on another active franchise
  // is refused by the database, so say so here rather than on submit.
  const [bodyNumber, setBodyNumber] = useState("")
  const [plateNumber, setPlateNumber] = useState("")
  const [motorNumber, setMotorNumber] = useState("")
  const [chassisNumber, setChassisNumber] = useState("")

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewFranchiseApplicationFormValues>({
    resolver: zodResolver(newFranchiseApplicationSchema),
    defaultValues: {
      last_name: "",
      first_name: "",
      middle_name: "",
      suffix: "",
      barangay: "",
      purok: "",
      contact_number: "",
      tricycle_body_number: "",
      plate_number: "",
      motor_number: "",
      chassis_number: "",
      route: "",
      association_id: "",
      make: "",
      day_off: "",
    },
  });

  const bodyNumberField = register("tricycle_body_number")
  const plateNumberField = register("plate_number")
  const motorNumberField = register("motor_number")
  const chassisNumberField = register("chassis_number")

  const unitConflicts = useUnitIdentifierCheck({
    bodyNumber,
    plateNumber,
    motorNumber,
    chassisNumber,
  })

  useEffect(() => {
    const name = operatorName?.trim() ?? ""
    if (name.length < 2) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await checkOperatorAvailability(name)
      if (cancelled || result.error) return

      if (result.heldFranchise) {
        setOperatorBlock(
          `${result.heldFranchise.applicant_name} already holds an active franchise${
            result.heldFranchise.mtop_number
              ? ` (${result.heldFranchise.mtop_number})`
              : " (application in progress)"
          }. An operator may only hold one franchise.`
        )
      } else {
        setOperatorBlock(null)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [operatorName])

  async function onSubmit(data: NewFranchiseApplicationFormValues) {
    setServerError(null);
    const result = await createNewFranchiseApplication(data);
    if (result.error || !result.data) {
      setServerError(result.error ?? "Failed to create application");
      return;
    }
    onSubmitted(result.data.id);
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
        <ArrowLeft className="h-4 w-4" /> Choose a different transaction
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-6 lg:col-span-2"
        >
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Applicant Information</CardTitle>
              <CardDescription>
                Personal details of the tricycle operator
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <OperatorNameFields
                  fields={{
                    last: register("last_name"),
                    first: register("first_name"),
                    middle: register("middle_name"),
                    suffix: register("suffix"),
                  }}
                  errors={{
                    last: errors.last_name?.message,
                    first: errors.first_name?.message,
                    middle: errors.middle_name?.message,
                    suffix: errors.suffix?.message,
                  }}
                  onNameChange={(parts) =>
                    setOperatorName(composeOperatorName(parts))
                  }
                />
                {operatorBlock && (
                  <p className="text-xs text-destructive">{operatorBlock}</p>
                )}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact_number">Contact Number</Label>
                  <Input
                    id="contact_number"
                    placeholder="09XX-XXX-XXXX"
                    {...register("contact_number")}
                    aria-invalid={!!errors.contact_number}
                  />
                  {errors.contact_number && (
                    <p className="text-xs text-destructive">
                      {errors.contact_number.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="barangay">Barangay</Label>
                  <BarangaySelect
                    id="barangay"
                    invalid={!!errors.barangay}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tricycle Details</CardTitle>
              <CardDescription>
                Vehicle registration and identification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tricycle_body_number">Body Number</Label>
                  <Input
                    id="tricycle_body_number"
                    placeholder="e.g., 1234"
                    {...bodyNumberField}
                    onChange={(e) => {
                      bodyNumberField.onChange(e)
                      setBodyNumber(e.target.value)
                    }}
                    aria-invalid={
                      !!errors.tricycle_body_number ||
                      !!unitConflicts.tricycle_body_number
                    }
                  />
                  {errors.tricycle_body_number ? (
                    <p className="text-xs text-destructive">
                      {errors.tricycle_body_number.message}
                    </p>
                  ) : unitConflicts.tricycle_body_number ? (
                    <p className="text-xs text-destructive">
                      {unitConflicts.tricycle_body_number}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="plate_number">Plate Number</Label>
                  <Input
                    id="plate_number"
                    placeholder="e.g., AB-1234"
                    {...plateNumberField}
                    onChange={(e) => {
                      plateNumberField.onChange(e)
                      setPlateNumber(e.target.value)
                    }}
                    aria-invalid={
                      !!errors.plate_number || !!unitConflicts.plate_number
                    }
                  />
                  {errors.plate_number ? (
                    <p className="text-xs text-destructive">
                      {errors.plate_number.message}
                    </p>
                  ) : unitConflicts.plate_number ? (
                    <p className="text-xs text-destructive">
                      {unitConflicts.plate_number}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="motor_number">Motor Number</Label>
                  <Input
                    id="motor_number"
                    placeholder="e.g., ABC123456"
                    {...motorNumberField}
                    onChange={(e) => {
                      motorNumberField.onChange(e)
                      setMotorNumber(e.target.value)
                    }}
                    aria-invalid={
                      !!errors.motor_number || !!unitConflicts.motor_number
                    }
                  />
                  {errors.motor_number ? (
                    <p className="text-xs text-destructive">
                      {errors.motor_number.message}
                    </p>
                  ) : unitConflicts.motor_number ? (
                    <p className="text-xs text-destructive">
                      {unitConflicts.motor_number}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chassis_number">Chassis Number</Label>
                  <Input
                    id="chassis_number"
                    placeholder="e.g., XYZ987654"
                    {...chassisNumberField}
                    onChange={(e) => {
                      chassisNumberField.onChange(e)
                      setChassisNumber(e.target.value)
                    }}
                    aria-invalid={
                      !!errors.chassis_number || !!unitConflicts.chassis_number
                    }
                  />
                  {errors.chassis_number ? (
                    <p className="text-xs text-destructive">
                      {errors.chassis_number.message}
                    </p>
                  ) : unitConflicts.chassis_number ? (
                    <p className="text-xs text-destructive">
                      {unitConflicts.chassis_number}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Input
                    id="make"
                    placeholder="e.g., Kawasaki"
                    {...register("make")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="day_off">Day Off</Label>
                  <Input
                    id="day_off"
                    placeholder="e.g., Every Tuesday and Sunday"
                    {...register("day_off")}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="association_id">Association (optional)</Label>
                  <AssociationSelect
                    id="association_id"
                    invalid={!!errors.association_id}
                    {...register("association_id")}
                  />
                  {errors.association_id && (
                    <p className="text-xs text-destructive">
                      {errors.association_id.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Route</CardTitle>
              <CardDescription>Assigned route</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="route">Route</Label>
                <Input
                  id="route"
                  placeholder="e.g., Poblacion - Barangay San Antonio"
                  {...register("route")}
                  aria-invalid={!!errors.route}
                />
                {errors.route && (
                  <p className="text-xs text-destructive">
                    {errors.route.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
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
  );
}
