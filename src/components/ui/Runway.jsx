import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { AlertTriangle, Check, ArrowDownRight, ArrowUpRight, CreditCard } from "lucide-react";
import Card, { CardTitle } from "./Card";
import Badge from "./Badge";
import { projectRunway, spendableAccounts } from "../../lib/runway";
import { chartTooltipStyle, axisTick } from "../../lib/theme";

// What's due, and can you cover it.
//
// Twelve recurring bills each carried a renewal date and nothing put them
// next to the balance they'd be paid from. The answer is usually reassuring
// and occasionally not — which is the entire point of showing it before the
// bank does.

const inr = (n) => (n < 0 ? "−" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
const dayLabel = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const KIND_ICON = { "card-bill": CreditCard, incoming: ArrowUpRight, bill: ArrowDownRight };

export default function Runway({ accounts = [], outgoings = [], loans = [], defaultDays = 30 }) {
  const [days, setDays] = useState(defaultDays);
  const r = useMemo(
    () => projectRunway({ accounts, outgoings, loans, days }),
    [accounts, outgoings, loans, days]
  );
  const funding = spendableAccounts(accounts);

  // One point per event is enough — the balance only moves when something is
  // paid, so a day-by-day series would be the same line with more noise.
  const chart = r.series.map((s) => ({ ...s, x: dayLabel(s.date) }));
  const short = r.shortfall > 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <CardTitle sub={`${funding.map((a) => a.name).join(" + ") || "No spendable account"} — investments and the overseas balance aren't counted, they can't pay a bill on the day.`}>
          Can you cover what's coming?
        </CardTitle>
        <div className="flex gap-1 shrink-0">
          {[30, 45, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-[12px] px-2.5 py-1 rounded-lg border transition-colors ${
                days === d ? "bg-night text-white border-night" : "border-line hover:border-stone-300"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* the verdict, first */}
      <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 mb-4 border text-[13.5px] ${
        short ? "bg-rose-50 border-rose-100 text-rose-900" : "bg-emerald-50 border-emerald-100 text-emerald-900"
      }`}>
        {short ? <AlertTriangle size={15} className="shrink-0 mt-0.5" /> : <Check size={15} className="shrink-0 mt-0.5" />}
        <div>
          {short ? (
            <>
              <strong>You're {inr(r.shortfall)} short.</strong>{" "}
              The balance first goes under on {dayLabel(r.shortfallAt.date)}, bottoming at{" "}
              <span className="tnum">{inr(r.low.balance)}</span> on {dayLabel(r.low.date)}.
            </>
          ) : (
            <>
              <strong>Covered for the next {days} days.</strong>{" "}
              Tightest point is <span className="tnum">{inr(r.low.balance)}</span> on {dayLabel(r.low.date)}.
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          ["Spendable now", inr(r.opening), ""],
          ["Going out", inr(-r.totalOut), "text-rose-600"],
          ["Expected in", r.totalIn ? inr(r.totalIn) : "—", "text-emerald-700"],
        ].map(([k, v, tone]) => (
          <div key={k}>
            <div className="text-[10.5px] font-semibold text-stone-400 uppercase tracking-wide">{k}</div>
            <div className={`text-[18px] font-bold tracking-tight tnum mt-0.5 ${tone}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="h-44 -ml-2 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="runwayFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={short ? "#e11d48" : "#0f766e"} stopOpacity={0.22} />
                <stop offset="100%" stopColor={short ? "#e11d48" : "#0f766e"} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDEAE4" />
            <XAxis dataKey="x" tick={axisTick} interval="preserveStartEnd" minTickGap={26} />
            <YAxis tick={axisTick} width={54} tickFormatter={(v) => "₹" + Math.round(v / 1000) + "k"} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(v) => [inr(v), "Balance"]}
              labelFormatter={(l, p) => p?.[0]?.payload?.label || l}
            />
            {/* Zero is the line that matters — without it a dip below reads as
                just another low point on the curve. */}
            <ReferenceLine y={0} stroke="#e11d48" strokeDasharray="4 3" />
            <Area
              type="monotone" dataKey="balance"
              stroke={short ? "#e11d48" : "#0f766e"} strokeWidth={2}
              fill="url(#runwayFill)"
              animationDuration={520}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-0.5">
        {r.series.slice(1).map((e, i) => {
          const Icon = KIND_ICON[e.kind] || ArrowDownRight;
          const negative = e.balance < 0;
          return (
            <div
              key={`${e.date}-${e.label}-${i}`}
              className={`flex items-center gap-2.5 py-2 border-b border-stone-100 last:border-0 ${negative ? "bg-rose-50/60 -mx-2 px-2 rounded" : ""}`}
            >
              <span className="tnum text-[12px] text-stone-500 w-14 shrink-0">{dayLabel(e.date)}</span>
              <Icon size={13} className={`shrink-0 ${e.amount > 0 ? "text-emerald-600" : "text-stone-400"}`} />
              <span className="text-[13.5px] truncate flex-1 min-w-0">
                {e.label}
                {e.note && <span className="text-[11.5px] text-stone-400"> · {e.note}</span>}
              </span>
              {e.kind === "card-bill" && <Badge tone="sky">transfer</Badge>}
              <span className={`tnum text-[13px] w-20 text-right shrink-0 ${e.amount > 0 ? "text-emerald-700" : "text-stone-600"}`}>
                {inr(e.amount)}
              </span>
              <span className={`tnum text-[13px] font-semibold w-24 text-right shrink-0 ${negative ? "text-rose-600" : ""}`}>
                {inr(e.balance)}
              </span>
            </div>
          );
        })}
        {r.series.length === 1 && (
          <p className="text-[13px] text-stone-400 py-2">Nothing scheduled in this window.</p>
        )}
      </div>
    </Card>
  );
}
