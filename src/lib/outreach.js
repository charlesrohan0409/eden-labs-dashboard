// Shared config + aggregation for the daily LinkedIn/email outreach log
// (data.outreachLog — see mutations.js's logOutreachDay). Kept out of the
// page component so the field list, funnel order, and date-bucketing math
// aren't duplicated between the log form, the funnel view, and the chart.

import { weekStart } from "./utils.js";

// Each stage in the order it happens — the funnel view walks this list and
// shows the conversion % from one stage to the next.
export const LINKEDIN_STAGES = [
  { key: "linkedinConnectionsSent", label: "Connections sent" },
  { key: "linkedinConnectionsAccepted", label: "Accepted" },
  { key: "linkedinConversationsStarted", label: "Conversations started" },
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
  const byDate = new Map((outreachLog || []).map((e) => [e.date, e]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const entry = byDate.get(date);
    const label = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    out.push({ date, label, ...EMPTY_ENTRY, ...(entry || {}) });
  }
  return out;
}

// n/0 is meaningless, not 0% — the funnel view shows "—" for those instead
// of a misleading 0%.
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
    const key = weekStart(d.toISOString().slice(0, 10));
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
