import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { ArrowLeft, TrendingUp, TrendingDown, Wallet, ArrowLeftRight, Info } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import PillTabs from "../ui/PillTabs";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { trialBalance } from "../../lib/ledger";
import { useLedger } from "../../hooks/useLedger";
import {
  monthlySeries, spendingByGroup, spendingBreakdown,
  ratios, netWorthSeries, balanceSheet, cashFlow, incomeStatement,
} from "../../lib/ledgerAnalysis";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
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
};
const colorFor = (g) => GROUP_COLOR[g] || COLORS.muted;

// Shared instance rather than a fresh [] per render: every memo below keys
// off the ledger, and a new array identity each render would recompute all
// of them while the fetch is still in flight.
const EMPTY = [];

function Stat({ label, value, note, tone = "default", icon: Icon }) {
  const toneCls = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-600" : "text-stone-900";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-stone-400 uppercase tracking-wide">
        {Icon && <Icon size={12} />} {label}
      </div>
      <div className={`text-[26px] leading-tight font-bold tracking-tight tnum mt-1 ${toneCls}`}>{value}</div>
      {note && <div className="text-[11px] text-stone-400 mt-0.5">{note}</div>}
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

  const window = useMemo(() => {
    if (range === "all") return {};
    const d = new Date();
    d.setMonth(d.getMonth() - (range === "3m" ? 3 : range === "6m" ? 6 : 12));
    return { from: d.toISOString().slice(0, 10) };
  }, [range]);

  const R = useMemo(() => ratios(ledger, window), [ledger, window]);
  const months = useMemo(() => monthlySeries(ledger), [ledger]);
  const groups = useMemo(() => spendingByGroup(ledger, window), [ledger, window]);
  const detail = useMemo(() => spendingBreakdown(ledger, window), [ledger, window]);
  const worth = useMemo(() => netWorthSeries(ledger), [ledger]);
  const sheet = useMemo(() => balanceSheet(ledger), [ledger]);
  const flow = useMemo(() => cashFlow(ledger, window), [ledger, window]);
  const pnl = useMemo(() => incomeStatement(ledger, window), [ledger, window]);
  const tb = useMemo(() => trialBalance(ledger), [ledger]);

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
            Every figure derived from the ledger — {ledger.length.toLocaleString("en-IN")} entries.
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

      {/* The self-check, stated rather than assumed. If the ledger ever stops
          balancing, that is the first thing worth knowing — before reading a
          single number below it. */}
      <div className={`flex items-center gap-2 text-[12.5px] rounded-xl px-3.5 py-2.5 border
        ${tb.ok ? "bg-emerald-50 border-emerald-200/70 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${tb.ok ? "bg-emerald-600" : "bg-rose-600"}`} />
        {tb.ok
          ? "Ledger balances — every transaction sums to zero."
          : `${tb.unbalanced.length} unbalanced transaction${tb.unbalanced.length > 1 ? "s" : ""} — figures below are unreliable.`}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={TrendingUp} label="Income" value={inr(R.income)} note="client work" />
        <Stat icon={TrendingDown} label="Spending" value={inr(R.expense)}
          note={`${inr(R.business)} business · ${inr(R.personal)} personal`} />
        <Stat icon={Wallet} label="Net" value={signed(R.net)} tone={R.net >= 0 ? "good" : "bad"}
          note={R.savingsRate === null ? "no income in range" : `${pct(R.savingsRate)} of income kept`} />
        {/* Gross, not net: the total that LEFT the accounts on someone else's
            behalf. The cash-flow statement reports the net of the same
            activity, which is a different (smaller) number — hence the
            different label there. */}
        <Stat icon={ArrowLeftRight} label="Passed through"
          value={inr(months.reduce((s, m) => s + m.conduit, 0))}
          note="family money moved out — never yours" />
      </div>

      <PillTabs
        size="md" value={view} onChange={setView2}
        options={[
          { value: "overview", label: "Overview" },
          { value: "spending", label: "Where it goes" },
          { value: "statements", label: "Statements" },
        ]}
      />

      {view === "overview" && (
        <>
          <Card className="p-5">
            <CardTitle sub="Your money only — family money passing through is excluded">
              Income vs spending
            </CardTitle>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={months} barGap={2}>
                <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={62}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
                <Tooltip {...chartTooltipStyle} formatter={(v, n) => [inr(v), n === "income" ? "Income" : "Spending"]} />
                <ReferenceLine y={0} stroke={COLORS.line} />
                <Bar dataKey="income" fill={COLORS.accent} radius={[3, 3, 0, 0]} barSize={11} />
                <Bar dataKey="expense" fill={COLORS.muted} radius={[3, 3, 0, 0]} barSize={11} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-[11.5px] text-stone-500 mt-2">
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS.accent }} />Income</span>
              <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS.muted }} />Spending</span>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Card className="p-5">
              <CardTitle sub="Assets minus what you owe, at each month end">Net worth</CardTitle>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={worth}>
                  <defs>
                    <linearGradient id="gWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={62}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => [signed(v), "Net worth"]} />
                  <Area type="monotone" dataKey="netWorth" stroke={COLORS.accent} strokeWidth={2.5} fill="url(#gWorth)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <CardTitle sub="How much of every ₹100 earned you keep">Key ratios</CardTitle>
              <div className="space-y-3">
                {[
                  ["Savings rate", R.savingsRate, "what's left after everything"],
                  ["Business margin", R.businessMargin, "income after business costs only"],
                  ["Spending vs income", R.expenseRatio, "over 100% means dipping into reserves"],
                ].map(([label, value, note]) => (
                  <div key={label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium text-stone-700">{label}</span>
                      <span className={`text-[15px] font-bold tnum ${
                        value === null ? "text-stone-300"
                        : label === "Spending vs income"
                          ? (value > 1 ? "text-rose-600" : "text-emerald-700")
                          : (value >= 0 ? "text-emerald-700" : "text-rose-600")}`}>
                        {pct(value)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden mt-1.5">
                      <div className={`h-full rounded-full origin-left transition-transform duration-300 ${EASE}
                        ${value !== null && value < 0 ? "bg-rose-500" : "bg-emerald-600"}`}
                        style={{ transform: `scaleX(${Math.min(1, Math.abs(value || 0))})` }} />
                    </div>
                    <div className="text-[11px] text-stone-400 mt-1">{note}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {view === "spending" && (
        <>
          <Card className="p-5">
            <CardTitle sub={`${inr(detail.total)} across ${detail.rows.length} categories`}>
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
                <Bar dataKey="amount" radius={[0, 3, 3, 0]} barSize={16}>
                  {groups.map((g) => <Cell key={g.group} fill={colorFor(g.group)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <CardTitle sub="Every category, largest first">Detail</CardTitle>
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
                    <tr key={r.account} className="border-b border-stone-100 last:border-0">
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <i className="w-2 h-2 rounded-sm" style={{ background: colorFor(r.group) }} />
                          {r.label}
                        </span>
                      </td>
                      <td className={`text-right tnum py-2 ${r.amount < 0 ? "text-emerald-700" : "text-stone-800"}`}>
                        {signed(r.amount)}
                      </td>
                      <td className="text-right tnum py-2 text-stone-400">{pct(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.rows.some((r) => r.amount < 0) && (
              <p className="text-[11.5px] text-stone-400 mt-3 flex items-start gap-1.5">
                <Info size={13} className="shrink-0 mt-px" />
                A negative category means refunds exceeded spending in this window — the
                course refund landed months after the purchase.
              </p>
            )}
          </Card>
        </>
      )}

      {view === "statements" && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Card className="p-5">
            <CardTitle sub="Business separated from personal — a blended one answers nothing">
              Income statement
            </CardTitle>
            <table className="w-full text-sm">
              <tbody>
                {pnl.income.map((r) => (
                  <tr key={r.account}><td className="py-1.5 text-stone-600">{r.label}</td>
                    <td className="text-right tnum py-1.5">{inr(r.amount)}</td></tr>
                ))}
                <tr className="border-t border-line font-semibold">
                  <td className="py-2">Total income</td>
                  <td className="text-right tnum py-2">{inr(pnl.totalIncome)}</td>
                </tr>
                {pnl.businessCosts.map((r) => (
                  <tr key={r.account}><td className="py-1.5 text-stone-600">{r.label}</td>
                    <td className="text-right tnum py-1.5">−{inr(r.amount)}</td></tr>
                ))}
                <tr className="border-t border-line font-semibold">
                  <td className="py-2">Business profit</td>
                  <td className="text-right tnum py-2 text-emerald-700">{inr(pnl.businessProfit)}</td>
                </tr>
                <tr><td className="py-1.5 text-stone-600">Personal spending</td>
                  <td className="text-right tnum py-1.5">−{inr(pnl.totalPersonalCosts)}</td></tr>
                <tr className="border-t-2 border-stone-800 font-bold">
                  <td className="py-2">Net</td>
                  <td className={`text-right tnum py-2 ${pnl.net >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                    {signed(pnl.net)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <CardTitle sub={sheet.asOf ? `as at ${sheet.asOf}` : "as at today"}>Balance sheet</CardTitle>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td colSpan={2} className="text-[10.5px] uppercase tracking-wide text-stone-400 pt-1 pb-1.5">Assets</td></tr>
                  {sheet.assets.map((a) => (
                    <tr key={a.account}><td className="py-1.5 text-stone-600">{a.label}</td>
                      <td className="text-right tnum py-1.5">{inr(a.amount)}</td></tr>
                  ))}
                  <tr className="border-t border-line font-semibold">
                    <td className="py-2">Total assets</td><td className="text-right tnum py-2">{inr(sheet.totalAssets)}</td>
                  </tr>
                  <tr><td colSpan={2} className="text-[10.5px] uppercase tracking-wide text-stone-400 pt-3 pb-1.5">Liabilities</td></tr>
                  {sheet.liabilities.length ? sheet.liabilities.map((l) => (
                    <tr key={l.account}><td className="py-1.5 text-stone-600">{l.label}</td>
                      <td className="text-right tnum py-1.5">{inr(l.amount)}</td></tr>
                  )) : <tr><td className="py-1.5 text-stone-300" colSpan={2}>None</td></tr>}
                  <tr className="border-t border-line font-semibold">
                    <td className="py-2">Total liabilities</td><td className="text-right tnum py-2">{inr(sheet.totalLiabilities)}</td>
                  </tr>
                  <tr className="border-t-2 border-stone-800 font-bold">
                    <td className="py-2">Net worth</td>
                    <td className={`text-right tnum py-2 ${sheet.netWorth >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                      {signed(sheet.netWorth)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[11px] text-stone-400 mt-3">
                Equity is the residual — assets minus liabilities — rather than whatever
                sits in the equity accounts, which for one person are only opening
                balances and accumulated result.
              </p>
            </Card>

            <Card className="p-5">
              <CardTitle sub="Where the cash actually moved">Cash flow</CardTitle>
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
        </div>
      )}
    </div>
  );
}
