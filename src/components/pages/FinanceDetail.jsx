import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  ArrowLeft, Plus, DollarSign, AlertCircle, Clock, Search,
  ArrowUpRight, ArrowDownRight, FileDown, Wallet, Receipt, Repeat,
} from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import PillTabs from "../ui/PillTabs";
import PrimaryButton from "../ui/PrimaryButton";
import InvoiceModal from "../ui/InvoiceModal";
import { MONTHS, downloadCSV, today } from "../../lib/utils";
import { useCurrency } from "../../hooks/useCurrency";
import { invoiceNumber } from "../../lib/invoice";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";

const STATUS_TONE = { paid: "emerald", pending: "amber", overdue: "rose", draft: "stone" };
const STATUS_LABEL = { paid: "Completed", pending: "Pending", overdue: "Overdue", draft: "Draft" };

// Written out in full because Tailwind can only see class names it can read
// literally in the source — `bg-${tone}-50` would never be generated.
const TILE_TONE = {
  rose: { wash: "bg-rose-50", icon: "text-rose-600" },
  violet: { wash: "bg-violet-50", icon: "text-violet-600" },
  amber: { wash: "bg-amber-50", icon: "text-amber-600" },
  emerald: { wash: "bg-emerald-50", icon: "text-emerald-600" },
};

