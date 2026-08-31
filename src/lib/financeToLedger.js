// Turning a Finance action into a ledger entry.
//
// WHY THIS EXISTS
//
// The dashboard has kept two sets of books. Finance stored a balance per
// account and adjusted it on every action; the ledger derived balances from
// legs. Two sources of one truth drift by construction, and they did:
// Investments read ₹19,500 against ₹3,201 of actual purchases, and a ₹50,000
// loan was counted twice — recorded as money lent while the cash that would
// fund it still sat in the overseas balance.
//
// The fix is not to reconcile them periodically. It is to stop having two.
// Balances come from the ledger; Finance actions WRITE to the ledger. This
// module is the translation layer, and it is the only place that knows how a
// dashboard concept maps onto double entry.
//
// EVERY ENTRY CARRIES ITS ORIGIN
//
// `ref.origin` is the Finance record's id. The append endpoint refuses a
// second entry with an origin it already has, so a double-clicked save or a
// retried request can't book the same expense twice — which matters more
// here than anywhere else in the app.

import { entry, toMinor } from "./ledger.js";

/** Ledger account for a Finance account row. */
export function accountFor(acct) {
  if (!acct) return null;
  if (acct.ledgerAccount) return acct.ledgerAccount;      // explicit wins
  const n = String(acct.name || "").toLowerCase();
  const isCard = acct.type === "credit";
  if (isCard) {
    if (n.includes("hdfc")) return "liability:card:hdfc";
    if (n.includes("yes")) return "liability:card:yesbank";
    if (n.includes("amazon")) return "liability:card:amazonpay";
    return `liability:card:${slug(acct.name)}`;
  }
  if (n.includes("kotak")) return "asset:bank:kotak";
  if (n.includes("hdfc")) return "asset:bank:hdfc";
  if (n.includes("overseas") || acct.currency === "USD") return "asset:overseas";
  if (n.includes("investment") || acct.type === "investment") return "asset:investments";
  return `asset:bank:${slug(acct.name)}`;
}

const slug = (s) => String(s || "account").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Finance's category names are free text; the ledger's are a fixed tree.
// Anything unmatched lands in uncategorised rather than inventing an account
// per typo — a chart of accounts that grows from user input stops being one.
const CATEGORY_MAP = {
  "food": "expense:food:eating-out", "food & dining": "expense:food:eating-out",
  "eating out": "expense:food:eating-out", "groceries": "expense:food:groceries",
  "shopping": "expense:shopping", "travel": "expense:travel", "transport": "expense:travel",
  "health": "expense:health", "medical": "expense:health",
  "utilities": "expense:utilities", "bills": "expense:utilities",
  "personal care": "expense:personal-care", "subscriptions": "expense:subscriptions",
  "software": "expense:business:software", "tools": "expense:business:software",
  "ads": "expense:business:ads", "advertising": "expense:business:ads",
  "business": "expense:business:other", "giving": "expense:giving", "donation": "expense:giving",
  "education": "expense:education", "taxes": "expense:taxes", "tax": "expense:taxes",
  "bank charges": "expense:bank-charges", "fees": "expense:bank-charges",
  "cash": "expense:cash", "bnpl": "expense:bnpl",
};
export const categoryAccount = (name) =>
  CATEGORY_MAP[String(name || "").trim().toLowerCase()] || "expense:uncategorised";

/**
 * An expense logged in Finance.
 *
 * Returns null when no account was named: an expense that didn't come out of
 * anything cannot be double-entered, and guessing which account it left would
 * be worse than leaving it out of the ledger and saying so.
 */
export function expenseEntry(expense, accounts) {
  const acct = (accounts || []).find((a) => a.id === expense.accountId);
  const from = accountFor(acct);
  if (!from) return null;

  // `settledAmount` is what the mutation already converted into the account's
  // own currency. Recomputing it here is how the two halves end up disagreeing
  // by an exchange rate.
  const amount = Number(expense.settledAmount ?? expense.nativeAmount ?? expense.amount) || 0;
  if (!amount) return null;
  const m = toMinor(amount);
  // Debit-positive: spending RAISES an expense and LOWERS an asset — but on a
  // card it raises a liability, which is the same negative leg either way.
  return entry({
    date: expense.date || new Date().toISOString().slice(0, 10),
    memo: expense.vendor || expense.category || "Expense",
    kind: "expense",
    ref: { source: "finance", origin: `expense:${expense.id}`, category: expense.category || null },
    legs: [
      { account: categoryAccount(expense.category), amount: m, currency: "INR", base: m },
      { account: from, amount: -m, currency: "INR", base: -m },
    ],
  });
}

