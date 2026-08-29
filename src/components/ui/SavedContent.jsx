import { useState } from "react";
import { Plus, Trash2, ExternalLink, X, Bookmark, Search, FolderOpen, Heart, MessageCircle } from "lucide-react";
import Card from "./Card";
import Avatar from "./Avatar";
import PrimaryButton from "./PrimaryButton";
import { today } from "../../lib/utils";

const compact = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);

/**
 * Engagement as it was when the post was captured.
 *
 * This is the whole reason to save someone else's post rather than screenshot
 * it: a hook that pulled 400 reactions is worth studying and one that pulled
 * 4 is not, and nothing you write down afterwards can tell them apart. It
 * renders only when the numbers were actually READ off the post — a manual
 * paste has no engagement to report, and showing it "0 · 0" would read as a
 * flop rather than as unmeasured.
 */
function Engagement({ stats }) {
  if (!stats) return null;
  const reactions = Number(stats.reactions) || 0;
  const comments = Number(stats.comments) || 0;
  if (!reactions && !comments) return null;
  return (
    <div className="flex items-center gap-3 text-[11px] text-stone-500">
      <span className="inline-flex items-center gap-1">
        <Heart size={11} className="text-rose-400" />
        <span className="font-semibold text-stone-700 tabular-nums">{compact(reactions)}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <MessageCircle size={11} className="text-sky-400" />
        <span className="font-semibold text-stone-700 tabular-nums">{compact(comments)}</span>
      </span>
    </div>
  );
}

