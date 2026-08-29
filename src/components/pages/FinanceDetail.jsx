import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  ArrowLeft, Plus, DollarSign, AlertCircle, Clock, Search,
  ArrowUpRight, ArrowDownRight, FileDown, Wallet, Receipt, Repeat, Mail, Loader2,
  Pencil, Trash2, X,
} from "lucide-react";
import { sendEmail } from "../../lib/email";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import PillTabs from "../ui/PillTabs";
import PrimaryButton from "../ui/PrimaryButton";
import InvoiceModal from "../ui/InvoiceModal";
import PrivacyToggle from "../ui/PrivacyToggle";
import BalanceBar from "../ui/BalanceBar";
import CategorySelect from "../ui/CategorySelect";
import CategoryManager from "../ui/CategoryManager";
import FinanceActivity from "../ui/FinanceActivity";
import Outgoings from "../ui/Outgoings";
import Budgets from "../ui/Budgets";
import Receivables from "../ui/Receivables";
import { downloadCSV, today, computeMRR, billingTypeLabel , monthBuckets } from "../../lib/utils";
import { useCurrency } from "../../hooks/useCurrency";
import { formatAmount, CURRENCIES, convertBetween } from "../../lib/currency";
import { invoiceNumber } from "../../lib/invoice";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { effectiveInvoiceStatus } from "../../lib/finance.js";

// A function rather than a shared object literal — resetting the form must
// hand back a fresh copy, not a reference every reset then mutates in common.
const BLANK_EXPENSE = () => ({
  category: "Software", vendor: "", amount: "", currency: "INR",
  date: today(), accountId: "", book: "business",
});

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

