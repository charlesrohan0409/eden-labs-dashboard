# Session handoff — finance & ledger

Last updated: 1 September 2026.

This exists because the financial work in this repo carries a lot of context
that is expensive to rebuild and dangerous to guess at. Read this before
touching anything under `src/lib/ledger*`, `api/_gmail.js`, or Charles's
money. Every figure below was verified against a bank statement.

---

## 1. The rule that matters most

**Never guess at a financial fact. Ask.**

Every serious error in this project came from filling a gap with an
assumption instead of stopping. The record:

| What I assumed | What it cost |
| --- | --- |
| ₹85/USD for the overseas balance | Wrong by ₹8.33/dollar until his own withdrawal priced it |
| The overseas $900 was an opening balance | Hid ₹76,500 of client revenue; made him look like he'd lost money |
| A ₹1.24L "family settled" plug | Asserted 5× the real figure |
| `alerts@hdfcbank.net` as the sender | Six real alerts unread; sync reported an empty inbox |
| Test cases I wrote myself for the alert parser | 9/9 passed, reality scored 0/27 |

Asking cost one message each time. Not asking cost hours and eroded trust.
When a number can't be derived, say "I don't know" and put the question to
him — he answers quickly and precisely.

---

## 2. Who's who

Established over several sessions. Do not re-derive these.

- **Francis Antony Xavier** — brother. Also trades as **Liberty Seafood**
  (UPI `FRANCISANTONY007@okhdfcbank`).
- **Antony Xavier** — dad. Also **ABC Fish Traders** and **Thoondil Seafoods**.
- **Sudha Antony Xavier** — mum.
- **Merlin Manikam Deven** — girlfriend AND a client. See §4.
- **Alphonse Rajiv Fernando** — friend.
- **Mrs Souwri Paramasivam**, **Mrs Abirami Kadirwan** — neighbours acting as
  middlemen for family money.
- **Mano Athai** — relative; the ₹50,000 loan.
- **Leadbolt / Chemaly Associates** — the same overseas client.
- **Brandingta**, **Mrinal Choudhury**, **Vinayak Naik** — clients.
- **Beulah S** — church donations (`expense:giving`).
- **Depesh Selvaraj** — Sales Navigator, business.
- **Accretive Cleantech / Ecofy Finance** — the **dad's vehicle EMI**,
  ₹4,238 on the 5th of every month. NOT Charles's expense.
- **IDFC** — a ₹2,36,260 loan taken in Charles's name **for his dad**, who
  repaid it. See the open question in §7.

Family money is modelled as `liability:family` with `conduit: true`, never as
an expense. Over 20 months ₹17.9 lakh flowed each way and netted to ~₹25k —
that balance is the proof the treatment is right.

---

## 3. Where the money actually is

As at 30 August 2026 — 2,971 entries, trial balance **exact**, period
1 Jan 2025 → 30 Aug 2026 (20 months).

```
income      ₹8,90,246      opened at   −₹3,998
spending    ₹8,24,134      kept         ₹66,112     (7.4%)
                           net worth    ₹62,113
```

| Account | Balance | Ledger account |
| --- | --- | --- |
| Kotak ••3630 | ₹18,339 | `asset:bank:kotak` |
| HDFC ••3752 | ₹479 | `asset:bank:hdfc` |
| Overseas (USD 900) | ₹84,000 | `asset:overseas` |
| Investments (Groww) | ₹19,800 | `asset:investments` |
| Other accounts (SBI/Axis/TMB) | ₹9,360 | `asset:other-accounts` |
| HDFC card ••5902 | ₹2,454 owed | `liability:card:hdfc` |
| Yes Bank Pop Card | ₹3,825 owed | `liability:card:yesbank` |
| Amazon Pay Later | ₹6,160 owed | `liability:card:amazonpay` |
| Family money held | ₹57,804 owed | `liability:family` |
| Merlin | ₹378 owed **to him** | `liability:partner` |

**₹17.5 lakh has passed through** his accounts that was never his.

### The reconciliation he keeps asking about

His instinct — "if I started from nothing, what I kept should equal what I
have" — is correct, and it now holds: −₹3,998 + ₹66,112 = ₹62,113.

When he says "I have ₹1.8 lakh", it decomposes as:

```
₹1,79,725   Finance-tab accounts + the ₹50,000 loan
 −₹50,000   the loan is DOUBLE COUNTED — money hasn't left yet
 −₹15,435   owed on three cards
 −₹57,804   family money sitting in his accounts that isn't his
──────────
   ₹62,113   actually his
```

---

## 4. Classification rules he gave

- **Merlin**: payments of **₹20,000+** are invoiced work (`income:client`).
  Anything smaller is a personal loan between them, since settled. Applying
  this leaves the running account at ~₹378 in his favour, against the ~₹1,000
  he remembered independently — that agreement is what validates the rule.
- **Cash withdrawals**: ≥₹10,000 is family money; ₹1k–5k is his own spending.
  Verified — all 24 large withdrawals had family money arriving within 4 days,
  zero exceptions.
- **Uncategorised debits under ₹200**: mostly eating out. Applied to 400
  transactions.
- Rapido/Uber → travel. Swiggy/Zepto/Blinkit/Zomato → food. Naturals → ice
  cream. Muslim names → usually food or groceries.
