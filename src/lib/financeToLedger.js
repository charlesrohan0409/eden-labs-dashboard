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
  // Charles's own category list. Without these, a "Date" or "Church Food"
  // expense synced to the ledger as expense:uncategorised and lost the very
  // label its budget is keyed on — the budget would then read zero against
  // spending that had definitely happened.
  "marketing": "expense:business:ads",
  "rent": "expense:rent",
  "contractor": "expense:business:contractor",
  "date": "expense:personal:date",
  "cafe subscription": "expense:food:cafe",
  "birthday": "expense:gifts", "mom birthday": "expense:gifts",
  "church food": "expense:giving",
  "diet expense": "expense:health:diet",
  "other": "expense:uncategorised",
};

// The way back, for reading ledger spending as budget categories.
//
// Deliberately incomplete: only accounts that correspond to a category
// Charles actually keeps. An account with no entry here (shopping, education,
// cash) simply isn't budgeted, and inventing a category for it would put
// spending under a heading he never chose.
//
// Several forward keys share a target — Birthday and Mom Birthday both write
// to expense:gifts — so this can't be a mechanical inverse. It's the coarse
// fallback; ref.category on the entry is the precise answer when present.
const ACCOUNT_CATEGORY = {
  "expense:food:eating-out": "Food",
  "expense:food:local": "Food",
  "expense:food:cafe": "Cafe Subscription",
  "expense:food:groceries": "Groceries",
  "expense:travel": "Travel",
  "expense:utilities": "Utilities",
  "expense:business:software": "Software",
  "expense:subscriptions": "Software",
  "expense:business:ads": "Marketing",
  "expense:business:contractor": "Contractor",
  "expense:rent": "Rent",
  "expense:personal:date": "Date",
  "expense:gifts": "Birthday",
  "expense:health:diet": "Diet Expense",
};

/**
 * Which of Charles's categories a ledger expense leg belongs to.
 *
 * `ref.category` first — an entry that came FROM the Finance tab carries the
 * exact category it was filed under, and no mapping can beat that. The
 * account table is the fallback for the 2,900 statement rows, which never had
 * one. Returns null rather than guessing: an unmapped account is spending
 * that simply isn't budgeted.
 */
export function categoryOfLeg(entry, account, categories = []) {
  const known = (name) => (categories || []).find((c) => c.toLowerCase() === String(name || "").toLowerCase());
  return known(entry?.ref?.category) || known(ACCOUNT_CATEGORY[account]) || null;
}
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
    memo: `Lent to ${loan.person || loan.to || loan.name || "someone"}`,
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
    memo: `Repaid by ${loan.person || loan.to || loan.name || "someone"}`,
    kind: "transfer",
    ref: { source: "finance", origin: `loan-settled:${loan.id}` },
    legs: [
      { account: into, amount: m, currency: "INR", base: m },
      { account: "asset:receivable", amount: -m, currency: "INR", base: -m },
    ],
  });
}

/**
 * A credit-card bill payment.
 *
 * The only Finance action that books no expense at all — the purchases that
 * built the balance were expensed when they happened, so the payment is a
 * transfer: bank down, card debt down. Which is exactly why it needs its own
 * conversion. Every other Finance write leaves an `expenses` row behind for
 * expenseEntry to find; this one leaves nothing, so without this the ledger's
 * bank balance drifts by the whole bill every month while the card debt never
 * falls.
 *
 * Built from the finance-log entry rather than the outgoing, because an
 * outgoing only remembers its LAST payment — the log keeps every one.
 */
export function cardPaymentEntry(logEntry, accounts) {
  const from = accountFor((accounts || []).find((a) => a.id === logEntry?.meta?.accountId));
  const card = accountFor((accounts || []).find((a) => a.id === logEntry?.meta?.paysDownAccountId));
  const amount = Math.abs(Number(logEntry?.amount) || 0);
  if (!from || !card || !amount) return null;
  const m = toMinor(amount);
  return entry({
    date: String(logEntry.at || "").slice(0, 10),
    memo: `${logEntry.title || "Card bill"} — paid off`,
    kind: "transfer",
    ref: { source: "finance", origin: `card-payment:${logEntry.id}` },
    legs: [
      // Debit-positive: paying a card REDUCES the liability, and a liability
      // is carried negative, so discharging it is a positive leg.
      { account: card, amount: m, currency: "INR", base: m },
      { account: from, amount: -m, currency: "INR", base: -m },
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
