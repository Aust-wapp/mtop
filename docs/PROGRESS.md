# MTOP Operators

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

## Blank two-up application forms

The **Print Forms** menu provides blank forms for New Franchise, Renewal,
Change of Ownership, Motor Vehicle Change Unit, Closure, Confirmation Slip,
and Re-Issuance. Each A4 portrait sheet has two identical copies and a center
cutting guide. The supplied City Government forms are retained as references
under `docs/form-references/`; [PRINT_FORM_FIELDS.md](PRINT_FORM_FIELDS.md)
maps the form fields and calls out paper-only fields.

The form previews require `application.view` and do not write to application
records. Their protected PDF route uses the same HTML/CSS preview as printing.
The separate upstream **Printable Forms** screen and issued confirmation
documents remain available. Local Google OAuth setup is documented in
[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md); credentials and keys stay in
ignored `.env` files.

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
for ₱600. Replacement of Lost Plate remains visible at ₱0 because none of the
current transaction workflows applies it.

Authorized fee overrides remain available on applicable lines through the
existing assessment revision flow. Non-applicable lines are read-only. New
assessment submissions store a new assessment record; approval updates its
approval metadata. Existing assessment rows and totals are not recalculated,
and existing assessments display their stored values; revising one starts from
its recorded applicable values. The migration adds the two new transaction fee
columns with zero defaults.
Payment and revenue reporting continue to consume the stored assessment total.
