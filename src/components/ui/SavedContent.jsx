import { useState } from "react";
import { Plus, Trash2, ExternalLink, X, Bookmark, Search } from "lucide-react";
import Card from "./Card";
import Avatar from "./Avatar";
import PrimaryButton from "./PrimaryButton";
import { today } from "../../lib/utils";

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
export default function SavedContent({ items, onAdd, onDelete }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const filtered = (items || []).filter((s) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      (s.author || "").toLowerCase().includes(q) ||
      (s.text || "").toLowerCase().includes(q) ||
      (s.note || "").toLowerCase().includes(q);
    const matchesTag = tagFilter === "all" || (s.tag || "hook") === tagFilter;
    return matchesSearch && matchesTag;
  });

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

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((s) => {
          const tag = tagMeta(s.tag);
          const expanded = expandedId === s.id;
          // Pre-upgrade entries stored only a one-line note and no post body.
          const body = s.text || s.note;
          const isLong = (body || "").length > 260;
          return (
            <div key={s.id} className="group relative bg-white border border-line rounded-xl p-3.5 flex flex-col hover:border-stone-300 transition-colors">
              <div className="flex items-center gap-2 mb-2.5">
                <Avatar name={s.author || "Unknown"} photoUrl={s.authorPhoto} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-800 truncate">{s.author || "Unknown"}</div>
                  {s.savedAt && <div className="text-[10px] text-stone-400">Saved {s.savedAt}</div>}
                </div>
                <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ring-1 shrink-0 ${tag.chip}`}>
                  {tag.label}
                </span>
              </div>

              <div className={`text-[13px] text-stone-700 whitespace-pre-wrap leading-relaxed flex-1 ${expanded ? "" : "line-clamp-6"}`}>
                {body || <span className="text-stone-300">No text saved</span>}
              </div>

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
                <button
                  onClick={() => onDelete(s.id)}
                  aria-label="Delete saved post"
                  className={`ml-auto text-stone-300 hover:text-rose-500 p-1 transition-colors active:scale-[0.9] ${EASE} opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}
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
