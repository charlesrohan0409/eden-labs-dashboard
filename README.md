# Eden Labs — Ops Dashboard

Charles Rohan's agency dashboard: clients, CRM (outbound pipeline + inbound
enquiries), content (board, calendar, composer, analytics, repurposing),
finance (invoicing, personal accounts/budgets/subscriptions), a client
portal, meeting transcripts (via Fathom), a real calendar view (via Google
Calendar), and a companion Chrome extension for working from LinkedIn
directly.

## Stack

Vite + React 19 + Tailwind, no TypeScript. Data lives in Supabase (Postgres
— both the project and the Vercel deployment are on paid plans). Every
third-party API call and every database read/write goes through a small
serverless proxy in `api/`, so secrets and the service-role key never reach
the browser.

**Persistence model:** almost everything (clients, tasks, posts, invoices,
CRM, finance) lives as one JSON document in a single `app_data` row, mutated
through pure functions in `src/data/mutations.js` — the same functions run
client-side (`src/hooks/useAppData.js`, optimistic) and server-side
(`api/_dataHandlers.js`, source of truth) so the logic never forks. Writes
are optimistically locked against `app_data.updated_at` as a version token:
a stale write gets rejected with a 409 carrying the fresh data, and the
client replays its mutation on top of it rather than either losing the edit
or silently overwriting someone else's. Two more tables hold PIN
credentials (`owner_auth`, `client_credentials`) — never the JSON blob,
kept separate so a leak of one can't authenticate as the other.

See `SESSION_CONTEXT.txt` for the full build history and every
architectural decision behind the current shape of the app.

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in .env.local — see "Environment variables" below
npm run dev
```

Vite only reads `.env.local` at server **startup** — restart `npm run dev`
after adding or changing any value in it. `npm run dev` talks to the same
Supabase project as production; there's no separate dev database, so
anything written locally is a real write. Clean up test data afterward.

## Environment variables

All server-side secrets live in `.env.local` (gitignored, never committed).
`.env.example` documents every variable with no real values — copy it to
`.env.local` and fill in real ones.

| Variable | Required for | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Everything — the dashboard has no other data store | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Everything | Supabase project → Settings → API → `service_role` secret. Bypasses RLS — never expose to the browser. |
| `SESSION_SECRET` | Owner + client login | Any long random string, e.g. `openssl rand -hex 32`. Changing it logs everyone out. |
| `BUFFER_API_KEY` | Content scheduling, post metrics, analytics | buffer.com → Settings → API |
| `FATHOM_API_KEY` | Meeting transcripts in the client portal | fathom.video/customize#api-access-header → generate a key |
| `RESEND_API_KEY` | Sending invoices/onboarding/report emails | resend.com → API Keys → Create |
| `RESEND_FROM` | (optional) sending as your own address | resend.com → Domains → verify one, then `Name <you@domain.com>` |
| `GOOGLE_CALENDAR_ICAL_URL` | The Calendar page, dashboard meetings card, and the Today panel's "Today's calls" | Google Calendar → Settings → your calendar → "Secret address in iCal format" |

None of these carry a `VITE_` prefix — Vite bundles every `VITE_*` variable
into client-visible JS at build time, so deliberately none of these are
`VITE_*`. Everything above is read server-side only: in dev, `vite.config.js`
loads it into `process.env` for its API-emulation middleware; in production,
each `api/*.js` file reads it directly once deployed to Vercel.

## Deploying (Vercel)

1. Push this repo to GitHub (or any git remote Vercel can read).
2. Import it in Vercel. Framework preset: Vite. Build command/output
   directory are auto-detected (`npm run build` → `dist`).
3. Add every variable from the table above in the Vercel project's
   **Settings → Environment Variables** — same names, same values as
   `.env.local`. Vercel doesn't read `.env.local`.
4. Deploy. `vercel.json` already routes `/portal/*` and every other
   non-`/api/*` path to `index.html` so client-side routing works.

Both the Supabase project and the Vercel deployment are on paid plans, which
matters for two things specifically: Supabase Pro takes automatic daily
backups (7-day retention, no setup needed — see **Database → Backups** in
the Supabase dashboard), and Vercel's Fast Origin Transfer cap that once
paused this project no longer applies. Point-in-Time Recovery is available
as a paid Supabase add-on if daily backups aren't tight enough; it isn't
enabled, since the app's write volume doesn't need second-level recovery
granularity today.

## Chrome extension

`chrome-extension/` is a separate, unpacked Manifest V3 extension — no
build step. Load it via `chrome://extensions` → Developer mode → **Load
unpacked** → select the `chrome-extension` folder directly (not a copy of
it; loading a duplicate is a real trap, see `SESSION_CONTEXT.txt`).

It logs in with the same PIN system as the dashboard, and the PIN entered
decides its scope: the **owner's** PIN connects it to the whole agency;
a **client's** portal PIN scopes everything captured from that Chrome
profile to that client — meant for a browser profile that's already signed
into that client's own LinkedIn account. From LinkedIn it can:

- Right-click any name (feed, connections, search, a DM thread) to save a
  CRM lead, add someone to a daily "comment list," or log an inbound
  enquiry from a DM
- Save a post's text to the content library
- Log outreach numbers and leads from the popup without leaving the page

## Known limitations (read before sending this to real clients)

- **One JSON document is the persistence model.** Fine at the current
  write volume for a single operator; if this ever needs to support many
  concurrent editors or a much higher write rate, the collections that grow
  fastest (expenses, the finance activity log, outreach) are the ones worth
  moving to real tables first.
- **No automatic status transitions** beyond the ones actually wired up:
  scheduled posts auto-flip to "published" once Buffer confirms; invoices
  and contract renewals do not auto-lapse and are manual.
- **AI contract editing is disabled**, not removed — it needs its own
  Anthropic API key wired up server-side, which hasn't been done yet.
- **A `team_members` table exists in Supabase with no UI wired to it** —
  scaffolding for multi-user access that was never finished. Ignore it
  until that feature actually gets built.
- Delivery-metric "on track" logic supports a `direction: "lower"` field
  (e.g. bug count, response time) as of the app/book client types, but most
  existing metrics don't set it and default to "higher is better."

See `SESSION_CONTEXT.txt` for the full list and everything else about how
this app is built.
