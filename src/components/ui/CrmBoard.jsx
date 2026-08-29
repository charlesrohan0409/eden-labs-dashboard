import { useMemo, useRef, useState, useEffect } from "react";
import { Phone, Mail, MoreVertical, Plus, Search, X, SlidersHorizontal, ArrowRight, GripVertical, Trash2, Link2 } from "lucide-react";
import Avatar from "./Avatar";
import Badge from "./Badge";
import Card from "./Card";
import Modal from "./Modal";
import PrimaryButton from "./PrimaryButton";
import { STAGE_WEIGHTS, today } from "../../lib/utils";
import { useCurrency } from "../../hooks/useCurrency";
import { CURRENCIES, convertBetween } from "../../lib/currency";

// A lead's deal value, in whatever currency it was actually quoted in.
//
// Same split invoices already use, and for the same reason: `dealValue`
// stays a frozen USD snapshot so every aggregate on this board — weighted
// pipeline, closed-won, average deal size — keeps summing one comparable
// number. Summing ₹ and $ together would be meaningless. `nativeDealValue`
// + `dealCurrency` are what was actually quoted, and what gets displayed;
// `dealFxRate` is frozen at entry so a later rate move can't silently
// reprice a deal that closed months ago.
function dealFields(amount, code, rate) {
  const native = Number(amount) || 0;
  return {
    dealValue: convertBetween(native, code || "USD", "USD", rate),
    nativeDealValue: native,
    dealCurrency: code || "USD",
    dealFxRate: (code || "USD") === "USD" ? 1 : rate,
  };
}

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

