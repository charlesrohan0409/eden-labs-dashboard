import { LayoutDashboard, Users, Contact, FileText, Plug, Link2, HelpCircle, BarChart3, DollarSign, CalendarDays } from "lucide-react";
import Logo from "./Logo";

export const NAV_ITEMS = [
  { id: "home", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Users },
  { id: "finance-detail", label: "Finance", icon: DollarSign },
  { id: "crm", label: "CRM", icon: Contact },
  { id: "content", label: "Content", icon: FileText },
  { id: "performance", label: "Performance", icon: BarChart3 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "integrations", label: "Integrations", icon: Plug },
];

// Sub-views that should keep their parent nav item lit. Finance used to be
// one of these (reached only via the dashboard card); now it's a nav item in
// its own right, so it maps to itself and isNavActive's direct check covers it.
const PARENT_OF = {
  "growth-detail": "home",
  "client-detail": "clients",
};

export const isNavActive = (itemId, view) => view === itemId || PARENT_OF[view] === itemId;

export default function Sidebar({ view, setView, onPreviewPortal }) {
  return (
    <div className="hidden md:flex w-60 shrink-0 bg-night text-stone-300 min-h-screen flex-col sticky top-0 h-screen">
      <div className="px-4 py-6">
        <Logo size={34} tone="dark" />
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((it) => {
          const Icon = it.icon;
          const active = isNavActive(it.id, view);
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                active ? "bg-white/[0.08] text-white font-medium" : "text-stone-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Icon size={16} />
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 space-y-2">
        <button
          onClick={onPreviewPortal}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-stone-400 border border-white/10 rounded-xl py-2.5 hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          <Link2 size={13} /> Preview client portal
        </button>
        <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-stone-500">
          <HelpCircle size={13} /> Docs &amp; support
        </div>
      </div>
    </div>
  );
}
