import { officeDateParts } from "@/lib/office-time"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th"
  if (day % 10 === 1) return "st"
  if (day % 10 === 2) return "nd"
  if (day % 10 === 3) return "rd"
  return "th"
}

/**
 * The Confirmation Slip's "Given this ... day" refers to the day the slip
 * is generated, not to the application's historical grant/issuance day.
 * Use the office's Asia/Manila calendar rather than the server's UTC day.
 *
 * Accept an injected instant to make time-zone boundary tests deterministic.
 */
export function confirmationSlipGivenDate(now: Date = new Date()) {
  const local = officeDateParts(now.toISOString())
  if (!local) throw new Error("Unable to determine the office date")
  return {
    givenDay: String(local.day),
    givenOrdinal: ordinalSuffix(local.day),
    givenMonth: MONTHS[local.month - 1],
    givenYear: String(local.year),
  }
}
