// Bare label/value pair used inside divided rows. No border of its own.
export default function StatBlock({ label, value, sub, align = "left" }) {
  return (
    <div className={`px-4 py-3 ${align === "center" ? "text-center" : ""}`}>
      <div className="text-xs text-stone-400 font-medium">{label}</div>
      <div className="text-xl font-bold text-stone-900 tracking-tight mt-1 tnum">{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
}
