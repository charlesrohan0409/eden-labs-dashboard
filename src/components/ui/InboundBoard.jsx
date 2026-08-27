import { useRef, useState } from "react";
import {
  MoreVertical, Trash2, Plus, ExternalLink, ArrowRightLeft, MessageSquare,
} from "lucide-react";
import Avatar from "./Avatar";
import Badge from "./Badge";
import {
  INBOUND_STAGES, INBOUND_STAGE_META, normalizeInboundStage,
  INBOUND_CHANNEL_LIST, channelMeta, waitLabel,
} from "../../lib/inbound";
import { today } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Inbound enquiries board. Same drag mechanics as CrmBoard (native HTML5,
 * whole-column drop targets, an enterCount ref so the highlight doesn't
 * flicker as the pointer crosses a card, ⋮ menu as the touch path) — reusing
 * a pattern that already works rather than inventing a second one.
 *
 * The one thing this board does that the CRM board doesn't: an explicit
 * "replied" tick, sitting outside the stage entirely. See lib/inbound.js.
 */
export default function InboundBoard({
  inbound = [], clients = [], onUpdateStage, onToggleReplied, onDelete, onConvert, onAdd,
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [adding, setAdding] = useState(false);
  const enterCount = useRef({});

  const handleDrop = (e, stage) => {
    e.preventDefault();
    enterCount.current[stage] = 0;
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    const entry = inbound.find((x) => x.id === id);
    setDraggingId(null);
    if (entry && normalizeInboundStage(entry.stage) !== stage) onUpdateStage(id, stage);
  };

  const waiting = inbound.filter((e) => !e.replied && normalizeInboundStage(e.stage) !== "closed").length;

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-xs text-stone-400">
          {waiting > 0
            ? <><span className="font-semibold text-rose-600">{waiting}</span> waiting on a reply from you</>
            : "Everyone's been replied to"}
        </div>
        <button
          onClick={() => setAdding(true)}
          className={`flex items-center gap-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200
            rounded-lg px-2.5 py-1.5 transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-100`}
        >
          <Plus size={13} /> Log an enquiry
        </button>
      </div>

      {adding && (
        <InboundForm
          clients={clients}
          onCancel={() => setAdding(false)}
          onSave={(entry) => { onAdd?.(entry); setAdding(false); }}
        />
      )}

      <div className="overflow-x-auto -mx-4 px-4 md:-mx-5 md:px-5 pb-3">
        <div className="flex gap-3 min-w-max">
          {INBOUND_STAGES.map((stage) => {
            const meta = INBOUND_STAGE_META[stage];
            const inStage = inbound.filter((e) => normalizeInboundStage(e.stage) === stage);
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
                className={`w-[286px] shrink-0 rounded-2xl transition-colors duration-150 ${EASE} ${
                  isOver ? `${meta.drop} ring-2 ${meta.ring}` : "bg-stone-100/60"
                }`}
              >
                <div className={`px-3 py-2.5 rounded-t-2xl ${meta.head}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    <span className="text-[12px] font-semibold text-stone-800">{meta.label}</span>
                    <span className="text-[11px] text-stone-400 ml-auto tabular-nums">{inStage.length}</span>
                  </div>
                  <div className="text-[10.5px] text-stone-400 mt-0.5">{meta.hint}</div>
                </div>

                <div className="p-2 space-y-2 min-h-[120px]">
                  {inStage.map((entry, i) => (
                    <EnquiryCard
                      key={entry.id}
                      entry={entry}
                      client={clients.find((c) => c.id === entry.clientId)}
                      index={i}
                      dragging={draggingId === entry.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", entry.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(entry.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onToggleReplied={() => onToggleReplied?.(entry.id)}
                      onMove={onUpdateStage}
                      onDelete={() => onDelete?.(entry.id)}
                      onConvert={() => onConvert?.(entry.id)}
                    />
                  ))}
                  {inStage.length === 0 && (
                    <div className={`rounded-xl border border-dashed py-7 text-center text-[11px] transition-colors ${
                      isOver ? "border-stone-400 text-stone-600" : "border-stone-300 text-stone-400"
                    }`}>
                      {isOver ? "Drop here" : "Nothing here"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function EnquiryCard({ entry, client, index, dragging, onDragStart, onDragEnd, onToggleReplied, onMove, onDelete, onConvert }) {
  const [menu, setMenu] = useState(false);
  const chan = channelMeta(entry.channel);
  const wait = waitLabel(entry.receivedAt);
  const needsReply = !entry.replied && normalizeInboundStage(entry.stage) !== "closed";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={`group relative bg-white rounded-xl border p-2.5 cursor-grab active:cursor-grabbing
        motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
        transition-all duration-200 ${EASE}
        ${dragging ? "opacity-40" : ""}
        ${needsReply ? "border-rose-200" : "border-line hover:border-stone-300"}`}
    >
      <div className="flex items-start gap-2.5">
        {/* The tick lives on the card face, not behind a menu: marking
            something replied is the single most frequent action here and
            burying it would defeat the point of tracking it at all. */}
        <input
          type="checkbox"
          checked={!!entry.replied}
          onChange={onToggleReplied}
          onClick={(e) => e.stopPropagation()}
          aria-label="Replied"
          title={entry.replied ? "Replied" : "Mark as replied"}
          className={`mt-0.5 w-4 h-4 shrink-0 rounded-[5px] border-stone-300 text-emerald-600
            focus:ring-emerald-600/30 cursor-pointer transition-transform duration-150 ${EASE} active:scale-90`}
        />

        <Avatar name={entry.name || "?"} photoUrl={entry.photoUrl} size={26} />

        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-medium truncate ${entry.replied ? "text-stone-400" : "text-stone-800"}`}>
            {entry.name || "Unnamed"}
          </div>
          {entry.headline && (
            <div className="text-[11px] text-stone-400 truncate">{entry.headline}</div>
          )}
        </div>

        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="Enquiry actions"
          className="shrink-0 p-1 rounded-md text-stone-300 hover:text-stone-700 hover:bg-stone-100 transition-colors"
        >
          <MoreVertical size={13} />
        </button>
      </div>

      {entry.message && (
        <div className="mt-2 text-[11.5px] text-stone-600 line-clamp-2 whitespace-pre-wrap bg-stone-50 rounded-lg px-2 py-1.5">
          {entry.message}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${chan.chip}`}>{chan.label}</span>
        {/* Which inbox it landed in — an enquiry to a client's profile is
            their lead, not yours, and that distinction gets lost fast. */}
        {client && <span className="text-[10px] text-stone-400 truncate">via {client.name}</span>}
        {!client && <span className="text-[10px] text-stone-400">via you</span>}
        {needsReply && wait.text && <Badge tone={wait.tone}>{wait.text}</Badge>}
        {entry.replied && <Badge tone="emerald" dot>replied</Badge>}
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-9 z-20 bg-white border border-line rounded-xl shadow-lg py-1 w-44 motion-safe:animate-fade-up">
            <div className="px-3 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">Move to</div>
            {INBOUND_STAGES.map((s) => (
              <button
                key={s}
                onClick={() => { onMove(entry.id, s); setMenu(false); }}
                disabled={normalizeInboundStage(entry.stage) === s}
                className="w-full text-left px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-colors"
              >
                {INBOUND_STAGE_META[s].label}
              </button>
            ))}
            <div className="h-px bg-line my-1" />
            {entry.profileUrl && (
              <a
                href={entry.profileUrl} target="_blank" rel="noopener noreferrer"
                onClick={() => setMenu(false)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <ExternalLink size={12} /> Open profile
              </a>
            )}
            <button
              onClick={() => { onConvert(); setMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <ArrowRightLeft size={12} /> Move to CRM as lead
            </button>
            <button
              onClick={() => { onDelete(); setMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InboundForm({ clients, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: "", headline: "", profileUrl: "", message: "",
    channel: "linkedin", clientId: "", receivedAt: today(),
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";

  return (
    <div className="mb-4 p-3 rounded-xl border border-line bg-stone-50/60 motion-safe:animate-fade-up">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div>
          <label className={label}>Name</label>
          <input className={input} value={form.name} onChange={set("name")} placeholder="Who messaged" autoFocus />
        </div>
        <div>
          <label className={label}>Headline</label>
          <input className={input} value={form.headline} onChange={set("headline")} placeholder="Their title" />
        </div>
        <div>
          <label className={label}>Channel</label>
          <select className={input} value={form.channel} onChange={set("channel")}>
            {INBOUND_CHANNEL_LIST.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Came in via</label>
          <select className={input} value={form.clientId} onChange={set("clientId")}>
            <option value="">My profile</option>
            {clients.filter((c) => !c.hidden).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={label}>What they said</label>
          <input className={input} value={form.message} onChange={set("message")} placeholder="Paste the message" />
        </div>
        <div>
          <label className={label}>Received</label>
          <input className={input} type="date" value={form.receivedAt} onChange={set("receivedAt")} />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <label className={label}>Profile URL</label>
          <input className={input} value={form.profileUrl} onChange={set("profileUrl")} placeholder="linkedin.com/in/…" />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onSave({ ...form, clientId: form.clientId || null })}
          disabled={!form.name.trim()}
          className={`text-xs font-medium bg-emerald-800 text-white rounded-lg px-3 py-1.5
            transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-emerald-900 disabled:opacity-40`}
        >
          Log enquiry
        </button>
        <button onClick={onCancel} className="text-xs text-stone-500 px-3 py-1.5 hover:text-stone-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
