// Keeping the Finance tab and the ledger as ONE book.
//
// They were two. The Analysis tab read a 2,978-entry ledger built from bank
// statements; the Finance tab read a separate 25-row list, and nothing
// written in one ever reached the other. The visible cost was that budgets
// measured 1.5% of actual spending — a ₹2,500 food budget counting ₹4,870
// while the ledger held ₹2,46,036 — so a breach could never fire.
//
// DERIVED, NOT PUSHED.
//
// The obvious fix is to append a ledger entry inside each mutation. It cannot
// work here: useAppData REPLAYS a mutator against fresh server data on a
// version conflict, so a mutator with a side effect fires it twice. Instead
// this reads the finished state and works out which records have no ledger
// entry yet. Replays are harmless, a failed sync self-heals on the next pass,
// and the same code backfills anything missed while offline.
//
// Idempotency is `ref.origin`, which handleLedgerAppend already enforces
// server-side — so even a double-fired sync cannot book anything twice.

import {
  expenseEntry, loanEntry, loanSettlementEntry, invoiceEntry, cardPaymentEntry, categoryOfLeg,
} from "./financeToLedger.js";

/**
 * Records that existed BEFORE the two books were joined.
 *
 * The 25 expenses already in the Finance tab describe spending the ledger
 * mostly already holds, from the bank statements those same purchases appear
 * on. Syncing them would book each one a second time. So unification captures
 * their ids once, and everything from that moment forward flows through.
 *
 * Stored on settings rather than inferred from a date: expense rows carry the
 * date of the PURCHASE, not of when they were typed in, so a cutoff date
 * would both miss backdated entries and re-import old ones.
 */
export const EXCLUDE_KEY = "financeSyncExclude";

const excluded = (data) => new Set(data?.settings?.[EXCLUDE_KEY] || []);

/**
 * The ledger entries the Finance tab is currently missing.
 *
 * Pure: takes state, returns entries. Nothing here writes.
 */
export function pendingLedgerEntries(data, ledgerEntries = []) {
  if (!data) return [];
  const accounts = data.accounts || [];
  const skip = excluded(data);
  const seen = new Set((ledgerEntries || []).map((t) => t?.ref?.origin).filter(Boolean));
  const out = [];
  const take = (e) => {
    if (!e?.ref?.origin) return;
    if (seen.has(e.ref.origin)) return;
    seen.add(e.ref.origin);       // guards duplicates inside one batch too
    out.push(e);
  };

  for (const e of data.expenses || []) {
    if (skip.has(e.id)) continue;
    take(expenseEntry(e, accounts));
  }

  for (const l of data.loans || []) {
    if (skip.has(l.id)) continue;
    // A receivable raised by a SHARED BILL has no accountId of its own — the
    // money left as part of the outgoing's full payment, and giving it one
    // would debit the account a second time. But the ledger still needs the
    // funding side, or a ₹6,100 electricity bill that books a ₹3,050 expense
    // leaves ₹3,050 of the bank movement unaccounted for. So it borrows the
    // outgoing's account: expense ₹3,050 + receivable ₹3,050 against ₹6,100
    // out, which is exactly what happened.
    const funded = l.accountId
      ? l
      : l.fromOutgoingId
        ? { ...l, accountId: (data.outgoings || []).find((o) => o.id === l.fromOutgoingId)?.accountId }
        : l;
    take(loanEntry(funded, accounts));
    if (l.status === "settled" || l.settledAmount) take(loanSettlementEntry(l, accounts));
  }

  for (const i of data.invoices || []) {
    if (skip.has(i.id)) continue;
    if (i.status !== "paid") continue;          // unpaid is not income yet
    take(invoiceEntry(i, accounts));
  }

  // Card bills leave no expense row behind, so they are read from the log.
  for (const l of data.financeLog || []) {
    if (l?.type !== "card_payment") continue;
    take(cardPaymentEntry(l, accounts));
  }

  return out;
}

/**
 * The exclusion list to store when the two books are first joined.
 *
 * Everything that exists right now, so only new activity syncs.
 */
export function initialExclusion(data) {
  return [
    ...(data?.expenses || []).map((e) => e.id),
    ...(data?.loans || []).map((l) => l.id),
    ...(data?.invoices || []).map((i) => i.id),
  ].filter(Boolean);
}

/** Has unification been set up yet? */
export const isUnified = (data) => Array.isArray(data?.settings?.[EXCLUDE_KEY]);

/**
 * Ledger spending, shaped like the expense rows budgets already understand.
 *
 * Budgets were reading `data.expenses` — 25 rows against a 2,978-entry
 * ledger, so a ₹2,500 food budget measured ₹4,870 while ₹2,46,036 of food
 * spending sat unseen and no breach could ever fire. This is the adapter that
 * points them at the real book without rewriting spentOn, budgetStatus or
 * anything else that consumes an expense row.
 *
 * Only legs that map to a category Charles actually keeps are returned;
 * unmapped spending (shopping, education, cash) is real but unbudgeted, and
 * filing it under an invented heading would be worse than leaving it out.
 */
export function ledgerAsExpenses(entries, categories = []) {
  const out = [];
  for (const t of entries || []) {
    // Conduit money was never his — it belongs in balances and cash flow, and
    // counting it against a spending limit would be a budget breach caused by
    // handling someone else's money.
    if (t?.conduit) continue;
    for (const l of t.legs || []) {
      if (!String(l.account || "").startsWith("expense:")) continue;
      const amount = (Number(l.base) || 0) / 100;
      if (amount <= 0) continue;                 // refunds net out below zero
      const category = categoryOfLeg(t, l.account, categories);
      if (!category) continue;
      out.push({
        id: `${t.id || t.ref?.origin || t.date}:${l.account}`,
        date: t.date,
        category,
        currency: "INR",
        nativeAmount: amount,
        amount,
        vendor: t.memo || category,
        fromLedger: true,
      });
    }
  }
  return out;
}

/**
 * The expense rows a budget should actually measure against.
 *
 * The ledger, plus any Finance-tab rows that predate unification and so were
 * never synced into it. Rows created AFTER unification are already in the
 * ledger — adding them again here is precisely the double-count the exclusion
 * list exists to prevent.
 */
export function budgetExpenses(data, ledgerEntries, categories = []) {
  const fromLedger = ledgerAsExpenses(ledgerEntries, categories);
  if (!Array.isArray(ledgerEntries) || !ledgerEntries.length) return data?.expenses || [];
  const skip = excluded(data);
  const unsynced = (data?.expenses || []).filter((e) => skip.has(e.id));
  return [...fromLedger, ...unsynced];
}
