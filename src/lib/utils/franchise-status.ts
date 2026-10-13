import { getExpirationStatus } from "@/lib/utils/permit-expiration"
import type {
  PermitExpirationStatus,
} from "@/lib/utils/permit-expiration"
import type { FranchiseStatus } from "@/types/database"

const FRANCHISE_STATUS_LABELS: Record<FranchiseStatus, string> = {
  active: "Active",
  closed: "Closed",
  abandoned: "Abandoned",
  revoked: "Revoked",
  cancelled: "Cancelled",
}

const PERMIT_EXPIRATION_LABELS: Record<PermitExpirationStatus, string> = {
  active: "Active",
  due_for_renewal: "Due for Renewal",
  expired: "Expired",
  abandoned: "Abandoned",
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
  renewalWindowDays: number,
  abandonmentGraceDays?: number
) {
  const isActive = status === "active"
  const expiration =
    isActive && grantedUntil
      ? getExpirationStatus(
          grantedUntil,
          renewalWindowDays,
          abandonmentGraceDays
        )
      : null

  return {
    statusLabel: expiration
      ? PERMIT_EXPIRATION_LABELS[expiration.status]
      : status
        ? getFranchiseStatusLabel(status)
        : null,
    isActive,
    expiration,
    historicalValidityLabel: "Previous validity end",
  }
}
