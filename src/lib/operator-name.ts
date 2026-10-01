/**
 * Operator-name rules, mirroring mtop.normalize_operator_name() and
 * mtop.operator_name_has_co_owner() in
 * 20260413000018_one_operator_per_franchise.sql.
 *
 * The database is what actually enforces both rules (a partial unique index
 * and two CHECK constraints). These copies exist so the forms can say no
 * before the round trip, and so the server actions can return a sentence a
 * clerk can act on instead of a constraint violation. If you change one side,
 * change the other.
 */

/**
 * "  juan  dela-cruz " -> "JUAN DELA CRUZ".
 *
 * Upper-cases, turns punctuation into spaces, collapses whitespace. Deliberately
 * not fuzzy: "JUAN DELA CRUZ" and "JUAN P. DELA CRUZ" normalise differently and
 * count as two operators.
 */
export function normalizeOperatorName(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The marker that makes a name look like it lists more than one person, or
 * null when it names a single operator. Commas are allowed on purpose —
 * "DELA CRUZ, JUAN" is one person written surname-first.
 */
export function findCoOwnerMarker(name: string): string | null {
  const match = name.match(/&|\/|\bAND\b|\bET\s+AL\b/i)
  return match ? match[0] : null
}

export const SINGLE_OPERATOR_MESSAGE =
  "A franchise is issued to one operator only. Enter a single person's name — co-ownership is not allowed."

/**
 * The operator's name as the forms take it — see
 * 20260413000030_operator_name_parts.sql.
 */
export type OperatorNameParts = {
  last_name: string
  first_name: string
  middle_name?: string | null
  suffix?: string | null
}

/**
 * The one readable line stored in applicant_name: "Juan P. Dela Cruz Jr." —
 * first, middle, last, suffix, the order the existing records are written in.
 * Everything downstream (the card, search, the one-franchise-per-operator
 * index) reads this line, so the server actions compose it here and nowhere
 * else.
 */
export function composeOperatorName(parts: Partial<OperatorNameParts>): string {
  return [parts.first_name, parts.middle_name, parts.last_name, parts.suffix]
    .map((part) => part?.trim().replace(/\s+/g, " "))
    .filter((part): part is string => Boolean(part))
    .join(" ")
}

/** Trimmed part for storage; blank becomes NULL. */
export function namePart(value: string | null | undefined): string | null {
  return value?.trim().replace(/\s+/g, " ") || null
}
