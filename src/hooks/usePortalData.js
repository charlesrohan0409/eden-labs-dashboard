import { useCallback, useEffect, useState } from "react";

// Mirrors useAppData.js but for the client portal: reads through
// /api/portal-data (already filtered server-side to just this client's own
// records — see api/_dataHandlers.js) and writes through /api/portal-action,
// a small allowlist of actions rather than a raw blob PUT. The browser never
// sees another client's data, and the server enforces clientId on every
// write regardless of what the client sends.

function unauthorizedError() {
  return Object.assign(new Error("Session expired — please log in again."), { unauthorized: true });
}

async function apiGet(token) {
  const res = await fetch("/api/portal-data", { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw unauthorizedError();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Load failed (${res.status})`);
  return res.json();
}

async function apiAction(token, action, payload) {
  const res = await fetch("/api/portal-action", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, payload }),
  });
  if (res.status === 401) throw unauthorizedError();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `That didn't save: ${res.status}`);
  return res.json();
}

export function usePortalData(token, onUnauthorized) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setData(null); return; }
    setRefreshing(true);
    try {
      const json = await apiGet(token);
      setData(json.data);
      setError("");
    } catch (e) {
      if (e.unauthorized) onUnauthorized?.();
      else setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  // Returns a PROMISE and rethrows. It used to swallow the error and return
  // undefined, so callers couldn't show a pending state or react to a
  // failure — which is why the approve button gave no feedback at all and
  // why a failed comment was cleared from the box as if it had sent.
  const act = useCallback(async (action, payload) => {
    try {
      const json = await apiAction(token, action, payload);
      setData(json.data);
      setError("");
      return json.data;
    } catch (e) {
      if (e.unauthorized) { onUnauthorized?.(); throw e; }
      setError(e.message);
      throw e;
    }
  }, [token, onUnauthorized]);

  const actions = {
    addPost: (p) => act("addPost", p),
    updatePost: (id, patch) => act("updatePost", { id, patch }),
    updatePostStatus: (id, status) => act("updatePostStatus", { id, status }),
    addContact: (c) => act("addContact", c),
    updateStage: (id, stage) => act("updateStage", { id, stage }),
    addComment: (c) => act("addComment", c),
    updateContact: (id, patch) => act("updateContact", { id, patch }),
    deleteContact: (id) => act("deleteContact", { id }),
  };

  return { data, actions, error, refreshing, refresh: load, dismissError: () => setError("") };
}
