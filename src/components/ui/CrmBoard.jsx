import { useMemo, useRef, useState } from "react";
import { Phone, Mail, MoreVertical, Plus, Search, X, SlidersHorizontal, ArrowRight, GripVertical } from "lucide-react";
import Avatar from "./Avatar";
import Badge from "./Badge";
import Card from "./Card";
import PrimaryButton from "./PrimaryButton";
import { STAGE_WEIGHTS, today } from "../../lib/utils";
import { useCurrency } from "../../hooks/useCurrency";

export const STAGES = ["lead", "call_booked", "proposal_sent", "closed", "lost"];

// Cool tones move left-to-right toward the warm "won" green; lost sits apart
// in red so a dead deal never reads as progress.
export const STAGE_META = {
  lead: { label: "Lead", dot: "bg-sky-500", tone: "sky", head: "bg-sky-50/70", ring: "ring-sky-500/30", drop: "bg-sky-50" },
  call_booked: { label: "Call booked", dot: "bg-violet-500", tone: "violet", head: "bg-violet-50/70", ring: "ring-violet-500/30", drop: "bg-violet-50" },
  proposal_sent: { label: "Proposal sent", dot: "bg-amber-500", tone: "amber", head: "bg-amber-50/70", ring: "ring-amber-500/30", drop: "bg-amber-50" },
  closed: { label: "Closed won", dot: "bg-emerald-500", tone: "emerald", head: "bg-emerald-50/70", ring: "ring-emerald-500/30", drop: "bg-emerald-50" },
  lost: { label: "Lost", dot: "bg-rose-500", tone: "rose", head: "bg-rose-50/60", ring: "ring-rose-500/30", drop: "bg-rose-50" },
};

