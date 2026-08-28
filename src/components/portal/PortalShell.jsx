import { LogOut, RefreshCw } from "lucide-react";
import Avatar from "../ui/Avatar";
import Logo from "../layout/Logo";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * The portal's frame: the same left sidebar the owner dashboard uses.
 *
 * Deliberately the same shell rather than a distinct "client product" look.
 * Two design systems drift apart the moment one gets attention and the other
 * doesn't — which is exactly how the portal ended up a generation behind in
 * the first place. Sharing the frame means every future polish pass lands on
 * both at once.
 *
 * It also fixes the concrete problem that the tab strip had: no persistent
 * navigation on mobile, so on a long tab the way out scrolled off the screen.
 */
export default function PortalShell({
  client, agencyName, nav, view, setView,
  onExit, exitLabel, onRefresh, refreshing, children,
}) {
  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* ── desktop sidebar ── */}
      <aside className="hidden lg:flex w-60 shrink-0 bg-night text-stone-300 min-h-screen flex-col sticky top-0 h-screen">
        <div className="px-4 py-6">
          <Logo size={34} tone="dark" />
        </div>

        <div className="px-3 pb-4">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <Avatar name={client.name} photoUrl={client.photoUrl} logoUrl={client.logoUrl} size={30} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-white truncate">
                {client.company || client.name}
              </div>
              <div className="text-[10.5px] text-stone-500 truncate">with {agencyName}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {nav.map((it) => {
            const Icon = it.icon;
            const active = view === it.id;
            return (
              <button
                key={it.id}
                onClick={() => setView(it.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left
                  transition-[background-color,color,transform] duration-150 ${EASE} active:scale-[0.98] ${
                  active
                    ? "bg-white/[0.08] text-white font-medium"
                    : "text-stone-400 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <Icon size={16} />
                {it.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 space-y-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className={`w-full flex items-center justify-center gap-1.5 text-xs text-stone-400
                border border-white/10 rounded-xl py-2.5 hover:bg-white/[0.06] hover:text-white
                disabled:opacity-50 transition-[background-color,color,transform] duration-150 ${EASE} active:scale-[0.98]`}
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Checking…" : "Check for updates"}
            </button>
          )}
          {onExit && (
            <button
              onClick={onExit}
              className={`w-full flex items-center justify-center gap-1.5 text-xs text-stone-400
                border border-white/10 rounded-xl py-2.5 hover:bg-white/[0.06] hover:text-white
                transition-[background-color,color,transform] duration-150 ${EASE} active:scale-[0.98]`}
            >
              <LogOut size={13} /> {exitLabel}
            </button>
          )}
        </div>
      </aside>

      {/* ── mobile top bar ── */}
      <div className="lg:hidden sticky top-0 z-30 bg-night text-white px-4 py-3 flex items-center gap-3">
        <Avatar name={client.name} photoUrl={client.photoUrl} logoUrl={client.logoUrl} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold tracking-tight truncate">
            {client.company || client.name}
          </div>
          <div className="text-[10.5px] text-white/40 truncate">with {agencyName}</div>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Check for updates"
            className={`p-2 rounded-full text-white/50 border border-white/10 disabled:opacity-50
              transition-transform duration-150 ${EASE} active:scale-[0.94]`}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        )}
        {onExit && (
          <button
            onClick={onExit}
            aria-label={exitLabel}
            className={`p-2 rounded-full text-white/50 border border-white/10
              transition-transform duration-150 ${EASE} active:scale-[0.94]`}
          >
            <LogOut size={13} />
          </button>
        )}
      </div>

      <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 pb-24 lg:pb-8">
        <div className={`${view === "crm" ? "max-w-[1400px]" : "max-w-5xl"} mx-auto`}>
          {children}
        </div>
      </main>

      {/* ── mobile bottom nav ── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-line flex overflow-x-auto no-scrollbar safe-area-bottom">
        {nav.map((it) => {
          const Icon = it.icon;
          const active = view === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className={`shrink-0 w-16 flex flex-col items-center gap-0.5 py-2.5 text-[10px]
                transition-colors duration-150 ${EASE} ${
                active ? "text-emerald-800 font-medium" : "text-stone-400"
              }`}
            >
              <Icon size={18} />
              <span className="truncate w-full text-center px-0.5">{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
