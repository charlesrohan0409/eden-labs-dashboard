import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail, RefreshCw, Check, AlertTriangle, Unplug, ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import { suggestCategory, matchAccount, toExpense, alreadyRecorded } from "../../lib/alertToExpense";
import { recallCategory } from "../../lib/categoryMemory";
import { routeAlert, advanceRenewal } from "../../lib/alertRouter";

// Bank alert emails, read and proposed — never recorded on their own.
//
// The value here is freshness: a statement is the truth but arrives a month
// late, while an alert lands seconds after the transaction. So this fills the
// gap between the last statement and today, and everything it finds is a
// PROPOSAL. The ledger's worth comes from every row in it having been checked;
// a pipeline that wrote unattended would spend that on convenience.

const inr = (n) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

async function api(token, method, body) {
  const res = await fetch("/api/gmail-sync", {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export default function GmailAlerts({
  token, accounts = [], categories = [], expenses = [], outgoings = [], financeLog = [],
  rate = 1, data, onAddExpense, onPayOutgoing,
}) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [days, setDays] = useState(30);
  // Category per pending row, keyed by message id. Seeded from the guess but
  // freely overridable — the guess is a starting point, not an answer.
  const [picked, setPicked] = useState({});
  const [logged, setLogged] = useState(() => new Set());
  // NOTHING FILES ITSELF.
  //
  // There was an auto-log preference here that filed anything the guesser felt
  // confident about. It filed things Charles disagreed with — ₹1,711 under a
  // vendor called "A payment was made using your Credit Card", a chemist under
  // Food — and by the time he saw them they were already in the totals.
  //
  // A guess that acts on its own is worse than no guess, because a wrong
  // category is invisible once it's filed. Suggestions are still made; they
  // are shown as a hint to accept, never pre-selected and never applied.
  // Every transaction now waits for him.

  const load = useCallback(async () => {
    try { setStatus(await api(token, "GET")); }
    catch (e) { setError(e.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // PULL WITHOUT BEING ASKED.
  //
  // The sync was a button, so today's spending only reached the dashboard on
  // days Charles remembered to press it — which defeats the point of reading
  // alerts at all, since the whole value is freshness. Once connected, this
  // runs the pull on its own the first time the tab is opened in a session.
  //
  // Once per session, not per render: `syncedOnce` is a ref so a re-render
  // can't re-fire it, and it deliberately does NOT retry after a failure —
  // a broken token would otherwise hammer Gmail every time the tab mounted.
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (!status?.connected || syncedOnce.current || busy) return;
    syncedOnce.current = true;
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.connected]);

  async function connect() {
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/gmail-auth", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't start the Google sign-in.");
      window.location.href = json.url;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  async function sync() {
    setError(""); setBusy(true); setResult(null);
    try {
      setResult(await api(token, "POST", { days }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setError(""); setBusy(true);
    try { await api(token, "DELETE"); setResult(null); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // An alert already logged as an expense must not be offered again. The id
  // is stored on the expense, so this survives a reload and a re-sync — the
  // component's own state would not.
  // Everything this mailbox has already been used to record.
  //
  // Expenses carry the message id on the row itself. A CARD payment books no
  // expense at all — bank down, card debt down — so its only trace is the
  // finance log entry, and without reading that too a re-sync would pay the
  // same card bill again every time it ran.
  const alreadyLogged = useMemo(() => {
    const s = new Set((expenses || []).map((e) => e.gmailMessageId).filter(Boolean));
    for (const l of financeLog || []) if (l?.meta?.gmailMessageId) s.add(l.meta.gmailMessageId);
    return s;
  }, [expenses, financeLog]);

  // Where each alert belongs. Computed once per sync rather than per render
  // so the table, the auto-log pass and the summary all read one verdict.
  const verdicts = useMemo(() => {
    const m = new Map();
    for (const p of result?.pending || []) m.set(p.messageId, routeAlert(p, { outgoings, accounts, categories }));
    return m;
  }, [result, outgoings, accounts, categories]);

  // File one alert wherever it belongs.
  //
  // Three destinations, not one. The old version sent everything to
  // addExpense, which was right for a shop and wrong for the two cases that
  // cost money: a card bill (already expensed when the purchases happened)
  // and a subscription (already on the books with a due date).
  function logOne(p, seen) {
    const v = verdicts.get(p.messageId) || routeAlert(p, { outgoings, accounts, categories });
    if (v.kind === "skip") return false;

    if ((v.kind === "card-payment" || v.kind === "outgoing") && v.outgoing) {
      if (!onPayOutgoing) return false;
      onPayOutgoing(v.outgoing.id, {
        date: p.date,
        amount: Number(p.amount) || 0,
        // Stepped from the RENEWAL date, not the payment date, so a bill paid
        // late doesn't walk its due date forward a few days every month.
        nextRenewal: advanceRenewal(v.outgoing, p.date),
        rate,
        gmailMessageId: p.messageId,
      });
    } else {
      // No fallback to "Other". Filing something under a category he never
      // chose is exactly what he asked to stop; without a choice, nothing
      // happens and the row stays on screen.
      const cat = picked[p.messageId];
      if (!cat) return false;
      const record = toExpense(p, { accounts, category: cat, rate });
      if (!record) return false;
      onAddExpense?.(record);
    }

    setLogged((s) => new Set(s).add(p.messageId));
    // `expenses` won't have caught up mid-loop, so a batch needs its own
    // guard or the same alert files twice within one pass.
    seen?.add(p.messageId);
    return true;
  }

  // Confident enough to file without asking: a debit, not already filed, and
  // the payee matched a category outright.

  if (!status) return <Card className="p-6 text-sm text-stone-400">Checking Gmail…</Card>;

  return (
    <div className="space-y-3">
      <Card className="p-5">
        <CardTitle sub={status.connected
          ? `Reading bank alerts from ${status.email || "your inbox"} — read-only, and nothing is recorded without you.`
          : "Pull transactions from your bank's alert emails, so today's spending shows up before the statement does."}>
          <span className="inline-flex items-center gap-2"><Mail size={15} /> Bank alerts from Gmail</span>
        </CardTitle>

        {error && (
          <div className="flex items-start gap-2 text-[13px] text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 mb-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* Shown only when it can't work. "OAuth client was not found" is
            indistinguishable from a typo unless you can read back what the
            server is actually sending, so it prints it. */}
        {!status.connected && (!status.clientId || !status.clientIdLooksValid || !status.hasSecret) && (
          <div className="text-[13px] bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-3 space-y-1">
            <div className="font-medium text-amber-900 flex items-center gap-1.5">
              <AlertTriangle size={13} /> This won't connect yet
            </div>
            {!status.clientId && <div className="text-amber-800">No <code>GOOGLE_CLIENT_ID</code> on the server.</div>}
            {status.clientId && !status.clientIdLooksValid && (
              <div className="text-amber-800">The client ID doesn't look like a Google one: <code className="break-all">{status.clientId}</code></div>
            )}
            {!status.hasSecret && <div className="text-amber-800">No <code>GOOGLE_CLIENT_SECRET</code> on the server.</div>}
          </div>
        )}

        {!status.connected && status.clientId && (
          <div className="text-[11.5px] text-stone-400 mb-3">
            Sending client ID <code className="text-stone-500 break-all">{status.clientId}</code> — this must match the one in
            your Google Cloud console exactly.
          </div>
        )}

        {!status.connected ? (
          <button onClick={connect} disabled={busy}
            className="bg-night text-white text-sm font-medium px-4 py-2.5 rounded-xl inline-flex items-center gap-2 transition-transform active:scale-[0.97] disabled:opacity-50">
            <Mail size={14} /> {busy ? "Opening Google…" : "Connect Gmail"}
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[13px] text-stone-500 flex items-center gap-2">
              Last
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                className="border border-line rounded-lg px-2 py-1.5 text-[13px] bg-white">
                {[7, 30, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </label>
            <button onClick={sync} disabled={busy}
              className="bg-night text-white text-sm font-medium px-4 py-2 rounded-xl inline-flex items-center gap-2 transition-transform active:scale-[0.97] disabled:opacity-50">
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {busy ? "Reading…" : "Check for new transactions"}
            </button>
            <button onClick={disconnect} disabled={busy}
              className="text-sm text-stone-500 px-3 py-2 rounded-xl border border-line inline-flex items-center gap-1.5 hover:text-stone-800 transition-colors">
              <Unplug size={13} /> Disconnect
            </button>
          </div>
        )}
      </Card>

      {result && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            {[["Emails read", result.scanned], ["Look like transactions", result.parsed],
              ["Already in your ledger", result.alreadyInLedger]].map(([k, v]) => (
              <Card key={k} className="p-4">
                <div className="text-[10.5px] font-semibold text-stone-400 uppercase tracking-wide">{k}</div>
                <div className="text-[24px] font-bold tracking-tight tnum mt-0.5">{v}</div>
              </Card>
            ))}
          </div>

          {result.fromReceipts > 0 && (
            <div className="text-[13px] text-sky-900 bg-sky-50 border border-sky-100 rounded-xl px-3.5 py-2.5">
              {result.fromReceipts} came from a merchant's own invoice — your bank sent no alert for {result.fromReceipts === 1 ? "it" : "them"}.
              {result.receiptsMatchedToAlerts > 0 && ` Another ${result.receiptsMatchedToAlerts} matched an alert you already have and were folded in, so nothing is counted twice.`}
            </div>
          )}

          <Card className="p-5">
            <CardTitle sub={result.pending.length
              ? "Not recorded yet — these are alerts your statements haven't caught up with."
              : "Nothing new. Every alert in this window is already in your ledger."}>
              {result.pending.length} new since your last statement
            </CardTitle>
            {/* Deliberately no "log everything" button. It applied the
                guesser's suggestions in bulk, which is the behaviour Charles
                asked to remove — one press filing forty categories he never
                read. Each row is chosen on its own. */}
            {result.pending.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                      <th className="text-left font-semibold py-2 w-24">Date</th>
                      <th className="text-left font-semibold py-2">Who</th>
                      <th className="text-right font-semibold py-2 w-28 pr-5">Amount</th>
                      <th className="text-left font-semibold py-2 w-72">Where it goes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.pending.map((p) => {
                      const done = logged.has(p.messageId) || alreadyLogged.has(p.messageId);
                      // His own past choice first — it beats any keyword
                      // guess, and it is his decision rather than mine.
                      // Same amount, same day, already on the books — most
                      // likely this transaction arriving by a second route.
                      const twin = alreadyRecorded(p, expenses);
                      const memory = recallCategory(data, p.payee, categories);
                      const guess = memory?.category || suggestCategory(p, categories);
                      // The suggestion is NOT pre-selected. A pre-filled
                      // dropdown is a decision already made, and pressing Log
                      // next to one is how a guess becomes a filed category
                      // without anybody reading it.
                      const cat = picked[p.messageId] ?? "";
                      const acct = matchAccount(p, accounts);
                      const v = verdicts.get(p.messageId) || { kind: p.dir === "DR" ? "expense" : "skip" };
                      const paysDown = v.outgoing && accounts.find((a) => a.id === v.outgoing.paysDownAccountId);
                      return (
                        <tr key={p.messageId} className="border-b border-stone-100 last:border-0">
                          <td className="py-2 tnum text-stone-500 align-top">{p.date}</td>
                          <td className="py-2 align-top">
                            <span className="inline-flex items-center gap-1.5">
                              {p.dir === "DR"
                                ? <ArrowUpRight size={13} className="text-rose-500 shrink-0" />
                                : <ArrowDownLeft size={13} className="text-emerald-600 shrink-0" />}
                              <span className="truncate" title={p.text}>{p.payee || p.subject}</span>
                              {p.source === "receipt" && (
                                <span className="text-[10px] text-sky-800 bg-sky-50 border border-sky-100 rounded px-1 py-0.5 shrink-0" title="From the merchant's own invoice — your bank sent no alert for this one">
                                  receipt
                                </span>
                              )}
                            </span>
                            {twin && (
                              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 mt-1 inline-block">
                                Already recorded? &ldquo;{String(twin.vendor || twin.category)}&rdquo; on {twin.date}, same amount
                              </div>
                            )}
                            <div className="text-[11px] text-stone-400 mt-0.5">
                              {acct ? acct.name : p.accountTail ? `account ••${p.accountTail}` : "account unknown"}
                            </div>
                          </td>
                          <td className={`py-2 pr-5 text-right tnum font-medium align-top ${p.dir === "DR" ? "text-rose-600" : "text-emerald-700"}`}>
                            {p.dir === "DR" ? "−" : "+"}{inr(p.amount)}
                          </td>
                          <td className="py-2 align-top">
                            {p.dir !== "DR" ? (
                              <span className="text-[11.5px] text-stone-400">money in — not an expense</span>
                            ) : done ? (
                              <span className="text-[12px] text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> logged</span>
                            ) : v.kind === "card-payment" && v.outgoing ? (
                              // A card bill. Says plainly that no expense is
                              // booked, because that reads like a mistake
                              // until you know the purchases were already
                              // counted when they happened.
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0 text-[11.5px] leading-tight">
                                  <span className="text-sky-800 font-medium">Pays down {paysDown?.name || "your card"}</span>
                                  <div className="text-stone-400">transfer — no expense booked</div>
                                </div>
                                <button onClick={() => logOne(p)} className="text-[12px] border border-line rounded-lg px-2 py-1 inline-flex items-center gap-1 hover:border-stone-300 transition-colors shrink-0">
                                  <Plus size={11} /> Apply
                                </button>
                              </div>
                            ) : v.kind === "card-payment" ? (
                              // Card wording, no card identified. Never filed
                              // unattended: as an expense it double-counts.
                              <div className="text-[11.5px] leading-tight">
                                <span className="text-amber-800 font-medium inline-flex items-center gap-1">
                                  <AlertTriangle size={12} className="shrink-0" /> Looks like a card bill
                                </span>
                                <div className="text-stone-500 mt-0.5">
                                  {v.candidates?.length
                                    ? "Which card? Mark it paid from My money — filing it here would count the spending twice."
                                    : "No card bill is set up to pay a card down, so I can't apply it."}
                                </div>
                              </div>
                            ) : v.kind === "outgoing" && v.outgoing ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0 text-[11.5px] leading-tight">
                                  <span className="text-emerald-800 font-medium">Marks {v.outgoing.name} paid</span>
                                  <div className="text-stone-400">
                                    {v.outgoing.category ? `${v.outgoing.category} · ` : ""}
                                    renews {advanceRenewal(v.outgoing, p.date)}
                                    {v.needsReview ? " · check this one" : ""}
                                  </div>
                                </div>
                                <button onClick={() => logOne(p)} className="text-[12px] border border-line rounded-lg px-2 py-1 inline-flex items-center gap-1 hover:border-stone-300 transition-colors shrink-0">
                                  <Plus size={11} /> Apply
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={cat}
                                    onChange={(e) => setPicked((s) => ({ ...s, [p.messageId]: e.target.value }))}
                                    className="text-[12px] px-2 py-1 rounded-lg border border-line bg-white flex-1 min-w-0"
                                  >
                                    <option value="">Pick a category…</option>
                                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                  <button
                                    onClick={() => logOne(p)}
                                    disabled={!cat}
                                    className="text-[12px] border border-line rounded-lg px-2 py-1 inline-flex items-center gap-1 hover:border-stone-300 disabled:opacity-40 transition-colors shrink-0"
                                  >
                                    <Plus size={11} /> Log
                                  </button>
                                </div>
                                {guess && !picked[p.messageId] && (
                                  <button
                                    onClick={() => setPicked((s) => ({ ...s, [p.messageId]: guess }))}
                                    className={`text-[11px] rounded-md px-1.5 py-0.5 border transition-colors ${
                                      memory
                                        ? "text-sky-900 bg-sky-50 border-sky-100 hover:bg-sky-100"
                                        : "text-emerald-800 bg-emerald-50 border-emerald-100 hover:bg-emerald-100"
                                    }`}
                                  >
                                    {memory
                                      ? `${guess} — what you chose${memory.count > 1 ? ` ${memory.count} times` : " last time"}`
                                      : `Looks like ${guess} — use it?`}
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!result.pending.length && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <Check size={15} /> Your ledger is up to date.
              </div>
            )}
          </Card>

          {/* Shown deliberately. Bank alert wording varies and the parser is a
              set of patterns; the honest thing is to say what it could not
              read rather than let it quietly miss transactions. */}
          {result.unrecognised?.length > 0 && (
            <Card className="p-5">
              <CardTitle sub="These came from your bank but the amount or direction couldn't be read. Send me one and I'll teach the parser its wording.">
                {result.unrecognised.length} email{result.unrecognised.length === 1 ? "" : "s"} I couldn't read
              </CardTitle>
              <div className="space-y-1.5">
                {result.unrecognised.map((u) => (
                  <div key={u.id} className="text-[12.5px] flex gap-3">
                    <span className="tnum text-stone-400 shrink-0">{u.date}</span>
                    <span className="text-stone-600 truncate" title={u.preview}>{u.subject}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
