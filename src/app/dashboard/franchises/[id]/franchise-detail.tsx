"use client"

import Link from "next/link"
import { format } from "date-fns"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { ExpirationBadge } from "@/components/shared/expiration-badge"
import { HistoryTimeline } from "@/components/shared/history-timeline"
import { ReadOnlyField } from "@/app/dashboard/applications/new/read-only-field"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { AlertCircle, ArrowLeft } from "lucide-react"
import { getExpirationStatus } from "@/lib/utils/permit-expiration"
import type { FranchiseHistoryEvent } from "@/lib/audit"
import type { MtopFranchise, MtopApplication, MtopStatus, TransactionType } from "@/types/database"

export type FranchiseRecord = MtopFranchise & {
  association?: { id: string; name: string } | null
  creator?: { id: string; full_name: string | null } | null
}

export type FranchiseTransaction = MtopApplication & {
  transaction_type?: Pick<
    TransactionType,
    "id" | "code" | "name" | "grant_effect"
  > | null
}

const franchiseStatusLabels: Record<string, string> = {
  active: "Active",
  closed: "Closed",
  abandoned: "Abandoned",
  revoked: "Revoked",
  cancelled: "Cancelled",
}

/**
 * The franchise record — the operator's permanent file, as opposed to any one
 * transaction filed against it. An MTOP number outlives every application
 * attached to it, so this is where its identity, its current unit and driver,
 * and its full audit trail live.
 */
