"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Loader2, Search, ArrowLeft, ChevronRight } from "lucide-react"
import { searchFranchises } from "@/lib/actions/applications"
import {
  EXPIRED_FRANCHISE_MESSAGE,
  isBlockedByExpiry,
} from "@/lib/utils/permit-expiration"
import type { MtopFranchise, TransactionType } from "@/types/database"

export type FranchiseSearchHit = MtopFranchise & {
  has_active_application?: boolean
  association?: { id: string; name: string } | null
}

export function FranchiseLookup({
  transactionType,
  onSelectFranchise,
  onBack,
}: {
  transactionType: TransactionType
  onSelectFranchise: (f: FranchiseSearchHit) => void
  onBack: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<FranchiseSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = query.trim()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!trimmed) return
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await searchFranchises(trimmed)
      setLoading(false)
      setSearched(true)
      if (!res.error && res.data) {
        setResults(res.data as FranchiseSearchHit[])
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (!value.trim()) {
      setResults([])
      setSearched(false)
    }
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Find the franchise to {transactionType.name.toLowerCase()}
          </CardTitle>
          <CardDescription>
            Search by MTOP number or owner name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="MTOP number or owner name…"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {loading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </p>
          )}

          {!loading && searched && results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No franchises matched &ldquo;{query}&rdquo;.
            </p>
          )}

          {!loading && results.length > 0 && (
            <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
              {results.map((f) => {
                // Every existing-franchise transaction needs a franchise the
                // city has actually granted, that isn't closed, and only one
                // application may be in flight at a time.
                const blockedReason = f.has_active_application
                  ? "An application is already in flight for this franchise"
                  : !f.granted_until
                    ? "Franchise has not been granted yet"
                    : f.franchise_status !== "active"
                      ? `Franchise is ${f.franchise_status}`
                      : isBlockedByExpiry(f.granted_until, transactionType.code)
                        ? EXPIRED_FRANCHISE_MESSAGE
                        : ""
                const validThroughLabel =
                  f.franchise_status === "active"
                    ? "Expires"
                    : "Previous validity end"

                return (
                  // The whole row is the control, not just the button at the
                  // end of it — a real <button> rather than a div with an
                  // onClick, so it keeps focus, Enter and Space, and gets
                  // disabled semantics for the rows that can't be filed
                  // against.
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={!!blockedReason}
                      onClick={() => onSelectFranchise(f)}
                      title={blockedReason || undefined}
                      className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent"
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm font-semibold">
                            {f.mtop_number ?? "— (not yet granted)"}
                          </span>
                          <span className="font-medium">{f.applicant_name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Plate {f.plate_number ?? "—"} · Body{" "}
                          {f.tricycle_body_number ?? "—"} ·{" "}
                          {f.granted_until
                            ? `${validThroughLabel} ${f.granted_until}`
                            : "Never granted"}
                        </div>
                        {blockedReason && (
                          <p className="mt-1 text-xs text-destructive">
                            {blockedReason}
                          </p>
                        )}
                      </div>
                      {!blockedReason && (
                        <ChevronRight
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                        />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
