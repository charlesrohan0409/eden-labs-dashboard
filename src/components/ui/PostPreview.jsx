import { useState } from "react";
import {
  Globe, MoreHorizontal, ThumbsUp, MessageSquare, Repeat2, Send,
  ChevronLeft, ChevronRight, FileText, Smartphone, Monitor,
} from "lucide-react";
import Avatar from "./Avatar";
import PillTabs from "./PillTabs";

// LinkedIn truncates the post body and shows "…see more" past roughly this
// many characters on desktop, fewer on mobile.
const TRUNCATE_AT = { desktop: 210, mobile: 130 };

function ReactionIcons() {
  return (
    <span className="flex -space-x-1">
      <span className="w-4 h-4 rounded-full bg-[#378FE9] flex items-center justify-center ring-1 ring-white">
        <ThumbsUp size={8} className="text-white fill-white" />
      </span>
      <span className="w-4 h-4 rounded-full bg-[#DF704D] flex items-center justify-center ring-1 ring-white text-[8px]">
        🎉
      </span>
      <span className="w-4 h-4 rounded-full bg-[#E9A03D] flex items-center justify-center ring-1 ring-white text-[8px]">
        💡
      </span>
    </span>
  );
}

// ---------- Media renderers ----------
function Carousel({ items }) {
  const [idx, setIdx] = useState(0);
  const safe = Math.min(idx, items.length - 1);

  return (
    <div className="relative bg-[#F4F2EE] border-y border-black/[0.08]">
      <div className="aspect-[4/3] flex items-center justify-center overflow-hidden">
        {items[safe]?.url ? (
          <img src={items[safe].url} alt="" className="w-full h-full object-contain" />
        ) : (
          <FileText size={28} className="text-stone-300" />
        )}
      </div>

      {items.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(Math.max(0, safe - 1)); }}
            disabled={safe === 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-0"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx(Math.min(items.length - 1, safe + 1)); }}
            disabled={safe === items.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center disabled:opacity-0"
          >
            <ChevronRight size={15} />
          </button>
        </>
      )}

      {/* LinkedIn shows documents as a page counter pill, bottom-left. */}
      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[11px] px-2 py-0.5 rounded">
        {safe + 1} / {items.length}
      </div>
    </div>
  );
}

