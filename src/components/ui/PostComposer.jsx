import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Send, Image as ImageIcon, Film, LayoutGrid, BarChart3,
  Type, X, Plus, Clock, UserCheck, Save, Loader2, Radio, Pencil, Trash2, FileText,
} from "lucide-react";
import Badge from "./Badge";
import PrimaryButton from "./PrimaryButton";
import PostPreview from "./PostPreview";
import { toUnicodeBold, toUnicodeItalic, nowLocalISO, formatDateTime } from "../../lib/utils";
import { fileToImage, fileToVideo, fileToDocument } from "../../lib/media";
import { createBufferPost } from "../../lib/buffer";
import { normalizeStatus, STAGE_META, POST_TYPE_META, hookOf, CONTENT_TYPES, topicsInUse } from "../../lib/content";

// Icon per post type, reusing the same vocabulary POST_TYPES below is built
// from — "document" (PDF carousels) has no entry there since it's not a
// composer choice, so it gets its own fallback.
const TYPE_ICON = { text: Type, image: ImageIcon, carousel: LayoutGrid, document: FileText, video: Film, poll: BarChart3 };

const POST_TYPES = [
  { value: "text", label: "Text", icon: Type },
  { value: "image", label: "Photo", icon: ImageIcon },
  { value: "carousel", label: "Carousel", icon: LayoutGrid },
  { value: "video", label: "Video", icon: Film },
  { value: "poll", label: "Poll", icon: BarChart3 },
];

const EMPTY_POLL = { question: "", options: [{ text: "", votes: 0 }, { text: "", votes: 0 }], durationDays: 7 };

/**
 * Writes a LinkedIn post: body text, media, scheduling, and the three ways a
 * post can leave the composer — saved as a draft, sent to the client for
 * approval, or scheduled straight to Buffer.
 *
 * `onPushForApproval` is optional; the client portal doesn't need it, since a
 * client approving their own post makes no sense.
 */
