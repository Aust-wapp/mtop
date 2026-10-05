import { getExpirationStatus } from "@/lib/utils/permit-expiration"
import type { FranchiseStatus } from "@/types/database"

const FRANCHISE_STATUS_LABELS: Record<FranchiseStatus, string> = {
  active: "Active",
  closed: "Closed",
  abandoned: "Abandoned",
  revoked: "Revoked",
  cancelled: "Cancelled",
}

export function getFranchiseStatusLabel(status: FranchiseStatus): string {
  return FRANCHISE_STATUS_LABELS[status] ?? status
}

/**
 * The stored franchise status decides whether expiry dates describe an
 * operational permit. A future date does not reopen a closed franchise.
 */
export function getFranchiseStatusDisplay(
  status: FranchiseStatus | null | undefined,
  grantedUntil: string | Date | null | undefined,
  renewalWindowDays: number
) {
  const isActive = status === "active"

  return {
    statusLabel: status ? getFranchiseStatusLabel(status) : null,
    isActive,
    expiration:
      isActive && grantedUntil
        ? getExpirationStatus(grantedUntil, renewalWindowDays)
        : null,
    historicalValidityLabel: "Previous validity end",
  }
}
