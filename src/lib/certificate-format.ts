import { officeDateParts } from "@/lib/office-time"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th"
  if (day % 10 === 1) return "st"
  if (day % 10 === 2) return "nd"
  if (day % 10 === 3) return "rd"
  return "th"
}

export function formatCertificateDate(value: string | null | undefined): string {
  const parts = officeDateParts(value)
  if (!parts) return ""

  return `${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`
}

export function formatCertificateGivenDate(
  value: string | null | undefined
): string {
  const parts = officeDateParts(value)
  if (!parts) return ""

  return `${parts.day}${ordinalSuffix(parts.day)} day of ${MONTHS[parts.month - 1]}, ${parts.year}`
}

export function formatCertificationFee(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined || value === "") return ""

  const amount = Number(value)
  if (!Number.isFinite(amount)) return ""

  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
