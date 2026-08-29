// Cross-cutting helpers that more than one page needs. Anything used by a
// single component stays in that component's file.

/**
 * The last `count` months ending with the current one, oldest first.
 *
 * This replaces a hardcoded `MONTHS = ["Mar".."Aug"]` that every chart in the
 * app bucketed into via `MONTHS[new Date(x).getMonth() - 2]`. That expression
 * returns undefined for any month outside Mar–Aug, so Jan, Feb and Sep–Dec
 * data was silently dropped on the floor — and from 1 September every revenue,
 * content, calls and deals chart (owner dashboard AND client portal) would
 * have frozen and never recorded another data point.
 *
 * Buckets are keyed "YYYY-MM" rather than by bare month name, so the same
 * month in different years can't collide, and `monthKeyOf` reads the key
 * straight off the stored "YYYY-MM-DD" string — no Date parsing, and
 * therefore no timezone slippage.
 */
export function recentMonths(count = 6, from = new Date()) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "short" }),
    });
  }
  return out;
}

/** "2026-08-27" -> "2026-08". Tolerates null/undefined. */
export const monthKeyOf = (dateStr) => String(dateStr || "").slice(0, 7);

/**
 * Builds an empty {key: bucket} map plus the ordered month list, so every
 * chart builder is three lines instead of a hand-rolled loop with index math.
 */
export function monthBuckets(seed, count = 6) {
  const months = recentMonths(count);
  const byKey = {};
  months.forEach((m) => { byKey[m.key] = { month: m.label, ...seed() }; });
  return {
    months,
    byKey,
    add: (dateStr, fn) => { const b = byKey[monthKeyOf(dateStr)]; if (b) fn(b); },
    series: () => months.map((m) => byKey[m.key]),
  };
}

// ---------- Unicode text formatting (LinkedIn-style bold/italic) ----------
export const toUnicodeBold = (str) =>
  str.replace(/[a-zA-Z0-9]/g, (c) => {
    const code = c.charCodeAt(0);
    if (c >= "0" && c <= "9") return String.fromCodePoint(0x1d7ce + (code - 48));
    if (c >= "A" && c <= "Z") return String.fromCodePoint(0x1d400 + (code - 65));
    if (c >= "a" && c <= "z") return String.fromCodePoint(0x1d41a + (code - 97));
    return c;
  });

export const toUnicodeItalic = (str) =>
  str.replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0);
    if (c >= "A" && c <= "Z") return String.fromCodePoint(0x1d434 + (code - 65));
    if (c >= "a" && c <= "z") return String.fromCodePoint(0x1d44e + (code - 97));
    return c;
  });

// Probability weighting used to turn raw pipeline into a forecastable number.
export const STAGE_WEIGHTS = { lead: 0.1, call_booked: 0.35, proposal_sent: 0.6, closed: 1, lost: 0 };

// Stages the board used before the pipeline was reworked, mapped onto the
// current five so older saved data keeps its position.
export const LEGACY_STAGE_MAP = {
  prospect: "lead",
  contacted: "lead",
  replied: "lead",
  booked: "call_booked",
  client: "closed",
  // The Chrome extension's popup used to offer a "qualified" stage that the
  // board never had. Anything saved that way rendered in no column and was
  // unreachable through the UI — mapping it back to lead rescues those rows.
  qualified: "lead",
};

