import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns"

import { officeDateParts } from "@/lib/office-time"

export type PermitExpirationStatus =
  | "active"
  | "due_for_renewal"
  | "expired"
  | "abandoned"

export const DEFAULT_ABANDONMENT_GRACE_DAYS = 120

export interface PermitExpirationInfo {
  status: PermitExpirationStatus
  expirationDate: Date
  daysRemaining: number
}

/**
 * Midnight of today's date in Ozamiz, as a local Date.
 *
 * `granted_until` is a DATE — a calendar day with no time to it — so whether a
 * permit has expired is a question about days, not instants. Reckoning it in
 * office time keeps a clerk whose laptop is set to another zone from seeing a
 * different answer than the counter beside them.
 */
function officeStartOfToday(): Date {
  const parts = officeDateParts(new Date().toISOString())
  if (!parts) return new Date()
  return new Date(parts.year, parts.month - 1, parts.day)
}

function asLocalDay(grantedUntil: string | Date): Date {
  if (typeof grantedUntil === "string") return parseISO(grantedUntil)
  return new Date(
    grantedUntil.getFullYear(),
    grantedUntil.getMonth(),
    grantedUntil.getDate()
  )
}

// Derives expiration status from a franchise's stored granted_until date.
export function getExpirationStatus(
  grantedUntil: string | Date,
  renewalWindowDays: number,
  abandonmentGraceDays = DEFAULT_ABANDONMENT_GRACE_DAYS
): PermitExpirationInfo {
  return getExpirationStatusOnDate(
    grantedUntil,
    officeStartOfToday(),
    renewalWindowDays,
    abandonmentGraceDays
  )
}

/** Calculate permit status against a supplied calendar date. */
export function getExpirationStatusOnDate(
  grantedUntil: string | Date,
  today: Date,
  renewalWindowDays: number,
  abandonmentGraceDays = DEFAULT_ABANDONMENT_GRACE_DAYS
): PermitExpirationInfo {
  const expirationDate = asLocalDay(grantedUntil)
  const daysRemaining = differenceInCalendarDays(
    expirationDate,
    asLocalDay(today)
  )

  let status: PermitExpirationStatus
  if (daysRemaining < -abandonmentGraceDays) {
    status = "abandoned"
  } else if (daysRemaining < 0) {
    status = "expired"
  } else if (daysRemaining <= renewalWindowDays) {
    status = "due_for_renewal"
  } else {
    status = "active"
  }

  return { status, expirationDate, daysRemaining }
}

/** Transactions exempt from the expired/abandoned permit filing guard. */
const ALLOWED_WHEN_EXPIRED: readonly string[] = ["closure"]

export const EXPIRED_FRANCHISE_MESSAGE =
  "This franchise is expired. Only Renewal or Closure applications are allowed."

export const ABANDONED_RENEWAL_MESSAGE =
  "This permit is abandoned because the post-expiry period has passed. A new renewal application can no longer be filed."

export const ABANDONED_FRANCHISE_MESSAGE =
  "This permit is abandoned because the post-expiry period has passed. Only Closure applications are allowed."

/**
 * Whether filing this transaction is refused based on the permit's derived
 * expiry status. Shared by the lookup and server action so both enforce the
 * same post-expiry renewal deadline.
 */
export function isBlockedByExpiry(
  grantedUntil: string | Date | null | undefined,
  transactionCode: string,
  renewalWindowDays = 0,
  abandonmentGraceDays = DEFAULT_ABANDONMENT_GRACE_DAYS
): boolean {
  if (!grantedUntil) return false
  if (transactionCode === "closure") return false
  const status = getExpirationStatus(
    grantedUntil,
    renewalWindowDays,
    abandonmentGraceDays
  ).status
  if (transactionCode === "renewal") return status === "abandoned"
  if (ALLOWED_WHEN_EXPIRED.includes(transactionCode)) return false
  return status === "expired" || status === "abandoned"
}

export function expiryBlockMessage(
  grantedUntil: string | Date,
  transactionCode: string,
  renewalWindowDays: number,
  abandonmentGraceDays: number
): string {
  const status = getExpirationStatus(
    grantedUntil,
    renewalWindowDays,
    abandonmentGraceDays
  ).status
  if (transactionCode === "renewal" && status === "abandoned") {
    return ABANDONED_RENEWAL_MESSAGE
  }
  if (status === "abandoned") return ABANDONED_FRANCHISE_MESSAGE
  return EXPIRED_FRANCHISE_MESSAGE
}

/**
 * The same four statuses expressed as bounds on the `granted_until` column,
 * so a list can be filtered in the database instead of after paging.
 *
 * `abandoned` is before `expiredStart`; `expired` runs from that date to the
 * day before today. `due_for_renewal` is `today` through
 * `windowEnd` inclusive, `active` is everything after — the boundaries
 * getExpirationStatus() uses above, so dashboard counts and list results use
 * the same boundaries.
 */
export function expirationDateBounds(
  renewalWindowDays: number,
  abandonmentGraceDays = DEFAULT_ABANDONMENT_GRACE_DAYS
): {
  today: string
  windowEnd: string
  expiredStart: string
} {
  const today = officeStartOfToday()
  return {
    today: format(today, "yyyy-MM-dd"),
    windowEnd: format(addDays(today, renewalWindowDays), "yyyy-MM-dd"),
    expiredStart: format(addDays(today, -abandonmentGraceDays), "yyyy-MM-dd"),
  }
}