// ---------- One lead card ----------
function LeadCard({ contact, onUpdateStage, onDragStart, onDragEnd, dragging }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { money } = useCurrency();
  const meta = STAGE_META[contact.stage] || STAGE_META.lead;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox needs data set for the drag to start at all.
        e.dataTransfer.setData("text/plain", contact.id);
        onDragStart(contact.id);
      }}
      onDragEnd={onDragEnd}
      className={`group relative bg-white border border-line rounded-xl p-4 cursor-grab active:cursor-grabbing transition-all ${
        dragging ? "opacity-40 scale-[0.98]" : "hover:border-stone-300 hover:shadow-sm"
      }`}
    >
      <GripVertical
        size={14}
        className="absolute left-1 top-1/2 -translate-y-1/2 text-stone-200 opacity-0 group-hover:opacity-100 transition-opacity"
      />

      <div className="flex items-start gap-3 pr-5">
        <Avatar name={contact.name} photoUrl={contact.photoUrl} size={38} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone-800 truncate leading-tight">{contact.name}</div>
          <div className="text-xs text-stone-400 truncate mt-0.5">
            {contact.title}{contact.title && contact.company ? " · " : ""}{contact.company}
          </div>
        </div>

        <div className="absolute top-3 right-2.5">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Move lead to another stage"
            className="text-stone-300 hover:text-stone-600"
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-6 z-20 w-44 bg-white border border-line rounded-xl shadow-lg py-1">
                <div className="text-[10px] uppercase tracking-wide text-stone-400 px-3 py-1.5">Move to</div>
                {STAGES.filter((s) => s !== contact.stage).map((s) => (
                  <button
                    key={s}
                    onClick={() => { onUpdateStage(contact.id, s); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50 text-left"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[s].dot}`} />
                    {STAGE_META[s].label}
                    <ArrowRight size={11} className="ml-auto text-stone-300" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {(contact.phone || contact.email) && (
        <div className="mt-3 space-y-1.5">
          {contact.phone && (
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <Phone size={12} className="text-stone-300 shrink-0" /> {contact.phone}
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2 text-xs text-stone-500 min-w-0">
              <Mail size={12} className="text-stone-300 shrink-0" />
              <span className="truncate">{contact.email}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3.5 pt-3 border-t border-stone-100">
        <Badge tone={meta.tone}>{contact.source || "manual"}</Badge>
        {contact.dealValue > 0 && (
          <span className="text-sm font-semibold text-stone-800 tnum">
            {money(contact.dealValue)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Board ----------
export default function CrmBoard({ contacts, onAddContact, onUpdateStage, showExtensionHint = true }) {
  const { money } = useCurrency();
  const [form, setForm] = useState({ name: "", company: "", title: "", source: "manual", dealValue: "", phone: "", email: "" });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  // Drag events fire on children too; count enter/leave so the highlight is stable.
  const enterCount = useRef({});

  const sources = useMemo(
    () => ["all", ...new Set(contacts.map((c) => c.source).filter(Boolean))],
    [contacts]
  );

  const filtered = contacts.filter((c) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q);
    return matchesSearch && (sourceFilter === "all" || c.source === sourceFilter);
  });

  const open = filtered.filter((c) => c.stage !== "closed" && c.stage !== "lost");
  const weightedPipeline = open.reduce((s, c) => s + (Number(c.dealValue) || 0) * (STAGE_WEIGHTS[c.stage] ?? 0), 0);
  const closedValue = filtered.filter((c) => c.stage === "closed").reduce((s, c) => s + (Number(c.dealValue) || 0), 0);
  const decided = filtered.filter((c) => c.stage === "closed" || c.stage === "lost").length;
  const winRate = decided ? Math.round((filtered.filter((c) => c.stage === "closed").length / decided) * 100) : 0;

  const handleDrop = (e, stage) => {
    e.preventDefault();
    enterCount.current[stage] = 0;
    setDragOverStage(null);
    // The id travels on the event itself; `draggingId` is only for styling and
    // may not have flushed yet.
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    const contact = contacts.find((c) => c.id === id);
    if (contact && contact.stage !== stage) onUpdateStage(id, stage);
    setDraggingId(null);
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <div className="space-y-4">
      {/* Pipeline summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Weighted pipeline", value: money(Math.round(weightedPipeline)), note: "stage-probability adjusted" },
          { label: "Closed won", value: money(closedValue), note: `${winRate}% win rate` },
          { label: "Open leads", value: open.length, note: "still in play" },
          { label: "Avg deal size", value: money(filtered.length ? Math.round(filtered.reduce((s, c) => s + (Number(c.dealValue) || 0), 0) / filtered.length) : 0), note: "all leads in view" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-stone-400 font-medium">{s.label}</div>
            <div className="text-2xl font-bold tracking-tight text-stone-900 mt-1 tnum">{s.value}</div>
            <div className="text-[11px] text-stone-400 mt-0.5">{s.note}</div>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[11rem]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-300" />
          <input
            placeholder="Search anything..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-line rounded-full pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-white border border-line rounded-full px-3.5 py-2 text-sm text-stone-600 focus:outline-none"
        >
          {sources.map((s) => (
            <option key={s} value={s}>{s === "all" ? "All sources" : s}</option>
          ))}
        </select>
        <button
          className="hidden sm:flex items-center gap-1.5 bg-white border border-line rounded-full px-3.5 py-2 text-sm text-stone-500"
          title="More filters coming with the Supabase migration"
        >
          <SlidersHorizontal size={14} /> Filter
        </button>
        <PrimaryButton
          icon={showForm ? X : Plus}
          variant={showForm ? "ghost" : "primary"}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "Add lead"}
        </PrimaryButton>
      </div>

      {showForm && (
        <Card className="p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} flex-1 min-w-[8rem]`} />
            <input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={`${inputCls} flex-1 min-w-[8rem]`} />
            <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${inputCls} flex-1 min-w-[8rem]`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${inputCls} flex-1 min-w-[8rem]`} />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputCls} flex-1 min-w-[8rem]`} />
            <input placeholder="Deal value ($)" type="number" value={form.dealValue} onChange={(e) => setForm({ ...form, dealValue: e.target.value })} className={`${inputCls} w-32`} />
            <PrimaryButton
              icon={Plus}
              onClick={() => {
                if (!form.name) return;
                onAddContact({ ...form, stage: "lead", dealValue: Number(form.dealValue) || 0, addedDate: today() });
                setForm({ name: "", company: "", title: "", source: "manual", dealValue: "", phone: "", email: "" });
                setShowForm(false);
              }}
            >
              Add lead
            </PrimaryButton>
          </div>
          {showExtensionHint && (
            <div className="text-xs text-stone-400">or use the Chrome extension to save straight from LinkedIn</div>
          )}
        </Card>
      )}

      {/* Board — always horizontally scrollable so columns keep a comfortable
          width instead of being squeezed to fit the viewport. */}
      <div className="overflow-x-auto -mx-4 px-4 md:-mx-8 md:px-8 pb-3 no-scrollbar">
        <div className="flex gap-4 min-w-max">
          {STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const inStage = filtered.filter((c) => c.stage === stage);
            const stageValue = inStage.reduce((s, c) => s + (Number(c.dealValue) || 0), 0);
            const isOver = dragOverStage === stage;

            return (
              <div
                key={stage}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDragEnter={() => {
                  enterCount.current[stage] = (enterCount.current[stage] || 0) + 1;
                  setDragOverStage(stage);
                }}
                onDragLeave={() => {
                  enterCount.current[stage] = Math.max(0, (enterCount.current[stage] || 0) - 1);
                  if (enterCount.current[stage] === 0) setDragOverStage((s) => (s === stage ? null : s));
                }}
                onDrop={(e) => handleDrop(e, stage)}
                className={`w-[300px] shrink-0 rounded-2xl transition-colors ${
                  isOver ? `${meta.drop} ring-2 ${meta.ring}` : "bg-stone-100/50"
                }`}
              >
                <div className={`flex items-center gap-2 px-4 py-3 rounded-t-2xl ${meta.head}`}>
                  <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                  <span className="text-sm font-semibold text-stone-700">{meta.label}</span>
                  <span className="ml-auto text-[11px] text-stone-500 bg-white border border-line rounded-full px-2 py-0.5 tnum">
                    {inStage.length}
                  </span>
                </div>

                {stageValue > 0 && (
                  <div className="px-4 pb-1 text-[11px] text-stone-400 tnum">
                    {money(stageValue)} in this stage
                  </div>
                )}

                <div className="space-y-3 p-3 pt-2 min-h-[7rem]">
                  {inStage.map((c) => (
                    <LeadCard
                      key={c.id}
                      contact={c}
                      onUpdateStage={onUpdateStage}
                      onDragStart={setDraggingId}
                      onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                      dragging={draggingId === c.id}
                    />
                  ))}

                  {inStage.length === 0 && (
                    <div
                      className={`rounded-xl border border-dashed py-8 text-center text-xs transition-colors ${
                        isOver ? "border-stone-400 text-stone-600" : "border-stone-300 text-stone-400"
                      }`}
                    >
                      {isOver ? "Drop here" : "No leads"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-stone-400">
        Drag a card between columns to change its stage — or use the ⋮ menu on touch devices.
      </div>
    </div>
  );
}
