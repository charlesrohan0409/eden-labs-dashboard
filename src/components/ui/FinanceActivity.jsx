import { useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Repeat, Ban, RotateCcw, Target,
  AlertTriangle, Wallet, Receipt,
} from "lucide-react";
import Card from "./Card";
import PillTabs from "./PillTabs";
import { useCurrency } from "../../hooks/useCurrency";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

// Each event type carries its own icon and tone. Written out literally rather
// than composed, same reason every other *_META in this codebase is: Tailwind
// only sees class names it can read in the source.
const EVENT_META = {
  income_recorded:        { icon: ArrowDownLeft,  tone: "text-emerald-600", chip: "bg-emerald-50", label: "Income" },
  income_reversed:        { icon: RotateCcw,      tone: "text-stone-500",   chip: "bg-stone-100",  label: "Reversed" },
  expense_recorded:       { icon: ArrowUpRight,   tone: "text-rose-600",    chip: "bg-rose-50",    label: "Expense" },
  outgoing_paid:          { icon: Repeat,         tone: "text-rose-600",    chip: "bg-rose-50",    label: "Recurring" },
  subscription_added:     { icon: Repeat,         tone: "text-violet-600",  chip: "bg-violet-50",  label: "Subscription" },
  bill_added:             { icon: Receipt,        tone: "text-amber-600",   chip: "bg-amber-50",   label: "Bill" },
  subscription_cancelled: { icon: Ban,            tone: "text-stone-500",   chip: "bg-stone-100",  label: "Cancelled" },
  subscription_resumed:   { icon: RotateCcw,      tone: "text-emerald-600", chip: "bg-emerald-50", label: "Resumed" },
  budget_created:         { icon: Target,         tone: "text-sky-600",     chip: "bg-sky-50",     label: "Budget" },
  budget_exceeded:        { icon: AlertTriangle,  tone: "text-rose-600",    chip: "bg-rose-50",    label: "Over budget" },
  account_added:          { icon: Wallet,         tone: "text-stone-600",   chip: "bg-stone-100",  label: "Account" },
};
const metaFor = (type) => EVENT_META[type] || EVENT_META.expense_recorded;

// Money in vs money out is the split people actually want to filter on;
// everything else is bookkeeping noise by comparison.
const MONEY_IN = new Set(["income_recorded"]);
const MONEY_OUT = new Set(["expense_recorded", "outgoing_paid"]);

function whenLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + `, ${time}`;
}

const dayKey = (iso) => String(iso || "").slice(0, 10);

/**
 * Chronological record of every money event.
 *
 * Balances answer "where am I"; this answers "how did I get here", which is
 * the difference between a ₹4,000 discrepancy being explainable and not.
 * Written by the mutations themselves rather than by the UI, so an event
 * can't be missed by a caller that forgot to log it.
 */
export default function FinanceActivity({ log = [] }) {
  const { moneyFrom } = useCurrency();
  const [filter, setFilter] = useState("all");

  const visible = log
    .filter((e) =>
      filter === "all" ? true
      : filter === "in" ? MONEY_IN.has(e.type)
      : filter === "out" ? MONEY_OUT.has(e.type)
      : !MONEY_IN.has(e.type) && !MONEY_OUT.has(e.type))
    .slice()
    .reverse();

  // Grouped by day so a month-end review reads as a sequence of days rather
  // than one undifferentiated scroll.
  const groups = [];
  visible.forEach((e) => {
    const key = dayKey(e.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(e);
    else groups.push({ key, items: [e] });
  });

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Activity</div>
          <div className="text-xs text-stone-400 mt-0.5">
            {log.length === 0
              ? "Every money event lands here as it happens"
              : `${log.length} event${log.length === 1 ? "" : "s"} recorded`}
          </div>
        </div>
      </div>

      <PillTabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "in", label: "Money in" },
          { value: "out", label: "Money out" },
          { value: "other", label: "Changes" },
        ]}
      />

      <div className="mt-3 max-h-[420px] overflow-y-auto pr-1 -mr-1">
        {groups.map(({ key, items }) => (
          <div key={key}>
            <div className="flex items-center gap-2 py-2 sticky top-0 bg-white">
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide">
                {whenLabel(items[0].at).split(",")[0]}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-1">
              {items.map((e, i) => {
                const meta = metaFor(e.type);
                const Icon = meta.icon;
                const amount = Number(e.amount) || 0;
                const signed = amount > 0 ? "+" : "";
                return (
                  <div
                    key={e.id}
                    style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                    className={`flex items-center gap-2.5 rounded-xl px-2 py-2
                      motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                      transition-colors duration-150 ${EASE} hover:bg-stone-50`}
                  >
                    <span className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${meta.chip}`}>
                      <Icon size={13} className={meta.tone} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-stone-800 truncate">{e.description || e.title}</span>
                      <span className="block text-[11px] text-stone-400">
                        {meta.label} · {whenLabel(e.at).split(", ")[1] || ""}
                      </span>
                    </span>
                    {amount !== 0 && (
                      <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${
                        amount > 0 ? "text-emerald-700" : "text-stone-700"
                      }`}>
                        {signed}{moneyFrom(Math.abs(amount), e.currency)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {visible.length === 0 && (
          <div className="text-xs text-stone-300 py-10 text-center">
            {log.length === 0
              ? "Nothing yet. Add a subscription, log an expense or mark an invoice paid."
              : "Nothing matches this filter."}
          </div>
        )}
      </div>
    </Card>
  );
}
