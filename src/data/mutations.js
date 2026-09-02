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
  // Four collections gained a clientId when the extension was opened to
  // client profiles and campaigns were added. Left behind they are
  // unreachable from every UI (each filters by clientId) but still
  // re-serialised on every save — invisible, undeletable blob growth.
  if (Array.isArray(d.leadLists)) d.leadLists = d.leadLists.filter((l) => l.clientId !== id);
  if (Array.isArray(d.scripts)) d.scripts = d.scripts.filter((x) => x.clientId !== id);
  if (Array.isArray(d.swipeFile)) d.swipeFile = d.swipeFile.filter((x) => x.clientId !== id);
  if (Array.isArray(d.commentTargets)) d.commentTargets = d.commentTargets.filter((t) => t.clientId !== id);
  if (Array.isArray(d.commentLog)) d.commentLog = d.commentLog.filter((c) => c.clientId !== id);
  if (Array.isArray(d.swipeFolders)) d.swipeFolders = d.swipeFolders.filter((f) => f.clientId !== id);
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
    // WHEN each stage was first reached, not just where the lead is now.
    //
    // Only `closed` was ever dated, which meant "how many calls did I book
    // last week" had no answer from the CRM at all — the Growth page fell
    // back to the hand-typed outreach tally and reported 0 while two leads
    // sat in Call booked. A stage is a fact with a date; storing only the
    // current position throws the date away.
    //
    // First-reached, not last-set: a lead that goes to Call booked, slips
    // back to Lead, then forward again booked ONE call, and re-stamping
    // would move that call into whichever week the lead last bounced.
    if (!c.stageDates) c.stageDates = {};
    if (!c.stageDates[stage]) c.stageDates[stage] = today();
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
  d.swipeFile.push({ id: uid(), clientId: null, ...s });
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
  const clientId = t.clientId || null;
  // Deduped per (clientId, profileUrl), not by URL alone. The same person can
  // legitimately sit on the agency's list AND a client's — they're different
  // people engaging from different accounts — and a URL-only key would have
  // let one silently overwrite the other's row.
  const existing = d.commentTargets.find(
    (x) => normalizeProfileUrl(x.profileUrl) === key && (x.clientId || null) === clientId
  );
  if (existing) Object.assign(existing, t);
  else d.commentTargets.push({ id: uid(), inSearch: false, addedAt: today(), notes: "", ...t, clientId });
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
/**
 * Puts back a payment that shouldn't have happened.
 *
 * "Mark paid" sits one careless click away from moving real money, and until
 * now there was no way back — an accidental tick on a card bill silently
 * reduced a bank balance and a card debt with nothing to reverse it. Every
 * money-moving action needs a way out, and reversal beats a confirmation
 * dialog: confirmations get clicked through, and they punish the 99 correct
 * presses to guard the one wrong one.
 *
 * Reverses from the RECORDED `lastPayment` rather than recomputing what it
 * assumes happened. If the amount, account or card has been edited since,
 * a recomputed reversal would move the wrong sum to the wrong place — the
 * exact failure that makes an undo worse than no undo. Nothing to reverse
 * means nothing happens, so a double-click can't refund twice.
 */
