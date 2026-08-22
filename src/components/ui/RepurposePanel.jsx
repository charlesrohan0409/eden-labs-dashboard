import { useMemo, useState } from "react";
import { Recycle, ArrowRight, TrendingUp, Info, Copy, Check } from "lucide-react";
import Card, { CardTitle } from "./Card";
import Badge from "./Badge";
import { hookOf, POST_TYPE_META, CONTENT_TYPES, contentTypeLabel } from "../../lib/content";
import { matchPosts, MIN_SAMPLE } from "../../lib/contentAnalytics";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

// Concrete angles to re-cut an existing post from. Deliberately specific
// instructions rather than "rewrite this" — a vague prompt produces a
// paraphrase, which is the one outcome that's worse than not reposting at
// all, since it reads as a repeat without being one.
const ANGLES = [
  { id: "contrarian", label: "Contrarian take",  hint: "Argue the opposite of the original claim", type: "opinion" },
  { id: "listicle",   label: "Break into a list", hint: "Same idea, numbered and scannable",       type: "listicle" },
  { id: "story",      label: "Personal story",    hint: "The moment you learned this yourself",    type: "story" },
  { id: "howto",      label: "Step-by-step",      hint: "Turn the insight into instructions",      type: "howto" },
  { id: "carousel",   label: "Carousel",          hint: "One point per slide",                     type: "educational" },
  { id: "deeper",     label: "Go deeper",         hint: "Take one line and expand it into a post", type: "long" },
];

/**
 * Turns proven posts back into new ones.
 *
 * The loop this closes: analytics knows which posts worked, the composer
 * writes new ones, and until now nothing connected the two — so the insight
 * died on the analytics tab. This ranks published posts by actual engagement
 * and hands each one to the composer pre-loaded under a specific new angle.
 *
 * Ranking needs Buffer metrics; without them this falls back to "oldest
 * published first", which is still a reasonable repurposing queue (the stuff
 * your audience is least likely to remember) and is honest about being a
 * fallback rather than pretending to know what performed.
 */
export default function RepurposePanel({ posts = [], bufferPosts = [], onRepurpose }) {
  const [picked, setPicked] = useState(null);

  const candidates = useMemo(() => {
    const published = posts.filter((p) => p.status === "published" || p.bufferPostId);
    const matched = matchPosts(published, bufferPosts);
    const byId = new Map(matched.map((m) => [m.post.id, m.metrics]));

    return published
      .map((p) => ({ post: p, metrics: byId.get(p.id) || null }))
      .sort((a, b) => {
        const ae = a.metrics?.engagements ?? -1;
        const be = b.metrics?.engagements ?? -1;
        if (ae !== be) return be - ae;
        // No metrics on either — oldest first, since that's the one the
        // audience is least likely to remember seeing.
        return String(a.post.date || "").localeCompare(String(b.post.date || ""));
      })
      .slice(0, 8);
  }, [posts, bufferPosts]);

  const hasMetrics = candidates.some((c) => c.metrics);

  if (candidates.length === 0) {
    return (
      <Card className="p-5">
        <CardTitle sub="Your best posts, re-cut from a new angle">Repurpose</CardTitle>
        <div className="text-xs text-stone-300 py-8 text-center">
          Nothing published yet. Once posts go out, the ones worth running again show up here.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <CardTitle sub={hasMetrics
        ? "Ranked by real engagement — pick one, then pick an angle"
        : "Connect Buffer to rank these by engagement. For now: oldest first."}>
        Repurpose
      </CardTitle>

      {!hasMetrics && (
        <div className="flex items-start gap-2 text-[12px] text-stone-500 bg-stone-50 border border-line rounded-lg px-3 py-2 mb-3">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            These are ordered oldest-first rather than best-first, because no Buffer
            metrics matched. That's still a usable queue — just not a ranked one.
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {candidates.map(({ post, metrics }, i) => {
          const meta = POST_TYPE_META[post.type] || POST_TYPE_META.text;
          const isOpen = picked === post.id;
          return (
            <div
              key={post.id}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className={`rounded-xl border transition-colors duration-200 ${EASE}
                motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                ${isOpen ? "border-emerald-300 bg-emerald-50/30" : "border-line hover:border-stone-300"}`}
            >
              <button
                onClick={() => setPicked(isOpen ? null : post.id)}
                className={`w-full flex items-center gap-2.5 p-2.5 text-left
                  transition-transform duration-150 ${EASE} active:scale-[0.995]`}
              >
                <span className="text-[11px] font-semibold text-stone-300 tabular-nums w-4 shrink-0">{i + 1}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${meta.chip}`}>{meta.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-stone-800 truncate">
                    {hookOf(post.content) || "(media only)"}
                  </span>
                  <span className="block text-[11px] text-stone-400">
                    {post.topic || contentTypeLabel(post.contentType) || "Untagged"}
                    {post.date && ` · ${post.date}`}
                  </span>
                </span>
                {metrics && (
                  <span className="flex items-center gap-1 text-[12px] text-stone-600 tabular-nums shrink-0">
                    <TrendingUp size={11} className="text-emerald-600" />
                    {(metrics.engagements || 0).toLocaleString()}
                  </span>
                )}
                <Recycle size={13} className={`shrink-0 transition-colors ${isOpen ? "text-emerald-600" : "text-stone-300"}`} />
              </button>

              {isOpen && (
                <div className="px-2.5 pb-2.5 motion-safe:animate-fade-up">
                  <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1.5 px-0.5">
                    New angle
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {ANGLES.map((angle) => (
                      <button
                        key={angle.id}
                        onClick={() => { onRepurpose?.(post, angle); setPicked(null); }}
                        className={`text-left rounded-lg border border-line bg-white p-2
                          transition-all duration-150 ${EASE} active:scale-[0.97]
                          hover:border-emerald-300 hover:bg-emerald-50/50`}
                      >
                        <div className="text-[11.5px] font-medium text-stone-800 flex items-center gap-1">
                          {angle.label}
                          <ArrowRight size={10} className="text-stone-300" />
                        </div>
                        <div className="text-[10px] text-stone-400 leading-snug mt-0.5">{angle.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export { ANGLES };
