"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge, getStatusLabel } from "@/components/shared/status-badge"
import {
  FileText,
  Clock,
  CheckCircle,
  Banknote,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { MtopStatus, ApprovalAction } from "@/types/database"

interface DashboardStats {
  totalApplications: number
  pending: number
  granted: number
  revenue: number
}

interface PipelineItem {
  status: MtopStatus
  count: number
}

interface RenewalStats {
  expired: number
  dueForRenewal: number
  active: number
}

interface ActivityEntry {
  id: string
  stage: MtopStatus
  action: ApprovalAction
  remarks: string | null
  created_at: string
  actor?: { id: string; full_name: string } | null
  application?: {
    id: string
    franchise?: {
      mtop_number: string | null
      applicant_name: string
    } | null
  } | null
}

const statCards = [
  {
    key: "totalApplications" as const,
    title: "Total Applications",
    icon: FileText,
    description: "Current fiscal year",
    format: (v: number) => v.toLocaleString(),
    accent: "border-blue-500",
    iconBg: "bg-blue-50 text-blue-600",
    valueCls: "text-blue-700",
  },
  {
    key: "pending" as const,
    title: "In Progress",
    icon: Clock,
    description: "Awaiting action",
    format: (v: number) => v.toLocaleString(),
    accent: "border-amber-500",
    iconBg: "bg-amber-50 text-amber-600",
    valueCls: "text-amber-700",
  },
  {
    key: "granted" as const,
    title: "Permits Granted",
    icon: CheckCircle,
    description: "This fiscal year",
    format: (v: number) => v.toLocaleString(),
    accent: "border-green-500",
    iconBg: "bg-green-50 text-green-600",
    valueCls: "text-green-700",
  },
  {
    key: "revenue" as const,
    title: "Revenue Collected",
    icon: Banknote,
    description: "Total fees collected",
    format: (v: number) =>
      `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    accent: "border-teal-500",
    iconBg: "bg-teal-50 text-teal-600",
    valueCls: "text-teal-700",
  },
]

const actionConfig: Record<ApprovalAction, { color: string; label: string }> = {
  approved: { color: "bg-green-500", label: "approved" },
  forwarded: { color: "bg-blue-500", label: "forwarded" },
  rejected: { color: "bg-red-500", label: "rejected" },
  returned: { color: "bg-amber-500", label: "returned" },
  reopened: { color: "bg-amber-500", label: "reopened" },
  resubmitted: { color: "bg-blue-500", label: "resubmitted" },
}

const renewalCards = [
  {
    key: "expired" as const,
    title: "Expired Permits",
    icon: AlertTriangle,
    description: "Need renewal",
    accent: "border-red-500",
    iconBg: "bg-red-50 text-red-600",
    valueCls: "text-red-700",
    filter: "expired",
  },
  {
    key: "dueForRenewal" as const,
    title: "Due for Renewal",
    icon: Clock,
    description: "Expiring soon",
    accent: "border-amber-500",
    iconBg: "bg-amber-50 text-amber-600",
    valueCls: "text-amber-700",
    filter: "due_for_renewal",
  },
  {
    key: "active" as const,
    title: "Active Permits",
    icon: ShieldCheck,
    description: "Valid and current",
    accent: "border-green-500",
    iconBg: "bg-green-50 text-green-600",
    valueCls: "text-green-700",
    filter: "active",
  },
]

export function DashboardContent({
  stats,
  pipeline,
  activity,
  renewalStats,
}: {
  stats: DashboardStats | null
  pipeline: PipelineItem[] | null
  activity: ActivityEntry[] | null
  renewalStats: RenewalStats | null
}) {
  return (
    <>
      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.key}
            className={`relative overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8 shadow-sm border-l-4 ${stat.accent}`}
          >
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80 mb-2">
                    {stat.title}
                  </p>
                  <p className={`text-3xl font-bold tracking-tight ${stat.valueCls}`}>
                    {stats ? stat.format(stats[stat.key]) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${stat.iconBg}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Renewal Monitoring */}
      {renewalStats && (
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Renewal Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              {renewalCards.map((card) => (
                <Link
                  key={card.key}
                  href={`/dashboard/applications?status=granted&expiration=${card.filter}`}
                  className={`relative overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8 shadow-sm border-l-4 ${card.accent} hover:ring-foreground/15 transition-all`}
                >
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/80 mb-2">
                          {card.title}
                        </p>
                        <p className={`text-3xl font-bold tracking-tight ${card.valueCls}`}>
                          {renewalStats[card.key]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {card.description}
                        </p>
                      </div>
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                        <card.icon className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline view */}
      {pipeline && pipeline.length > 0 && (
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Application Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {pipeline.map((item, index) => (
                <div key={item.status} className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/applications?status=${item.status}`}
                    className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-background px-3.5 py-2 hover:bg-muted hover:border-border transition-all"
                  >
                    <StatusBadge status={item.status} />
                    <span className="text-base font-bold text-foreground tabular-nums">
                      {item.count}
                    </span>
                  </Link>
                  {index < pipeline.length - 1 && (
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {!activity || activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          ) : (
            <div className="space-y-0">
              {activity.map((entry, index) => (
                <div key={entry.id} className="flex gap-3">
                  {/* Timeline */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-2 w-2 rounded-full mt-2.5 shrink-0 ${actionConfig[entry.action].color}`}
                    />
                    {index < activity.length - 1 && (
                      <div className="w-px flex-1 bg-border/60 mt-1.5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-4 min-w-0">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold text-foreground">
                        {entry.actor?.full_name ?? "System"}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {actionConfig[entry.action].label}
                      </span>{" "}
                      {entry.application && (
                        <>
                          <Link
                            href={`/dashboard/applications/${entry.application.id}`}
                            className="font-mono text-xs text-primary hover:underline font-medium"
                          >
                            {entry.application.franchise?.mtop_number ?? "—"}
                          </Link>{" "}
                          <span className="text-muted-foreground">
                            ({entry.application.franchise?.applicant_name ?? "—"})
                          </span>
                        </>
                      )}
                      {" "}
                      <span className="text-muted-foreground">at</span>{" "}
                      <span className="font-medium text-foreground">
                        {getStatusLabel(entry.stage)}
                      </span>
                    </p>
                    {entry.remarks && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-sm">
                        "{entry.remarks}"
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(entry.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
