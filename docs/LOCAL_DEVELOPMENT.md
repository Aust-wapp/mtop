# Local development and Google sign-in

These commands use the clean MTOP worktree at
`C:\Users\AJ\Documents\Projects\mtop-fees`. Start Supabase from this
directory: the CLI reads Google credentials from its root `.env` file.
Ignored `.env` and `.env.local` files were copied locally for this worktree;
new worktrees need their own local copies. Never commit those files.

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
   with `env(...)`. Its Auth site URL is `http://localhost:3000`; the allowed
   application redirect is `http://localhost:3000/auth/callback`.
3. Put `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the **local**
   Supabase anon key in the ignored `.env.local` file as
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The auth callback also uses
   `SUPABASE_SERVICE_ROLE_KEY` when it promotes a pre-registered email to its
   first Google-authenticated profile. Keep both keys local. Obtain local keys
   with `npx supabase status`; do not use hosted-project keys here.
4. An administrator must pre-authorize the Google account in the local
   `mtop.user_profiles` data. The callback rejects accounts without a matching
   profile or pre-registered email.

## Start and sign in

1. Start Docker Desktop and wait for `docker version` to show both Client and
   Server. Run `docker ps` to see whether MTOP is already running.
2. In PowerShell, run `cd C:\Users\AJ\Documents\Projects\mtop-fees` and
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

Verified local URL values from `supabase/config.toml`, `.env.local`, and the
auth callback route:

- Frontend origin and Google Authorized JavaScript Origin:
  `http://localhost:3000`
- Login page: `http://localhost:3000/auth`
- Application callback: `http://localhost:3000/auth/callback`
- Local Supabase Auth URL: `http://127.0.0.1:54321`
- Google Authorized Redirect URI:
  `http://127.0.0.1:54321/auth/v1/callback`

Keep `localhost` for the app and `127.0.0.1` for Supabase as configured.
Google Cloud Console needs no change if its Web OAuth client already has the
origin and redirect URI above. The local Supabase Auth settings are in
`supabase/config.toml`; hosted Supabase settings do not configure this stack.
The callback accepts a matching profile ID or promotes a pre-registered email
to the authenticated user's ID and roles. Users without an authorized profile
are signed out and returned to `/auth?error=unauthorized`.

To inspect the current migration head without changing data, run
`docker exec supabase_db_mtop psql -U postgres -d postgres -Atc "select max(version) from supabase_migrations.schema_migrations"`.

## Downloading blank application PDFs

From **Admin → Print Forms**, open a blank form in a new tab. Its **Download
PDF** action renders the same two-up A4 print page and downloads a one-page
PDF. The server uses a local headless browser for this action. On this Windows
laptop it finds Microsoft Edge automatically. Elsewhere, set the server-only
`MTOP_PDF_BROWSER_PATH` environment variable to a Chrome, Edge, or Chromium
executable. If Next.js cannot reach itself at `http://localhost:3000`, set
`MTOP_PDF_BASE_URL` to the trusted application origin. Never use a
request-supplied URL for that setting: the renderer forwards the signed-in
user's cookies to the protected preview. These settings contain no OAuth
secret. The Print button remains available when no server browser is installed.
