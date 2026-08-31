// Analysis over the ledger.
//
// Everything here is derived from legs. Nothing recomputes a total from the
// expenses array or the invoices array — that is precisely how a report ends
// up disagreeing with the app it came from, which this codebase has been
// bitten by more than once.
//
// The one rule that governs every function below: CONDUIT MONEY IS EXCLUDED
// from income, expenses and every ratio built on them, but INCLUDED in cash
// movement and balances. Money you moved on your family's behalf really did
// leave the bank, so a cash-flow view must show it; it was never yours, so a
// P&L must not. For this data that distinction is worth ₹11.7 lakh.

import { balances, asNormal, kindOf, fromMinor, totalsByKind, byAccount } from "./ledger.js";

/** "YYYY-MM" for a date key. */
const monthOf = (d) => String(d).slice(0, 7);

export const monthName = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

/**
 * Income, expenses and the resulting net, month by month.
 *
 * `conduit` is reported alongside rather than folded in, so the months where
 * large family sums passed through don't look like months of huge earnings
 * and huge spending.
 */
export function monthlySeries(ledger, { months = 36, from, to } = {}) {
  const acc = new Map();
  for (const tx of ledger || []) {
    if (tx.kind === "opening") continue;      // not activity, just a starting position
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    const k = monthOf(tx.date);
    if (!acc.has(k)) acc.set(k, { key: k, income: 0, expense: 0, conduit: 0 });
    const row = acc.get(k);
    for (const l of tx.legs) {
      const kind = kindOf(l.account);
      if (tx.conduit) {
        // Count the movement once, from the bank side, so a two-leg
        // pass-through doesn't register as double its real size.
        if (kind === "asset" && l.base < 0) row.conduit += -l.base;
        continue;
      }
      if (kind === "income") row.income += -l.base;
      if (kind === "expense") row.expense += l.base;
    }
  }
  return [...acc.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-months)
    .map((r) => ({
      ...r,
      label: monthName(r.key),
      income: fromMinor(r.income),
      expense: fromMinor(r.expense),
      conduit: fromMinor(r.conduit),
      net: fromMinor(r.income - r.expense),
    }));
}

/**
 * Accounts whose auto-derived name would be wrong or ambiguous.
 *
 * The last path segment is usually the readable name, but not always: both
 * `asset:bank:hdfc` and `liability:card:hdfc` end in "hdfc", so a balance
 * sheet built from the generic rule prints "Hdfc" under assets AND under
 * liabilities — two different accounts, one name. The rest are acronyms and
 * bare words that title-casing mangles ("Bnpl") or that need the context the
 * segment alone drops ("Family" → whose, and held how?).
 */
const LABEL_OVERRIDES = {
  "asset:bank:hdfc": "HDFC bank",
  "asset:bank:kotak": "Kotak bank",
  "asset:overseas": "Overseas account",
  "asset:transfers-in-transit": "Transfers in transit",
  "asset:investments": "Investments",
  "liability:card:hdfc": "HDFC credit card",
  "liability:family": "Family money held",
  "liability:partner": "Partner running account",
  "expense:bnpl": "BNPL repayments",
  "asset:other-accounts": "Other bank accounts",
  "liability:card:yesbank": "Yes Bank Pop Card",
  "liability:card:amazonpay": "Amazon Pay Later",
  "liability:card:emi": "Card EMI outstanding",
  "income:investment-gain": "Investment gain (unrealised)",
  "income:fx-gain": "Currency gain",
  "income:cashback": "Cashback and rewards",
};

