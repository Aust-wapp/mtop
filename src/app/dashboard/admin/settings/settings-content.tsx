"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Loader2, CalendarClock, Bell, Phone, Stamp } from "lucide-react"
import {
  systemSettingsSchema,
  type SystemSettingsFormValues,
} from "@/lib/schemas/mtop"
import {
  updateSystemSettings,
  updateSignatoryDetails,
  type SystemSettings,
  type SignatoryDetails,
} from "@/lib/actions/settings"
import { toast } from "sonner"
import { SignatureControl } from "./signature-control"

const signatoryKeys = ["mayor_name", "mayor_designation", "city_treasurer_name", "city_treasurer_designation"] as const

export function SettingsContent({ settings, mayorPreviewUrl, treasurerPreviewUrl, sampleApplicationId }: {
  settings: SystemSettings
  mayorPreviewUrl: string | null
  treasurerPreviewUrl: string | null
  sampleApplicationId: string | null
}) {
  const [saving, setSaving] = useState(false)
  const [savingSignatories, setSavingSignatories] = useState(false)
  const [savedDetails, setSavedDetails] = useState<SignatoryDetails>(() => ({
    mayor_name: settings.mayor_name,
    mayor_designation: settings.mayor_designation,
    city_treasurer_name: settings.city_treasurer_name,
    city_treasurer_designation: settings.city_treasurer_designation,
  }))

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: {
      permit_validity_years: settings.permit_validity_years,
      renewal_window_days: settings.renewal_window_days,
      abandonment_grace_days: settings.abandonment_grace_days,
      ctms_contact_number: settings.ctms_contact_number,
      mayor_name: settings.mayor_name,
      city_treasurer_name: settings.city_treasurer_name,
      mayor_designation: settings.mayor_designation,
      city_treasurer_designation: settings.city_treasurer_designation,
    },
  })

  const currentDetails = Object.fromEntries(
    signatoryKeys.map((key) => [key, watch(key) ?? ""]),
  ) as SignatoryDetails
  const detailsChanged = signatoryKeys.some((key) => currentDetails[key] !== savedDetails[key])

  async function saveSignatories() {
    const values = Object.fromEntries(
      signatoryKeys.map((key) => [key, getValues(key)]),
    ) as SignatoryDetails
    setSavingSignatories(true)
    try {
      const result = await updateSignatoryDetails(values)
      if (result.error || !result.data) {
        toast.error(result.error ?? "Could not save signatory details. Please retry.")
        return
      }
      for (const key of signatoryKeys) {
        if (getValues(key) === values[key]) setValue(key, result.data[key])
      }
      setSavedDetails(result.data)
      toast.success("Signatory details saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save signatory details. Please retry.")
    } finally {
      setSavingSignatories(false)
    }
  }

  async function onSubmit(data: Record<string, unknown>) {
    setSaving(true)
    const result = await updateSystemSettings({ ...data, ...savedDetails } as SystemSettingsFormValues)
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Settings updated successfully")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Permit Validity
          </CardTitle>
          <CardDescription>
            Used to display validity on legacy Franchise Cards without stored
            issuance and expiration dates. New Franchise and Renewal grants use
            the dates selected during approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="permit_validity_years">Legacy card validity (years)</Label>
            <Input
              id="permit_validity_years"
              type="number"
              min={1}
              max={10}
              className="w-32"
              {...register("permit_validity_years")}
            />
            {errors.permit_validity_years && (
              <p className="text-xs text-destructive">
                {errors.permit_validity_years.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Post-Expiry Abandonment Period
          </CardTitle>
          <CardDescription>
            Number of days after a franchise permit expires before its permit
            status becomes Abandoned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="abandonment_grace_days">Days after expiry</Label>
            <Input
              id="abandonment_grace_days"
              type="number"
              min={0}
              step={1}
              className="w-32"
              {...register("abandonment_grace_days")}
            />
            {errors.abandonment_grace_days && (
              <p className="text-xs text-destructive">
                {errors.abandonment_grace_days.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Renewal Window
          </CardTitle>
          <CardDescription>
            How many days before expiration a permit is flagged as &ldquo;due
            for renewal&rdquo;. This helps staff identify permits that need
            attention soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="renewal_window_days">Renewal window (days)</Label>
            <Input
              id="renewal_window_days"
              type="number"
              min={1}
              max={365}
              className="w-32"
              {...register("renewal_window_days")}
            />
            {errors.renewal_window_days && (
              <p className="text-xs text-destructive">
                {errors.renewal_window_days.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-4 w-4" />
            CTMS Contact Number
          </CardTitle>
          <CardDescription>
            Contact number for the City Traffic Management System office. Shown
            to staff and printed on issued permits and franchise cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="ctms_contact_number">Contact number</Label>
            <Input
              id="ctms_contact_number"
              type="tel"
              inputMode="tel"
              placeholder="(088) 521-1234"
              className="w-64"
              {...register("ctms_contact_number")}
            />
            {errors.ctms_contact_number && (
              <p className="text-xs text-destructive">
                {errors.ctms_contact_number.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Stamp className="h-4 w-4" />
            Signatory
          </CardTitle>
          <CardDescription>
            Configure the Mayor and Treasurer for future grants and preview how
            their names, designations, and signatures appear together on the
            Franchise Card.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Preview name and designation edits before saving. Signature uploads are saved separately.
            Previously granted permits keep their recorded signatories.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-4 rounded-lg border p-4" aria-label="City Mayor signatory settings">
              <h3 className="text-sm font-semibold">City Mayor</h3>
              <div className="space-y-2">
                <Label htmlFor="mayor_name">Full name</Label>
                <Input
                  id="mayor_name"
                  placeholder="Enter Mayor's full name"
                  className="w-full"
                  {...register("mayor_name")}
                />
                {errors.mayor_name && (
                  <p className="text-xs text-destructive">{errors.mayor_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mayor_designation">Official designation</Label>
                <Input id="mayor_designation" {...register("mayor_designation")} />
                {errors.mayor_designation && (
                  <p className="text-xs text-destructive">{errors.mayor_designation.message}</p>
                )}
              </div>
              <SignatureControl
                official="mayor"
                label="City Mayor"
                configured={Boolean(settings.mayor_signature_path)}
                existingUrl={mayorPreviewUrl}
                name={watch("mayor_name") || ""}
                designation={watch("mayor_designation") || ""}
              />
            </section>
            <section className="space-y-4 rounded-lg border p-4" aria-label="City Treasurer signatory settings">
              <h3 className="text-sm font-semibold">City Treasurer</h3>
              <div className="space-y-2">
                <Label htmlFor="city_treasurer_name">Full name</Label>
                <Input
                  id="city_treasurer_name"
                  placeholder="Enter Treasurer's full name"
                  className="w-full"
                  {...register("city_treasurer_name")}
                />
                {errors.city_treasurer_name && (
                  <p className="text-xs text-destructive">{errors.city_treasurer_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="city_treasurer_designation">Official designation</Label>
                <Input id="city_treasurer_designation" {...register("city_treasurer_designation")} />
                {errors.city_treasurer_designation && (
                  <p className="text-xs text-destructive">{errors.city_treasurer_designation.message}</p>
                )}
              </div>
              <SignatureControl
                official="city_treasurer"
                label="City Treasurer"
                configured={Boolean(settings.city_treasurer_signature_path)}
                existingUrl={treasurerPreviewUrl}
                name={watch("city_treasurer_name") || ""}
                designation={watch("city_treasurer_designation") || ""}
              />
            </section>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={savingSignatories || !detailsChanged} onClick={() => void saveSignatories()}>
              {savingSignatories && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Signatory Details
            </Button>
            <span role="status" className="text-sm text-muted-foreground">
              {detailsChanged ? "Unsaved name or designation changes" : "Signatory details saved"}
            </span>
          </div>
          {sampleApplicationId ? (
            <a className="inline-block text-sm font-medium underline underline-offset-4" href={`/print/mtop/${sampleApplicationId}?signatories=current`} target="_blank" rel="noopener noreferrer">
              Preview Franchise Card with Current Signatories
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">A full card preview will be available once a sample application is Granted.</p>
          )}
        </CardContent>
      </Card>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Settings
      </Button>
    </form>
  )
}
