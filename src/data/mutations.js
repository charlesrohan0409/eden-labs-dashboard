// Pure mutation functions — the actual logic behind every write the app
// makes, extracted out of useAppData.js so the exact same code runs in two
// places: the owner's browser (useAppData.js, for instant optimistic UI) and
// the server (api/data.js, api/portal-action.js — the source of truth once
// Supabase is involved). Every function takes the cloned draft `d` plus its
// arguments and returns `d`; nothing here touches React, fetch, or storage.
//
// This is what "one copy of the logic, not two" looks like for the mutation
// side, the same way api/_handlers.js is the one copy for third-party API
// calls.

import { today, uid, commissionInstallment } from "../lib/utils.js";
import { periodStartFor } from "../lib/recurrence.js";

const ensureActivityLog = (d) => {
  if (!Array.isArray(d.activityLog)) d.activityLog = [];
  return d;
};

// ---- tasks ----
export function addTask(d, t) {
  const recurrence = t.recurrence || "none";
  d.tasks.push({
    id: uid(), done: false, createdAt: today(), priority: "medium", clientId: null, dueDate: "",
    recurrence: "none", periodStart: "",
    ...t,
    // Seeded correctly now, rather than waiting for the next load's
    // applyRecurringResets to compute it — a just-created recurring task
    // shouldn't need a reload to be in the right state.
    periodStart: t.periodStart || periodStartFor(recurrence),
  });
  return d;
}
export function toggleTask(d, id) {
  const t = d.tasks.find((x) => x.id === id);
  if (t) t.done = !t.done;
  return d;
}
export function updateTask(d, id, patch) {
  const t = d.tasks.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  return d;
}
export function deleteTask(d, id) {
  d.tasks = d.tasks.filter((x) => x.id !== id);
  return d;
}
// Persists a manual drag-reorder. `orderedIds` is the new order of whatever
// subset the list actually rendered — which is the reason for the second half
// of this function: a filtered list (open-only, one client, one category)
// doesn't know where the tasks it *didn't* render belong, so reindexing only
// the visible ones would interleave the hidden ones unpredictably. Everything
// not in `orderedIds` keeps its relative order and gets slotted after.
//
// Dense integers rather than fractional indices: every write here rewrites
// the whole JSON blob anyway, so the usual "avoid touching N rows" argument
// for floats buys nothing, while float precision-exhaustion after repeated
// halving between the same pair would still be real. Gaps of 10 leave room to
// read the raw JSON and see what's going on.
export function reorderTasks(d, orderedIds) {
  const inOrder = new Set(orderedIds);
  const rest = d.tasks
    .filter((t) => !inOrder.has(t.id))
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  orderedIds.forEach((id, i) => {
    const t = d.tasks.find((x) => x.id === id);
    if (t) t.sortIndex = i * 10;
  });
  rest.forEach((t, i) => { t.sortIndex = (orderedIds.length + i) * 10; });
  return d;
}

