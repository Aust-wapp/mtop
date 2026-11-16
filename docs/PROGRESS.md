# Project progress

## Current-official signatories — single migration candidate (2026-11-16)

- Branch: `feat/current-official-signatures-single-migration` (separate from Draft PR #19).
- The Franchise Card and Confirmation Slip always read the **currently configured** Mayor and City Treasurer names, designations and signature paths from Admin Settings. No application-level historical signatory snapshots are created or read.
- **Exactly one new signatory migration** relative to upstream `main`:
  `supabase/migrations/20261113000001_official_signatures.sql`.
  It creates a private `mtop-signatures` bucket, permission-controlled staff reads/admin uploads, admin-only orphan cleanup protecting active settings references, and signatory-settings audit history. No snapshot table or grant-status trigger is created.
- The two obsolete migration files (`20261113000002_franchise_card_signatory_snapshots.sql` and `20261116000003_remove_franchise_card_signatory_snapshots.sql`) are absent on this branch. All other existing project migrations remain intact.
- The isolated MTOP sandbox previously applied all three migration versions and ended at the equivalent desired schema. **Do not reapply or edit its migration history automatically**: applying the one-file version to a fresh official database differs from reconciling the existing sandbox's migration history.
- Existing permits, grant dates, and payment dates remain unchanged. Old downloaded PDFs are not rewritten. The Confirmation Slip's "Given this" date uses the current Asia/Manila date when generated.
- Regenerating cards/downloads uses active officials; the current signature image paths are protected from deletion while referenced in settings. Replaced unreferenced objects may be cleaned by authorized administrators.
- Before official rollout, validate migration on a clean isolated database with RLS roles, upload/replace/remove, signed URLs, print/PDF formatting (8.5 × 13 inches) and no leftover snapshot table/trigger. Do not apply to production or merge without approval.

## MTOP Operators

- Added `/dashboard/operators` and `/dashboard/operators/[id]`, with a sidebar
  entry directly below Applications.
- The directory lists franchises with an assigned MTOP number. Search by owner,
  MTOP number, or plate, status filtering, pagination, and ordering are applied
  in the Supabase query before the current page is returned.
- The shared franchise detail component provides the operator Overview,
  Transactions, and Activity tabs. Transactions link to their source
  applications; Activity uses the existing franchise audit and application
  history sources.
- Applications already reference the long-lived franchise through
  `franchise_id`; no duplicate operator entity or database migration was
  required.
- The directory sorts MTOP numbers newest first in the database query, before
  pagination.

## Transaction-specific assessment fees

The assessment screen keeps the same 16 fee rows visible for every transaction.
The transaction schedule in `src/lib/fees.ts` pre-fills applicable amounts and
sets other rows to zero; the total is calculated from the displayed fee values.
Fee amounts remain code-configured because the existing Settings area has no
fee schedule. The server action also enforces transaction applicability before
storing a new assessment.

New Franchise, Renewal, and Change of Ownership use the standard bundle totaling
₱1,750. Standard Confirmation Fee remains ₱65. Renewal adds the existing late
penalty calculation when applicable. Change Unit uses the same standard fees
except Parking Fee is ₱0, and adds Change of Motor at ₱1,000, for ₱1,980.
Annual Confirmation Slip charges the separate Annual Confirmation Fee of ₱100
with the standard Confirmation Fee at ₱0. Re-Issuance charges ₱150. Closure
keeps Certification Fee (₱100) and Payment of Closure (₱500) as separate rows,
for ₱600.
Replacement of Lost Plate is optional for any of the seven transaction types:
the checkbox adds exactly ₱500, while an unchecked or omitted value is stored
as ₱0. The server rejects any other replacement fee amount.
Revisions restore
the checkbox from the stored ₱500/₱0 value.

Authorized fee overrides remain available on applicable lines through the
existing assessment revision flow. Non-applicable lines are read-only. New
assessment submissions store a new assessment record; approval updates its
approval metadata. Existing assessment rows and totals are not recalculated,
and existing assessments display their stored values; revising one starts from
its recorded applicable values. Annual Confirmation and Re-Issuance rows use
the transaction type and stored assessment total, so their display does not
require dedicated columns. Closure fees use the existing certification and
closure columns.
Payment and revenue reporting continue to consume the stored assessment total.

## Permanent franchise abandonment

- Added `abandoned_at` and database enforcement so an abandoned franchise
  cannot return to another lifecycle status. The migration backfills current
  dynamically abandoned rows using the saved grace period and records the
  inferred effective date; pre-existing abandoned rows receive a timestamp.
- Added an idempotent database sweep, called after settings changes and before
  status-sensitive reads, with a daily `pg_cron` run just after midnight in
  Ozamiz. The saved grace period applies only to active franchises.
- Grant effects now execute in the same database transaction as an application
  transition to Granted. A renewal that races with abandonment rolls back its
  application status update. Closure remains available; on an abandoned
  franchise it records `closed_at` while keeping the permanent status.
- Updated operator, application, dashboard and search views to use persisted
  abandonment, and added SQL regression coverage for threshold changes,
  renewal blocking, closure, timestamps, and historical application outcomes.
