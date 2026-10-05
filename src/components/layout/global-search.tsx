"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared/status-badge"
import { Search, Loader2, CornerDownLeft } from "lucide-react"
import {
  searchFranchisesGlobal,
  type FranchiseSearchRow,
} from "@/lib/actions/search"

/**
 * Search available from every dashboard page: MTOP number or owner name, and
 * it lands on the franchise's most recent application. Staff at the counter
 * work from whatever the applicant says first — a number or a name — so both
 * have to reach the same place without going back to a list page.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Hits carry the query they answered, so results for a stale query are simply
  // not rendered — no state reset inside the effect.
  const [hits, setHits] = useState<{
    query: string
    rows: FranchiseSearchRow[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = query.trim()
  const results = hits && hits.query === trimmed ? hits.rows : []
  const searched = hits?.query === trimmed

  // Cmd/Ctrl+K from anywhere in the dashboard.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!trimmed) return

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await searchFranchisesGlobal(trimmed)
      setLoading(false)
      setActiveIndex(0)
      setHits({ query: trimmed, rows: res.error ? [] : res.data })
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [trimmed])

  const go = useCallback(
    (row: FranchiseSearchRow) => {
      if (!row.latest_application_id) return
      setOpen(false)
      setQuery("")
      router.push(`/dashboard/applications/${row.latest_application_id}`)
    },
    [router]
  )

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const row = results[activeIndex]
      if (row) go(row)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:w-64"
        aria-label="Search franchises"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 text-left md:block">
          MTOP number or owner…
        </span>
        <kbd className="hidden shrink-0 rounded border border-border/60 bg-background px-1.5 font-mono text-[10px] md:block">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 p-0" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Search franchises</DialogTitle>
            <DialogDescription>
              Search by MTOP number or owner name.
            </DialogDescription>
          </DialogHeader>

          <div className="relative border-b border-border/60">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search by MTOP number or owner name…"
              className="h-12 rounded-none border-0 pl-11 text-base shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {!trimmed && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type an MTOP number or an owner&apos;s name.
              </p>
            )}

            {loading && (
              <p className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </p>
            )}

            {!loading && trimmed && searched && results.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing matched &ldquo;{trimmed}&rdquo;.
              </p>
            )}

            {!loading &&
              results.map((row, i) => (
                <button
                  key={row.franchise_id}
                  type="button"
                  onClick={() => go(row)}
                  onMouseEnter={() => setActiveIndex(i)}
                  disabled={!row.latest_application_id}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                    i === activeIndex ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {row.mtop_number ?? "— not yet granted"}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {row.applicant_name}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.latest_transaction && <>{row.latest_transaction} · </>}
                      Plate {row.plate_number ?? "—"} · Body{" "}
                      {row.tricycle_body_number ?? "—"}
                      {row.route && <> · {row.route}</>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {row.franchise_status !== "active" && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {row.franchise_status}
                      </span>
                    )}
                    {row.latest_status && (
                      <StatusBadge status={row.latest_status} />
                    )}
                    {i === activeIndex && (
                      <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
