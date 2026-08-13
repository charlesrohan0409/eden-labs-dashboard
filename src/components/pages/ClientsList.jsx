import { useState } from "react";
import { Plus, X, ChevronRight, FileDown, Search } from "lucide-react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import PrimaryButton from "../ui/PrimaryButton";
import ImagePicker from "../ui/ImagePicker";
import { buildNewClient, sendOnboardingEmail, CLIENT_TYPES, DEFAULT_CLIENT_TYPE, INDUSTRIES } from "../../data/seed";
import {
  computeHealthScore, healthTone, downloadCSV, relativeDays, isMetricOnTrack,
  computeMRR, billingTypeLabel, computeCommissionTotal,
} from "../../lib/utils";
import { useCurrency } from "../../hooks/useCurrency";

const EMPTY_FORM = {
  name: "", company: "", email: "", value: "", type: DEFAULT_CLIENT_TYPE, industry: "",
  serviceType: "content", startDate: "", photoUrl: "", logoUrl: "",
  billingType: "retainer", commissionPct: "", commissionBasis: "", payoutMonths: "",
};

// Every new LinkedIn client starts with the same three onboarding items —
// nothing to configure, just the standing checklist before real work
// (posting, outreach) begins.
const LINKEDIN_ONBOARDING_TASKS = [
  "Sign contract",
  "Optimise LinkedIn profile",
  "Create ICP, offer & positioning doc",
];