export default function FinanceDetail({
  data, setView, onAddExpense, onUpdateExpense, onDeleteExpense,
  onRenameExpenseCategory, onDeleteExpenseCategory,
  onAddInvoice, onGenerateInvoices, onUpdateInvoiceStatus, onDeleteInvoice,
  onAddAccount, onUpdateAccount, onDeleteAccount,
  onAddOutgoing, onUpdateOutgoing, onDeleteOutgoing, onCancelOutgoing, onPayOutgoing,
  onAddBudget, onUpdateBudget, onDeleteBudget, onAddExpenseCategory,
  onAddLoan, onUpdateLoan, onDeleteLoan, onSettleLoan, token,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  // Which book the "My money" tab is showing. Defaults to everything —
  // opening the tab filtered would hide half the outgoings behind a control
  // you'd have to notice before you could trust the totals.
  const [book, setBook] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [genStatus, setGenStatus] = useState("");
  // { [invoiceId]: "sending" | "sent" | "failed" }
  const [reminderStatus, setReminderStatus] = useState({});
  const [exp, setExp] = useState(BLANK_EXPENSE);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editExpenseForm, setEditExpenseForm] = useState({ category: "Software", vendor: "", amount: "", currency: "USD" });
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const { money, moneyIn, rate } = useCurrency();

  const clientOf = (id) => data.clients.find((c) => c.id === id);

  const totalRevenue = data.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalCost = data.expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue ? Math.round((profit / totalRevenue) * 100) : 0;
  // Every total below sums `amount`, the per-invoice USD snapshot, so mixed
  // currencies stay addable. This flag just drives an honest footnote.
  const hasMixedCurrency = data.invoices.some((i) => (i.currency || "USD") !== "USD");
  // Derived, not stored — see effectiveInvoiceStatus. These three numbers
  // used to read ~0 forever because nothing ever wrote status "overdue".
  const pending = data.invoices.filter((i) => effectiveInvoiceStatus(i) === "pending").reduce((s, i) => s + i.amount, 0);
  const overdue = data.invoices.filter((i) => effectiveInvoiceStatus(i) === "overdue").reduce((s, i) => s + i.amount, 0);

  const mrr = computeMRR(data.clients);
  // One-time and commission contracts don't belong in MRR, but their value
  // shouldn't just vanish from the owner's view of total contracted business.
  const recurringClients = data.clients.filter((c) => c.status === "active" && (c.contract?.billingType || "retainer") === "retainer");
  const nonRecurringClients = data.clients.filter((c) => c.status === "active" && (c.contract?.billingType || "retainer") !== "retainer");
  const nonRecurringTotal = nonRecurringClients.reduce((s, c) => s + (Number(c.contract?.value) || 0), 0);

  // Revenue and cost per month, the series behind every chart on this page.
  const finSeries = useMemo(() => {
    const b = monthBuckets(() => ({ revenue: 0, cost: 0 }));
    data.invoices.filter((i) => i.status === "paid")
      .forEach((i) => b.add(i.date, (m) => { m.revenue += i.amount; }));
    data.expenses.forEach((e) => b.add(e.date, (m) => { m.cost += e.amount; }));
    return b.series();
  }, [data.invoices, data.expenses]);

  // Month-over-month only means something once the current month has payments
  // in it; before that a "-100%" headline is technically true and useless.
  const lastMonthRev = finSeries.at(-2)?.revenue || 0;
  const thisMonthRev = finSeries.at(-1)?.revenue || 0;
  const currentMonth = finSeries.at(-1)?.month;
  const revTrend = thisMonthRev && lastMonthRev
    ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100)
    : null;

  const filteredInvoices = data.invoices.filter((i) => {
    const matchesStatus = filterStatus === "all" || effectiveInvoiceStatus(i) === filterStatus;
    const q = search.trim().toLowerCase();
    const client = clientOf(i.clientId);
    const matchesSearch = !q || (client?.name || "").toLowerCase().includes(q) || (client?.company || "").toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const invoiceNo = (id) => invoiceNumber(id, data.invoices);

  const counts = {
    all: data.invoices.length,
    paid: data.invoices.filter((i) => i.status === "paid").length,
    pending: data.invoices.filter((i) => effectiveInvoiceStatus(i) === "pending").length,
    overdue: data.invoices.filter((i) => effectiveInvoiceStatus(i) === "overdue").length,
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  const sendReminder = async (invoice) => {
    const client = clientOf(invoice.clientId);
    if (!client?.email) {
      setReminderStatus((s) => ({ ...s, [invoice.id]: "no-email" }));
      return;
    }
    setReminderStatus((s) => ({ ...s, [invoice.id]: "sending" }));
    const inv = invoiceNo(invoice.id);
    // The invoice's own currency, formatted directly rather than through
    // money() — this used to hardcode "$", which told a client billed in ₹
    // that they owed dollars. formatAmount also bypasses the hide-amounts
    // mask, which must never reach an outgoing email.
    const amount = formatAmount(invoice.nativeAmount ?? invoice.amount, {
      currency: invoice.currency || "USD",
      decimals: 2,
    });
    const text = `Hi ${client.name},\n\nThis is a reminder that invoice ${inv} for ${amount} is ${invoice.status}.\n\nPlease let us know if you have any questions.\n\n— Eden Labs`;
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917;line-height:1.6;max-width:520px">
  <p>Hi ${client.name},</p>
  <p>This is a friendly reminder that <strong>invoice ${inv}</strong> for <strong>${amount}</strong> is currently marked as <strong>${invoice.status}</strong>.</p>
  <p>Please reach out if you have any questions or need anything from our end.</p>
  <p>— Eden Labs</p>
</div>`;
    try {
      await sendEmail({ to: client.email, subject: `Payment reminder — invoice ${inv}`, text, html });
      setReminderStatus((s) => ({ ...s, [invoice.id]: "sent" }));
    } catch {
      setReminderStatus((s) => ({ ...s, [invoice.id]: "failed" }));
    }
  };

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

  const startEditExpense = (e) => {
    // Seeded from nativeAmount, not amount — amount is the derived USD
    // figure. Editing "amount" directly (the old behaviour) is what let a
    // stale, unconverted number drift away from what was actually paid.
    setEditExpenseForm({
      category: e.category, vendor: e.vendor,
      amount: String(e.nativeAmount ?? e.amount),
      currency: e.currency || "USD",
    });
    setEditingExpenseId(e.id);
  };
  const submitEditExpense = () => {
    if (!editExpenseForm.vendor || !editExpenseForm.amount) return;
    const native = Number(editExpenseForm.amount);
    onUpdateExpense(editingExpenseId, {
      category: editExpenseForm.category,
      vendor: editExpenseForm.vendor,
      nativeAmount: native,
      currency: editExpenseForm.currency,
      // Recomputed the same way the add form does it — see the note there.
      amount: convertBetween(native, editExpenseForm.currency, "USD", rate),
      fxRate: editExpenseForm.currency === "USD" ? 1 : rate,
    }, rate);
    setEditingExpenseId(null);
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
        <div className="flex items-center gap-2">
          <PrimaryButton
            variant="ghost"
            icon={FileDown}
            title="Export invoices as CSV"
            onClick={() => downloadCSV(
              "eden-labs-invoices.csv",
              // Both figures: what the client was billed in their own
              // currency, and the USD equivalent every total is based on.
              ["Invoice", "Client", "Billed amount", "Currency", "Amount (USD)", "FX rate", "Status", "Date", "Period"],
              data.invoices.map((i) => [
                invoiceNo(i.id), clientOf(i.clientId)?.name || "—",
                i.nativeAmount ?? i.amount, i.currency || "USD",
                i.amount, i.fxRate ?? 1,
                i.status, i.date, i.period || "",
              ])
            )}
          >
            <span className="hidden sm:inline">Export</span>
          </PrimaryButton>
          <PrimaryButton variant="ghost" icon={Repeat} onClick={handleGenerate} title="Bill retainer clients + due commission installments for this month — one-time projects are billed manually">
            <span className="hidden sm:inline">Bill active clients</span>
          </PrimaryButton>
          <PrimaryButton icon={Plus} onClick={() => setInvoiceModalOpen(true)}>
            <span className="hidden sm:inline">New invoice</span>
            <span className="sm:hidden">New</span>
          </PrimaryButton>
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
            { value: "money", label: "My money" },
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <PrivacyToggle dark />
                  <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <Wallet size={13} className="text-emerald-400" />
                  </div>
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

              {/* Totals sum each invoice's USD snapshot — adding ₹ to $ would
                  be meaningless — so say so once a non-USD invoice exists,
                  rather than presenting a converted total as if it were exact. */}
              {hasMixedCurrency && (
                <div className="text-[11px] text-white/35 mt-2 leading-snug">
                  Includes non-USD invoices, converted at each invoice's issue-date rate.
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
                  {recurringClients.map((c) => (
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
                  {!recurringClients.length && (
                    <div className="text-xs text-white/35">No retainer clients yet.</div>
                  )}
                </div>

                {/* One-time & commission contracts are real contracted value,
                    just not recurring — kept visible here rather than
                    silently dropped from the picture entirely. */}
                {nonRecurringClients.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between text-[11px] text-white/40 mb-3">
                      <span>Other active contract value</span>
                      <span className="tnum">{money(nonRecurringTotal)}</span>
                    </div>
                    <div className="space-y-2.5">
                      {nonRecurringClients.map((c) => (
                        <div key={c.id} className="flex items-center gap-2.5">
                          <Avatar name={c.name} photoUrl={c.photoUrl} logoUrl={c.logoUrl} size={26} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-white/90 truncate">{c.company}</div>
                            <div className="text-[10px] text-white/35">{billingTypeLabel(c.contract?.billingType)}</div>
                          </div>
                          <span className="text-xs font-semibold tnum text-white/80">
                            {money(c.contract?.value || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Four metric tiles */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-4 content-start">
              {[
                { label: "Overdue", value: overdue, icon: AlertCircle, tone: "rose", note: `${counts.overdue} invoice${counts.overdue === 1 ? "" : "s"}` },
                // Every pending invoice, not a next-month forecast — the old
                // label read as a projection of money that hadn't been billed.
                { label: "Awaiting payment", value: pending, icon: Clock, tone: "violet", note: `${counts.pending} pending` },
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
                        <td className="py-3 px-3 font-semibold text-stone-800 tnum">
                          {moneyIn(i.nativeAmount ?? i.amount, i.currency)}
                        </td>
                        <td className="py-3 px-3">
                          <Badge tone={STATUS_TONE[i.status]} dot>{STATUS_LABEL[i.status] || i.status}</Badge>
                        </td>
                        <td className="py-3 px-3 text-stone-500 tnum">
                          {/* i.date is stored as ISO YYYY-MM-DD — force noon UTC so
                              timezone offset doesn't flip it to the previous day. */}
                          {new Date(i.date + "T12:00:00").toLocaleDateString(undefined, {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {effectiveInvoiceStatus(i) !== "paid" && (
                              <button
                                onClick={() => sendReminder(i)}
                                disabled={reminderStatus[i.id] === "sending"}
                                title={reminderStatus[i.id] === "no-email" ? "No email on file for this client" : "Send payment reminder email"}
                                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full border border-line text-stone-500 hover:bg-stone-50 disabled:opacity-60 transition-colors"
                              >
                                {reminderStatus[i.id] === "sending" ? (
                                  <><Loader2 size={11} className="animate-spin" /> Sending…</>
                                ) : reminderStatus[i.id] === "sent" ? (
                                  "Sent ✓"
                                ) : reminderStatus[i.id] === "failed" ? (
                                  "Failed"
                                ) : reminderStatus[i.id] === "no-email" ? (
                                  "No email"
                                ) : (
                                  <><Mail size={11} /> Remind</>
                                )}
                              </button>
                            )}
                            <PrimaryButton
                              size="sm"
                              variant={i.status === "paid" ? "ghost" : "primary"}
                              onClick={() => onUpdateInvoiceStatus(i.id, i.status === "paid" ? "pending" : "paid", rate)}
                            >
                              {i.status === "paid" ? "Mark unpaid" : "Mark paid"}
                            </PrimaryButton>
                            <button
                              onClick={() => { if (confirm(`Delete invoice ${invoiceNo(i.id)}? This can't be undone.`)) onDeleteInvoice(i.id); }}
                              aria-label="Delete invoice"
                              className="text-stone-300 hover:text-rose-500 p-1.5 shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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
              // Line items are in the invoice's own currency, so they're
              // derived from nativeAmount, not the USD reporting snapshot.
              const native = invoice.nativeAmount ?? invoice.amount;
              const lines = invoice.description
                ? [{ label: invoice.description, value: native }]
                : [
                    { label: client.contract?.serviceType === "content" ? "Content" : "LinkedIn content", value: Math.round(native * 0.45) },
                    { label: "Outreach & DMs", value: Math.round(native * 0.35) },
                    { label: "Reporting", value: Math.round(native * 0.2) },
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
                        <span className="text-stone-700 font-medium tnum">{moneyIn(l.value, invoice.currency)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-end justify-between gap-2 pt-3 border-t border-stone-100 mt-auto">
                    <div>
                      <div className="text-[11px] text-stone-400">Balance due</div>
                      <div className={`text-xl font-bold tracking-tight tnum ${invoice.status === "paid" ? "text-emerald-700" : "text-stone-900"}`}>
                        {invoice.status === "paid" ? moneyIn(0, invoice.currency) : moneyIn(native, invoice.currency)}
                      </div>
                    </div>
                    <PrimaryButton
                      size="sm"
                      variant={invoice.status === "paid" ? "ghost" : "primary"}
                      onClick={() => onUpdateInvoiceStatus(invoice.id, invoice.status === "paid" ? "pending" : "paid", rate)}
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
              {data.expenses.slice().reverse().map((e) => {
                if (editingExpenseId === e.id) {
                  return (
                    // key={e.id}: same reasoning as the Outgoings/Budgets/
                    // BalanceBar edit forms — this list stays clickable while
                    // one row is being edited, so without a key tied to the
                    // row, clicking edit on a second expense before saving
                    // the first reuses the component instance and can save
                    // one row's edits onto another row's id.
                    <div key={e.id} className="flex items-center gap-2 flex-wrap bg-stone-50 rounded-xl p-3 my-1">
                      {/* Was a hardcoded 4-option list missing Marketing,
                          Utilities, Rent, Travel and anything else added
                          since — the exact bug already fixed on the add
                          form below, just not here too. Same shared,
                          editable vocabulary now. */}
                      <CategorySelect
                        value={editExpenseForm.category}
                        onChange={(v) => setEditExpenseForm({ ...editExpenseForm, category: v })}
                        categories={data.expenseCategories}
                        onAddCategory={onAddExpenseCategory}
                        className="w-32"
                      />
                      <input placeholder="Vendor" value={editExpenseForm.vendor} onChange={(ev) => setEditExpenseForm({ ...editExpenseForm, vendor: ev.target.value })} className={`${inputCls} flex-1 min-w-[8rem]`} />
                      <input placeholder="Amount" type="number" value={editExpenseForm.amount} onChange={(ev) => setEditExpenseForm({ ...editExpenseForm, amount: ev.target.value })} className={`${inputCls} w-24`} />
                      <select value={editExpenseForm.currency} onChange={(ev) => setEditExpenseForm({ ...editExpenseForm, currency: ev.target.value })} className={`${inputCls} w-20`}>
                        {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                      </select>
                      <PrimaryButton size="sm" onClick={submitEditExpense}>Save</PrimaryButton>
                      <button onClick={() => setEditingExpenseId(null)} className="text-stone-400 hover:text-stone-700 p-1.5">
                        <X size={15} />
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={e.id} className="group flex items-center justify-between gap-3 py-2.5 border-b border-stone-100 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center shrink-0">
                        <Receipt size={14} className="text-stone-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-stone-800 truncate">{e.vendor}</div>
                        <div className="text-[11px] text-stone-400">{e.category} · {e.date}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-stone-800 tnum">{money(e.amount)}</span>
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                        <button onClick={() => startEditExpense(e)} aria-label="Edit expense" className="text-stone-300 hover:text-stone-600 p-1">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => onDeleteExpense(e.id)} aria-label="Delete expense" className="text-stone-300 hover:text-rose-500 p-1">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {data.expenses.length === 0 && <div className="text-xs text-stone-400 py-6 text-center">No expenses logged.</div>}
            </div>
          </Card>

          <Card className="p-5 h-fit">
            <CardTitle sub="Logged at month end — pick the account it left, and the balance follows">
              Log an expense
            </CardTitle>
            <div className="space-y-2">
              {/* This used to be a hardcoded list containing "Advertising",
                  which existed in no other picker in the app. Any expense
                  filed under it — or any budget set on a category this list
                  omitted, like Marketing or Utilities — could never match,
                  so those budgets silently read zero spent. One shared,
                  editable vocabulary is the fix. */}
              <CategorySelect
                value={exp.category}
                onChange={(v) => setExp({ ...exp, category: v })}
                categories={data.expenseCategories}
                onAddCategory={onAddExpenseCategory}
              />
              <input placeholder="Vendor" value={exp.vendor} onChange={(e) => setExp({ ...exp, vendor: e.target.value })} className={`${inputCls} w-full`} />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Amount" type="number" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} className={`${inputCls} w-full`} />
                <select value={exp.currency} onChange={(e) => setExp({ ...exp, currency: e.target.value })} className={`${inputCls} w-full`}>
                  {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <input type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} className={`${inputCls} w-full`} />
              {/* Whose money this was. Business is the default because that
                  is what this ledger has always been — the untagged history
                  is agency spend, and defaulting the other way would move
                  real business costs out of every business total. */}
              <select value={exp.book} onChange={(e) => setExp({ ...exp, book: e.target.value })} className={`${inputCls} w-full`}>
                <option value="business">Eden Labs expense</option>
                <option value="personal">Personal expense</option>
              </select>
              <select value={exp.accountId} onChange={(e) => setExp({ ...exp, accountId: e.target.value })} className={`${inputCls} w-full`}>
                <option value="">Don't touch any balance</option>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>Paid from {a.name}</option>)}
              </select>
              <PrimaryButton
                icon={Plus}
                className="w-full"
                onClick={() => {
                  if (!exp.vendor || !exp.amount) return;
                  const native = Number(exp.amount);
                  // BUG THIS FIXES: `amount` is the field every USD-denominated
                  // aggregate on this page sums (totalCost, the cost chart,
                  // and the same field HomeDashboard's chart sums too) — it
                  // was being set to the raw typed number with NO conversion,
                  // whatever currency was picked. Log ₹700 and `amount` became
                  // 700, then every one of those totals treated ₹700 as $700 —
                  // roughly a 95x overstatement for every INR expense, and (via
                  // money()'s own USD->INR multiply on the way back out) the
                  // exact reason a ₹700 dinner was rendering as ₹66,850 on this
                  // very list. `nativeAmount`/`currency` are what was actually
                  // paid, same split invoices already use; `amount` is now the
                  // converted USD figure those aggregates need; `fxRate` is
                  // frozen at entry time so a later rate move can't silently
                  // reprice a past expense.
                  const fxRate = exp.currency === "USD" ? 1 : rate;
                  onAddExpense({
                    category: exp.category,
                    vendor: exp.vendor,
                    amount: convertBetween(native, exp.currency, "USD", rate),
                    nativeAmount: native,
                    currency: exp.currency,
                    fxRate,
                    date: exp.date || today(),
                    book: exp.book || "business",
                    accountId: exp.accountId || null,
                  }, rate);
                  setExp(BLANK_EXPENSE());
                }}
              >
                Add expense
              </PrimaryButton>
            </div>
          </Card>

          <CategoryManager
            categories={data.expenseCategories}
            expenses={data.expenses}
            outgoings={data.outgoings}
            budgets={data.budgets}
            onRename={onRenameExpenseCategory}
            onDelete={onDeleteExpenseCategory}
          />
        </div>
      )}

      {/* ══ My money ══ */}
      {/* Personal finances, deliberately kept in their own tab rather than
          mixed into Overview: agency revenue and personal balances answer
          different questions, and blending them makes both harder to read. */}
      {activeTab === "money" && (
        <div className="space-y-4">
          <BalanceBar
            accounts={data.accounts}
            onAdd={onAddAccount}
            onUpdate={onUpdateAccount}
            onDelete={onDeleteAccount}
            token={token}
          />

          {/* Whose money. One control at the top of the tab rather than a
              filter inside each card, so the subscriptions list and the
              budgets measuring them can never be showing different books —
              which would quietly explain a budget as "over" using spend the
              list below it isn't displaying. */}
          <PillTabs
            size="sm"
            value={book}
            onChange={setBook}
            options={[
              { value: "all", label: "Everything" },
              { value: "business", label: "Eden Labs" },
              { value: "personal", label: "Personal" },
            ]}
          />

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Outgoings
              outgoings={data.outgoings}
              accounts={data.accounts}
              book={book}
              onAdd={onAddOutgoing}
              onUpdate={onUpdateOutgoing}
              onDelete={onDeleteOutgoing}
              onCancel={onCancelOutgoing}
              onPay={onPayOutgoing}
              categories={data.expenseCategories}
              onAddCategory={onAddExpenseCategory}
              token={token}
            />
            <Budgets
              budgets={data.budgets}
              expenses={data.expenses}
              book={book}
              categories={data.expenseCategories}
              onAddCategory={onAddExpenseCategory}
              onAdd={onAddBudget}
              onUpdate={onUpdateBudget}
              onDelete={onDeleteBudget}
            />
          </div>

          {/* Sits under the two run-rate cards because it answers a
              different question — not "what leaves each month" but "what
              hasn't come back". Full width: rows carry a name, a reason and
              a due date, which don't fit a half-width column. */}
          <Receivables
            loans={data.loans}
            invoices={data.invoices}
            clients={data.clients}
            accounts={data.accounts}
            book={book}
            onAdd={onAddLoan}
            onUpdate={onUpdateLoan}
            onDelete={onDeleteLoan}
            onSettle={onSettleLoan}
          />

          <FinanceActivity log={data.financeLog} />
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
                {data.channelPerf.length === 0 && (
                  <div className="text-xs text-stone-400 py-4 text-center">No channel data yet.</div>
                )}
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
        accounts={data.accounts}
        onCreate={onAddInvoice}
      />
    </div>
  );
}
