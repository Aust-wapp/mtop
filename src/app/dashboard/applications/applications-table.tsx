"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { FacetedFilter } from "@/components/shared/faceted-filter"
import {
  MTOP_STATUSES,
  StatusBadge,
  getStatusDot,
  getStatusLabel,
} from "@/components/shared/status-badge"
import { ExpirationBadge } from "@/components/shared/expiration-badge"
import { FranchiseStatusBadge } from "@/components/shared/franchise-status-badge"
import { Search, ChevronLeft, ChevronRight, FileText, X } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { createClient } from "@/lib/supabase/client"
import { expirationDateBounds } from "@/lib/utils/permit-expiration"
import { getFranchiseStatusDisplay } from "@/lib/utils/franchise-status"
import type {
  MtopApplication,
  MtopFranchise,
  TransactionType,
} from "@/types/database"

type ApplicationRow = MtopApplication & {
  franchise: MtopFranchise | null
  transaction_type: TransactionType | null
}

const PAGE_SIZE = 20

const EXPIRATION_OPTIONS = [
  { label: "Expired", value: "expired", dot: "bg-red-500" },
  { label: "Due for Renewal", value: "due_for_renewal", dot: "bg-amber-500" },
  { label: "Active", value: "active", dot: "bg-green-500" },
]

const STATUS_OPTIONS = MTOP_STATUSES.map((status) => ({
  label: getStatusLabel(status),
  value: status,
  dot: getStatusDot(status),
}))

/** The fields the search box looks in, on the franchise behind the application. */
const SEARCH_FIELDS = [
  "mtop_number",
  "applicant_name",
  "tricycle_body_number",
  "plate_number",
]

/**
 * PostgREST reads `,` `.` and `(` as grammar inside an `or(...)`, and an
 * operator name can't be quoted but its value can — so quoting the value is
 * what lets a clerk search "DELA CRUZ, JUAN" without the filter falling apart.
 */
