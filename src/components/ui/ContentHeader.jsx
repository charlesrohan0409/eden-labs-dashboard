import { useMemo } from "react";
import { PenLine, Send, Eye, Heart, Flame, Clock } from "lucide-react";
import { normalizeStatus } from "../../lib/content";
import { matchPosts } from "../../lib/contentAnalytics";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The Content tab's hero.
 *
 * Replaces a plain "0 ideas · 4 writing · 2 scheduled" subtitle, which was
 * accurate and told you nothing you'd act on. This answers the two questions
 * that actually start a content session — is the pipeline full enough, and
 * is what I published working — and puts writing one click away.
 *
 * Dark, like the Today panel: one anchored surface per screen, so the eye
 * knows where to start on a page that is otherwise a wall of white cards.
 */
export default function ContentHeader({ posts = [], bufferPosts = [], onCompose }) {
  const stats = useMemo(() => {
    const stageCount = (s) => posts.filter((p) => normalizeStatus(p.status) === s).length;
    const matched = matchPosts(posts, bufferPosts);

    const impressions = matched.reduce((sum, m) => sum + (m.metrics.impressions || 0), 0);
    const engagements = matched.reduce((sum, m) => sum + (m.metrics.engagements || 0), 0);

    // "Ready to go" is the number that decides whether today is a writing day
    // or a scheduling day — ideas + drafts + approved, i.e. everything not yet
    // out the door.
    const queued = stageCount("idea") + stageCount("writing") + stageCount("ready");

    // Posts published in the last 7 days, the only cadence figure that
    // reflects whether you're actually shipping right now.
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = posts.filter(
      (p) => normalizeStatus(p.status) === "published" && p.date && new Date(p.date).getTime() >= weekAgo
    ).length;

    return {
      queued,
      scheduled: stageCount("scheduled"),
      published: stageCount("published"),
      thisWeek,
      impressions,
      engagements,
      rate: impressions ? Number(((engagements / impressions) * 100).toFixed(1)) : null,
      hasMetrics: matched.length > 0,
    };
  }, [posts, bufferPosts]);

  return (
    <div className="bg-night text-white border border-white/[0.07] rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Content</h1>
          <p className="text-sm text-white/45 mt-1">
            {stats.queued === 0
              ? "Nothing in the pipeline — time to write."
              : stats.scheduled === 0
                ? `${stats.queued} in the pipeline, but nothing scheduled.`
                : `${stats.queued} in the pipeline · ${stats.scheduled} scheduled to go out.`}
          </p>
        </div>
        <button
          onClick={onCompose}
          className={`flex items-center gap-2 shrink-0 text-sm font-medium
            bg-white text-stone-900 rounded-xl px-4 py-2.5
            transition-transform duration-150 ${EASE} active:scale-[0.97] hover:bg-white/90`}
        >
          <PenLine size={15} /> Write a post
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
        <Stat
          icon={PenLine}
          tone="bg-sky-500/15 text-sky-300"
          label="In the pipeline"
          value={stats.queued}
          sub="ideas, drafts & ready"
          index={0}
        />
        <Stat
          icon={Send}
          tone="bg-teal-500/15 text-teal-300"
          label="Scheduled"
          value={stats.scheduled}
          sub="queued to publish"
          index={1}
        />
        <Stat
          icon={Flame}
          tone="bg-amber-500/15 text-amber-300"
          label="Shipped this week"
          value={stats.thisWeek}
          sub={`${stats.published} all time`}
          index={2}
        />
        {/* Engagement only appears once there's real data behind it — a
            hardcoded 0% would read as "your content failed" rather than
            "Buffer isn't connected". */}
        <Stat
          icon={stats.hasMetrics ? Heart : Eye}
          tone="bg-rose-500/15 text-rose-300"
          label={stats.hasMetrics ? "Engagement rate" : "Reach"}
          value={stats.hasMetrics ? `${stats.rate}%` : "—"}
          sub={stats.hasMetrics
            ? `${stats.impressions.toLocaleString()} impressions`
            : "connect Buffer to see this"}
          index={3}
        />
      </div>
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, sub, index }) {
  return (
    <div
      style={{ animationDelay: `${index * 45}ms` }}
      className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3
        motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon size={12} />
        </span>
        <span className="text-[10.5px] text-white/45 uppercase tracking-wide font-medium truncate">{label}</span>
      </div>
      <div className="text-[22px] font-bold tracking-tight tabular-nums leading-none">{value}</div>
      <div className="text-[10.5px] text-white/35 mt-1 truncate">{sub}</div>
    </div>
  );
}
