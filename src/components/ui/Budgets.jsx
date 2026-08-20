import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import Card from "./Card";
import { useCurrency } from "../../hooks/useCurrency";
import { BUDGET_PERIOD_LIST, spentOn, budgetStatus } from "../../lib/finance";
import { CURRENCIES, convertBetween } from "../../lib/currency";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const CATEGORIES = ["Software", "Utilities", "Rent", "Contractor", "Marketing", "Travel", "Other"];

/**
 * Spending limits per category, measured against real expenses in the current
 * period. Nothing here blocks a spend — it reports. A budget that refuses to
 * let you record what actually happened would just make the expense log lie.
 */
export default function Budgets({ budgets = [], expenses = [], onAdd, onUpdate, onDelete }) {
  const { moneyFrom, rate } = useCurrency();
  const [editing, setEditing] = useState(null);
  const convertAmount = (amount, from, to) => convertBetween(amount, from, to, rate);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Budgets</div>
          <div className="text-xs text-stone-400 mt-0.5">
            {budgets.length === 0 ? "Set a limit per category and track against it" : "This period, against logged expenses"}
          </div>
        </div>
        <button
          onClick={() => setEditing("new")}
          className={`flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200
            rounded-lg px-2.5 py-1.5 shrink-0 transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-100`}
        >
          <Plus size={13} /> Budget
        </button>
      </div>

      <div className="space-y-2.5">
        {budgets.map((b, i) => {
          // Spend is summed in the BUDGET's currency (see spentOn) so a ₹
          // limit is never compared against a $ total.
          const spentNative = spentOn(b, expenses, convertAmount);
          const status = budgetStatus(spentNative, Number(b.limit) || 0);
          const remaining = (Number(b.limit) || 0) - spentNative;

          return (
            <div
              key={b.id}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className={`group rounded-xl border border-line p-3
                motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                transition-colors duration-200 ${EASE} hover:border-stone-300`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-stone-800 truncate">{b.category}</div>
                  <div className="text-[11px] text-stone-400">
                    {b.period === "yearly" ? "This year" : "This month"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-[13px] font-semibold text-stone-700 tabular-nums">
                      {moneyFrom(spentNative, b.currency)}
                      <span className="text-stone-300 font-normal"> / {moneyFrom(b.limit, b.currency)}</span>
                    </div>
                    <div className={`text-[10px] ${
                      status.tone === "rose" ? "text-rose-600" : status.tone === "amber" ? "text-amber-600" : "text-stone-400"
                    }`}>
                      {remaining >= 0
                        ? `${moneyFrom(remaining, b.currency)} left`
                        : `${moneyFrom(Math.abs(remaining), b.currency)} over`}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                    <button onClick={() => setEditing(b.id)} aria-label="Edit budget"
                      className="p-1 rounded-md text-stone-300 hover:text-stone-700 hover:bg-stone-100 transition-colors">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => onDelete?.(b.id)} aria-label="Delete budget"
                      className="p-1 rounded-md text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>

              {/* scaleX rather than width — transform stays off the layout/
                  paint path, so the bar animates on the GPU. */}
              <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className={`h-full w-full rounded-full origin-left transition-transform duration-300 ${EASE} ${status.bar}`}
                  style={{ transform: `scaleX(${Math.min(1, status.pct / 100)})` }}
                />
              </div>
            </div>
          );
        })}
        {budgets.length === 0 && (
          <div className="text-xs text-stone-300 py-6 text-center">No budgets set.</div>
        )}
      </div>

      {editing && (
        <BudgetForm
          budget={editing === "new" ? null : budgets.find((b) => b.id === editing)}
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

function BudgetForm({ budget, onSave, onCancel }) {
  const [form, setForm] = useState({
    category: budget?.category || "Software",
    limit: budget?.limit ?? "",
    currency: budget?.currency || "INR",
    period: budget?.period || "monthly",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";

  return (
    <div className="mt-4 pt-4 border-t border-line motion-safe:animate-fade-up">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div>
          <label className={label}>Category</label>
          <select className={input} value={form.category} onChange={set("category")} autoFocus>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Limit</label>
          <input className={input} type="number" value={form.limit} onChange={set("limit")} placeholder="0" />
        </div>
        <div>
          <label className={label}>Currency</label>
          <select className={input} value={form.currency} onChange={set("currency")}>
            {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Period</label>
          <select className={input} value={form.period} onChange={set("period")}>
            {BUDGET_PERIOD_LIST.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ ...form, limit: Number(form.limit) || 0 })}
          disabled={!form.limit}
          className={`text-xs font-medium bg-emerald-800 text-white rounded-lg px-3 py-1.5
            transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-900 disabled:opacity-40`}
        >
          {budget ? "Save" : "Add budget"}
        </button>
        <button onClick={onCancel} className="text-xs text-stone-500 px-3 py-1.5 hover:text-stone-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
