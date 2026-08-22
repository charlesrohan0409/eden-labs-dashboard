import { Eye, Users, Heart, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
};

/**
 * The Performance page's hero band.
 *
 * The reference this is modelled on puts big metric tiles above the fold with
 * a delta on each — the right instinct, because the first question is always
 * "up or down since last time", not "what's the raw number". Two departures
 * from it, both deliberate:
 *
 *  - Deltas render as real up/down/flat states with their own colour and
 *    icon, not a green "+2%" on everything. A dashboard where every number
 *    is green is one nobody reads twice.
 *  - A delta only appears when there's a previous period to compare against.
 *    "+0%" on a brand-new account is noise pretending to be signal.
 */
export default function PerformanceHero({ totals = {}, deltas = {}, rangeLabel, loading, onRefresh, fetchedAt }) {
  const tiles = [
    { id: "impressions", icon: Eye,   label: "Impressions", value: totals.impressions, tone: "bg-sky-500/15 text-sky-300",       sub: "times seen" },
    { id: "reach",       icon: Users, label: "Reach",       value: totals.reach,       tone: "bg-violet-500/15 text-violet-300", sub: "unique people" },
    { id: "engagements", icon: Heart, label: "Engagements", value: totals.engagements, tone: "bg-rose-500/15 text-rose-300",     sub: "likes, comments, shares" },
    {
      id: "rate", icon: TrendingUp, label: "Engagement rate",
      value: totals.engagementRate, tone: "bg-emerald-500/15 text-emerald-300",
      sub: `${totals.posts || 0} posts`, isRate: true,
    },
  ];

  return (
    <div className="bg-night text-white border border-white/[0.07] rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Performance</h1>
          <p className="text-sm text-white/45 mt-1">
            How your published content is actually doing{rangeLabel ? ` · ${rangeLabel}` : ""}.
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className={`flex items-center gap-2 shrink-0 text-xs font-medium
              bg-white/[0.08] border border-white/[0.10] text-white/80 rounded-xl px-3 py-2
              transition-transform duration-150 ${EASE} active:scale-[0.97]
              hover:bg-white/[0.14] disabled:opacity-50`}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing" : "Refresh"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tiles.map((t, i) => (
          <Tile key={t.id} {...t} delta={deltas?.[t.id]} index={i} />
        ))}
      </div>

      {fetchedAt && (
        <div className="text-[10.5px] text-white/25 mt-3">
          Updated {new Date(fetchedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, tone, delta, isRate, index }) {
  // null/undefined means "no prior period", which is different from "no
  // change" — the first shows nothing, the second shows a flat marker.
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const dir = !hasDelta ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const DeltaIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const deltaTone =
    dir === "up" ? "text-emerald-400 bg-emerald-400/10"
    : dir === "down" ? "text-rose-400 bg-rose-400/10"
    : "text-white/40 bg-white/[0.06]";

  return (
    <div
      style={{ animationDelay: `${index * 45}ms` }}
      className={`rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5
        motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
        transition-colors duration-200 ${EASE} hover:bg-white/[0.07]`}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon size={13} />
        </span>
        <span className="text-[10.5px] text-white/45 uppercase tracking-wide font-medium truncate">{label}</span>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <span className="text-[26px] font-bold tracking-tight tabular-nums leading-none">
          {isRate ? `${Number(value || 0).toFixed(1)}%` : compact(value)}
        </span>
        {hasDelta && (
          <span className={`flex items-center gap-0.5 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md ${deltaTone}`}>
            <DeltaIcon size={10} />
            {dir === "flat" ? "flat" : `${Math.abs(delta)}%`}
          </span>
        )}
      </div>
      <div className="text-[10.5px] text-white/35 mt-1.5 truncate">{sub}</div>
    </div>
  );
}
