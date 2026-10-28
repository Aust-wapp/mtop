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
  type SystemSettings,
} from "@/lib/actions/settings"
import { toast } from "sonner"

export function SettingsContent({ settings }: { settings: SystemSettings }) {
  const [saving, setSaving] = useState(false)

  const {
    register,
    handleSubmit,
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
    },
  })

  async function onSubmit(data: Record<string, unknown>) {
    setSaving(true)
    const result = await updateSystemSettings(data as SystemSettingsFormValues)
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
            How many years a permit remains valid after being granted. Once this
            period elapses, the permit is considered expired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="permit_validity_years">Validity period (years)</Label>
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
            The name printed under &ldquo;APPROVED:&rdquo; on the confirmation
            slip. It changes with the administration, so it lives here rather
            than in the document.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="mayor_name">City Mayor</Label>
            <Input
              id="mayor_name"
              placeholder="ATTY. JUAN DELA CRUZ"
              className="w-80"
              {...register("mayor_name")}
            />
            {errors.mayor_name && (
              <p className="text-xs text-destructive">
                {errors.mayor_name.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="city_treasurer_name">City Treasurer</Label>
            <Input
              id="city_treasurer_name"
              placeholder="CITY TREASURER NAME"
              className="w-80"
              {...register("city_treasurer_name")}
            />
            {errors.city_treasurer_name && (
              <p className="text-xs text-destructive">
                {errors.city_treasurer_name.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save Settings
      </Button>
    </form>
  )
}
