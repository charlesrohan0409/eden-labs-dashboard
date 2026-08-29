// Shared config + aggregation for the daily LinkedIn/email outreach log
// (data.outreachLog — see mutations.js's logOutreachDay). Kept out of the
// page component so the field list, funnel order, and date-bucketing math
// aren't duplicated between the log form, the funnel view, and the chart.

import { weekStart, toDateKey, workDayKey } from "./utils.js";

// Each stage in the order it happens — the funnel view walks this list and
// shows the conversion % from one stage to the next.
export const LINKEDIN_STAGES = [
  { key: "linkedinConnectionsSent", label: "Connections sent" },
  { key: "linkedinConnectionsAccepted", label: "Accepted" },
  { key: "linkedinConversationsStarted", label: "DMs sent" },
  { key: "linkedinReplied", label: "Replied" },
  { key: "linkedinCallsBooked", label: "Calls booked" },
  { key: "linkedinDealsClosed", label: "Deals closed" },
];

export const EMAIL_STAGES = [
  { key: "emailSent", label: "Emails sent" },
  { key: "emailReplied", label: "Replied" },
  { key: "emailCallsBooked", label: "Calls booked" },
];

export const ALL_FIELDS = [...LINKEDIN_STAGES, ...EMAIL_STAGES].map((s) => s.key);

export const EMPTY_ENTRY = ALL_FIELDS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {});

// Scopes a log to one client before aggregating. `undefined` means "every
// row, whoever it belongs to"; `null` means the owner's own agency outreach;
// a string means that client. Same convention TaskList already uses for its
// clientId prop.
//
// Deliberately a separate filter rather than a clientId parameter on each
// aggregator below: any default there would be wrong. Defaulting to "all
// rows" would make the owner's Growth numbers silently jump the first time a
// client row is logged, and defaulting to "owner only" would bake a policy
// decision into a math helper.
export const forClient = (outreachLog, clientId) =>
  clientId === undefined
    ? (outreachLog || [])
    : (outreachLog || []).filter((e) => (e.clientId || null) === (clientId || null));

// Sums every field across whatever rows fall in [since, today] — used for
// the funnel view's rolling window and the small trend stats.
export function sumEntries(outreachLog, sinceDate) {
  const totals = { ...EMPTY_ENTRY };
  (outreachLog || [])
    .filter((e) => e.date >= sinceDate)
    .forEach((e) => ALL_FIELDS.forEach((k) => { totals[k] += Number(e[k]) || 0; }));
  return totals;
}

// One row per day for the last `days` days, oldest first, zero-filled for
// any day with no logged entry — this is what the line chart plots, so a
// day you forgot to log reads as a real dip rather than just vanishing from
// the x-axis.
export function buildDailySeries(outreachLog, days = 30) {
  // Accumulates per date rather than keying a Map to the row — with rows now
  // scoped per client, several can share a date, and a Map keyed on date
  // silently kept only the last one instead of summing them. Idempotent for
  // the single-row-per-date case, so scoped callers are unaffected.
  const byDate = new Map();
  (outreachLog || []).forEach((e) => {
    const bucket = byDate.get(e.date) || { ...EMPTY_ENTRY };
    ALL_FIELDS.forEach((k) => { bucket[k] += Number(e[k]) || 0; });
    byDate.set(e.date, bucket);
  });
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = toDateKey(d);
    const label = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    out.push({ date, label, ...EMPTY_ENTRY, ...(byDate.get(date) || {}) });
  }
  return out;
}

// n/0 is meaningless, not 0% — the funnel view shows "—" for those instead
// of a misleading 0%.
/**
 * How many leads reached a given CRM stage inside a window.
 *
 * Uses `stageDates`, so a lead that has since moved past the stage still
 * counts for the week it actually got there — a funnel that only looked at
 * the CURRENT stage would report a booked call as un-booked the moment it
 * became a proposal.
 */
export function crmReached(contacts, stage, since, clientId) {
  return (contacts || []).filter((c) => {
    if (clientId !== undefined && (c.clientId || null) !== (clientId || null)) return false;
    const on = c.stageDates?.[stage];
    if (!on) return false;
    return !since || on >= since;
  }).length;
}

