// Double-entry ledger.
//
// WHY THIS EXISTS
//
// Every money bug this dashboard has had was the same bug: money moved on
// one side and not the other. A card payment reduced the bank but not the
// debt. A subscription moved the balance but skipped the currency
// conversion. Lending money moved nothing at all. Each was found only after
// a number on screen looked wrong.
//
// Double entry makes that class of bug unrepresentable. A transaction is a
// set of legs that must sum to zero; one that doesn't cannot be written.
// The invariant enforces itself instead of depending on whoever writes the
// next mutation remembering both halves.
//
// Account balances become DERIVED — summed from the legs — rather than
// stored numbers that each mutation has to remember to update. A derived
// balance cannot drift.
//
// AMOUNTS ARE INTEGER MINOR UNITS (paise / cents).
//
// Deliberate, and the one place this file breaks with the rest of the
// codebase, which uses floats. 0.1 + 0.2 !== 0.3, and a ledger whose legs
// almost balance is worse than no ledger — it would fail its own validation
// on rounding noise and train everyone to ignore the warning. Conversion
// happens only at the edges: toMinor/fromMinor.
//
// MULTI-CURRENCY
//
// Each leg carries `amount` in its own account's currency and `base` in the
// reporting currency (INR). Legs balance in BASE, not in amount — a $100
// withdrawal landing as ₹8,340 is a real transaction whose two sides differ
// in face value, and forcing those to match would make it unrecordable. The
// difference between them is FX cost, which gets its own leg.

// ---- money ---------------------------------------------------------------

/** Rupees/dollars → paise/cents. Rounds once, at the boundary. */
export const toMinor = (v) => Math.round((Number(v) || 0) * 100);
/** Back to a display number. */
export const fromMinor = (v) => (Number(v) || 0) / 100;

// ---- the chart of accounts ----------------------------------------------
//
// Five kinds, and which direction is "positive" for each. This is the whole
// of accounting's sign convention, and putting it in one table is what stops
// it being re-derived (differently) at each call site.
//
//   asset      what you have        debit-positive
//   liability  what you owe         credit-positive
//   income     money earned         credit-positive
//   expense    money spent          debit-positive
//   equity     the residual         credit-positive
//
// Legs are stored signed, always from the DEBIT-POSITIVE point of view, so
// summing a transaction's legs to zero is the only check needed. `normal`
// exists so a balance can be reported the way a human expects to read it:
// a liability of ₹25,000 should print as 25,000, not −25,000.
export const ACCOUNT_KINDS = {
  asset:     { normal: 1,  label: "Assets" },
  liability: { normal: -1, label: "Liabilities" },
  income:    { normal: -1, label: "Income" },
  expense:   { normal: 1,  label: "Expenses" },
  equity:    { normal: -1, label: "Equity" },
};

/** An account id is "kind:path" — "asset:bank:kotak", "expense:food". */
export const kindOf = (accountId) => String(accountId || "").split(":")[0];
export const isKind = (accountId, kind) => kindOf(accountId) === kind;

/**
 * A balance in the direction a human reads it.
 *
 * Raw leg sums are debit-positive, so a liability comes out negative and a
 * ₹25,000 card debt reads as −25,000. Multiplying by the account's normal
 * side prints what someone actually expects to see.
 */
export const asNormal = (accountId, signedMinor) =>
  signedMinor * (ACCOUNT_KINDS[kindOf(accountId)]?.normal ?? 1);

// ---- entries -------------------------------------------------------------

