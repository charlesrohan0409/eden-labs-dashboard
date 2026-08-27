import { toDateKey } from "./utils.js";
// Personal finance vocabulary: the account types the balance bar shows, the
// two kinds of recurring money-out, and the budget periods.
//
// Deliberately NOT automated. An earlier design had subscriptions and fixed
// bills posting charges by themselves on their due date, the way
// recurrence.js resets tasks. That was dropped: this dashboard is a notebook,
// not a bank — it can't actually move money, so a charge it posts on its own
// is a guess about the real world that nobody verified. Instead every charge
// is confirmed by a human pressing "Mark paid", which is both honest and the
// same number of clicks as correcting a wrong guess would have been.

// ---- accounts ----
// Debit-style accounts hold a positive balance; a credit card holds debt, so
// it renders and sums with the opposite sign. Keeping them in ONE collection
// (rather than accounts + cards) means net worth is a single reduce, and the
// balance bar doesn't need two code paths.
export const ACCOUNT_TYPES = {
  main:       { label: "Main",        kind: "asset",  dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  savings:    { label: "Savings",     kind: "asset",  dot: "bg-sky-500",     chip: "bg-sky-50 text-sky-700" },
  us:         { label: "US Account",  kind: "asset",  dot: "bg-violet-500",  chip: "bg-violet-50 text-violet-700" },
  investment: { label: "Investments", kind: "asset",  dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700" },
  credit:     { label: "Credit Card", kind: "credit", dot: "bg-rose-500",    chip: "bg-rose-50 text-rose-700" },
};
export const ACCOUNT_TYPE_LIST = Object.entries(ACCOUNT_TYPES).map(([id, m]) => ({ id, ...m }));
export const accountMeta = (id) => ACCOUNT_TYPES[id] || ACCOUNT_TYPES.main;
export const isCredit = (account) => accountMeta(account?.type).kind === "credit";

// ---- recurring money-out ----
// Subscriptions and fixed bills are the same record with a different label.
// The distinction is real to a human (Netflix vs. the electricity bill) but
// meaningless to the code, so it's one collection with a `kind` rather than
// two collections that would each need identical CRUD, forms and totals.
export const OUTGOING_KINDS = {
  subscription: { label: "Subscription", plural: "Subscriptions", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  fixed:        { label: "Fixed bill",   plural: "Fixed bills",   chip: "bg-amber-50 text-amber-700",   dot: "bg-amber-500" },
};
export const OUTGOING_KIND_LIST = Object.entries(OUTGOING_KINDS).map(([id, m]) => ({ id, ...m }));
export const outgoingMeta = (id) => OUTGOING_KINDS[id] || OUTGOING_KINDS.subscription;

export const CADENCES = {
  monthly:   { label: "Monthly",   months: 1 },
  quarterly: { label: "Quarterly", months: 3 },
  yearly:    { label: "Yearly",    months: 12 },
};
export const CADENCE_LIST = Object.entries(CADENCES).map(([id, m]) => ({ id, ...m }));

// Advances a YYYY-MM-DD date by a cadence, clamping the day to the target
// month's length. Without the clamp, a subscription billed on the 31st would
// roll from Jan 31 into an invalid Feb 31 — which JS silently turns into
// Mar 3, quietly shifting every future renewal by two days.
export function advanceDate(dateStr, cadence) {
  const months = (CADENCES[cadence] || CADENCES.monthly).months;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, daysInTarget));
  return toDateKey(d);
}

// Days until the next renewal. Negative = overdue, which is a normal state
// here rather than an error: nothing charges itself, so an untouched
// subscription simply sits past due until it's confirmed paid.
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export function renewalLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return { text: "No date", tone: "stone", overdue: false };
  if (d < 0)  return { text: `${Math.abs(d)}d overdue`, tone: "rose", overdue: true };
  if (d === 0) return { text: "Due today", tone: "amber", overdue: false };
  if (d === 1) return { text: "Tomorrow", tone: "amber", overdue: false };
  if (d <= 7)  return { text: `In ${d}d`, tone: "amber", overdue: false };
  return { text: `In ${d}d`, tone: "stone", overdue: false };
}

// ---- budgets ----
export const BUDGET_PERIODS = {
  monthly: { label: "Monthly" },
  yearly:  { label: "Yearly" },
};
export const BUDGET_PERIOD_LIST = Object.entries(BUDGET_PERIODS).map(([id, m]) => ({ id, ...m }));

// The period a date falls in, as a comparable key.
export function periodKey(dateStr, period) {
  if (!dateStr) return "";
  return period === "yearly" ? dateStr.slice(0, 4) : dateStr.slice(0, 7);
}

// What's been spent against a budget in the CURRENT period, expressed in the
// BUDGET's own currency — comparing a ₹ limit against a $ total would read as
// wildly under budget rather than over.
//
// `convert(amount, from, to)` is injected rather than imported so this stays a
// pure function with no dependency on the live FX rate, which lives in React
// state. Callers pass the one from useCurrency.
export function spentOn(budget, expenses, convert, now = new Date()) {
  const key = budget.period === "yearly"
    ? String(now.getFullYear())
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return (expenses || [])
    .filter((e) => e.category === budget.category && periodKey(e.date, budget.period) === key)
    .reduce((sum, e) => {
      const amount = Number(e.nativeAmount ?? e.amount) || 0;
      const from = e.currency || "USD";
      return sum + (from === budget.currency ? amount : convert(amount, from, budget.currency));
    }, 0);
}

export function budgetStatus(spent, limit) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  if (pct >= 100) return { pct, tone: "rose",    bar: "bg-rose-500",    label: "Over budget" };
  if (pct >= 80)  return { pct, tone: "amber",   bar: "bg-amber-500",   label: "Close to limit" };
  return { pct, tone: "emerald", bar: "bg-emerald-500", label: "On track" };
}


// ---- expense categories ----
//
// Stored in the blob (data.expenseCategories) rather than hardcoded, because
// the right categories are specific to how one person actually spends — a
// fixed list is either too long to scan or missing the one you need, and
// "Other" absorbing everything defeats the point of budgeting by category.
//
// Seeded with sensible defaults, but every one of them is editable and
// deletable; nothing here is special-cased.
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Software", "Utilities", "Rent", "Contractor", "Marketing", "Travel", "Other",
];

/**
 * The category list to show in a picker: what's saved, plus any value already
 * on the record being edited even if that category was since deleted.
 * Without that second part, opening an old expense would silently re-file it
 * under whatever happened to be first in the list.
 */
export function categoryOptions(saved, current) {
  const list = Array.isArray(saved) && saved.length ? [...saved] : [...DEFAULT_EXPENSE_CATEGORIES];
  if (current && !list.some((c) => c.toLowerCase() === String(current).toLowerCase())) {
    list.push(current);
  }
  return list;
}
