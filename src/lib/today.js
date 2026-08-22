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
import { awaitingReply, waitingDays } from "./inbound.js";

const todayStr = () => new Date().toISOString().slice(0, 10);

// Severity drives ordering across every source, so an overdue invoice can
// outrank a task without the two needing to know about each other.
export const URGENCY = { overdue: 0, today: 1, soon: 2 };

// Every item kind maps to exactly one section. This is what stops the panel
// reading as one undifferentiated pile — a call and a bill are not the same
// KIND of thing to deal with, even when they're equally urgent, and mixing
// them made the whole list look interchangeable. Order here is the render
// order: today's fixed-time commitments first (a call can't be moved once
// it's on the calendar), then what's waiting on a reply, then work, then
// content, then money.
export const TODAY_GROUPS = [
  { id: "calls",   label: "Today's calls",  kinds: ["call"] },
  { id: "replies", label: "Needs a reply",  kinds: ["inbound"] },
  { id: "tasks",   label: "Tasks",          kinds: ["task"] },
  { id: "content", label: "Content",        kinds: ["post", "review"] },
  { id: "money",   label: "Money",          kinds: ["invoice", "money"] },
];
const GROUP_OF = Object.fromEntries(
  TODAY_GROUPS.flatMap((g) => g.kinds.map((k) => [k, g.id]))
);

function urgencyFromDays(d) {
  if (d === null || d === undefined) return null;
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 3) return "soon";
  return null;
}

/**
 * Everything needing attention, newest-urgency first within its group.
 * `limit` caps the list — a "today" view that shows forty things is a backlog,
 * not a plan. `calendarEvents` is optional (Google Calendar may not be
 * connected) and is expected to already be filtered to not-yet-ended events,
 * same shape useGoogleCalendar's `upcoming` returns.
 */
export function buildToday(data, { limit = 14, calendarEvents = [] } = {}) {
  if (!data) return [];
  const items = [];
  const clientName = (id) => data.clients?.find((c) => c.id === id)?.name || "";

  // ---- today's calls ----
  // Only TODAY's — a call three days out belongs in the calendar page, not
  // in "what needs me right now". A call that's already ended today doesn't
  // need anything further from you, so it isn't listed as needing attention
  // either; `calendarEvents` being pre-filtered to not-yet-ended handles that.
  const today = todayStr();
  (calendarEvents || []).forEach((e) => {
    const start = new Date(e.start);
    if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== today) return;
    items.push({
      id: `call-${e.uid}`, kind: "call", urgency: "today", days: 0,
      title: e.summary || "Meeting",
      context: e.allDay ? "All day" : start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      startMs: start.getTime(),
      view: "calendar",
    });
  });

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

  // ---- inbound enquiries awaiting a reply ----
  // These have no due date — they're urgent from the moment they arrive and
  // stay on the list until answered, which is the whole point of tracking
  // them separately from CRM leads.
  awaitingReply(data.inbound).forEach((e) => {
    const days = waitingDays(e.receivedAt) ?? 0;
    items.push({
      id: `inbound-${e.id}`, kind: "inbound",
      urgency: days >= 2 ? "overdue" : days >= 1 ? "today" : "soon",
      days: -days,
      title: `Reply to ${e.name || "an enquiry"}`,
      context: e.clientId ? clientName(e.clientId) : "Inbound",
      view: "crm",
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
      const da = a.days ?? 99, db = b.days ?? 99;
      if (da !== db) return da - db;
      // Ties within "today" (e.g. two calls) fall back to actual clock time.
      return (a.startMs ?? 0) - (b.startMs ?? 0);
    })
    .slice(0, limit);
}

export const groupIdFor = (kind) => GROUP_OF[kind] || "tasks";

export function dueLabel(item) {
  // The call's time already IS the context line (e.g. "2:30 PM") — repeating
  // it as a trailing label would just say the same thing twice.
  if (item.kind === "call") return "";
  // Inbound counts UP (how long they've waited), not down to a deadline.
  if (item.kind === "inbound") {
    const waited = Math.abs(item.days || 0);
    if (waited === 0) return "Just now";
    return waited === 1 ? "1 day waiting" : `${waited} days waiting`;
  }
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
