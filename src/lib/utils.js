// Cross-cutting helpers that more than one page needs. Anything used by a
// single component stays in that component's file.

export const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];

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

export const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const AVATAR_COLORS = ["bg-emerald-700", "bg-teal-700", "bg-amber-700", "bg-rose-700", "bg-stone-700", "bg-cyan-700"];

export function colorForName(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const today = () => new Date().toISOString().slice(0, 10);

// Shared id generator so every part of the app (the data hook, modals that
// need the id before the store round-trips) produces ids the same way.
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Every place that builds an HTML email body needs this — centralised so it's
// not redefined (and potentially forgotten) per file.
export const escapeHtml = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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

// "in 3 days" / "2 days overdue" / "today" — used by tasks and renewals.
export function relativeDays(dateStr) {
  if (!dateStr) return null;
  const days = Math.round((new Date(dateStr) - new Date(today())) / 86400000);
  if (days === 0) return { days, label: "Today", overdue: false, soon: true };
  if (days < 0) return { days, label: `${Math.abs(days)}d overdue`, overdue: true, soon: true };
  if (days === 1) return { days, label: "Tomorrow", overdue: false, soon: true };
  return { days, label: `In ${days}d`, overdue: false, soon: days <= 7 };
}