/**
 * Money lent to someone.
 *
 * THIS IS THE ₹50,000 BUG. Lending was recorded as a loan record and nothing
 * else, so the money appeared as a receivable while the cash that would fund
 * it still sat in the account — counted once as an asset you hold and again
 * as an asset you're owed. Lending moves money: the bank goes down, a
 * receivable comes up. It changes what you have, never what you're worth.
 */
export function loanEntry(loan, accounts) {
  const acct = (accounts || []).find((a) => a.id === loan.accountId);
  const from = accountFor(acct);
  const amount = Number(loan.amount) || 0;
  if (!from || !amount) return null;
  const m = toMinor(amount);
  return entry({
    date: loan.date || new Date().toISOString().slice(0, 10),
    memo: `Lent to ${loan.to || loan.name || "someone"}`,
    kind: "transfer",
    ref: { source: "finance", origin: `loan:${loan.id}` },
    legs: [
      { account: "asset:receivable", amount: m, currency: "INR", base: m },
      { account: from, amount: -m, currency: "INR", base: -m },
    ],
  });
}

/** Repayment — the mirror image, and it must not read as income. */
export function loanSettlementEntry(loan, accounts) {
  const acct = (accounts || []).find((a) => a.id === loan.accountId);
  const into = accountFor(acct);
  const amount = Number(loan.settledAmount ?? loan.amount) || 0;
  if (!into || !amount) return null;
  const m = toMinor(amount);
  return entry({
    date: loan.settledDate || new Date().toISOString().slice(0, 10),
    memo: `Repaid by ${loan.to || loan.name || "someone"}`,
    kind: "transfer",
    ref: { source: "finance", origin: `loan-settled:${loan.id}` },
    legs: [
      { account: into, amount: m, currency: "INR", base: m },
      { account: "asset:receivable", amount: -m, currency: "INR", base: -m },
    ],
  });
}

/** An invoice paid — this one IS income. */
export function invoiceEntry(invoice, accounts) {
  const acct = (accounts || []).find((a) => a.id === invoice.accountId) || (accounts || [])[0];
  const into = accountFor(acct);
  const amount = Number(invoice.amount) || 0;
  if (!into || !amount) return null;
  const m = toMinor(amount);
  return entry({
    date: invoice.paidDate || invoice.date || new Date().toISOString().slice(0, 10),
    memo: `Invoice — ${invoice.client || invoice.number || "client"}`,
    kind: "income",
    ref: { source: "finance", origin: `invoice:${invoice.id}` },
    legs: [
      { account: into, amount: m, currency: "INR", base: m },
      { account: "income:client", amount: -m, currency: "INR", base: -m },
    ],
  });
}

/**
 * Where Finance and the ledger disagree, per account.
 *
 * Deliberately reports rather than corrects. A silent reconciliation would
 * hide exactly the thing worth seeing — the ₹50,000 counted twice was only
 * findable because the two numbers were put side by side.
 */
export function reconcile(accounts, ledgerBalances, rate = 1) {
  const rows = [];
  for (const a of accounts || []) {
    const key = accountFor(a);
    const isCard = a.type === "credit";
    const stored = Number(a.balance) || 0;
    const inr = a.currency === "USD" ? stored * rate : stored;
    const led = ledgerBalances.get(key);
    rows.push({
      id: a.id, name: a.name, currency: a.currency || "INR", isCard, account: key,
      finance: inr,
      ledger: led === undefined ? null : led,
      // Null, not zero: "the ledger has never seen this account" and "the
      // ledger says zero" are different facts and must not render alike.
      diff: led === undefined ? null : inr - led,
    });
  }
  return rows;
}
