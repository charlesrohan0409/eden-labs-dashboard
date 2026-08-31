import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie,
  RadialBarChart, RadialBar, PolarAngleAxis,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import {
  ArrowLeft, TrendingUp, TrendingDown, Wallet, ArrowLeftRight, Info,
  Repeat, Users, Lightbulb, AlertTriangle, Check,
} from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import PillTabs from "../ui/PillTabs";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { trialBalance } from "../../lib/ledger";
import { useLedger } from "../../hooks/useLedger";
import {
  monthlySeries, spendingByGroup, spendingBreakdown, incomeBreakdown,
  ratios, netWorthSeries, balanceSheet, cashFlow, incomeStatement, monthName, groupLabel,
} from "../../lib/ledgerAnalysis";
import { topPayees, recurring, monthOnMonth, observations, largest, categoryStats } from "../../lib/ledgerInsights";

const inr = (n) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
const signed = (n) => (n < 0 ? "−" : "") + inr(n);
const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

// A colour per spending group, so the same category is the same colour in
// every chart on the page. Assigned from the theme ramp rather than
// generated, so nothing lands on an unreadable near-white.
const GROUP_COLOR = {
  food: COLORS.accent, shopping: COLORS.violet, business: COLORS.sky,
  cash: COLORS.amber, "bank-charges": COLORS.rose, giving: COLORS.teal,
  subscriptions: COLORS.accentSoft, health: "#BE185D", utilities: "#0891B2",
  "personal-care": "#9333EA", travel: "#CA8A04", uncategorised: COLORS.muted,
  taxes: "#78716C", interest: "#EA580C", bnpl: "#64748B", education: "#0E7490",
};
const colorFor = (g) => GROUP_COLOR[g] || COLORS.muted;

// Shared instance rather than a fresh [] per render: every memo below keys
// off the ledger, and a new array identity each render would recompute all
// of them while the fetch is still in flight.
const EMPTY = [];

/** "Apr 2025 – Aug 2026". Every figure on this page is scoped to one. */
function periodLabel(from, to) {
  const f = from ? monthName(from.slice(0, 7)) : null;
  const t = to ? monthName(to.slice(0, 7)) : null;
  if (!f && !t) return "all time";
  if (f && t) return f === t ? f : `${f} – ${t}`;
  return f ? `since ${f}` : `up to ${t}`;
}

function Stat({ label, value, note, tone = "default", icon: Icon, period }) {
  const toneCls = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-600" : "text-stone-900";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-stone-400 uppercase tracking-wide">
        {Icon && <Icon size={12} />} {label}
      </div>
      <div className={`text-[26px] leading-tight font-bold tracking-tight tnum mt-1 ${toneCls}`}>{value}</div>
      {note && <div className="text-[11px] text-stone-400 mt-0.5">{note}</div>}
      {/* Every figure states its own window. Without it a number on this page
          is unreadable: ₹7.3L of spending is alarming over three months and
          unremarkable over seventeen. */}
      {period && <div className="text-[10px] text-stone-300 mt-1.5 uppercase tracking-wide">{period}</div>}
    </Card>
  );
}

/**
 * Where the money actually goes.
 *
 * Reads only from the ledger. Nothing here recomputes a total from the
 * expenses array — the whole point of the ledger is that there is one place
 * a number can come from, so a chart and a statement cannot disagree.
 */
