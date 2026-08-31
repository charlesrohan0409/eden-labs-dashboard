// The questions a person actually asks their own money.
//
// ledgerAnalysis.js answers "what are the totals". This answers the harder
// ones: what is the money going TO, what repeats every month whether or not
// you remember it, what changed since last month, and what is unusual enough
// to be worth a second look.
//
// The recurring detector earned its place before it was written. A ₹4,238
// payment went out on the 5th of seventeen consecutive months, filed under
// bank charges and subscriptions, and it turned out to be a vehicle EMI paid
// on a family member's behalf — ₹72,046 of someone else's loan sitting in
// his own spending. Nothing flagged it. It was found by hand. This module
// exists so the next one isn't.

import { fromMinor, kindOf } from "./ledger.js";
import { accountLabel, groupOf, monthName } from "./ledgerAnalysis.js";

const monthOf = (d) => String(d).slice(0, 7);

/**
 * A payee's name, pulled out of a bank narration.
 *
 * Narrations are machine-generated and full of noise: rails prefixes (UPI/,
 * IMPS-), the counterparty's bank code, a 12-digit reference, a VPA. The
 * name is in there but never in the same position twice, so this strips what
 * is reliably NOT the name and takes the longest thing left standing.
 */
export function payeeOf(memo) {
  let s = String(memo || "");
  s = s.replace(/\(Ref#[^)]*\)/gi, " ");
  s = s.replace(/\b\d{0,6}X{4,}\d{2,6}\b/gi, " ");   // masked card numbers
  // Rails and terminal prefixes. "ME DC SI" is a debit-card standing
  // instruction, and it prefixes every subscription this account renews —
  // left in, every Adobe and Google charge reads as the same payee.
  s = s.replace(/\b(ME\s+DC\s+SI|POS|EDC|ATW|ATL|NACH|IMPS|NEFT|MMT|ACH|UPI)\b/gi, " ");
  const parts = s.split(/[/|-]/).map((p) => p.trim()).filter(Boolean);

  // Card terminals append the acquiring city, so a narration ends in MUMBAI
  // or GURGOAN. On its own that is not a payee; on the end of a name it is
  // noise. Both cases are handled — rejected alone, trimmed when trailing.
  const CITY = "MUMBAI|GURGOAN|GURGAON|BANGALORE|BENGALURU|NEW DELHI|DELHI|CHENNAI|NOIDA|TUTICORIN|THOOTHUKUDI|NAGERCOIL|HYDERABAD|PUNE|KOLKATA|DUBLIN|CAMDEN|BROOKLYN|NICOSIA|SAN FRANCISC|SINGA";
  const junk = new RegExp(`^(UPI|UPIIntent|UPI Intent|PayviaRazorpay|Pay to BharatPe|Pay To BharatPe|Verified Pay|Payment from Ph|You are paying.*|Payment for.*|PAYMENT ON|swiggy|billzy|DR|CR|NA|Payment|${CITY})$`, "i");
  const trimCity = (p) => p.replace(new RegExp(`\\s+(${CITY})\\s*$`, "i"), "").trim() || p;
  const score = (p) => {
    if (junk.test(trimCity(p))) return -1;
    if (/^\d[\d.,\s]*$/.test(p)) return -1;             // a reference number
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(p)) return -1;   // an IFSC code
    const letters = p.replace(/[^A-Za-z]/g, "").length;
    if (letters < 3) return -1;
    // A real name usually has spaces and few digits; a VPA or a code has
    // neither. Score rather than filter, so something is always returned.
    return letters + (/\s/.test(p) ? 12 : 0) - (/@/.test(p) ? 8 : 0) - (p.replace(/[^0-9]/g, "").length * 2);
  };
  const best = parts.map((p) => [p, score(p)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  if (!best) {
    // Some UPI payees have no name at all — the handle is a phone number, so
    // the narration carries a 10-digit string and nothing else. Falling back
    // to the raw narration prints "-9869656971ptyes-9869656971@", which reads
    // as corruption. The number is the only real information there, so say so.
    const phone = s.match(/\b([6-9]\d{9})\b/);
    if (phone) return `UPI to ${phone[1]}`;
    return s.replace(/\s+/g, " ").trim().slice(0, 28) || "Unknown";
  }
  // A VPA carries the merchant in front of the @; the handle after it is the
  // payment provider and says nothing about who was paid.
  let name = trimCity(best[0]).split("@")[0].replace(/\.(cf|ifsc|ptm|okhdfcbank|oksbi|okaxis|ybl|paytm)$/i, "");
  return name.replace(/\s+/g, " ").trim().slice(0, 30) || "Unknown";
}

/**
 * A cash withdrawal has no payee. The narration carries a terminal ID and a
 * branch, which render as gibberish like "- -S1awmi51-Mumbai" — worse than
 * useless in a list of who you paid, because it looks like a merchant.
 */
const nameFor = (memo, account) => (account === "expense:cash" ? "Cash withdrawal" : payeeOf(memo));

/** A key that treats "Swiggy Ltd" and "SWIGGY LIMITED" as one payee. */
const payeeKey = (memo) =>
  payeeOf(memo).toUpperCase().replace(/\b(LIMITED|LTD|PVT|PRIVATE|INDIA|IN|COM|INC)\b/g, "").replace(/[^A-Z]/g, "");

/**
 * Who the money actually went to, biggest first.
 *
 * Categories tell you it was food. This tells you it was Ayyappan Idli, 46
 * times. Only the second one changes behaviour.
 */
export function topPayees(ledger, { from, to, kind = "expense", limit = 12, group = null } = {}) {
  const acc = new Map();
  for (const tx of ledger || []) {
    if (tx.conduit || tx.kind === "opening") continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      if (kindOf(l.account) !== kind) continue;
      if (group && groupOf(l.account) !== group) continue;
      // Signed, NOT filtered to positives. A refund is part of what a payee
      // cost you: the ₹66,794 course that was refunded ₹70,845 six months
      // later cost nothing, and listing it as the second-largest payee of
      // the year is simply false.
      const amount = kind === "income" ? -l.base : l.base;
      const k = (l.account === "expense:cash" ? "CASHWITHDRAWAL" : payeeKey(tx.memo)) || "OTHER";
      if (!acc.has(k)) acc.set(k, { name: nameFor(tx.memo, l.account), minor: 0, n: 0, group: groupOf(l.account), last: tx.date });
      const r = acc.get(k);
      r.minor += amount; r.n += 1;
      if (tx.date > r.last) r.last = tx.date;
    }
  }
  const rows = [...acc.values()].filter((r) => r.minor > 0).sort((a, b) => b.minor - a.minor);
  const total = rows.reduce((s, r) => s + r.minor, 0);
  return rows.slice(0, limit).map((r) => ({
    name: r.name, group: r.group, count: r.n, last: r.last,
    amount: fromMinor(r.minor),
    share: total > 0 ? r.minor / total : 0,
  }));
}

/**
 * Payments that repeat on a monthly cadence.
 *
 * Matched on payee AND amount, because it is the fixed amount that makes a
 * charge a commitment rather than a habit — ₹4,238 every month is a loan,
 * ₹140 at the same shop every month is lunch. Three occurrences across three
 * distinct months is the bar: two could be coincidence.
 */
export function recurring(ledger, { minOccurrences = 3, limit = 20, from, to } = {}) {
  const acc = new Map();
  for (const tx of ledger || []) {
    if (tx.kind === "opening") continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      if (kindOf(l.account) !== "expense" && l.account !== "liability:family") continue;
      const amount = l.base;
      if (amount <= 0) continue;
      const k = `${l.account === "expense:cash" ? "CASHWITHDRAWAL" : payeeKey(tx.memo)}|${Math.round(amount / 100)}`;
      if (!acc.has(k)) acc.set(k, { name: nameFor(tx.memo, l.account), minor: amount, months: new Set(), dates: [], account: l.account, conduit: !!tx.conduit });
      const r = acc.get(k);
      r.months.add(monthOf(tx.date));
      r.dates.push(tx.date);
    }
  }
  const out = [];
  for (const r of acc.values()) {
    if (r.dates.length < minOccurrences || r.months.size < minOccurrences) continue;
    const days = r.dates.map((d) => Number(d.slice(8, 10))).sort((a, b) => a - b);
    const mid = days[Math.floor(days.length / 2)];
    // A tight cluster of days-of-month is what separates a standing order
    // from a shop you happen to visit monthly.
    const tight = days.every((d) => Math.abs(d - mid) <= 4);
    out.push({
      name: r.name,
      amount: fromMinor(r.minor),
      months: r.months.size,
      dayOfMonth: mid,
      confident: tight,
      account: r.account,
      label: accountLabel(r.account),
      conduit: r.conduit,
      annualised: fromMinor(r.minor) * 12,
      last: r.dates.sort().slice(-1)[0],
    });
  }
  return out.sort((a, b) => b.amount * b.months - a.amount * a.months).slice(0, limit);
}

/** This month against last, per category — what actually moved. */
export function monthOnMonth(ledger) {
  const keys = [...new Set((ledger || []).filter((t) => t.kind !== "opening").map((t) => monthOf(t.date)))].sort();
  const cur = keys[keys.length - 1], prev = keys[keys.length - 2];
  if (!cur) return { current: null, previous: null, rows: [] };
  const bucket = (mk) => {
    const m = new Map();
    for (const tx of ledger || []) {
      if (tx.conduit || tx.kind === "opening" || monthOf(tx.date) !== mk) continue;
      for (const l of tx.legs) {
        if (kindOf(l.account) !== "expense") continue;
        const g = groupOf(l.account);
        m.set(g, (m.get(g) || 0) + l.base);
      }
    }
    return m;
  };
  const a = bucket(cur), b = prev ? bucket(prev) : new Map();
  const groups = new Set([...a.keys(), ...b.keys()]);
  const rows = [...groups].map((g) => {
    const now = fromMinor(a.get(g) || 0), was = fromMinor(b.get(g) || 0);
    return {
      group: g, now, was, delta: now - was,
      // Null, not Infinity: "new this month" is a different fact from "up
      // 400%", and rendering ∞ next to a rupee figure just looks broken.
      pct: was > 0 ? (now - was) / was : null,
    };
  }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return { current: cur, previous: prev, currentLabel: monthName(cur), previousLabel: prev ? monthName(prev) : null, rows };
}

/** Single transactions large enough to be worth remembering. */
export function largest(ledger, { from, to, limit = 8 } = {}) {
  const out = [];
  for (const tx of ledger || []) {
    if (tx.conduit || tx.kind === "opening") continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      if (kindOf(l.account) !== "expense" || l.base <= 0) continue;
      out.push({ date: tx.date, name: nameFor(tx.memo, l.account), memo: tx.memo, amount: fromMinor(l.base), group: groupOf(l.account), label: accountLabel(l.account) });
    }
  }
  return out.sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/**
 * Plain-sentence observations, ranked by how much money each one is about.
 *
 * Deliberately few. A wall of twenty "insights" is a wall, and the honest
 * number of things worth telling someone about their own spending in a given
 * month is two or three.
 */
export function observations(ledger) {
  const out = [];
  const mom = monthOnMonth(ledger);
  const rec = recurring(ledger);

  const committed = rec.filter((r) => r.confident && !r.conduit).reduce((s, r) => s + r.amount, 0);
  if (committed > 0) {
    out.push({
      tone: "neutral", weight: committed * 12,
      title: `${inr(committed)} a month is already committed`,
      body: `${rec.filter((r) => r.confident && !r.conduit).length} charges repeat on the same day every month — ${inr(committed * 12)} a year before you decide anything.`,
    });
  }
  const onBehalf = rec.filter((r) => r.conduit && r.confident).reduce((s, r) => s + r.amount, 0);
  if (onBehalf > 0) {
    out.push({
      tone: "neutral", weight: onBehalf * 12,
      title: `${inr(onBehalf)} a month goes out on someone else's behalf`,
      body: "Recurring payments made for family. They move real cash but never count as your spending.",
    });
  }
  const up = mom.rows.filter((r) => r.delta > 0).slice(0, 1)[0];
  if (up && mom.previous && up.delta > 1000) {
    out.push({
      tone: "warn", weight: up.delta,
      title: `${cap(up.group)} is up ${inr(up.delta)} on ${mom.previousLabel}`,
      body: `${inr(up.was)} → ${inr(up.now)}${up.pct !== null ? ` (${up.pct > 0 ? "+" : ""}${(up.pct * 100).toFixed(0)}%)` : ""}.`,
    });
  }
  const down = mom.rows.filter((r) => r.delta < 0).slice(0, 1)[0];
  if (down && mom.previous && down.delta < -1000) {
    out.push({
      tone: "good", weight: -down.delta,
      title: `${cap(down.group)} is down ${inr(-down.delta)} on ${mom.previousLabel}`,
      body: `${inr(down.was)} → ${inr(down.now)}.`,
    });
  }
  // Concentration is the risk an agency owner actually carries, and it is
  // invisible in a total: ₹7.2L of revenue reads as healthy right up until
  // you notice it is one client who could leave next month.
  const inc = topPayees(ledger, { kind: "income", limit: 3 });
  if (inc.length && inc[0].share > 0.6) {
    out.push({
      tone: "warn", weight: inc[0].amount,
      title: `${(inc[0].share * 100).toFixed(0)}% of your income comes from one payer`,
      body: `${inc[0].name} accounts for ${inr(inc[0].amount)}. Losing them means losing most of the revenue.`,
    });
  }

  // A one-off purchase is a different story from a payee you keep going
  // back to, so they get different sentences rather than "across 1 payments".
  const top = topPayees(ledger, { limit: 1 })[0];
  if (top) {
    out.push({
      tone: "neutral", weight: top.amount,
      title: top.count > 1 ? `${top.name} is your largest payee` : `${top.name} was your single biggest spend`,
      body: top.count > 1
        ? `${inr(top.amount)} across ${top.count} payments — ${(top.share * 100).toFixed(0)}% of everything you spent.`
        : `${inr(top.amount)} in one go — ${(top.share * 100).toFixed(0)}% of everything you spent.`,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

const inr = (n) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
const cap = (s) => String(s).replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * One category's month-by-month history.
 *
 * A total says food cost ₹2 lakh. This says whether that is ₹11,000 every
 * month or ₹4,000 rising to ₹19,000 — which is the only version you can
 * actually act on. Months with no spend are emitted as zero rather than
 * skipped, so a gap reads as a gap instead of the line hopping over it.
 */
export function categorySeries(ledger, group, { months = 24, from, to } = {}) {
  const acc = new Map();
  let first = null, last = null;
  for (const tx of ledger || []) {
    if (tx.conduit || tx.kind === "opening") continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      if (kindOf(l.account) !== "expense" || groupOf(l.account) !== group) continue;
      const k = monthOf(tx.date);
      acc.set(k, (acc.get(k) || 0) + l.base);
      if (!first || k < first) first = k;
      if (!last || k > last) last = k;
    }
  }
  if (!first) return [];
  const out = [];
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? (m = 1, y++) : m++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    out.push({ key: k, label: monthName(k), amount: fromMinor(acc.get(k) || 0) });
  }
  return out.slice(-months);
}

/** Headline numbers for one category. */
export function categoryStats(ledger, group, opts = {}) {
  const series = categorySeries(ledger, group, opts);
  if (!series.length) return null;
  const total = series.reduce((s, r) => s + r.amount, 0);
  const peak = series.reduce((a, b) => (b.amount > a.amount ? b : a), series[0]);
  const recent = series.slice(-3).reduce((s, r) => s + r.amount, 0) / Math.min(3, series.length);
  const earlier = series.slice(0, -3);
  const before = earlier.length ? earlier.reduce((s, r) => s + r.amount, 0) / earlier.length : null;
  return {
    series, total, peak,
    months: series.length,
    average: total / series.length,
    recentAverage: recent,
    // Null when there is no earlier period to compare against — "no trend
    // yet" and "flat" are different answers.
    trend: before === null || before === 0 ? null : (recent - before) / before,
  };
}

/**
 * Every payee in one category, each carrying its own transactions.
 *
 * The category page needs both levels at once — the ten places that took the
 * most, and, when you don't recognise one, the actual dates and amounts
 * behind it. Returning them together avoids a second pass over 3,000 entries
 * every time a row is expanded.
 */
export function categoryPayees(ledger, group, { from, to } = {}) {
  const acc = new Map();
  for (const tx of ledger || []) {
    if (tx.conduit || tx.kind === "opening") continue;
    if (from && tx.date < from) continue;
    if (to && tx.date > to) continue;
    for (const l of tx.legs) {
      if (kindOf(l.account) !== "expense" || groupOf(l.account) !== group) continue;
      const k = (l.account === "expense:cash" ? "CASHWITHDRAWAL" : payeeKey(tx.memo)) || "OTHER";
      if (!acc.has(k)) acc.set(k, { name: nameFor(tx.memo, l.account), minor: 0, tx: [] });
      const r = acc.get(k);
      r.minor += l.base;
      r.tx.push({ date: tx.date, amount: fromMinor(l.base), memo: tx.memo, account: l.account });
    }
  }
  const rows = [...acc.values()].filter((r) => r.minor !== 0);
  const total = rows.reduce((s, r) => s + Math.abs(r.minor), 0);
  return rows
    .map((r) => ({
      name: r.name, amount: fromMinor(r.minor), count: r.tx.length,
      share: total > 0 ? Math.abs(r.minor) / total : 0,
      tx: r.tx.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