/** A readable name for an account id — "expense:food:eating-out" → "Eating out". */
export function accountLabel(id) {
  if (LABEL_OVERRIDES[id]) return LABEL_OVERRIDES[id];
  const parts = String(id).split(":").slice(1);
  if (!parts.length) return id;
  const last = parts[parts.length - 1];
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Top-level group for an expense account — "expense:food:local" → "food". */
export const groupOf = (id) => String(id).split(":")[1] || "other";

/** Group names that title-casing gets wrong. */
const GROUP_LABELS = { bnpl: "BNPL", "personal-care": "Personal care", "bank-charges": "Bank charges" };

/** A readable name for a spending group — "bank-charges" → "Bank charges". */
export const groupLabel = (group) =>
  GROUP_LABELS[group] || String(group).replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Spending by category over a window, with each row's share of the total.
 *
 * Share is computed here rather than in the component so every view that
 * shows a percentage is showing the same percentage.
 */
export function spendingBreakdown(ledger, opts = {}) {
  const rows = byAccount(ledger, "expense", opts);
  const total = rows.reduce((s, r) => s + r.minor, 0);
  return {
    total: fromMinor(total),
    rows: rows.map((r) => ({
      account: r.account,
      label: accountLabel(r.account),
      group: groupOf(r.account),
      amount: fromMinor(r.minor),
      share: total > 0 ? r.minor / total : 0,
    })),
  };
}

/** Income by source, same shape. */
export function incomeBreakdown(ledger, opts = {}) {
  const rows = byAccount(ledger, "income", opts);
  const total = rows.reduce((s, r) => s + r.minor, 0);
  return {
    total: fromMinor(total),
    rows: rows.map((r) => ({
      account: r.account,
      label: accountLabel(r.account),
      amount: fromMinor(r.minor),
      share: total > 0 ? r.minor / total : 0,
    })),
  };
}

/**
 * Spending rolled up to its top group, for the "where does it actually go"
 * view. A dozen leaf accounts is a table; five groups is an answer.
 */
export function spendingByGroup(ledger, opts = {}) {
  const { rows, total } = spendingBreakdown(ledger, opts);
  const g = new Map();
  for (const r of rows) g.set(r.group, (g.get(r.group) || 0) + r.amount);
  return [...g.entries()]
    .map(([group, amount]) => ({
      group,
      label: groupLabel(group),
      amount,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * The headline ratios.
 *
 * `savingsRate` is deliberately net/income rather than (income−expense)/
 * income computed separately — same number, one source. A negative rate is
 * reported as-is rather than floored at zero: spending more than you earn is
 * the fact worth surfacing, not one worth hiding behind a 0%.
 */
export function ratios(ledger, opts = {}) {
  const k = totalsByKind(ledger, opts);
  const income = fromMinor(-k.income);
  const expense = fromMinor(k.expense);
  const business = fromMinor(
    byAccount(ledger, "expense", opts)
      .filter((r) => groupOf(r.account) === "business")
      .reduce((s, r) => s + r.minor, 0)
  );
  return {
    income,
    expense,
    net: income - expense,
    business,
    personal: expense - business,
    // Null rather than 0 when there is no income: "no data" and "spent
    // everything" are different facts and must not render the same.
    savingsRate: income > 0 ? (income - expense) / income : null,
    expenseRatio: income > 0 ? expense / income : null,
    businessMargin: income > 0 ? (income - business) / income : null,
    burn: expense,
  };
}

/** Net worth over time, one point per month end. */
export function netWorthSeries(ledger, { months = 18 } = {}) {
  const keys = [...new Set((ledger || []).map((t) => monthOf(t.date)))].sort().slice(-months);
  return keys.map((k) => {
    const [y, m] = k.split("-").map(Number);
    const asOf = `${k}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const b = balances(ledger, { asOf });
    let assets = 0, liabilities = 0;
    for (const [account, v] of b.entries()) {
      const n = asNormal(account, v);
      if (kindOf(account) === "asset") assets += n;
      if (kindOf(account) === "liability") liabilities += n;
    }
    return {
      key: k, label: monthName(k),
      assets: fromMinor(assets),
      liabilities: fromMinor(liabilities),
      netWorth: fromMinor(assets - liabilities),
    };
  });
}

/**
 * The balance sheet, grouped and totalled.
 *
 * Equity is presented as the DERIVED residual (assets − liabilities) rather
 * than as whatever happens to be sitting in the equity accounts. For a solo
 * operator the equity accounts are only ever opening balances and the
 * accumulated result, so reporting them directly would show bookkeeping
 * artefacts where a reader expects "what's actually left".
 */
export function balanceSheet(ledger, { asOf } = {}) {
  const b = balances(ledger, { asOf });
  const assets = [], liabilities = [];
  let ta = 0, tl = 0;
  for (const [account, v] of [...b.entries()].sort()) {
    const amount = fromMinor(asNormal(account, v));
    if (!amount) continue;
    if (kindOf(account) === "asset") { assets.push({ account, label: accountLabel(account), amount }); ta += amount; }
    if (kindOf(account) === "liability") {
      // A running account can swing either way. When it does, it stops being
      // a liability in any sense a reader would recognise: "Family money
      // held −₹72,046" listed under what you OWE is the opposite of the
      // truth. A liability with a debit balance is a receivable, so it is
      // presented as one.
      if (amount < 0) { assets.push({ account, label: `${accountLabel(account)} — owed to you`, amount: -amount, receivable: true }); ta += -amount; }
      else { liabilities.push({ account, label: accountLabel(account), amount }); tl += amount; }
    }
  }
  return {
    assets, liabilities,
    totalAssets: ta, totalLiabilities: tl,
    netWorth: ta - tl,
    asOf: asOf || null,
  };
}

/**
 * Cash flow, split the way a cash-flow statement splits it.
 *
 * Operating is income and expenses. Investing is money into or out of
 * investments. Financing is borrowing and repaying. Conduit money gets its
 * own line because it genuinely moved cash but belongs to none of the three.
 */
export function cashFlow(ledger, opts = {}) {
  const { from, to } = opts;
  let operating = 0, investing = 0, financing = 0, conduit = 0;
  for (const tx of ledger || []) {
    if (tx.kind === "opening") continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      const kind = kindOf(l.account);
      if (tx.conduit) {
        if (kind === "asset" && l.account.startsWith("asset:bank")) conduit += l.base;
        continue;
      }
      if (kind === "income") operating += -l.base;
      else if (kind === "expense") operating -= l.base;
      else if (l.account.startsWith("asset:investments")) investing -= l.base;
      else if (kind === "liability" && !l.account.startsWith("liability:card")) financing += -l.base;
    }
  }
  return {
    operating: fromMinor(operating),
    investing: fromMinor(investing),
    financing: fromMinor(financing),
    conduit: fromMinor(conduit),
    net: fromMinor(operating + investing + financing + conduit),
  };
}

/**
 * The income statement, as a finance person would expect to read it.
 *
 * Business and personal are separated rather than blended: an income
 * statement mixing client revenue with groceries answers no question anyone
 * has. The business section is the one that means anything to a reader.
 */
export function incomeStatement(ledger, opts = {}) {
  const inc = incomeBreakdown(ledger, opts);
  const spend = spendingBreakdown(ledger, opts);
  const business = spend.rows.filter((r) => r.group === "business");
  const personal = spend.rows.filter((r) => r.group !== "business");
  const bTotal = business.reduce((s, r) => s + r.amount, 0);
  const pTotal = personal.reduce((s, r) => s + r.amount, 0);
  return {
    income: inc.rows,
    totalIncome: inc.total,
    businessCosts: business,
    totalBusinessCosts: bTotal,
    businessProfit: inc.total - bTotal,
    personalCosts: personal.sort((a, b) => b.amount - a.amount),
    totalPersonalCosts: pTotal,
    net: inc.total - bTotal - pTotal,
  };
}
