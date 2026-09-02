import { useMemo, useState } from "react";
import { Check, Loader2, Layers, Undo2 } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import { useLedger } from "../../hooks/useLedger";
import { uncategorised, similar, suggestFor, applyCategory } from "../../lib/categorise";

// The spending nothing could explain, made explainable.
//
// These transactions are real and they already count in every total — they
// just belong to no category, so no budget can see them and no breakdown can
// say what they were. Most are person-to-person UPI payments, which is why
// only a handful get a useful suggestion: there's no merchant name to
// recognise, and only Charles knows who Simran Das is.
//
// So the design goal is speed rather than cleverness. Biggest first (they
// matter most and there are few of them), one dropdown per row, and a bulk
// action for the case that actually repeats — the same payee, over and over.

const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function Categorise({ categories = [], token }) {
  const { entries, save, loading, error } = useLedger(token);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState({ count: 0, amount: 0 });
  const [note, setNote] = useState("");

  const rows = useMemo(() => uncategorised(entries || []), [entries]);
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const commit = async (ids, category) => {
    if (!ids.length || !category) return;
    setBusy(true); setNote("");
    try {
      const next = applyCategory(entries, ids, category);
      await save(next);
      const amount = rows.filter((r) => ids.includes(r.id)).reduce((s, r) => s + r.amount, 0);
      setDone((d) => ({ count: d.count + ids.length, amount: d.amount + amount }));
      setPicked((p) => {
        const q = { ...p };
        for (const id of ids) delete q[id];
        return q;
      });
    } catch (e) {
      // Surfaced rather than swallowed: a failed save here means the ledger
      // still says uncategorised, and silently clearing the row would leave
      // you thinking it was filed.
      setNote(e.message || "That didn't save — nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const readyIds = rows.filter((r) => picked[r.id]).map((r) => r.id);

  if (loading) {
    return <Card className="p-6 text-sm text-stone-400 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Reading the ledger…</Card>;
  }
  if (error) return <Card className="p-6 text-sm text-rose-600">{error}</Card>;

  return (
    <div className="space-y-3">
      <Card className="p-5">
        <CardTitle sub={rows.length
          ? "Real spending that belongs to no category — it counts in your totals but no budget can see it. Biggest first."
          : "Everything in the ledger has a category."}>
          {rows.length ? `${rows.length} to sort — ${inr(total)}` : "Nothing left to sort"}
        </CardTitle>

        {done.count > 0 && (
          <div className="flex items-center gap-2 text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5 mt-3">
            <Check size={14} className="shrink-0" />
            Filed {done.count} transaction{done.count === 1 ? "" : "s"} worth {inr(done.amount)}. They now count towards their budgets.
          </div>
        )}
        {note && (
          <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2.5 mt-3">{note}</div>
        )}

        {readyIds.length > 1 && (
          <div className="mt-3">
            <button
              disabled={busy}
              onClick={() => {
                // Grouped by chosen category so one pass can file several
                // different ones without a save per row.
                const groups = {};
                for (const id of readyIds) (groups[picked[id]] ||= []).push(id);
                (async () => {
                  for (const [cat, ids] of Object.entries(groups)) await commit(ids, cat);
                })();
              }}
              className="bg-night text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50 transition-transform active:scale-[0.97]"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              File all {readyIds.length} chosen
            </button>
          </div>
        )}
      </Card>

      {rows.length > 0 && (
        <Card className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                  <th className="text-left font-semibold py-2 w-24">Date</th>
                  <th className="text-left font-semibold py-2">Who</th>
                  <th className="text-right font-semibold py-2 w-24 pr-5">Amount</th>
                  <th className="text-left font-semibold py-2 w-72">Category</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const guess = suggestFor(r, categories);
                  const value = picked[r.id] ?? guess ?? "";
                  const alike = similar(r, rows);
                  return (
                    <tr key={r.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-2.5 tnum text-stone-500 align-top">{r.date}</td>
                      <td className="py-2.5 align-top">
                        <div className="truncate max-w-[16rem]" title={r.memo}>{r.payee}</div>
                        {alike.length > 0 && (
                          <div className="text-[11px] text-stone-400 mt-0.5">
                            {alike.length} more to the same person, {inr(alike.reduce((s, x) => s + x.amount, 0))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-5 text-right tnum font-medium align-top">{inr(r.amount)}</td>
                      <td className="py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={value}
                            disabled={busy}
                            onChange={(e) => setPicked((p) => ({ ...p, [r.id]: e.target.value }))}
                            className={`text-[12px] px-2 py-1 rounded-lg border bg-white flex-1 min-w-0 ${
                              guess && !picked[r.id] ? "border-emerald-200 text-emerald-800" : "border-line"
                            }`}
                          >
                            <option value="">Pick a category…</option>
                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <button
                            disabled={!value || busy}
                            onClick={() => commit([r.id], value)}
                            className="text-[12px] border border-line rounded-lg px-2 py-1 hover:border-stone-300 disabled:opacity-40 transition-colors shrink-0"
                          >
                            File
                          </button>
                          {alike.length > 0 && (
                            <button
                              disabled={!value || busy}
                              title={`File this and the other ${alike.length} to ${r.payee}`}
                              onClick={() => commit([r.id, ...alike.map((a) => a.id)], value)}
                              className="text-[12px] border border-line rounded-lg px-2 py-1 hover:border-stone-300 disabled:opacity-40 transition-colors shrink-0 inline-flex items-center gap-1"
                            >
                              <Layers size={11} /> +{alike.length}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11.5px] text-stone-400 mt-3">
            Only the category changes. Amounts, dates and the account the money left are untouched, so nothing here can move a balance.
          </p>
        </Card>
      )}
    </div>
  );
}