// ---- clients ----
export function addClient(d, client) {
  d.clients.push(client);
  return d;
}
// The client's own profile fields (name, company, email, industry, service
// type, photo/logo) — separate from updateContract, which only ever touches
// the contract sub-object. There was no way to edit these after creation.
export function updateClient(d, id, patch) {
  const c = d.clients.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
  return d;
}
// Hides a client from the clients list and every client picker without
// touching their data — for an ended engagement you don't want to scroll
// past. Deliberately NOT a delete and NOT a status change: finance totals,
// invoices and history all still count them.
export function toggleClientHidden(d, id) {
  const c = d.clients.find((x) => x.id === id);
  if (c) c.hidden = !c.hidden;
  return d;
}
export function updateContract(d, id, contract) {
  const c = d.clients.find((x) => x.id === id);
  if (c) c.contract = contract;
  return d;
}
export function updateDelivery(d, id, idx, val) {
  const c = d.clients.find((x) => x.id === id);
  if (c && c.delivery[idx]) c.delivery[idx].current = val;
  return d;
}
// ---- custom KPIs (delivery metric definitions, not just their progress) ----
// Every client type ships with defaultDelivery metrics (seed.js), but those
// are just a starting template — this is what lets the owner add, rename,
// retarget, or remove KPIs per client so "on track" means whatever actually
// matters for that specific engagement.
export function addDeliveryMetric(d, id, metric) {
  const c = d.clients.find((x) => x.id === id);
  const cadence = metric.cadence || "none";
  if (c) {
    c.delivery.push({
      metric: metric.metric, target: Number(metric.target) || 0, current: 0, direction: metric.direction || "higher",
      cadence,
      // Seeded now for the same reason addTask seeds periodStart — correct
      // immediately, not just after the next load's applyRecurringResets.
      periodStart: periodStartFor(cadence),
    });
  }
  return d;
}
export function updateDeliveryMetric(d, id, idx, patch) {
  const c = d.clients.find((x) => x.id === id);
  if (c && c.delivery[idx]) Object.assign(c.delivery[idx], patch);
  return d;
}
export function deleteDeliveryMetric(d, id, idx) {
  const c = d.clients.find((x) => x.id === id);
  if (c) c.delivery = c.delivery.filter((_, i) => i !== idx);
  return d;
}
// Permanently removes a client and everything tied to them — distinct from
// endContract, which just flips status and keeps all history. Cascades
// across every collection that carries a clientId so nothing orphaned is
// left showing a client that no longer exists.
export function deleteClient(d, id) {
  d.clients = d.clients.filter((c) => c.id !== id);
  d.posts = d.posts.filter((p) => p.clientId !== id);
  d.dms = d.dms.filter((m) => m.clientId !== id);
  d.calls = d.calls.filter((c) => c.clientId !== id);
  d.invoices = d.invoices.filter((i) => i.clientId !== id);
  d.tasks = d.tasks.filter((t) => t.clientId !== id);
  d.contacts = d.contacts.filter((c) => c.clientId !== id);
  // Outreach and per-channel rows were being left behind — orphaned rows then
  // pollute any aggregate that isn't client-filtered.
  if (Array.isArray(d.outreachLog)) d.outreachLog = d.outreachLog.filter((e) => e.clientId !== id);
  if (Array.isArray(d.outreachByChannel)) d.outreachByChannel = d.outreachByChannel.filter((o) => o.clientId !== id);
  if (Array.isArray(d.activityLog)) d.activityLog = d.activityLog.filter((a) => a.clientId !== id);
  return d;
}
export function endContract(d, id, reason) {
  const c = d.clients.find((x) => x.id === id);
  if (c) {
    c.status = "ended";
    c.contract = { ...c.contract, status: "ended", endedAt: today(), endReason: reason || "" };
    ensureActivityLog(d).activityLog.push({
      id: uid(), clientId: id, type: "contract_ended",
      description: `Contract ended for ${c.name}${reason ? ` — ${reason}` : ""}`,
      at: new Date().toISOString(), changedBy: "owner", meta: { reason: reason || "" },
    });
  }
  return d;
}
export function updateClientNotes(d, id, text) {
  const c = d.clients.find((x) => x.id === id);
  if (c) c.notes = text;
  return d;
}

// ---- activity log ----
export function logActivity(d, entry) {
  ensureActivityLog(d).activityLog.push({ id: uid(), at: new Date().toISOString(), changedBy: "owner", meta: {}, ...entry });
  return d;
}

// ---- contacts / CRM ----
export function addContact(d, c) {
  d.contacts.push({ id: uid(), stage: "lead", ...c });
  return d;
}
export function updateStage(d, id, stage) {
  const c = d.contacts.find((x) => x.id === id);
  if (c) {
    c.stage = stage;
    c.closedDate = stage === "closed" ? today() : null;
  }
  return d;
}
// Patches any subset of a contact's fields — the edit modal on the CRM board
// (and the Chrome extension's "already saved, add more" case) both go
// through this rather than a dedicated setter per field.
export function updateContact(d, id, patch) {
  const c = d.contacts.find((x) => x.id === id);
  if (c) Object.assign(c, patch);
  return d;
}
export function deleteContact(d, id) {
  d.contacts = d.contacts.filter((x) => x.id !== id);
  return d;
}

