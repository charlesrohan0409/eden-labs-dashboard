import { useRef, useState } from "react";
import {
  Type, Image as ImageIcon, LayoutGrid, Film, BarChart3, FileText,
  MoreVertical, Clock, MessageSquare, ThumbsUp, Eye, Trash2, Plus, SlidersHorizontal,
} from "lucide-react";
import Avatar from "./Avatar";
import {
  stagesFor, STAGE_META, normalizeStatus, POST_TYPE_META,
  LINKEDIN_CHAR_LIMIT, hookOf, contentTypeLabel, topicsInUse,
} from "../../lib/content";
import { formatDateTime } from "../../lib/utils";

const TYPE_ICON = {
  text: Type, image: ImageIcon, carousel: LayoutGrid,
  document: FileText, video: Film, poll: BarChart3,
};

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

// A post card, built to read like LinkedIn rather than a generic kanban
// ticket: the hook (which is the only part anyone actually reads in-feed)
// gets the emphasis, with the media, length and schedule as supporting
// detail underneath.
function PostCard({ post, client, onOpen, onMove, onDelete, stages, onDragStart, onDragEnd, dragging }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = normalizeStatus(post.status);
  const type = post.media?.type || post.type || "text";
  const meta = POST_TYPE_META[type] || POST_TYPE_META.text;
  const Icon = TYPE_ICON[type] || Type;
  const hook = hookOf(post.content);
  const len = (post.content || "").length;
  const overLimit = len > LINKEDIN_CHAR_LIMIT;
  const thumb = type !== "video" && type !== "document" ? post.media?.items?.[0]?.url : null;
  const stats = post.stats;

  return (
    <div
      draggable
      onClick={() => onOpen?.(post)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox won't begin a drag unless data is set.
        e.dataTransfer.setData("text/plain", post.id);
        onDragStart(post.id);
      }}
      onDragEnd={onDragEnd}
      className={`group relative bg-white border border-line rounded-xl p-3 cursor-pointer active:cursor-grabbing transition-[opacity,transform,border-color,box-shadow] duration-150 ${EASE} ${
        dragging ? "opacity-40 scale-[0.98]" : "hover:border-stone-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {thumb ? (
          <img src={thumb} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 bg-stone-100" />
        ) : (
          <span className={`w-11 h-11 rounded-lg shrink-0 flex items-center justify-center ${meta.chip}`}>
            <Icon size={16} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {/* The hook, not the whole post — this is what decides whether
              anyone reads it, so it's what the card leads with. */}
          <div className="text-[13px] leading-snug text-stone-800 line-clamp-3">
            {hook || <span className="text-stone-300">Untitled — no copy yet</span>}
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${meta.chip}`}>{meta.label}</span>
            {len > 0 && (
              <span className={`text-[10px] tnum ${overLimit ? "text-rose-600 font-semibold" : "text-stone-400"}`}>
                {len.toLocaleString()}{overLimit ? ` / ${LINKEDIN_CHAR_LIMIT.toLocaleString()}` : ""}
              </span>
            )}
            {post.poll && <span className="text-[10px] text-amber-600">{post.poll.options?.length || 0} options</span>}
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          aria-label="Move post"
          className="absolute top-2 right-1.5 text-stone-300 hover:text-stone-600 p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical size={14} />
        </button>
      </div>

      {(post.scheduledAt || client || stats) && (
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-stone-100 flex-wrap">
          {client && (
            <span className="flex items-center gap-1 text-[10px] text-stone-500">
              <Avatar name={client.name} photoUrl={client.photoUrl} logoUrl={client.logoUrl} size={14} />
              {client.name.split(" ")[0]}
            </span>
          )}
          {post.scheduledAt && (
            <span className="flex items-center gap-1 text-[10px] text-stone-400">
              <Clock size={10} /> {formatDateTime(post.scheduledAt)}
            </span>
          )}
          {stats && (stats.likes || stats.comments) ? (
            <span className="flex items-center gap-2 text-[10px] text-stone-400 ml-auto">
              <span className="flex items-center gap-0.5"><ThumbsUp size={9} /> {stats.likes}</span>
              <span className="flex items-center gap-0.5"><MessageSquare size={9} /> {stats.comments}</span>
              {stats.views ? <span className="flex items-center gap-0.5"><Eye size={9} /> {stats.views.toLocaleString()}</span> : null}
            </span>
          ) : null}
        </div>
      )}

      {/* The touch path — HTML5 drag does nothing on a touchscreen, so
          every column stays reachable through this menu. */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div className="absolute right-2 top-7 z-20 bg-white border border-line rounded-xl shadow-lg py-1 min-w-[9rem]">
            {stages.filter((s) => s !== status).map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMove(post.id, s); }}
                className="w-full text-left px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50 flex items-center gap-2"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[s].dot}`} />
                {STAGE_META[s].label}
              </button>
            ))}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(post.id); }}
                className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 border-t border-stone-100 mt-1 pt-1.5"
              >
                <Trash2 size={11} /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The content pipeline board. Columns adapt to whose content it is: agency
 * content skips the client-approval step, client content includes it.
 *
 * Drag between columns to change status, or use the ⋮ menu on touch.
 */
export default function ContentBoard({
  posts, clients, clientId = null, onUpdateStatus, onOpen, onDelete, onAddIdea,
  onRequestSchedule, filters, onFiltersChange,
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [ideaText, setIdeaText] = useState("");
  const [addingIdea, setAddingIdea] = useState(false);
  // Drag events fire on children too; count enter/leave so the column
  // highlight doesn't flicker as the pointer crosses a card.
  const enterCount = useRef({});

  const stages = stagesFor(clientId);
  const clientOf = (id) => clients?.find((c) => c.id === id);

  const handleDrop = (e, stage) => {
    e.preventDefault();
    enterCount.current[stage] = 0;
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    const post = posts.find((p) => p.id === id);
    setDraggingId(null);
    if (!post || normalizeStatus(post.status) === stage) return;
    // "Scheduled" used to be just a label change, which meant the board could
    // claim a post was scheduled when nothing was queued anywhere. Moving
    // into that column now has to go through the schedule flow (pick a time,
    // push to Buffer) and only lands if that succeeds.
    if (stage === "scheduled" && onRequestSchedule) onRequestSchedule(post);
    else onUpdateStatus(id, stage);
  };

  const submitIdea = () => {
    const text = ideaText.trim();
    if (!text) return;
    onAddIdea?.(text);
    setIdeaText("");
    setAddingIdea(false);
  };

  // Filters live above the board rather than as chips on every card. The
  // board answers "what do I write next"; type/topic answer a different
  // question, and putting both on the card is how a clean board turns into
  // the Notion-lookalike this was explicitly meant not to be.
  const f = filters || {};
  const matchesFilters = (p) => {
    if (f.format && (p.type || "text") !== f.format) return false;
    if (f.contentType && p.contentType !== f.contentType) return false;
    if (f.topic && (p.topic || "").toLowerCase() !== f.topic.toLowerCase()) return false;
    return true;
  };
  const filtered = posts.filter(matchesFilters);
  const activeCount = [f.format, f.contentType, f.topic].filter(Boolean).length;

  return (
    <>
      {onFiltersChange && (
        <ContentFilters
          posts={posts}
          filters={f}
          onChange={onFiltersChange}
          activeCount={activeCount}
          showing={filtered.length}
          total={posts.length}
        />
      )}
    <div className="overflow-x-auto -mx-4 px-4 md:-mx-5 md:px-5 pb-3">
      <div className="flex gap-3 min-w-max">
        {stages.map((stage) => {
          const meta = STAGE_META[stage];
          const inStage = filtered.filter((p) => normalizeStatus(p.status) === stage);
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
              <div className={`px-3.5 py-2.5 rounded-t-2xl ${meta.head}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                  <span className="text-sm font-semibold text-stone-700">{meta.label}</span>
                  <span className="ml-auto text-[11px] text-stone-500 bg-white border border-line rounded-full px-2 py-0.5 tnum">
                    {inStage.length}
                  </span>
                </div>
                <div className="text-[10px] text-stone-500/80 mt-0.5">{meta.hint}</div>
              </div>

              <div className="space-y-2 p-2.5 min-h-[7rem]">
                {/* Ideas are the one column you capture INTO, so it gets an
                    inline composer — a half-formed thought shouldn't need
                    the full post editor to get written down. */}
                {stage === "idea" && onAddIdea && (
                  addingIdea ? (
                    <div className="bg-white border border-line rounded-xl p-2">
                      <textarea
                        autoFocus
                        rows={2}
                        value={ideaText}
                        onChange={(e) => setIdeaText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitIdea(); }
                          if (e.key === "Escape") { setAddingIdea(false); setIdeaText(""); }
                        }}
                        onBlur={submitIdea}
                        placeholder="What's the idea?"
                        className="w-full text-[13px] leading-snug resize-none focus:outline-none placeholder:text-stone-300"
                      />
                      <div className="text-[10px] text-stone-300">Enter to save · Esc to discard</div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingIdea(true)}
                      className={`w-full flex items-center justify-center gap-1.5 text-[11px] text-stone-400 hover:text-stone-700 border border-dashed border-stone-300 hover:border-stone-400 rounded-xl py-2 transition-colors active:scale-[0.98] ${EASE}`}
                    >
                      <Plus size={12} /> Capture an idea
                    </button>
                  )
                )}

                {inStage.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    client={p.clientId ? clientOf(p.clientId) : null}
                    stages={stages}
                    onOpen={onOpen}
                    onMove={(pid, stage) => {
                      const p = posts.find((x) => x.id === pid);
                      if (stage === "scheduled" && onRequestSchedule && p) onRequestSchedule(p);
                      else onUpdateStatus(pid, stage);
                    }}
                    onDelete={onDelete}
                    onDragStart={setDraggingId}
                    onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                    dragging={draggingId === p.id}
                  />
                ))}

                {inStage.length === 0 && !(stage === "idea" && onAddIdea) && (
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

/**
 * Filter bar. Deliberately the home for type/topic instead of the cards —
 * see the note in ContentBoard. Only offers values that actually exist in
 * the data, so it never presents a filter that returns nothing.
 */
function ContentFilters({ posts, filters, onChange, activeCount, showing, total }) {
  const usedFormats = [...new Set(posts.map((p) => p.type || "text"))];
  const usedTypes = [...new Set(posts.map((p) => p.contentType).filter(Boolean))];
  const topics = topicsInUse(posts);
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });
  const sel = "border border-line rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  if (!usedFormats.length) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <SlidersHorizontal size={13} className="text-stone-400 shrink-0" />
      <select className={sel} value={filters.format || ""} onChange={set("format")}>
        <option value="">All formats</option>
        {usedFormats.map((t) => (
          <option key={t} value={t}>{POST_TYPE_META[t]?.label || t}</option>
        ))}
      </select>
      {usedTypes.length > 0 && (
        <select className={sel} value={filters.contentType || ""} onChange={set("contentType")}>
          <option value="">All types</option>
          {usedTypes.map((t) => <option key={t} value={t}>{contentTypeLabel(t)}</option>)}
        </select>
      )}
      {topics.length > 0 && (
        <select className={sel} value={filters.topic || ""} onChange={set("topic")}>
          <option value="">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      {activeCount > 0 && (
        <>
          <span className="text-[11px] text-stone-400">{showing} of {total}</span>
          <button
            onClick={() => onChange({})}
            className={`text-[11px] text-stone-500 hover:text-stone-800 underline underline-offset-2
              transition-transform duration-150 ${EASE} active:scale-[0.97]`}
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
}