/**
 * Outreach totals reconciled against the CRM.
 *
 * Calls get booked in two places and the app recorded them in two places
 * that never spoke: dragging a lead to "Call booked" on the CRM board, and
 * typing a number into the outreach logger. The Growth page read only the
 * second, so it reported 0 calls while two named leads sat in Call booked —
 * the dashboard disagreeing with itself about a fact the user could see.
 *
 * Reconciled with MAX, not a sum. These are two records of the SAME funnel
 * stage, so adding them counts one real call twice the moment you both log
 * it and move the lead. Max is the honest reading of "two records of one
 * thing, either of which may be incomplete": if the CRM has 2 and you
 * logged 0, you booked 2; if you logged 3 but only 2 became leads, you
 * booked 3 and one never got a card.
 *
 * Email calls are left alone — there is no CRM stage for them, so nothing
 * to reconcile against and no risk of double counting.
 */
export function reconcileWithCrm(totals, contacts, since, clientId) {
  if (!totals) return totals;
  const crmCalls = crmReached(contacts, "call_booked", since, clientId);
  const crmClosed = crmReached(contacts, "closed", since, clientId);
  return {
    ...totals,
    linkedinCallsBooked: Math.max(Number(totals.linkedinCallsBooked) || 0, crmCalls),
    linkedinDealsClosed: Math.max(Number(totals.linkedinDealsClosed) || 0, crmClosed),
    // Kept so the UI can show WHERE the number came from. A reconciled
    // figure that can't be traced back is the same trust problem in a new
    // costume.
    _crm: { callsBooked: crmCalls, dealsClosed: crmClosed },
    _logged: {
      callsBooked: Number(totals.linkedinCallsBooked) || 0,
      dealsClosed: Number(totals.linkedinDealsClosed) || 0,
    },
  };
}

export function conversionPct(from, to) {
  if (!from) return null;
  return Math.round((to / from) * 100);
}

// Same shape as buildDailySeries but bucketed into Mon-Sun weeks, summed —
// for "how's this week trending against the last several" rather than
// wading through 30+ individual daily points.
export function buildWeeklySeries(outreachLog, weeks = 12) {
  const buckets = new Map();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const key = weekStart(toDateKey(d));
    buckets.set(key, { date: key, label: "", ...EMPTY_ENTRY });
  }
  (outreachLog || []).forEach((e) => {
    const key = weekStart(e.date);
    const bucket = buckets.get(key);
    if (bucket) ALL_FIELDS.forEach((k) => { bucket[k] += Number(e[k]) || 0; });
  });
  return Array.from(buckets.values()).map((b) => {
    const start = new Date(b.date + "T12:00:00");
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return { ...b, label: `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })}` , rangeLabel: `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "short" })}` };
  });
}

// Same again, bucketed by calendar month — for "how's this month shaping up
// against the last few."
export function buildMonthlySeries(outreachLog, months = 6) {
  const buckets = new Map();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { date: key, label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), ...EMPTY_ENTRY });
  }
  (outreachLog || []).forEach((e) => {
    const key = e.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) ALL_FIELDS.forEach((k) => { bucket[k] += Number(e[k]) || 0; });
  });
  return Array.from(buckets.values());
}

// ---------------------------------------------------------------------------
// Campaigns, scripts, and the diagnosis
// ---------------------------------------------------------------------------
//
// The whole reason lead lists and scripts exist as records: a rate on its own
// only says "something is wrong". A rate attached to a named list says WHICH
// list is wrong, which is the difference between a report and a decision.
//
// Each ratio in the funnel blames exactly one thing:
//   accepted / sent      -> the LIST     (wrong people)
//   replies  / dms sent  -> the SCRIPT   (right people, wrong message)
//   signed   / calls     -> the PITCH    (right message, wrong offer)
//
// Rates are computed per LIST over its whole run, never per day. Connections
// go out on Monday and get accepted over the following week, so dividing this
// week's accepts by this week's sends produces a number that is wrong every
// week — and badly wrong in any week the send volume changes.