// ---- content ----
export function addPost(d, p) {
  const post = { id: uid(), ...p };
  d.posts.push(post);
  if (p.clientId) {
    const client = d.clients.find((x) => x.id === p.clientId);
    ensureActivityLog(d).activityLog.push({
      id: uid(), clientId: p.clientId, type: "post_created",
      description: `New post drafted${client ? ` for ${client.name}` : ""}`,
      at: new Date().toISOString(), changedBy: "owner", meta: { postId: post.id },
    });
  }
  return d;
}
export function updatePost(d, id, patch) {
  const p = d.posts.find((x) => x.id === id);
  if (p) Object.assign(p, patch);
  return d;
}
export function updatePostStatus(d, id, status) {
  const p = d.posts.find((x) => x.id === id);
  if (p) {
    p.status = status;
    if (p.clientId) {
      const client = d.clients.find((x) => x.id === p.clientId);
      const LABELS = { pending_review: "pushed for approval", approved: "approved", published: "published", rejected: "rejected", draft: "moved to draft" };
      ensureActivityLog(d).activityLog.push({
        id: uid(), clientId: p.clientId, type: "post_status_changed",
        description: `Post ${LABELS[status] || status}${client ? ` (${client.name})` : ""}`,
        at: new Date().toISOString(), changedBy: "owner", meta: { postId: id, status },
      });
    }
  }
  return d;
}
export function deletePost(d, id) {
  d.posts = d.posts.filter((x) => x.id !== id);
  return d;
}
export function addSwipe(d, s) {
  d.swipeFile.push({ id: uid(), ...s });
  return d;
}
export function deleteSwipe(d, id) {
  d.swipeFile = d.swipeFile.filter((x) => x.id !== id);
  return d;
}
export function addDM(d, dm) {
  d.dms.push({ id: uid(), ...dm });
  if (dm.clientId) {
    const client = d.clients.find((x) => x.id === dm.clientId);
    ensureActivityLog(d).activityLog.push({
      id: uid(), clientId: dm.clientId, type: "dm_logged",
      description: `DM ${dm.direction}${client ? ` · ${client.name}` : ""}`,
      at: new Date().toISOString(), changedBy: "owner", meta: { direction: dm.direction },
    });
  }
  return d;
}
export function addComment(d, c) {
  d.comments.push({ id: uid(), ...c });
  return d;
}
export function deleteDM(d, id) {
  d.dms = d.dms.filter((x) => x.id !== id);
  return d;
}

// ---- finance ----
export function addExpense(d, e) {
  d.expenses.push({ id: uid(), ...e });
  return d;
}
export function updateExpense(d, id, patch) {
  const e = d.expenses.find((x) => x.id === id);
  if (e) Object.assign(e, patch);
  return d;
}
export function deleteExpense(d, id) {
  d.expenses = d.expenses.filter((x) => x.id !== id);
  return d;
}
export function addInvoice(d, i) {
  d.invoices.push({ id: uid(), status: "pending", ...i });
  return d;
}
export function updateInvoiceStatus(d, id, status) {
  const i = d.invoices.find((x) => x.id === id);
  if (i) i.status = status;
  return d;
}
export function deleteInvoice(d, id) {
  d.invoices = d.invoices.filter((x) => x.id !== id);
  return d;
}
// Bills every active client that has no invoice for `period` yet. Mutates
// `d.invoices` in place and returns the created/skipped counts rather than
// `d` itself — the one mutation here that has something to report back
// beyond the new state, so callers invoke it inside their own draft callback
// rather than through the uniform `M.fn(d, ...)` -> d pattern.
// Retainers get billed every period, same as always. One-time projects are
// billed manually (once, via "New invoice") — they're never picked up here.
// Commission deals get billed in installments (value/payoutMonths per
// period), counting the client's own invoices so far as "installments
// already paid," and stop generating once payoutMonths is reached.
export function generateInvoices(d, period) {
  const activeClients = d.clients.filter((c) => c.status === "active");
  const alreadyInvoiced = new Set(d.invoices.filter((i) => i.period === period).map((i) => i.clientId));
  const month = new Date(`${period}-01`).toLocaleDateString(undefined, { month: "long" });

  let created = 0;
  activeClients.forEach((c) => {
    if (alreadyInvoiced.has(c.id)) return;
    const billingType = c.contract?.billingType || "retainer";

    if (billingType === "oneTime") return; // manual-only

    if (billingType === "commission") {
      const payoutMonths = Number(c.contract?.payoutMonths) || 0;
      const paidSoFar = d.invoices.filter((i) => i.clientId === c.id).length;
      if (!payoutMonths || paidSoFar >= payoutMonths) return; // fully paid out
      const installment = commissionInstallment(c.contract.value, payoutMonths);
      d.invoices.push({
        id: uid(), clientId: c.id, amount: installment,
        // Auto-billing is USD-only by construction: this function is pure and
        // shared with the server, so it can't fetch an FX rate. Per-invoice
        // INR is a manual-invoice feature (see InvoiceModal). Emitted
        // explicitly rather than left to migrate so a fresh row is never
        // undefined-currency.
        currency: "USD", nativeAmount: installment, fxRate: 1,
        status: "pending", date: today(), period,
        description: `Commission installment ${paidSoFar + 1} of ${payoutMonths}`,
      });
      created++;
      return;
    }

    // retainer (default)
    d.invoices.push({
      id: uid(), clientId: c.id, amount: c.contract.value, status: "pending", date: today(), period,
      currency: "USD", nativeAmount: c.contract.value, fxRate: 1,
      description: `${month} retainer`,
    });
    created++;
  });

  return { created, skipped: activeClients.length - created };
}