export default function FinanceDetail({ data, setView, onAddExpense, onAddInvoice, onGenerateInvoices, onUpdateInvoiceStatus }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [genStatus, setGenStatus] = useState("");
  const [exp, setExp] = useState({ category: "Software", vendor: "", amount: "" });
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const { money } = useCurrency();

  const clientOf = (id) => data.clients.find((c) => c.id === id);

  const totalRevenue = data.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalCost = data.expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue ? Math.round((profit / totalRevenue) * 100) : 0;
  const pending = data.invoices.filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const overdue = data.invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  const mrr = data.clients
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + (Number(c.contract?.value) || 0), 0);

  // Revenue and cost per month, the series behind every chart on this page.
  const finSeries = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, revenue: 0, cost: 0 }));
    data.invoices.filter((i) => i.status === "paid").forEach((i) => {
      const m = MONTHS[new Date(i.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m].revenue += i.amount;
    });
    data.expenses.forEach((e) => {
      const m = MONTHS[new Date(e.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m].cost += e.amount;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [data.invoices, data.expenses]);

  // Month-over-month only means something once the current month has payments
  // in it; before that a "-100%" headline is technically true and useless.
  const lastMonthRev = finSeries.at(-2)?.revenue || 0;
  const thisMonthRev = finSeries.at(-1)?.revenue || 0;
  const currentMonth = MONTHS.at(-1);
  const revTrend = thisMonthRev && lastMonthRev
    ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
    : null;

  const filteredInvoices = data.invoices.filter((i) => {
    const matchesStatus = filterStatus === "all" || i.status === filterStatus;
    const q = search.trim().toLowerCase();
    const client = clientOf(i.clientId);
    const matchesSearch = !q || (client?.name || "").toLowerCase().includes(q) || (client?.company || "").toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const invoiceNo = (id) => invoiceNumber(id, data.invoices);

  const counts = {
    all: data.invoices.length,
    paid: data.invoices.filter((i) => i.status === "paid").length,
    pending: data.invoices.filter((i) => i.status === "pending").length,
    overdue: data.invoices.filter((i) => i.status === "overdue").length,
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  const handleGenerate = () => {
    const period = today().slice(0, 7);
    const result = onGenerateInvoices(period);
    setGenStatus(
      result.created
        ? `Generated ${result.created} invoice${result.created === 1 ? "" : "s"} for ${period}.`
        : `Every active client already has an invoice for ${period}.`
    );
    setActiveTab("invoices");
  };

  return (
    <div className="space-y-5">
      <button onClick={() => setView("home")} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800">
        <ArrowLeft size={14} /> Dashboard
      </button>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Finance</h1>
          <p className="text-sm text-stone-500 mt-1">Track income, invoices, and where the money goes.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PrimaryButton
            variant="ghost"
            icon={FileDown}
            onClick={() => downloadCSV(
              "eden-labs-invoices.csv",
              ["Invoice", "Client", "Amount", "Status", "Date", "Period"],
              data.invoices.map((i) => [invoiceNo(i.id), clientOf(i.clientId)?.name || "—", i.amount, i.status, i.date, i.period || ""])
            )}
          >
            Export
          </PrimaryButton>
          <PrimaryButton variant="ghost" icon={Repeat} onClick={handleGenerate} title="Bills every active client for the current month">
            Bill active clients
          </PrimaryButton>
          <PrimaryButton icon={Plus} onClick={() => setInvoiceModalOpen(true)}>New invoice</PrimaryButton>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PillTabs
          size="md"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "invoices", label: "Invoices", count: counts.all },
            { value: "expenses", label: "Expenses" },
            { value: "unit-economics", label: "Unit economics" },
          ]}
        />
        {genStatus && <Badge tone="emerald" dot>{genStatus}</Badge>}
      </div>

      {/* ══ Overview ══ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid lg:grid-cols-12 gap-4">
            {/* Balance hero */}
            <Card dark className="p-6 lg:col-span-4 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white/50">Total collected</span>
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Wallet size={13} className="text-emerald-400" />
                </div>
              </div>
              <div className="text-[40px] leading-none font-bold tracking-tight mt-4 tnum">
                {money(totalRevenue)}
              </div>
              {revTrend != null ? (
                <div className={`flex items-center gap-1 mt-2 text-xs ${revTrend >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {revTrend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  <span className="tnum font-medium">{revTrend >= 0 ? "+" : ""}{revTrend}%</span>
                  <span className="text-white/40">than last month</span>
                </div>
              ) : (
                <div className="text-xs text-white/40 mt-2">
                  {thisMonthRev
                    ? `${money(thisMonthRev)} collected in ${currentMonth}`
                    : `No payments recorded in ${currentMonth} yet`}
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button onClick={() => setInvoiceModalOpen(true)} className="flex-1 bg-white text-night text-xs font-semibold rounded-full py-2.5 hover:bg-white/90 transition-colors">
                  New invoice
                </button>
                <button onClick={() => setActiveTab("expenses")} className="flex-1 bg-white/10 text-white text-xs font-semibold rounded-full py-2.5 hover:bg-white/[0.16] transition-colors">
                  Log expense
                </button>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between text-[11px] text-white/40 mb-3">
                  <span>Recurring revenue</span>
                  <span className="tnum">{money(mrr)}/mo</span>
                </div>
                <div className="space-y-2.5">
                  {data.clients.map((c) => (
                    <div key={c.id} className="flex items-center gap-2.5">
                      <Avatar name={c.name} photoUrl={c.photoUrl} logoUrl={c.logoUrl} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-white/90 truncate">{c.company}</div>
                        <div className="text-[10px] text-white/35">{c.status}</div>
                      </div>
                      <span className="text-xs font-semibold tnum text-white/80">
                        {money(c.contract?.value || 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Four metric tiles */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-4 content-start">
              {[
                { label: "Overdue", value: overdue, icon: AlertCircle, tone: "rose", note: `${counts.overdue} invoice${counts.overdue === 1 ? "" : "s"}` },
                { label: "Due next month", value: pending, icon: Clock, tone: "violet", note: `${counts.pending} pending` },
                { label: "Total costs", value: totalCost, icon: Receipt, tone: "amber", note: `${data.expenses.length} entries` },
                { label: "Net profit", value: profit, icon: DollarSign, tone: "emerald", note: `${margin}% margin` },
              ].map((s) => {
                const Icon = s.icon;
                const t = TILE_TONE[s.tone];
                return (
                  <Card key={s.label} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-stone-400">{s.label}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${t.wash}`}>
                        <Icon size={12} className={t.icon} />
                      </div>
                    </div>
                    <div className="text-2xl font-bold tracking-tight text-stone-900 mt-2.5 tnum">
                      {money(s.value)}
                    </div>
                    <div className="text-[11px] text-stone-400 mt-1">{s.note}</div>
                  </Card>
                );
              })}

              <Card className="p-4 col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-stone-400">Cost as share of revenue</span>
                  <span className="text-xs font-semibold text-stone-700 tnum">
                    {money(totalCost)} of {money(totalRevenue)}
                  </span>
                </div>
                <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-night rounded-full"
                    style={{ width: `${totalRevenue ? Math.min(100, Math.round((totalCost / totalRevenue) * 100)) : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-stone-400 mt-1.5">
                  <span>{totalRevenue ? Math.round((totalCost / totalRevenue) * 100) : 0}% spent</span>
                  <span>{margin}% kept</span>
                </div>
              </Card>
            </div>

            {/* Profit & loss */}
            <Card className="p-5 lg:col-span-4">
              <CardTitle sub="Collected revenue against recorded costs, by month">Revenue and costs</CardTitle>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={finSeries} barGap={3}>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={42} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="revenue" fill={COLORS.accent} radius={[4, 4, 0, 0]} name="Revenue" barSize={11} />
                  <Bar dataKey="cost" fill={COLORS.night} radius={[4, 4, 0, 0]} name="Cost" barSize={11} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Recent activity table */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Recent activity</div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
                  <input
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-white border border-line rounded-full pl-9 pr-3 py-1.5 text-sm w-36 sm:w-48 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-white border border-line rounded-full px-3 py-1.5 text-sm text-stone-600 focus:outline-none"
                >
                  <option value="all">All status</option>
                  <option value="paid">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[620px]">
                <thead>
                  <tr className="text-left text-xs text-stone-400 bg-stone-50">
                    <th className="py-2.5 px-3 font-medium rounded-l-lg">Invoice</th>
                    <th className="py-2.5 px-3 font-medium">Client</th>
                    <th className="py-2.5 px-3 font-medium">Amount</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium">Date</th>
                    <th className="py-2.5 px-3 font-medium rounded-r-lg text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.slice().reverse().map((i) => {
                    const client = clientOf(i.clientId);
                    return (
                      <tr key={i.id} className="border-b border-stone-100 last:border-0">
                        <td className="py-3 px-3 font-medium text-stone-700 tnum">{invoiceNo(i.id)}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={client?.name || "?"} photoUrl={client?.photoUrl} size={26} />
                            <div className="min-w-0">
                              <div className="text-stone-800 truncate">{client?.name || "—"}</div>
                              <div className="text-[11px] text-stone-400 truncate">{client?.company}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-stone-800 tnum">{money(i.amount)}</td>
                        <td className="py-3 px-3">
                          <Badge tone={STATUS_TONE[i.status]} dot>{STATUS_LABEL[i.status] || i.status}</Badge>
                        </td>
                        <td className="py-3 px-3 text-stone-500 tnum">{i.date}</td>
                        <td className="py-3 px-3 text-right">
                          <PrimaryButton
                            size="sm"
                            variant={i.status === "paid" ? "ghost" : "primary"}
                            onClick={() => onUpdateInvoiceStatus(i.id, i.status === "paid" ? "pending" : "paid")}
                          >
                            {i.status === "paid" ? "Mark unpaid" : "Mark paid"}
                          </PrimaryButton>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInvoices.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-xs text-stone-400">No invoices match that filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ══ Invoices ══ */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <PillTabs
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "pending", label: "Unpaid", count: counts.pending },
                { value: "overdue", label: "Overdue", count: counts.overdue },
                { value: "paid", label: "Paid", count: counts.paid },
              ]}
            />
            <div className="relative ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
              <input
                placeholder="Search client"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white border border-line rounded-full pl-9 pr-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </div>
            <PrimaryButton icon={Plus} onClick={() => setInvoiceModalOpen(true)}>New invoice</PrimaryButton>
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredInvoices.slice().reverse().map((invoice) => {
              const client = clientOf(invoice.clientId);
              if (!client) return null;
              // Ad-hoc invoices (from the New invoice modal) carry a real
              // description — show that as-is rather than the fabricated
              // retainer split, which would misdescribe a one-off like
              // "carousel design" as 45% content / 35% outreach / 20% reporting.
              const lines = invoice.description
                ? [{ label: invoice.description, value: invoice.amount }]
                : [
                    { label: client.contract?.serviceType === "content" ? "Content" : "LinkedIn content", value: Math.round(invoice.amount * 0.45) },
                    { label: "Outreach & DMs", value: Math.round(invoice.amount * 0.35) },
                    { label: "Reporting", value: Math.round(invoice.amount * 0.2) },
                  ];
              return (
                <Card key={invoice.id} className="p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-stone-400">Invoice</div>
                      <div className="text-lg font-bold tracking-tight text-stone-900 tnum">{invoiceNo(invoice.id)}</div>
                    </div>
                    <Badge tone={STATUS_TONE[invoice.status]} dot>{STATUS_LABEL[invoice.status] || invoice.status}</Badge>
                  </div>

                  <div className="flex items-center gap-2.5 mt-4 pb-4 border-b border-stone-100">
                    <Avatar name={client.name} photoUrl={client.photoUrl} logoUrl={client.logoUrl} size={34} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-stone-800 truncate">{client.company}</div>
                      <div className="text-[11px] text-stone-400 truncate">{client.email || client.name}</div>
                    </div>
                  </div>

                  <div className="space-y-2 py-4">
                    {lines.map((l) => (
                      <div key={l.label} className="flex justify-between text-xs">
                        <span className="text-stone-500">{l.label}</span>
                        <span className="text-stone-700 font-medium tnum">{money(l.value)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-end justify-between gap-2 pt-3 border-t border-stone-100 mt-auto">
                    <div>
                      <div className="text-[11px] text-stone-400">Balance due</div>
                      <div className={`text-xl font-bold tracking-tight tnum ${invoice.status === "paid" ? "text-emerald-700" : "text-stone-900"}`}>
                        {invoice.status === "paid" ? money(0) : money(invoice.amount)}
                      </div>
                    </div>
                    <PrimaryButton
                      size="sm"
                      variant={invoice.status === "paid" ? "ghost" : "primary"}
                      onClick={() => onUpdateInvoiceStatus(invoice.id, invoice.status === "paid" ? "pending" : "paid")}
                    >
                      {invoice.status === "paid" ? "Mark unpaid" : "Mark paid"}
                    </PrimaryButton>
                  </div>

                  <div className="text-[11px] text-stone-400 mt-3">
                    Issued {invoice.date} · Period {invoice.period || "—"}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ Expenses ══ */}
      {activeTab === "expenses" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <CardTitle sub={`${data.expenses.length} entries · ${money(totalCost)} total`}>
              Expenses &amp; subscriptions
            </CardTitle>
            <div className="space-y-1">
              {data.expenses.slice().reverse().map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-stone-100 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                      <Receipt size={14} className="text-stone-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-stone-800 truncate">{e.vendor}</div>
                      <div className="text-[11px] text-stone-400">{e.category} · {e.date}</div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-stone-800 tnum shrink-0">{money(e.amount)}</span>
                </div>
              ))}
              {data.expenses.length === 0 && <div className="text-xs text-stone-400 py-6 text-center">No expenses logged.</div>}
            </div>
          </Card>

          <Card className="p-5 h-fit">
            <CardTitle sub="Recorded against this month">Log an expense</CardTitle>
            <div className="space-y-2">
              <select value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })} className={`${inputCls} w-full`}>
                <option>Software</option>
                <option>Contractor</option>
                <option>Advertising</option>
                <option>Other</option>
              </select>
              <input placeholder="Vendor" value={exp.vendor} onChange={(e) => setExp({ ...exp, vendor: e.target.value })} className={`${inputCls} w-full`} />
              <input placeholder="Amount" type="number" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} className={`${inputCls} w-full`} />
              <PrimaryButton
                icon={Plus}
                className="w-full"
                onClick={() => {
                  if (!exp.vendor || !exp.amount) return;
                  onAddExpense({ ...exp, amount: Number(exp.amount), date: today() });
                  setExp({ category: "Software", vendor: "", amount: "" });
                }}
              >
                Add expense
              </PrimaryButton>
            </div>
          </Card>
        </div>
      )}

      {/* ══ Unit economics ══ */}
      {activeTab === "unit-economics" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <CardTitle sub="Revenue collected against estimated delivery cost">Per-client margin</CardTitle>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[460px]">
                <thead>
                  <tr className="text-left text-xs text-stone-400 bg-stone-50">
                    <th className="py-2.5 px-3 font-medium rounded-l-lg">Client</th>
                    <th className="py-2.5 px-3 font-medium">Revenue</th>
                    <th className="py-2.5 px-3 font-medium">Est. cost</th>
                    <th className="py-2.5 px-3 font-medium rounded-r-lg">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((c) => {
                    const rev = data.invoices.filter((i) => i.clientId === c.id && i.status === "paid").reduce((s, i) => s + i.amount, 0);
                    const cost = Math.round(rev * 0.22);
                    const m = rev ? Math.round(((rev - cost) / rev) * 100) : 0;
                    return (
                      <tr key={c.id} className="border-b border-stone-100 last:border-0">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={c.name} photoUrl={c.photoUrl} size={26} />
                            <span className="text-stone-800">{c.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-stone-600 tnum">{money(rev)}</td>
                        <td className="py-3 px-3 text-stone-600 tnum">{money(cost)}</td>
                        <td className="py-3 px-3"><Badge tone={m > 60 ? "emerald" : "amber"}>{m}%</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-stone-400 mt-3">
              22% cost is a placeholder — wire in real time and tool cost tracking once you move to Supabase.
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <CardTitle sub="Revenue trend">Collected over time</CardTitle>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={finSeries}>
                  <defs>
                    <linearGradient id="gFinUnit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                  <Area type="monotone" dataKey="revenue" stroke={COLORS.accent} strokeWidth={2.5} fill="url(#gFinUnit)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <CardTitle sub="Share of sourced pipeline">Per-channel contribution</CardTitle>
              <div className="space-y-2.5">
                {data.channelPerf.map((ch) => (
                  <div key={ch.channel} className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 w-32 shrink-0 truncate">{ch.channel}</span>
                    <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-emerald-700" style={{ width: `${ch.value}%` }} />
                    </div>
                    <span className="text-xs font-medium text-stone-600 w-9 text-right tnum">{ch.value}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      <InvoiceModal
        open={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        clients={data.clients}
        invoices={data.invoices}
        onCreate={onAddInvoice}
      />
    </div>
  );
}
