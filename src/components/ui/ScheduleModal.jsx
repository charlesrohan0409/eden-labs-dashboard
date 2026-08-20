import { useState } from "react";
import { Loader2, Radio, AlertTriangle, Calendar } from "lucide-react";
import Modal from "./Modal";
import Badge from "./Badge";
import { createBufferPost, bufferSupportsMedia } from "../../lib/buffer";
import { formatDateTime } from "../../lib/utils";
import { hookOf, POST_TYPE_META } from "../../lib/content";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Asks when a post should go out, then actually queues it on Buffer.
 *
 * Moving a card to "Scheduled" used to just relabel it, which quietly meant
 * "scheduled" was a lie — nothing was queued anywhere. This closes that: the
 * status only changes if Buffer confirms, so the board can't claim something
 * is scheduled when it isn't.
 *
 * Scheduling without Buffer connected is still allowed, but says plainly that
 * it's a reminder rather than a queued post.
 */
export default function ScheduleModal({
  open, post, channels = [], channelId: defaultChannelId, bufferConnected,
  onClose, onConfirm,
}) {
  const [when, setWhen] = useState(() => {
    // Default to tomorrow at 9am rather than "now" — you're scheduling
    // precisely because you don't want it to go out this second.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
  });
  const [channel, setChannel] = useState(defaultChannelId || channels[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!post) return null;

  const mediaOk = bufferSupportsMedia(post.media);
  const willQueue = bufferConnected && channel && mediaOk;
  const typeMeta = POST_TYPE_META[post.type] || POST_TYPE_META.text;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      let bufferPostId = null;
      if (willQueue) {
        const created = await createBufferPost({
          text: post.content || "",
          channelId: channel,
          scheduledAt: when,
          media: post.media,
        });
        bufferPostId = created?.id || null;
      }
      // Status only flips once Buffer has confirmed (or we've been explicit
      // that this is a local reminder) — never optimistically.
      onConfirm({ scheduledAt: when, bufferPostId, queued: !!bufferPostId });
      onClose();
    } catch (e) {
      setError(e.message || "Buffer rejected the post.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Schedule this post" onClose={onClose}>
      <div className="space-y-4">
        {/* What's being scheduled — enough to be sure it's the right card */}
        <div className="rounded-xl border border-line p-3 bg-stone-50/60">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeMeta.chip}`}>{typeMeta.label}</span>
            <span className="text-[11px] text-stone-400">{(post.content || "").length} chars</span>
          </div>
          <div className="text-[13px] text-stone-700 line-clamp-2">
            {hookOf(post.content) || "(media only)"}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
            Publish at
          </label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="border border-line rounded-lg px-3 py-2 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
          <div className="text-[11px] text-stone-400 mt-1 flex items-center gap-1.5">
            <Calendar size={11} /> Goes out {formatDateTime(when)}
          </div>
        </div>

        {bufferConnected && channels.length > 0 && (
          <div>
            <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
              Buffer channel
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="border border-line rounded-lg px-3 py-2 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            >
              <option value="">Don't queue — just set the date here</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.service ? `${c.service} · ` : ""}{c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Say plainly what will and won't happen. The failure mode this
            guards against is believing something is queued when it isn't. */}
        {willQueue ? (
          <div className="flex items-start gap-2 text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <Radio size={13} className="mt-0.5 shrink-0" />
            <span>
              Will be queued on Buffer{post.media?.items?.length ? ` with ${post.media.items.length} attachment${post.media.items.length > 1 ? "s" : ""}` : ""} and publish automatically.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              {!bufferConnected ? "Buffer isn't connected, so this only sets the date here — you'll need to post it yourself."
                : !mediaOk ? "Polls can't be queued through Buffer, so this only sets the date here."
                : "No channel selected, so this only sets the date here — you'll need to post it yourself."}
            </span>
          </div>
        )}

        {error && (
          <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            disabled={busy || !when}
            className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium bg-emerald-800 text-white
              rounded-lg px-4 py-2.5 transition-transform duration-150 ${EASE}
              active:scale-[0.98] hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> Scheduling…</> : "Schedule"}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm text-stone-500 px-4 py-2.5 hover:text-stone-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
