import { LogOut, RefreshCw, CheckCircle2, Send, Handshake, Clock } from "lucide-react";
import Avatar from "../ui/Avatar";
import { isMetricOnTrack } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The client portal's hero.
 *
 * The portal used to open with a flat, square-cornered night strip carrying
 * nothing but a name, while every owner screen got a rounded night card with
 * glass tiles and real numbers. Same product, two visible tiers of care.
 *
 * The tiles deliberately do NOT repeat the delivery metrics — those already
 * have a detailed card directly below, and showing the same four numbers
 * twice on one screen is just noise. Instead the first tile is the thing the
 * client has to DO (posts waiting on their approval, otherwise buried two
 * clicks away in the Content tab), and the rest are the outcomes they're
 * paying for. "Needs you" leads because a dashboard should open with the
 * action, not the archive.
 */
export default function PortalHero({
  client, agencyName, stats, onExit, exitLabel, onRefresh, refreshing, onGoToApprovals,
}) {
  const metrics = client.delivery || [];
  const onTrackCount = metrics.filter(isMetricOnTrack).length;
  const allOnTrack = metrics.length > 0 && onTrackCount === metrics.length;

  const tiles = [
    {
      id: "approvals", icon: Clock, label: "Needs you",
      value: stats.pendingApproval,
      sub: stats.pendingApproval === 1 ? "post to approve" : "posts to approve",
      tone: stats.pendingApproval > 0 ? "bg-amber-500/15 text-amber-300" : "bg-white/[0.06] text-white/40",
      action: stats.pendingApproval > 0 ? onGoToApprovals : null,
    },
    { id: "published", icon: Send, label: "Published", value: stats.published, sub: "posts live", tone: "bg-emerald-500/15 text-emerald-300" },
    { id: "deals", icon: Handshake, label: "Deals closed", value: stats.deals, sub: stats.dealValue, tone: "bg-violet-500/15 text-violet-300" },
    {
      id: "track", icon: CheckCircle2, label: "On track",
      value: metrics.length ? `${onTrackCount}/${metrics.length}` : "—",
      sub: metrics.length ? "goals this cycle" : "no goals set",
      tone: allOnTrack ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
    },
  ];

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
              {stats.pendingApproval > 0
                ? `${stats.pendingApproval} ${stats.pendingApproval === 1 ? "post is" : "posts are"} waiting on you`
                : allOnTrack
                  ? `Everything on track · ${agencyName}`
                  : `Your workspace with ${agencyName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Check for updates"
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
        {tiles.map((t, i) => {
          const Tag = t.action ? "button" : "div";
          return (
            <Tag
              key={t.id}
              onClick={t.action || undefined}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`text-left bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5
                motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                transition-[background-color,transform] duration-200 ${EASE}
                ${t.action ? "hover:bg-white/[0.09] active:scale-[0.98] cursor-pointer" : "hover:bg-white/[0.07]"}`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${t.tone}`}>
                  <t.icon size={11} />
                </span>
                <span className="text-[11px] text-white/45 truncate">{t.label}</span>
              </div>
              <div className="text-[26px] font-bold tracking-tight tabular-nums leading-none">
                {t.value}
              </div>
              <div className="text-[11px] text-white/35 mt-1.5 truncate">{t.sub}</div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
