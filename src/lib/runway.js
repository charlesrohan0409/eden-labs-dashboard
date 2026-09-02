// Can you cover what's coming?
//
// Twelve recurring bills each carry a renewal date, and nothing anywhere put
// them next to the balance they'll be paid from. Replaying September against
// the real figures, HDFC went to −₹6,160 — a shortfall that would have been
// discovered at the bank rather than in the dashboard.
//
// This projects forward day by day and reports the lowest point. It is
// deliberately pessimistic in one direction: money going OUT is scheduled and
// known, money coming IN mostly isn't, so an unfunded date shown here is a
// real warning rather than a modelling artefact.

const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => { const d = new Date(s); return isNaN(d) ? null : d; };

/** Every date this recurring item falls due between `from` and `to`. */
export function occurrences(outgoing, from, to) {
  const start = parse(outgoing?.nextRenewal);
  if (!start) return [];
  const end = parse(outgoing?.endsOn);
  const cadence = String(outgoing.cadence || "monthly").toLowerCase();
  const out = [];
  const d = new Date(start);
  // Bills already overdue still have to be paid, so a renewal in the past is
  // pulled to today rather than skipped — otherwise a missed bill silently
  // improves the forecast.
  if (d < from) { out.push(new Date(from)); }
  let guard = 0;
  while (d <= to && guard++ < 64) {
    if (d >= from && (!end || d <= end)) out.push(new Date(d));
    if (cadence === "weekly") d.setDate(d.getDate() + 7);
    else if (cadence === "yearly" || cadence === "annual") d.setFullYear(d.getFullYear() + 1);
    else if (cadence === "quarterly") d.setMonth(d.getMonth() + 3);
    else d.setMonth(d.getMonth() + 1);
  }
  return out;
}

// What counts as money available to pay a bill on the day it falls due.
//
// An ALLOWLIST, not "everything that isn't a credit card". Excluding cards
// alone let ₹19,800 of Groww holdings read as spendable cash, and a forecast
// that covers next week's bills by quietly assuming you'll sell shares is
// worse than no forecast. Investments and the overseas balance are real
// money and appear in net worth — they just can't pay Tuesday's electricity.
const SPENDABLE_TYPES = new Set(["main", "savings", "current", "cash", "wallet", "checking"]);

/** Money you can actually spend today. */
export function spendableNow(accounts = []) {
  return (accounts || [])
    .filter((a) => SPENDABLE_TYPES.has(String(a.type || "").toLowerCase()))
    .filter((a) => (a.currency || "INR") === "INR")
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);
}

/** The accounts that figure counts, for showing your working. */
export const spendableAccounts = (accounts = []) => (accounts || []).filter(
  (a) => SPENDABLE_TYPES.has(String(a.type || "").toLowerCase()) && (a.currency || "INR") === "INR"
);

/**
 * The next `days` of scheduled money movement.
 *
 * Returns the events in order, the running balance after each, and the
 * lowest point reached — which is the number that matters.
 */
export function projectRunway({ accounts = [], outgoings = [], loans = [], clients = [], rate = 0, days = 30, from = new Date() } = {}) {
  const start = new Date(iso(from));
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const events = [];

  for (const o of outgoings) {
    if (o.status && o.status !== "active") continue;
    const amount = Number(o.lastPaidAmount ?? o.amount) || 0;
    if (!amount) continue;
    for (const when of occurrences(o, start, end)) {
      events.push({
        date: iso(when),
        label: o.name || "Recurring bill",
        amount: -amount,
        kind: o.paysDownAccountId ? "card-bill" : "bill",
        // A shared bill still takes the WHOLE amount out of the account on
        // the day. Only half is his cost, but the forecast is about cash
        // leaving, not about who ends up bearing it.
        note: o.splitShare ? `${o.splitWith || "Someone"} pays back half later` : "",
      });
    }
  }

  for (const l of loans) {
    if (l.status && l.status !== "outstanding") continue;
    const when = parse(l.dueDate);
    if (!when || when < start || when > end) continue;
    events.push({
      date: iso(when),
      label: `${l.person || "Someone"} repays`,
      amount: Number(l.amount) || 0,
      kind: "incoming",
      // Flagged rather than trusted. A repayment date is someone else's
      // intention, and a forecast that leans on it will look healthy on the
      // strength of money that hasn't arrived.
      note: "expected, not guaranteed",
    });
  }

  // Retainers. Every bill Charles pays was modelled and nothing modelled the
  // money coming in, so the forecast could only ever look worse than reality.
  //
  // Retainers ONLY — a one-off fee has no next date and a commission depends
  // on a deal closing, so treating either as scheduled income would be
  // inventing money. Contracts bill on the 1st, which is what they say.
  for (const c of clients) {
    if (c.status !== "active") continue;
    const k = c.contract || {};
    if ((k.billingType || "retainer") !== "retainer") continue;
    const usd = Number(k.value) || 0;
    if (!usd || !rate) continue;
    const amount = usd * rate;                 // contracts are written in USD
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    let guard = 0;
    while (d <= end && guard++ < 24) {
      if (d >= start) {
        events.push({
          date: iso(d),
          label: `${c.name || "Client"} retainer`,
          amount,
          kind: "incoming",
          // Same caution as a loan repayment: an invoice due is not an
          // invoice paid, and a runway that leans on unpaid ones is a runway
          // that says you're fine while the account empties.
          note: "expected, not guaranteed",
        });
      }
      d.setMonth(d.getMonth() + 1);
    }
  }

  events.sort((a, b) => (a.date === b.date ? a.amount - b.amount : a.date < b.date ? -1 : 1));

  let balance = spendableNow(accounts);
  const opening = balance;
  const series = [{ date: iso(start), balance, label: "Today", amount: 0, kind: "start" }];
  let low = { date: iso(start), balance };

  for (const e of events) {
    balance += e.amount;
    if (balance < low.balance) low = { date: e.date, balance };
    series.push({ ...e, balance });
  }

  const out = events.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  const inc = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  // The first date the balance goes under, if it does — what you'd want to
  // know a week beforehand.
  const shortfallAt = series.find((s) => s.balance < 0) || null;

  return {
    opening, closing: balance, events, series, low,
    totalOut: out, totalIn: inc,
    shortfallAt,
    days,
    // How much you'd need to find, and by when.
    shortfall: low.balance < 0 ? Math.abs(low.balance) : 0,
  };
}
