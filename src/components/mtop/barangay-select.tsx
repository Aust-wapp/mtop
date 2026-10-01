"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { getBarangays } from "@/lib/actions/barangays"
import type { Barangay } from "@/types/database"

/**
 * Barangay picker for the franchise forms.
 *
 * A native <select>, like AssociationSelect and for the same reasons: 51
 * options want keyboard type-ahead, the mobile picker is better than anything
 * we would build, and it registers with react-hook-form directly.
 *
 * Unlike the association, the empty value here is a placeholder and not a
 * choice — every operator lives in a barangay — so the form requires one.
 */
export function BarangaySelect({
  id,
  className,
  invalid,
  /**
   * The barangay already on the franchise. Kept as an option even if it has
   * since been deactivated, so re-filing a transaction can't silently blank
   * an address that was valid when it was recorded.
   */
  currentBarangay,
  ref,
  ...props
}: React.ComponentProps<"select"> & {
  invalid?: boolean
  currentBarangay?: string | null
}) {
  const [barangays, setBarangays] = useState<Barangay[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // react-hook-form sets the default value on the DOM node when it registers,
  // which is before the list has loaded. Until then the only option holding
  // that value is the temporary currentBarangay one, and swapping the loaded
  // list in drops it — the select falls back to the placeholder while the form
  // still holds the barangay. So remember the selection across the swap and
  // put it back.
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const pendingValue = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getBarangays().then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      else {
        pendingValue.current = selectRef.current?.value || null
        setBarangays(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    if (pendingValue.current && selectRef.current) {
      selectRef.current.value = pendingValue.current
      pendingValue.current = null
    }
  }, [barangays])

  const options = barangays ?? []
  const needsCurrent =
    currentBarangay && options.every((b) => b.name !== currentBarangay)

  return (
    <div className="space-y-1">
      <select
        ref={(node) => {
          selectRef.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        id={id}
        aria-invalid={invalid}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
          className
        )}
        {...props}
      >
        <option value="">
          {barangays === null ? "Loading barangays…" : "Select a barangay"}
        </option>
        {needsCurrent && (
          <option value={currentBarangay}>{currentBarangay}</option>
        )}
        {options.map((barangay) => (
          <option key={barangay.name} value={barangay.name}>
            {barangay.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