export const DEFAULT_OUTREACH_TARGETS = {
  // The owner's own numbers, given directly: 30% is the goal, 25% is the
  // floor, below that the list itself is the problem.
  acceptRate: { good: 30, ok: 25 },
  // Placeholders until there's enough real data to set them honestly — the
  // Growth page exposes these as editable rather than pretending they're
  // derived from anything.
  replyRate: { good: 25, ok: 15 },
  closeRate: { good: 25, ok: 15 },
  weeklyConnections: 200,
};

// How long a stage gets before a zero counts as a verdict rather than a
// not-yet. Sized to how the funnel actually behaves: connection accepts
// trickle in across roughly a week, and they're logged manually after that.
export const PENDING_WINDOW_DAYS = 10;

export const DIAGNOSTICS = [
  {
    id: "acceptRate",
    label: "Acceptance rate",
    from: "linkedinConnectionsSent",
    to: "linkedinConnectionsAccepted",
    blames: "the lead list",
    lowMessage: "The list is the problem — these are the wrong people, not the wrong message.",
    okMessage: "Working, but the list could be tighter.",
    goodMessage: "Strong list. Keep mining this niche.",
  },
  {
    id: "replyRate",
    label: "Reply rate",
    from: "linkedinConversationsStarted",
    to: "linkedinReplied",
    blames: "the script",
    lowMessage: "Right people, wrong message — rewrite the script before blaming the list.",
    okMessage: "The script works. Worth testing a variant against it.",
    goodMessage: "Script is landing. Reuse it on the next list.",
  },
  {
    id: "closeRate",
    label: "Call → signed",
    from: "linkedinCallsBooked",
    to: "linkedinDealsClosed",
    blames: "the pitch",
    lowMessage: "You're getting the calls — it's the offer or the pitch losing them.",
    okMessage: "Converting, but there's room in the pitch.",
    goodMessage: "Pitch is converting well.",
  },
];

/** Whole days between a YYYY-MM-DD and today. Null in, null out. */
export function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((now - then) / 86400000);
}

/** Sums a set of entries into one funnel. */
export function funnelOf(entries) {
  const totals = { ...EMPTY_ENTRY };
  (entries || []).forEach((e) => ALL_FIELDS.forEach((k) => { totals[k] += Number(e[k]) || 0; }));
  return totals;
}

/**
 * Turns a funnel into verdicts. Returns one entry per diagnostic with the
 * rate, a verdict, and plain-English wording.
 *
 * `verdict: "unknown"` when the denominator is zero — a rate of 0% and "no
 * data yet" mean completely different things, and calling an untested list
 * bad is how you throw away a good one.
 */
export function diagnose(totals, targets = DEFAULT_OUTREACH_TARGETS, { daysSinceStart = null } = {}) {
  return DIAGNOSTICS.map((d) => {
    const from = Number(totals?.[d.from]) || 0;
    const to = Number(totals?.[d.to]) || 0;
    const t = targets[d.id] || DEFAULT_OUTREACH_TARGETS[d.id];
    if (!from) {
      return { ...d, from, to, rate: null, verdict: "unknown", message: "Not enough data yet." };
    }
    // Zero successes against a fresh denominator is an INCOMPLETE measurement,
    // not a failed one. Connections get accepted over the following week and
    // the accepts are logged by hand afterwards, so a list looks like a total
    // failure for its first few days no matter how good it is. Condemning it
    // then is how a good list gets dropped on day two.
    if (to === 0 && daysSinceStart != null && daysSinceStart < PENDING_WINDOW_DAYS) {
      return {
        ...d, from, to, rate: 0, verdict: "pending",
        message: "Too early to call — replies at this stage usually land over the following week.",
      };
    }
    const rate = (to / from) * 100;
    const verdict = rate >= t.good ? "good" : rate >= t.ok ? "ok" : "bad";
    return {
      ...d, from, to,
      rate: Math.round(rate * 10) / 10,
      verdict,
      target: t,
      message: verdict === "good" ? d.goodMessage : verdict === "ok" ? d.okMessage : d.lowMessage,
    };
  });
}

/** Per-list funnels and verdicts, busiest first. Entries with no list are
 *  grouped under a synthetic "unassigned" row rather than dropped — they
 *  predate lists existing and still count toward totals. */
