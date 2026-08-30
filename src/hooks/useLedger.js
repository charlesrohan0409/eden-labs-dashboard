import { useCallback, useEffect, useRef, useState } from "react";

// The ledger is fetched on its own, not read out of the app_data blob.
//
// That blob is rewritten in full on every mutation, so ~2,500 historical
// bank entries living inside it would mean every task tick, every logged
// expense, uploads a megabyte. It also loads lazily: only the Analysis page
// needs it, so the dashboard's first paint shouldn't wait on it.

async function req(token, method, body) {
  const res = await fetch("/api/ledger", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Ledger request failed (${res.status})`);
  return json;
}

/**
 * Reads the ledger once per session, on demand.
 *
 * `entries` is null while loading and [] when genuinely empty — the two
 * render very differently (a spinner vs. "import your statements") and
 * collapsing them into one value is how a page ends up flashing an empty
 * state at someone whose data is still in flight.
 */
export function useLedger(token) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const versionRef = useRef(null);
  // Guards against React 18 StrictMode double-invoking the effect and
  // firing two identical GETs on mount.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    let alive = true;
    req(token, "GET")
      .then((json) => {
        if (!alive) return;
        versionRef.current = json.version || null;
        setEntries(Array.isArray(json.entries) ? json.entries : []);
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [token]);

  const save = useCallback(async (next) => {
    const json = await req(token, "PUT", { entries: next, version: versionRef.current });
    versionRef.current = json.version || null;
    setEntries(next);
    return json;
  }, [token]);

  return { entries, error, save, loading: entries === null && !error };
}
