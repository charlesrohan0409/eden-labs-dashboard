// "What actually needs me today", pulled from every section at once.
//
// The dashboard is organised by nouns — Clients, Finance, Content — which is
// the right way to STORE things and the wrong way to start a day. Nothing
// previously answered "what's due", so the answer lived in the owner's head
// and in whichever tab they happened to open. This derives it instead.
//
// Purely derived, every time. Nothing here is stored, so there's no state to
// fall out of sync and no risk of a "today" list that disagrees with the data
// it came from.

import { relativeDays } from "./utils.js";
import { nextOccurrenceFor } from "./recurrence.js";
import { normalizeStatus } from "./content.js";
import { daysUntil } from "./finance.js";

const todayStr = () => new Date().toISOString().slice(0, 10);

// Severity drives ordering across every source, so an overdue invoice can
// outrank a task without the two needing to know about each other.
export const URGENCY = { overdue: 0, today: 1, soon: 2 };

function urgencyFromDays(d) {
  if (d === null || d === undefined) return null;
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 3) return "soon";
  return null;
}

/**
 * Everything needing attention, newest-urgency first.
 * `limit` caps the list — a "today" view that shows forty things is a backlog,
 * not a plan.
 */
export function buildToday(data, { limit = 12 } = {}) {
  if (!data) return [];
  const items = [];
  const clientName = (id) => data.clients?.find((c) => c.id === id)?.name || "";

  // ---- tasks ----
  // `recurrence` is a STRING and non-recurring tasks carry "none", not null —
  // so a truthiness check on it is always true. Getting that wrong made every
  // completed task reappear here as overdue (its old due date, surfaced via
  // nextOccurrenceFor's non-recurring passthrough). Compare to "none".
  const repeats = (t) => (t.recurrence || "none") !== "none";

  (data.tasks || []).forEach((t) => {
    if (t.done && !repeats(t)) return;
    const due = repeats(t) ? nextOccurrenceFor(t) : t.dueDate;
    if (!due) return;
    const d = daysUntil(due);
    const u = urgencyFromDays(d);
    if (!u) return;
    items.push({
      id: `task-${t.id}`, kind: "task", urgency: u, days: d,
      title: t.title,
      context: t.clientId ? clientName(t.clientId) : "Eden Labs",
      view: t.clientId ? "client" : "home",
      clientId: t.clientId || null,
    });
  });

  // ---- invoices ----
  (data.invoices || []).forEach((inv) => {
    if (inv.status === "paid") return;
    const d = daysUntil(inv.date);
    const u = urgencyFromDays(d);
    if (!u) return;
    items.push({
      id: `invoice-${inv.id}`, kind: "invoice", urgency: u, days: d,
      title: `Invoice ${inv.status === "overdue" ? "overdue" : "due"} — ${clientName(inv.clientId) || "client"}`,
      context: "Finance",
      view: "finance",
    });
  });

  // ---- scheduled content ----
  (data.posts || []).forEach((p) => {
    if (normalizeStatus(p.status) !== "scheduled" || !p.scheduledAt) return;
    const d = daysUntil(p.scheduledAt.slice(0, 10));
    const u = urgencyFromDays(d);
    if (!u) return;
    items.push({
      id: `post-${p.id}`, kind: "post", urgency: u, days: d,
      title: (p.content || "").split("\n")[0].slice(0, 70) || "Scheduled post",
      context: p.clientId ? clientName(p.clientId) : "Eden Labs",
      view: "content",
    });
  });

  // ---- posts waiting on a client ----
  (data.posts || []).forEach((p) => {
    if (normalizeStatus(p.status) !== "pending_review") return;
    items.push({
      id: `review-${p.id}`, kind: "review", urgency: "soon", days: null,
      title: `Waiting on ${clientName(p.clientId) || "client"} to approve`,
      context: "Content",
      view: "content",
    });
  });

  // ---- recurring money out ----
  (data.outgoings || []).forEach((o) => {
    if (o.status === "cancelled" || !o.nextRenewal) return;
    const d = daysUntil(o.nextRenewal);
    const u = urgencyFromDays(d);
    if (!u) return;
    items.push({
      id: `outgoing-${o.id}`, kind: "money", urgency: u, days: d,
      title: `${o.name} renews`,
      context: "Finance",
      view: "finance",
    });
  });

  return items
    .sort((a, b) => {
      const ua = URGENCY[a.urgency] - URGENCY[b.urgency];
      if (ua !== 0) return ua;
      return (a.days ?? 99) - (b.days ?? 99);
    })
    .slice(0, limit);
}

export function dueLabel(item) {
  if (item.days === null || item.days === undefined) return "";
  if (item.days < 0) return `${Math.abs(item.days)}d overdue`;
  if (item.days === 0) return "Today";
  if (item.days === 1) return "Tomorrow";
  return `In ${item.days}d`;
}

// ---------------------------------------------------------------- health ---
//
// Churn is rarely a surprise in hindsight — the signals are all already in
// this data, just never surfaced together. This looks for the ones that
// actually precede a client going quiet, and is deliberately conservative:
// it reports observations with reasons, not a score that implies precision
// nobody can justify.
export function clientSignals(client, data, now = new Date()) {
  const signals = [];
  const since = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((now - d) / 86400000);
  };

  const posts = (data.posts || []).filter((p) => p.clientId === client.id);
  const published = posts
    .filter((p) => normalizeStatus(p.status) === "published" && p.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const daysSincePost = published.length ? since(published[0].date) : null;

  if (daysSincePost === null && posts.length === 0) {
    signals.push({ level: "warn", text: "No content created yet" });
  } else if (daysSincePost !== null && daysSincePost > 21) {
    signals.push({ level: "bad", text: `Nothing published in ${daysSincePost} days` });
  } else if (daysSincePost !== null && daysSincePost > 10) {
    signals.push({ level: "warn", text: `Last post ${daysSincePost} days ago` });
  }

  const overdue = (data.invoices || []).filter(
    (i) => i.clientId === client.id && i.status !== "paid" && daysUntil(i.date) < 0
  );
  if (overdue.length) {
    signals.push({ level: "bad", text: `${overdue.length} unpaid invoice${overdue.length > 1 ? "s" : ""} past due` });
  }

  const calls = (data.calls || []).filter((c) => c.clientId === client.id && c.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const daysSinceCall = calls.length ? since(calls[0].date) : null;
  if (daysSinceCall !== null && daysSinceCall > 30) {
    signals.push({ level: "warn", text: `No call in ${daysSinceCall} days` });
  }

  const openTasks = (data.tasks || []).filter(
    (t) => t.clientId === client.id && !t.done && t.dueDate && daysUntil(t.dueDate) < 0
  );
  if (openTasks.length) {
    signals.push({ level: "warn", text: `${openTasks.length} overdue task${openTasks.length > 1 ? "s" : ""}` });
  }

  const worst = signals.some((s) => s.level === "bad") ? "bad"
    : signals.length ? "warn" : "ok";

  return { signals, level: worst };
}

export { relativeDays };
