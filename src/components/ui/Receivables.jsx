import { useState } from "react";
import { Plus, Trash2, Check, HandCoins, FileWarning, Pencil } from "lucide-react";
import Card from "./Card";
import Badge from "./Badge";
import { useCurrency } from "../../hooks/useCurrency";
import { buildReceivables, bookOf, bookMeta, inBook } from "../../lib/finance";
import { CURRENCIES } from "../../lib/currency";
import { today, formatLongDate } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Money owed to you.
 *
 * Two sources, one list. Loans you recorded by hand, plus every client
 * invoice that has gone past its due date — the second kind is DERIVED from
 * the invoices rather than copied into this collection, so an invoice that
 * gets paid simply stops appearing here. A copied row would have to be kept
 * in sync by hand and would otherwise sit there claiming money that already
 * arrived.
 *
 * Invoice rows are deliberately not editable or settleable from here: the
 * way to settle one is to mark the invoice paid on the Invoices tab, and a
 * second button that did it from a second place is how two records start
 * disagreeing about whether you've been paid.
 */
export default function Receivables({
  loans = [], invoices = [], clients = [], accounts = [], book = "all",
  onAdd, onUpdate, onDelete, onSettle,
}) {
  const { moneyIn, rate } = useCurrency();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const rows = inBook(buildReceivables(loans, invoices, clients), book);
  const accountNameOf = (r) =>
    r.kind === "loan"
      ? (accounts.find((a) => a.id === r.source?.lentFromAccountId)?.name || "")
      : "";

  // Totals are per-currency rather than one summed figure. Adding ₹ to $
  // produces a number that is wrong in both, and this list is exactly where
  // mixed currencies are normal — a rupee loan to a friend sitting next to a
  // dollar invoice to a US client.
  const byCurrency = rows.reduce((acc, r) => {
    acc[r.currency] = (acc[r.currency] || 0) + r.amount;
    return acc;
  }, {});

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Owed to you</div>
          <div className="text-xs text-stone-400 mt-0.5">
            {rows.length === 0
              ? "Money you've lent, plus any invoice past its due date"
              : Object.entries(byCurrency)
                  .map(([code, total]) => moneyIn(total, code))
                  .join(" · ") + ` outstanding`}
          </div>
        </div>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className={`flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200
            rounded-lg px-2.5 py-1.5 shrink-0 transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-100`}
        >
          <Plus size={13} /> Lent out
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => {
          const isInvoice = r.kind === "invoice";
          const editing = editingId === r.id;
          if (editing) {
            return (
              <LoanForm
                key={r.id}
                loan={r.source}
                accounts={accounts}
                onCancel={() => setEditingId(null)}
                onSave={(patch) => { onUpdate?.(r.id, patch); setEditingId(null); }}
              />
            );
          }
          return (
            <div
              key={`${r.kind}-${r.id}`}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className={`group flex items-center gap-3 rounded-xl border p-3
                motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                transition-colors duration-200 ${EASE}
                ${r.overdueBy > 0 ? "border-rose-200 bg-rose-50/40" : "border-line hover:border-stone-300"}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                ${isInvoice ? "bg-sky-50 text-sky-600" : "bg-violet-50 text-violet-600"}`}>
                {isInvoice ? <FileWarning size={15} /> : <HandCoins size={15} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-stone-800 truncate flex items-center gap-1.5">
                  {r.name}
                  {bookOf(r) === "personal" && (
                    <span className={`text-[9.5px] font-medium rounded-full px-1.5 py-px ring-1 shrink-0 ${bookMeta("personal").chip}`}>
                      Personal
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-stone-400 truncate">
                  {r.reason || (isInvoice ? "Unpaid invoice" : "Lent")}
                  {r.dueDate && ` · due ${formatLongDate(r.dueDate)}`}
                  {/* Named so the balance drop on that account has a visible
                      cause — an unexplained withdrawal is the thing that
                      makes people stop trusting the numbers. */}
                  {accountNameOf(r) && ` · from ${accountNameOf(r)}`}
                </div>
              </div>

              {r.overdueBy > 0 && (
                <Badge tone="rose">{r.overdueBy}d late</Badge>
              )}

              <div className="text-[13px] font-semibold text-stone-700 tabular-nums shrink-0">
                {moneyIn(r.amount, r.currency)}
              </div>

              <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                {isInvoice ? (
                  // No actions. An invoice is settled by marking it paid on
                  // the Invoices tab — the one place that also moves the
                  // money into an account and writes the activity entry.
                  <span className="text-[10px] text-stone-300 px-1">On Invoices tab</span>
                ) : (
                  <>
                    <button onClick={() => onSettle?.(r.id, { rate })} aria-label="Mark repaid"
                      title="Mark repaid"
                      className="p-1 rounded-md text-stone-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors">
                      <Check size={12} />
                    </button>
                    <button onClick={() => { setEditingId(r.id); setAdding(false); }} aria-label="Edit"
                      className="p-1 rounded-md text-stone-300 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => onDelete?.(r.id)} aria-label="Delete"
                      className="p-1 rounded-md text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="text-xs text-stone-300 py-6 text-center">Nothing outstanding.</div>
        )}
      </div>

      {adding && (
        <LoanForm
          accounts={accounts}
          defaultBook={book === "all" ? "personal" : book}
          onCancel={() => setAdding(false)}
          onSave={(patch) => { onAdd?.(patch, rate); setAdding(false); }}
        />
      )}
    </Card>
  );
}

function LoanForm({ loan, accounts = [], onSave, onCancel, defaultBook = "personal" }) {
  // Editing never re-runs the withdrawal — addLoan is what moves money, and
  // an edit that silently debited the account a second time would be the
  // worst kind of bug here. So the account is chosen once, at creation.
  const isEdit = !!loan;
  const [form, setForm] = useState({
    person: loan?.person || "",
    reason: loan?.reason || "",
    amount: loan?.amount ?? "",
    currency: loan?.currency || "INR",
    date: loan?.date || today(),
    dueDate: loan?.dueDate || "",
    // Lending money is usually personal — the business equivalent is an
    // invoice, which this list already picks up on its own.
    book: loan ? bookOf(loan) : defaultBook,
    accountId: loan?.accountId || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";

  return (
    <div className="mt-4 pt-4 border-t border-line motion-safe:animate-fade-up">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="col-span-2">
          <label className={label}>Who</label>
          <input className={input} value={form.person} onChange={set("person")} placeholder="Their name" autoFocus />
        </div>
        <div>
          <label className={label}>Amount</label>
          <input className={input} type="number" value={form.amount} onChange={set("amount")} placeholder="0" />
        </div>
        <div>
          <label className={label}>Currency</label>
          <select className={input} value={form.currency} onChange={set("currency")}>
            {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-2.5">
        <label className={label}>What for</label>
        <input className={input} value={form.reason} onChange={set("reason")} placeholder="Why you lent it — the bit you'll have forgotten in three months" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5">
        <div>
          <label className={label}>Lent on</label>
          <input className={input} type="date" value={form.date} onChange={set("date")} />
        </div>
        <div>
          <label className={label}>Expected back</label>
          <input className={input} type="date" value={form.dueDate} onChange={set("dueDate")} min={form.date} />
        </div>
        <div>
          <label className={label}>Book</label>
          <select className={input} value={form.book} onChange={set("book")}>
            <option value="personal">Personal</option>
            <option value="business">Eden Labs</option>
          </select>
        </div>
        <div className={isEdit ? "hidden" : ""}>
          <label className={label}>Paid from</label>
          {/* Picking an account actually MOVES the money: the balance drops
              by this amount now, and goes back up when the loan is marked
              repaid. "Don't track" exists for cash, or for money lent from
              an account this dashboard doesn't hold. */}
          <select className={input} value={form.accountId} onChange={set("accountId")}>
            <option value="">Don't touch any balance</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ ...form, amount: Number(form.amount) || 0 })}
          disabled={!form.person.trim() || !form.amount}
          className={`text-xs font-medium bg-emerald-800 text-white rounded-lg px-3 py-1.5
            transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-900 disabled:opacity-40`}
        >
          {loan ? "Save" : "Add"}
        </button>
        <button onClick={onCancel} className="text-xs text-stone-500 px-3 py-1.5 hover:text-stone-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
