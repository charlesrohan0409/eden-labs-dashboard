/**
 * The Eden Labs lockup: a mark plus wordmark, set in the app's sans face.
 * The mark is three ascending bars sharing a baseline — growth, and an "E"
 * turned on its side — so it still reads at favicon size.
 */
export function LogoMark({ size = 32 }) {
  return (
    <div
      className="rounded-xl bg-emerald-600 flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="9" width="3.4" height="6" rx="1.2" fill="white" fillOpacity="0.55" />
        <rect x="6.3" y="5.5" width="3.4" height="9.5" rx="1.2" fill="white" fillOpacity="0.8" />
        <rect x="11.6" y="1" width="3.4" height="14" rx="1.2" fill="white" />
      </svg>
    </div>
  );
}

export default function Logo({ size = 32, tone = "dark", showBadge = true }) {
  const text = tone === "dark" ? "text-white" : "text-stone-900";
  const sub = tone === "dark" ? "text-white/40" : "text-stone-400";

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <LogoMark size={size} />
      <div className="min-w-0">
        <div className={`font-semibold tracking-[-0.02em] leading-none ${text}`} style={{ fontSize: size * 0.5 }}>
          Eden Labs
        </div>
        {showBadge && (
          <div className={`text-[10px] uppercase tracking-[0.14em] mt-1 ${sub}`}>Agency OS</div>
        )}
      </div>
    </div>
  );
}
