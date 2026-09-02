import { useCallback, useEffect, useRef, useState } from "react";
import { pendingLedgerEntries, isUnified } from "../lib/financeSync";

// Pushes anything the Finance tab has recorded but the ledger hasn't seen.
//
// Runs after app data settles rather than inside a mutation, because
// useAppData replays a mutator against fresh server data on a version
// conflict — a side effect inside one would fire twice. Reading finished
// state instead makes replays harmless and lets the same pass backfill
// whatever a failed or offline sync missed.
//
// The append endpoint is idempotent on ref.origin, so the worst a redundant
// run can do is cost a round trip.

async function append(token, entries) {
  const res = await fetch("/api/ledger", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ append: entries }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Ledger sync failed (${res.status})`);
  return json;
}

export function useFinanceLedgerSync(data, token, { enabled = true } = {}) {
  const [state, setState] = useState({ pending: 0, added: 0, error: "", syncing: false });
  // The ledger as this hook last saw it. Fetched once, then kept current from
  // what we ourselves append — a full re-fetch after every expense would be
  // several hundred KB for the sake of rows we already have in hand.
  const ledgerRef = useRef(null);
  const chain = useRef(Promise.resolve());
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    fetch("/api/ledger", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => { ledgerRef.current = Array.isArray(j.entries) ? j.entries : []; })
      .catch(() => { ledgerRef.current = null; });
  }, [token]);

  const run = useCallback(() => {
    if (!enabled || !token || !data || ledgerRef.current === null) return;
    // Nothing syncs until unification has been set up — without the exclusion
    // list every pre-existing expense would be booked a second time, on top of
    // the statement rows describing the very same purchases.
    if (!isUnified(data)) { setState((s) => ({ ...s, pending: 0 })); return; }

    const todo = pendingLedgerEntries(data, ledgerRef.current);
    setState((s) => ({ ...s, pending: todo.length }));
    if (!todo.length) return;

    // Serialised: two saves close together would otherwise both read the same
    // ledger snapshot and race, and the loser's 409 would drop its entries.
    chain.current = chain.current.then(async () => {
      setState((s) => ({ ...s, syncing: true }));
      try {
        const res = await append(token, todo);
        ledgerRef.current = [...(ledgerRef.current || []), ...todo];
        setState((s) => ({ pending: 0, added: s.added + (res.added || 0), error: "", syncing: false }));
      } catch (e) {
        // Left pending on purpose. The next data change retries, and the
        // origin guard means a partial success can't double-book.
        setState((s) => ({ ...s, error: e.message, syncing: false }));
      }
    });
  }, [data, token, enabled]);

  useEffect(() => {
    // Debounced: a burst of edits should produce one append, not six.
    const t = setTimeout(run, 600);
    return () => clearTimeout(t);
  }, [run]);

  return state;
}
