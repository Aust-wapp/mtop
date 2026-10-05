# Project progress

## MTOP Operators

- Branch: `feat/mtop-operators`, created from `upstream/main` at `1587a97`.
- Added `/dashboard/operators` and `/dashboard/operators/[id]`.
- Added the MTOP Operators navigation item below Applications.
- Reused the shared page header, table, status badge, filter, franchise detail,
  read-only field, and history timeline components.
- The directory reads `mtop.mtop_franchises`; a non-null MTOP number identifies
  a record that received a number during grant. Search and pagination run in
  Supabase, with the current page's transaction metadata fetched in one batch.
- Each application already references its long-lived franchise by
  `franchise_id`. The detail record reuses that relationship for transactions
  and the existing audit/history sources.
- No database migration was needed. Upstream already has franchise lifecycle
  status, grant effects, unit and ownership history, application approval logs,
  and append-only franchise audit logs with authenticated read policies.
- Activity reuses `getFranchiseHistory`; read errors from its history sources
  now surface rather than silently presenting partial history.
- Transactions remain application records and link to the existing application
  detail route. Activity remains a separate record of audit, application, and
  approval events.
- Local-only printable-form commits were reviewed and are not required by this
  feature. The `WIP before feat/mtop-operators` stash and backup branch remain
  preserved; neither was applied to this branch.
- The directory sorts MTOP numbers newest first in the Supabase query before
  applying pagination. Local records confirm `AO-2026-00002` (John Doe,
  Oct 5, 2026) then `AO-2026-00001` (TEST OPERATOR FOXTROT, Apr 25, 2026).
- Global Search's window keydown listener now checks that `event.key` is a
  string before lowercasing it; Cmd/Ctrl+K behavior is preserved.
- Validation: `npx tsc --noEmit`, focused ESLint over changed source files,
  and `npm run build` passed. Repository-wide `npm run lint` still reports
  existing issues in `output/pdf/refinement-qa.cjs`,
  `dashboard-content.tsx`, `negative-list-content.tsx`, `use-permissions.ts`,
  and `use-profile.ts`; none is part of this feature.
- Browser smoke check confirmed unauthenticated `/dashboard/operators` access
  redirects to the existing `/auth` page. Keyboard shortcut and navigation
  checks require an authorized local browser session.
- This repository has no test script or configured test runner. No automated
  feature tests could be run.
- Known limitation: historical records without an `issue_number` application's
  `granted_at` value have no displayed grant date; the feature leaves that
  value empty rather than deriving it from record creation time.
