# Project progress

## Franchise Card draft PR #19 (2026-11-13)

- NEW and RENEWAL reuse the existing Canva-derived card. The sample handwritten
  signatures were removed from its SVG artwork; configurable signatures now
  occupy those reserved areas. Long official names shrink to their blocks.
- Granting an application records both officials' names, designations, and
  immutable signature object paths in a one-to-one permit snapshot. Legacy
  grants are not backfilled and print "SIGNATORY NOT RECORDED".
- Signature images are kept in a private bucket. Staff with `application.view`
  can read them, administrators can upload them, and only unreferenced objects
  can be deleted for failed-upload cleanup. Settings changes are audited.
- Offline NEW and RENEWAL fixtures with and without test signatures were
  rendered to 8.5 x 13-inch PDFs under `../mtop-artifacts/`. They are not
  live-data or signed-URL integration evidence.
- Before approval: apply both migrations to an authorized development database,
  exercise upload and RLS roles, verify browser PDF download and expiring image
  URLs, and compare authenticated PDFs against the two Canva pages. No MTOP
  development credentials or accessible upstream Vercel preview were available.

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