// ---- profile & settings ----
export function updateProfile(d, patch) {
  d.profile = { ...d.profile, ...patch };
  return d;
}
export function setCurrency(d, currency) {
  d.settings = { ...d.settings, currency };
  return d;
}

// ---- misc ----
export function logGrowth(d, entry) {
  d.growthLog.push(entry);
  return d;
}
// ---- daily outreach tracking (LinkedIn + email funnels) ----
// One row per calendar day — logging again for a day that already has an
// entry overwrites it rather than adding a second row, since the whole
// point is a day-to-day running log, not a pile of same-day duplicates.
export function logOutreachDay(d, entry) {
  if (!Array.isArray(d.outreachLog)) d.outreachLog = [];
  // Keyed on (clientId, date), not date alone — the owner's own agency
  // outreach (clientId null) and each client's outreach are separate funnels,
  // and keying on date alone meant logging for one client silently
  // overwrote another's numbers for the same day.
  // `|| null` not `?? null`: the client <select>'s "agency" option is "".
  const clientId = entry.clientId || null;
  const idx = d.outreachLog.findIndex((x) => x.date === entry.date && (x.clientId || null) === clientId);
  if (idx >= 0) d.outreachLog[idx] = { ...d.outreachLog[idx], ...entry, clientId };
  else d.outreachLog.push({ id: uid(), ...entry, clientId });
  return d;
}
export function deleteOutreachDay(d, id) {
  d.outreachLog = (d.outreachLog || []).filter((x) => x.id !== id);
  return d;
}
export function toggleIntegration(d, id) {
  const i = d.integrations.find((x) => x.id === id);
  if (i) i.connected = !i.connected;
  return d;
}
export function setFathomConnected(d) {
  const i = d.integrations.find((x) => x.id === "fathom");
  if (i) { i.connected = true; i.lastCheckedAt = today(); }
  return d;
}
export function setFathomDisconnected(d) {
  const i = d.integrations.find((x) => x.id === "fathom");
  if (i) i.connected = false;
  return d;
}
export function setBufferChannels(d, channels) {
  const i = d.integrations.find((x) => x.id === "buffer");
  if (i) {
    i.channels = channels;
    i.connected = channels.length > 0;
    i.lastCheckedAt = today();
  }
  return d;
}
export function setBufferDisconnected(d) {
  const i = d.integrations.find((x) => x.id === "buffer");
  if (i) { i.connected = false; i.channels = []; }
  return d;
}
export function setAgencyBufferChannel(d, channelId) {
  const i = d.integrations.find((x) => x.id === "buffer");
  if (i) i.agencyChannelId = channelId || null;
  return d;
}
