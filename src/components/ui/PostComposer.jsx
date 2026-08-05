import { useRef, useState } from "react";
import {
  Bold, Italic, Send, Image as ImageIcon, Film, LayoutGrid, BarChart3,
  Type, X, Plus, Clock, UserCheck, Save, Loader2, Radio, Pencil, Trash2,
} from "lucide-react";
import Badge from "./Badge";
import PrimaryButton from "./PrimaryButton";
import PostPreview from "./PostPreview";
import { toUnicodeBold, toUnicodeItalic, nowLocalISO, formatDateTime } from "../../lib/utils";
import { fileToImage, fileToVideo } from "../../lib/media";
import { createBufferPost } from "../../lib/buffer";

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
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState("text");
  const [media, setMedia] = useState(null);
  const [poll, setPoll] = useState(EMPTY_POLL);
  const [scheduledAt, setScheduledAt] = useState(nowLocalISO(60));
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  const selectedChannel = bufferChannels.find((c) => c.id === bufferChannelId);
  const editingPost = editingId ? posts.find((p) => p.id === editingId) : null;
  // Once a post is actually live in Buffer, re-saving here must never fire a
  // second createPost — that would duplicate it on LinkedIn. Editing text
  // still updates our own record; it just can't touch what's already queued.
  const alreadyOnBuffer = !!editingPost?.bufferPostId;
  // Buffer's public API only takes plain text on createPost — no polls, no
  // media attach yet — so that's the only combination we publish directly.
  // Everything else still schedules, just locally, until that's built out.
  const canPublishToBuffer = bufferConnected && !!bufferChannelId && type === "text" && !alreadyOnBuffer;

  const loadForEditing = (p) => {
    setEditingId(p.id);
    setText(p.content || "");
    setType(p.type || "text");
    setMedia(p.media || null);
    setPoll(p.poll || EMPTY_POLL);
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

  const acceptFor = { image: "image/*", carousel: "image/*", video: "video/*" }[type];
  const multiple = type === "carousel";

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    setError("");
    setBusy(true);
    try {
      if (type === "video") {
        const v = await fileToVideo(files[0]);
        setMedia({ type: "video", items: [v] });
      } else {
        const imgs = await Promise.all(files.map(fileToImage));
        setMedia((prev) => {
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
    else if (media && media.type !== next && !(next === "carousel" && media.type === "image")) setMedia(null);
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
    scheduledAt: postStatus === "scheduled" ? scheduledAt : null,
    date: (postStatus === "scheduled" ? scheduledAt : new Date().toISOString()).slice(0, 10),
  });

  const reset = () => {
    setText("");
    setMedia(null);
    setPoll(EMPTY_POLL);
    setType("text");
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
        const bufferPost = await createBufferPost({ text, channelId: bufferChannelId, scheduledAt });
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
        <div className="flex items-center gap-1 mb-2">
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
          className="w-full h-44 border border-line rounded-xl p-3.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700/20 resize-y"
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
                    {type === "video" ? "Upload a video" : type === "carousel" ? "Add carousel slides (images)" : "Add photos"}
                  </div>
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    {type === "carousel" ? "Up to 20 slides · export your PDF pages as images" : type === "video" ? "MP4 up to 8MB" : "Up to 9 images"}
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

        <div className="flex items-center justify-between mt-5 mb-2">
          <span className="text-xs text-stone-400 font-medium">Recent ({scoped.length})</span>
          {scoped.length > 0 && <span className="text-[11px] text-stone-300">Click one to edit it</span>}
        </div>
        <div className="space-y-2">
          {scoped.slice(0, 4).map((p) => (
            <div
              key={p.id}
              className={`group w-full text-xs border rounded-xl p-2.5 flex justify-between items-start gap-2 transition-colors ${
                editingId === p.id ? "border-emerald-500 bg-emerald-50/50" : "border-line text-stone-600 hover:border-stone-300"
              }`}
            >
              <button onClick={() => loadForEditing(p)} className="min-w-0 flex-1 text-left">
                <span className="line-clamp-2 block">{p.content || "(media only)"}</span>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge tone={p.status === "published" ? "emerald" : p.status === "scheduled" ? "teal" : p.status === "pending_review" ? "amber" : "stone"}>
                  {p.status === "pending_review" ? "in review" : p.status}
                </Badge>
                {onDeletePost && (
                  <button
                    onClick={() => { if (editingId === p.id) reset(); onDeletePost(p.id); }}
                    aria-label="Delete post"
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-stone-300 hover:text-rose-500 transition p-0.5"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {scoped.length === 0 && <div className="text-xs text-stone-300">No posts yet.</div>}
        </div>
      </div>
    </div>
  );
}