- **Church donations** get their own category (`expense:giving`).
- The **Betterline ₹66,794 course was refunded ₹70,845** — net −₹4,052. Any
  payee ranking must net refunds or it lists a free course as his second
  largest expense.

---

## 5. Architecture

### Storage — three separate places, deliberately

| Table | Holds | Why separate |
| --- | --- | --- |
| `app_data` (id=1) | The whole dashboard, one jsonb blob | Rewritten in full on every mutation |
| `app_ledger` (id=1) | 2,971 ledger entries, ~1.2 MB | In the blob, every ticked task would upload a megabyte. `app_data.id` also has `check (id = 1)`, so a second row was never possible. |
| `app_integrations` | Gmail refresh token | `/api/data` returns the blob to the **browser** — a token there is readable by anyone who opens the dashboard |

**Scale**: 1.17 MB raw, 128 KB gzipped, ~1,800 entries/year. Fine until about
year four, when it approaches Vercel's 4.5 MB response limit; the fix then is
server-side date filtering, not a rewrite.

### Key modules

- `src/lib/ledger.js` — double entry. Integer minor units, legs must sum to
  zero, unbalanced entries throw. Balances are derived, never stored.
- `src/lib/ledgerAnalysis.js` — totals, statements, `LABEL_OVERRIDES`.
- `src/lib/ledgerInsights.js` — payee extraction, recurring detection,
  category trends.
- `src/lib/financeToLedger.js` — Finance action → ledger entry.
- `src/lib/ledgerReport.js` — the accounting pages of the month report.
- `src/lib/alertToExpense.js` — Gmail alert → Finance expense.
- `api/_gmail.js` — OAuth, fetching, parsing, dedupe.

### Invariants that must not be broken

1. **Conduit money is excluded from income and expenses, included in balances
   and cash flow.** It really moved the bank; it was never his. Getting this
   backwards is a ₹17.5 lakh error.
2. **Legs are debit-positive.** Raising a liability is NEGATIVE. Getting this
   wrong produced a −₹1.45 lakh card balance on the first card import.
3. **The statement wins.** Gmail is a freshness layer; when they disagree the
   reconciled statement is right.
4. **Nothing writes to the ledger unattended.** Every Gmail alert is a
   proposal.

---

## 6. Gmail integration

Working. `rohanantony29@gmail.com`, scope `gmail.readonly` only.

- Google Cloud project `edenlabs-dashboard`; client ID in `.env.local` and
  Vercel; secret in both (local file is gitignored).
- **Match banks by DOMAIN, never by address.** HDFC sends from
  `alerts@hdfcbank.bank.in`; every address I guessed was wrong and the sync
  silently reported an empty inbox for hours.
- **The transaction is often in the subject line**, not the body. Kotak's
  body strips to noise.
- **Payee is in the brackets**: `towards VPA paytmqr6wfrr7@ptys (AYYAPPAN
  IDLI)` — the handle is machine noise.
- **Dedupe counts and consumes**, two passes with exact dates first. A Set
  let one ₹5 on file swallow every ₹5 alert; single-pass greedy matching let a
  later alert steal an earlier one's row and hide a real transaction.

If a transaction doesn't appear, check in this order: is the sender's domain
listed → did it parse (the "couldn't read" list shows what didn't) → was it
suppressed as already-in-ledger (usually correct).

---

## 7. Open questions for Charles

1. **The IDFC loan is split across two treatments.** Four payments totalling
   ₹24,247 sit in `expense:bnpl` (his own), while the other eight — including
   the ₹2,36,260 disbursement — are `liability:family` (his dad's), per his
   earlier instruction. One loan, two answers. That single decision is worth
   ₹24,247 of surplus and ₹24,247 of what he owes family. **Ask before
   touching it.**
2. **Gramiyam** — his ecom brand. Found ₹1,800 of Meta ads and a ₹5,499
   RazorpayX credit, but he remembers ~₹20k of revenue that isn't in these
   accounts. Where did it settle?
3. **Overseas is $900 in conversation, $977 in the dashboard.** ₹7,187 apart.
4. **Jan–Feb 2025 is HDFC-only.** The Kotak statement starts 1 Apr 2025 and
   the card statements 20 Mar, so those two months are understated.
5. Two card balances (Yes Bank ₹3,825, Amazon Pay ₹6,160) are his own figures
   from screen, not statements — the only non-verified numbers left.

---

## 8. Practical notes

- **Push is blocked** for me by the permission classifier. Always hand him
  the command; never assume a commit reached production. He has been testing
  against `dashboard.theedenlabs.com` while fixes sat unpushed more than once.
- **`rm -rf node_modules/.vite`** before believing a chart is broken. A stale
  dep cache renders recharts bars as empty `<g>` and looks exactly like a
  library bug — see the memory file.
- **Restart the dev server after editing `.env.local`** — Vite reads it once
  at startup.
- **Never put a data file in `public/`.** A 1 MB `_ledger.json` staged there
  for preview would have shipped his entire financial history to the open
  internet at the next deploy.
- The browser pane screenshots at scroll 0 regardless of programmatic
  scrolling; use `elementFromPoint` to verify laid-out content instead.
- Verify UI by rendering a temporary probe module under `src/` that imports
  bare specifiers and letting Vite resolve them. Delete it before committing.
