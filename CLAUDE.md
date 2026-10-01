# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev       # start dev server on http://localhost:3000
npm run build     # production build
npm run lint      # ESLint (Next.js config, v9 flat config in eslint.config.mjs)
```

There is no test suite.

## Architecture

**MTOP System** — Motorized Tricycle Operator's Permit renewal workflow for LGU Ozamiz City. Handles document verification, physical inspection, fee assessment, payment recording, and permit issuance.

### Stack

- **Next.js 16.2.3** with App Router and React 19. Read `node_modules/next/dist/docs/` before writing Next.js code — this version has breaking API changes.
- **Supabase** (`@supabase/ssr`) for auth and database. All data lives in a custom `mtop` Postgres schema; every Supabase query must call `.schema("mtop")` before `.from(...)`.
- **Tailwind v4** + **shadcn/ui** (style: `base-nova`, color: `neutral`). Add new components with `npx shadcn add <component>`.
- **Zod v4** + **react-hook-form** for form validation.

### Auth Flow

Authentication is Google OAuth only. There is **no `middleware.ts`** — session refresh runs through `src/proxy.ts` (exported as `proxy`, not `middleware`), which Next.js picks up via the `config.matcher` export in that file.

OAuth callback at `/auth/callback/route.ts`:
1. Exchanges the OAuth code for a session.
2. Checks `mtop.user_profiles` for a matching record (by `id`, then by `email` for pre-registered users).
3. On first login of a pre-registered user, migrates the placeholder profile to the real auth UID using the admin client.
4. Redirects unauthorized users to `/auth?error=unauthorized` and signs them out.

### Supabase Client Files

| File | Usage |
|---|---|
| `src/lib/supabase/server.ts` | Server Components and Route Handlers — reads cookies via `next/headers` |
| `src/lib/supabase/client.ts` | Client Components — singleton browser client |
| `src/lib/supabase/admin.ts` | Server-only — service role key, bypasses RLS; validates JWT role on init |
| `src/lib/supabase/proxy.ts` | Session refresh logic called by `src/proxy.ts` |

### Data Layer

All database mutations are **Server Actions** in `src/lib/actions/`. Each action file (`applications.ts`, `assessments.ts`, `requirements.ts`, `inspections.ts`, `payments.ts`, `transaction-types.ts`, etc.) uses `"use server"` and calls `createClient()` from `server.ts`. Actions return `{ error: string | null, data: ... }` — never throw to the client.

Application status flows through these stages in order:
`for_verification` → `for_inspection` → `for_assessment` → `for_approval` → `granted`

Side exits: `rejected` (terminal) and `returned`.

A return pauses an application without unwinding any of its work — cleared requirements, inspection result, assessment and payments all stay. `reopenApplication()` puts it back at the stage it was returned from, derived server-side by `reopenTargetStage()` (`src/lib/application-flow.ts`) from the newest `approval_logs` row naming a pipeline stage; the client never names the target stage, it only labels the button. Reopening is logged as a `forwarded` entry, since `approval_logs.action` has no `reopened` value. A returned application still counts as the franchise's one in-flight application, so reopening can't collide with `idx_applications_one_in_flight_per_franchise`. The button is gated on the permission for the stage being resumed (`stagePermission()`), which is the same permission that allowed the return in the first place.

Reopening only moves the status; what makes it useful is that the stage it lands on is editable again. Two of the stage components used to lock permanently once a record existed, which left a reopened application with nowhere to fix what it was returned for:

- **Inspection** — an inspection on file renders as a result, not a form. `InspectionChecklist` now offers **Re-inspect** at `for_inspection`, prefilled from the last visit so the inspector ticks off only what has since been put right. `createInspection()` writes a new row and reads take the newest, so the failed visit stays on record.
- **Assessment** — same shape. **Revise Assessment** is offered while the assessment is still unapproved; once the CTO head has approved it, the figure is what the operator was told to pay and is no longer a form to edit.
- **Requirements** — editable to anyone with `application.verify` at any stage before `granted`/`rejected`, not only at `for_verification`. A missing document is often raised later, by an inspector or assessor, and the counter has to be able to attach it when the operator brings it in. Same rule as the franchise photos card.

Separately, an **administrator** (`admin.manage`) can correct any stage until the permit is granted — `adminEdit` in `application-detail.tsx`, threaded into the inspection, assessment and payment components as a prop. The admin role already carries every permission, so what blocked it was the stage each component checks for itself: the inspection only at `for_inspection`, the assessment only while unapproved, payments only at `for_assessment`. `granted` is the line — once the permit exists the record behind it is settled and is corrected by filing a transaction, not by editing. Stage *transitions* are untouched: forwarding, returning and approving stay where they belong, because an override is for fixing a record, not for driving the workflow from the wrong desk. The same override opens `TricycleDetailsCard` (`src/components/mtop/tricycle-details-card.tsx`), which is read-only to everyone else: motor and chassis numbers are what a change-of-unit transaction exists to alter, and that route keeps the old values in `mtop.franchise_unit_history`, so editing them in place is a correction of a mis-keyed record rather than a normal operation. `updateFranchiseUnitDetails()` re-checks `admin.manage` server-side — `src/lib/actions/franchises.ts` is one of the few action files that does check permissions itself — and the audit trigger records the before and after either way.

Every status change inserts a row into `mtop.approval_logs`.

### Franchise vs Application

The MTOP number is the **stable franchise identifier**, not a per-application number. Two tables back this:

- `mtop.mtop_franchises` — owner + tricycle identity (motor, chassis, plate, body, route, address, contact). Holds `mtop_number` and `granted_until`. Same row across renewals.
- `mtop.mtop_applications` — one transaction filed against a franchise via `franchise_id`, typed by `transaction_type_id`. A partial unique index allows **at most one in-flight application per franchise** (statuses other than `granted`/`rejected`); there is no longer a one-row-per-fiscal-year constraint, because a franchise can legitimately file, say, an annual confirmation and a change of unit in the same year.

Creation flow (`src/lib/actions/applications.ts`):
- `createNewFranchiseApplication` registers a brand-new franchise + first application. Rejected if `(motor_number, chassis_number)` already exists.
- `createFranchiseTransaction` files any of the six transactions against an existing franchise. The franchise must already be granted. The renewal-window rule (`today >= granted_until − system_settings.renewal_window_days`) applies **only** to `renewal`. Blocked if another application is in-flight.
- `searchFranchises(query)` powers the lookup on the new-application page; `searchFranchisesGlobal(query)` in `src/lib/actions/search.ts` powers the topbar search (⌘K), which resolves a hit to its most recent application.

`mtop.grant_franchise(application_id, granted_at, validity_years)` is a `SECURITY DEFINER` Postgres function that runs when an application transitions to `granted`. It looks up the application's `transaction_type.grant_effect` and branches:

| `grant_effect` | Transaction | What it does |
|---|---|---|
| `issue_number` | New Franchise | Assigns the next MTOP number via `mtop.next_mtop_number(year)` (`AO-2026-00001`) and sets `granted_until` |
| `extend_validity` | Renewal | Advances `granted_until` to `granted_at + validity_years`, keeps the number |
| `replace_unit` | Change of Unit | Copies `new_motor_number`/`new_chassis_number`/`new_plate_number` from the application onto the franchise; logs the old values to `mtop.franchise_unit_history`. `granted_until` is untouched — replacing a unit never extends the renewal due date |
| `transfer_owner` | Change of Ownership | Copies `new_applicant_name`/`new_applicant_address`/`new_contact_number` from the application onto the franchise; logs the old values to `mtop.franchise_ownership_history` |
| `confirm_year` | Annual Confirmation Slip | Sets `last_confirmed_at`; no change to number or validity |
| `reprint_permit` | Re-Issuance | Sets `last_reissued_at`; no change to number or validity |
| `close_franchise` | Closure | Sets `franchise_status = 'closed'` and `closed_at`; `granted_until`/`mtop_number` are left as history |

The `new_*` columns on `mtop_applications` are staged by `createFranchiseTransaction` at filing time and applied only here — the identity change (unit or owner) takes effect on grant, not on filing. `mtop.mtop_franchises.franchise_status` (`active` / `closed` / `abandoned` / `revoked` / `cancelled`) gates new filings — `createFranchiseTransaction` and the franchise lookup both refuse a non-`active` franchise. Only `close_franchise` sets it today; the 120-day abandonment sweep and 3-violation revocation from the ordinance are not implemented.

An MTOP number is `AO-<grant year>-<5-digit counter>` — `AO-2026-00001`. The counter is per year, held in `mtop.mtop_number_counters` and handed out by `mtop.next_mtop_number()`; the printed form is `mtop.format_mtop_number()`, so the shape changes in one place. The year is the year the office granted it **in Ozamiz**: the database stores UTC and the server runs in UTC, so `mtop.grant_year()` / `mtop.grant_date()` (`20260413000026`) convert to `Asia/Manila` first, or a permit granted before 8am on 1 January would be numbered into the year that just ended. `src/lib/office-time.ts` mirrors them for the printed documents — the franchise card's validity years and the confirmation slip's "Given this … day of …" read the same calendar day as the number does. Numbers issued under the old `2026-0001` format are left alone; they are on paper in someone's hands.

System settings drive both the validity period (`permit_validity_years`, default 3) and renewal window (`renewal_window_days`, default 90); managed in `src/lib/actions/settings.ts`.

### Transactions and Requirements

The city runs **seven** transactions over a franchise, seeded in `mtop.transaction_types`:
`new_franchise`, `renewal`, `annual_confirmation`, `change_unit`, `change_ownership`, `reissuance`, `closure`.

Each row carries `grant_effect` (what granting it does to the franchise), `requires_existing_franchise` and `requires_inspection`. The UI reads `name`, `description` and `when_to_use` straight from this table, so wording changes need no code change.

Checklists are **reference data, not code**:

- `mtop.requirements` — the catalogue (~37 items), each with a `kind`: `document`, `payment`, `inspection`, `appearance`, `photo` or `surrender`. The kind decides where the item is cleared, because the city's paper checklist mixes all six into one column.
- `mtop.transaction_requirements` — which requirements each transaction asks for, with `is_mandatory`, `is_conditional`, `note` (per-transaction wording) and `sort_order`.
- `mtop.mtop_application_requirements` — the per-application rows, copied from the matrix by `seedApplicationChildren` at creation. (This is the old `mtop_documents` table; the `mtop_document_type` enum is gone.)

Only **mandatory, non-conditional** items block forwarding out of verification — see `isBlocking` in `src/lib/requirements.ts`. Conditional items (e.g. the Affidavit of No Franchise, which the ordinance requires only for units from an abandoned MTOP) show as "If applicable" and never block.

To add or reword a checklist item, `INSERT`/`UPDATE` these tables. Do not add TypeScript arrays of requirement codes.

Since `20260413000029_checklist_documents_only.sql` no transaction's checklist carries `payment`, `inspection`, `appearance` or `photo` rows — each is already recorded by the fee assessment, the inspection card, or the photos card. The catalogue entries remain for granted/rejected applications that still reference them.

Re-issuance, closure and annual confirmation require a free-text `mtop_applications.reason` at filing (`reasonRequiredCodes` in `src/lib/schemas/mtop.ts`, re-checked in `createFranchiseTransaction`); it shows as an alert on the application detail page.

### Fees

The fee schedule is per transaction, in `src/lib/fees.ts`. `feeScheduleFor(code)` returns what a transaction may be charged and what each line starts at; `feeKeysFor(code)` is the same set without needing a late-renewal figure to hand.

A **closure** is priced on its own terms — the certification fee (₱100) and the payment for closure (₱500), and nothing else, because no annual fee applies when nothing is being granted for a year (`20260413000024_closure_fees.sql`). Everything else gets the annual schedule plus the situational extras, and never the closure fees. `createAssessment()` applies the same rule server-side, zeroing anything outside the applicable set, so a stale form cannot price a closure as a renewal.

Both figures used to sit in the closure checklist as requirements of kind `payment`, where a clerk ticked them like a document. Money owed belongs in the assessment, where it is stated, approved by the CTO head and matched to an official receipt — so migration 24 removes them from `transaction_requirements` and from the per-application rows of any closure still in flight. Granted and rejected applications keep theirs, since that is what was actually asked of the operator at the time. The certification fee stays on the change-of-unit checklist; that transaction's pricing is untouched.

### Franchise Ownership Rules

Two hard rules, enforced in the database (`20260413000018_one_operator_per_franchise.sql`) so no code path can bypass them:

1. **One franchise per operator** — a partial unique index on `mtop.normalize_operator_name(applicant_name)` `WHERE franchise_status = 'active'`. Closed/abandoned/revoked franchises stop counting, so surrendering one frees the operator to apply again.
2. **One operator per franchise** — `CHECK` constraints on `mtop_franchises.applicant_name` and `mtop_applications.new_applicant_name` reject co-ownership markers (`&`, `/`, standalone `AND`, `ET AL`). Commas are allowed — `DELA CRUZ, JUAN` is one person written surname-first.

Name matching is normalised for case, spacing and punctuation but is **not fuzzy**: `JUAN DELA CRUZ` and `JUAN P. DELA CRUZ` are two different operators.

`src/lib/operator-name.ts` mirrors both SQL helpers so forms can warn early and the actions can return a readable sentence — but all real matching goes through `mtop.find_operator_active_franchise()` (an RPC that hits the unique index), so the TS copy can't drift from the constraint. `grant_franchise()` re-checks on `transfer_owner`, since a successor could acquire their own franchise between filing and grant.

### Unit Identity Rules

The body, plate, motor and chassis numbers each identify one tricycle citywide, so **no two active franchises may share any of them** — body and plate in `20260413000021_unique_unit_identifiers.sql`, motor and chassis in `20260413000023_unique_motor_chassis.sql`. Four partial unique indexes over `mtop.normalize_unit_identifier(...)` `WHERE franchise_status = 'active'` enforce it; a blank or missing number is excluded from the index, and leaving `active` releases the number for reassignment — a unit legitimately moves to a new franchise when the old one closes.

Matching upper-cases and drops spacing and punctuation — `AB 1234`, `ab-1234` and `AB1234` are one plate — but is not fuzzy beyond that. `src/lib/unit-identifier.ts` mirrors the SQL helper, and `mtop.find_unit_identifier_conflict()` is the RPC that names the franchise already holding the number, so a clerk gets a sentence instead of a duplicate-key error. `useUnitIdentifierCheck()` (`src/lib/hooks/use-unit-identifier-check.ts`) runs the same lookup under all four fields while the clerk types.

`createNewFranchiseApplication` also keeps its own motor **+** chassis pair check, which is not redundant: it spans franchises of every status, so re-registering the same vehicle from a *closed* franchise is caught and told to use the renewal flow — something the active-only indexes deliberately allow.

A change of unit stages `new_plate_number`, `new_motor_number` and `new_chassis_number` and applies them on grant, so all three are checked twice — at filing by `createFranchiseTransaction`, and again in `grant_franchise()`'s `replace_unit` branch, since another franchise can take any of them in between. Running the migration over data that already has duplicates fails on purpose and names them; `supabase/scripts/report-duplicate-unit-identifiers.sql` lists them in full. There is no automatic fixer — unlike duplicate operators, only someone with the paper file knows which of the two records is wrong.

### Audit Trail

Every change to a franchise is logged by a database trigger, not by the server actions — `mtop.log_audit_change()` on `mtop.mtop_franchises` (`20260413000019_audit_trail.sql`). A write path that forgets to log leaves a hole nobody can see from the application side, so the capture point is the table itself: granting a transaction, the photo/driver editor, a fix typed into Studio and a script all land in `mtop.audit_logs` alike.

- `mtop.audit_logs` — `table_name`, `record_id`, `franchise_id`, `action` (`insert`/`update`/`delete`), `actor_id` (`auth.uid()`, null for service-role writes), and `changes` as `{ column: { old, new } }` holding **only** the columns that actually moved. Append-only: RLS grants `SELECT` and nothing else, and the trigger is `SECURITY DEFINER` so it writes past that.
- The trigger takes the franchise-key column and an ignore list as arguments (`'id'`, `'id,created_at,updated_at,created_by'`), so auditing a second table is a `CREATE TRIGGER` and nothing else.
- It does **not** replace `approval_logs`, `franchise_unit_history` or `franchise_ownership_history`. Those tie a change to the application that authorised it, which a trigger can't know; the audit log is the catch-all underneath.

`getFranchiseHistory()` (`src/lib/actions/audit.ts`) merges all five sources into one chronological `FranchiseHistoryEvent[]`. Column names and raw values are turned into readable lines by `src/lib/audit.ts`, which also tags each column as `operator` / `driver` / `unit` / `franchise` — that grouping is what the timeline's filters use, since the ordinance treats the operator and the driver as separate people with separate histories. Franchises created before the trigger existed have no `insert` row, so the registration event is synthesised from `created_at`/`created_by`; there is no backfill, because inventing rows from today's values would put wrong data in an audit table.

It renders via `HistoryTimeline` (`src/components/shared/history-timeline.tsx`) in two places: the full trail under the History tab of `/dashboard/franchises/[id]`, and the last six entries on the application detail page.

### Addresses

An operator's address is stored three ways at once (`20260413000020_barangay_purok.sql`):

- `mtop_franchises.barangay` — a foreign key into `mtop.barangays`, so addresses can be counted per barangay
- `mtop_franchises.purok` — free text; puroks have no citywide register
- `mtop_franchises.applicant_address` — the two composed into one readable line

The composed line is what the permit, search, reports and the audit trail read, so nothing downstream knows the address is structured. It is written by the server actions at filing time via `composeAddress()` (`src/lib/address.ts`) and never edited directly. Franchises registered before this migration keep their free-text `applicant_address` with a NULL `barangay`; `displayAddress()` handles both.

`mtop.barangays` holds the 51 barangays of Ozamiz City under the PSA's PSGC spellings (PSGC `1004210000`) — note `Banadero` and `Diguan`, which are also written Bañadero and Digu-an locally. It is keyed by name, so a franchise row carries the readable value and composing an address needs no join, with `ON UPDATE CASCADE` so correcting a spelling reaches every franchise using it. There is no write policy: the list changes by plebiscite, and a correction is an `UPDATE` run by an administrator. `BarangaySelect` (`src/components/mtop/barangay-select.tsx`) is the picker, a native `<select>` for the same reasons as `AssociationSelect`.

A change of ownership stages `new_barangay`/`new_purok` alongside `new_applicant_address`, and `grant_franchise()`'s `transfer_owner` branch moves all three onto the franchise, so a transferred franchise never keeps the previous owner's barangay.

### Associations

Most motorcabs belong to an operators' association (MODA); strikers operate without one, so `association_id` is nullable and "No association" is the picker's default first option. `mtop.associations` holds the registry (name, president, contact number, `is_active`), seeded from the AOMODA directory with 70 entries, and `mtop_franchises.association_id` links each franchise to one.

It is reference data, editable at `/dashboard/admin/associations` (gated on `admin.manage`) via `src/lib/actions/associations.ts` — presidents and contact numbers change every election cycle. Deactivating hides an association from new applications but keeps it on the franchises already using it; deleting is refused while any franchise references it.

`AssociationSelect` (`src/components/mtop/association-select.tsx`) is the picker used by both franchise forms. It is a native `<select>` so it registers directly with react-hook-form and gets keyboard type-ahead for the ~70 options; it lists "No association (striker)" first, then only active associations, plus the franchise's own current one if that has since been deactivated.

### Types

`src/types/database.ts` contains hand-maintained TypeScript types for all `mtop` schema tables and enums. Regenerate with:
```bash
npx supabase gen types typescript --project-id <id> > src/types/database.ts
```

### Permissions

`usePermissions()` hook (`src/lib/hooks/use-permissions.ts`) fetches the current user's role codes from `mtop.user_roles → mtop.role_permissions → mtop.permissions` and exposes `can(code)`, `canAny(...codes)`, `canAll(...codes)`.

That hook only decides what to **render**. A server action that trusts it isn't gated at all, since actions are callable directly — so actions that matter re-check with `hasPermission()` (`src/lib/permissions.ts`, a plain helper rather than a `"use server"` module, which would force every export to be an action). Filing is gated this way: `createNewFranchiseApplication` and `createFranchiseTransaction` both require `application.create`, which is seeded to the verification officer and the administrator only. The New Application button is hidden from everyone else and `/dashboard/applications/new` says so rather than showing a form that cannot be submitted.

Most other actions in `src/lib/actions/` still check only that the caller is signed in, including every stage transition in `updateApplicationStatus()`. That is a real gap, not a decision.

`useProfile()` is provided by `ProfileProvider` in the dashboard layout — gives access to `full_name`, `email`, and `avatar_url`.

### Component Structure

- `src/components/ui/` — shadcn primitives (do not hand-edit these)
- `src/components/layout/` — `Sidebar`, `Topbar`, `PageHeader`, `NavigationProgress`
- `src/components/shared/` — reusable domain-agnostic components (`StatusBadge`, `ApprovalStepper`, `TimelineLog`, `ExpirationBadge`)
- `src/components/mtop/` — domain-specific forms (`RequirementChecklist`, `InspectionChecklist`, `FeeAssessmentForm`, `PaymentForm`)

Every write on the application detail page goes through `useGuardedAction()` (`src/components/shared/guarded-action.tsx`): `confirm()` asks first, `start()` puts up the `BusyOverlay`, and `finish()` refreshes and holds the overlay until the refreshed page lands. A new action button on that page should use it too. The one exception is the photos card's inline autosave at verification, which fires as the clerk types.

### Route Structure

All authenticated routes live under `/dashboard`. The dashboard layout (`src/app/dashboard/layout.tsx`) is a **Client Component** that wraps children in `ProfileProvider` + `SidebarProvider`.

Page files (`page.tsx`) are Server Components; heavy client logic is split into `*-content.tsx` Client Components alongside them.

`/print/mtop/[id]` renders the permit at exact PDF coordinates, so every run is absolutely positioned and `nowrap`. Data values that could be long go through `Fit` rather than `T` (`src/components/mtop/franchise-card.tsx`): it estimates the string's width, shrinks the type until it fits the space, and clips at the printable edge so nothing can run off the paper.

`/print/confirmation/[id]` prints the LTO Confirmation Slip for any **granted** application — not only the annual confirmation, since the LTO asks for one after a renewal or a change of unit too. There is no source PDF for it (the original is an office form), so unlike the card it is laid out as flowed lines rather than absolute coordinates: preprinted wording in Arial, typed values on ruled blanks in Courier, all system fonts so nothing can fail to load mid-print. A value too long for its rule is shrunk by `Blank` (`src/components/mtop/confirmation-slip.tsx`) rather than clipped — Courier is monospaced, so the fitting size is arithmetic, expressed in `cqw` against the rule's own width so it needs no measuring pass and survives rewording. The copy marking (`LTO COPY`) and the mayor's name are constants at the top of that file.

Both routes share `PrintControls` (`src/app/print/print-controls.tsx`) and `print.css`, which sets the 8.5 × 13in page.

`/dashboard/applications` filters in the database, not after paging. The toolbar is the shape the HRIS employee list uses — a search box, then a multi-select popover per column (`FacetedFilter`, `src/components/shared/faceted-filter.tsx`) — and every choice lives in the URL (`search`, `status`, `type`, `expiration`, `page`, each a comma-joined list), so a filtered view can be linked, bookmarked and reloaded. The dashboard's pipeline and renewal cards link straight into it.

Search covers the franchise behind the application — MTOP number, applicant, body number, plate — through an `!inner` join, which is also what lets the row count reflect the filter. Values go into the `or(...)` **quoted**, because PostgREST reads `,` `.` and `(` as grammar: unquoted, a clerk searching `DELA CRUZ, JUAN` gets a parse error rather than a result.

Permit expiry is a filter now rather than an invisible URL parameter. `expirationDateBounds()` (`src/lib/utils/permit-expiration.ts`) states the three statuses as bounds on the `granted_until` DATE column, and `getExpirationStatus()` reckons the same boundaries in whole days in office time — the ones `getRenewalStats()` counts by — so a dashboard card and the list it links to report the same number, and no row is selected as expired while its badge reads due for renewal. The expiry column reads the franchise, so it shows on a renewal still in verification, which is the row where how overdue the operator is matters most.

`/dashboard/franchises/[id]` is the franchise (operator) record — identity, current unit and driver, every transaction filed against it, and the full audit trail. It is reached from the "Franchise record" button on an application, not from the sidebar; there is no franchise list page.

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # service_role JWT — used only in admin.ts
```