const TAGS = [
  { id: "hook", label: "Hook", chip: "bg-sky-50 text-sky-700 ring-sky-600/15" },
  { id: "structure", label: "Structure", chip: "bg-violet-50 text-violet-700 ring-violet-600/15" },
  { id: "cta", label: "CTA", chip: "bg-amber-50 text-amber-700 ring-amber-600/15" },
  { id: "story", label: "Story", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
];

const tagMeta = (id) => TAGS.find((t) => t.id === id) || TAGS[0];

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const BLANK = { author: "", authorUrl: "", url: "", text: "", note: "", tag: "hook" };

/**
 * Saved posts from other creators — the swipe library.
 *
 * Entries arrive two ways: captured from LinkedIn by the Chrome extension
 * (author, photo, full text and link in one click), or pasted in here for
 * anything found elsewhere. Older entries predate the richer shape and only
 * have an author and a one-line note; they still render, just sparsely.
 */
export default function SavedContent({
  items, folders, onAdd, onDelete,
  onAddFolder, onRenameFolder, onDeleteFolder, onMoveToFolder,
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  // null = every folder; "" = the uncategorised pile specifically. Two
  // different questions, so they can't share a sentinel.
  const [folderFilter, setFolderFilter] = useState(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");

  const filtered = (items || []).filter((s) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      (s.author || "").toLowerCase().includes(q) ||
      (s.text || "").toLowerCase().includes(q) ||
      (s.note || "").toLowerCase().includes(q);
    const matchesTag = tagFilter === "all" || (s.tag || "hook") === tagFilter;
    const matchesFolder =
      folderFilter === null || (s.folderId || "") === folderFilter;
    return matchesSearch && matchesTag && matchesFolder;
  });

  const countIn = (fid) => (items || []).filter((s) => (s.folderId || "") === fid).length;
  const uncategorised = countIn("");

  const createFolder = () => {
    const name = newFolder.trim();
    if (!name) return;
    onAddFolder?.({ name });
    setNewFolder("");
    setAddingFolder(false);
  };

  const submit = () => {
    if (!form.author.trim() && !form.text.trim()) return;
    onAdd({
      author: form.author.trim() || "Unknown",
      authorUrl: form.authorUrl.trim(),
      authorPhoto: "",
      url: form.url.trim(),
      text: form.text.trim(),
      note: form.note.trim(),
      tag: form.tag,
      savedAt: today(),
    });
    setForm(BLANK);
    setAdding(false);
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight flex items-center gap-2">
            <Bookmark size={15} className="text-amber-600" /> Saved content
          </div>
          <div className="text-xs text-stone-400 mt-0.5">
            Posts worth stealing from — save them here or straight from LinkedIn with the extension
          </div>
        </div>
        <PrimaryButton
          size="sm"
          variant={adding ? "ghost" : "primary"}
          icon={adding ? X : Plus}
          onClick={() => setAdding(!adding)}
        >
          {adding ? "Cancel" : "Save a post"}
        </PrimaryButton>
      </div>

      {adding && (
        <div className="rounded-xl bg-stone-50 border border-line p-3 mb-4 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <input
              autoFocus
              placeholder="Who wrote it?"
              value={form.author}
              onChange={(e) => setForm({ ...form, author: e.target.value })}
              className={`${inputCls} flex-1 min-w-[10rem]`}
            />
            <select
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              className={`${inputCls} w-36`}
            >
              {TAGS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <textarea
            placeholder="Paste the post…"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            rows={5}
            className={`${inputCls} resize-y leading-relaxed`}
          />
          <input
            placeholder="Link to the post (optional)"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder="Why you saved it — the bit worth reusing (optional)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className={inputCls}
          />
          <PrimaryButton onClick={submit} disabled={!form.author.trim() && !form.text.trim()}>
            Save post
          </PrimaryButton>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[10rem] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
          <input
            placeholder="Search saved posts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-line rounded-full pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
        </div>
        {[{ id: "all", label: "All" }, ...TAGS].map((t) => {
          const active = tagFilter === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTagFilter(t.id)}
              className={`text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors active:scale-[0.97] ${EASE} ${
                active ? "bg-stone-800 border-stone-800 text-white" : "bg-white border-line text-stone-500 hover:border-stone-300"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Folders. A swipe file with no structure becomes a pile you stop
          opening, and grouping is what keeps it usable past a few dozen
          saves. Rendered as a row of counted chips rather than a dropdown so
          the shape of the library is visible without a click. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-4 border-b border-stone-100">
        <FolderOpen size={13} className="text-stone-300 shrink-0" />
        <button
          onClick={() => setFolderFilter(null)}
          className={`text-[11px] font-medium rounded-full px-2.5 py-1 border transition-[background-color,border-color,transform] duration-150 ${EASE} active:scale-[0.96] ${
            folderFilter === null
              ? "bg-stone-800 border-stone-800 text-white"
              : "bg-white border-line text-stone-500 hover:border-stone-300"
          }`}
        >
          All <span className="opacity-50 tabular-nums">{(items || []).length}</span>
        </button>

        {(folders || []).map((f) => {
          const active = folderFilter === f.id;
          if (renamingId === f.id) {
            return (
              <input
                key={f.id}
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onRenameFolder?.(f.id, { name: renameDraft.trim() || f.name }); setRenamingId(null); }
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => { onRenameFolder?.(f.id, { name: renameDraft.trim() || f.name }); setRenamingId(null); }}
                className="text-[11px] border border-emerald-500 rounded-full px-2.5 py-1 w-28 focus:outline-none"
              />
            );
          }
          return (
            <span key={f.id} className="group/f relative inline-flex">
              <button
                onClick={() => setFolderFilter(active ? null : f.id)}
                onDoubleClick={() => { setRenamingId(f.id); setRenameDraft(f.name); }}
                title="Double-click to rename"
                className={`text-[11px] font-medium rounded-full pl-2.5 pr-6 py-1 border transition-[background-color,border-color,transform] duration-150 ${EASE} active:scale-[0.96] ${
                  active
                    ? "bg-stone-800 border-stone-800 text-white"
                    : "bg-white border-line text-stone-500 hover:border-stone-300"
                }`}
              >
                {f.name} <span className="opacity-50 tabular-nums">{countIn(f.id)}</span>
              </button>
              <button
                onClick={() => onDeleteFolder?.(f.id)}
                aria-label={`Delete ${f.name}`}
                title="Delete folder — the posts inside are kept"
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/f:opacity-100
                  transition-opacity ${active ? "text-white/60 hover:text-white" : "text-stone-300 hover:text-rose-500"}`}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}

        {uncategorised > 0 && (
          <button
            onClick={() => setFolderFilter(folderFilter === "" ? null : "")}
            className={`text-[11px] font-medium rounded-full px-2.5 py-1 border transition-[background-color,border-color,transform] duration-150 ${EASE} active:scale-[0.96] ${
              folderFilter === ""
                ? "bg-stone-800 border-stone-800 text-white"
                : "bg-white border-dashed border-stone-300 text-stone-400 hover:border-stone-400"
            }`}
          >
            Unsorted <span className="opacity-50 tabular-nums">{uncategorised}</span>
          </button>
        )}

        {addingFolder ? (
          <input
            autoFocus
            placeholder="Folder name"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); createFolder(); }
              if (e.key === "Escape") { setAddingFolder(false); setNewFolder(""); }
            }}
            onBlur={createFolder}
            className="text-[11px] border border-emerald-500 rounded-full px-2.5 py-1 w-28 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setAddingFolder(true)}
            className={`text-[11px] font-medium rounded-full px-2 py-1 border border-dashed border-stone-300
              text-stone-400 hover:text-stone-700 hover:border-stone-400
              transition-[color,border-color,transform] duration-150 ${EASE} active:scale-[0.96]`}
          >
            <Plus size={11} />
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((s) => {
          const tag = tagMeta(s.tag);
          const expanded = expandedId === s.id;
          // Pre-upgrade entries stored only a one-line note and no post body.
          const body = s.text || s.note;
          const isLong = (body || "").length > 260;
          return (
            <div key={s.id} className="group relative bg-white border border-line rounded-xl p-3.5 flex flex-col hover:border-stone-300 transition-colors">
              {/* Author block reads like the post's own header — avatar,
                  name, then the headline underneath, which is the line that
                  tells you WHY this person's hook worked. */}
              <div className="flex items-start gap-2 mb-2.5">
                <Avatar name={s.author || "Unknown"} photoUrl={s.authorPhoto} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-800 truncate">{s.author || "Unknown"}</div>
                  {s.headline && (
                    <div className="text-[10.5px] text-stone-400 truncate leading-snug">{s.headline}</div>
                  )}
                  {s.savedAt && (
                    <div className="text-[10px] text-stone-300 mt-0.5">Saved {String(s.savedAt).slice(0, 10)}</div>
                  )}
                </div>
                <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ring-1 shrink-0 ${tag.chip}`}>
                  {tag.label}
                </span>
              </div>

              <div className={`text-[13px] text-stone-700 whitespace-pre-wrap leading-relaxed ${expanded ? "" : "line-clamp-6"}`}>
                {body || <span className="text-stone-300">No text saved</span>}
              </div>

              {/* The post's own images, copied into our Storage at save time
                  rather than hotlinked — LinkedIn's CDN URLs are signed and
                  expire. A single image runs full width; several tile, since
                  a carousel's shape is part of what's being studied. */}
              {Array.isArray(s.images) && s.images.length > 0 && (
                <div className={`mt-2.5 grid gap-1 ${s.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {s.images.map((src, idx) => (
                    <a
                      key={src}
                      href={src}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={`block overflow-hidden rounded-lg border border-line bg-stone-50
                        ${s.images.length === 3 && idx === 0 ? "col-span-2" : ""}`}
                    >
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className={`w-full object-cover ${s.images.length === 1 ? "max-h-56" : "h-24"}`}
                      />
                    </a>
                  ))}
                </div>
              )}

              {isLong && (
                <button
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                  className="text-[11px] text-stone-400 hover:text-stone-700 mt-1.5 text-left transition-colors"
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}

              {/* Only shown when there's also a post body, otherwise the note
                  IS the body above and repeating it reads as a bug. */}
              {s.note && s.text && (
                <div className="text-[11px] text-stone-500 mt-2 pt-2 border-t border-stone-100 italic">
                  {s.note}
                </div>
              )}

              {/* Engagement sits on its own row directly under the post,
                  exactly where LinkedIn puts it — the same reading order,
                  so the number attaches to the post it belongs to rather
                  than floating in the card's furniture. mt-auto pins this
                  whole footer block to the bottom so cards in a row line
                  their actions up regardless of how long the text is. */}
              <div className="mt-auto">
                {s.stats && (
                  <div className="pt-2.5 mt-2.5 border-t border-stone-100">
                    <Engagement stats={s.stats} />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2.5">
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[11px] text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1 transition-colors"
                  >
                    <ExternalLink size={11} /> Open on LinkedIn
                  </a>
                )}
                {/* Filing happens after the fact more often than at save
                    time — you save a post fast and sort it later — so the
                    mover lives on the card, not just in the save form. */}
                {(folders || []).length > 0 && (
                  <select
                    value={s.folderId || ""}
                    onChange={(e) => onMoveToFolder?.(s.id, e.target.value || null)}
                    onClick={(e) => e.stopPropagation()}
                    title="Move to folder"
                    className="ml-auto text-[10.5px] text-stone-400 bg-transparent border border-line rounded-full px-1.5 py-0.5 max-w-[7.5rem] focus:outline-none focus:ring-1 focus:ring-emerald-700/20 hover:border-stone-300 transition-colors"
                  >
                    <option value="">Unsorted</option>
                    {(folders || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                )}
                <button
                  onClick={() => onDelete(s.id)}
                  aria-label="Delete saved post"
                  className={`${(folders || []).length > 0 ? "" : "ml-auto "}text-stone-300 hover:text-rose-500 p-1 transition-colors active:scale-[0.9] ${EASE} opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-xs text-stone-400 py-10 text-center">
          {search || tagFilter !== "all"
            ? "Nothing matches that."
            : "Nothing saved yet. When you spot a post worth learning from, save it here."}
        </div>
      )}
    </Card>
  );
}
