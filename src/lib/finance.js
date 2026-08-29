import { toDateKey, today, formatLongDate } from "./utils.js";
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

// ---- books: whose money is this? ----
//
// Money moving through this dashboard belongs to one of two books. The
// agency's rent and the personal Netflix subscription are both real
// outgoings, but summing them answers no question anyone actually has:
// "what did the business spend this month" and "what did I spend this
// month" are different numbers, and a single blended total is wrong for
// both. Kept as a field on the record rather than two collections so every
// existing total, chart and CSV keeps working untouched — they just gain a
// filter.
//
// Existing rows have no `book`, and are treated as business: this dashboard
// was the agency's ledger long before it was anything else, so that's what
// the untagged history actually is. Guessing "personal" for them would
// silently pull real business costs out of every business total.
export const BOOKS = {
  business: { id: "business", label: "Eden Labs", short: "Business", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", dot: "bg-emerald-500" },
  personal: { id: "personal", label: "Personal",  short: "Personal", chip: "bg-violet-50 text-violet-700 ring-violet-600/15",   dot: "bg-violet-500" },
};
export const BOOK_LIST = Object.values(BOOKS);
export const bookOf = (record) => (record?.book === "personal" ? "personal" : "business");
export const bookMeta = (id) => BOOKS[id] || BOOKS.business;

/** Filters any book-tagged collection. `null`/"all" means don't filter. */
export function inBook(rows, book) {
  if (!book || book === "all") return rows || [];
  return (rows || []).filter((r) => bookOf(r) === book);
}

// ---- budgets ----
//
// `custom` is the one that isn't a calendar period: it runs between an
// explicit start and end date, and once that window is past it stops
// accumulating rather than silently rolling into the next one. That's the
// difference between "my monthly software budget" and "the ₹40k I've set
// aside for this launch" — the second has an end, and a budget that quietly
// resets past its end date would report a finished project as on track
// forever.
export const BUDGET_PERIODS = {
  monthly: { label: "Monthly" },
  yearly:  { label: "Yearly" },
  custom:  { label: "Custom dates" },
};
export const BUDGET_PERIOD_LIST = Object.entries(BUDGET_PERIODS).map(([id, m]) => ({ id, ...m }));

// The period a date falls in, as a comparable key.
export function periodKey(dateStr, period) {
  if (!dateStr) return "";
  return period === "yearly" ? dateStr.slice(0, 4) : dateStr.slice(0, 7);
}

/**
 * The window a budget currently measures, as {from, to} date keys.
 *
 * Calendar periods derive their window from `now`, which is what makes them
 * reset on their own — no stored cursor to drift, and no reset job that has
 * to have run for the number to be right. A custom budget's window is
 * whatever was typed.
 */
export function budgetWindow(budget, now = new Date()) {
  if (budget?.period === "custom") {
    return { from: budget.startDate || "", to: budget.endDate || "" };
  }
  const y = now.getFullYear();
  if (budget?.period === "yearly") {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, "0")}` };
}

/** A custom budget whose end date has passed — finished, not just quiet. */
export function isBudgetExpired(budget, todayKey = today()) {
  return budget?.period === "custom" && !!budget.endDate && budget.endDate < todayKey;
}

/**
 * Human label for the window a budget covers.
 *
 * Says how long a custom budget has left, because that's the number that
 * changes what you do — "₹12k left" means something different with three
 * weeks to go than with two days.
 */
export function budgetPeriodLabel(budget, todayKey = today()) {
  if (budget?.period !== "custom") return budget?.period === "yearly" ? "This year" : "This month";
  const { from, to } = budgetWindow(budget);
  if (!from || !to) return "Custom";
  if (to < todayKey) return `Ended ${formatLongDate(to)}`;
  const daysLeft = daysUntil(to);
  if (daysLeft === 0) return "Ends today";
  return `${formatLongDate(from)} to ${formatLongDate(to)} · ${daysLeft}d left`;
}

// What's been spent against a budget in the CURRENT period, expressed in the
// BUDGET's own currency — comparing a ₹ limit against a $ total would read as
// wildly under budget rather than over.
//
// `convert(amount, from, to)` is injected rather than imported so this stays a
// pure function with no dependency on the live FX rate, which lives in React
// state. Callers pass the one from useCurrency.
export function spentOn(budget, expenses, convert, now = new Date()) {
  const { from: winFrom, to: winTo } = budgetWindow(budget, now);
  // A budget only ever measures its OWN book. Without this, a personal
  // "Software" budget would count the agency's Figma seat against it — same
  // category name, entirely different money — and read as over budget for a
  // spend the person never made.
  const book = bookOf(budget);
  return (expenses || [])
    .filter((e) => {
      if (e.category !== budget.category) return false;
      if (bookOf(e) !== book) return false;
      const d = e.date || "";
      if (!d) return false;
      // Inclusive on both ends: a budget running "to the 31st" that excluded
      // the 31st would quietly under-report the last day of every window.
      if (winFrom && d < winFrom) return false;
      if (winTo && d > winTo) return false;
      return true;
    })
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


// ---- receivables: money owed TO you ----
//
// Two different things that answer the same question — "what am I owed, and
// by whom" — and which the dashboard previously couldn't answer at all.
//
//  1. Money you LENT. A friend, a contractor float, a deposit. Recorded by
//     hand, because nothing else in the app knows it happened.
//  2. An OVERDUE INVOICE. Already recorded — it's just an invoice past its
//     due date — so it is DERIVED here rather than copied. Copying would
//     create a second record that has to be kept in sync, and the moment
//     the invoice is marked paid the copy would sit there claiming money
//     that has already arrived.
//
// That derivation is the whole design: the manual list is small and the
// invoice list is the source of truth, so the combined view is built at
// read time and can never disagree with either.
export const LOAN_STATUS = {
  outstanding: { label: "Outstanding", tone: "amber",   chip: "bg-amber-50 text-amber-700 ring-amber-600/15" },
  settled:     { label: "Settled",     tone: "emerald", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  writtenOff:  { label: "Written off", tone: "stone",   chip: "bg-stone-100 text-stone-500 ring-stone-400/15" },
};
export const LOAN_STATUS_LIST = Object.entries(LOAN_STATUS).map(([id, m]) => ({ id, ...m }));
export const loanStatusMeta = (id) => LOAN_STATUS[id] || LOAN_STATUS.outstanding;

/**
 * Everything currently owed to you, from both sources, as one list.
 *
 * Invoice-derived rows are marked `kind: "invoice"` and carry the invoice's
 * id so the UI can send you to the real record rather than pretending the
 * receivable is editable here — the way to settle it is to mark the invoice
 * paid, and offering a second "settle" button would let the two disagree.
 *
 * `settled` and `writtenOff` loans are excluded: this list answers "what is
 * still outstanding", and a settled loan is history, not a receivable.
 */
export function buildReceivables(loans, invoices, clients, todayKey = today()) {
  const manual = (loans || [])
    .filter((l) => (l.status || "outstanding") === "outstanding")
    .map((l) => ({
      kind: "loan",
      id: l.id,
      name: l.person || "Someone",
      reason: l.reason || "",
      amount: Number(l.amount) || 0,
      currency: l.currency || "INR",
      date: l.date || "",
      dueDate: l.dueDate || "",
      book: bookOf(l),
      overdueBy: l.dueDate && l.dueDate < todayKey ? -daysUntil(l.dueDate) : 0,
      source: l,
    }));

  const fromInvoices = (invoices || [])
    .filter((i) => effectiveInvoiceStatus(i, todayKey) === "overdue")
    .map((i) => {
      const client = (clients || []).find((c) => c.id === i.clientId);
      const due = i.dueDate || i.date || "";
      return {
        kind: "invoice",
        id: i.id,
        name: client?.name || client?.company || "Client",
        reason: i.description || "Unpaid invoice",
        // The invoice's own currency, same split every other total uses.
        amount: Number(i.nativeAmount ?? i.amount) || 0,
        currency: i.currency || "USD",
        date: i.date || "",
        dueDate: due,
        // Client work is always the agency's book — a client's unpaid
        // invoice is never personal money.
        book: "business",
        overdueBy: due ? -daysUntil(due) : 0,
        source: i,
      };
    });

  // Most overdue first: this list is a chase list, and the thing that has
  // been outstanding longest is the thing to act on.
  return [...manual, ...fromInvoices].sort((a, b) => b.overdueBy - a.overdueBy);
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

/**
 * The status an invoice ACTUALLY has right now.
 *
 * `invoice.status` is only ever "pending" or "paid" in practice — nothing in
 * the app has ever written "overdue" (only seed.js does). But FinanceDetail
 * computed its overdue money total, its overdue count and its Overdue filter
 * tab from `status === "overdue"`, so all three read ~0 forever no matter how
 * late an invoice actually was. Meanwhile lib/today.js derived overdue-ness
 * correctly from the date, so the dashboard and the finance page disagreed.
 *
 * One definition, derived: unpaid and past its due date is overdue. Falls
 * back to `date` because `dueDate` was only added later and older invoices
 * don't carry it.
 */
export function effectiveInvoiceStatus(invoice, todayKey) {
  if (!invoice) return "pending";
  if (invoice.status === "paid") return "paid";
  const due = invoice.dueDate || invoice.date || "";
  if (due && due < (todayKey || today())) return "overdue";
  return invoice.status || "pending";
}
