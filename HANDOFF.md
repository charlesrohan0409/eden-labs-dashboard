# Session handoff — finance & ledger

Last updated: 1 September 2026 (after the xFlow payout and squaring family).

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
- **Leadbolt / Chemaly Associates** — the same overseas client. Payouts settle
  through **xFlow** (`updates@xflowpay.com`), and its email is the ONLY notice
  — the ₹56,546.63 payout on 31 Aug generated no bank alert at all. He holds
  **USD 900 in xFlow** and that is a balance to ASK for, not to derive: a
  payout does not mean the balance fell by that much, and assuming it did
  understated the account by ₹57,367 of unrecorded earnings.
- **Mano J / Mano Athai** — relative. Lent ₹50,000 on 1 Sep 2026, due back
  **10 October 2026**.
- **Brandingta**, **Mrinal Choudhury**, **Vinayak Naik** — clients.
- **Beulah S** — church donations (`expense:giving`).
- **Depesh Selvaraj** — Sales Navigator, business.
- **Accretive Cleantech / Ecofy Finance** — the **dad's vehicle EMI**,
  ₹4,238 on the 5th of every month. NOT Charles's expense.
- **IDFC** — a ₹2,36,260 loan taken in Charles's name **for his dad**, who
  repaid it. All twelve instalments belong to family; four had been split into
  his own spending and were put back (§3).

Family money is modelled as `liability:family` with `conduit: true`, never as
an expense. Over 20 months ₹18 lakh flowed each way and now nets to zero —
see §3. That it balances at all is the proof the treatment is right.

---

## 3. Where the money actually is

As at 30 August 2026 — 2,971 entries, trial balance **exact**, period
1 Jan 2025 → 30 Aug 2026 (20 months).

```
income      ₹8,91,066      opened at   −₹3,998
spending    ₹7,66,331      kept        ₹1,24,735    (14.0%)
                           net worth   ₹1,20,737
```

The identity holds exactly: −₹3,998 + ₹1,24,735 = ₹1,20,737. Charles's own
test — "if I started from nothing, what I kept should equal what I have" — is
the fastest way to catch a broken change. Run it after touching anything.

| Account | Balance | Ledger account |
| --- | --- | --- |
| Kotak ••3630 | ₹18,339 | `asset:bank:kotak` |
| HDFC ••3752 | ₹7,026 | `asset:bank:hdfc` |
| Overseas — xFlow (USD 900) | ₹84,820 | `asset:overseas` |
| Mano Athai — due 10 Oct 2026 | ₹50,000 | `asset:receivable` |
| Investments (Groww) | ₹19,800 | `asset:investments` |
| Other accounts (SBI/Axis/TMB) | ₹9,360 | `asset:other-accounts` |
| HDFC card ••5902 | ₹2,454 owed | `liability:card:hdfc` |
| Yes Bank Pop Card | ₹3,825 owed | `liability:card:yesbank` |
| Amazon Pay Later | ₹6,160 owed | `liability:card:amazonpay` |
| Family money held | ₹23,557 — **his to sort** | `liability:family` |
| Merlin | ₹378 owed **to him** | `liability:partner` |

Total assets **₹1,33,176**, owed **₹12,439** on three cards.

**₹18 lakh has passed through** his accounts that was never his.

### The family gap — ₹23,557, and he is closing it himself

Charles: *"I don't owe anything to my family. Whatever has come from them has
gone out for their own purpose."* ₹18,04,453 arrived, ₹17,80,896 is tagged
going back out. Of the original ₹57,804 gap:

- **₹34,247 was a real classification error**, already fixed — four IDFC
  instalments and a ₹10,000 branch withdrawal had been moved into his own
  spending, splitting one loan across two treatments while its other eight
  instalments stayed with family. Reverted on evidence.
- **₹25,607 remains, and the target is ₹4,500 — he owes his brother that.**
  Nine corrections came from him directly and are applied: the Abirami ₹50,000
  went out as ₹37,150 to Pramila plus ₹12,850 to Liberty (exactly ₹50,000); the
  Liberty ₹2,500 went straight to Md Ehsan Alam the same day; Hostinger ×2,
  Muthumari ×2 and two Sayan Baidya payments were his own and left family; the
  third Sayan payment was his dad's and stayed.

  **The remainder is pocket money.** He said the many ₹1k–₹3k arrivals from his
  parents "weren't any borrowing — most was my pocket money". A gift is not a
  liability. Ticking the 21 non-EMI receipts of ₹5,000 or under lands the
  account at ₹4,582, which is ₹82 from the ₹4,500 he owes. He is choosing which
  in the artifact; apply his list, do not infer it.

  Keep the ₹5,000-at-the-start-of-a-month receipts OUT of that — those are the
  float for the dad's ₹4,238 vehicle EMI and pair with it days later.

**A caution on matching.** Pairing receipts to payments oldest-first (FIFO)
produced two false "unmatched" receipts, because he settles specific receipts
with specific payments days apart, not in order. It reported ₹1,11,671 on the
first attempt and ₹23,107 on the second, and both were artefacts. Use it to
narrow, never to conclude.

### The ₹1.32 lakh he expected

He said he should be holding about ₹1.32 lakh after everything. He was right:
total assets are **₹1,33,176**. Less ₹12,439 owed on three cards, ₹1,20,737 is
his. The ₹50,000 to Mano Athai genuinely left on 1 Sep, so it is a real
receivable now rather than the double count it was while the money sat in the
overseas balance.

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

1. **Gramiyam** — his ecom brand. Found ₹1,800 of Meta ads and a ₹5,499
   RazorpayX credit, but he remembers ~₹20k of revenue that isn't in these
   accounts. Where did it settle?
3. **Overseas is $900 in conversation, $977 in the dashboard.** ₹7,187 apart.
4. **Jan–Feb 2025 is HDFC-only.** The Kotak statement starts 1 Apr 2025 and
   the card statements 20 Mar, so those two months are understated.
4. Two card balances (Yes Bank ₹3,825, Amazon Pay ₹6,160) are his own figures
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