export function downloadCSV(filename, headers, rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Delivery metrics can be "higher is better" (posts/week) or "lower is
// better" (open bugs, DM response time in hours) — direction defaults to
// "higher" so every pre-existing metric (which never set this field) keeps
// behaving exactly as before.
export function isMetricOnTrack(metric) {
  return metric.direction === "lower" ? metric.current <= metric.target : metric.current >= metric.target;
}

// 0-100 fill for the progress bar, oriented so "more fill" always means
// "closer to or past the goal" regardless of which direction is good here —
// a lower-is-better metric at 0 (the best possible value) fills completely,
// not zero.
export function metricProgressPct(metric) {
  const { current, target, direction } = metric;
  if (direction === "lower") {
    if (current <= 0) return 100;
    return Math.max(0, Math.min(100, target > 0 ? (target / current) * 100 : 100));
  }
  return Math.max(0, Math.min(100, target ? (current / target) * 100 : 0));
}

export function computeHealthScore(client, invoices) {
  const delivery = client.delivery || [];
  const deliveryPct = delivery.length
    ? Math.round((delivery.filter(isMetricOnTrack).length / delivery.length) * 100)
    : 100;
  const clientInvoices = invoices.filter((i) => i.clientId === client.id);
  const paymentPct = clientInvoices.length
    ? Math.round((clientInvoices.filter((i) => i.status === "paid").length / clientInvoices.length) * 100)
    : 100;
  return Math.round(deliveryPct * 0.6 + paymentPct * 0.4);
}

export function healthTone(score) {
  if (score >= 80) return "emerald";
  if (score >= 50) return "amber";
  return "rose";
}

// ---------- Contract billing types (retainer / one-time / commission) ----------
// Retainers renew forever and get billed every period; one-time projects
// (a single book edit, say) and commission deals (a % of some deal, paid out
// as installments over a fixed window) both end — neither belongs in
// "recurring revenue" even while the client is still active.

// A commission deal's total is always derived from the % and the basis the
// owner actually agreed to (e.g. "15% over 6 months") — never hand-typed —
// so it can't silently drift out of sync with the terms of the deal.
export function computeCommissionTotal(commissionPct, commissionBasis) {
  const total = ((Number(commissionPct) || 0) / 100) * (Number(commissionBasis) || 0);
  return Math.round(total * 100) / 100;
}

// The flat amount billed per period for a commission contract.
export function commissionInstallment(value, payoutMonths) {
  const n = Number(payoutMonths) || 0;
  return n > 0 ? (Number(value) || 0) / n : 0;
}

// Replaces what used to be three duplicated inline calculations
// (HomeDashboard, FinanceDetail, ClientsList) — only retainers are ongoing
// recurring revenue; one-time and commission contracts are finite, however
// large, and however "active" the client still is.
export function computeMRR(clients) {
  return clients
    .filter((c) => c.status === "active" && (c.contract?.billingType || "retainer") === "retainer")
    .reduce((s, c) => s + (Number(c.contract?.value) || 0), 0);
}

export function billingTypeLabel(billingType = "retainer") {
  return { retainer: "Retainer", oneTime: "One-time", commission: "Commission" }[billingType] || "Retainer";
}

// What to call a contract's headline dollar figure — replaces every
// hardcoded "Monthly value" label, which was wrong for anything that isn't
// a retainer.
export function contractValueLabel(contract = {}) {
  const type = contract.billingType || "retainer";
  if (type === "oneTime") return "Project fee";
  if (type === "commission") return "Total commission";
  return "Monthly value";
}

export const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const AVATAR_COLORS = ["bg-emerald-700", "bg-teal-700", "bg-amber-700", "bg-rose-700", "bg-stone-700", "bg-cyan-700"];

export function colorForName(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * YYYY-MM-DD in the USER'S OWN timezone.
 *
 * Everything date-shaped in this app used `new Date().toISOString().slice(0,10)`,
 * which is the UTC date. For anyone east of UTC that is yesterday's date for
 * the first hours of every day — in IST (UTC+5:30), anything recorded between
 * midnight and 05:29 was filed under the previous day. Tasks logged late at
 * night landed on the wrong day, "due today" quietly meant "due yesterday",
 * and expenses entered after midnight hit the wrong date.
 *
 * Anchor conversions from a date STRING at local noon (see weekStart below) —
 * noon is far enough from both midnights that no offset can push it across a
 * day boundary.
 */
export function toDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const today = () => toDateKey();

/**
 * When the working day rolls over, for the things that get done late.
 *
 * Outreach, content and commenting regularly happen after midnight, and
 * calendar midnight is the wrong boundary for them: sending connections at
 * 1am on Tuesday is Monday's work, but a midnight rollover files it as
 * Tuesday — which breaks the streak for Monday (no activity recorded) AND
 * double-counts Tuesday. Both halves of that are wrong, and the streak is
 * the thing meant to reward actually doing the work.
 *
 * 6am is the cutoff: late enough to cover any realistic late-night session,
 * early enough that it can't swallow a genuine early start.
 */
export const WORK_DAY_START_HOUR = 6;

/**
 * The work-day key for a moment in time — the calendar date, except that
 * anything before 6am counts as the previous day.
 *
 * Deliberately separate from today(): invoices, expenses and due dates use
 * the real calendar, and an expense entered at 2am belongs to that calendar
 * date. Only the effort-tracking flows (outreach, content, commenting, and
 * the streak built on them) use this.
 */
export function workDayKey(date = new Date()) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (d.getHours() < WORK_DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return toDateKey(d);
}

/** Today, as the work day currently in progress. */
export const workToday = () => workDayKey();

// Monday-start week key (YYYY-MM-DD of that week's Monday) — used to bucket
// daily rows into weeks without pulling in a date library. Originally lived
// in lib/outreach.js (weekly outreach charts); promoted here once
// lib/recurrence.js needed the same "what week is this" logic for resetting
// weekly-cadence KPIs/tasks — one definition instead of two.
export function weekStart(date) {
  const d = new Date(date + "T12:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return toDateKey(d);
}

// Shared id generator so every part of the app (the data hook, modals that
// need the id before the store round-trips) produces ids the same way.
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Every place that builds an HTML email body needs this — centralised so it's
// not redefined (and potentially forgotten) per file.
export const escapeHtml = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The client's real, working portal link — computed from the current origin
// rather than stored on the client object, so it's automatically correct
// whatever domain the app happens to be running on (localhost in dev,
// dashboard.theedenlabs.com in prod) instead of ever going stale. App.jsx's
// mount-time routing check reads this same "/portal/:id" shape back out.
export const portalLinkFor = (client) => `${window.location.origin}/portal/${client.id}`;

export function addDays(dateStr, n) {
  // Noon-anchored so a DST shift or a UTC offset can't slide the result onto
  // an adjacent day.
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

// Local "YYYY-MM-DDTHH:mm" for datetime-local inputs, offset-corrected so the
// value the user sees matches their own clock rather than UTC.
export function nowLocalISO(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "Tue 12 Aug, 9:30 AM" — how scheduled posts read in lists.
export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

/**
 * "1st September 2026" — a date written the way a person says it out loud.
 *
 * Used where a date is READ rather than scanned: a budget's window, a
 * receivable's due date. Bare "2026-09-01" is fine in a dense table where
 * the eye is comparing columns, but as prose in a sentence it makes the
 * reader do the parsing.
 *
 * Parsed at noon so a YYYY-MM-DD string can't drift a day backwards in
 * timezones behind UTC — `new Date("2026-09-01")` is midnight UTC, which is
 * still 31 August in most of the Americas.
 */
export function formatLongDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  // 11th/12th/13th are the exception the mod-10 rule gets wrong.
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
  return `${day}${suffix} ${d.toLocaleDateString(undefined, { month: "long" })} ${d.getFullYear()}`;
}

// "in 3 days" / "2 days overdue" / "today" — used by tasks and renewals.
export function relativeDays(dateStr) {
  if (!dateStr) return null;
  const days = Math.round((new Date(dateStr) - new Date(today())) / 86400000);
  if (days === 0) return { days, label: "Today", overdue: false, soon: true };
  if (days < 0) return { days, label: `${Math.abs(days)}d overdue`, overdue: true, soon: true };
  if (days === 1) return { days, label: "Tomorrow", overdue: false, soon: true };
  return { days, label: `In ${days}d`, overdue: false, soon: days <= 7 };
}
