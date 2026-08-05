// The base surface everything sits on: white, generously rounded, hairline
// border, no drop shadow unless something is genuinely lifted.
export default function Card({ children, className = "", onClick, dark = false }) {
  const base = dark
    ? "bg-night text-white border border-white/[0.07]"
    : "bg-white border border-line";
  return (
    <div
      className={`${base} rounded-2xl ${onClick ? "cursor-pointer transition-colors hover:border-stone-300" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// Section heading used at the top of most cards.
export function CardTitle({ children, sub, action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-stone-900 tracking-tight">{children}</div>
        {sub && <div className="text-xs text-stone-400 mt-0.5">{sub}</div>}
      </div>
      {action}
    </div>
  );
}
