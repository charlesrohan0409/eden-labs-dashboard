import { useCallback, useEffect, useRef, useState } from "react";
import * as M from "../data/mutations";

// Dashboard data now lives in Supabase (one JSON document, read/written
// through /api/data — the browser never talks to Supabase directly, same
// rule as every other secret-holding call in this app). This replaced the
// old localStorage-only store: that was single-device by construction, since
// nothing written on one browser could ever be seen by another. Every
// mutation still goes through the same clone -> mutate -> persist -> setState
// shape as before; only the persist step changed.
//
// The actual mutation logic (`addTask`, `updatePostStatus`, etc.) lives in
// ../data/mutations.js so the server can apply the exact same logic when a
// client-portal action comes in — this file is just the thin wrapper that
// wires those pure functions to React state and the network.

function unauthorizedError() {
  const e = new Error("Session expired — please log in again.");
  e.unauthorized = true;
  return e;
}

async function apiGet(token) {
  const res = await fetch("/api/data", { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw unauthorizedError();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Load failed (${res.status})`);
  return res.json();
}

// Sends the version last read so the server can reject a write built on
// stale data (see updateAppDataIfUnchanged). A 409 isn't an error here — it
// carries the fresh server state so the caller can replay onto it — so it's
// returned rather than thrown.
async function apiPut(token, data, version) {
  const res = await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data, version }),
  });
  if (res.status === 401) throw unauthorizedError();
  if (res.status === 409) {
    const json = await res.json().catch(() => ({}));
    return { conflict: true, data: json.data, version: json.version };
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `This change wasn't saved: ${res.status}`);
  return res.json();
}

// `token` is the owner's session (see useOwnerAuth). `onUnauthorized` fires
// when a request comes back 401 — token expired or was revoked elsewhere —
// so the caller can drop back to the login screen instead of the dashboard
// spinning on dead requests forever.
export function useAppData(token, onUnauthorized) {
  const [data, setData] = useState(null);
  const [saveError, setSaveError] = useState("");
  // The optimistic-locking token for whatever was last read or written. A ref
  // rather than state: it changes on every save and nothing renders from it,
  // so putting it in state would just add a render per write.
  const versionRef = useRef(null);
  // The current data, mirrored outside React state so `update` can read it
  // WITHOUT going through a setState updater — see the comment there.
  const dataRef = useRef(null);

  // Single place that moves data forward, so the ref and the rendered state
  // can never drift apart.
  const commit = useCallback((next) => {
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    if (!token) {
      setData(null);
      return;
    }
    let cancelled = false;
    apiGet(token)
      .then((json) => {
        if (cancelled) return;
        versionRef.current = json.version || null;
        commit(json.data);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.unauthorized) onUnauthorized?.();
        else setSaveError(e.message);
      });
    return () => { cancelled = true; };
  }, [token, onUnauthorized]);

  // Every mutation clones, mutates, persists, and returns the next state —
  // unchanged from the localStorage version, just pointed at the API now.
  // Reads current data from a ref and commits explicitly, rather than doing
  // the work inside a setData(prev => ...) updater.
  //
  // That distinction is load-bearing, not stylistic. StrictMode invokes state
  // updaters TWICE in development, so running the mutation and firing the
  // save from inside one meant every change was saved twice. That was merely
  // wasteful under last-write-wins — both writes carried identical data — but
  // it became destructive the moment optimistic locking was added: the first
  // write succeeded and bumped the version, the second hit a 409, and the
  // conflict replay then re-applied the mutation to data that ALREADY had it,
  // silently undoing the change. Caught live — a task toggle round-tripped to
  // no-op. An updater must stay pure; side effects belong out here.
  const update = useCallback((mutator) => {
    const prev = dataRef.current;
    if (!prev) return;

    const next = mutator(structuredClone(prev));
    commit(next);

    // On a version conflict, REPLAY rather than surrender. Every mutator is
    // a pure (draft) => draft, so re-running it against the server's fresh
    // copy produces the change the user asked for on top of whatever else
    // landed meanwhile — instead of either losing their edit or flattening
    // someone else's. This is why mutations.js is kept pure.
    //
    // Bounded, because a genuinely hot row could otherwise spin forever; in
    // practice one retry is always enough for a single-owner dashboard.
    const save = async (payload, attempt = 0) => {
      const res = await apiPut(token, payload, versionRef.current);
      if (!res?.conflict) {
        if (res?.version) versionRef.current = res.version;
        setSaveError("");
        return;
      }
      versionRef.current = res.version || null;
      if (attempt >= 2) {
        commit(res.data);
        setSaveError("Someone else changed this at the same time — your latest change wasn't saved. The screen now shows the current data.");
        return;
      }
      const replayed = mutator(structuredClone(res.data));
      commit(replayed);
      await save(replayed, attempt + 1);
    };

    save(next).catch((e) => {
      if (e.unauthorized) { onUnauthorized?.(); return; }
      setSaveError(e.message);
    });
  }, [token, onUnauthorized, commit]);

  const actions = {
    // ---- tasks ----
    addTask: (t) => update((d) => M.addTask(d, t)),
    toggleTask: (id) => update((d) => M.toggleTask(d, id)),
    updateTask: (id, patch) => update((d) => M.updateTask(d, id, patch)),
    deleteTask: (id) => update((d) => M.deleteTask(d, id)),
    reorderTasks: (orderedIds) => update((d) => M.reorderTasks(d, orderedIds)),

    // ---- clients ----
    addClient: (client) => {
      update((d) => M.addClient(d, client));
      // Hash + register the portal PIN Supabase-side so /api/auth-client can
      // find this client. Best-effort: if it fails, the client row still
      // exists — it just means their PIN needs re-registering (surfaces via
      // saveError on the next mutation, since the request itself is silent).
      if (client?.id && client?.pin) {
        fetch("/api/register-client-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ clientId: client.id, pin: client.pin }),
        }).catch(() => {});
      }
    },
    updateClient: (id, patch) => update((d) => M.updateClient(d, id, patch)),
    toggleClientHidden: (id) => update((d) => M.toggleClientHidden(d, id)),
    updateContract: (id, contract) => update((d) => M.updateContract(d, id, contract)),
    updateDelivery: (id, idx, val) => update((d) => M.updateDelivery(d, id, idx, val)),
    addDeliveryMetric: (id, metric) => update((d) => M.addDeliveryMetric(d, id, metric)),
    updateDeliveryMetric: (id, idx, patch) => update((d) => M.updateDeliveryMetric(d, id, idx, patch)),
    deleteDeliveryMetric: (id, idx) => update((d) => M.deleteDeliveryMetric(d, id, idx)),
    endContract: (id, reason) => update((d) => M.endContract(d, id, reason)),
    updateClientNotes: (id, text) => update((d) => M.updateClientNotes(d, id, text)),
    deleteClient: (id) => {
      update((d) => M.deleteClient(d, id));
      // Best-effort, mirrors addClient's registration call: wipe the old
      // portal PIN Supabase-side too, so it stops authenticating into a
      // client that no longer exists once this resolves.
      fetch("/api/delete-client-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: id }),
      }).catch(() => {});
    },

    // ---- activity log ----
    logActivity: (entry) => update((d) => M.logActivity(d, entry)),

    // ---- contacts / CRM ----
    addContact: (c) => update((d) => M.addContact(d, c)),
    updateStage: (id, stage) => update((d) => M.updateStage(d, id, stage)),
    updateContact: (id, patch) => update((d) => M.updateContact(d, id, patch)),
    deleteContact: (id) => update((d) => M.deleteContact(d, id)),

    // ---- content ----
    addPost: (p) => update((d) => M.addPost(d, p)),
    updatePost: (id, patch) => update((d) => M.updatePost(d, id, patch)),
    updatePostStatus: (id, status) => update((d) => M.updatePostStatus(d, id, status)),
    deletePost: (id) => update((d) => M.deletePost(d, id)),
    addSwipe: (s) => update((d) => M.addSwipe(d, s)),
    deleteSwipe: (id) => update((d) => M.deleteSwipe(d, id)),
    addDM: (dm) => update((d) => M.addDM(d, dm)),
    deleteDM: (id) => update((d) => M.deleteDM(d, id)),
    addComment: (c) => update((d) => M.addComment(d, c)),

    // ---- finance ----
    addExpense: (e, rate) => update((d) => M.addExpense(d, e, rate)),
    updateExpense: (id, patch) => update((d) => M.updateExpense(d, id, patch)),
    deleteExpense: (id) => update((d) => M.deleteExpense(d, id)),

    syncPublishedFromBuffer: (sent) => update((d) => M.syncPublishedFromBuffer(d, sent).data),

    addAccount:    (a) => update((d) => M.addAccount(d, a)),
    updateAccount: (id, patch) => update((d) => M.updateAccount(d, id, patch)),
    deleteAccount: (id) => update((d) => M.deleteAccount(d, id)),

    addOutgoing:    (o) => update((d) => M.addOutgoing(d, o)),
    updateOutgoing: (id, patch) => update((d) => M.updateOutgoing(d, id, patch)),
    deleteOutgoing: (id) => update((d) => M.deleteOutgoing(d, id)),
    cancelOutgoing: (id) => update((d) => M.cancelOutgoing(d, id)),
    payOutgoing:    (id, opts) => update((d) => M.payOutgoing(d, id, opts)),

    addExpenseCategory:    (name) => update((d) => M.addExpenseCategory(d, name)),
    renameExpenseCategory: (from, to) => update((d) => M.renameExpenseCategory(d, from, to)),
    deleteExpenseCategory: (name) => update((d) => M.deleteExpenseCategory(d, name)),

    addBudget:    (b) => update((d) => M.addBudget(d, b)),
    updateBudget: (id, patch) => update((d) => M.updateBudget(d, id, patch)),
    deleteBudget: (id) => update((d) => M.deleteBudget(d, id)),
    addInvoice: (i) => update((d) => M.addInvoice(d, i)),
    updateInvoiceStatus: (id, status, rate) => update((d) => M.updateInvoiceStatus(d, id, status, rate)),
    deleteInvoice: (id) => update((d) => M.deleteInvoice(d, id)),
    // Reads counts back out synchronously — functional setState updaters run
    // synchronously when called, so `result` is populated before update()
    // returns even though the re-render itself is deferred.
    generateInvoices: (period) => {
      if (!data) return { created: 0, skipped: 0 };
      let result = { created: 0, skipped: 0 };
      update((d) => {
        result = M.generateInvoices(d, period);
        return d;
      });
      return result;
    },

    // ---- profile & settings ----
    updateProfile: (patch) => update((d) => M.updateProfile(d, patch)),
    setCurrency: (currency) => update((d) => M.setCurrency(d, currency)),

    // ---- misc ----
    logGrowth: (entry) => update((d) => M.logGrowth(d, entry)),
    logOutreachDay: (entry) => update((d) => M.logOutreachDay(d, entry)),
    deleteOutreachDay: (id) => update((d) => M.deleteOutreachDay(d, id)),
    toggleIntegration: (id) => update((d) => M.toggleIntegration(d, id)),
    setFathomConnected: () => update((d) => M.setFathomConnected(d)),
    setFathomDisconnected: () => update((d) => M.setFathomDisconnected(d)),
    setBufferChannels: (channels) => update((d) => M.setBufferChannels(d, channels)),
    setBufferDisconnected: () => update((d) => M.setBufferDisconnected(d)),
    setAgencyBufferChannel: (channelId) => update((d) => M.setAgencyBufferChannel(d, channelId)),
  };

  return { data, update, actions, saveError, dismissSaveError: () => setSaveError("") };
}
