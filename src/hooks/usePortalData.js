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

  useEffect(() => {
    if (!token) { setData(null); return; }
    let cancelled = false;
    apiGet(token)
      .then((json) => { if (!cancelled) setData(json.data); })
      .catch((e) => {
        if (cancelled) return;
        if (e.unauthorized) onUnauthorized?.();
        else setError(e.message);
      });
    return () => { cancelled = true; };
  }, [token, onUnauthorized]);

  const act = useCallback((action, payload) => {
    apiAction(token, action, payload)
      .then((json) => { setData(json.data); setError(""); })
      .catch((e) => {
        if (e.unauthorized) { onUnauthorized?.(); return; }
        setError(e.message);
      });
  }, [token, onUnauthorized]);

  const actions = {
    addPost: (p) => act("addPost", p),
    updatePost: (id, patch) => act("updatePost", { id, patch }),
    updatePostStatus: (id, status) => act("updatePostStatus", { id, status }),
    addContact: (c) => act("addContact", c),
    updateStage: (id, stage) => act("updateStage", { id, stage }),
    addComment: (c) => act("addComment", c),
  };

  return { data, actions, error, dismissError: () => setError("") };
}
