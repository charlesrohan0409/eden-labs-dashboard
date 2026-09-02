import { useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, Info, Check, X, ChevronDown } from "lucide-react";
import Card from "./Card";
import { financeAlerts } from "../../lib/financeAlerts";

// What the dashboard would tell you if you hadn't come looking.
//
// Everything here was already computable; none of it was ever surfaced. A
// budget breach lived inside Budgets, a shortfall required doing the
// arithmetic by hand, a bill due tomorrow meant scrolling the outgoings list.
//
// Dismissals are per-alert and kept in this browser only. They're keyed on the
// alert's identity INCLUDING its period, so dismissing "Food is over budget"
// this month doesn't silence next month's — the same breach recurring is news
// again, and a warning you can permanently switch off stops being a warning.

const STORE_KEY = "edenlabs.dismissedAlerts";

const TONE = {
  critical: { icon: AlertTriangle, wrap: "bg-rose-50 border-rose-100", ink: "text-rose-900", mark: "text-rose-600" },
  warning: { icon: AlertCircle, wrap: "bg-amber-50 border-amber-100", ink: "text-amber-900", mark: "text-amber-600" },
  info: { icon: Info, wrap: "bg-stone-50 border-line", ink: "text-stone-700", mark: "text-stone-400" },
};

const load = () => {
  // A private window, cleared site data, or a browser blocking storage all
  // throw here rather than returning empty — so this must never be the reason
  // the page fails to render.
  try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]")); }
  catch { return new Set(); }
};
const persist = (set) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...set])); } catch { /* not important enough to fail on */ }
};

export default function FinanceAlerts({ data, ledgerEntries, compact = false }) {
  const [dismissed, setDismissed] = useState(load);
  const [expanded, setExpanded] = useState(false);

  const all = useMemo(
    () => financeAlerts(data, ledgerEntries),
    [data, ledgerEntries]
  );
  const live = all.filter((a) => !dismissed.has(a.id));

  const dismiss = (id) => {
    const next = new Set(dismissed); next.add(id); persist(next); setDismissed(next);
  };

  if (!live.length) {
    if (compact) return null;
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-[13.5px] text-emerald-700">
          <Check size={15} className="shrink-0" />
          Nothing needs your attention — budgets are within limits and scheduled bills are covered.
        </div>
      </Card>
    );
  }

  const shown = expanded || live.length <= 3 ? live : live.slice(0, 3);

  return (
    <div className="space-y-2">
      {shown.map((a) => {
        const t = TONE[a.severity] || TONE.info;
        const Icon = t.icon;
        return (
          <div key={a.id} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${t.wrap}`}>
            <Icon size={15} className={`shrink-0 mt-0.5 ${t.mark}`} />
            <div className="min-w-0 flex-1">
              <div className={`text-[13.5px] font-semibold ${t.ink}`}>{a.title}</div>
              <div className="text-[12.5px] text-stone-500 mt-0.5 leading-snug">{a.detail}</div>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              title="Dismiss until it changes"
              className="shrink-0 text-stone-400 hover:text-stone-600 transition-colors -mr-1 -mt-1 p-1"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
      {live.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[12.5px] text-stone-500 hover:text-stone-700 inline-flex items-center gap-1 transition-colors"
        >
          <ChevronDown size={13} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
          {expanded ? "Show fewer" : `${live.length - 3} more`}
        </button>
      )}
    </div>
  );
}
