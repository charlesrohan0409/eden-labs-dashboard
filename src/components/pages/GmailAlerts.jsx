import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw, Check, AlertTriangle, Unplug, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";

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

export default function GmailAlerts({ token }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    try { setStatus(await api(token, "GET")); }
    catch (e) { setError(e.message); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

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
    try { setResult(await api(token, "POST", { days })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    setError(""); setBusy(true);
    try { await api(token, "DELETE"); setResult(null); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

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

          <Card className="p-5">
            <CardTitle sub={result.pending.length
              ? "Not recorded yet — these are alerts your statements haven't caught up with."
              : "Nothing new. Every alert in this window is already in your ledger."}>
              {result.pending.length} new since your last statement
            </CardTitle>
            {result.pending.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                      <th className="text-left font-semibold py-2 w-24">Date</th>
                      <th className="text-left font-semibold py-2">Who</th>
                      <th className="text-left font-semibold py-2 w-24">Account</th>
                      <th className="text-right font-semibold py-2 w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.pending.map((p) => (
                      <tr key={p.messageId} className="border-b border-stone-100 last:border-0">
                        <td className="py-2 tnum text-stone-500">{p.date}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5">
                            {p.dir === "DR"
                              ? <ArrowUpRight size={13} className="text-rose-500 shrink-0" />
                              : <ArrowDownLeft size={13} className="text-emerald-600 shrink-0" />}
                            <span className="truncate" title={p.text}>{p.payee || p.subject}</span>
                          </span>
                        </td>
                        <td className="py-2 text-stone-400 tnum">{p.accountTail ? `••${p.accountTail}` : "—"}</td>
                        <td className={`py-2 text-right tnum font-medium ${p.dir === "DR" ? "text-rose-600" : "text-emerald-700"}`}>
                          {p.dir === "DR" ? "−" : "+"}{inr(p.amount)}
                        </td>
                      </tr>
                    ))}
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
