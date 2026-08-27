import { LogOut, RefreshCw, Target } from "lucide-react";
import Avatar from "../ui/Avatar";
import { isMetricOnTrack, metricProgressPct } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The client portal's hero.
 *
 * The portal previously opened with a flat, square-cornered `bg-night` strip
 * carrying nothing but a name — while the owner's own screens each got a
 * rounded night card with glass tiles and real numbers in it. Same product,
 * two visibly different tiers of care, and the client was on the wrong side
 * of it.
 *
 * So this is a real hero: it answers "how are we doing" before the client has
 * clicked anything. The tiles are the delivery commitments themselves rather
 * than vanity totals, because that is the thing a client is actually paying
 * to have answered.
 */
export default function PortalHero({
  client, agencyName, onExit, exitLabel, onRefresh, refreshing,
}) {
  const metrics = (client.delivery || []).slice(0, 4);
  const onTrackCount = metrics.filter(isMetricOnTrack).length;

  return (
    <div className="bg-night text-white border border-white/[0.07] rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5 min-w-0">
          <Avatar name={client.name} photoUrl={client.photoUrl} logoUrl={client.logoUrl} size={46} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
              {client.company || client.name}
            </h1>
            <p className="text-[13px] text-white/45 mt-0.5">
              {metrics.length === 0
                ? `Your workspace with ${agencyName}`
                : onTrackCount === metrics.length
                  ? `Everything on track · ${agencyName}`
                  : `${onTrackCount} of ${metrics.length} on track · ${agencyName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh"
              title="Check for updates"
              className={`p-2 rounded-full text-white/50 hover:text-white hover:bg-white/[0.08]
                border border-white/10 disabled:opacity-50
                transition-[transform,background-color,color] duration-150 ${EASE} active:scale-[0.94]`}
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
          {onExit && (
            <button
              onClick={onExit}
              className={`text-xs text-white/70 flex items-center gap-1.5 hover:text-white hover:bg-white/[0.08]
                border border-white/10 rounded-full px-3.5 py-2
                transition-[transform,background-color,color] duration-150 ${EASE} active:scale-[0.96]`}
            >
              <LogOut size={13} /> {exitLabel}
            </button>
          )}
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
          {metrics.map((d, i) => {
            const ok = isMetricOnTrack(d);
            const pct = metricProgressPct(d);
            return (
              <div
                key={d.id || i}
                style={{ animationDelay: `${i * 60}ms` }}
                className={`bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5
                  motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                  transition-colors duration-200 ${EASE} hover:bg-white/[0.07]`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Target size={11} className={ok ? "text-emerald-400" : "text-amber-400"} />
                  <span className="text-[11px] text-white/45 truncate">{d.metric}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-[22px] font-bold tracking-tight tabular-nums leading-none">
                    {d.current}
                  </span>
                  <span className="text-[12px] text-white/35 tabular-nums">/ {d.target}</span>
                </div>
                {/* Width animates, so a refresh that moves a number reads as
                    progress rather than a jump cut. */}
                <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden mt-2.5">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${EASE}
                      ${ok ? "bg-emerald-400" : "bg-amber-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