// ---------- Edit lead modal ----------
// Every field the extension or the manual "Add lead" form can set is
// editable here — this is the one place to fill in details added later
// (a call happened, a deal value firmed up, notes from a conversation).
function EditLeadModal({ contact, onClose, onUpdateContact, onDeleteContact }) {
  const { rate } = useCurrency();
  // Seeds the amount field from the NATIVE value so opening a ₹ lead shows
  // ₹, not its USD snapshot — editing and saving without touching the field
  // would otherwise silently rewrite the deal to the converted number.
  const seed = (c) => ({
    ...c,
    dealValue: c?.nativeDealValue ?? c?.dealValue ?? "",
    dealCurrency: c?.dealCurrency || "USD",
  });
  const [form, setForm] = useState(() => seed(contact));
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-sync if a different card is opened without unmounting.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(seed(contact)), [contact?.id]);


  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const inputCls = "w-full border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const labelCls = "text-[11px] font-medium text-stone-400 uppercase tracking-wide";

  const save = () => {
    onUpdateContact(contact.id, {
      name: form.name?.trim() || contact.name,
      company: form.company?.trim() || "",
      title: form.title?.trim() || "",
      stage: form.stage,
      source: form.source?.trim() || "",
      ...dealFields(form.dealValue, form.dealCurrency, rate),
      phone: form.phone?.trim() || "",
      email: form.email?.trim() || "",
      notes: form.notes?.trim() || "",
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit lead"
      subtitle={`Added ${contact.addedDate || "—"}`}
      footer={
        confirmDelete ? (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-stone-500 flex-1">Delete this lead permanently?</span>
            <PrimaryButton variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</PrimaryButton>
            <PrimaryButton
              variant="danger"
              onClick={() => { onDeleteContact(contact.id); onClose(); }}
            >
              Delete
            </PrimaryButton>
          </div>
        ) : (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              className="mr-auto flex items-center gap-1.5 text-xs text-rose-500 hover:text-rose-700 px-2"
            >
              <Trash2 size={13} /> Delete lead
            </button>
            <PrimaryButton variant="ghost" onClick={onClose}>Cancel</PrimaryButton>
            <PrimaryButton onClick={save}>Save changes</PrimaryButton>
          </>
        )
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Name</label>
            <input className={`${inputCls} mt-1`} value={form.name || ""} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Stage</label>
            <select className={`${inputCls} mt-1`} value={form.stage} onChange={(e) => set({ stage: e.target.value })}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_META[s].label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Company</label>
            <input className={`${inputCls} mt-1`} value={form.company || ""} onChange={(e) => set({ company: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Title / role</label>
            <input className={`${inputCls} mt-1`} value={form.title || ""} onChange={(e) => set({ title: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={`${inputCls} mt-1`} value={form.email || ""} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" className={`${inputCls} mt-1`} value={form.phone || ""} onChange={(e) => set({ phone: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Deal value</label>
            <div className="flex gap-1.5 mt-1">
              <input type="number" min="0" className={`${inputCls} flex-1 min-w-0`} value={form.dealValue || ""} onChange={(e) => set({ dealValue: e.target.value })} />
              <select className={`${inputCls} w-20 shrink-0`} value={form.dealCurrency || "USD"} onChange={(e) => set({ dealCurrency: e.target.value })}>
                {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Source</label>
            <input className={`${inputCls} mt-1`} value={form.source || ""} onChange={(e) => set({ source: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Notes</label>
          <textarea
            rows={4}
            className={`${inputCls} mt-1 resize-none leading-relaxed`}
            placeholder="Anything worth remembering about this lead…"
            value={form.notes || ""}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

        {contact.url && (
          <a
            href={contact.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-emerald-700 hover:underline"
          >
            <Link2 size={12} /> {contact.url}
          </a>
        )}
      </div>
    </Modal>
  );
}

// ---------- One lead card ----------
function LeadCard({ contact, onUpdateStage, onEdit, onDragStart, onDragEnd, dragging }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { money, moneyIn } = useCurrency();
  const meta = STAGE_META[contact.stage] || STAGE_META.lead;

  return (
    <div
      draggable
      onClick={() => onEdit?.(contact)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox needs data set for the drag to start at all.
        e.dataTransfer.setData("text/plain", contact.id);
        onDragStart(contact.id);
      }}
      onDragEnd={onDragEnd}
      className={`group relative bg-white border border-line rounded-xl p-4 cursor-pointer active:cursor-grabbing transition-all ${
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
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            aria-label="Move lead to another stage"
            className="text-stone-300 hover:text-stone-600"
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-6 z-20 w-44 bg-white border border-line rounded-xl shadow-lg py-1">
                <div className="text-[10px] uppercase tracking-wide text-stone-400 px-3 py-1.5">Move to</div>
                {STAGES.filter((s) => s !== contact.stage).map((s) => (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); onUpdateStage(contact.id, s); setMenuOpen(false); }}
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
        {/* Shown in the currency it was quoted in, not the dashboard's
            display currency — "₹4,00,000" is the number that was actually
            agreed, and converting it for display makes it unrecognisable
            on the call where you have to say it out loud. Falls back to the
            USD snapshot for leads saved before the split existed. */}
        {(Number(contact.nativeDealValue ?? contact.dealValue) || 0) > 0 && (
          <span className="text-sm font-semibold text-stone-800 tnum">
            {contact.nativeDealValue != null
              ? moneyIn(contact.nativeDealValue, contact.dealCurrency || "USD")
              : money(contact.dealValue)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Board ----------
export default function CrmBoard({ contacts, onAddContact, onUpdateStage, onUpdateContact, onDeleteContact, showExtensionHint = true }) {
  const { money, rate } = useCurrency();
  const [form, setForm] = useState({ name: "", company: "", title: "", source: "manual", dealValue: "", dealCurrency: "INR", phone: "", email: "" });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
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
            <input placeholder="Deal value" type="number" value={form.dealValue} onChange={(e) => setForm({ ...form, dealValue: e.target.value })} className={`${inputCls} w-28`} />
            <select value={form.dealCurrency} onChange={(e) => setForm({ ...form, dealCurrency: e.target.value })} className={`${inputCls} w-20`}>
              {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <PrimaryButton
              icon={Plus}
              onClick={() => {
                if (!form.name) return;
                onAddContact({ ...form, stage: "lead", ...dealFields(form.dealValue, form.dealCurrency, rate), addedDate: today() });
                setForm({ name: "", company: "", title: "", source: "manual", dealValue: "", dealCurrency: "INR", phone: "", email: "" });
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
          width. Removed no-scrollbar so the scrollbar is visible — otherwise
          the "Lost" column is invisible with no hint that it exists. */}
      <div className="overflow-x-auto -mx-4 px-4 md:-mx-8 md:px-8 pb-3">
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
                      onEdit={onUpdateContact ? setEditingContact : undefined}
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
        Drag a card between columns to change its stage — or use the ⋮ menu on touch devices. Click a card to edit its details.
      </div>

      {editingContact && (
        <EditLeadModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          onUpdateContact={onUpdateContact}
          onDeleteContact={onDeleteContact}
        />
      )}
    </div>
  );
}