export function undoOutgoingPayment(d, id) {
  const o = (d.outgoings || []).find((x) => x.id === id);
  const p = o?.lastPayment;
  if (!o || !p) return d;

  // Put the money back where it came from.
  const account = (d.accounts || []).find((a) => a.id === p.accountId);
  if (account) {
    // Falls back to p.amount for payments recorded before the converted
    // figures were stored — imperfect for those, but better than nothing.
    const back = Number(p.debitedFromAccount ?? p.amount) || 0;
    account.balance = (Number(account.balance) || 0) + (account.type === "credit" ? -back : back);
  }

  // And restore the debt that was paid down.
  const card = (d.accounts || []).find((a) => a.id === p.paysDownAccountId);
  if (card) card.balance = (Number(card.balance) || 0) + (Number(p.creditedToCard ?? p.amount) || 0);

  // Remove the expense this payment booked. Card payments never booked one
  // (they are transfers), so expenseId is null there and nothing is removed.
  if (p.expenseId) d.expenses = (d.expenses || []).filter((e) => e.id !== p.expenseId);

  // And the receivable a shared bill raised. Left behind, it would show the
  // other person still owing their half of a payment that no longer exists.
  if (p.splitLoanId) d.loans = (d.loans || []).filter((l) => l.id !== p.splitLoanId);

  o.lastPaidDate = p.prevLastPaidDate || "";
  o.lastPaidAmount = p.prevLastPaidAmount ?? null;
  if (p.prevNextRenewal) o.nextRenewal = p.prevNextRenewal;
  delete o.lastPayment;

  return logFinance(d, {
    type: "payment_undone",
    title: o.name,
    description: `Reversed — ${o.name}${account ? ` back into ${account.name}` : ""}`,
    // Positive: money returning. The activity feed reads signs literally.
    amount: Number(p.amount) || 0,
    currency: o.currency,
    meta: { outgoingId: o.id, accountId: p.accountId || null },
  });
}

