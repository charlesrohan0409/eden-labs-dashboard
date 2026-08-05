import { useMemo, useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Send, FileDown, TrendingUp, CheckCircle2, DollarSign, Phone, Link2, Copy, Check,
  AlertTriangle, Ban, Eye, Clock, StickyNote, Activity, FileText, MessageSquare, CheckCheck, Trash2,
  Plus, Pencil, X, Upload,
} from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import PillTabs from "../ui/PillTabs";
import PrimaryButton from "../ui/PrimaryButton";
import PostComposer from "../ui/PostComposer";
import PostPreview from "../ui/PostPreview";
import TaskList from "../ui/TaskList";
import Modal from "../ui/Modal";
import { MONTHS, computeHealthScore, healthTone, relativeDays, formatDateTime, escapeHtml, isMetricOnTrack, metricProgressPct, portalLinkFor } from "../../lib/utils";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../../data/seed";
import { useCurrency } from "../../hooks/useCurrency";
import { sendEmail } from "../../lib/email";
import { fileToDocument } from "../../lib/media";

// ---- Activity log icon / colour per event type ----
const ACTIVITY_CONFIG = {
  post_created:       { icon: FileText,     color: "text-emerald-600", label: "Post drafted" },
  post_status_changed:{ icon: CheckCheck,   color: "text-violet-600",  label: "Post status" },
  dm_logged:          { icon: MessageSquare,color: "text-sky-600",     label: "DM logged" },
  contract_ended:     { icon: Ban,          color: "text-rose-500",    label: "Contract ended" },
  notes_updated:      { icon: StickyNote,   color: "text-amber-500",   label: "Notes updated" },
};