function orSearchFilter(term: string): string {
  const escaped = term.replace(/[\\"]/g, (c) => `\\${c}`)
  return SEARCH_FIELDS.map((f) => `${f}.ilike."%${escaped}%"`).join(",")
}

/** A comma-joined URL param, read as the list it stands for. */
function readList(raw: string): string[] {
  return raw.split(",").filter(Boolean)
}

export function ApplicationsTable() {
  const router = useRouter()
  const urlSearchParams = useSearchParams()

  const search = urlSearchParams.get("search") || ""
  const page = parseInt(urlSearchParams.get("page") || "1", 10)

  // Memoised on the raw strings, not on the params object: these feed the
  // fetch's dependency list, where a fresh array on every render would loop.
  const statusParam = urlSearchParams.get("status") || ""
  const typeParam = urlSearchParams.get("type") || ""
  const expirationParam = urlSearchParams.get("expiration") || ""
  const statuses = useMemo(() => readList(statusParam), [statusParam])
  const typeCodes = useMemo(() => readList(typeParam), [typeParam])
  const expirations = useMemo(() => readList(expirationParam), [expirationParam])

  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState(search)
  const [transactionTypes, setTransactionTypes] = useState<
    TransactionType[] | null
  >(null)
  const [settings, setSettings] = useState<{
    permit_validity_years: number
    renewal_window_days: number
  }>({ permit_validity_years: 3, renewal_window_days: 90 })

  const supabase = createClient()

  const isFiltered =
    !!search ||
    statuses.length > 0 ||
    typeCodes.length > 0 ||
    expirations.length > 0

  // Fetch system settings on mount
  useEffect(() => {
    supabase
      .schema("mtop")
      .from("system_settings")
      .select("key, value")
      .in("key", ["permit_validity_years", "renewal_window_days"])
      .then(({ data }: { data: { key: string; value: unknown }[] | null }) => {
        if (!data) return
        const s = { permit_validity_years: 3, renewal_window_days: 90 }
        for (const row of data) {
          if (row.key === "permit_validity_years") s.permit_validity_years = Number(row.value) || 3
          if (row.key === "renewal_window_days") s.renewal_window_days = Number(row.value) || 90
        }
        setSettings(s)
      })
  }, [supabase])

  // The transaction filter's options, and the code → id map the query needs.
  // Read straight from mtop.transaction_types so a reworded transaction shows
  // its new name here without a code change, same as everywhere else.
  useEffect(() => {
    supabase
      .schema("mtop")
      .from("transaction_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }: { data: TransactionType[] | null }) => {
        setTransactionTypes(data ?? [])
      })
  }, [supabase])

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(urlSearchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value)
        } else {
          params.delete(key)
        }
      }
      const query = params.toString()
      // replace, not push: a filter is a view of this page, not a place to go
      // back to one keystroke at a time.
      router.replace(
        query ? `/dashboard/applications?${query}` : "/dashboard/applications",
        { scroll: false }
      )
    },
    [router, urlSearchParams]
  )

  // Keep the box in step with the URL when the filter is cleared or a link
  // arrives with a search already on it.
  useEffect(() => {
    setSearchInput(search)
  }, [search])

  // Search as you type, a beat behind, so every letter isn't a round trip.
  useEffect(() => {
    if (searchInput === search) return
    const timer = setTimeout(
      () => updateParams({ search: searchInput, page: "" }),
      350
    )
    return () => clearTimeout(timer)
  }, [searchInput, search, updateParams])

  const fetchApplications = useCallback(async () => {
    // A type filter names codes; it can't be applied until the codes have ids.
    if (typeCodes.length > 0 && transactionTypes === null) return

    setLoading(true)

    // !inner so a filter on the franchise — the search box, the permit expiry —
    // narrows the applications themselves rather than just blanking the join.
    // franchise_id is NOT NULL, so nothing is lost by it.
    let query = supabase
      .schema("mtop")
      .from("mtop_applications")
      .select(
        "*, franchise:mtop_franchises!inner(*), transaction_type:transaction_types(id, code, name)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })

    if (statuses.length > 0) {
      query = query.in("status", statuses)
    }

    if (typeCodes.length > 0) {
      const ids = (transactionTypes ?? [])
        .filter((t) => typeCodes.includes(t.code))
        .map((t) => t.id)
      // An unknown code in the URL must match nothing, not everything.
      query = query.in("transaction_type_id", ids.length > 0 ? ids : [""])
    }

    if (search) {
      query = query.or(orSearchFilter(search), { referencedTable: "franchise" })
    }

    if (expirations.length > 0) {
      query = query.eq("franchise.franchise_status", "active")
      const { today, windowEnd } = expirationDateBounds(
        settings.renewal_window_days
      )
      const clauses: string[] = []
      if (expirations.includes("expired")) {
        clauses.push(`granted_until.lt.${today}`)
      }
      if (expirations.includes("due_for_renewal")) {
        clauses.push(
          `and(granted_until.gte.${today},granted_until.lte.${windowEnd})`
        )
      }
      if (expirations.includes("active")) {
        clauses.push(`granted_until.gt.${windowEnd}`)
      }
      if (clauses.length > 0) {
        query = query.or(clauses.join(","), { referencedTable: "franchise" })
      }
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    const { data, count: totalCount } = await query

    setApplications((data as ApplicationRow[]) ?? [])
    setCount(totalCount ?? 0)
    setLoading(false)
  }, [
    supabase,
    statuses,
    typeCodes,
    transactionTypes,
    search,
    expirations,
    settings.renewal_window_days,
    page,
  ])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  const typeOptions = useMemo(
    () =>
      (transactionTypes ?? []).map((t) => ({ label: t.name, value: t.code })),
    [transactionTypes]
  )

  const totalPages = Math.ceil(count / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, MTOP #, body # or plate..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-[220px] pl-8 lg:w-[280px]"
          />
        </div>

        <FacetedFilter
          title="Status"
          options={STATUS_OPTIONS}
          selected={statuses}
          onChange={(values) =>
            updateParams({ status: values.join(","), page: "" })
          }
        />

        <FacetedFilter
          title="Transaction"
          options={typeOptions}
          selected={typeCodes}
          onChange={(values) =>
            updateParams({ type: values.join(","), page: "" })
          }
        />

        <FacetedFilter
          title="Permit Expiry"
          options={EXPIRATION_OPTIONS}
          selected={expirations}
          onChange={(values) =>
            updateParams({ expiration: values.join(","), page: "" })
          }
        />

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              updateParams({
                search: "",
                status: "",
                type: "",
                expiration: "",
                page: "",
              })
            }
          >
            Reset
            <X className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}

        <p className="ml-auto text-xs text-muted-foreground tabular-nums">
          {loading ? "…" : `${count} ${count === 1 ? "application" : "applications"}`}
        </p>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/60">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">MTOP #</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Applicant</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden lg:table-cell">Transaction</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden md:table-cell">Body #</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden lg:table-cell">Route</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden md:table-cell">Permit Expiry</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 hidden sm:table-cell">Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Loading applications…
                  </div>
                </TableCell>
              </TableRow>
            ) : applications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm font-medium">No applications found</p>
                    <p className="text-xs text-muted-foreground/70">
                      {search ? `No results for "${search}"` : "No applications match the current filter"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              applications.map((app) => {
                // The expiry belongs to the franchise, not to this application:
                // a renewal still sitting in verification is exactly the row
                // where how overdue the operator is matters most.
                const franchiseStatusDisplay = getFranchiseStatusDisplay(
                  app.franchise?.franchise_status,
                  app.franchise?.granted_until,
                  settings.renewal_window_days
                )
                const expirationInfo = franchiseStatusDisplay.expiration

                return (
                  <TableRow
                    key={app.id}
                    className="hover:bg-muted/30 transition-colors border-border/40"
                  >
                    <TableCell>
                      <Link
                        href={`/dashboard/applications/${app.id}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline underline-offset-2"
                      >
                        {app.franchise?.mtop_number ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/applications/${app.id}`}
                        className="text-foreground hover:text-primary hover:underline underline-offset-2"
                      >
                        {app.franchise?.applicant_name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                      {app.transaction_type?.name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground hidden md:table-cell">
                      {app.franchise?.tricycle_body_number || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">
                      {app.franchise?.route || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={app.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {app.franchise?.franchise_status &&
                      !franchiseStatusDisplay.isActive ? (
                        <FranchiseStatusBadge
                          status={app.franchise.franchise_status}
                        />
                      ) : expirationInfo ? (
                        <ExpirationBadge
                          status={expirationInfo.status}
                          daysRemaining={expirationInfo.daysRemaining}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                      {formatDistanceToNow(new Date(app.submitted_at), {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)}
            </span>{" "}
            of <span className="font-medium text-foreground">{count}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