export default function ClientsList({ data, setView, setSelectedClient, onAddClient, onAddTask, token }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [onboardStatus, setOnboardStatus] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const { money } = useCurrency();

  // Commission is the one billing type where leaving fields blank would
  // silently create a $0 total (since the value is entirely derived from
  // % × basis) — worth blocking on, unlike a retainer/one-time value of $0
  // which was already allowed today and isn't a new footgun.
  const canCreate = !!form.name && (
    form.billingType !== "commission" ||
    (Number(form.commissionPct) > 0 && Number(form.commissionBasis) > 0 && Number(form.payoutMonths) > 0)
  );

  const handleCreate = async () => {
    if (!canCreate) return;
    const newClient = buildNewClient(form);
    onAddClient(newClient);
    if (newClient.type === "linkedin") {
      LINKEDIN_ONBOARDING_TASKS.forEach((title) => {
        onAddTask({ title, clientId: newClient.id, priority: "high", dueDate: "" });
      });
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    if (newClient.email) {
      setOnboardStatus(`Sending onboarding email to ${newClient.name}…`);
      const { sent, error } = await sendOnboardingEmail(newClient);
      setOnboardStatus(
        sent
          ? `Onboarding email sent to ${newClient.email}.`
          : `${newClient.name} created — but the welcome email didn't send: ${error}`
      );
    }
  };

  const filtered = data.clients.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q);
    const matchesType = typeFilter === "all" || (c.type || DEFAULT_CLIENT_TYPE) === typeFilter;
    return matchesSearch && matchesType;
  });

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const mrr = computeMRR(data.clients);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Clients</h1>
          <p className="text-sm text-stone-500 mt-1">
            {data.clients.length} accounts · {money(mrr)}/mo recurring
          </p>
        </div>
        <div className="flex gap-2">
          <PrimaryButton
            variant="ghost"
            icon={FileDown}
            onClick={() => downloadCSV(
              "eden-labs-clients.csv",
              ["Name", "Company", "Email", "Billing type", "Contract value", "Status", "Health score"],
              data.clients.map((c) => [
                c.name, c.company, c.email || "", billingTypeLabel(c.contract?.billingType),
                c.contract.value, c.status, computeHealthScore(c, data.invoices),
              ])
            )}
          >
            Export
          </PrimaryButton>
          <PrimaryButton
            icon={showForm ? X : Plus}
            variant={showForm ? "ghost" : "primary"}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "Add client"}
          </PrimaryButton>
        </div>
      </div>

      {showForm && (
        <Card className="p-5 space-y-2">
          {/* Type first — it decides which delivery metrics they get and which
              tabs their dashboard and portal will show. */}
          <div className="text-xs font-medium text-stone-500 mb-1">What kind of client is this?</div>
          <div className="grid sm:grid-cols-3 gap-2 mb-3">
            {Object.values(CLIENT_TYPES).map((t) => {
              const active = form.type === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setForm({ ...form, type: t.id })}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    active ? "border-emerald-600 bg-emerald-50" : "border-line bg-white hover:border-stone-300"
                  }`}
                >
                  <div className={`text-sm font-semibold ${active ? "text-emerald-900" : "text-stone-800"}`}>{t.label}</div>
                  <div className="text-[11px] text-stone-500 mt-0.5 leading-snug">{t.blurb}</div>
                </button>
              );
            })}
          </div>

          <div className="text-xs font-medium text-stone-500 mb-1">A few questions to generate their contract</div>
          <div className="flex gap-2 flex-wrap">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} flex-1 min-w-[9rem]`} />
            <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={`${inputCls} flex-1 min-w-[9rem]`} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <input placeholder="Client email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputCls} flex-1 min-w-[11rem]`} />
            <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={`${inputCls} flex-1 min-w-[11rem]`}>
              <option value="">Industry (optional)</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>

          {/* How this client actually gets paid — a flat monthly retainer,
              a single project fee (a one-off book edit, say), or a % commission
              paid out in installments over an agreed window. Only retainers
              count toward recurring revenue and only they get auto-billed
              every month by "Bill active clients". */}
          <div className="flex gap-2 flex-wrap">
            <select value={form.billingType} onChange={(e) => setForm({ ...form, billingType: e.target.value })} className={`${inputCls} flex-1 min-w-[11rem]`}>
              <option value="retainer">Monthly retainer</option>
              <option value="oneTime">One-time project</option>
              <option value="commission">Commission</option>
            </select>
            {form.billingType === "retainer" && (
              <input placeholder="Monthly value (USD)" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={`${inputCls} w-full sm:w-44`} />
            )}
            {form.billingType === "oneTime" && (
              <input placeholder="Project fee, one-time (USD)" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className={`${inputCls} w-full sm:w-52`} />
            )}
          </div>
          {form.billingType === "commission" && (
            <div className="flex gap-2 flex-wrap items-center">
              <input placeholder="Commission %" type="number" value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} className={`${inputCls} w-full sm:w-32`} />
              <input placeholder="Deal / basis value (USD)" type="number" value={form.commissionBasis} onChange={(e) => setForm({ ...form, commissionBasis: e.target.value })} className={`${inputCls} w-full sm:w-48`} />
              <input placeholder="Payout period (months)" type="number" value={form.payoutMonths} onChange={(e) => setForm({ ...form, payoutMonths: e.target.value })} className={`${inputCls} w-full sm:w-44`} />
              <div className="text-xs text-stone-500">
                Total: <span className="font-semibold tnum text-stone-700">{money(computeCommissionTotal(form.commissionPct, form.commissionBasis))}</span>
                {Number(form.payoutMonths) > 0 && (
                  <> · <span className="tnum">{money(computeCommissionTotal(form.commissionPct, form.commissionBasis) / Number(form.payoutMonths))}</span>/mo for {form.payoutMonths}mo</>
                )}
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {/* The LinkedIn service-tier picker only means something for
                LinkedIn clients — the contract template is built around it. */}
            {form.type === "linkedin" && (
              <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className={`${inputCls} flex-1 min-w-[11rem]`}>
                <option value="content">Content only</option>
                <option value="content_outreach">Content + outreach</option>
                <option value="full">Full done-for-you</option>
              </select>
            )}
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={`${inputCls} flex-1 min-w-[11rem]`} />
          </div>

          <div className="text-[11px] text-stone-400">
            Starting metrics: {CLIENT_TYPES[form.type].defaultDelivery.map((d) => d.metric).join(", ")} — editable later.
          </div>
          <div className="flex gap-6 flex-wrap pt-2">
            <ImagePicker
              round
              label="Client photo"
              hint="Shows on their avatar"
              value={form.photoUrl}
              onChange={(photoUrl) => setForm({ ...form, photoUrl })}
              token={token}
            />
            <ImagePicker
              label="Company logo"
              hint="Badges the avatar"
              value={form.logoUrl}
              onChange={(logoUrl) => setForm({ ...form, logoUrl })}
              token={token}
            />
          </div>
          <PrimaryButton onClick={handleCreate} disabled={!canCreate}>Create client + generate contract</PrimaryButton>
        </Card>
      )}

      {onboardStatus && <div className="text-xs text-stone-500">{onboardStatus}</div>}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm min-w-[12rem]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-300" />
          <input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-line rounded-full pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white border border-line rounded-full px-3.5 py-2 text-sm text-stone-600 focus:outline-none"
        >
          <option value="all">All types</option>
          {Object.values(CLIENT_TYPES).map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const health = computeHealthScore(c, data.invoices);
          const onTrack = c.delivery.filter(isMetricOnTrack).length;
          const renewal = relativeDays(c.contract.renewalDate);
          return (
            <Card
              key={c.id}
              className="p-5"
              onClick={() => { setSelectedClient(c.id); setView("client-detail"); }}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={c.name} photoUrl={c.photoUrl} logoUrl={c.logoUrl} size={40} />
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-800 truncate">{c.name}</div>
                    <div className="text-xs text-stone-400 truncate">{c.company}</div>
                    {c.industry && (
                      <div className="text-[11px] text-stone-400 truncate mt-0.5">{c.industry}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge tone={c.status === "active" ? "emerald" : c.status === "at-risk" ? "amber" : "stone"} dot>
                    {c.status}
                  </Badge>
                  <Badge tone="stone">{(CLIENT_TYPES[c.type] || CLIENT_TYPES[DEFAULT_CLIENT_TYPE]).label}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <div className="text-[11px] text-stone-400">{billingTypeLabel(c.contract?.billingType)}</div>
                  <div className="text-lg font-bold text-stone-900 tnum">{money(c.contract.value)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-stone-400">Health</div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-lg font-bold tnum ${
                      health >= 80 ? "text-emerald-700" : health >= 50 ? "text-amber-600" : "text-rose-600"
                    }`}>{health}</span>
                    <Badge tone={healthTone(health)}>{health >= 80 ? "healthy" : health >= 50 ? "watch" : "at risk"}</Badge>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
                <span>{onTrack}/{c.delivery.length} metrics on track</span>
                <span className="flex items-center gap-0.5 text-emerald-800">Open <ChevronRight size={13} /></span>
              </div>

              {renewal && renewal.days <= 14 && (
                <div className={`mt-3 text-xs rounded-lg px-3 py-2 ${
                  renewal.overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"
                }`}>
                  {renewal.overdue ? "Renewal date passed" : `Renews in ${renewal.days}d`}
                </div>
              )}
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-sm text-stone-400 py-10 text-center col-span-full">No clients match that search.</div>
        )}
      </div>
    </div>
  );
}
