// Segmented pill selector — the primary way to switch views inside a page.
// On narrow screens the pill strip scrolls horizontally so long tab lists
// never overflow the viewport. The outer wrapper bleeds to the edge of the
// page padding (via negative margin) so the scroll area is full-width.
export default function PillTabs({ options, value, onChange, size = "sm", className = "" }) {
  const pad = size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs";
  return (
    <div className="overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
      <div className={`inline-flex bg-stone-100 rounded-full p-1 gap-0.5 ${className}`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`${pad} rounded-full font-medium transition-colors whitespace-nowrap ${
              value === opt.value
                ? "bg-night text-white"
                : "text-stone-500 hover:text-stone-800"
            }`}
          >
            {opt.label}
            {opt.count != null && (
              <span className={`ml-1.5 ${value === opt.value ? "text-white/50" : "text-stone-400"}`}>
                {opt.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
