"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { AlertCircle, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FacetedFilter } from "@/components/shared/faceted-filter"
import { StatusBadge } from "@/components/shared/status-badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getOperators } from "@/lib/actions/franchises"
import type {
  OperatorDirectoryRecord,
  OperatorDirectoryStatus,
} from "@/lib/actions/franchises"

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { label: "Active", value: "active", dot: "bg-green-500" },
  { label: "Inactive / Closed", value: "inactive", dot: "bg-slate-400" },
]

const FRANCHISE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  closed: "Closed",
  abandoned: "Abandoned",
  revoked: "Revoked",
  cancelled: "Cancelled",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : format(date, "MMM d, yyyy")
}

function franchiseStatusClass(status: string): string {
  return status === "active"
    ? "bg-green-50 text-green-800 ring-green-200"
    : "bg-slate-100 text-slate-700 ring-slate-200"
}

function parseStatusFilter(statuses: string[]): OperatorDirectoryStatus {
  if (statuses.length !== 1) return "all"
  return statuses[0] === "active" ? "active" : "inactive"
}

export function OperatorsTable() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const search = searchParams.get("search") ?? ""
  const statusParam = searchParams.get("status") ?? ""
  const selectedStatuses = useMemo(
    () =>
      statusParam
        .split(",")
        .filter((value) =>
          STATUS_OPTIONS.some((option) => option.value === value)
        ),
    [statusParam]
  )
  const status = parseStatusFilter(selectedStatuses)
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10)
  const page = Math.max(1, requestedPage || 1)

  const [searchInput, setSearchInput] = useState(search)
  const [operators, setOperators] = useState<OperatorDirectoryRecord[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      const query = params.toString()
      router.replace(
        query ? `/dashboard/operators?${query}` : "/dashboard/operators",
        { scroll: false }
      )
    },
    [router, searchParams]
  )

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  useEffect(() => {
    if (searchInput === search) return
    const timer = setTimeout(
      () => updateParams({ search: searchInput.trim(), page: "" }),
      350
    )
    return () => clearTimeout(timer)
  }, [searchInput, search, updateParams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getOperators({ search, status, page }).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.error) {
        setError(result.error)
        setOperators([])
        setCount(0)
        return
      }
      setOperators(result.data)
      setCount(result.count)
    })

    return () => {
      cancelled = true
    }
  }, [search, status, page])

  const hasFilters = search.length > 0 || selectedStatuses.length > 0
  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search operators"
            placeholder="Search operator, MTOP # or plate..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="h-9 w-full pl-8 sm:w-[260px]"
          />
        </div>

        <FacetedFilter
          title="Status"
          options={STATUS_OPTIONS}
          selected={selectedStatuses}
          onChange={(values) =>
            updateParams({
              status: values.length === 1 ? values[0] : "",
              page: "",
            })
          }
        />

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateParams({ search: "", status: "", page: "" })}
          >
            Reset
            <X className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}

        <p className="ml-auto text-xs tabular-nums text-muted-foreground">
          {loading ? "…" : `${count} ${count === 1 ? "operator" : "operators"}`}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Unable to load MTOP operators. {error}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                  MTOP #
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Operator / Owner
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Franchise Status
                </TableHead>
                <TableHead className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 md:table-cell">
                  Date Granted
                </TableHead>
                <TableHead className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 lg:table-cell">
                  Unit / Plate
                </TableHead>
                <TableHead className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 xl:table-cell">
                  Latest Transaction
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Loading MTOP operators…
                    </span>
                  </TableCell>
                </TableRow>
              ) : operators.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <p className="text-sm font-medium">
                      {hasFilters
                        ? "No operators match your search"
                        : "No granted MTOP operators found."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hasFilters
                        ? "Try a different name, MTOP number, plate, or status."
                        : "Granted MTOP records will appear here."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                operators.map((operator) => (
                  <OperatorRow key={operator.id} operator={operator} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && !error && (
        <div className="flex items-center justify-end gap-2">
          <p className="mr-2 text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => updateParams({ page: String(page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => updateParams({ page: String(page + 1) })}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function OperatorRow({ operator }: { operator: OperatorDirectoryRecord }) {
  return (
    <TableRow className="border-border/40 transition-colors hover:bg-muted/30">
      <TableCell>
        <Link
          href={`/dashboard/operators/${operator.id}`}
          className="font-mono text-xs font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {operator.mtop_number}
        </Link>
      </TableCell>
      <TableCell className="max-w-[180px] sm:max-w-[280px]">
        <Link
          href={`/dashboard/operators/${operator.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {operator.applicant_name}
        </Link>
        {operator.contact_number && (
          <span className="block truncate text-xs text-muted-foreground">
            {operator.contact_number}
          </span>
        )}
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${franchiseStatusClass(operator.franchise_status)}`}
        >
          {FRANCHISE_STATUS_LABELS[operator.franchise_status] ??
            operator.franchise_status}
        </span>
      </TableCell>
      <TableCell className="hidden text-sm md:table-cell">
        {formatDate(operator.date_granted)}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="font-mono text-xs">{operator.plate_number ?? "—"}</span>
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {operator.latest_transaction ? (
          <div className="space-y-1">
            <p className="max-w-[180px] truncate text-sm">
              {operator.latest_transaction.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Filed {formatDate(operator.latest_transaction.submitted_at)}
            </p>
            <StatusBadge status={operator.latest_transaction.status} />
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No transactions</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Link
          href={`/dashboard/operators/${operator.id}`}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "h-8 px-2 sm:px-3",
          })}
        >
          View<span className="hidden sm:inline"> record</span>
        </Link>
      </TableCell>
    </TableRow>
  )
}
