import { useMemo, useState } from "react";
import { Scale, AlertTriangle, Check, ArrowRight } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import { useLedger } from "../../hooks/useLedger";
import { balances, asNormal, fromMinor } from "../../lib/ledger";
import { reconcile } from "../../lib/financeToLedger";

// Where the two sets of books disagree.
//
// Finance stores a balance and adjusts it on every action. The ledger derives
// one from statement lines that were reconciled against the bank. When they
// differ, the ledger is right — it is the one that had to add up. This panel
// exists so that is visible rather than assumed, and so the correction is one
// deliberate press rather than something that happens quietly overnight.

const inr = (n) => (n < 0 ? "−" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

export default function LedgerReconcile({ token, accounts, loans, rate = 93.33, onUpdateAccount }) {
  const { entries, loading } = useLedger(token);
  const [applied, setApplied] = useState(() => new Set());

  const ledgerBalances = useMemo(() => {
    const m = new Map();
    if (!entries) return m;
    for (const [acct, v] of balances(entries)) m.set(acct, fromMinor(asNormal(acct, v)));
    return m;
  }, [entries]);

  const rows = useMemo(
    () => reconcile(accounts, ledgerBalances, rate),
    [accounts, ledgerBalances, rate]
  );

  // A loan recorded with no matching ledger entry is money counted twice: once
  // as cash still sitting in an account, once as an amount you're owed.
  const phantomLoans = useMemo(() => {
    if (!entries) return [];
    const origins = new Set(entries.map((t) => t.ref?.origin).filter(Boolean));
    return (loans || []).filter((l) => l.status !== "settled" && !origins.has(`loan:${l.id}`));
  }, [loans, entries]);

  if (loading) return <Card className="p-6 text-sm text-stone-400">Comparing against the ledger…</Card>;

  const off = rows.filter((r) => r.diff !== null && Math.abs(r.diff) >= 1);
  const missing = rows.filter((r) => r.diff === null);
  const totalDrift = off.reduce((s, r) => s + r.diff, 0);

  return (
    <div className="space-y-3">
      <Card className="p-5">
        <CardTitle sub="Your dashboard keeps a running balance; the ledger derives one from statements that had to reconcile against the bank. Where they differ, the ledger is right.">
          <span className="inline-flex items-center gap-2"><Scale size={15} /> Dashboard vs your statements</span>
        </CardTitle>

        {!off.length && !missing.length && !phantomLoans.length ? (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Check size={15} /> Every account matches the ledger to the rupee.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                  <th className="text-left font-semibold py-2">Account</th>
                  <th className="text-right font-semibold py-2 w-28">Dashboard</th>
                  <th className="text-right font-semibold py-2 w-28">Statements</th>
                  <th className="text-right font-semibold py-2 w-28">Out by</th>
                  <th className="text-right font-semibold py-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOff = r.diff !== null && Math.abs(r.diff) >= 1;
                  const done = applied.has(r.id);
                  return (
                    <tr key={r.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-2">
                        <div className="text-stone-800">{r.name}</div>
                        <div className="text-[11px] text-stone-400">{r.account}</div>
                      </td>
                      <td className="py-2 text-right tnum text-stone-500">{inr(r.finance)}</td>
                      <td className="py-2 text-right tnum font-medium">{r.ledger === null ? "—" : inr(r.ledger)}</td>
                      <td className={`py-2 text-right tnum ${isOff ? "text-amber-700" : "text-stone-300"}`}>
                        {r.diff === null ? "never seen" : isOff ? inr(r.diff) : "—"}
                      </td>
                      <td className="py-2 text-right">
                        {isOff && !done && (
                          <button
                            onClick={() => {
                              // Store back in the account's own currency —
                              // writing an INR figure into a USD account is
                              // how an $900 balance becomes $84,000.
                              const next = r.currency === "USD" ? r.ledger / rate : r.ledger;
                              onUpdateAccount?.(r.id, { balance: Number(next.toFixed(2)) });
                              setApplied((p) => new Set(p).add(r.id));
                            }}
                            className="text-[12px] text-stone-600 border border-line rounded-lg px-2.5 py-1 inline-flex items-center gap-1 hover:border-stone-300 transition-colors"
                          >
                            Use <ArrowRight size={11} />
                          </button>
                        )}
                        {done && <span className="text-[12px] text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> set</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {off.length > 0 && (
              <p className="text-[12px] text-stone-500 mt-3">
                {off.length} account{off.length === 1 ? "" : "s"} out by {inr(totalDrift)} in total.
                Each difference is your dashboard drifting from what the bank actually says — pressing
                Use adopts the statement figure.
              </p>
            )}
          </div>
        )}
      </Card>

      {phantomLoans.length > 0 && (
        <Card className="p-5">
          <CardTitle sub="Recorded as money owed to you, but the cash never left an account — so it's counted twice: once as a balance you still hold, once as an amount you're owed.">
            <span className="inline-flex items-center gap-2 text-amber-700">
              <AlertTriangle size={15} /> {phantomLoans.length} loan{phantomLoans.length === 1 ? "" : "s"} counted twice
            </span>
          </CardTitle>
          <div className="space-y-2">
            {phantomLoans.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 text-sm border border-line rounded-xl px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-stone-800">{l.to || l.name || "Someone"}</div>
                  <div className="text-[11.5px] text-stone-400">
                    {l.date || "no date"}
                    {l.accountId
                      ? ` · would come out of ${(accounts || []).find((a) => a.id === l.accountId)?.name || "an account"}`
                      : " · no account chosen, so nothing can be deducted"}
                  </div>
                </div>
                <div className="tnum font-medium shrink-0">{inr(Number(l.amount) || 0)}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-stone-500 mt-3">
            If the money genuinely hasn't gone out yet, this is correct for now and will resolve
            itself when it does. If it has gone out, the account it came from is overstated by
            that amount.
          </p>
        </Card>
      )}

      {missing.length > 0 && (
        <Card className="p-5">
          <CardTitle sub="These exist in your dashboard but no statement has ever mentioned them, so there's nothing to check the balance against.">
            {missing.length} account{missing.length === 1 ? "" : "s"} the ledger has never seen
          </CardTitle>
          <div className="space-y-1.5">
            {missing.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-700">{r.name}</span>
                <span className="tnum text-stone-500">{inr(r.finance)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
