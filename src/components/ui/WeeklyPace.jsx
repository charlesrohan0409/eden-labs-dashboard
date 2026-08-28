import { Zap, CheckCircle2, AlertTriangle } from "lucide-react";
import { weeklyPace } from "../../lib/outreach";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Progress against the weekly connection quota.
 *
 * LinkedIn caps invites at 200 a week and rolls over at midnight Saturday, so
 * the real deadline is Saturday evening. This is a hard operational
 * constraint rather than a nice-to-have metric: miss the week and the
 * capacity is gone, it doesn't roll forward.
 *
 * The number that matters is "how many a day from here", not "how many so
 * far" — so that's what's shown biggest.
 */
export default function WeeklyPace({ entries, target, dark = false, compact = false }) {
  const p = weeklyPace(entries, target);
  const behind = !p.done && p.daysLeft <= 2 && p.remaining > 0;

  const tone = p.done
    ? { bar: "bg-emerald-500", text: dark ? "text-emerald-300" : "text-emerald-700", Icon: CheckCircle2 }
    : behind
      ? { bar: "bg-rose-500", text: dark ? "text-rose-300" : "text-rose-600", Icon: AlertTriangle }
      : { bar: "bg-amber-400", text: dark ? "text-amber-300" : "text-amber-600", Icon: Zap };

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <tone.Icon size={12} className={`${tone.text} shrink-0`} />
        <span className={`text-[11px] tabular-nums ${dark ? "text-white/60" : "text-stone-500"} truncate`}>
          {p.done
            ? `${p.sent}/${p.target} connections — week done`
            : `${p.sent}/${p.target} · ${p.perDay}/day for ${p.daysLeft} ${p.daysLeft === 1 ? "day" : "days"}`}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${dark
      ? "bg-white/[0.04] border-white/[0.06]"
      : "bg-white border-line"}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <tone.Icon size={12} className={tone.text} />
        <span className={`text-[11px] font-medium ${dark ? "text-white/45" : "text-stone-400"}`}>
          This week's connections
        </span>
      </div>

      {p.done ? (
        <>
          <div className={`text-[26px] font-bold tracking-tight tabular-nums leading-none ${dark ? "text-white" : "text-stone-900"}`}>
            {p.sent}
          </div>
          <div className={`text-[11px] mt-1.5 ${tone.text}`}>Quota hit — nothing more needed</div>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[26px] font-bold tracking-tight tabular-nums leading-none ${dark ? "text-white" : "text-stone-900"}`}>
              {p.perDay}
            </span>
            <span className={`text-[12px] ${dark ? "text-white/40" : "text-stone-400"}`}>
              a day for {p.daysLeft} {p.daysLeft === 1 ? "day" : "days"}
            </span>
          </div>
          <div className={`text-[11px] mt-1 tabular-nums ${dark ? "text-white/35" : "text-stone-400"}`}>
            {p.sent} of {p.target} sent · {p.remaining} to go
          </div>
        </>
      )}

      <div className={`h-1.5 rounded-full overflow-hidden mt-2.5 ${dark ? "bg-white/[0.08]" : "bg-stone-100"}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${EASE} ${tone.bar}`}
          style={{ width: `${p.pct}%` }}
        />
      </div>
      <div className={`text-[10px] mt-1.5 ${dark ? "text-white/25" : "text-stone-300"}`}>
        Resets Sunday · LinkedIn caps this at {p.target}
      </div>
    </div>
  );
}
