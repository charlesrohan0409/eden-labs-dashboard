import { TrendingUp, TrendingDown } from "lucide-react";
import Card from "./Card";

const TONES = {
  emerald: { wash: "bg-emerald-50", icon: "text-emerald-700" },
  sky: { wash: "bg-sky-50", icon: "text-sky-700" },
  amber: { wash: "bg-amber-50", icon: "text-amber-700" },
  violet: { wash: "bg-violet-50", icon: "text-violet-700" },
  rose: { wash: "bg-rose-50", icon: "text-rose-600" },
  teal: { wash: "bg-teal-50", icon: "text-teal-700" },
};

/**
 * The workhorse stat tile: small circled icon, label, oversized number, and an
 * optional trend line or sparkline underneath. `dark` renders the one hero
 * card a screen is allowed to have.
 */
export default function IconStat({
  icon: Icon, tone = "emerald", label, value, unit, trend, trendLabel,
  spark, dark = false, footer, invertTrend = false,
}) {
  const t = TONES[tone] || TONES.emerald;
  // On most metrics up is good; on cost/overdue metrics it isn't.
  const good = trend == null ? null : invertTrend ? trend <= 0 : trend >= 0;
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card dark={dark} className="p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <span className={`text-xs font-medium ${dark ? "text-white/50" : "text-stone-400"}`}>{label}</span>
        {Icon && (
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              dark ? "bg-emerald-500/15" : t.wash
            }`}
          >
            <Icon size={13} className={dark ? "text-emerald-400" : t.icon} />
          </div>
        )}
      </div>

      <div className={`text-[28px] leading-none font-bold tracking-tight mt-3 tnum ${dark ? "text-white" : "text-stone-900"}`}>
        {value}
        {unit && <span className="text-base font-normal ml-0.5 opacity-60">{unit}</span>}
      </div>

      {spark && <div className="h-11 mt-3 -mx-1">{spark}</div>}

      {(trend != null || trendLabel) && (
        <div
          className={`flex items-center gap-1 text-[11px] mt-2 ${
            good == null ? "text-stone-400" : good ? "text-emerald-600" : "text-rose-500"
          }`}
        >
          {trend != null && <TrendIcon size={11} />}
          {trend != null && <span className="tnum font-medium">{trend >= 0 ? "+" : ""}{trend}%</span>}
          {trendLabel && <span className={dark ? "text-white/40" : "text-stone-400"}>{trendLabel}</span>}
        </div>
      )}

      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </Card>
  );
}