function Poll({ poll, compact }) {
  const total = poll.options.reduce((s, o) => s + (Number(o.votes) || 0), 0);
  return (
    <div className={`border border-black/[0.12] rounded-lg m-3 ${compact ? "p-2.5" : "p-3"}`}>
      <div className={`font-semibold text-[#000000E6] ${compact ? "text-[13px]" : "text-sm"}`}>
        {poll.question || "Your poll question"}
      </div>
      <div className="text-[11px] text-[#00000099] mt-0.5">
        {total > 0 ? `${total} votes · ` : ""}{poll.durationDays || 7}d left
      </div>
      <div className="space-y-1.5 mt-2.5">
        {poll.options.filter((o) => o.text.trim()).map((o, i) => {
          const pct = total ? Math.round(((Number(o.votes) || 0) / total) * 100) : 0;
          return (
            <div key={i} className="relative">
              {total > 0 ? (
                <div className="relative rounded overflow-hidden border border-[#00000026]">
                  <div className="absolute inset-y-0 left-0 bg-[#E8F2FC]" style={{ width: `${pct}%` }} />
                  <div className="relative flex justify-between px-3 py-1.5 text-[13px]">
                    <span className="text-[#000000E6]">{o.text}</span>
                    <span className="text-[#00000099] font-medium tnum">{pct}%</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-full border border-[#0A66C2] text-[#0A66C2] text-[13px] font-semibold text-center py-1.5">
                  {o.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Media({ media, compact }) {
  if (!media || !media.items?.length) return null;

  if (media.type === "video") {
    return (
      <div className="relative bg-black border-y border-black/[0.08]">
        <video src={media.items[0].url} controls className="w-full max-h-[420px]" />
      </div>
    );
  }

  if (media.type === "carousel" || media.type === "document") {
    return <Carousel items={media.items} />;
  }

  // Single or multi image — LinkedIn tiles 2+ images.
  if (media.items.length === 1) {
    return (
      <div className="border-y border-black/[0.08] bg-[#F4F2EE]">
        <img src={media.items[0].url} alt="" className="w-full max-h-[520px] object-cover" />
      </div>
    );
  }

  return (
    <div className={`grid gap-0.5 border-y border-black/[0.08] ${media.items.length === 2 ? "grid-cols-2" : "grid-cols-2"}`}>
      {media.items.slice(0, 4).map((it, i) => (
        <div key={i} className={`relative ${media.items.length === 3 && i === 0 ? "col-span-2" : ""}`}>
          <img src={it.url} alt="" className={`w-full object-cover ${compact ? "h-28" : "h-40"}`} />
          {i === 3 && media.items.length > 4 && (
            <div className="absolute inset-0 bg-black/55 text-white flex items-center justify-center text-lg font-semibold">
              +{media.items.length - 4}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- The post itself ----------
export function LinkedInPost({ author, headline, avatarUrl, content, media, poll, stats, device = "desktop", timeLabel = "Now" }) {
  const [expanded, setExpanded] = useState(false);
  const compact = device === "mobile";
  const limit = TRUNCATE_AT[device];
  const isLong = (content || "").length > limit;
  const shown = expanded || !isLong ? content : content.slice(0, limit).trimEnd();

  return (
    <div className="bg-white rounded-lg border border-black/[0.08] overflow-hidden font-sans">
      {/* Author */}
      <div className={`flex items-start gap-2 ${compact ? "p-3 pb-2" : "p-4 pb-2"}`}>
        <Avatar name={author} photoUrl={avatarUrl} size={compact ? 40 : 48} />
        <div className="min-w-0 flex-1">
          <div className={`font-semibold text-[#000000E6] leading-tight ${compact ? "text-[13px]" : "text-sm"}`}>
            {author}
          </div>
          <div className="text-[11px] text-[#00000099] truncate leading-tight mt-0.5">{headline}</div>
          <div className="text-[11px] text-[#00000099] flex items-center gap-1 leading-tight mt-0.5">
            {timeLabel} · <Globe size={10} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[#0A66C2] text-sm font-semibold">+ Follow</span>
          <MoreHorizontal size={18} className="text-[#00000099]" />
        </div>
      </div>

      {/* Body */}
      <div className={`${compact ? "px-3" : "px-4"} pb-2`}>
        <div className={`whitespace-pre-wrap break-words text-[#000000E6] ${compact ? "text-[13px] leading-[1.45]" : "text-sm leading-[1.5]"}`}>
          {shown || <span className="text-stone-300">Your post will appear here exactly as it renders on LinkedIn.</span>}
          {isLong && !expanded && (
            <>
              <span className="text-[#00000099]">…</span>{" "}
              <button onClick={() => setExpanded(true)} className="text-[#00000099] hover:text-[#0A66C2] hover:underline font-medium">
                see more
              </button>
            </>
          )}
        </div>
      </div>

      {poll ? <Poll poll={poll} compact={compact} /> : <Media media={media} compact={compact} />}

      {/* Social proof */}
      {stats && (stats.likes || stats.comments) ? (
        <div className={`flex items-center justify-between ${compact ? "px-3" : "px-4"} py-2 text-[11px] text-[#00000099]`}>
          <span className="flex items-center gap-1">
            <ReactionIcons /> {stats.likes}
          </span>
          <span>
            {stats.comments} comments{stats.reposts ? ` · ${stats.reposts} reposts` : ""}
          </span>
        </div>
      ) : (
        <div className={`${compact ? "px-3" : "px-4"} py-2 text-[11px] text-[#00000099]`}>
          <span className="flex items-center gap-1"><ReactionIcons /> Be the first to react</span>
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-black/[0.08] flex items-center justify-around px-1 py-1">
        {[
          { icon: ThumbsUp, label: "Like" },
          { icon: MessageSquare, label: "Comment" },
          { icon: Repeat2, label: "Repost" },
          { icon: Send, label: "Send" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className={`flex items-center gap-1.5 text-[#00000099] font-semibold rounded px-2 py-2 ${compact ? "text-[11px]" : "text-[13px]"}`}
          >
            <Icon size={compact ? 15 : 18} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The preview shell: a device switch plus the rendered post. Mobile is framed
 * at a real handset width so line breaks land where they actually will.
 */
export default function PostPreview({ author, headline, avatarUrl, content, media, poll, stats, timeLabel }) {
  const [device, setDevice] = useState("desktop");

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs text-stone-400 font-medium">Preview</span>
        <PillTabs
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: <span className="flex items-center gap-1"><Monitor size={12} /> Desktop</span> },
            { value: "mobile", label: <span className="flex items-center gap-1"><Smartphone size={12} /> Mobile</span> },
          ]}
        />
      </div>

      <div className={`bg-[#F4F2EE] rounded-2xl p-3 sm:p-4 ${device === "mobile" ? "flex justify-center" : ""}`}>
        <div
          className={device === "mobile" ? "w-full max-w-[360px] rounded-[20px] ring-4 ring-night/90 overflow-hidden bg-[#F4F2EE] p-2" : "w-full"}
        >
          <LinkedInPost
            author={author}
            headline={headline}
            avatarUrl={avatarUrl}
            content={content}
            media={media}
            poll={poll}
            stats={stats}
            device={device}
            timeLabel={timeLabel}
          />
        </div>
      </div>
    </div>
  );
}
