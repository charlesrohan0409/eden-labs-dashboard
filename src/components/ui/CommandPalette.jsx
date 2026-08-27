import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, ArrowRight, LayoutGrid, Users, DollarSign, Target,
  FileText, BarChart3, Calendar, Plug, CornerDownLeft,
} from "lucide-react";
import Avatar from "./Avatar";

const PAGES = [
  { id: "home",         label: "Dashboard",    icon: LayoutGrid,  keywords: "home overview today" },
  { id: "clients",      label: "Clients",      icon: Users,       keywords: "customers accounts" },
  { id: "finance",      label: "Finance",      icon: DollarSign,  keywords: "money invoices expenses budget revenue" },
  { id: "crm",          label: "CRM",          icon: Target,      keywords: "leads pipeline deals contacts" },
  { id: "content",      label: "Content",      icon: FileText,    keywords: "posts board write compose analytics" },
  { id: "growth",       label: "Performance",  icon: BarChart3,   keywords: "growth outreach metrics" },
  { id: "calendar",     label: "Calendar",     icon: Calendar,    keywords: "schedule meetings" },
  { id: "integrations", label: "Integrations", icon: Plug,        keywords: "buffer fathom settings api" },
];

/**
 * ⌘K. The dashboard is organised by nouns (Clients, Finance, Content) but the
 * work is verbs — write a post, log an expense, check a client. This is the
 * shortest path from "I want to do X" to doing it, without learning where X
 * lives in the navigation.
 *
 * Deliberately NOT animated on open/close. This is the single most frequently
 * triggered surface in the app, and animation on a keyboard action that fires
 * dozens of times a day reads as lag — the interface feeling slower is a
 * worse cost than the transition being nice. (Raycast does the same.)
 */
export default function CommandPalette({ open, onClose, data, setView, setSelectedClient, onQuickAdd }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    // rAF rather than a bare focus() — the input doesn't exist until this
    // render is painted. Cancelled on close so a rapid toggle can't focus
    // an input that's already gone.
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const commands = useMemo(() => {
    const out = [];

    PAGES.forEach((p) => out.push({
      id: `page-${p.id}`, group: "Go to", label: p.label, icon: p.icon,
      keywords: p.keywords,
      run: () => { setView(p.id); },
    }));

    out.push({
      id: "action-task", group: "Create", label: "Add a task", icon: CornerDownLeft,
      keywords: "new todo task",
      run: () => onQuickAdd?.(),
    });
    out.push({
      id: "action-post", group: "Create", label: "Write a post", icon: FileText,
      keywords: "new content compose draft linkedin",
      run: () => { setView("content"); },
    });

    // Clients are the thing most often jumped to by name — a name is the
    // fastest possible query, and typing it should beat three clicks.
    (data?.clients || []).filter((c) => !c.hidden).forEach((c) => out.push({
      id: `client-${c.id}`, group: "Clients", label: c.name, sub: c.company,
      avatar: c, keywords: `${c.name} ${c.company || ""}`,
      run: () => { setSelectedClient(c.id); setView("client-detail"); },
    }));

    return out;
  }, [data, setView, setSelectedClient, onQuickAdd]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 12);
    return commands
      .map((c) => {
        const hay = `${c.label} ${c.sub || ""} ${c.keywords || ""}`.toLowerCase();
        const idx = hay.indexOf(q);
        if (idx === -1) return null;
        // A prefix match on the label itself is what the user almost always
        // means; rank it above an incidental keyword hit.
        const score = c.label.toLowerCase().startsWith(q) ? 0 : idx;
        return { ...c, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12);
  }, [query, commands]);

  useEffect(() => { setActive(0); }, [query]);

  // Keep the highlighted row in view when navigating by keyboard.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (cmd) => {
    if (!cmd) return;
    cmd.run();
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % Math.max(1, results.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + results.length) % Math.max(1, results.length)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  // Grouped for rendering, but the flat `results` order is what the keyboard
  // walks — otherwise arrow keys and the visible order disagree.
  let cursor = -1;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/25 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-line overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 border-b border-line">
          <Search size={16} className="text-stone-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to…"
            className="flex-1 py-3.5 text-sm bg-transparent outline-none placeholder:text-stone-300"
          />
          <kbd className="text-[10px] text-stone-400 bg-stone-100 rounded px-1.5 py-0.5 shrink-0">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-stone-300">Nothing matches "{query}".</div>
          )}
          {["Go to", "Create", "Clients"].map((group) => {
            const items = results.filter((r) => r.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <div className="px-4 pt-2 pb-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide">
                  {group}
                </div>
                {items.map((cmd) => {
                  cursor += 1;
                  const idx = cursor;
                  const Icon = cmd.icon;
                  const isActive = idx === active;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => choose(cmd)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors duration-100 ${
                        isActive ? "bg-stone-100" : ""
                      }`}
                    >
                      {cmd.avatar
                        ? <Avatar name={cmd.avatar.name} photoUrl={cmd.avatar.photoUrl} size={22} />
                        : <span className="w-[22px] flex justify-center text-stone-400"><Icon size={14} /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-stone-800 truncate">{cmd.label}</span>
                        {cmd.sub && <span className="block text-[11px] text-stone-400 truncate">{cmd.sub}</span>}
                      </span>
                      {isActive && <ArrowRight size={13} className="text-stone-300 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
