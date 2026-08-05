const TONES = {
  stone: "bg-stone-100 text-stone-600",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-600",
  teal: "bg-teal-50 text-teal-700",
  violet: "bg-violet-50 text-violet-700",
  sky: "bg-sky-50 text-sky-700",
};

const DOTS = {
  stone: "bg-stone-400",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
  violet: "bg-violet-500",
  sky: "bg-sky-500",
};

// `dot` renders the small status dot the reference dashboards use in tables.
export default function Badge({ children, tone = "stone", dot = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${TONES[tone] || TONES.stone} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOTS[tone] || DOTS.stone}`} />}
      {children}
    </span>
  );
}
