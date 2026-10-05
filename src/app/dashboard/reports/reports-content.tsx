"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Download, Loader2, AlertTriangle, TrendingUp, BarChart3, Clock } from "lucide-react"
import { getStatusLabel } from "@/components/shared/status-badge"
import { FEE_LABELS } from "@/lib/fees"
import { getApplicationsForExport } from "@/lib/actions/reports"
import type { MtopStatus } from "@/types/database"

const STATUS_ORDER: MtopStatus[] = [
  "for_verification",
  "for_inspection",
  "for_assessment",
  "for_approval",
  "granted",
  "rejected",
  "returned",
]

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatCurrency(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
}

interface ReportsContentProps {
  statusCounts: Record<string, number> | null
  revenueSummary: Record<string, number> | null
  monthlyTrends: Record<number, { total: number; granted: number }> | null
  lateStats: {
    totalAssessments: number
    lateCount: number
    latePercentage: number
    totalPenalties: number
  } | null
  fiscalYear: number
}

export function ReportsContent({
  statusCounts,
  revenueSummary,
  monthlyTrends,
  lateStats,
  fiscalYear,
}: ReportsContentProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)

    const result = await getApplicationsForExport(fiscalYear)
    if (result.error || !result.data) {
      setExporting(false)
      return
    }

    const headers = [
      "MTOP #", "Applicant", "Address", "Contact",
      "Body #", "Plate #", "Motor #", "Chassis #",
      "Route", "Status", "Fiscal Year", "Due Date", "Submitted", "Granted", "Valid Through",
    ]

    const rows = result.data.map(
      (app: {
        mtop_number: string
        applicant_name: string
        applicant_address: string | null
        contact_number: string | null
        tricycle_body_number: string | null
        plate_number: string | null
        motor_number: string | null
        chassis_number: string | null
        route: string | null
        status: string
        fiscal_year: number
        due_date: string | null
        submitted_at: string
        granted_at: string | null
        granted_until: string | null
      }) => [
        app.mtop_number, app.applicant_name,
        app.applicant_address ?? "", app.contact_number ?? "",
        app.tricycle_body_number ?? "", app.plate_number ?? "",
        app.motor_number ?? "", app.chassis_number ?? "",
        app.route ?? "", app.status, app.fiscal_year,
        app.due_date ?? "", app.submitted_at, app.granted_at ?? "",
        app.granted_until ?? "",
      ]
    )

    const csv = [
      headers.join(","),
      ...rows.map((row: (string | number)[]) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `mtop-applications-${fiscalYear}.csv`
    a.click()
    URL.revokeObjectURL(url)

    setExporting(false)
  }

  const totalApplications = statusCounts
    ? Object.values(statusCounts).reduce((s, v) => s + v, 0)
    : 0

  return (
    <div className="space-y-6">
      {/* Header row with export */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Fiscal Year <span className="font-semibold text-foreground">{fiscalYear}</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          className="gap-1.5"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export CSV
        </Button>
      </div>

      {/* Late stats — prominent highlight cards */}
      {lateStats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: "Total Assessments",
              value: lateStats.totalAssessments.toLocaleString(),
              icon: BarChart3,
              accent: "border-blue-500",
              iconCls: "bg-blue-50 text-blue-600",
              valCls: "text-blue-700",
            },
            {
              label: "Late Renewals",
              value: lateStats.lateCount.toLocaleString(),
              icon: Clock,
              accent: "border-amber-500",
              iconCls: "bg-amber-50 text-amber-600",
              valCls: "text-amber-700",
            },
            {
              label: "Late Rate",
              value: `${lateStats.latePercentage}%`,
              icon: TrendingUp,
              accent: "border-orange-500",
              iconCls: "bg-orange-50 text-orange-600",
              valCls: "text-orange-700",
            },
            {
              label: "Total Penalties",
              value: formatCurrency(lateStats.totalPenalties),
              icon: AlertTriangle,
              accent: "border-red-400",
              iconCls: "bg-red-50 text-red-600",
              valCls: "text-red-700",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`relative overflow-hidden rounded-xl bg-card ring-1 ring-foreground/8 shadow-sm border-l-4 ${s.accent}`}
            >
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1.5 leading-none">
                      {s.label}
                    </p>
                    <p className={`text-2xl font-bold tracking-tight truncate ${s.valCls}`}>
                      {s.value}
                    </p>
                  </div>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.iconCls}`}>
                    <s.icon className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Applications by Status */}
        <Card className="shadow-sm">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Applications by Status
            </CardTitle>
            <CardDescription>
              {totalApplications.toLocaleString()} total in FY {fiscalYear}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Status</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Count</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATUS_ORDER.map((status) => {
                  const count = statusCounts?.[status] ?? 0
                  const pct =
                    totalApplications > 0
                      ? Math.round((count / totalApplications) * 100)
                      : 0
                  return (
                    <TableRow key={status} className="border-border/40">
                      <TableCell className="text-sm">{getStatusLabel(status)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {count}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-muted/20 font-semibold border-t-2 border-border/60">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totalApplications}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Revenue Summary */}
        <Card className="shadow-sm">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Revenue Summary
            </CardTitle>
            <CardDescription>
              Approved assessments — FY {fiscalYear}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Fee Type</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueSummary &&
                  Object.entries(revenueSummary)
                    .filter(([key]) => key !== "total")
                    .filter(([, amount]) => amount > 0)
                    .map(([key, amount]) => (
                      <TableRow key={key} className="border-border/40">
                        <TableCell className="text-sm">{FEE_LABELS[key] ?? key}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatCurrency(amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                {revenueSummary && (
                  <TableRow className="bg-muted/20 font-semibold border-t-2 border-border/60">
                    <TableCell>Grand Total</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-primary">
                      {formatCurrency(revenueSummary.total ?? 0)}
                    </TableCell>
                  </TableRow>
                )}
                {!revenueSummary && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-sm text-muted-foreground">
                      No revenue data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly Trends
            </CardTitle>
            <CardDescription>
              Applications submitted vs. granted per month — FY {fiscalYear}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Month</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Submitted</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Granted</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 hidden sm:table-cell">Grant Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyTrends &&
                  Object.entries(monthlyTrends).map(([month, data]) => {
                    const rate = data.total > 0 ? Math.round((data.granted / data.total) * 100) : 0
                    return (
                      <TableRow key={month} className="border-border/40">
                        <TableCell className="font-medium text-sm">{MONTHS[Number(month) - 1]}</TableCell>
                        <TableCell className="text-right tabular-nums">{data.total}</TableCell>
                        <TableCell className="text-right tabular-nums text-green-700 font-medium">{data.granted}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums hidden sm:table-cell">
                          {rate}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
                {!monthlyTrends && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-sm text-muted-foreground">
                      No trend data available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
