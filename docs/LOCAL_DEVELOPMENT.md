# Local development and Google sign-in

These commands use the main MTOP worktree at
`C:\Users\AJ\Documents\Projects\mtop`. Start Supabase from this directory:
the CLI reads Google credentials from its root `.env` file. Starting the same
project from another worktree without that file can leave literal `env(...)`
placeholders in the Auth container.

## One-time local setup

1. In Google Cloud Console, use a **Web application** OAuth client. Its
   **Authorized JavaScript origin** is `http://localhost:3000`. Its
   **Authorized redirect URI** is
   `http://127.0.0.1:54321/auth/v1/callback`. The redirect URI belongs to
   local Supabase Auth, not the Next.js callback. Add these entries if they
   are missing; an existing client with both entries needs no change.
2. Put the client credentials in the ignored root `.env` file under
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`. Do not commit that file.
   The checked-in `supabase/config.toml` enables Google and reads those names
   with `env(...)`. It sets the Auth site URL to `http://localhost:3000` and
   allows `http://localhost:3000/auth/callback` as an app redirect.
3. Put `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the **local**
   Supabase anon key in the ignored `.env.local` file as
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Obtain the current local key with
   `npx supabase status`; do not copy a hosted project's keys into local setup.
4. An administrator must pre-authorize the Google account in the local
   `mtop.user_profiles` data. The callback rejects accounts without a matching
   profile or pre-registered email.
5. The callback's account-migration path also needs
   `SUPABASE_SERVICE_ROLE_KEY` in the ignored root `.env.local`. Use only the
   service-role key reported by this local Supabase stack; never place it in a
   tracked file or share its value.

## Start and sign in

1. Start Docker Desktop and wait for `docker version` to show both Client and
   Server. Run `docker ps` to see whether MTOP is already running.
2. In PowerShell, run `cd C:\Users\AJ\Documents\Projects\mtop` and
   `npx supabase start`. It reuses an existing MTOP stack; do not reset the
   database. Core local endpoints are API/Auth `http://127.0.0.1:54321`,
   database port `54322`, Studio `http://127.0.0.1:54323`, and mail port
   `54324`. A restarting Vector logging container does not prevent sign-in.
3. Run `npm run dev -- --hostname localhost --webpack`. The verified local
   Next.js URL is `http://localhost:3000`. Webpack is used here because
   Turbopack hit a Windows resource error with both local Supabase stacks up.
4. Open `http://localhost:3000/auth`, click **Continue with Google**, and
   complete Google's account selection. Supabase receives Google's response
   at `http://127.0.0.1:54321/auth/v1/callback`, then redirects the browser
   to `http://localhost:3000/auth/callback`. An authorized account reaches
   `/dashboard`; an unknown account returns to `/auth?error=unauthorized`.

The app uses `localhost` for its origin and callback while local Supabase
uses `127.0.0.1`. Keep those hostnames as configured. Google Cloud Console
changes are needed only if the two entries in step 1 are absent or differ.
The local Supabase Auth settings are in `supabase/config.toml`; the hosted
Supabase dashboard's provider settings do not configure this local stack.

## Synthetic MTOP Operators review data

To add the clearly synthetic operator scenarios used to review the Operators
directory and detail tabs, run this explicit local-only seed from the project
root after confirming the MTOP Supabase stack is running:

```powershell
Get-Content supabase/seed_mtop_operators_local.sql -Raw |
  docker exec -i supabase_db_mtop psql -v ON_ERROR_STOP=1 -U postgres -d postgres
```

The seed checks that it is running through the local Docker database socket and
that the database is at migration `20260413000030`. It refuses partial seed
data and is a no-op after a complete run. It does not reset the database or
apply migrations. The records use fictional `TEST` identifiers and remain in
the local database for manual review.

To inspect the current migration head without changing data, run
`docker exec supabase_db_mtop psql -U postgres -d postgres -Atc "select max(version) from supabase_migrations.schema_migrations"`.