export function FranchiseDetail({
  franchise,
  applications,
  history,
  historyError,
  renewalWindowDays,
  backHref = "/dashboard/applications",
  backLabel = "Back to applications",
  operatorMode = false,
}: {
  franchise: FranchiseRecord
  applications: FranchiseTransaction[]
  history: FranchiseHistoryEvent[]
  historyError: string | null
  renewalWindowDays: number
  backHref?: string
  backLabel?: string
  operatorMode?: boolean
}) {
  const expiration = franchise.granted_until
    ? getExpirationStatus(franchise.granted_until, renewalWindowDays)
    : null
  const initialGrant = applications
    .filter(
      (application) =>
        application.status === "granted" &&
        application.transaction_type?.grant_effect === "issue_number" &&
        application.granted_at
    )
    .sort((left, right) =>
      (left.granted_at ?? "").localeCompare(right.granted_at ?? "")
    )[0]

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "gap-1.5 -ml-2",
        })}
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <PageHeader
        title={
          operatorMode
            ? franchise.applicant_name
            : franchise.mtop_number ?? "Unnumbered franchise"
        }
        subtitle={
          operatorMode
            ? `MTOP No. ${franchise.mtop_number}`
            : franchise.applicant_name
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              {franchiseStatusLabels[franchise.franchise_status] ??
                franchise.franchise_status}
            </span>
            {expiration && (
              <ExpirationBadge
                status={expiration.status}
                daysRemaining={expiration.daysRemaining}
              />
            )}
          </div>
        }
      />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {operatorMode ? (
            <>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </>
          ) : (
            <TabsTrigger value="history">History</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {operatorMode ? "Operator details" : "Operator"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                  <ReadOnlyField label="Name" value={franchise.applicant_name} />
                  <ReadOnlyField
                    label="Contact number"
                    value={franchise.contact_number}
                  />
                  <div className="sm:col-span-2">
                    <ReadOnlyField
                      label="Address"
                      value={franchise.applicant_address}
                    />
                  </div>
                  <ReadOnlyField
                    label="Association"
                    value={franchise.association?.name ?? "No association (striker)"}
                  />
                  {!operatorMode && (
                    <ReadOnlyField
                      label="Renewal due"
                      value={
                        franchise.granted_until
                          ? format(new Date(franchise.granted_until), "MMM d, yyyy")
                          : null
                      }
                    />
                  )}
                </dl>
              </CardContent>
            </Card>

            {operatorMode && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">MTOP / Franchise</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                    <ReadOnlyField
                      label="MTOP number"
                      value={franchise.mtop_number}
                      mono
                    />
                    <ReadOnlyField
                      label="Franchise status"
                      value={
                        franchiseStatusLabels[franchise.franchise_status] ??
                        franchise.franchise_status
                      }
                    />
                    <ReadOnlyField
                      label="Date granted"
                      value={
                        initialGrant?.granted_at
                          ? format(
                              new Date(initialGrant.granted_at),
                              "MMM d, yyyy"
                            )
                          : null
                      }
                    />
                    <ReadOnlyField
                      label="Valid through"
                      value={
                        franchise.granted_until
                          ? format(
                              new Date(franchise.granted_until),
                              "MMM d, yyyy"
                            )
                          : null
                      }
                    />
                    <div className="min-w-0">
                      <dt className="mb-1 text-xs text-muted-foreground">
                        Original application
                      </dt>
                      {initialGrant ? (
                        <Link
                          href={`/dashboard/applications/${initialGrant.id}`}
                          className="break-all font-mono text-xs underline-offset-2 hover:underline"
                        >
                          {initialGrant.id}
                        </Link>
                      ) : (
                        <dd className="font-medium">—</dd>
                      )}
                    </div>
                  </dl>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Driver</CardTitle>
                <CardDescription>
                  The driver currently on file for this franchise. Every change
                  to these fields is kept under {operatorMode ? "Activity" : "History"}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                  <ReadOnlyField label="Name" value={franchise.driver_name} />
                  <ReadOnlyField
                    label="Licence number"
                    value={franchise.driver_license_number}
                    mono
                  />
                  <div className="sm:col-span-2">
                    <ReadOnlyField
                      label="Address"
                      value={franchise.driver_address}
                    />
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Unit</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                  <ReadOnlyField
                    label="Motor number"
                    value={franchise.motor_number}
                    mono
                  />
                  <ReadOnlyField
                    label="Chassis number"
                    value={franchise.chassis_number}
                    mono
                  />
                  <ReadOnlyField
                    label="Plate number"
                    value={franchise.plate_number}
                    mono
                  />
                  <ReadOnlyField
                    label="Body number"
                    value={franchise.tricycle_body_number}
                    mono
                  />
                  <ReadOnlyField label="Make" value={franchise.make} />
                  <ReadOnlyField label="Day off" value={franchise.day_off} />
                  <div className="sm:col-span-2">
                    <ReadOnlyField label="Route" value={franchise.route} />
                  </div>
                </dl>
              </CardContent>
            </Card>
            {!operatorMode && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Transactions</CardTitle>
                  <CardDescription>
                    Every transaction filed against this franchise, newest
                    first.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {applications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No transactions filed yet.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {applications.map((application) => (
                        <li
                          key={application.id}
                          className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/applications/${application.id}`}
                              className="text-sm font-medium hover:underline underline-offset-2"
                            >
                              {application.transaction_type?.name ??
                                "Transaction"}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              Filed{" "}
                              {format(
                                new Date(application.submitted_at),
                                "MMM d, yyyy"
                              )}
                            </p>
                          </div>
                          <StatusBadge status={application.status as MtopStatus} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {operatorMode && (
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transactions</CardTitle>
                <CardDescription>
                  Applications and business transactions filed against this MTOP
                  record, newest first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {applications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No transactions filed yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {applications.map((application) => (
                      <li
                        key={application.id}
                        className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <Link
                            href={`/dashboard/applications/${application.id}`}
                            className="text-sm font-medium underline-offset-2 hover:underline"
                          >
                            {application.transaction_type?.name ??
                              "Transaction"}
                          </Link>
                          <p className="break-all text-xs text-muted-foreground">
                            <span className="font-mono">
                              Application ID {application.id}
                            </span>
                            {" · "}Filed{" "}
                            {format(
                              new Date(application.submitted_at),
                              "MMM d, yyyy"
                            )}
                            {application.granted_at && (
                              <>
                                {" · "}Completed{" "}
                                {format(
                                  new Date(application.granted_at),
                                  "MMM d, yyyy"
                                )}
                              </>
                            )}
                          </p>
                        </div>
                        <StatusBadge
                          status={application.status as MtopStatus}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value={operatorMode ? "activity" : "history"}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {operatorMode ? "Activity" : "Audit trail"}
              </CardTitle>
              <CardDescription>
                {operatorMode
                  ? "Recorded changes, application events, and approval decisions for this MTOP record."
                  : "Every recorded change to this franchise — operator, driver, unit and status — alongside the transactions and approvals that accompanied them."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{historyError}</AlertDescription>
                </Alert>
              ) : (
                <HistoryTimeline events={history} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
