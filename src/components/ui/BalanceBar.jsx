import { useState } from "react";
import { Eye, EyeOff, Plus, Pencil, Trash2, CreditCard, Wallet } from "lucide-react";
import Card from "./Card";
import { useCurrency } from "../../hooks/useCurrency";
import { ACCOUNT_TYPE_LIST, accountMeta, isCredit } from "../../lib/finance";
import { CURRENCIES } from "../../lib/currency";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The balance bar: what's actually in each account, plus net worth.
 *
 * Balances start HIDDEN on every load and reveal only while this component is
 * mounted — deliberately not persisted, unlike the global "hide amounts"
 * setting. A persisted reveal defeats the point: the whole reason to hide a
 * bank balance is that someone might be looking at the screen, and that risk
 * resets every time the page opens, not once when you last chose.
 *
 * The global hideAmounts toggle still wins on top of this — if amounts are
 * hidden app-wide, no local reveal should override it.
 */
export default function BalanceBar({ accounts = [], onAdd, onUpdate, onDelete }) {
  const { moneyFrom, convertFrom, currency, hideAmounts } = useCurrency();
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(null); // account id, or "new"

  const show = revealed && !hideAmounts;

  // Net worth sums everything into the DISPLAY currency — the one place where
  // mixing a ₹ account and a $ account is meaningful, since it's explicitly a
  // "what am I worth right now" number rather than a stored value.
  const netWorth = accounts.reduce((sum, a) => {
    const val = convertFrom(Number(a.balance) || 0, a.currency);
    return sum + (isCredit(a) ? -val : val);
  }, 0);

  const assets = accounts.filter((a) => !isCredit(a));
  const cards = accounts.filter(isCredit);

  const fmt = (n, from) => (show ? moneyFrom(n, from) : "••••••");

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-stone-900 tracking-tight">Balances</span>
            <button
              onClick={() => setRevealed((v) => !v)}
              aria-label={show ? "Hide balances" : "Show balances"}
              title={hideAmounts ? "Amounts are hidden app-wide — turn that off first" : undefined}
              disabled={hideAmounts}
              className={`p-1.5 rounded-lg text-stone-400 transition-transform duration-150 ${EASE}
                active:scale-[0.92] disabled:opacity-40 disabled:cursor-not-allowed
                hover:bg-stone-100 hover:text-stone-700`}
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <div className="text-xs text-stone-400 mt-0.5">
            {accounts.length === 0
              ? "Add your accounts to see everything in one place"
              : <>Net worth <span className="font-semibold text-stone-600 tabular-nums">{fmt(netWorth, currency)}</span></>}
          </div>
        </div>
        <button
          onClick={() => setEditing("new")}
          className={`flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200
            rounded-lg px-2.5 py-1.5 shrink-0 transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-100`}
        >
          <Plus size={13} /> Account
        </button>
      </div>

      {accounts.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[...assets, ...cards].map((a, i) => {
            const meta = accountMeta(a.type);
            const credit = isCredit(a);
            const utilisation = credit && Number(a.limit) > 0
              ? Math.min(100, (Math.abs(Number(a.balance) || 0) / Number(a.limit)) * 100)
              : null;
            return (
              <div
                key={a.id}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                className={`group relative rounded-xl border border-line p-3 bg-white
                  motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                  transition-colors duration-200 ${EASE} hover:border-stone-300`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                  <span className="text-[11px] font-medium text-stone-500 truncate">{a.name || meta.label}</span>
                  {credit ? <CreditCard size={11} className="text-stone-300 shrink-0 ml-auto" />
                          : <Wallet size={11} className="text-stone-300 shrink-0 ml-auto" />}
                </div>

                <div className={`text-[17px] font-semibold tabular-nums tracking-tight ${credit ? "text-rose-700" : "text-stone-900"}`}>
                  {fmt(a.balance, a.currency)}
                </div>

                {/* A card's own currency is worth showing when it differs from
                    what's on screen — otherwise "$1,200" next to "₹1,200" is
                    ambiguous about whether conversion happened. */}
                {a.currency !== currency && show && (
                  <div className="text-[10px] text-stone-400 mt-0.5">
                    {CURRENCIES[a.currency]?.symbol}{Number(a.balance).toLocaleString()} {a.currency}
                  </div>
                )}

                {utilisation !== null && show && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-transform duration-300 ${EASE} origin-left
                          ${utilisation >= 80 ? "bg-rose-500" : utilisation >= 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ transform: `scaleX(${utilisation / 100})`, width: "100%" }}
                      />
                    </div>
                    <div className="text-[10px] text-stone-400 mt-1">{Math.round(utilisation)}% of limit used</div>
                  </div>
                )}

                {(a.billDate || a.dueDate) && (
                  <div className="text-[10px] text-stone-400 mt-1.5">
                    {a.billDate && <>Bills {a.billDate}</>}
                    {a.billDate && a.dueDate && " · "}
                    {a.dueDate && <>Due {a.dueDate}</>}
                  </div>
                )}

                <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                  <button onClick={() => setEditing(a.id)} aria-label="Edit account"
                    className="p-1 rounded-md text-stone-300 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => onDelete?.(a.id)} aria-label="Delete account"
                    className="p-1 rounded-md text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <AccountForm
          account={editing === "new" ? null : accounts.find((a) => a.id === editing)}
          onCancel={() => setEditing(null)}
          onSave={(patch) => {
            if (editing === "new") onAdd?.(patch);
            else onUpdate?.(editing, patch);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function AccountForm({ account, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: account?.name || "",
    type: account?.type || "main",
    balance: account?.balance ?? "",
    currency: account?.currency || "INR",
    limit: account?.limit ?? "",
    billDate: account?.billDate || "",
    dueDate: account?.dueDate || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const credit = accountMeta(form.type).kind === "credit";
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";

  return (
    <div className="mt-4 pt-4 border-t border-line motion-safe:animate-fade-up">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="col-span-2 sm:col-span-1">
          <label className={label}>Name</label>
          <input className={input} value={form.name} onChange={set("name")} placeholder="e.g. HDFC Main" autoFocus />
        </div>
        <div>
          <label className={label}>Type</label>
          <select className={input} value={form.type} onChange={set("type")}>
            {ACCOUNT_TYPE_LIST.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{credit ? "Owed" : "Balance"}</label>
          <input className={input} type="number" value={form.balance} onChange={set("balance")} placeholder="0" />
        </div>
        <div>
          <label className={label}>Currency</label>
          <select className={input} value={form.currency} onChange={set("currency")}>
            {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        {credit && (
          <>
            <div>
              <label className={label}>Credit limit</label>
              <input className={input} type="number" value={form.limit} onChange={set("limit")} placeholder="0" />
            </div>
            <div>
              <label className={label}>Bill date</label>
              <input className={input} type="date" value={form.billDate} onChange={set("billDate")} />
            </div>
            <div>
              <label className={label}>Payment due</label>
              <input className={input} type="date" value={form.dueDate} onChange={set("dueDate")} />
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({
            ...form,
            balance: Number(form.balance) || 0,
            limit: Number(form.limit) || 0,
          })}
          disabled={!form.name.trim()}
          className={`text-xs font-medium bg-emerald-800 text-white rounded-lg px-3 py-1.5
            transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-900 disabled:opacity-40`}
        >
          {account ? "Save" : "Add account"}
        </button>
        <button onClick={onCancel} className="text-xs text-stone-500 px-3 py-1.5 hover:text-stone-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