function ActivityTab({ clientId, activityLog }) {
  const entries = [...activityLog]
    .filter((e) => e.clientId === clientId)
    .sort((a, b) => (b.at > a.at ? 1 : -1));

  if (entries.length === 0) {
    return (
      <Card className="p-10 flex flex-col items-center justify-center text-center gap-3">
        <Activity size={32} className="text-stone-300" />
        <div>
          <div className="text-sm font-medium text-stone-600">No activity yet</div>
          <div className="text-xs text-stone-400 mt-1">
            Key events — posts, DMs, status changes — will appear here automatically.<br />
            A full audit trail will be stored in Supabase once connected.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <CardTitle sub={`${entries.length} event${entries.length === 1 ? "" : "s"} recorded`}>
        <span className="flex items-center gap-2"><Activity size={15} className="text-stone-500" /> Activity log</span>
      </CardTitle>
      <div className="relative pl-5 space-y-0">
        {/* Vertical timeline line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-stone-100" />
        {entries.map((entry) => {
          const cfg = ACTIVITY_CONFIG[entry.type] || { icon: Activity, color: "text-stone-400", label: entry.type };
          const Icon = cfg.icon;
          const ts = new Date(entry.at);
          const dateLabel = ts.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
          const timeLabel = ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={entry.id} className="flex items-start gap-3 py-3 border-b border-stone-100 last:border-0">
              {/* Icon bubble on the timeline */}
              <div className={`w-3.5 h-3.5 rounded-full bg-white border-2 border-stone-200 shrink-0 mt-0.5 -ml-5 flex items-center justify-center`} />
              <div className="min-w-0 flex-1 -mt-px">
                <div className="flex items-start gap-2 flex-wrap">
                  <Icon size={13} className={`${cfg.color} shrink-0 mt-0.5`} />
                  <span className="text-sm text-stone-700">{entry.description}</span>
                </div>
                <div className="text-[11px] text-stone-400 mt-0.5">
                  {dateLabel} · {timeLabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-stone-400 mt-4 pt-3 border-t border-stone-100">
        Activity is stored locally — a persistent audit trail will land once Supabase is connected.
      </p>
    </Card>
  );
}

export default function ClientDetail({
  data, clientId, setView, onAddPost, onUpdatePost, onDeletePost, onAddDM, onDeleteDM, onUpdateContract, onUpdateDelivery,
  onAddDeliveryMetric, onUpdateDeliveryMetric, onDeleteDeliveryMetric,
  onUpdatePostStatus, onEndContract, onDeleteClient, onAddTask, onToggleTask, onDeleteTask, onUpdateTask,
  onUpdateClientNotes, onLogActivity,
}) {
  const [tab, setTab] = useState("overview");
  const [dmForm, setDmForm] = useState({ direction: "sent", content: "" });
  const [contractInput, setContractInput] = useState("");
  const [contractUploading, setContractUploading] = useState(false);
  const [contractUploadError, setContractUploadError] = useState("");
  const contractFileInputRef = useRef(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [endForm, setEndForm] = useState({ reason: "" });
  const [viewingPost, setViewingPost] = useState(null);
  const [notesText, setNotesText] = useState("");
  const [addingKpi, setAddingKpi] = useState(false);
  const [kpiForm, setKpiForm] = useState({ metric: "", target: "", direction: "higher" });
  const [editingKpiIdx, setEditingKpiIdx] = useState(null);
  const { money } = useCurrency();

  const client = data.clients.find((c) => c.id === clientId);
  const clientDms = data.dms.filter((d) => d.clientId === clientId);

  const clientGrowth = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, posts: 0, dms: 0 }));
    data.posts.filter((p) => p.clientId === clientId).forEach((p) => {
      const m = MONTHS[new Date(p.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m].posts += 1;
    });
    data.dms.filter((d) => d.clientId === clientId).forEach((d) => {
      const m = MONTHS[new Date(d.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m].dms += 1;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [data.posts, data.dms, clientId]);

  const clientRevenue = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, revenue: 0 }));
    data.invoices.filter((i) => i.clientId === clientId && i.status === "paid").forEach((i) => {
      const m = MONTHS[new Date(i.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m].revenue += i.amount;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [data.invoices, clientId]);

  // Sync scratchpad when switching between clients
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setNotesText(client?.notes || ""); }, [clientId]);

  if (!client) return null;

  const clientCalls = data.calls.filter((c) => c.clientId === clientId);
  const closedDeals = data.contacts.filter((c) => c.clientId === clientId && c.stage === "closed");
  const renewal = relativeDays(client.contract.renewalDate);
  const health = computeHealthScore(client, data.invoices);
  const totalPaid = clientRevenue.reduce((s, m) => s + m.revenue, 0);
  const openTasks = data.tasks.filter((t) => t.clientId === clientId && !t.done).length;

  const clientType = CLIENT_TYPES[client.type] || CLIENT_TYPES[DEFAULT_CLIENT_TYPE];
  const TAB_LABELS = { overview: "Overview", content: "Content", dms: "DMs", contract: "Contract", activity: "Activity", report: "Report" };
  const visibleTabs = clientType.tabs.map((t) => ({ value: t, label: TAB_LABELS[t] || t }));
  // If the active tab isn't available for this client's type (e.g. you were on
  // Content, then opened a book client), fall back to Overview rather than
  // rendering an empty page.
  const activeTab = clientType.tabs.includes(tab) ? tab : "overview";

  // A self-uploaded contract (client.contract.fileUrl) always wins over the
  // auto-generated bodyText — download opens/saves the actual uploaded file
  // rather than printing the generated text as a PDF.
  const handleDownloadPdf = () => {
    if (client.contract.fileUrl) {
      const a = document.createElement("a");
      a.href = client.contract.fileUrl;
      a.download = client.contract.fileName || "contract";
      a.click();
      return;
    }
    window.print();
  };

  const handleUploadContract = async (file) => {
    if (!file) return;
    setContractUploadError("");
    setContractUploading(true);
    try {
      const doc = await fileToDocument(file);
      onUpdateContract(client.id, { ...client.contract, fileUrl: doc.url, fileName: doc.name, fileType: file.type });
    } catch (e) {
      setContractUploadError(e.message);
    } finally {
      setContractUploading(false);
      if (contractFileInputRef.current) contractFileInputRef.current.value = "";
    }
  };

  const handleRemoveContractFile = () => {
    onUpdateContract(client.id, { ...client.contract, fileUrl: "", fileName: "", fileType: "" });
  };

  // AI contract editing needs its own Anthropic key server-side (a separate
  // integration from anything built so far) — disabled honestly below rather
  // than left silently broken. handleSendEmail/handleSendReport used to be
  // the same leftover artifact code (a fetch to api.anthropic.com with a
  // Gmail MCP server attached, which only ever worked inside claude.ai); both
  // now go through the same Resend proxy invoices use.
  const aiEditAvailable = false;
  const handleAiEdit = () => {};

  const handleSendEmail = async () => {
    if (!client.email) {
      setEmailStatus("Add a client email in the client's contact details first.");
      return;
    }
    setEmailLoading(true);
    setEmailStatus("");
    try {
      const hasFile = !!client.contract.fileUrl;
      // Resend wants attachment content as bare base64 — no "data:...;base64,"
      // prefix — so strip that off the stored data URL.
      const attachments = hasFile
        ? [{ filename: client.contract.fileName || "contract", content: client.contract.fileUrl.split(",")[1] }]
        : undefined;
      await sendEmail({
        to: client.email,
        subject: "Your Eden Labs Service Agreement",
        text: hasFile ? "Your service agreement is attached." : client.contract.bodyText,
        html: hasFile
          ? `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917">Your service agreement is attached.</div>`
          : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917;white-space:pre-wrap;line-height:1.6;max-width:640px">${escapeHtml(client.contract.bodyText)}</div>`,
        attachments,
      });
      setEmailStatus(`Sent to ${client.email}.`);
    } catch (e) {
      setEmailStatus(`Failed to send: ${e.message}`);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSendReport = async () => {
    if (!client.email) {
      setReportStatus("Add a client email in the client's contact details first.");
      return;
    }
    setReportLoading(true);
    setReportStatus("");
    const totalPosts = clientGrowth.reduce((s, m) => s + m.posts, 0);
    const totalDms = clientGrowth.reduce((s, m) => s + m.dms, 0);
    const deliveryLines = client.delivery.map((d) => `${d.metric}: ${d.current}/${d.target}`);
    const dealsLines = closedDeals.map((d) => `${d.name} (${d.company}): ${money(d.dealValue)}, closed ${d.closedDate}`);
    const text = [
      `Hi ${client.name},`,
      "",
      "Here's your monthly snapshot from Eden Labs.",
      "",
      `Growth: ${totalPosts} posts published, ${totalDms} messages logged over the last 6 months.`,
      "",
      "Delivery:", ...deliveryLines.map((l) => `- ${l}`),
      "",
      `Finance: ${money(totalPaid)} total paid.`,
      "",
      `Calls booked: ${clientCalls.length}`,
      "",
      "Deals closed:", ...(dealsLines.length ? dealsLines.map((l) => `- ${l}`) : ["None this period."]),
      "",
      "Full charts and details are live on your dashboard anytime.",
      "",
      "— Eden Labs",
    ].join("\n");
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917;line-height:1.6;max-width:560px">
      <p>Hi ${escapeHtml(client.name)},</p>
      <p>Here's your monthly snapshot from Eden Labs.</p>
      <p><strong>Growth:</strong> ${totalPosts} posts published, ${totalDms} messages logged over the last 6 months.</p>
      <p><strong>Delivery:</strong><br/>${deliveryLines.map(escapeHtml).join("<br/>") || "—"}</p>
      <p><strong>Finance:</strong> ${money(totalPaid)} total paid.</p>
      <p><strong>Calls booked:</strong> ${clientCalls.length}</p>
      <p><strong>Deals closed:</strong><br/>${dealsLines.length ? dealsLines.map(escapeHtml).join("<br/>") : "None this period."}</p>
      <p>Full charts and details are live on your dashboard anytime.</p>
      <p>— Eden Labs</p>
    </div>`;
    try {
      await sendEmail({ to: client.email, subject: "Your Eden Labs monthly report", text, html });
      setReportStatus(`Sent to ${client.email}.`);
    } catch (e) {
      setReportStatus(`Failed to send: ${e.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  const copyPortalLink = () => {
    navigator.clipboard?.writeText(`${portalLinkFor(client)} · PIN ${client.pin}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const confirmEndContract = () => {
    onEndContract(client.id, endForm.reason);
    setEndOpen(false);
    setEndForm({ reason: "" });
  };

  // Unlike endContract (reversible, keeps history), this is permanent — the
  // client and every post/DM/invoice/task tied to them is gone. Type-to-
  // confirm rather than a single click, since there's no undo.
  const confirmDeleteClient = () => {
    if (deleteConfirmText.trim() !== client.name) return;
    onDeleteClient(client.id);
    setView("clients");
  };

  // ---- KPI (delivery metric) management — add / edit / delete ----
  const submitAddKpi = () => {
    if (!kpiForm.metric.trim()) return;
    onAddDeliveryMetric(client.id, kpiForm);
    setKpiForm({ metric: "", target: "", direction: "higher" });
    setAddingKpi(false);
  };
  const submitEditKpi = (idx) => {
    if (!kpiForm.metric.trim()) return;
    onUpdateDeliveryMetric(client.id, idx, {
      metric: kpiForm.metric.trim(),
      target: Number(kpiForm.target) || 0,
      direction: kpiForm.direction,
    });
    setEditingKpiIdx(null);
  };
  const startEditKpi = (idx, d) => {
    setKpiForm({ metric: d.metric, target: String(d.target), direction: d.direction || "higher" });
    setEditingKpiIdx(idx);
    setAddingKpi(false);
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const reviewQueue = data.posts.filter((p) => p.clientId === client.id && (p.status === "draft" || p.status === "pending_review"));
  const contractEnded = client.contract.status === "ended";

  return (
    <div className="space-y-5">
      <button onClick={() => setView("clients")} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800">
        <ArrowLeft size={14} /> Clients
      </button>

      {/* ── Header ── */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <Avatar name={client.name} photoUrl={client.photoUrl} logoUrl={client.logoUrl} size={52} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">{client.name}</h1>
              <div className="text-sm text-stone-400">{client.company}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="stone">{clientType.label}</Badge>
            {client.industry && <Badge tone="stone">{client.industry}</Badge>}
            <Badge tone={healthTone(health)} dot>{health} health</Badge>
            <Badge tone={client.status === "active" ? "emerald" : "amber"} dot>{client.status}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-stone-100">
          <div>
            <div className="text-[11px] text-stone-400">Monthly value</div>
            <div className="text-xl font-bold text-stone-900 tnum">{money(client.contract.value)}</div>
          </div>
          <div>
            <div className="text-[11px] text-stone-400">Total paid</div>
            <div className="text-xl font-bold text-stone-900 tnum">{money(totalPaid)}</div>
          </div>
          <div>
            <div className="text-[11px] text-stone-400">Calls booked</div>
            <div className="text-xl font-bold text-stone-900 tnum">{clientCalls.length}</div>
          </div>
          <div>
            <div className="text-[11px] text-stone-400">Open tasks</div>
            <div className="text-xl font-bold text-stone-900 tnum">{openTasks}</div>
          </div>
        </div>
      </Card>

      {/* Only the tabs this client's service line actually uses — a book
          edit has no LinkedIn content pipeline, so it has no Content tab. */}
      <PillTabs size="md" value={activeTab} onChange={setTab} options={visibleTabs} />

      {/* ══ Overview ══ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <TaskList
            tasks={data.tasks}
            clients={data.clients}
            clientId={client.id}
            onAdd={onAddTask}
            onToggle={onToggleTask}
            onDelete={onDeleteTask}
            onUpdate={onUpdateTask}
            title={`Tasks for ${client.name.split(" ")[0]}`}
          />

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <CardTitle sub="Posts published and messages logged">
                <span className="flex items-center gap-2"><TrendingUp size={15} className="text-emerald-700" /> Growth</span>
              </CardTitle>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={clientGrowth} barGap={3}>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="posts" fill={COLORS.accent} radius={[3, 3, 0, 0]} name="Posts" barSize={10} />
                  <Bar dataKey="dms" fill={COLORS.teal} radius={[3, 3, 0, 0]} name="DMs logged" barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <CardTitle sub={`Total paid: ${money(totalPaid)}`}>
                <span className="flex items-center gap-2"><DollarSign size={15} className="text-amber-600" /> Finance</span>
              </CardTitle>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={clientRevenue}>
                  <defs>
                    <linearGradient id="gClientRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                  <Area type="monotone" dataKey="revenue" stroke={COLORS.amber} fill="url(#gClientRev)" strokeWidth={2.5} name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="p-5">
            <CardTitle
              sub="Edit the current column to update progress — set your own KPIs per client"
              action={
                !addingKpi && (
                  <button
                    onClick={() => { setAddingKpi(true); setEditingKpiIdx(null); setKpiForm({ metric: "", target: "", direction: "higher" }); }}
                    className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    <Plus size={13} /> Add KPI
                  </button>
                )
              }
            >
              <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-700" /> Delivery</span>
            </CardTitle>
            <div className="space-y-3">
              {client.delivery.map((d, idx) => {
                const onTrack = isMetricOnTrack(d);
                if (editingKpiIdx === idx) {
                  return (
                    <div key={idx} className="flex items-center gap-2 flex-wrap bg-stone-50 rounded-xl p-3">
                      <input
                        autoFocus
                        placeholder="KPI name"
                        value={kpiForm.metric}
                        onChange={(e) => setKpiForm({ ...kpiForm, metric: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && submitEditKpi(idx)}
                        className={`${inputCls} flex-1 min-w-[9rem]`}
                      />
                      <input
                        type="number"
                        placeholder="Target"
                        value={kpiForm.target}
                        onChange={(e) => setKpiForm({ ...kpiForm, target: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && submitEditKpi(idx)}
                        className={`${inputCls} w-24`}
                      />
                      <select
                        value={kpiForm.direction}
                        onChange={(e) => setKpiForm({ ...kpiForm, direction: e.target.value })}
                        className={`${inputCls} w-36`}
                      >
                        <option value="higher">Higher is better</option>
                        <option value="lower">Lower is better</option>
                      </select>
                      <PrimaryButton size="sm" onClick={() => submitEditKpi(idx)}>Save</PrimaryButton>
                      <button onClick={() => setEditingKpiIdx(null)} className="text-stone-400 hover:text-stone-700 p-1.5">
                        <X size={15} />
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="group flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-stone-600 w-full sm:w-48">
                      {d.metric}{d.direction === "lower" && <span className="text-stone-400"> (lower is better)</span>}
                    </span>
                    <input
                      type="number"
                      value={d.current}
                      onChange={(e) => onUpdateDelivery(client.id, idx, Number(e.target.value))}
                      className={`${inputCls} w-20`}
                    />
                    <span className="text-xs text-stone-400">/ target {d.target}</span>
                    <div className="flex-1 min-w-[6rem] h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${onTrack ? "bg-emerald-600" : "bg-amber-500"}`}
                        style={{ width: `${metricProgressPct(d)}%` }}
                      />
                    </div>
                    <Badge tone={onTrack ? "emerald" : "amber"}>
                      {onTrack ? "on track" : "behind"}
                    </Badge>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditKpi(idx, d)} aria-label="Edit KPI" className="text-stone-400 hover:text-stone-700 p-1">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => onDeleteDeliveryMetric(client.id, idx)} aria-label="Delete KPI" className="text-stone-400 hover:text-rose-600 p-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {addingKpi && (
                <div className="flex items-center gap-2 flex-wrap bg-emerald-50/60 rounded-xl p-3">
                  <input
                    autoFocus
                    placeholder="KPI name (e.g. Posts per week)"
                    value={kpiForm.metric}
                    onChange={(e) => setKpiForm({ ...kpiForm, metric: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && submitAddKpi()}
                    className={`${inputCls} flex-1 min-w-[9rem]`}
                  />
                  <input
                    type="number"
                    placeholder="Target"
                    value={kpiForm.target}
                    onChange={(e) => setKpiForm({ ...kpiForm, target: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && submitAddKpi()}
                    className={`${inputCls} w-24`}
                  />
                  <select
                    value={kpiForm.direction}
                    onChange={(e) => setKpiForm({ ...kpiForm, direction: e.target.value })}
                    className={`${inputCls} w-36`}
                  >
                    <option value="higher">Higher is better</option>
                    <option value="lower">Lower is better</option>
                  </select>
                  <PrimaryButton size="sm" icon={Plus} onClick={submitAddKpi}>Add</PrimaryButton>
                  <button onClick={() => setAddingKpi(false)} className="text-stone-400 hover:text-stone-700 p-1.5">
                    <X size={15} />
                  </button>
                </div>
              )}
              {client.delivery.length === 0 && <div className="text-xs text-stone-400">No delivery metrics set.</div>}
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <CardTitle sub={`${closedDeals.length} closed · ${money(closedDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0))} value`}>
                <span className="flex items-center gap-2"><Phone size={15} className="text-sky-700" /> Calls &amp; deals</span>
              </CardTitle>
              <div className="space-y-2">
                {closedDeals.map((d) => (
                  <div key={d.id} className="flex justify-between text-sm py-2 border-b border-stone-100 last:border-0">
                    <span className="text-stone-600 truncate">{d.name} · {d.company}</span>
                    <span className="text-emerald-700 font-medium tnum shrink-0">
                      {money(d.dealValue)}
                    </span>
                  </div>
                ))}
                {closedDeals.length === 0 && <div className="text-xs text-stone-400">No deals closed for this client yet.</div>}
              </div>
            </Card>

            <Card className="p-5">
              <CardTitle sub="What the client uses to sign in">
                <span className="flex items-center gap-2"><Link2 size={15} className="text-violet-600" /> Portal access</span>
              </CardTitle>
              <div className="flex items-center gap-2 bg-stone-50 border border-line rounded-xl px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-stone-700 truncate">{portalLinkFor(client)}</div>
                  <div className="text-xs text-stone-400 mt-0.5">PIN {client.pin}</div>
                </div>
                <PrimaryButton size="sm" variant="ghost" icon={copied ? Check : Copy} onClick={copyPortalLink}>
                  {copied ? "Copied" : "Copy"}
                </PrimaryButton>
              </div>
            </Card>
          </div>

          {/* ── Notes scratchpad ── */}
          <Card className="p-5">
            <CardTitle sub="Auto-saved on blur — private, not shown to the client">
              <span className="flex items-center gap-2"><StickyNote size={15} className="text-amber-500" /> Notes</span>
            </CardTitle>
            <textarea
              rows={4}
              placeholder={`Quick notes about ${client.name.split(" ")[0]}… (auto-saved when you click away)`}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              onBlur={() => onUpdateClientNotes?.(client.id, notesText)}
              className="w-full border border-line rounded-xl px-3.5 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20 resize-none leading-relaxed"
            />
          </Card>
        </div>
      )}

      {/* ══ Content ══ */}
      {activeTab === "content" && (
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            {/* No Buffer wiring here on purpose: Buffer is connected under
                Charles's own account (see Integrations), and its channels are
                his own LinkedIn profiles — never a client's. Client posts stay
                local until each client has their own connected channel, which
                isn't something this personal API key can do. */}
            <PostComposer
              clientId={client.id}
              posts={data.posts}
              onAddPost={onAddPost}
              onUpdatePost={onUpdatePost}
              onDeletePost={onDeletePost}
              onPushForApproval={onAddPost}
              author={client.name}
              headline={client.company}
              avatarUrl={client.photoUrl}
            />
          </Card>

          <Card className="p-4 sm:p-5">
            <CardTitle sub="Drafts move to the client's portal once you push them for approval">
              Review queue
            </CardTitle>
            <div className="space-y-3">
              {reviewQueue.map((p) => (
                <div key={p.id} className="border border-line rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-stone-50 border-b border-stone-100 flex-wrap">
                    <Badge tone={p.status === "pending_review" ? "amber" : "stone"} dot>
                      {p.status === "pending_review" ? "awaiting client" : "draft"}
                    </Badge>
                    {p.scheduledAt && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                        <Clock size={11} /> {formatDateTime(p.scheduledAt)}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => setViewingPost(p)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
                      >
                        <Eye size={13} /> See full post
                      </button>
                      {p.status === "draft" && (
                        <PrimaryButton size="sm" onClick={() => onUpdatePostStatus(p.id, "pending_review")}>
                          Push for approval
                        </PrimaryButton>
                      )}
                    </div>
                  </div>
                  <div className="p-3.5 text-sm text-stone-600 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                    {p.content || "(media only)"}
                  </div>
                </div>
              ))}
              {reviewQueue.length === 0 && (
                <div className="text-xs text-stone-400 py-6 text-center">Nothing waiting on review.</div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ══ DMs ══ */}
      {activeTab === "dms" && (
        <Card className="p-5">
          <CardTitle sub="Manual log until the LinkedIn integration lands">Message log</CardTitle>
          <div className="space-y-1 mb-4">
            {clientDms.map((d) => (
              <div key={d.id} className="group flex items-start gap-2.5 text-sm py-2.5 border-b border-stone-100 last:border-0">
                <Badge tone={d.direction === "sent" ? "teal" : "stone"}>{d.direction}</Badge>
                <span className="text-stone-600 flex-1">{d.content}</span>
                <span className="text-xs text-stone-400 shrink-0 tnum">{d.date}</span>
                <button
                  onClick={() => onDeleteDM(d.id)}
                  aria-label="Delete DM"
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-stone-300 hover:text-rose-500 transition p-0.5 shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {clientDms.length === 0 && <div className="text-sm text-stone-400 py-6 text-center">No DMs logged yet.</div>}
          </div>
          <div className="flex gap-2 flex-wrap pt-4 border-t border-stone-100">
            <select value={dmForm.direction} onChange={(e) => setDmForm({ ...dmForm, direction: e.target.value })} className={`${inputCls} w-32`}>
              <option value="sent">Sent</option>
              <option value="received">Received</option>
            </select>
            <input
              placeholder="Log a DM manually..."
              value={dmForm.content}
              onChange={(e) => setDmForm({ ...dmForm, content: e.target.value })}
              className={`${inputCls} flex-1 min-w-[11rem]`}
            />
            <PrimaryButton
              variant="dark"
              onClick={() => {
                if (!dmForm.content.trim()) return;
                onAddDM({ clientId: client.id, direction: dmForm.direction, content: dmForm.content, date: new Date().toISOString().slice(0, 10) });
                setDmForm({ direction: "sent", content: "" });
              }}
            >
              Log
            </PrimaryButton>
          </div>
        </Card>
      )}

      {/* ══ Contract ══ */}
      {activeTab === "contract" && (
        <div className="space-y-4">
          {contractEnded && (
            <div className="rounded-2xl border border-stone-300 bg-stone-100 px-4 py-3.5 flex items-start gap-2.5">
              <Ban size={16} className="text-stone-500 shrink-0 mt-0.5" />
              <div className="text-sm text-stone-700">
                <div className="font-medium">Contract ended{client.contract.endedAt ? ` on ${client.contract.endedAt}` : ""}.</div>
                {client.contract.endReason && (
                  <div className="text-xs text-stone-500 mt-0.5">Reason: {client.contract.endReason}</div>
                )}
                <div className="text-xs text-stone-500 mt-0.5">
                  They no longer count toward recurring revenue. History stays intact.
                </div>
              </div>
            </div>
          )}

          <Card className="p-5">
            <CardTitle sub="Terms shown to the client in their portal">Contract terms</CardTitle>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-stone-400">Monthly value ($)</label>
                <input
                  type="number"
                  value={client.contract.value}
                  onChange={(e) => onUpdateContract(client.id, { ...client.contract, value: Number(e.target.value) })}
                  className={`${inputCls} w-full mt-1`}
                />
              </div>
              <div>
                <label className="text-xs text-stone-400">Status</label>
                <select
                  value={client.contract.status}
                  onChange={(e) => onUpdateContract(client.id, { ...client.contract, status: e.target.value })}
                  className={`${inputCls} w-full mt-1`}
                >
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-400">Renewal date</label>
                <input
                  type="date"
                  value={client.contract.renewalDate || ""}
                  onChange={(e) => onUpdateContract(client.id, { ...client.contract, renewalDate: e.target.value })}
                  className={`${inputCls} w-full mt-1`}
                />
              </div>
            </div>
            {renewal && renewal.days <= 14 && (
              <div className={`text-xs rounded-xl px-3.5 py-2.5 mt-3 ${renewal.overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>
                {renewal.overdue
                  ? "Renewal date has passed — update it or confirm the contract lapsed."
                  : `Renews in ${renewal.days} day${renewal.days === 1 ? "" : "s"}.`}
              </div>
            )}
          </Card>

          {/* Destructive actions live apart from everything else. */}
          {!contractEnded && (
            <Card className="p-5 border-rose-200">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-stone-900 tracking-tight flex items-center gap-2">
                    <AlertTriangle size={15} className="text-rose-500" /> End this contract
                  </div>
                  <div className="text-xs text-stone-500 mt-1 max-w-md">
                    Marks {client.name} as ended and stops them counting toward recurring revenue.
                    Posts, invoices, and history are kept. Requires your password.
                  </div>
                </div>
                <button
                  onClick={() => setEndOpen(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 transition-colors shrink-0"
                >
                  <Ban size={15} /> End contract
                </button>
              </div>
            </Card>
          )}

          <Card className="p-5 border-rose-200">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-stone-900 tracking-tight flex items-center gap-2">
                  <Trash2 size={15} className="text-rose-500" /> Delete this client
                </div>
                <div className="text-xs text-stone-500 mt-1 max-w-md">
                  Permanently removes {client.name} and everything tied to them — posts, DMs, invoices,
                  calls, tasks, and activity history. This cannot be undone.
                </div>
              </div>
              <button
                onClick={() => { setDeleteOpen(true); setDeleteConfirmText(""); }}
                className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 transition-colors shrink-0"
              >
                <Trash2 size={15} /> Delete client
              </button>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 flex-wrap gap-2">
              <span className="text-[15px] font-semibold text-stone-900 tracking-tight">Contract document</span>
              <div className="flex gap-2">
                <input
                  ref={contractFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,image/*"
                  className="hidden"
                  onChange={(e) => handleUploadContract(e.target.files?.[0])}
                />
                {client.contract.fileUrl ? (
                  <PrimaryButton size="sm" variant="ghost" icon={Trash2} onClick={handleRemoveContractFile}>
                    Remove upload
                  </PrimaryButton>
                ) : null}
                <PrimaryButton
                  size="sm"
                  variant="ghost"
                  icon={contractUploading ? undefined : Upload}
                  onClick={() => contractFileInputRef.current?.click()}
                  disabled={contractUploading}
                >
                  {contractUploading ? "Uploading…" : client.contract.fileUrl ? "Replace file" : "Upload contract"}
                </PrimaryButton>
                <PrimaryButton size="sm" variant="ghost" icon={FileDown} onClick={handleDownloadPdf}>
                  {client.contract.fileUrl ? "Download" : "Download PDF"}
                </PrimaryButton>
                <PrimaryButton size="sm" icon={Send} onClick={handleSendEmail} disabled={emailLoading}>
                  {emailLoading ? "Sending…" : "Send email"}
                </PrimaryButton>
              </div>
            </div>
            {contractUploadError && <div className="px-5 py-2.5 text-xs text-rose-600 bg-rose-50 border-b border-rose-100">{contractUploadError}</div>}
            {emailStatus && <div className="px-5 py-2.5 text-xs text-stone-500 bg-stone-50 border-b border-stone-100">{emailStatus}</div>}

            {client.contract.fileUrl ? (
              <div className="p-4 bg-stone-50">
                <div className="text-xs text-stone-500 mb-2 flex items-center gap-1.5">
                  <FileText size={13} /> {client.contract.fileName || "Uploaded contract"} — your own document, replacing the generated text below.
                </div>
                {client.contract.fileType === "application/pdf" ? (
                  <iframe title="Uploaded contract" src={client.contract.fileUrl} className="w-full h-[420px] rounded-xl border border-stone-200 bg-white" />
                ) : client.contract.fileType?.startsWith("image/") ? (
                  <img src={client.contract.fileUrl} alt="Uploaded contract" className="max-h-[420px] mx-auto rounded-xl border border-stone-200" />
                ) : (
                  <div className="p-6 text-center text-sm text-stone-500 bg-white rounded-xl border border-stone-200">
                    Preview isn't available for this file type — use Download to view it.
                  </div>
                )}
              </div>
            ) : (
              <div id="eden-print-area" className="p-6 font-serif text-[15px] text-stone-700 whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto">
                {client.contract.bodyText || "No contract text yet."}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <CardTitle sub={aiEditAvailable ? "Rewrites the document and keeps the previous version in history" : "Needs an Anthropic API key wired up server-side — not connected yet"}>
              Ask Claude to edit this contract
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <input
                disabled={!aiEditAvailable}
                placeholder={aiEditAvailable ? 'e.g. "add a clause capping content revisions at 2 per post"' : "Not connected — ask to have this wired up when you're ready"}
                value={contractInput}
                onChange={(e) => setContractInput(e.target.value)}
                onKeyDown={(e) => aiEditAvailable && e.key === "Enter" && handleAiEdit()}
                className={`${inputCls} flex-1 min-w-[11rem] disabled:bg-stone-50 disabled:text-stone-400`}
              />
              <PrimaryButton variant="dark" onClick={handleAiEdit} disabled={!aiEditAvailable || aiLoading}>
                {aiLoading ? "Updating…" : "Update"}
              </PrimaryButton>
            </div>
          </Card>

          {(client.contract.history || []).length > 0 && (
            <Card className="p-5">
              <CardTitle sub={`${client.contract.history.length} saved version${client.contract.history.length === 1 ? "" : "s"}`}>
                Version history
              </CardTitle>
              <div className="space-y-1">
                {[...client.contract.history].reverse().map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm border-b border-stone-100 last:border-0 py-2.5">
                    <div className="min-w-0">
                      <div className="text-stone-700 tnum">{h.date}</div>
                      {h.note && <div className="text-xs text-stone-400 truncate">Before: "{h.note}"</div>}
                    </div>
                    <PrimaryButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
                        const newHistory = [...client.contract.history, { date: stamp, bodyText: client.contract.bodyText, note: "restored an earlier version" }];
                        onUpdateContract(client.id, { ...client.contract, bodyText: h.bodyText, history: newHistory });
                      }}
                    >
                      Restore
                    </PrimaryButton>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ══ Activity ══ */}
      {activeTab === "activity" && (
        <ActivityTab clientId={client.id} activityLog={data.activityLog || []} />
      )}

      {/* ══ Report ══ */}
      {activeTab === "report" && (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 flex-wrap gap-2">
            <span className="text-[15px] font-semibold text-stone-900 tracking-tight">Monthly report</span>
            <div className="flex gap-2">
              <PrimaryButton size="sm" variant="ghost" icon={FileDown} onClick={handleDownloadPdf}>Download PDF</PrimaryButton>
              <PrimaryButton size="sm" icon={Send} onClick={handleSendReport} disabled={reportLoading}>
                {reportLoading ? "Sending…" : "Email to client"}
              </PrimaryButton>
            </div>
          </div>
          {reportStatus && <div className="px-5 py-2.5 text-xs text-stone-500 bg-stone-50 border-b border-stone-100">{reportStatus}</div>}

          <div id="eden-print-area" className="p-6 space-y-6">
            <div>
              <div className="text-2xl font-bold tracking-tight text-stone-900">{client.name} — {client.company}</div>
              <div className="text-xs text-stone-400 mt-1">Monthly report · {new Date().toLocaleDateString()}</div>
            </div>

            <div>
              <div className="text-sm font-semibold text-stone-800 mb-3">Growth</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={clientGrowth} barGap={3}>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...chartTooltipStyle} />
                  <Bar dataKey="posts" fill={COLORS.accent} radius={[3, 3, 0, 0]} name="Posts" barSize={10} />
                  <Bar dataKey="dms" fill={COLORS.teal} radius={[3, 3, 0, 0]} name="DMs logged" barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <div className="text-sm font-semibold text-stone-800 mb-2">Delivery</div>
              <div className="space-y-1.5">
                {client.delivery.map((d, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-stone-600">{d.metric}</span>
                    <span className="text-stone-500 tnum">{d.current} / {d.target}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-stone-800 mb-3">Finance</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={clientRevenue}>
                  <defs>
                    <linearGradient id="gReportRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                  <Area type="monotone" dataKey="revenue" stroke={COLORS.amber} fill="url(#gReportRev)" strokeWidth={2.5} name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="text-xs text-stone-400 mt-1">Total paid: {money(totalPaid)}</div>
            </div>

            <div>
              <div className="text-sm font-semibold text-stone-800 mb-2">Calls &amp; deals</div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-stone-600">Calls booked</span>
                <span className="text-stone-800 tnum">{clientCalls.length}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-stone-600">Deals closed</span>
                <span className="text-stone-800 tnum">
                  {closedDeals.length} · {money(closedDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0))}
                </span>
              </div>
              {closedDeals.map((d) => (
                <div key={d.id} className="flex justify-between text-xs text-stone-500">
                  <span>{d.name} · {d.company}</span>
                  <span className="tnum">{money(d.dealValue)} · {d.closedDate}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Full post view, shared by the review queue */}
      <Modal
        open={!!viewingPost}
        onClose={() => setViewingPost(null)}
        title="Full post"
        subtitle={viewingPost?.scheduledAt ? `Scheduled for ${formatDateTime(viewingPost.scheduledAt)}` : "Not scheduled yet"}
        width="lg"
        footer={
          viewingPost?.status === "draft" ? (
            <PrimaryButton
              onClick={() => { onUpdatePostStatus(viewingPost.id, "pending_review"); setViewingPost(null); }}
            >
              Push for approval
            </PrimaryButton>
          ) : null
        }
      >
        {viewingPost && (
          <PostPreview
            author={client.name}
            headline={client.company}
            avatarUrl={client.photoUrl}
            content={viewingPost.content}
            media={viewingPost.media}
            poll={viewingPost.poll}
            timeLabel={viewingPost.scheduledAt ? formatDateTime(viewingPost.scheduledAt) : "Draft"}
          />
        )}
      </Modal>

      {/* End contract — password gated */}
      <Modal
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title={`End contract with ${client.name}?`}
        subtitle="This changes billing. It can be reversed by setting the contract back to active."
        width="sm"
        footer={
          <>
            <PrimaryButton variant="ghost" onClick={() => setEndOpen(false)}>Cancel</PrimaryButton>
            <button
              onClick={confirmEndContract}
              className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 transition-colors"
            >
              <Ban size={15} /> End contract
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-xs text-rose-700 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {client.name} drops out of recurring revenue (−{money(client.contract.value)}/mo)
              and their status becomes <strong>ended</strong>. Their posts, invoices, and portal history stay.
            </span>
          </div>

          <div>
            <label className="text-xs text-stone-500 font-medium">Reason (optional)</label>
            <input
              placeholder="e.g. pilot finished, not renewing"
              value={endForm.reason}
              onChange={(e) => setEndForm({ ...endForm, reason: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && confirmEndContract()}
              className={`${inputCls} w-full mt-1`}
            />
          </div>
        </div>
      </Modal>

      {/* Delete client — permanent, type-to-confirm since there's no undo */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${client.name}?`}
        subtitle="This is permanent — unlike ending a contract, nothing is kept."
        width="sm"
        footer={
          <>
            <PrimaryButton variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</PrimaryButton>
            <button
              onClick={confirmDeleteClient}
              disabled={deleteConfirmText.trim() !== client.name}
              className="inline-flex items-center gap-1.5 text-sm font-medium rounded-full px-4 py-2 bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 size={15} /> Delete permanently
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-xs text-rose-700 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {client.name} and every post, DM, invoice, call, task, and activity entry tied to them will
              be permanently deleted. Their portal PIN stops working immediately. There is no undo.
            </span>
          </div>

          <div>
            <label className="text-xs text-stone-500 font-medium">
              Type <span className="font-semibold text-stone-700">{client.name}</span> to confirm
            </label>
            <input
              autoFocus
              placeholder={client.name}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmDeleteClient()}
              className={`${inputCls} w-full mt-1`}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
