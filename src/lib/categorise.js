// Putting names to the spending nothing could explain.
//
// 53 transactions worth ₹22,736 sit against expense:uncategorised. They are
// real money and they count in every total, but they belong to no category,
// so no budget can see them and no breakdown can say what they were. Left
// alone they stay that way forever — the effort of opening the ledger, finding
// one row and rewriting it by hand is never worth it for a ₹620 payment.
//
// This makes it a few minutes of clicking instead. The rule that matters:
// it only ever RE-FILES an existing transaction. Amounts, dates and the
// account the money left are untouched, so nothing here can change a balance.

import { categoryAccount } from "./financeToLedger.js";
import { payeeOf } from "./ledgerInsights.js";

const isUncat = (account) => /^expense:uncategor/i.test(String(account || ""));

/** Every transaction still waiting to be told what it was. */
export function uncategorised(entries = []) {
  return (entries || [])
    .filter((t) => (t.legs || []).some((l) => isUncat(l.account)))
    .map((t) => {
      const leg = t.legs.find((l) => isUncat(l.account));
      return {
        id: t.id || t.ref?.origin || `${t.date}:${t.memo}`,
        entry: t,
        date: t.date,
        memo: t.memo || "",
        payee: payeeOf(t.memo || "") || "Unknown",
        amount: Math.abs(Number(leg?.base) || 0) / 100,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Others that look like the same thing.
 *
 * Matched on payee, because that is the fact that decides the category —
 * fourteen payments to the same shop are fourteen instances of one decision,
 * and making it once is the difference between this being worth doing and not.
 */
export function similar(row, rows) {
  const p = String(row.payee || "").toLowerCase();
  if (!p || p === "unknown") return [];
  return rows.filter((r) => r.id !== row.id && String(r.payee || "").toLowerCase() === p);
}

/**
 * Re-file transactions under a category, returning a NEW ledger array.
 *
 * Pure — the caller decides whether to save. Only the uncategorised leg's
 * account changes, plus ref.category so the reverse mapping can read the
 * exact category back rather than inferring one from the account.
 */
export function applyCategory(entries, ids, category) {
  const want = new Set(ids);
  const account = categoryAccount(category);
  return (entries || []).map((t) => {
    const key = t.id || t.ref?.origin || `${t.date}:${t.memo}`;
    if (!want.has(key)) return t;
    if (!(t.legs || []).some((l) => isUncat(l.account))) return t;
    return {
      ...t,
      ref: { ...(t.ref || {}), category, categorisedBy: "charles" },
      legs: t.legs.map((l) => (isUncat(l.account) ? { ...l, account } : l)),
    };
  });
}

// Payee fragments that reliably mean one thing, used only to PRE-SELECT a
// category — never to apply one. A guess presented as an answer gets accepted
// without being read, which is how a wrong category becomes permanent.
const HINTS = [
  [/swiggy|zomato|dominos|mcdonald|kfc|pizza|restaurant|idli|biryani|cafe|bakery|hotel|foods?\b|mess\b/i, "Food"],
  [/blinkit|zepto|instamart|dmart|bigbasket|supermarket|kirana|grocer|stores?\b|mart\b|provision/i, "Groceries"],
  [/rapido|uber|ola\b|irctc|indigo|petrol|fuel|metro|toll/i, "Travel"],
  [/airtel|jio|vodafone|electric|broadband|recharge|gas\b|water\b/i, "Utilities"],
  [/adobe|google|openai|anthropic|notion|canva|github|figma|linkedin|hostinger|godaddy/i, "Software"],
  [/meta ads|facebook|google ads/i, "Marketing"],
  [/pharma|chemist|medical|hospital|clinic|apollo|medplus/i, "Other"],
];

/** A starting point for the dropdown, or null when nothing is obvious. */
export function suggestFor(row, categories = []) {
  const hay = `${row.payee} ${row.memo}`;
  for (const [re, name] of HINTS) {
    if (!re.test(hay)) continue;
    const match = categories.find((c) => c.toLowerCase() === name.toLowerCase());
    if (match) return match;
  }
  return null;
}
