import { useMemo, useState } from "react";
import { TrendingUp, Info, RefreshCw, ExternalLink } from "lucide-react";
import Card, { CardTitle } from "./Card";
import Badge from "./Badge";
import PillTabs from "./PillTabs";
import { matchPosts, buildInsights, topPosts, MIN_SAMPLE } from "../../lib/contentAnalytics";
import { hookOf, POST_TYPE_META } from "../../lib/content";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const DIMENSIONS = [
  { id: "format",      label: "Format",   blurb: "Text, carousel, image — what shape performs" },
  { id: "contentType", label: "Type",     blurb: "The angle: listicle, story, how-to" },
  { id: "topic",       label: "Topic",    blurb: "What you wrote about" },
  { id: "hookShape",   label: "Hook",     blurb: "How the first line opens" },
  { id: "dayOfWeek",   label: "Day",      blurb: "Which day lands best" },
  { id: "timeOfDay",   label: "Time",     blurb: "When it goes out" },
];

/**
 * What's actually working, from Buffer's per-post metrics joined to the
 * format/type/topic recorded here.
 *
 * The whole component is built around one honest constraint: at a few posts a
 * week, most of these rankings are noise for months. So sample size is shown
 * everywhere, under-sampled rows are visibly de-emphasised rather than hidden,
 * and the headline refuses to name a winner until there's enough data. Saying
 * "not enough yet" is the feature, not a placeholder.
 */
export default function ContentAnalytics({ posts = [], bufferPosts = [], loading, error, onRefresh }) {
  const [dimension, setDimension] = useState("format");

  const matched = useMemo(() => matchPosts(posts, bufferPosts), [posts, bufferPosts]);
  const insights = useMemo(() => buildInsights(matched), [matched]);
  const best = useMemo(() => topPosts(matched, 5), [matched]);

  const rows = insights[dimension] || [];
  const total = matched.length;
  const confident = rows.filter((r) => r.enough);
  const maxEng = Math.max(1, ...rows.map((r) => r.avgEngagements));

  if (error) {
    return (
      <Card className="p-5">
        <CardTitle sub="Couldn't reach Buffer">Content analytics</CardTitle>
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-stone-900 tracking-tight">What's working</div>
            <div className="text-xs text-stone-400 mt-0.5">
              {loading ? "Loading Buffer data…"
                : total === 0 ? "No published posts matched to Buffer yet"
                : `Based on ${total} published post${total === 1 ? "" : "s"}`}
            </div>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className={`flex items-center gap-1.5 text-xs font-medium text-stone-600 border border-line
                rounded-lg px-2.5 py-1.5 shrink-0 transition-transform duration-150 ${EASE}
                active:scale-[0.97] hover:bg-stone-50 disabled:opacity-50`}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          )}
        </div>

        {/* The gate. Below MIN_SAMPLE nothing here is trustworthy, and saying
            so is more useful than ranking four data points. */}
        {total > 0 && total < MIN_SAMPLE && (
          <div className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Only {total} post{total === 1 ? "" : "s"} so far. Numbers below are shown, but treat them as
              early signal — {MIN_SAMPLE - total} more published post{MIN_SAMPLE - total === 1 ? "" : "s"} before
              any of this is worth acting on.
            </span>
          </div>
        )}

        <PillTabs
          value={dimension}
          onChange={setDimension}
          options={DIMENSIONS.map((d) => ({ value: d.id, label: d.label }))}
        />
        <div className="text-[11px] text-stone-400 mt-2 mb-3">
          {DIMENSIONS.find((d) => d.id === dimension)?.blurb}
        </div>

        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div
              key={r.key}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              className={`motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                rounded-xl border border-line p-2.5 ${r.enough ? "" : "opacity-55"}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-medium text-stone-800 truncate">{r.label || "—"}</span>
                  {r.enough
                    ? i === 0 && <Badge tone="emerald" dot>Best</Badge>
                    : <span className="text-[10px] text-stone-400 shrink-0">n={r.n}, need {MIN_SAMPLE}</span>}
                </div>
                <div className="text-[12px] text-stone-600 tabular-nums shrink-0">
                  {r.avgEngagements.toLocaleString()} <span className="text-stone-400">avg engagements</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className={`h-full w-full rounded-full origin-left transition-transform duration-300 ${EASE}
                    ${r.enough ? "bg-emerald-500" : "bg-stone-300"}`}
                  style={{ transform: `scaleX(${r.avgEngagements / maxEng})` }}
                />
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-stone-400">
                <span>{r.n} post{r.n === 1 ? "" : "s"}</span>
                <span>{r.avgImpressions.toLocaleString()} avg impressions</span>
                <span>{r.avgEngagementRate}% rate</span>
              </div>
            </div>
          ))}
          {rows.length === 0 && !loading && (
            <div className="text-xs text-stone-300 py-8 text-center">
              {total === 0
                ? "Once posts publish through Buffer, they'll show up here."
                : "Nothing tagged with this yet — set it on your posts to compare."}
            </div>
          )}
        </div>

        {confident.length > 0 && (
          <div className="mt-4 pt-4 border-t border-line flex items-start gap-2">
            <TrendingUp size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-[12px] text-stone-600">
              <span className="font-medium text-stone-800">{confident[0].label}</span> is your strongest{" "}
              {DIMENSIONS.find((d) => d.id === dimension)?.label.toLowerCase()} with enough data behind it
              — {confident[0].avgEngagements.toLocaleString()} average engagements across {confident[0].n} posts.
            </div>
          </div>
        )}
      </Card>

      {best.length > 0 && (
        <Card className="p-4 sm:p-5">
          <CardTitle sub="Your highest-engagement posts — worth studying and reusing">
            Top performers
          </CardTitle>
          <div className="space-y-1.5">
            {best.map((m, i) => {
              const meta = POST_TYPE_META[m.post.type] || POST_TYPE_META.text;
              return (
                <div
                  key={m.post.id}
                  style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  className={`motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                    flex items-center gap-2.5 rounded-xl border border-line p-2.5
                    transition-colors duration-200 ${EASE} hover:border-stone-300`}
                >
                  <span className="text-[11px] font-semibold text-stone-300 tabular-nums w-4 shrink-0">{i + 1}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${meta.chip}`}>{meta.label}</span>
                  <span className="text-[13px] text-stone-700 truncate flex-1 min-w-0">
                    {hookOf(m.post.content) || "(media only)"}
                  </span>
                  <span className="text-[12px] text-stone-600 tabular-nums shrink-0">
                    {(m.metrics.engagements || 0).toLocaleString()}
                  </span>
                  {m.buffer.externalLink && (
                    <a
                      href={m.buffer.externalLink} target="_blank" rel="noopener noreferrer"
                      className="text-stone-300 hover:text-emerald-700 transition-colors shrink-0"
                      aria-label="Open on LinkedIn"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
