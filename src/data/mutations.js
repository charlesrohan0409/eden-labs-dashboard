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
import { convertBetween } from "../lib/currency.js";

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
  // `orderedIds` is only ever the FILTERED list the user can see. The old
  // version reindexed those to 0..n and shoved every unseen task after them,
  // so reordering inside one category silently dragged every other category's
  // task to the bottom of the global order.
  //
  // Instead: lay every task out by current sortIndex, then drop the new order
  // into the slots the moving tasks already collectively occupied. Tasks that
  // weren't on screen keep their exact position relative to everything else.
  const moving = new Set(orderedIds);
  const all = [...d.tasks].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  const queue = [...orderedIds];
  const settled = all.map((t) => (moving.has(t.id) ? queue.shift() : t.id));
  settled.forEach((id, i) => {
    const t = d.tasks.find((x) => x.id === id);
    if (t) t.sortIndex = i * 10;
  });
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
// Addressed by metric id, not array position — see migrate.js. `ref` accepts
// an id; a number is still tolerated so nothing breaks if a caller is missed.
const findMetric = (c, ref) =>
  typeof ref === "number" ? c.delivery[ref] : c.delivery.find((m) => m.id === ref);

export function updateDelivery(d, id, ref, val) {
  const c = d.clients.find((x) => x.id === id);
  const m = c && findMetric(c, ref);
  if (m) m.current = Number(val) || 0;
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
      id: uid(),
      metric: metric.metric, target: Number(metric.target) || 0, current: 0, direction: metric.direction || "higher",
      cadence,
      // Seeded now for the same reason addTask seeds periodStart — correct
      // immediately, not just after the next load's applyRecurringResets.
      periodStart: periodStartFor(cadence),
    });
  }
  return d;
}
export function updateDeliveryMetric(d, id, ref, patch) {
  const c = d.clients.find((x) => x.id === id);
  const m = c && findMetric(c, ref);
  if (m) Object.assign(m, patch);
  return d;
}
export function deleteDeliveryMetric(d, id, ref) {
  const c = d.clients.find((x) => x.id === id);
  if (!c) return d;
  c.delivery = typeof ref === "number"
    ? c.delivery.filter((_, i) => i !== ref)
    : c.delivery.filter((m) => m.id !== ref);
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
  // Inbound enquiries carry a clientId too (an enquiry captured from that
  // client's own LinkedIn inbox). Left behind, they keep showing on the
  // inbound board and keep counting toward the dashboard's "needs a reply"
  // total for a client that no longer exists.
  if (Array.isArray(d.inbound)) d.inbound = d.inbound.filter((e) => e.clientId !== id);
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

// ---- inbound enquiries ----
// Someone messaged first. Kept apart from `contacts` on purpose — see
// lib/inbound.js for why replied-ness is a flag rather than a stage.
export function addInbound(d, e) {
  if (!Array.isArray(d.inbound)) d.inbound = [];
  d.inbound.push({
    id: uid(), channel: "linkedin", stage: "new", replied: false, repliedAt: "",
    clientId: null, receivedAt: today(), notes: "", ...e,
  });
  return d;
}
export function updateInbound(d, id, patch) {
  const e = (d.inbound || []).find((x) => x.id === id);
  if (e) Object.assign(e, patch);
  return d;
}
export function updateInboundStage(d, id, stage) {
  const e = (d.inbound || []).find((x) => x.id === id);
  if (e) e.stage = stage;
  return d;
}
// Stamped with WHEN, so "3 days to reply" is answerable later. Un-replying
// clears the stamp rather than leaving a misleading one behind.
export function toggleInboundReplied(d, id) {
  const e = (d.inbound || []).find((x) => x.id === id);
  if (!e) return d;
  e.replied = !e.replied;
  e.repliedAt = e.replied ? new Date().toISOString() : "";
  return d;
}
export function deleteInbound(d, id) {
  d.inbound = (d.inbound || []).filter((x) => x.id !== id);
  return d;
}
// An enquiry that turns into a real opportunity graduates onto the CRM board.
// The enquiry stays (closed) rather than being deleted — it's the record of
// where the lead came from, which is the whole point of tracking inbound.
export function convertInboundToLead(d, id) {
  const e = (d.inbound || []).find((x) => x.id === id);
  if (!e) return d;
  addContact(d, {
    name: e.name, company: "", title: e.headline || "",
    stage: "lead", source: `Inbound · ${e.channel}`,
    url: e.profileUrl || "", notes: e.message || "", email: "", phone: "",
    photoUrl: e.photoUrl || "", dealValue: e.dealValue || null,
    clientId: e.clientId || null, closedDate: null, addedDate: today(),
  });
  e.stage = "closed";
  e.convertedAt = new Date().toISOString();
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

// Reconciles scheduled posts against what Buffer says actually went out.
// `sent` is [{ bufferPostId, sentAt }] built from Buffer's own post list.
//
// Only ever moves scheduled -> published, never the reverse: Buffer is
// authoritative about "did this go out", but NOT about anything the owner
// subsequently did in this app, so a post manually marked published must not
// be dragged back because Buffer hasn't caught up.
export function syncPublishedFromBuffer(d, sent = []) {
  const byId = new Map(sent.filter((s) => s.bufferPostId).map((s) => [String(s.bufferPostId), s]));
  let changed = 0;
  d.posts.forEach((p) => {
    if (!p.bufferPostId || p.status === "published") return;
    const hit = byId.get(String(p.bufferPostId));
    if (!hit) return;
    p.status = "published";
    if (hit.sentAt) p.date = String(hit.sentAt).slice(0, 10);
    changed += 1;
  });
  return { data: d, changed };
}
export function addSwipe(d, s) {
  d.swipeFile.push({ id: uid(), ...s });
  return d;
}
export function deleteSwipe(d, id) {
  d.swipeFile = d.swipeFile.filter((x) => x.id !== id);
  return d;
}

// ---- commenting list (LinkedIn profiles to engage with, owner-only) ----
// Not CRM contacts — LEGACY_STAGE_MAP rewrites "contacted"/"replied" to
// "lead" on every migrate, so this outreach-engagement state can't live as a
// contact stage without being clobbered.
function normalizeProfileUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}
// Upserts rather than always pushing — the overlay button this comes from
// gets clicked more than once per profile (page re-renders, user re-clicks),
// and a whole-blob write has no unique constraint to lean on instead.
export function upsertCommentTarget(d, t) {
  if (!Array.isArray(d.commentTargets)) d.commentTargets = [];
  const key = normalizeProfileUrl(t.profileUrl);
  const existing = d.commentTargets.find((x) => normalizeProfileUrl(x.profileUrl) === key);
  if (existing) Object.assign(existing, t);
  else d.commentTargets.push({ id: uid(), inSearch: false, addedAt: today(), notes: "", ...t });
  return d;
}
export function updateCommentTarget(d, id, patch) {
  const t = (d.commentTargets || []).find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  return d;
}
export function deleteCommentTarget(d, id) {
  d.commentTargets = (d.commentTargets || []).filter((x) => x.id !== id);
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
// `rate` is the live USD->INR rate, needed when the expense and the account
// it left are in different currencies, and again when checking whether this
// spend pushed a budget over its limit.
export function addExpense(d, e, rate) {
  const convert = (amt, from, to) => convertBetween(amt, from, to, rate);
  const expense = { id: uid(), ...e };
  d.expenses.push(expense);
  const account = (d.accounts || []).find((a) => a.id === expense.accountId);
  if (account) {
    const native = Number(expense.nativeAmount ?? expense.amount) || 0;
    const debited = convertBetween(native, expense.currency || "USD", account.currency || "INR", rate);
    // On a debit account this lowers the balance; on a credit card the stored
    // balance IS the debt, so the same subtraction would wrongly reduce what's
    // owed — spending on a card increases it.
    const isCreditCard = account.type === "credit";
    account.balance = (Number(account.balance) || 0) + (isCreditCard ? debited : -debited);
    expense.settledFromAccountId = account.id;
    expense.settledAmount = debited;
  }

  logFinance(d, {
    type: "expense_recorded", title: expense.vendor || expense.category,
    description: `${expense.vendor || "Expense"}${account ? ` from ${account.name}` : ""}`,
    amount: -(Number(expense.nativeAmount ?? expense.amount) || 0),
    currency: expense.currency || "USD",
    meta: { category: expense.category, accountId: expense.accountId || null },
  });

  // A breach is only newsworthy the first time it happens in a period —
  // logging it on every subsequent spend would bury the moment it mattered.
  if (rate != null) {
    budgetsOver(d, expense.category, convert).forEach(({ budget, spent, over }) => {
      if (!over) return;
      const already = (d.financeLog || []).some(
        (l) => l.type === "budget_exceeded" && l.meta?.budgetId === budget.id && l.meta?.period === periodOf(budget)
      );
      if (already) return;
      logFinance(d, {
        type: "budget_exceeded", title: budget.category,
        description: `${budget.category} budget exceeded`,
        amount: spent - (Number(budget.limit) || 0), currency: budget.currency,
        meta: { budgetId: budget.id, period: periodOf(budget), limit: budget.limit, spent },
      });
    });
  }
  return d;
}

// The period key a budget is currently measuring, used to make "already
// logged this breach" a per-period question rather than a forever one.
function periodOf(budget) {
  const now = new Date();
  return budget.period === "yearly"
    ? String(now.getFullYear())
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
// `rate` is optional so callers that only touch fields that don't affect
// currency or settlement (nothing left today, but the shape matches
// addExpense/deleteExpense for the same reason) don't need to supply one.
//
// The account is re-settled around the edit rather than left alone: the
// previous version just did Object.assign, so editing an expense's amount
// changed every USD-facing total but left the account balance still
// reflecting the PRE-EDIT figure forever — a second, quieter version of the
// currency bug this same pass fixes in addExpense.
export function updateExpense(d, id, patch, rate) {
  const e = d.expenses.find((x) => x.id === id);
  if (!e) return d;

  const account = e.settledFromAccountId
    ? (d.accounts || []).find((a) => a.id === e.settledFromAccountId)
    : null;

  // Reverse using the amount that was ACTUALLY applied at settle time, not a
  // figure recomputed at today's rate — same principle deleteExpense already
  // follows, so an edit and a delete-then-recreate leave the account in the
  // same place.
  if (account && e.settledAmount != null) {
    const isCreditCard = account.type === "credit";
    account.balance = (Number(account.balance) || 0) - (isCreditCard ? Number(e.settledAmount) : -Number(e.settledAmount));
  }

  Object.assign(e, patch);

  if (account) {
    const native = Number(e.nativeAmount ?? e.amount) || 0;
    const debited = convertBetween(native, e.currency || "USD", account.currency || "INR", rate);
    const isCreditCard = account.type === "credit";
    account.balance = (Number(account.balance) || 0) + (isCreditCard ? debited : -debited);
    e.settledAmount = debited;
  }
  return d;
}
export function deleteExpense(d, id) {
  const expense = d.expenses.find((x) => x.id === id);
  // Reverse the balance effect using the amount actually applied, for the
  // same reason invoice reversal does: the FX rate may have moved since.
  if (expense?.settledFromAccountId && expense.settledAmount != null) {
    const account = (d.accounts || []).find((a) => a.id === expense.settledFromAccountId);
    if (account) {
      const isCreditCard = account.type === "credit";
      account.balance = (Number(account.balance) || 0) - (isCreditCard ? Number(expense.settledAmount) : -Number(expense.settledAmount));
    }
  }
  d.expenses = d.expenses.filter((x) => x.id !== id);
  return d;
}

// ---- finance activity log ----
// Every money event, in one chronological place. Balances tell you WHERE you
// are; this tells you HOW you got there — which is the difference between
// "why is this ₹4,000 off?" being answerable and not.
//
// Appended by the mutations themselves rather than by the UI, so an event
// can't be missed by a caller that forgot to log it.
function logFinance(d, entry) {
  if (!Array.isArray(d.financeLog)) d.financeLog = [];
  d.financeLog.push({ id: uid(), at: new Date().toISOString(), ...entry });
  // Unbounded growth would eventually be the same blob-size problem that
  // caused the bandwidth blowout, and nobody scrolls past a few hundred
  // events. Trim oldest-first.
  if (d.financeLog.length > 400) d.financeLog = d.financeLog.slice(-400);
  return d;
}

// A budget crossing its limit is a moment worth recording, but it isn't an
// action anyone takes — it's a side effect of a spend. Detected by comparing
// before/after around whatever just changed.
function budgetsOver(d, category, convert) {
  return (d.budgets || [])
    .filter((b) => b.category === category)
    .map((b) => {
      const now = new Date();
      const key = b.period === "yearly"
        ? String(now.getFullYear())
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const spent = (d.expenses || [])
        .filter((e) => e.category === b.category && String(e.date || "").startsWith(key))
        .reduce((sum, e) => {
          const amt = Number(e.nativeAmount ?? e.amount) || 0;
          const from = e.currency || "USD";
          return sum + (from === b.currency ? amt : convert(amt, from, b.currency));
        }, 0);
      return { budget: b, spent, over: spent > (Number(b.limit) || 0) };
    });
}

// ---- personal finance: accounts, outgoings, budgets ----
export function addAccount(d, a) {
  if (!Array.isArray(d.accounts)) d.accounts = [];
  const account = { id: uid(), type: "main", balance: 0, currency: "INR", ...a };
  d.accounts.push(account);
  return logFinance(d, {
    type: "account_added", title: account.name,
    description: `${account.name} added`,
    amount: Number(account.balance) || 0, currency: account.currency,
  });
}
export function updateAccount(d, id, patch) {
  const a = (d.accounts || []).find((x) => x.id === id);
  if (a) Object.assign(a, patch);
  return d;
}
export function deleteAccount(d, id) {
  d.accounts = (d.accounts || []).filter((x) => x.id !== id);
  // Outgoings pointed at a deleted account would otherwise render "paid from
  // <nothing>" forever with no way to fix it from the UI.
  d.outgoings = (d.outgoings || []).map((o) => (o.accountId === id ? { ...o, accountId: null } : o));
  return d;
}

export function addOutgoing(d, o) {
  if (!Array.isArray(d.outgoings)) d.outgoings = [];
  const item = {
    id: uid(), kind: "subscription", cadence: "monthly", currency: "INR",
    status: "active", lastPaidDate: "", ...o,
  };
  d.outgoings.push(item);
  return logFinance(d, {
    type: item.kind === "fixed" ? "bill_added" : "subscription_added",
    title: item.name,
    description: `${item.name} added — ${item.cadence}`,
    amount: Number(item.amount) || 0, currency: item.currency,
  });
}
export function updateOutgoing(d, id, patch) {
  const o = (d.outgoings || []).find((x) => x.id === id);
  if (o) Object.assign(o, patch);
  return d;
}
export function deleteOutgoing(d, id) {
  d.outgoings = (d.outgoings || []).filter((x) => x.id !== id);
  return d;
}
// Cancelled rather than deleted — a subscription you stopped in June is still
// the reason money left in May, so deleting it would quietly rewrite history
// in the expense list and every budget that counted it.
export function cancelOutgoing(d, id) {
  const o = (d.outgoings || []).find((x) => x.id === id);
  if (!o) return d;
  o.status = o.status === "cancelled" ? "active" : "cancelled";
  return logFinance(d, {
    type: o.status === "cancelled" ? "subscription_cancelled" : "subscription_resumed",
    title: o.name,
    description: `${o.name} ${o.status === "cancelled" ? "cancelled" : "resumed"}`,
    amount: Number(o.amount) || 0, currency: o.currency,
  });
}

// Books one payment of a recurring outgoing: writes the expense, rolls the
// renewal date forward, and decrements the linked account. This is the ONLY
// way a charge gets recorded — nothing fires on its own (see lib/finance.js).
// `advance` is passed in rather than imported so mutations.js stays free of
// date-math imports; the caller supplies the next date it already computed.
export function payOutgoing(d, id, { date, nextRenewal }) {
  const o = (d.outgoings || []).find((x) => x.id === id);
  if (!o) return d;
  const paidOn = date || today();
  d.expenses.push({
    id: uid(),
    category: o.category || "Software",
    vendor: o.name,
    amount: Number(o.amount) || 0,
    nativeAmount: Number(o.amount) || 0,
    currency: o.currency || "INR",
    date: paidOn,
    outgoingId: o.id,
  });
  o.lastPaidDate = paidOn;
  if (nextRenewal) o.nextRenewal = nextRenewal;
  // Money leaving a debit account lowers the balance; on a credit card it
  // raises what's owed, which is the same subtraction either way once the
  // card's balance is read as debt.
  const account = (d.accounts || []).find((a) => a.id === o.accountId);
  if (account) account.balance = (Number(account.balance) || 0) - (Number(o.amount) || 0);
  return logFinance(d, {
    type: "outgoing_paid", title: o.name,
    description: `${o.name} paid${account ? ` from ${account.name}` : ""}`,
    amount: -(Number(o.amount) || 0), currency: o.currency,
    meta: { category: o.category, accountId: o.accountId || null },
  });
}

// ---- expense categories ----
// Shared by expenses, budgets and recurring items. Renaming re-files every
// record that used the old name, rather than orphaning them: a budget whose
// category no longer matches any expense silently reads as zero spent, which
// is worse than either failing loudly or just following the rename.
export function addExpenseCategory(d, name) {
  const label = String(name || "").trim();
  if (!label) return d;
  if (!Array.isArray(d.expenseCategories)) d.expenseCategories = [];
  if (!d.expenseCategories.some((c) => c.toLowerCase() === label.toLowerCase())) {
    d.expenseCategories.push(label);
  }
  return d;
}
export function renameExpenseCategory(d, from, to) {
  const next = String(to || "").trim();
  if (!from || !next || from === next) return d;
  d.expenseCategories = (d.expenseCategories || []).map((c) => (c === from ? next : c));
  (d.expenses || []).forEach((e) => { if (e.category === from) e.category = next; });
  (d.outgoings || []).forEach((o) => { if (o.category === from) o.category = next; });
  (d.budgets || []).forEach((b) => { if (b.category === from) b.category = next; });
  return d;
}
// Records keep their category string after a delete — history shouldn't be
// rewritten because a label was retired. categoryOptions() re-adds it to the
// picker for any record still carrying it.
export function deleteExpenseCategory(d, name) {
  d.expenseCategories = (d.expenseCategories || []).filter((c) => c !== name);
  return d;
}

export function addBudget(d, b) {
  if (!Array.isArray(d.budgets)) d.budgets = [];
  const budget = { id: uid(), period: "monthly", currency: "INR", ...b };
  d.budgets.push(budget);
  return logFinance(d, {
    type: "budget_created", title: budget.category,
    description: `${budget.category} budget set — ${budget.period}`,
    amount: Number(budget.limit) || 0, currency: budget.currency,
    meta: { budgetId: budget.id },
  });
}
export function updateBudget(d, id, patch) {
  const b = (d.budgets || []).find((x) => x.id === id);
  if (b) Object.assign(b, patch);
  return d;
}
export function deleteBudget(d, id) {
  d.budgets = (d.budgets || []).filter((x) => x.id !== id);
  return d;
}
export function addInvoice(d, i) {
  d.invoices.push({ id: uid(), status: "pending", ...i });
  return d;
}
/**
 * Marks an invoice paid/unpaid and moves the money in the linked account.
 *
 * This is what makes getting paid actually show up in "My money" instead of
 * only in the invoice list. `rate` is the live USD->INR rate, passed in by the
 * caller because this file stays pure and can't fetch one.
 *
 * Reversal uses `settledAmount` — the exact figure that was added — rather
 * than recomputing from the invoice. The rate can move between marking an
 * invoice paid and un-marking it, and reversing at today's rate would leave
 * the balance permanently off by the difference.
 */
export function updateInvoiceStatus(d, id, status, rate) {
  const i = d.invoices.find((x) => x.id === id);
  if (!i) return d;

  const wasPaid = i.status === "paid";
  const nowPaid = status === "paid";
  i.status = status;
  if (wasPaid === nowPaid) return d;

  const accounts = d.accounts || [];

  if (nowPaid) {
    const account = accounts.find((a) => a.id === i.accountId);
    if (account) {
      const native = Number(i.nativeAmount ?? i.amount) || 0;
      const credited = convertBetween(native, i.currency || "USD", account.currency || "INR", rate);
      account.balance = (Number(account.balance) || 0) + credited;
      i.settledIntoAccountId = account.id;
      i.settledAmount = credited;
    }
    i.paidAt = today();
    logFinance(d, {
      type: "income_recorded",
      title: (d.clients || []).find((c) => c.id === i.clientId)?.name || "Invoice",
      description: `Invoice paid${i.settledIntoAccountId ? ` into ${(d.accounts || []).find((a) => a.id === i.settledIntoAccountId)?.name || "account"}` : ""}`,
      amount: Number(i.nativeAmount ?? i.amount) || 0,
      currency: i.currency || "USD",
      meta: { invoiceId: i.id, clientId: i.clientId || null },
    });
  } else {
    const account = accounts.find((a) => a.id === i.settledIntoAccountId);
    if (account && i.settledAmount != null) {
      account.balance = (Number(account.balance) || 0) - Number(i.settledAmount);
    }
    i.settledIntoAccountId = null;
    i.settledAmount = null;
    i.paidAt = "";
    logFinance(d, {
      type: "income_reversed",
      title: (d.clients || []).find((c) => c.id === i.clientId)?.name || "Invoice",
      description: "Invoice marked unpaid",
      amount: -(Number(i.nativeAmount ?? i.amount) || 0),
      currency: i.currency || "USD",
      meta: { invoiceId: i.id },
    });
  }
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