export function byList(entries, lists, targets) {
  const groups = new Map();
  (entries || []).forEach((e) => {
    const key = e.listId || "__unassigned__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  return [...groups.entries()]
    .map(([listId, rows]) => {
      const list = (lists || []).find((l) => l.id === listId);
      const totals = funnelOf(rows);
      // Each list is judged against its OWN age, not the log's — a campaign
      // started yesterday shouldn't inherit an old one's maturity.
      const oldest = rows.map((r) => r.date).filter(Boolean).sort()[0];
      return {
        listId,
        list: list || null,
        name: list?.name || "Unassigned",
        unassigned: !list,
        entries: rows.length,
        totals,
        daysSinceStart: daysSince(oldest),
        diagnostics: diagnose(totals, targets, { daysSinceStart: daysSince(oldest) }),
      };
    })
    .sort((a, b) => b.totals.linkedinConnectionsSent - a.totals.linkedinConnectionsSent);
}

/** Per-script reply rates. Only the reply diagnostic applies — a script has
 *  no bearing on whether a connection request gets accepted, since that
 *  happens before the script is ever sent. */
export function byScript(entries, scripts, targets) {
  const groups = new Map();
  (entries || []).forEach((e) => {
    if (!e.scriptId) return;
    if (!groups.has(e.scriptId)) groups.set(e.scriptId, []);
    groups.get(e.scriptId).push(e);
  });
  return [...groups.entries()]
    .map(([scriptId, rows]) => {
      const script = (scripts || []).find((s) => s.id === scriptId);
      const totals = funnelOf(rows);
      const sent = totals.linkedinConversationsStarted;
      const replied = totals.linkedinReplied;
      // Per-key fallback, same as diagnose(): a settings object that exists
      // but is missing replyRate would otherwise white-screen the page.
      const t = targets?.replyRate || DEFAULT_OUTREACH_TARGETS.replyRate;
      const rate = sent ? (replied / sent) * 100 : null;
      return {
        scriptId,
        script: script || null,
        name: script?.name || "Unknown script",
        sent,
        replied,
        rate: rate == null ? null : Math.round(rate * 10) / 10,
        verdict: rate == null ? "unknown" : rate >= t.good ? "good" : rate >= t.ok ? "ok" : "bad",
      };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
}

// ---------------------------------------------------------------------------
// The weekly connection quota
// ---------------------------------------------------------------------------
//
// LinkedIn caps invites at 200 a week and the week rolls over at midnight on
// Saturday — so the working deadline is Saturday evening, not Sunday. This
// week therefore runs Sunday 00:00 through Saturday 23:59, which is NOT the
// Monday-start week the rest of the app uses for content and tasks. Kept as
// its own helper rather than bending weekStart(), because changing that would
// silently re-bucket every content chart.

export function outreachWeekStart(date = new Date()) {
  // Anchored on the WORK day: outreach done at 1am on Sunday belongs to
  // Saturday, which is the previous quota week. Using calendar midnight
  // would move that batch into the new week's total and make the week you
  // just finished look short.
  const d = date instanceof Date
    ? new Date(`${workDayKey(date)}T12:00:00`)
    : new Date(`${String(date).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Where you are against the weekly send quota.
 *
 * `daysLeft` counts today as a day you can still send on, which is what makes
 * `perDay` actionable — "26 a day" has to include today or it's telling you
 * to do the impossible.
 */
export function weeklyPace(entries, target = DEFAULT_OUTREACH_TARGETS.weeklyConnections, now = new Date()) {
  const start = outreachWeekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const sent = (entries || [])
    .filter((e) => e.date >= startKey && e.date <= endKey)
    .reduce((s, e) => s + (Number(e.linkedinConnectionsSent) || 0), 0);

  const remaining = Math.max(0, target - sent);
  // Saturday is the last day, so on Saturday itself daysLeft is 1.
  const daysLeft = Math.max(0, 6 - now.getDay() + 1);
  return {
    sent,
    target,
    remaining,
    daysLeft,
    perDay: daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining,
    pct: target > 0 ? Math.min(100, Math.round((sent / target) * 100)) : 0,
    done: sent >= target,
    weekStartKey: startKey,
    weekEndKey: endKey,
  };
}
