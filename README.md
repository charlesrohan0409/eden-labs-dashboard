# Eden Labs — Ops Dashboard

Charles Rohan's agency dashboard: clients, CRM, content scheduling (via Buffer),
finance/invoicing, a client portal, meeting transcripts (via Fathom), and a
real calendar view (via a Google Calendar iCal feed).

## Stack

Vite + React 19 + Tailwind. No database yet — all app data lives in the
browser's `localStorage`. Every third-party API call goes through a small
serverless proxy in `api/`, so secrets never reach the browser. See
`SESSION_CONTEXT.txt` for the full architecture writeup and history.

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in .env.local — see "Environment variables" below
npm run dev
```

Vite only reads `.env.local` at server **startup** — restart `npm run dev`
after adding or changing any value in it.

## Environment variables

All server-side secrets live in `.env.local` (gitignored, never committed).
`.env.example` documents every variable with no real values — copy it to
`.env.local` and fill in real ones.

| Variable | Required for | Where to get it |
|---|---|---|
| `VITE_OWNER_PASSCODE` | Confirming "End contract" | Pick your own — this is a speed bump, not real auth |
| `BUFFER_API_KEY` | Content scheduling, post metrics | buffer.com → Settings → API |
| `FATHOM_API_KEY` | Meeting transcripts in the client portal | fathom.video/customize#api-access-header → generate a key |
| `RESEND_API_KEY` | Sending invoices/onboarding/report emails | resend.com → API Keys → Create |
| `RESEND_FROM` | (optional) sending as your own address | resend.com → Domains → verify one, then `Name <you@domain.com>` |
| `GOOGLE_CALENDAR_ICAL_URL` | The Calendar page + dashboard meetings card | Google Calendar → Settings → your calendar → "Secret address in iCal format" |

None of these have a `VITE_` prefix except the passcode — Vite bundles every
`VITE_*` variable into the client-visible JS at build time, so anything
without that prefix stays server-only (read in `api/_handlers.js`, mounted
into the dev server by `vite.config.js`, and served by the individual
`api/*.js` files once deployed to Vercel).

## Deploying (Vercel)

1. Push this repo to GitHub (or any git remote Vercel can read).
2. Import it in Vercel. Framework preset: Vite. Build command/output
   directory are auto-detected (`npm run build` → `dist`).
3. Add every variable from the table above in the Vercel project's
   **Settings → Environment Variables** — same names, same values as
   `.env.local`. Vercel doesn't read `.env.local`.
4. Deploy. `vercel.json` already routes `/portal/*` and every other
   non-`/api/*` path to `index.html` so client-side routing works.

## Known limitations (read before sending this to real clients)

- **No real backend or auth.** Every client's data — including every other
  client's contract value, PIN, and invoices — sits in one shared
  `localStorage` blob in the browser. Anyone who opens devtools on their own
  client portal link can read every other client's data. Fine for a small
  trusted client base short-term; a real fix means a proper backend
  (Supabase or similar) with per-client access control.
- **No automatic status transitions.** Scheduled posts don't auto-flip to
  "published," invoices don't auto-flip to "overdue," contract renewals don't
  auto-lapse. All of this is manual right now.
- **AI contract editing is disabled**, not removed — it needs its own
  Anthropic API key wired up server-side, which hasn't been done yet.
- Delivery-metric "on track" logic supports a `direction: "lower"` field
  (e.g. bug count, response time) as of the app/book client types, but most
  existing metrics don't set it and default to "higher is better."

See `SESSION_CONTEXT.txt` for the full list and everything else about how
this app is built.
