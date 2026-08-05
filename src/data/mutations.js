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

import { today, uid } from "../lib/utils.js";

const ensureActivityLog = (d) => {
  if (!Array.isArray(d.activityLog)) d.activityLog = [];
  return d;
};

// ---- tasks ----
export function addTask(d, t) {
  d.tasks.push({ id: uid(), done: false, createdAt: today(), priority: "medium", clientId: null, dueDate: "", ...t });
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

// ---- clients ----
export function addClient(d, client) {
  d.clients.push(client);
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

// ---- finance ----
export function addExpense(d, e) {
  d.expenses.push({ id: uid(), ...e });
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
// Bills every active client that has no invoice for `period` yet. Mutates
// `d.invoices` in place and returns the created/skipped counts rather than
// `d` itself — the one mutation here that has something to report back
// beyond the new state, so callers invoke it inside their own draft callback
// rather than through the uniform `M.fn(d, ...)` -> d pattern.
export function generateInvoices(d, period) {
  const activeClients = d.clients.filter((c) => c.status === "active");
  const alreadyInvoiced = new Set(d.invoices.filter((i) => i.period === period).map((i) => i.clientId));
  const toCreate = activeClients.filter((c) => !alreadyInvoiced.has(c.id));
  toCreate.forEach((c) => {
    d.invoices.push({ id: uid(), clientId: c.id, amount: c.contract.value, status: "pending", date: today(), period });
  });
  return { created: toCreate.length, skipped: activeClients.length - toCreate.length };
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