let seq = 0;
const nextId = () => `tx_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/**
 * Builds a validated transaction.
 *
 * Throws rather than returning a broken entry: an unbalanced transaction is
 * a programming error, and the entire point of this module is that such a
 * thing never reaches storage. Callers that might legitimately fail should
 * validate first with `checkBalanced`.
 */
export function entry({ date, memo, kind = "other", legs, conduit = false, ref = null, id }) {
  const clean = (legs || []).map((l) => ({
    account: l.account,
    amount: Math.round(Number(l.amount) || 0),
    currency: l.currency || "INR",
    // Single-currency legs need no separate base; defaulting keeps the
    // common case free of ceremony.
    base: Math.round(Number(l.base ?? l.amount) || 0),
    ...(l.note ? { note: l.note } : {}),
  }));
  const problem = checkBalanced(clean);
  if (problem) throw new Error(`Unbalanced transaction (${memo || "no memo"}): ${problem}`);
  return {
    id: id || nextId(),
    date: String(date).slice(0, 10),
    memo: memo || "",
    kind,
    // Money that passed THROUGH but was never yours — family cash you
    // withdrew for them, a bill you paid on someone else's behalf with
    // their money. It still moves real balances, so it belongs in the
    // ledger; it just must never reach an income statement. A flag rather
    // than a separate account tree, because the movement is genuinely a
    // normal transaction — only its ownership differs.
    conduit: !!conduit,
    ...(ref ? { ref } : {}),
    legs: clean,
  };
}

/** Returns a reason string if the legs don't balance, else null. */
export function checkBalanced(legs) {
  if (!legs || legs.length < 2) return "needs at least two legs";
  for (const l of legs) {
    if (!l.account) return "a leg has no account";
    if (!ACCOUNT_KINDS[kindOf(l.account)]) return `unknown account kind in "${l.account}"`;
  }
  const sum = legs.reduce((s, l) => s + l.base, 0);
  // Exact. Integer minor units mean there is no rounding slack to allow for,
  // and permitting "close enough" is how a ledger starts quietly drifting.
  if (sum !== 0) return `legs sum to ${sum} minor units, not 0`;
  return null;
}

// ---- derived balances ----------------------------------------------------

/**
 * Balance of one account, debit-positive, in minor units.
 *
 * `asOf` makes every historical balance answerable from the same data —
 * "what was in the bank on 31 March" needs no snapshot table, just a filter.
 */
export function balanceOf(ledger, accountId, { asOf, includeConduit = true } = {}) {
  let total = 0;
  for (const tx of ledger || []) {
    if (asOf && tx.date > asOf) continue;
    if (!includeConduit && tx.conduit) continue;
    for (const l of tx.legs) if (l.account === accountId) total += l.base;
  }
  return total;
}

/** Every account that appears in the ledger, with its balance. */
export function balances(ledger, { asOf, includeConduit = true } = {}) {
  const out = new Map();
  for (const tx of ledger || []) {
    if (asOf && tx.date > asOf) continue;
    if (!includeConduit && tx.conduit) continue;
    for (const l of tx.legs) out.set(l.account, (out.get(l.account) || 0) + l.base);
  }
  return out;
}

/**
 * The check that makes the whole thing trustworthy: every leg of every
 * transaction, summed, must be zero. If it isn't, something wrote a bad
 * entry and every number downstream is suspect.
 *
 * Cheap enough to run on load, which is the point — this is the self-check
 * that replaces noticing a wrong number on screen days later.
 */
export function trialBalance(ledger) {
  const bad = [];
  let sum = 0;
  for (const tx of ledger || []) {
    const s = tx.legs.reduce((a, l) => a + l.base, 0);
    sum += s;
    if (s !== 0) bad.push({ id: tx.id, date: tx.date, memo: tx.memo, off: s });
  }
  return { ok: sum === 0 && bad.length === 0, total: sum, unbalanced: bad };
}

// ---- reporting helpers ---------------------------------------------------

/**
 * Totals per account kind over a window, EXCLUDING conduit money.
 *
 * Conduit is excluded by default here and included by default in
 * `balanceOf`, and that asymmetry is deliberate: pass-through money really
 * did move the bank balance (so a balance must count it) but was never
 * income or expense (so a P&L must not). Getting this backwards is exactly
 * the ₹11.7L error this codebase exists to avoid.
 */
export function totalsByKind(ledger, { from, to, includeConduit = false } = {}) {
  const out = { asset: 0, liability: 0, income: 0, expense: 0, equity: 0 };
  for (const tx of ledger || []) {
    if (!includeConduit && tx.conduit) continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      const k = kindOf(l.account);
      if (k in out) out[k] += l.base;
    }
  }
  return out;
}

/** Spend or income per leaf account over a window, biggest first. */
export function byAccount(ledger, kind, { from, to, includeConduit = false } = {}) {
  const acc = new Map();
  for (const tx of ledger || []) {
    if (!includeConduit && tx.conduit) continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      if (kindOf(l.account) !== kind) continue;
      acc.set(l.account, (acc.get(l.account) || 0) + l.base);
    }
  }
  return [...acc.entries()]
    .map(([account, signed]) => ({ account, minor: asNormal(account, signed) }))
    .filter((r) => r.minor !== 0)
    .sort((a, b) => b.minor - a.minor);
}

// ---- common transaction shapes ------------------------------------------
//
// Thin constructors, so the twenty places that record a spend can't each
// invent their own leg arrangement. Every one returns a validated entry.

/** Money spent: an expense account rises, an asset falls (or a card's debt rises). */
export function spend({ date, memo, amount, from, category, currency = "INR", conduit = false, ref }) {
  const m = toMinor(amount);
  return entry({
    date, memo, kind: "expense", conduit, ref,
    legs: [
      { account: category, amount: m, currency, base: m },
      { account: from, amount: -m, currency, base: -m },
    ],
  });
}

/** Money earned: an asset rises, an income account rises. */
export function earn({ date, memo, amount, into, source, currency = "INR", ref }) {
  const m = toMinor(amount);
  return entry({
    date, memo, kind: "income", ref,
    legs: [
      { account: into, amount: m, currency, base: m },
      { account: source, amount: -m, currency, base: -m },
    ],
  });
}

/**
 * Money moved between your own accounts — never income, never expense.
 *
 * `fee` covers the FX spread on a cross-currency move: withdraw $100 and
 * receive ₹8,340 when the mid rate says ₹8,500, and the ₹160 gap is a real
 * cost that has to land somewhere or the two sides won't balance.
 */
export function transfer({ date, memo, out, into, amountOut, amountIn, currencyOut = "INR", currencyIn = "INR", fee = 0, feeAccount = "expense:bank-charges", ref, conduit = false }) {
  const mOut = toMinor(amountOut);
  const mIn = toMinor(amountIn ?? amountOut);
  const mFee = toMinor(fee);
  const legs = [
    { account: out, amount: -mOut, currency: currencyOut, base: -(mIn + mFee) },
    { account: into, amount: mIn, currency: currencyIn, base: mIn },
  ];
  if (mFee) legs.push({ account: feeAccount, amount: mFee, currency: "INR", base: mFee, note: "FX spread / fees" });
  return entry({ date, memo, kind: "transfer", conduit, ref, legs });
}

/**
 * A balance that must have existed before the records begin.
 *
 * Card payments span 17 months but the card statements only cover 5, so the
 * payments exceed the purchases on file — the difference is debt that
 * existed before the first statement. The same applies to family money and
 * to transfers whose other half sits in an account not yet imported.
 *
 * These are recorded as PROVISIONAL openings, not squeezed into an expense
 * bucket. Filing them as spending would inflate outgoings by money that was
 * never spent; recording them as an opening position says the true thing —
 * "this existed before the data starts" — keeps the ledger balanced, and
 * leaves one obvious row to delete when the missing statements arrive.
 */
export function provisionalOpening({ date, account, amount, currency = "INR", note }) {
  const m = toMinor(amount);
  return entry({
    date, kind: "opening", memo: note || "Opening balance — awaiting statements",
    legs: [
      { account, amount: m, currency, base: m },
      { account: "equity:opening", amount: -m, currency, base: -m },
    ],
    ref: { provisional: true },
  });
}

/** Opening position, so balances are absolute rather than relative. */
export function opening({ date, account, amount, currency = "INR", memo = "Opening balance" }) {
  const m = toMinor(amount);
  return entry({
    date, memo, kind: "opening",
    legs: [
      { account, amount: m, currency, base: m },
      { account: "equity:opening", amount: -m, currency, base: -m },
    ],
  });
}