// `gmailMessageId` is the idempotency key when this payment came from a bank
// alert rather than a click. An ordinary expense carries it on the expense
// row itself, which is what stops a re-sync filing the same debit twice — but
// a CARD payment books no expense at all, so there would be no row to carry
// it, and every re-sync would pay the card down again. Recorded here and in
// the log entry so both paths have somewhere to look.
export function payOutgoing(d, id, { date, nextRenewal, amount, rate, gmailMessageId } = {}) {
  const o = (d.outgoings || []).find((x) => x.id === id);
  if (!o) return d;
  const paidOn = date || today();
  // A card statement is never the same twice, so the amount paid can differ
  // from the recurring figure. Falls back to the stored amount for ordinary
  // subscriptions, where it genuinely is fixed.
  const paid = Number(amount ?? o.amount) || 0;

  // A CREDIT-CARD PAYMENT IS A TRANSFER, NOT AN EXPENSE.
  //
  // This is the trap. The purchases that built the card balance were
  // already recorded as expenses when they happened — that is what put the
  // debt on the card. Recording the statement payment as a second expense
  // would count the same spending twice: once as "dinner", again as "credit
  // card bill", inflating total costs, every category budget and the P&L.
  //
  // So a card payment moves money between two accounts it already knows
  // about — bank down, card debt down — and books no expense at all.
  const isCardPayment = !!o.paysDownAccountId;

  // A SHARED BILL IS NOT ALL YOUR COST.
  //
  // Charles pays the whole ₹6,100 electricity bill and his brother pays him
  // back half. The full amount really does leave the account — so the bank
  // balance must fall by all of it — but only his share is an expense. Book
  // the whole thing and his Utilities budget reads double what the bill
  // actually costs him; book only his half and the account stops matching
  // the bank. So: full debit, half expense, half recorded as owed back.
  const share = Number(o.splitShare);
  const hasSplit = !isCardPayment && share > 0 && share < 1;
  const round2 = (n) => Math.round(n * 100) / 100;
  const ownCost = hasSplit ? round2(paid * share) : paid;
  const owedBack = hasSplit ? round2(paid - ownCost) : 0;

  let bookedExpenseId = null;
  if (!isCardPayment) {
    bookedExpenseId = uid();
    d.expenses.push({
      id: bookedExpenseId,
      category: o.category || "Software",
      vendor: o.name,
      // `amount` is the USD snapshot every aggregate sums — total costs, the
      // cost chart, the dashboard, the month report. It was being set to the
      // RAW figure in the subscription's own currency, so a ₹1,500 renewal
      // wrote amount: 1500 and every one of those totals read it as $1,500 —
      // then money() multiplied it back out for display, showing roughly ₹1.3
      // lakh for a ₹1,500 charge. Exactly the bug already fixed for
      // hand-entered expenses, never applied to this path.
      amount: convertBetween(ownCost, o.currency || "INR", "USD", rate),
      fxRate: (o.currency || "INR") === "USD" ? 1 : rate,
      nativeAmount: ownCost,
      currency: o.currency || "INR",
      date: paidOn,
      // Inherited, not defaulted. A personal subscription's charge is a
      // personal expense — without this the business book would silently
      // absorb every personal renewal the moment it was marked paid, which
      // is exactly the blending the two books exist to prevent.
      book: o.book === "personal" ? "personal" : "business",
      outgoingId: o.id,
      ...(gmailMessageId ? { gmailMessageId } : {}),
    });
  }

  // Everything needed to put this back exactly as it was. Recorded rather
  // than reconstructed: an undo that recomputes what it thinks happened
  // will eventually disagree with what actually happened (a changed amount,
  // a since-edited account), and a wrong reversal is worse than none.
  // Captured BEFORE anything is overwritten, so undo can restore them.
  const prevLastPaidDate = o.lastPaidDate || "";
  const prevLastPaidAmount = o.lastPaidAmount ?? null;
  const prevNextRenewal = o.nextRenewal || "";

  // The funding account.
  //
  // Converted into the ACCOUNT's currency — this was subtracting the raw
  // figure, so a $20 subscription paid from a rupee account took ₹20 off
  // instead of ~₹1,700, and a ₹1,500 one paid from a dollar account took
  // $1,500. Every other money path in this file already converts; this one
  // was missed.
  //
  // And the credit-card sign: on a card the stored balance IS the debt, so
  // putting a subscription on a card must INCREASE it. A flat subtraction
  // reduced the debt instead — the app crediting you for spending money.
  const account = (d.accounts || []).find((a) => a.id === o.accountId);
  let debited = 0;
  if (account) {
    debited = convertBetween(paid, o.currency || "INR", account.currency || "INR", rate);
    account.balance = (Number(account.balance) || 0) + (account.type === "credit" ? debited : -debited);
  }

  // The other person's share, recorded as owed back.
  //
  // Pushed directly rather than through addLoan, which debits the funding
  // account — the money already left above, as part of the full bill. Going
  // through addLoan would take it out twice.
  let splitLoanId = null;
  if (hasSplit && owedBack > 0) {
    if (!Array.isArray(d.loans)) d.loans = [];
    splitLoanId = uid();
    d.loans.push({
      id: splitLoanId,
      person: o.splitWith || "Shared",
      reason: `${o.name} — their share`,
      amount: owedBack,
      currency: o.currency || "INR",
      date: paidOn,
      dueDate: "",
      status: "outstanding",
      book: o.book === "business" ? "business" : "personal",
      notes: `Half of ${o.name} paid ${paidOn}. The full ${paid} left ${account ? account.name : "the account"}; only ${ownCost} is your cost.`,
      accountId: "",
      fromOutgoingId: o.id,
    });
  }

  // The card being paid down. Its stored balance IS the debt, so paying it
  // SUBTRACTS — the opposite sign to a purchase on the same card.
  const card = isCardPayment
    ? (d.accounts || []).find((a) => a.id === o.paysDownAccountId)
    : null;
  let creditedToCard = 0;
  if (card) {
    creditedToCard = convertBetween(paid, o.currency || "INR", card.currency || "INR", rate);
    card.balance = Math.max(0, (Number(card.balance) || 0) - creditedToCard);
  }

  // Recorded here, after the balance work, because it stores the amounts
  // ACTUALLY applied — which don't exist until the conversions above have
  // run. Undo replays these rather than re-converting at a later rate, so a
  // reversal nets to exactly zero instead of leaving drift behind.
  o.lastPayment = {
    date: paidOn,
    amount: paid,
    debitedFromAccount: debited,
    creditedToCard,
    accountId: o.accountId || null,
    paysDownAccountId: o.paysDownAccountId || null,
    expenseId: bookedExpenseId,
    splitLoanId,
    gmailMessageId: gmailMessageId || null,
    prevLastPaidDate,
    prevLastPaidAmount,
    prevNextRenewal,
  };
  o.lastPaidDate = paidOn;
  o.lastPaidAmount = paid;
  if (nextRenewal) o.nextRenewal = nextRenewal;

  return logFinance(d, {
    type: isCardPayment ? "card_payment" : "outgoing_paid",
    title: o.name,
    description: isCardPayment
      ? `${o.name} — ${account ? `${account.name} → ` : ""}${card ? card.name : "card"} (transfer, not an expense)`
      : `${o.name} paid${account ? ` from ${account.name}` : ""}`
        + (hasSplit ? ` — ${ownCost} yours, ${owedBack} owed back by ${o.splitWith || "the other half"}` : ""),
    amount: -paid, currency: o.currency,
    meta: {
      category: o.category, accountId: o.accountId || null,
      paysDownAccountId: o.paysDownAccountId || null,
      gmailMessageId: gmailMessageId || null,
      splitLoanId,
    },
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

// ---- money lent out ----
// Only the MANUAL side lives here. An overdue client invoice is also money
// owed to you, but it already exists as an invoice — lib/finance.js derives
// it at read time rather than copying it into this collection, so the two
// can never drift apart. See buildReceivables.
export function addLoan(d, l, rate) {
  if (!Array.isArray(d.loans)) d.loans = [];
  const loan = {
    id: uid(), person: "", reason: "", amount: 0, currency: "INR",
    date: today(), dueDate: "", status: "outstanding", book: "personal",
    notes: "", accountId: "", ...l,
  };
  d.loans.push(loan);

  // The money has actually left the account. Lending is a real withdrawal —
  // the balance is wrong until this happens, and a receivable list that
  // didn't move the money would have you reconciling a bank app against a
  // dashboard that quietly disagrees with it.
  //
  // Converted into the ACCOUNT's currency, same as addExpense: lending
  // ₹20,000 out of a USD account must not subtract 20,000 dollars.
  const account = (d.accounts || []).find((a) => a.id === loan.accountId);
  if (account) {
    const debited = convertBetween(
      Number(loan.amount) || 0, loan.currency || "INR", account.currency || "INR", rate
    );
    // On a credit card the stored balance IS the debt, so money going out
    // increases it — the same sign rule addExpense uses.
    account.balance = (Number(account.balance) || 0) + (account.type === "credit" ? debited : -debited);
    loan.lentFromAccountId = account.id;
    loan.lentAmount = debited;
  }

  return logFinance(d, {
    type: "loan_added", title: loan.person,
    description: `Lent to ${loan.person}${loan.reason ? ` — ${loan.reason}` : ""}${account ? ` from ${account.name}` : ""}`,
    // Negative: the money has left, even though it's expected back. Showing
    // it as a positive here would read as income in the activity feed.
    amount: -(Number(loan.amount) || 0), currency: loan.currency,
    meta: { loanId: loan.id, accountId: loan.accountId || null },
  });
}

export function updateLoan(d, id, patch) {
  const l = (d.loans || []).find((x) => x.id === id);
  if (l) Object.assign(l, patch);
  return d;
}

/**
 * Deletes a loan, putting back any money it took out.
 *
 * Deleting is how a mis-typed entry gets removed, so it has to undo the
 * withdrawal too — otherwise correcting a typo would permanently leave the
 * account short by the wrong amount, with no record left to explain it.
 * Only for a loan still outstanding: a settled one has already been
 * reversed by settleLoan, and reversing it twice would invent money.
 */
export function deleteLoan(d, id) {
  const l = (d.loans || []).find((x) => x.id === id);
  if (l && l.status !== "settled" && l.lentFromAccountId) {
    const account = (d.accounts || []).find((a) => a.id === l.lentFromAccountId);
    if (account) {
      const amount = Number(l.lentAmount) || 0;
      account.balance = (Number(account.balance) || 0) + (account.type === "credit" ? -amount : amount);
    }
  }
  d.loans = (d.loans || []).filter((x) => x.id !== id);
  return d;
}

/**
 * Marks a loan repaid and puts the money back in an account.
 *
 * Settled rather than deleted, for the same reason a cancelled subscription
 * is kept: the money really did leave and come back, and erasing the record
 * would leave an unexplained pair of balance movements.
 */
export function settleLoan(d, id, { date, accountId, rate } = {}) {
  const l = (d.loans || []).find((x) => x.id === id);
  if (!l || l.status === "settled") return d;
  l.status = "settled";
  l.settledDate = date || today();
  // Back into whichever account it came out of, unless told otherwise.
  const account = (d.accounts || []).find(
    (a) => a.id === (accountId || l.lentFromAccountId || l.accountId)
  );
  if (account) {
    // `lentAmount` is what was ACTUALLY debited, already in this account's
    // currency and frozen at the rate on the day it was lent. Reusing it
    // means the round trip nets to exactly zero; re-converting at today's
    // rate would leave a phantom gain or loss on the balance every time a
    // cross-currency loan was repaid.
    const credited = account.id === l.lentFromAccountId && l.lentAmount != null
      ? Number(l.lentAmount) || 0
      : convertBetween(Number(l.amount) || 0, l.currency || "INR", account.currency || "INR", rate);
    account.balance = (Number(account.balance) || 0) + (account.type === "credit" ? -credited : credited);
    l.settledIntoAccountId = account.id;
  }
  return logFinance(d, {
    type: "loan_settled", title: l.person,
    description: `${l.person} repaid${account ? ` into ${account.name}` : ""}`,
    amount: Number(l.amount) || 0, currency: l.currency,
    meta: { loanId: l.id },
  });
}

export function addBudget(d, b) {
  if (!Array.isArray(d.budgets)) d.budgets = [];
  // Stamped so the budget can't count spending that happened before it
  // existed — see budgetWindow. Spread last so an explicit createdAt (a
  // re-import, a test) still wins.
  const budget = { id: uid(), period: "monthly", currency: "INR", createdAt: today(), ...b };
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

// ---- daily outreach tracking (LinkedIn + email funnels) ----
// One row per calendar day — logging again for a day that already has an
// entry overwrites it rather than adding a second row, since the whole
// point is a day-to-day running log, not a pile of same-day duplicates.
// ---- saved-content folders ----
export function addSwipeFolder(d, folder) {
  if (!Array.isArray(d.swipeFolders)) d.swipeFolders = [];
  d.swipeFolders.push({ id: uid(), clientId: null, name: "", color: "stone", createdAt: today(), ...folder });
  return d;
}
export function updateSwipeFolder(d, id, patch) {
  const f = (d.swipeFolders || []).find((x) => x.id === id);
  if (f) { const { id: _i, clientId: _c, ...safe } = patch || {}; Object.assign(f, safe); }
  return d;
}
export function deleteSwipeFolder(d, id) {
  d.swipeFolders = (d.swipeFolders || []).filter((f) => f.id !== id);
  // The saved posts themselves survive — they're the thing of value. They
  // fall back to uncategorised rather than being deleted along with a
  // grouping decision.
  (d.swipeFile || []).forEach((sw) => { if (sw.folderId === id) sw.folderId = null; });
  return d;
}
export function moveSwipeToFolder(d, swipeId, folderId) {
  const sw = (d.swipeFile || []).find((x) => x.id === swipeId);
  if (sw) sw.folderId = folderId || null;
  return d;
}

// ---- rest days ----
// A blocked day isn't a missed day. Without this, taking a deliberate Sunday
// off looks identical to forgetting, which makes the whole record something
// to avoid rather than something to read.
export function toggleRestDate(d, date) {
  const rest = d.settings?.rest || { weekly: [0], dates: [] };
  const dates = Array.isArray(rest.dates) ? rest.dates : [];
  d.settings = {
    ...d.settings,
    rest: {
      ...rest,
      dates: dates.includes(date) ? dates.filter((x) => x !== date) : [...dates, date],
    },
  };
  return d;
}

export function setRestWeekdays(d, weekly) {
  const rest = d.settings?.rest || { weekly: [0], dates: [] };
  d.settings = { ...d.settings, rest: { ...rest, weekly: Array.isArray(weekly) ? weekly : [] } };
  return d;
}

// ---- commenting log ----
// Upserted on (clientId, date) rather than appended: unlike outreach, which
// can legitimately span several lead lists in a day, commenting is one
// session's tally. Logging twice for the same day should correct the number,
// not double it.
export function logComments(d, { clientId = null, date, count, minutes, notes } = {}) {
  if (!Array.isArray(d.commentLog)) d.commentLog = [];
  const day = date || today();
  const cid = clientId || null;
  const existing = d.commentLog.find((c) => c.date === day && (c.clientId || null) === cid);
  const patch = {
    ...(count != null ? { count: Number(count) || 0 } : {}),
    ...(minutes != null ? { minutes: Number(minutes) || 0 } : {}),
    ...(notes != null ? { notes } : {}),
  };
  if (existing) Object.assign(existing, patch);
  else d.commentLog.push({ id: uid(), clientId: cid, date: day, count: 0, minutes: 0, notes: "", ...patch });
  return d;
}

/** One tap = one more comment on today's tally. The extension's fast path. */
export function bumpComments(d, { clientId = null, date, by = 1 } = {}) {
  if (!Array.isArray(d.commentLog)) d.commentLog = [];
  const day = date || today();
  const cid = clientId || null;
  const existing = d.commentLog.find((c) => c.date === day && (c.clientId || null) === cid);
  if (existing) existing.count = Math.max(0, (Number(existing.count) || 0) + by);
  else d.commentLog.push({ id: uid(), clientId: cid, date: day, count: Math.max(0, by), minutes: 0, notes: "" });
  return d;
}

export function deleteCommentLog(d, id) {
  d.commentLog = (d.commentLog || []).filter((c) => c.id !== id);
  return d;
}

// ---- lead lists (outreach campaigns) ----
export function addLeadList(d, list) {
  if (!Array.isArray(d.leadLists)) d.leadLists = [];
  d.leadLists.push({
    id: uid(), clientId: null, channel: "linkedin", niche: "",
    status: "active", startedAt: today(), endedAt: "", notes: "",
    ...list,
  });
  return d;
}
export function updateLeadList(d, id, patch) {
  const l = (d.leadLists || []).find((x) => x.id === id);
  if (l) {
    Object.assign(l, patch);
    // Stamp the end date the moment it stops running, so "how long did this
    // list take to burn through" is answerable later without guessing.
    if (patch.status && patch.status !== "active" && !l.endedAt) l.endedAt = today();
    if (patch.status === "active") l.endedAt = "";
  }
  return d;
}
export function deleteLeadList(d, id) {
  d.leadLists = (d.leadLists || []).filter((x) => x.id !== id);
  // The entries themselves are NOT deleted — they're real activity that
  // happened. They fall back to "Unassigned", the same place pre-list history
  // sits, rather than silently vanishing from the totals.
  (d.outreachLog || []).forEach((e) => { if (e.listId === id) e.listId = null; });
  (d.contacts || []).forEach((c) => { if (c.listId === id) c.listId = null; });
  return d;
}

// ---- scripts (DM templates) ----
export function addScript(d, script) {
  if (!Array.isArray(d.scripts)) d.scripts = [];
  d.scripts.push({
    id: uid(), clientId: null, channel: "linkedin", body: "",
    status: "active", createdAt: today(), notes: "",
    ...script,
  });
  return d;
}
export function updateScript(d, id, patch) {
  const sc = (d.scripts || []).find((x) => x.id === id);
  if (sc) Object.assign(sc, patch);
  return d;
}
export function deleteScript(d, id) {
  d.scripts = (d.scripts || []).filter((x) => x.id !== id);
  (d.outreachLog || []).forEach((e) => { if (e.scriptId === id) e.scriptId = null; });
  // Contacts too — addRepliedLeads stamps scriptId onto them, and deleting
  // the script without clearing it left them pointing at nothing. Silently
  // broke "trace a won deal back to what worked", which is the reason the
  // reference exists. deleteLeadList already did this; this didn't.
  (d.contacts || []).forEach((c) => { if (c.scriptId === id) c.scriptId = null; });
  return d;
}

// ---- outreach entries ----
//
// Entries are now append-and-edit records rather than one upserted row per
// day. The old shape keyed on (clientId, date), which cannot hold two lead
// lists worked on the same day — and working more than one list in a day is
// normal. Each entry carries its own id so it can be edited or removed
// individually.
export function addOutreachEntry(d, entry) {
  if (!Array.isArray(d.outreachLog)) d.outreachLog = [];
  // Spread FIRST, then the normalised fields — the other way round let an
  // explicit `undefined` on `entry` win over the default, and a row stored
  // with `date: undefined` crashes buildMonthlySeries on `e.date.slice()`,
  // blanking the whole Growth page the moment granularity is switched.
  d.outreachLog.push({
    ...entry,
    id: uid(),
    clientId: entry.clientId || null,
    date: entry.date || today(),
    listId: entry.listId || null,
    scriptId: entry.scriptId || null,
    notes: entry.notes || "",
  });
  return d;
}
export function updateOutreachEntry(d, id, patch) {
  const e = (d.outreachLog || []).find((x) => x.id === id);
  // `id` and `clientId` stripped: a patch should correct an entry, never
  // move it to another owner or forge a collision with someone else's row.
  if (e) { const { id: _i, clientId: _c, ...safe } = patch || {}; Object.assign(e, safe); }
  return d;
}
export function deleteOutreachEntry(d, id) {
  d.outreachLog = (d.outreachLog || []).filter((x) => x.id !== id);
  return d;
}

/**
 * Records the people who replied, as CRM contacts, at the moment their number
 * is logged.
 *
 * Names are only worth storing from the reply stage down. Capturing all 200
 * people a week costs ~5.5MB a year in a blob that is rewritten on every
 * save, and nobody reads a list of 200 cold names anyway. The ones who
 * replied are a different thing entirely — those are real conversations, and
 * they carry the list and script that produced them so a won deal can be
 * traced back to what actually worked.
 */
export function addRepliedLeads(d, { names, clientId, listId, scriptId, date }) {
  (names || []).filter((n) => n && n.trim()).forEach((raw) => {
    const [name, ...rest] = raw.split("|").map((x) => x.trim());
    addContact(d, {
      name,
      company: rest[0] || "",
      url: rest.find((x) => x.startsWith("http")) || "",
      // "lead" and NOT "replied": LEGACY_STAGE_MAP rewrites `replied` to
      // `lead` on every migrate, so a contact saved that way would silently
      // change stage on the next load. The board's real first column is
      // "lead" — that's where someone who has just written back belongs, and
      // `repliedAt` below records that they actually responded rather than
      // being a cold name.
      stage: "lead",
      repliedAt: date || today(),
      source: "LinkedIn outreach",
      clientId: clientId || null,
      listId: listId || null,
      scriptId: scriptId || null,
      addedDate: date || today(),
    });
  });
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
