import { useState } from "react";
import { Plus, Pencil, Trash2, RotateCcw } from "lucide-react";
import Card from "./Card";
import { useCurrency } from "../../hooks/useCurrency";
import {
  BUDGET_PERIOD_LIST, spentOn, budgetStatus, bookOf, bookMeta,
  budgetPeriodLabel, isBudgetExpired, budgetWindow,
} from "../../lib/finance";
import { CURRENCIES, convertBetween } from "../../lib/currency";
import CategorySelect from "./CategorySelect";
import { today } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Spending limits per category, measured against real expenses in the current
 * period. Nothing here blocks a spend — it reports. A budget that refuses to
 * let you record what actually happened would just make the expense log lie.
 */
export default function Budgets({
  budgets = [], expenses = [], categories = [], book = "all",
  onAddCategory, onAdd, onUpdate, onDelete,
}) {
  const { moneyFrom, rate } = useCurrency();
  const [editing, setEditing] = useState(null);
  const convertAmount = (amount, from, to) => convertBetween(amount, from, to, rate);

  // Filtered by the page's book selector rather than a second one in here —
  // one control for "whose money am I looking at" beats a per-card control
  // that can silently disagree with the totals above it.
  const visible = book === "all" ? budgets : budgets.filter((b) => bookOf(b) === book);

  /**
   * Rolls a finished custom budget into a fresh window of the same length,
   * starting today. This is the "set a budget for a period, then reset it"
   * loop — done as an explicit action rather than an automatic roll, because
   * a budget that renewed itself would keep reporting against a project
   * nobody is spending on any more.
   */
  const renew = (b) => {
    const { from, to } = budgetWindow(b);
    const days = from && to
      ? Math.max(1, Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000))
      : 30;
    const start = today();
    const end = new Date(`${start}T12:00:00`);
    end.setDate(end.getDate() + days);
    onUpdate?.(b.id, { startDate: start, endDate: end.toISOString().slice(0, 10) });
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Budgets</div>
          <div className="text-xs text-stone-400 mt-0.5">
            {visible.length === 0 ? "Set a limit per category and track against it" : "This period, against logged expenses"}
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
        {visible.map((b, i) => {
          // Spend is summed in the BUDGET's currency (see spentOn) so a ₹
          // limit is never compared against a $ total.
          const spentNative = spentOn(b, expenses, convertAmount);
          const status = budgetStatus(spentNative, Number(b.limit) || 0);
          const remaining = (Number(b.limit) || 0) - spentNative;
          const expired = isBudgetExpired(b);

          return (
            <div
              key={b.id}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className={`group rounded-xl border p-3
                motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                transition-colors duration-200 ${EASE}
                ${expired ? "border-dashed border-stone-200 bg-stone-50/60" : "border-line hover:border-stone-300"}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-stone-800 truncate flex items-center gap-1.5">
                    {b.category}
                    {/* Only the personal tag is drawn. Business is the
                        default and the overwhelming majority, so badging it
                        too would put a chip on almost every row and stop the
                        chip meaning anything. */}
                    {bookOf(b) === "personal" && (
                      <span className={`text-[9.5px] font-medium rounded-full px-1.5 py-px ring-1 shrink-0 ${bookMeta("personal").chip}`}>
                        Personal
                      </span>
                    )}
                  </div>
                  <div className={`text-[11px] ${expired ? "text-stone-300" : "text-stone-400"}`}>
                    {budgetPeriodLabel(b)}
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
                    {/* Only offered once a custom window has actually ended.
                        Rolling a budget that's still running would throw away
                        the spend it has already counted. */}
                    {expired && (
                      <button onClick={() => renew(b)} aria-label="Start a new period"
                        title="Start a new period of the same length"
                        className="p-1 rounded-md text-stone-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors">
                        <RotateCcw size={11} />
                      </button>
                    )}
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
        {visible.length === 0 && (
          <div className="text-xs text-stone-300 py-6 text-center">No budgets set.</div>
        )}
      </div>

      {/* key={editing} is load-bearing, not decoration. The list stays
          clickable while this form is open, so `editing` can go straight from
          one row's id to another's. Same component, same position, so React
          reuses the instance and the useState initialisers below never re-run
          — the form kept showing the FIRST row's values while saving onto the
          SECOND row's id. Silent overwrite of the wrong record. The key forces
          a remount whenever the target changes. */}
      {editing && (
        <BudgetForm
          key={editing}
          budget={editing === "new" ? null : budgets.find((b) => b.id === editing)}
          categories={categories}
          defaultBook={book === "all" ? "business" : book}
          onAddCategory={onAddCategory}
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

function BudgetForm({ budget, categories, onAddCategory, onSave, onCancel, defaultBook = "business" }) {
  const [form, setForm] = useState({
    category: budget?.category || "Software",
    limit: budget?.limit ?? "",
    currency: budget?.currency || "INR",
    period: budget?.period || "monthly",
    // Inherits whichever book the page is filtered to, so adding a budget
    // while looking at Personal doesn't silently file it under Business.
    book: budget ? bookOf(budget) : defaultBook,
    startDate: budget?.startDate || today(),
    endDate: budget?.endDate || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";

  return (
    <div className="mt-4 pt-4 border-t border-line motion-safe:animate-fade-up">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <CategorySelect
          label="Category"
          value={form.category}
          onChange={(v) => setForm((f) => ({ ...f, category: v }))}
          categories={categories}
          onAddCategory={onAddCategory}
        />
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
        <div>
          <label className={label}>Book</label>
          <select className={input} value={form.book} onChange={set("book")}>
            <option value="business">Eden Labs</option>
            <option value="personal">Personal</option>
          </select>
        </div>
      </div>

      {/* Dates only exist for a custom window — a monthly budget's window is
          derived from the calendar, and offering editable dates for it would
          imply they change something. */}
      {form.period === "custom" && (
        <div className="grid grid-cols-2 gap-2.5 mt-2.5 motion-safe:animate-fade-up">
          <div>
            <label className={label}>Starts</label>
            <input className={input} type="date" value={form.startDate} onChange={set("startDate")} />
          </div>
          <div>
            <label className={label}>Ends</label>
            <input className={input} type="date" value={form.endDate} onChange={set("endDate")} min={form.startDate} />
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ ...form, limit: Number(form.limit) || 0 })}
          // A custom budget with no end date would never expire and never
          // reset — the one shape this feature exists to avoid.
          disabled={!form.limit || (form.period === "custom" && !form.endDate)}
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
