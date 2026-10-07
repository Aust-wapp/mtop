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
