import { useMemo, useRef, useState } from "react";
import { MessageSquare, Upload, Check, AlertTriangle, Plus, ArrowUpRight, ArrowDownLeft, Trash2 } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import { parseSmsBatch } from "../../lib/smsParse";
import { routeAlert, advanceRenewal } from "../../lib/alertRouter";
import { suggestCategory, matchAccount, toExpense } from "../../lib/alertToExpense";

// Bank SMS, pasted in.
//
// iOS gives no app any access to SMS, so there is nothing to poll and no
// integration to build. What works on every phone is copy-and-paste: open the
// bank's thread, select all, paste. Android can additionally export from SMS
// Backup & Restore and drop the XML file in.
//
// SMS matters because it arrives seconds after a transaction and covers cards
// that send no email at all — it fills the gap between spending money and the
// dashboard knowing, which statements close a month later.
//
// Everything the parser could NOT read is shown, not swallowed. The last
// parser scored 9/9 on invented samples and 0/27 on the real inbox because
// its failures were invisible.

const inr = (n) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

export default function SmsImport({
  accounts = [], categories = [], expenses = [], outgoings = [], financeLog = [],
  rate = 1, onAddExpense, onPayOutgoing,
}) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState({});
  const [logged, setLogged] = useState(() => new Set());
  const fileRef = useRef(null);

  // Anything this device has already been used to record — the same guard the
  // Gmail path uses, so pasting the same thread twice can't double-file.
  const already = useMemo(() => {
    const s = new Set((expenses || []).map((e) => e.gmailMessageId).filter(Boolean));
    for (const l of financeLog || []) if (l?.meta?.gmailMessageId) s.add(l.meta.gmailMessageId);
    return s;
  }, [expenses, financeLog]);

  const verdicts = useMemo(() => {
    const m = new Map();
    for (const a of result?.alerts || []) m.set(a.messageId, routeAlert(a, { outgoings, accounts, categories }));
    return m;
  }, [result, outgoings, accounts, categories]);

  const read = (raw) => {
    const parsed = parseSmsBatch(raw);
    setResult(parsed);
    setPicked({});
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setText(""); read(String(r.result || "")); };
    r.readAsText(f);
  };

  function logOne(a) {
    const v = verdicts.get(a.messageId) || routeAlert(a, { outgoings, accounts, categories });
    if (v.kind === "skip") return false;

    if ((v.kind === "card-payment" || v.kind === "outgoing") && v.outgoing) {
      if (!onPayOutgoing) return false;
      onPayOutgoing(v.outgoing.id, {
        date: a.date,
        amount: Number(a.amount) || 0,
        nextRenewal: advanceRenewal(v.outgoing, a.date),
        rate,
        gmailMessageId: a.messageId,
      });
    } else {
      const cat = picked[a.messageId] ?? suggestCategory(a, categories) ?? "Other";
      const record = toExpense(a, { accounts, category: cat, rate });
      if (!record) return false;
      onAddExpense?.(record);
    }
    setLogged((s) => new Set(s).add(a.messageId));
    return true;
  }

  const pending = (result?.alerts || []).filter(
    (a) => a.dir === "DR" && !logged.has(a.messageId) && !already.has(a.messageId)
  );
  const readyCount = pending.filter((a) => {
    const v = verdicts.get(a.messageId);
    return v && !v.needsReview && (v.outgoing || picked[a.messageId] || suggestCategory(a, categories));
  }).length;

  return (
    <div className="space-y-3">
      <Card className="p-5">
        <CardTitle sub="Open your bank's message thread, select all, copy, and paste here. On Android you can also export from SMS Backup & Restore and drop the XML file in. Nothing is recorded until you say so.">
          Import from SMS
        </CardTitle>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            // Read straight off the clipboard so a paste needs one action, not
            // a paste and then a button.
            const v = e.clipboardData?.getData("text");
            if (v && v.length > 40) { setTimeout(() => read(v), 0); }
          }}
          placeholder={"Paste your bank messages here…\n\nSent Rs.60.00 From HDFC Bank A/C x3752 To AYYAPPAN IDLI On 30/08/26"}
          rows={5}
          className="w-full mt-3 border border-line rounded-xl px-3 py-2.5 text-[13px] font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20 resize-y"
        />

        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <button
            onClick={() => read(text)}
            disabled={text.trim().length < 20}
            className="bg-night text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 transition-transform active:scale-[0.97]"
          >
            <MessageSquare size={13} /> Read messages
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-[12.5px] border border-line rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 hover:border-stone-300 transition-colors"
          >
            <Upload size={12} /> Upload backup file
          </button>
          <input ref={fileRef} type="file" accept=".xml,.txt,text/xml,text/plain" onChange={onFile} className="hidden" />
          {result && (
            <button
              onClick={() => { setResult(null); setText(""); setPicked({}); }}
              className="text-[12.5px] text-stone-400 hover:text-stone-600 inline-flex items-center gap-1 transition-colors"
            >
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>
      </Card>

      {result && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            {[["Messages read", result.total], ["Transactions found", result.alerts.length], ["Not transactions", result.unread.length]].map(([k, v]) => (
              <Card key={k} className="p-4">
                <div className="text-[10.5px] font-semibold text-stone-400 uppercase tracking-wide">{k}</div>
                <div className="text-[24px] font-bold tracking-tight tnum mt-0.5">{v}</div>
              </Card>
            ))}
          </div>

          {readyCount > 0 && (
            <button
              onClick={() => pending.forEach(logOne)}
              className="bg-night text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-transform active:scale-[0.97]"
            >
              <Plus size={12} /> Record all {readyCount}
            </button>
          )}

          <Card className="p-5">
            <CardTitle sub={result.alerts.length ? "Each one goes wherever it belongs — a subscription is marked paid, a card bill moves money without booking an expense." : "Nothing in that paste looked like a transaction."}>
              {result.alerts.length} transaction{result.alerts.length === 1 ? "" : "s"}
            </CardTitle>
            {result.alerts.length > 0 && (
              <div className="overflow-x-auto mt-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                      <th className="text-left font-semibold py-2 w-24">Date</th>
                      <th className="text-left font-semibold py-2">Who</th>
                      <th className="text-right font-semibold py-2 w-24 pr-5">Amount</th>
                      <th className="text-left font-semibold py-2 w-64">Where it goes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.alerts.map((a) => {
                      const v = verdicts.get(a.messageId) || { kind: "expense" };
                      const done = logged.has(a.messageId) || already.has(a.messageId);
                      const acct = matchAccount(a, accounts);
                      const guess = suggestCategory(a, categories);
                      const cat = picked[a.messageId] ?? guess ?? "";
                      return (
                        <tr key={a.messageId} className="border-b border-stone-100 last:border-0">
                          <td className="py-2 tnum text-stone-500 align-top">{a.date}</td>
                          <td className="py-2 align-top">
                            <span className="inline-flex items-center gap-1.5">
                              {a.dir === "DR"
                                ? <ArrowUpRight size={13} className="text-rose-500 shrink-0" />
                                : <ArrowDownLeft size={13} className="text-emerald-600 shrink-0" />}
                              <span className="truncate" title={a.text}>{a.payee || "(no name in the message)"}</span>
                            </span>
                            <div className="text-[11px] text-stone-400 mt-0.5">
                              {acct ? acct.name : a.accountTail ? `account ••${a.accountTail}` : "account unknown"}
                            </div>
                          </td>
                          <td className={`py-2 pr-5 text-right tnum font-medium align-top ${a.dir === "DR" ? "text-rose-600" : "text-emerald-700"}`}>
                            {a.dir === "DR" ? "−" : "+"}{inr(a.amount)}
                          </td>
                          <td className="py-2 align-top">
                            {a.dir !== "DR" ? (
                              <span className="text-[11.5px] text-stone-400">money in — not an expense</span>
                            ) : done ? (
                              <span className="text-[12px] text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> recorded</span>
                            ) : v.kind === "card-payment" && v.outgoing ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0 text-[11.5px] leading-tight">
                                  <span className="text-sky-800 font-medium">Pays down your card</span>
                                  <div className="text-stone-400">transfer — no expense booked</div>
                                </div>
                                <button onClick={() => logOne(a)} className="text-[12px] border border-line rounded-lg px-2 py-1 hover:border-stone-300 shrink-0 transition-colors">Apply</button>
                              </div>
                            ) : v.kind === "outgoing" && v.outgoing ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0 text-[11.5px] leading-tight">
                                  <span className="text-emerald-800 font-medium">Marks {v.outgoing.name} paid</span>
                                  <div className="text-stone-400">renews {advanceRenewal(v.outgoing, a.date)}</div>
                                </div>
                                <button onClick={() => logOne(a)} className="text-[12px] border border-line rounded-lg px-2 py-1 hover:border-stone-300 shrink-0 transition-colors">Apply</button>
                              </div>
                            ) : v.needsReview ? (
                              <span className="text-[11.5px] text-amber-800 inline-flex items-start gap-1">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {v.why || "Needs a look"}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={cat}
                                  onChange={(e) => setPicked((s) => ({ ...s, [a.messageId]: e.target.value }))}
                                  className={`text-[12px] px-2 py-1 rounded-lg border bg-white flex-1 min-w-0 ${guess && !picked[a.messageId] ? "border-emerald-200 text-emerald-800" : "border-line"}`}
                                >
                                  <option value="">Pick a category…</option>
                                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button onClick={() => logOne(a)} disabled={!cat} className="text-[12px] border border-line rounded-lg px-2 py-1 hover:border-stone-300 disabled:opacity-40 shrink-0 transition-colors">
                                  <Plus size={11} />
                                </button>
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
          </Card>

          {result.unread.length > 0 && (
            <Card className="p-5">
              <CardTitle sub="Shown rather than skipped — if a real transaction is in here, the parser needs fixing and you'd never know otherwise.">
                {result.unread.length} message{result.unread.length === 1 ? "" : "s"} weren't transactions
              </CardTitle>
              <div className="space-y-1 mt-1">
                {result.unread.slice(0, 25).map((u, i) => (
                  <div key={i} className="text-[12px] py-1.5 border-b border-stone-100 last:border-0">
                    <span className="text-stone-400">{u.reason}</span>
                    <div className="text-stone-600 truncate" title={u.text}>{u.text}</div>
                  </div>
                ))}
                {result.unread.length > 25 && (
                  <p className="text-[11.5px] text-stone-400 pt-1">…and {result.unread.length - 25} more.</p>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