export default function PostComposer({
  clientId, posts, onAddPost, onUpdatePost, onDeletePost, onPushForApproval,
  author = "Eden Labs", headline = "LinkedIn content & client acquisition", avatarUrl = "",
  bufferConnected = false, bufferChannels = [], bufferChannelId = null, onSetBufferChannel = null,
  token,
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState("text");
  const [media, setMedia] = useState(null);
  const [poll, setPoll] = useState(EMPTY_POLL);
  const [contentType, setContentType] = useState("");
  const [topic, setTopic] = useState("");
  const [scheduledAt, setScheduledAt] = useState(nowLocalISO(60));
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  // Grows with the text instead of staying pinned at a small fixed height —
  // LinkedIn's own composer does this, and a cramped fixed box was exactly
  // the complaint: no room to actually write a full post before scrolling
  // inside a tiny window. Runs on every text change, including the
  // programmatic ones from loadForEditing/reset, not just typing.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 560)}px`;
  }, [text]);

  const knownTopics = topicsInUse(posts);
  const selectedChannel = bufferChannels.find((c) => c.id === bufferChannelId);
  const editingPost = editingId ? posts.find((p) => p.id === editingId) : null;
  // Once a post is actually live in Buffer, re-saving here must never fire a
  // second createPost — that would duplicate it on LinkedIn. Editing text
  // still updates our own record; it just can't touch what's already queued.
  const alreadyOnBuffer = !!editingPost?.bufferPostId;
  // Buffer accepts media by URL rather than upload, and this app already
  // stores media as public Supabase Storage URLs, so images/carousels/PDFs
  // publish directly now. Polls are the one exception — Buffer has no
  // equivalent, so they stay local-only.
  const canPublishToBuffer = bufferConnected && !!bufferChannelId && type !== "poll" && !alreadyOnBuffer;

  const loadForEditing = (p) => {
    setEditingId(p.id);
    setText(p.content || "");
    setType(p.type || "text");
    setMedia(p.media || null);
    setPoll(p.poll || EMPTY_POLL);
    setContentType(p.contentType || "");
    setTopic(p.topic || "");
    setScheduledAt(p.scheduledAt || nowLocalISO(60));
    setError("");
    setStatus("");
  };

  // LinkedIn has no rich text, so formatting swaps characters for their
  // unicode bold/italic equivalents.
  const applyFormat = (fmt) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (start === end) return;
    const transformed = fmt === "bold"
      ? toUnicodeBold(text.slice(start, end))
      : toUnicodeItalic(text.slice(start, end));
    setText(text.slice(0, start) + transformed + text.slice(end));
  };

  // Carousel accepts a PDF as well as images — LinkedIn's own carousel IS a
  // document post, and exporting every page to PNG first was busywork.
  const acceptFor = { image: "image/*", carousel: "image/*,application/pdf", video: "video/*" }[type];
  const multiple = type === "carousel";

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    setError("");
    setBusy(true);
    try {
      if (type === "video") {
        const v = await fileToVideo(files[0], token);
        setMedia({ type: "video", items: [v] });
      } else if (type === "carousel" && files[0]?.type === "application/pdf") {
        // A PDF is the whole carousel, not one slide among many — it
        // replaces rather than appends, and stores as media.type
        // "document" so PostPreview renders it in a viewer instead of
        // trying to draw it as an <img>. fileToImage would reject it
        // outright ("that file isn't an image"), which is what used to
        // make this feel broken.
        const doc = await fileToDocument(files[0], token);
        setMedia({ type: "document", items: [{ ...doc, mime: files[0].type }] });
      } else {
        const imgs = await Promise.all(files.map((f) => fileToImage(f, token)));
        setMedia((prev) => {
          // Switching from a PDF back to images starts fresh rather than
          // mixing a document item into an image carousel.
          const existing = prev && prev.type === type ? prev.items : [];
          const items = type === "carousel" ? [...existing, ...imgs].slice(0, 20) : [...existing, ...imgs].slice(0, 9);
          return { type, items };
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeMediaItem = (i) =>
    setMedia((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((_, idx) => idx !== i);
      return items.length ? { ...prev, items } : null;
    });

  const switchType = (next) => {
    setType(next);
    setError("");
    // Media and polls are mutually exclusive on LinkedIn, so clear on switch.
    if (next === "poll" || next === "text") setMedia(null);
    else if (
      media && media.type !== next &&
      // Both an image set and a PDF are valid carousel payloads, so neither
      // should be discarded just because Carousel got re-selected.
      !(next === "carousel" && (media.type === "image" || media.type === "document"))
    ) setMedia(null);
  };

  const pollReady = poll.question.trim() && poll.options.filter((o) => o.text.trim()).length >= 2;
  const hasBody = text.trim() || media || (type === "poll" && pollReady);

  const buildPost = (postStatus) => ({
    clientId,
    content: text,
    status: postStatus,
    type,
    media: type === "poll" ? null : media,
    poll: type === "poll" && pollReady ? poll : null,
    // The ANGLE and SUBJECT, as opposed to `type` above which is the format.
    // Both are what the analytics board groups by — a post saved without them
    // simply won't appear in those breakdowns rather than being guessed at.
    contentType,
    topic: topic.trim(),
    scheduledAt: postStatus === "scheduled" ? scheduledAt : null,
    date: (postStatus === "scheduled" ? scheduledAt : new Date().toISOString()).slice(0, 10),
  });

  const reset = () => {
    setText("");
    setMedia(null);
    setPoll(EMPTY_POLL);
    setType("text");
    setContentType("");
    setTopic("");
    setEditingId(null);
  };

  const submit = async (postStatus) => {
    if (!hasBody) {
      setError("Add some text or media first.");
      return;
    }
    if (postStatus === "scheduled" && !scheduledAt) {
      setError("Pick a date and time to schedule.");
      return;
    }
    setError("");
    const post = buildPost(postStatus);
    let successMessage = {
      draft: "Saved as a draft.",
      pending_review: "Sent to the client for approval.",
      scheduled: `Scheduled for ${formatDateTime(scheduledAt)}. Connect Buffer on Integrations, then pick a channel below, to publish automatically.`,
    }[postStatus];

    if (postStatus === "scheduled" && canPublishToBuffer) {
      setPublishing(true);
      try {
        const bufferPost = await createBufferPost({ text, channelId: bufferChannelId, scheduledAt, media: type === "poll" ? null : media });
        post.bufferPostId = bufferPost.id;
        successMessage = `Scheduled for ${formatDateTime(scheduledAt)} on ${selectedChannel?.name || "Buffer"} — live in your Buffer queue.`;
      } catch (e) {
        setPublishing(false);
        setError(`Buffer rejected this post: ${e.message}`);
        return; // Don't save locally as "scheduled" if Buffer actually refused it.
      }
      setPublishing(false);
    } else if (postStatus === "scheduled" && alreadyOnBuffer) {
      post.bufferPostId = editingPost.bufferPostId;
      successMessage = "Updated here — this post is already live in Buffer, so its schedule there wasn't touched.";
    } else if (postStatus === "scheduled" && bufferConnected && type === "text" && !bufferChannelId) {
      successMessage = `Scheduled for ${formatDateTime(scheduledAt)}. Pick a channel below to also queue it in Buffer.`;
    } else if (postStatus === "scheduled" && bufferConnected && type !== "text") {
      successMessage = `Scheduled for ${formatDateTime(scheduledAt)}. Media and polls stay local until file storage is connected — Buffer needs a public URL for the image.`;
    }

    if (editingId && onUpdatePost) {
      onUpdatePost(editingId, post);
      successMessage = editingId && postStatus === "draft" ? "Draft updated." : successMessage;
    } else if (postStatus === "pending_review" && onPushForApproval) {
      onPushForApproval(post);
    } else {
      onAddPost(post);
    }

    setStatus(successMessage);
    reset();
    setTimeout(() => setStatus(""), 7000);
  };

  const scoped = posts.filter((p) => p.clientId === clientId);
  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* ── Composer ── */}
      <div className="min-w-0">
        {editingId && (
          <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-3 text-xs text-sky-800">
            <Pencil size={13} className="shrink-0" />
            <span className="flex-1">Editing a saved post — saving will update it, not create a new one.</span>
            <button onClick={reset} className="text-sky-600 hover:text-sky-900 font-medium shrink-0">Cancel</button>
          </div>
        )}

        {/* Post type */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {POST_TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.value;
            return (
              <button
                key={t.value}
                onClick={() => switchType(t.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-emerald-50 border-emerald-600 text-emerald-800"
                    : "bg-white border-line text-stone-500 hover:border-stone-300"
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Formatting */}
        <div className="flex items-center gap-1 mb-2.5">
          <button onClick={() => applyFormat("bold")} className="p-1.5 rounded-lg hover:bg-stone-100 border border-line" title="Bold selection">
            <Bold size={13} />
          </button>
          <button onClick={() => applyFormat("italic")} className="p-1.5 rounded-lg hover:bg-stone-100 border border-line" title="Italicize selection">
            <Italic size={13} />
          </button>
          <span className="text-[11px] text-stone-400 ml-1.5">select text, then format</span>
        </div>

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you want to talk about?"
          className="w-full min-h-[260px] border border-line rounded-xl p-4 text-[15px] leading-relaxed text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 resize-none"
        />
        <div className="flex justify-between text-[11px] text-stone-400 mt-1">
          <span className="tnum">{text.length} characters</span>
          <span className={text.length > 3000 ? "text-rose-600" : ""}>LinkedIn limit 3,000</span>
        </div>

        {/* Media uploader */}
        {["image", "carousel", "video"].includes(type) && (
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept={acceptFor}
              multiple={multiple}
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full border border-dashed border-stone-300 rounded-xl py-6 text-center hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors disabled:opacity-60"
            >
              {busy ? (
                <Loader2 size={18} className="mx-auto text-stone-400 animate-spin" />
              ) : (
                <>
                  <Plus size={18} className="mx-auto text-stone-400" />
                  <div className="text-xs text-stone-500 mt-1.5">
                    {type === "video" ? "Upload a video" : type === "carousel" ? "Add a PDF or carousel slides" : "Add photos"}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    {type === "carousel" ? "Drop a PDF, or up to 20 images" : type === "video" ? "MP4 up to 8MB" : "Up to 9 images"}
                  </div>
                </>
              )}
            </button>

            {media && (
              <div className="flex gap-2 flex-wrap mt-2.5">
                {media.items.map((it, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-line bg-stone-50">
                    {media.type === "video" ? (
                      <div className="w-full h-full flex items-center justify-center"><Film size={16} className="text-stone-400" /></div>
                    ) : media.type === "document" ? (
                      // A PDF has no image to show — an <img> here just
                      // renders broken.
                      <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1">
                        <FileText size={15} className="text-stone-400" />
                        <span className="text-[8px] text-stone-400 truncate w-full text-center">{it.name || "PDF"}</span>
                      </div>
                    ) : (
                      <img src={it.url} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={() => removeMediaItem(i)}
                      aria-label="Remove"
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-night/80 text-white flex items-center justify-center"
                    >
                      <X size={10} />
                    </button>
                    {media.type === "carousel" && (
                      <span className="absolute bottom-0.5 left-0.5 bg-night/70 text-white text-[9px] px-1 rounded tnum">{i + 1}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Poll builder */}
        {type === "poll" && (
          <div className="mt-3 border border-line rounded-xl p-3.5 space-y-2.5">
            <input
              placeholder="Ask a question..."
              value={poll.question}
              onChange={(e) => setPoll({ ...poll, question: e.target.value })}
              className={`${inputCls} w-full`}
            />
            {poll.options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder={`Option ${i + 1}`}
                  value={o.text}
                  onChange={(e) => {
                    const options = [...poll.options];
                    options[i] = { ...options[i], text: e.target.value };
                    setPoll({ ...poll, options });
                  }}
                  className={`${inputCls} flex-1`}
                />
                {poll.options.length > 2 && (
                  <button
                    onClick={() => setPoll({ ...poll, options: poll.options.filter((_, idx) => idx !== i) })}
                    className="text-stone-400 hover:text-rose-500 px-1"
                    aria-label="Remove option"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 flex-wrap">
              {poll.options.length < 4 && (
                <PrimaryButton
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  onClick={() => setPoll({ ...poll, options: [...poll.options, { text: "", votes: 0 }] })}
                >
                  Add option
                </PrimaryButton>
              )}
              <select
                value={poll.durationDays}
                onChange={(e) => setPoll({ ...poll, durationDays: Number(e.target.value) })}
                className={`${inputCls} w-32`}
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={7}>1 week</option>
                <option value={14}>2 weeks</option>
              </select>
            </div>
          </div>
        )}

        {/* Angle + topic. Separate from the format buttons above on purpose:
            format is what the post LOOKS like, these are what it IS. Only
            these two feed the analytics breakdowns, which is why they're
            worth one dropdown each at write time rather than being
            backfilled (or guessed) later. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
              Type
            </label>
            <select value={contentType} onChange={(e) => setContentType(e.target.value)} className={`${inputCls} w-full`}>
              <option value="">Not set</option>
              {CONTENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
              Topic
            </label>
            <input
              list="eden-topics"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. pricing, hiring"
              className={`${inputCls} w-full`}
            />
            {/* Grows from what's already been used rather than a fixed list —
                the right topics are specific to who's writing. */}
            <datalist id="eden-topics">
              {knownTopics.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
        </div>

        {/* Schedule */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
            <Clock size={13} /> Publish at
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            min={nowLocalISO()}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={`${inputCls} flex-1 min-w-[13rem]`}
          />
        </div>

        {/* Buffer channel — only meaningful for a plain text post; media and
            polls can't publish through createPost yet (see comment above). */}
        {bufferConnected && type === "text" && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
              <Radio size={13} /> Buffer channel
            </label>
            {onSetBufferChannel ? (
              <select
                value={bufferChannelId || ""}
                onChange={(e) => onSetBufferChannel(e.target.value || null)}
                className={`${inputCls} flex-1 min-w-[13rem]`}
              >
                <option value="">Don't publish to Buffer</option>
                {bufferChannels.map((c) => (
                  <option key={c.id} value={c.id}>{c.service ? `${c.service} · ` : ""}{c.name}</option>
                ))}
              </select>
            ) : selectedChannel ? (
              <Badge tone="emerald">{selectedChannel.service ? `${selectedChannel.service} · ` : ""}{selectedChannel.name}</Badge>
            ) : (
              <span className="text-xs text-stone-400">Not mapped to a channel yet — ask Eden Labs to set one.</span>
            )}
          </div>
        )}

        {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}
        {status && <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-2">{status}</div>}

        {/* Actions */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <PrimaryButton variant="ghost" icon={Save} onClick={() => submit("draft")} disabled={publishing}>
            {editingId ? "Save as draft" : "Save draft"}
          </PrimaryButton>
          {onPushForApproval && (
            <PrimaryButton variant="dark" icon={UserCheck} onClick={() => submit("pending_review")} disabled={publishing}>
              Push for approval
            </PrimaryButton>
          )}
          <PrimaryButton
            icon={publishing ? Loader2 : Send}
            onClick={() => submit("scheduled")}
            disabled={publishing}
          >
            {publishing ? "Publishing to Buffer…" : canPublishToBuffer ? "Schedule via Buffer" : editingId ? "Save & schedule" : "Schedule"}
          </PrimaryButton>
        </div>
        {!bufferConnected && (
          <div className="text-[11px] text-stone-400 mt-2">
            Buffer isn't connected — scheduled posts are stored here until you connect it on Integrations.
          </div>
        )}
      </div>

      {/* ── Preview ── */}
      <div className="min-w-0">
        <PostPreview
          author={author}
          headline={headline}
          avatarUrl={avatarUrl}
          content={text}
          media={type === "poll" ? null : media}
          poll={type === "poll" && (poll.question || poll.options.some((o) => o.text)) ? poll : null}
        />

        <div className="flex items-center justify-between mt-6 mb-2.5">
          <span className="text-xs text-stone-400 font-medium">Recent ({scoped.length})</span>
          {scoped.length > 0 && <span className="text-[11px] text-stone-300">Click one to edit it</span>}
        </div>

        {/* Every saved post lives here — nothing is capped or hidden — inside
            a fixed-height, self-scrolling list, so "recent" never pushes the
            whole page down or hides drafts that exist but didn't fit a
            hardcoded slice. Newest first, one line per card: the full body
            was the actual mess (wrapping to 3 lines of a post read like a
            wall of text and still didn't say *which* post it was) — a
            single-line hook plus a status dot reads instantly instead. */}
        <div className="relative">
          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1 -mr-1 [scrollbar-width:thin] [scrollbar-color:theme(colors.stone.200)_transparent]">
            {[...scoped].reverse().map((p, i) => {
              const status = normalizeStatus(p.status);
              const meta = STAGE_META[status] || STAGE_META.idea;
              const typeMeta = POST_TYPE_META[p.type] || POST_TYPE_META.text;
              const TypeIcon = TYPE_ICON[p.type] || Type;
              const hook = hookOf(p.content) || (p.type ? `${POST_TYPE_META[p.type]?.label || "Media"} post` : "(media only)");
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                  className={`group motion-safe:[animation-fill-mode:both] motion-safe:animate-fade-up relative flex items-center gap-2.5 rounded-xl border pl-2 pr-1.5 py-1.5 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] ${
                    isEditing
                      ? "border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-400/20"
                      : "border-line hover:border-stone-300 hover:bg-stone-50/70"
                  }`}
                >
                  <button onClick={() => loadForEditing(p)} className="min-w-0 flex-1 flex items-center gap-2.5 text-left">
                    <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${typeMeta.chip}`}>
                      <TypeIcon size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-stone-700 truncate">{hook}</span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                        <span className="text-[11px] text-stone-400 truncate">
                          {meta.label}
                          {p.scheduledAt && ` · ${formatDateTime(p.scheduledAt)}`}
                        </span>
                      </span>
                    </span>
                  </button>
                  {onDeletePost && (
                    <button
                      onClick={() => { if (isEditing) reset(); onDeletePost(p.id); }}
                      aria-label="Delete post"
                      className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-stone-300 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
            {scoped.length === 0 && (
              <div className="text-xs text-stone-300 py-3 text-center">No posts yet — anything you save or draft shows up here.</div>
            )}
          </div>
          {/* Fade cue that there's more below, rather than an abrupt cut —
              only shown once the list is actually tall enough to scroll. */}
          {scoped.length > 5 && (
            <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-white to-transparent rounded-b-xl" />
          )}
        </div>
      </div>
    </div>
  );
}
