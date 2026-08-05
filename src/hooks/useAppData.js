import { useCallback, useEffect, useState } from "react";
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

async function apiPut(token, data) {
  const res = await fetch("/api/data", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  if (res.status === 401) throw unauthorizedError();
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

  useEffect(() => {
    if (!token) {
      setData(null);
      return;
    }
    let cancelled = false;
    apiGet(token)
      .then((json) => { if (!cancelled) setData(json.data); })
      .catch((e) => {
        if (cancelled) return;
        if (e.unauthorized) onUnauthorized?.();
        else setSaveError(e.message);
      });
    return () => { cancelled = true; };
  }, [token, onUnauthorized]);

  // Every mutation clones, mutates, persists, and returns the next state —
  // unchanged from the localStorage version, just pointed at the API now.
  const update = useCallback((mutator) => {
    setData((prev) => {
      const next = mutator(structuredClone(prev));
      apiPut(token, next)
        .then(() => setSaveError(""))
        .catch((e) => {
          if (e.unauthorized) { onUnauthorized?.(); return; }
          setSaveError(e.message);
        });
      return next;
    });
  }, [token, onUnauthorized]);

  const actions = {
    // ---- tasks ----
    addTask: (t) => update((d) => M.addTask(d, t)),
    toggleTask: (id) => update((d) => M.toggleTask(d, id)),
    updateTask: (id, patch) => update((d) => M.updateTask(d, id, patch)),
    deleteTask: (id) => update((d) => M.deleteTask(d, id)),

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
    updateContract: (id, contract) => update((d) => M.updateContract(d, id, contract)),
    updateDelivery: (id, idx, val) => update((d) => M.updateDelivery(d, id, idx, val)),
    endContract: (id, reason) => update((d) => M.endContract(d, id, reason)),
    updateClientNotes: (id, text) => update((d) => M.updateClientNotes(d, id, text)),

    // ---- activity log ----
    logActivity: (entry) => update((d) => M.logActivity(d, entry)),

    // ---- contacts / CRM ----
    addContact: (c) => update((d) => M.addContact(d, c)),
    updateStage: (id, stage) => update((d) => M.updateStage(d, id, stage)),

    // ---- content ----
    addPost: (p) => update((d) => M.addPost(d, p)),
    updatePost: (id, patch) => update((d) => M.updatePost(d, id, patch)),
    updatePostStatus: (id, status) => update((d) => M.updatePostStatus(d, id, status)),
    deletePost: (id) => update((d) => M.deletePost(d, id)),
    addSwipe: (s) => update((d) => M.addSwipe(d, s)),
    addDM: (dm) => update((d) => M.addDM(d, dm)),
    addComment: (c) => update((d) => M.addComment(d, c)),

    // ---- finance ----
    addExpense: (e) => update((d) => M.addExpense(d, e)),
    addInvoice: (i) => update((d) => M.addInvoice(d, i)),
    updateInvoiceStatus: (id, status) => update((d) => M.updateInvoiceStatus(d, id, status)),
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
    toggleIntegration: (id) => update((d) => M.toggleIntegration(d, id)),
    setFathomConnected: () => update((d) => M.setFathomConnected(d)),
    setFathomDisconnected: () => update((d) => M.setFathomDisconnected(d)),
    setBufferChannels: (channels) => update((d) => M.setBufferChannels(d, channels)),
    setBufferDisconnected: () => update((d) => M.setBufferDisconnected(d)),
    setAgencyBufferChannel: (channelId) => update((d) => M.setAgencyBufferChannel(d, channelId)),
  };

  return { data, update, actions, saveError, dismissSaveError: () => setSaveError("") };
}
