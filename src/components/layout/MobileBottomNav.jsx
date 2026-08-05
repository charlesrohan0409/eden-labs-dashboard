import { NAV_ITEMS, isNavActive } from "./Sidebar";

// Fixed-width, horizontally scrolling rather than flex-1: with 8 nav items
// flex-1 would squeeze every label into an unreadable sliver. This way the
// first ~5 are visible and the rest are a swipe away, same as any mobile tab
// bar with more destinations than fit.
export default function MobileBottomNav({ view, setView }) {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-line flex overflow-x-auto no-scrollbar safe-area-bottom">
      {NAV_ITEMS.map((it) => {
        const Icon = it.icon;
        const active = isNavActive(it.id, view);
        return (
          <button
            key={it.id}
            onClick={() => setView(it.id)}
            className={`shrink-0 w-16 flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors ${
              active ? "text-emerald-800 font-medium" : "text-stone-400"
            }`}
          >
            <Icon size={18} />
            <span className="truncate w-full text-center px-0.5">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