export default function AnalysisPage({ token, setView }) {
  // Fetched here rather than passed down from App: this page is lazily
  // loaded, so putting the request inside it means the ledger is only ever
  // fetched by someone who actually opened the Analysis tab.
  const { entries, error: ledgerError, loading } = useLedger(token);
  const ledger = entries || EMPTY;
  const [range, setRange] = useState("all");
  const [view, setView2] = useState("overview");
  // Which spending category is open, if any. Null = the category list.
  const [focus, setFocus] = useState(null);

  // The ledger's own span, so "All" can name real dates instead of the word.
  const span = useMemo(() => {
    if (!ledger.length) return { first: null, last: null };
    const dates = ledger.filter((t) => t.kind !== "opening").map((t) => t.date).sort();
    return { first: dates[0], last: dates[dates.length - 1] };
  }, [ledger]);

  const window = useMemo(() => {
    if (range === "all") return {};
    const d = new Date();
    d.setMonth(d.getMonth() - (range === "3m" ? 3 : range === "6m" ? 6 : 12));
    return { from: d.toISOString().slice(0, 10) };
  }, [range]);

  const label = periodLabel(window.from || span.first, window.to || span.last);

  const R = useMemo(() => ratios(ledger, window), [ledger, window]);
  const months = useMemo(() => monthlySeries(ledger), [ledger]);
  const groups = useMemo(() => spendingByGroup(ledger, window), [ledger, window]);
  const detail = useMemo(() => spendingBreakdown(ledger, window), [ledger, window]);
  const income = useMemo(() => incomeBreakdown(ledger, window), [ledger, window]);
  const worth = useMemo(() => netWorthSeries(ledger), [ledger]);
  const sheet = useMemo(() => balanceSheet(ledger), [ledger]);
  const flow = useMemo(() => cashFlow(ledger, window), [ledger, window]);
  const pnl = useMemo(() => incomeStatement(ledger, window), [ledger, window]);
  const tb = useMemo(() => trialBalance(ledger), [ledger]);
  const payees = useMemo(() => topPayees(ledger, { ...window, limit: 12 }), [ledger, window]);
  const repeats = useMemo(() => recurring(ledger), [ledger]);
  const mom = useMemo(() => monthOnMonth(ledger), [ledger]);
  const notes = useMemo(() => observations(ledger), [ledger]);
  const big = useMemo(() => largest(ledger, { ...window, limit: 6 }), [ledger, window]);
  const focusStats = useMemo(() => (focus ? categoryStats(ledger, focus) : null), [ledger, focus]);
  const focusPayees = useMemo(() => (focus ? topPayees(ledger, { group: focus, limit: 10 }) : []), [ledger, focus]);

  const conduit = months.reduce((s, m) => s + m.conduit, 0);
  // From the ledger's real span, not the chart's row count — the chart caps
  // how many bars it draws, and reading the month count off it silently
  // divided by the wrong number.
  const monthCount = useMemo(() => {
    const from = window.from || span.first, to = window.to || span.last;
    if (!from || !to) return months.length || 1;
    const a = new Date(from), b = new Date(to);
    return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
  }, [window, span, months.length]);

  if (loading || ledgerError) {
    return (
      <div className="space-y-5">
        <button onClick={() => setView("home")} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800">
          <ArrowLeft size={14} /> Dashboard
        </button>
        <Card className="p-10 text-center">
          {ledgerError ? (
            <>
              <div className="text-[15px] font-semibold text-rose-600">Couldn't load the ledger</div>
              <p className="text-sm text-stone-400 mt-1.5">{ledgerError}</p>
            </>
          ) : (
            <div className="text-sm text-stone-400">Reading the ledger…</div>
          )}
        </Card>
      </div>
    );
  }

  if (!ledger.length) {
    return (
      <div className="space-y-5">
        <button onClick={() => setView("home")} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800">
          <ArrowLeft size={14} /> Dashboard
        </button>
        <Card className="p-10 text-center">
          <div className="text-[15px] font-semibold text-stone-800">Nothing to analyse yet</div>
          <p className="text-sm text-stone-400 mt-1.5 max-w-md mx-auto">
            This page reads from the ledger. Import your bank statements and every
            chart here fills in from the same numbers your balances come from.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => setView("home")} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800">
        <ArrowLeft size={14} /> Dashboard
      </button>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Analysis</h1>
          <p className="text-sm text-stone-500 mt-1">
            <span className="font-medium text-stone-700">{label}</span>
            {" · "}{ledger.length.toLocaleString("en-IN")} entries from your statements
          </p>
        </div>
        <PillTabs
          size="sm" value={range} onChange={setRange}
          options={[
            { value: "3m", label: "3 months" }, { value: "6m", label: "6 months" },
            { value: "12m", label: "12 months" }, { value: "all", label: "All" },
          ]}
        />
      </div>

      <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 border ${tb.ok ? "bg-emerald-50/60 border-emerald-100 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
        <Info size={13} />
        {tb.ok
          ? "Ledger balances — every transaction sums to zero."
          : `${tb.unbalanced.length} transaction(s) don't balance. Figures below may be wrong.`}
      </div>

      {/* The headline gets the dark card, the way the reference dashboards do:
          one number that reads first, everything else supporting it. */}
      <div className="grid lg:grid-cols-[1.15fr_2fr] gap-3">
        <Card dark className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-white/45 uppercase tracking-wide">
              <Wallet size={12} /> Kept from what you earned
            </div>
            <div className={`text-[34px] leading-tight font-bold tracking-tight tnum mt-1.5 ${R.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {signed(R.net)}
            </div>
            <div className="text-xs text-white/50 mt-1">
              {inr(R.income)} earned · {inr(R.expense)} spent
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/40">Per month</div>
              <div className="text-sm font-semibold tnum text-white mt-0.5">{signed(R.net / monthCount)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/40">Over</div>
              <div className="text-sm font-semibold text-white mt-0.5">{monthCount} months</div>
            </div>
          </div>
        </Card>

        <div className="grid sm:grid-cols-2 gap-3">
          <Stat icon={TrendingUp} label="Income" value={inr(R.income)}
            note={`${inr(R.income / monthCount)} a month on average`} period={label} />
          <Stat icon={TrendingDown} label="Spending" value={inr(R.expense)}
            note={`${inr(R.business)} business · ${inr(R.personal)} personal`} period={label} />
          <Stat icon={Wallet} label="Savings rate" value={R.savingsRate === null ? "—" : pct(R.savingsRate)}
            tone={R.net >= 0 ? "good" : "bad"}
            note={R.savingsRate === null ? "no income in range" : "of every rupee earned"} period={label} />
          <Stat icon={ArrowLeftRight} label="Passed through" value={inr(conduit)}
            note="family money moved out — never yours" period={periodLabel(span.first, span.last)} />
        </div>
      </div>

      <PillTabs
        size="md" value={view} onChange={(v) => { setView2(v); setFocus(null); }}
        options={[
          { value: "overview", label: "Overview" },
          { value: "spending", label: "Where it goes" },
          { value: "repeats", label: "What repeats" },
          { value: "statements", label: "Statements" },
        ]}
      />

      {view === "overview" && (
        <>
          <div className="grid lg:grid-cols-2 gap-3">
            {/* The donut answers "what is the shape of my spending" at a
                glance; the legend beside it answers "how much exactly". One
                without the other is either vague or unreadable. */}
            <Card className="p-5">
              <CardTitle sub={`${inr(detail.total)} · ${label}`}>Spending by category</CardTitle>
              <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <div className="relative shrink-0" style={{ width: 190, height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={groups.filter((g) => g.amount > 0)} dataKey="amount" nameKey="label"
                        innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
                        {groups.filter((g) => g.amount > 0).map((g) => <Cell key={g.group} fill={colorFor(g.group)} />)}
                      </Pie>
                      <Tooltip {...chartTooltipStyle} formatter={(v, n) => [`${inr(v)}`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Centre label: the one thing worth reading without
                      hovering anything. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-[9.5px] uppercase tracking-wide text-stone-400">Biggest</div>
                    <div className="text-[13px] font-semibold text-stone-900 leading-tight text-center px-6">
                      {groups[0]?.label || "—"}
                    </div>
                    <div className="text-[11px] text-stone-400 tnum mt-0.5">
                      {groups[0] ? pct(groups[0].share) : ""}
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {groups.slice(0, 7).map((g) => (
                    <div key={g.group} className="flex items-center gap-2 text-[12.5px]">
                      <i className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(g.group) }} />
                      <span className="text-stone-600 truncate">{g.label}</span>
                      <span className="ml-auto tnum font-medium text-stone-900">{inr(g.amount)}</span>
                      <span className="tnum text-stone-400 w-11 text-right">{pct(g.share)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Income is two or three sources, not twelve, so a radial reads
                better than a pie: the arc length carries the comparison and
                the empty track shows the share of the whole. */}
            <Card className="p-5">
              <CardTitle sub={`${inr(income.total)} · ${label}`}>Where income comes from</CardTitle>
              <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                <div className="shrink-0" style={{ width: 190, height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                      data={income.rows.slice(0, 5).map((r, i) => ({ ...r, fill: [COLORS.accent, COLORS.teal, COLORS.sky, COLORS.violet, COLORS.amber][i] }))}
                      innerRadius="38%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={13}
                    >
                      <PolarAngleAxis type="number" domain={[0, 1]} dataKey="share" tick={false} />
                      <RadialBar dataKey="share" background={{ fill: COLORS.gridline }} cornerRadius={7} />
                      <Tooltip {...chartTooltipStyle} formatter={(v, _n, p) => [`${inr(p.payload.amount)} · ${pct(v)}`, p.payload.label]} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {income.rows.slice(0, 5).map((r, i) => (
                    <div key={r.account} className="flex items-center gap-2 text-[12.5px]">
                      <i className="w-2 h-2 rounded-full shrink-0" style={{ background: [COLORS.accent, COLORS.teal, COLORS.sky, COLORS.violet, COLORS.amber][i] }} />
                      <span className="text-stone-600 truncate">{r.label}</span>
                      <span className="ml-auto tnum font-medium text-stone-900">{inr(r.amount)}</span>
                      <span className="tnum text-stone-400 w-11 text-right">{pct(r.share)}</span>
                    </div>
                  ))}
                  {income.rows.length === 0 && <div className="text-sm text-stone-400">No income in this period.</div>}
                </div>
              </div>
            </Card>
          </div>

          {notes.length > 0 && (
            <Card className="p-5">
              <CardTitle sub="Read from the ledger, ranked by how much money each is about">What stands out</CardTitle>
              <div className="grid md:grid-cols-2 gap-2.5">
                {notes.slice(0, 4).map((o, i) => {
                  const Icon = o.tone === "warn" ? AlertTriangle : o.tone === "good" ? Check : Lightbulb;
                  const tint = o.tone === "warn" ? "text-amber-600 bg-amber-50" : o.tone === "good" ? "text-emerald-700 bg-emerald-50" : "text-stone-500 bg-stone-100";
                  return (
                    <div key={i} className="flex gap-3 rounded-xl border border-line p-3.5">
                      <div className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${tint}`}>
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-stone-900 leading-snug">{o.title}</div>
                        <div className="text-[12px] text-stone-500 mt-0.5 leading-snug">{o.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <CardTitle sub={`Your money only — family money passing through is excluded · ${periodLabel(span.first, span.last)}`}>
              Income vs spending, month by month
            </CardTitle>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={months} margin={{ left: -14, right: 8 }} barGap={2}>
                <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
                <Tooltip {...chartTooltipStyle} formatter={(v, n) => [inr(v), n === "income" ? "Income" : "Spending"]} />
                <ReferenceLine y={0} stroke={COLORS.line} />
                <Bar dataKey="income" fill={COLORS.accent} radius={[3, 3, 0, 0]} barSize={11} name="income" />
                <Bar dataKey="expense" fill={COLORS.muted} radius={[3, 3, 0, 0]} barSize={11} name="expense" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid lg:grid-cols-2 gap-3">
            <Card className="p-5">
              <CardTitle sub="Assets minus what you owe, at each month end">Net worth</CardTitle>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={worth} margin={{ left: -14, right: 8 }}>
                  <defs>
                    <linearGradient id="gNetWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => [inr(v), "Net worth"]} />
                  <Area type="monotone" dataKey="netWorth" stroke={COLORS.accent} strokeWidth={2.5} fill="url(#gNetWorth)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <CardTitle sub={mom.previousLabel ? `${mom.currentLabel} against ${mom.previousLabel}` : "Not enough history yet"}>
                What changed last month
              </CardTitle>
              <div className="space-y-1.5">
                {mom.rows.slice(0, 8).map((r) => (
                  <div key={r.group} className="flex items-center gap-2 text-[12.5px]">
                    <i className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(r.group) }} />
                    <span className="text-stone-600 truncate capitalize">{r.group.replace(/-/g, " ")}</span>
                    <span className="ml-auto tnum text-stone-400">{inr(r.was)}</span>
                    <span className="text-stone-300">→</span>
                    <span className="tnum font-medium text-stone-900 w-20 text-right">{inr(r.now)}</span>
                    <span className={`tnum w-20 text-right ${r.delta > 0 ? "text-rose-600" : r.delta < 0 ? "text-emerald-700" : "text-stone-300"}`}>
                      {r.delta === 0 ? "—" : (r.delta > 0 ? "+" : "−") + inr(r.delta)}
                    </span>
                  </div>
                ))}
                {!mom.rows.length && <div className="text-sm text-stone-400">Nothing to compare yet.</div>}
              </div>
            </Card>
          </div>
        </>
      )}

      {view === "spending" && focus && focusStats && (
        <>
          <button onClick={() => setFocus(null)} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800">
            <ArrowLeft size={14} /> All categories
          </button>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label={groupLabel(focus)} value={inr(focusStats.total)}
              note={`across ${focusStats.months} months`} period={periodLabel(span.first, span.last)} />
            <Stat label="Typical month" value={inr(focusStats.average)}
              note={`last 3 months: ${inr(focusStats.recentAverage)}`} />
            <Stat label="Biggest month" value={inr(focusStats.peak.amount)} note={focusStats.peak.label} />
            {/* Compares the last three months against everything before them.
                Null when there is no "before" — a flat 0% would claim a
                stability the data hasn't earned. */}
            <Stat label="Trend" value={focusStats.trend === null ? "—" : `${focusStats.trend > 0 ? "+" : ""}${(focusStats.trend * 100).toFixed(0)}%`}
              tone={focusStats.trend === null ? "default" : focusStats.trend > 0.05 ? "bad" : focusStats.trend < -0.05 ? "good" : "default"}
              note={focusStats.trend === null ? "not enough history" : "last 3 months vs before"} />
          </div>

          <Card className="p-5">
            <CardTitle sub={`Every month, including the ones you spent nothing · ${periodLabel(span.first, span.last)}`}>
              {groupLabel(focus)} over time
            </CardTitle>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={focusStats.series} margin={{ left: -14, right: 8 }}>
                <defs>
                  <linearGradient id="gCat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorFor(focus)} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={colorFor(focus)} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} axisLine={false} tickLine={false}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [inr(v), groupLabel(focus)]} />
                <ReferenceLine y={focusStats.average} stroke={COLORS.muted} strokeDasharray="3 3"
                  label={{ value: "average", position: "insideTopRight", fontSize: 10, fill: COLORS.muted }} />
                <Area type="monotone" dataKey="amount" stroke={colorFor(focus)} strokeWidth={2.5} fill="url(#gCat)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <CardTitle sub="Net of refunds, biggest first">Where the {groupLabel(focus).toLowerCase()} money went</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                    <th className="text-left font-semibold py-2">Place</th>
                    <th className="text-right font-semibold py-2 w-20">Visits</th>
                    <th className="text-right font-semibold py-2 w-28">Total</th>
                    <th className="text-right font-semibold py-2 w-24">Each time</th>
                    <th className="text-right font-semibold py-2 w-20">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {focusPayees.map((p) => (
                    <tr key={p.name} className="border-b border-stone-100 last:border-0">
                      <td className="py-2 capitalize">{p.name.toLowerCase()}</td>
                      <td className="py-2 text-right tnum text-stone-500">{p.count}</td>
                      <td className="py-2 text-right tnum font-medium">{inr(p.amount)}</td>
                      <td className="py-2 text-right tnum text-stone-500">{inr(p.amount / p.count)}</td>
                      <td className="py-2 text-right tnum text-stone-400">{pct(p.share)}</td>
                    </tr>
                  ))}
                  {!focusPayees.length && (
                    <tr><td colSpan={5} className="py-6 text-center text-stone-400">No payees in this category.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {view === "spending" && !focus && (
        <>
          <Card className="p-5">
            <CardTitle sub={`${inr(detail.total)} across ${detail.rows.length} categories · ${label}`}>
              Where it goes
            </CardTitle>
            <ResponsiveContainer width="100%" height={Math.max(220, groups.length * 34)}>
              <BarChart data={groups} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid stroke={COLORS.gridline} horizontal={false} />
                {/* Anchored at zero unless a category is genuinely negative (a
                    refund can outweigh the spend). The default domain rounds
                    out to nice ticks and hands a quarter of the width to a
                    bar worth −₹4k. */}
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false}
                  domain={[(min) => Math.min(0, min), "dataMax"]}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
                <YAxis type="category" dataKey="label" tick={axisTick} axisLine={false} tickLine={false} width={104} />
                <Tooltip {...chartTooltipStyle} formatter={(v, _n, p) => [`${inr(v)} · ${pct(p.payload.share)}`, "Spent"]} />
                <Bar dataKey="amount" radius={[0, 3, 3, 0]} barSize={16} cursor="pointer"
                  onClick={(d) => d?.payload?.group && setFocus(d.payload.group)}>
                  {groups.map((g) => <Cell key={g.group} fill={colorFor(g.group)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid lg:grid-cols-2 gap-3">
            {/* Categories tell you it was food. This tells you it was Ayyappan
                Idli, forty-six times. Only the second one changes anything. */}
            <Card className="p-5">
              <CardTitle sub={`Net of refunds · ${label}`} action={<Users size={15} className="text-stone-300" />}>
                Who you paid most
              </CardTitle>
              <div className="space-y-1.5">
                {payees.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-[12.5px]">
                    <i className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(p.group) }} />
                    <span className="text-stone-700 truncate capitalize">{p.name.toLowerCase()}</span>
                    <span className="text-stone-300 tnum text-[11px] shrink-0">×{p.count}</span>
                    <span className="ml-auto tnum font-medium text-stone-900">{inr(p.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <CardTitle sub={`Single transactions worth remembering · ${label}`}>Biggest one-offs</CardTitle>
              <div className="space-y-1.5">
                {big.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 text-[12.5px]">
                    <i className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(b.group) }} />
                    <span className="text-stone-700 truncate capitalize">{b.name.toLowerCase()}</span>
                    <span className="text-stone-300 text-[11px] shrink-0">{b.date.slice(0, 7)}</span>
                    <span className="ml-auto tnum font-medium text-stone-900">{inr(b.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <CardTitle sub={`Every category, largest first · ${label}`}>Detail</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                    <th className="text-left font-semibold py-2">Category</th>
                    <th className="text-right font-semibold py-2 w-28">Amount</th>
                    <th className="text-right font-semibold py-2 w-20">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((r) => (
                    <tr key={r.account} onClick={() => setFocus(r.group)}
                      className="border-b border-stone-100 last:border-0 cursor-pointer hover:bg-stone-50">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <i className="w-2 h-2 rounded-sm" style={{ background: colorFor(r.group) }} />
                          {r.label}
                        </span>
                      </td>
                      <td className="text-right tnum py-2">{signed(r.amount)}</td>
                      <td className="text-right tnum py-2 text-stone-400">{pct(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {view === "repeats" && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Stat icon={Repeat} label="Committed monthly"
              value={inr(repeats.filter((r) => r.confident && !r.conduit).reduce((s, r) => s + r.amount, 0))}
              note="charges that land on the same day every month" />
            <Stat icon={Repeat} label="A year of that"
              value={inr(repeats.filter((r) => r.confident && !r.conduit).reduce((s, r) => s + r.annualised, 0))}
              note="before you decide anything else" />
            <Stat icon={ArrowLeftRight} label="Paid for others"
              value={inr(repeats.filter((r) => r.confident && r.conduit).reduce((s, r) => s + r.amount, 0))}
              note="recurring, on family's behalf — not your spending" />
          </div>

          <Card className="p-5">
            <CardTitle sub="Matched on payee and exact amount, across three or more months">
              What repeats every month
            </CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-stone-400 border-b border-line">
                    <th className="text-left font-semibold py-2">Payee</th>
                    <th className="text-left font-semibold py-2 w-32">Category</th>
                    <th className="text-right font-semibold py-2 w-16">Day</th>
                    <th className="text-right font-semibold py-2 w-20">Months</th>
                    <th className="text-right font-semibold py-2 w-24">Each</th>
                    <th className="text-right font-semibold py-2 w-24">A year</th>
                  </tr>
                </thead>
                <tbody>
                  {repeats.map((r, i) => (
                    <tr key={i} className="border-b border-stone-100 last:border-0">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <i className="w-2 h-2 rounded-sm shrink-0" style={{ background: r.conduit ? COLORS.muted : colorFor(r.account.split(":")[1]) }} />
                          <span className="capitalize">{r.name.toLowerCase()}</span>
                          {/* Money he moves for family repeats just like a
                              subscription does, and looks identical in a list
                              of charges — so it says so, rather than quietly
                              inflating a "your commitments" total. */}
                          {r.conduit && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">not yours</span>}
                        </span>
                      </td>
                      <td className="py-2 text-stone-500">{r.label}</td>
                      <td className="py-2 text-right tnum text-stone-400">{r.confident ? r.dayOfMonth : "—"}</td>
                      <td className="py-2 text-right tnum text-stone-500">{r.months}</td>
                      <td className="py-2 text-right tnum font-medium">{inr(r.amount)}</td>
                      <td className="py-2 text-right tnum text-stone-400">{inr(r.annualised)}</td>
                    </tr>
                  ))}
                  {!repeats.length && (
                    <tr><td colSpan={6} className="py-6 text-center text-stone-400">Nothing repeats often enough yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {view === "statements" && (
        <>
          <Card className="p-5">
            <CardTitle sub={`Business separated from personal — a blended one answers nothing · ${label}`}>
              Income statement
            </CardTitle>
            <table className="w-full text-sm">
              <tbody>
                {pnl.income.map((r) => (
                  <tr key={r.account} className="border-b border-stone-100">
                    <td className="py-2 text-stone-600">{r.label}</td>
                    <td className="text-right tnum py-2">{inr(r.amount)}</td>
                  </tr>
                ))}
                <tr className="border-b border-line font-semibold">
                  <td className="py-2">Total income</td>
                  <td className="text-right tnum py-2">{inr(pnl.totalIncome)}</td>
                </tr>
                {pnl.businessCosts.map((r) => (
                  <tr key={r.account} className="border-b border-stone-100">
                    <td className="py-2 text-stone-600">{r.label}</td>
                    <td className="text-right tnum py-2 text-rose-600">−{inr(r.amount)}</td>
                  </tr>
                ))}
                <tr className="border-b border-line font-semibold">
                  <td className="py-2">Business profit</td>
                  <td className="text-right tnum py-2">{signed(pnl.businessProfit)}</td>
                </tr>
                <tr className="border-b border-stone-100">
                  <td className="py-2 text-stone-600">Personal spending</td>
                  <td className="text-right tnum py-2 text-rose-600">−{inr(pnl.totalPersonalCosts)}</td>
                </tr>
                <tr className="font-bold">
                  <td className="py-2.5">Net</td>
                  <td className={`text-right tnum py-2.5 ${pnl.net >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{signed(pnl.net)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <div className="grid lg:grid-cols-2 gap-3">
            <Card className="p-5">
              <CardTitle sub="as at today">Balance sheet</CardTitle>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="pt-1 pb-2 text-[10.5px] uppercase tracking-wide text-stone-400" colSpan={2}>Assets</td></tr>
                  {sheet.assets.map((r) => (
                    <tr key={r.account} className="border-b border-stone-100">
                      <td className="py-2 text-stone-600">{r.label}</td>
                      <td className="text-right tnum py-2">{signed(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-line font-semibold">
                    <td className="py-2">Total assets</td>
                    <td className="text-right tnum py-2">{inr(sheet.totalAssets)}</td>
                  </tr>
                  <tr><td className="pt-3 pb-2 text-[10.5px] uppercase tracking-wide text-stone-400" colSpan={2}>Liabilities</td></tr>
                  {sheet.liabilities.map((r) => (
                    <tr key={r.account} className="border-b border-stone-100">
                      <td className="py-2 text-stone-600">{r.label}</td>
                      <td className="text-right tnum py-2">{signed(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-line font-semibold">
                    <td className="py-2">Total liabilities</td>
                    <td className="text-right tnum py-2">{signed(sheet.totalLiabilities)}</td>
                  </tr>
                  <tr className="font-bold">
                    <td className="py-2.5">Net worth</td>
                    <td className="text-right tnum py-2.5">{signed(sheet.netWorth)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[11px] text-stone-400 mt-3 leading-snug">
                Equity is the residual — assets minus liabilities — rather than whatever
                sits in the equity accounts, which for one person are only opening
                balances and accumulated result.
              </p>
            </Card>

            <Card className="p-5">
              <CardTitle sub={`Where the cash actually moved · ${label}`}>Cash flow</CardTitle>
              <table className="w-full text-sm">
                <tbody>
                  {[["Operating", flow.operating, "income less spending"],
                    ["Investing", flow.investing, "into and out of investments"],
                    ["Financing", flow.financing, "borrowing and repayment"],
                    ["Family money", flow.conduit, "net of what came in and went back out"],
                  ].map(([label, v, note]) => (
                    <tr key={label} className="border-b border-stone-100 last:border-0">
                      <td className="py-2">
                        <div className="text-stone-700">{label}</div>
                        <div className="text-[11px] text-stone-400">{note}</div>
                      </td>
                      <td className={`text-right tnum py-2 align-top ${v < 0 ? "text-rose-600" : v > 0 ? "text-emerald-700" : "text-stone-400"}`}>
                        {v === 0 ? "—" : signed(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
