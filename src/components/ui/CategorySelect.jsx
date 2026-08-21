import { useRef, useState } from "react";
import { categoryOptions } from "../../lib/finance";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Category picker with "create one right here".
 *
 * The alternative — a separate settings screen for managing categories — puts
 * the fix three navigations away from the moment you notice it's missing,
 * which in practice means everything ends up filed under "Other". Creating
 * inline costs one extra keystroke and keeps the vocabulary honest.
 *
 * The list is shared across expenses, budgets and recurring items on purpose:
 * a budget for "Software" is only meaningful if expenses use that exact
 * string, so three independent lists would quietly never match.
 */
export default function CategorySelect({
  value, onChange, categories, onAddCategory,
  className = "", label, id,
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const options = categoryOptions(categories, value);
  const base = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  const commit = () => {
    const name = draft.trim();
    if (!name) { setCreating(false); setDraft(""); return; }
    // Selecting is what the user actually wanted; persisting the new category
    // is a side effect. Both happen, but the select updates first so the form
    // is never briefly showing the old value.
    onChange(name);
    onAddCategory?.(name);
    setCreating(false);
    setDraft("");
  };

  if (creating) {
    return (
      <div className={className}>
        {label && <label className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</label>}
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              // Escape backs out without creating anything — an accidental
              // click on "New category" shouldn't trap you in this state.
              if (e.key === "Escape") { e.preventDefault(); setCreating(false); setDraft(""); }
            }}
            onBlur={commit}
            placeholder="Category name"
            className={base}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            className={`shrink-0 text-xs font-medium bg-emerald-800 text-white rounded-lg px-2.5
              transition-transform duration-150 ${EASE} active:scale-[0.96] hover:bg-emerald-900`}
          >
            Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {label && <label htmlFor={id} className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{label}</label>}
      <select
        id={id}
        className={base}
        value={value || ""}
        onChange={(e) => {
          if (e.target.value === "__new__") { setCreating(true); return; }
          onChange(e.target.value);
        }}
      >
        {!value && <option value="">Pick a category</option>}
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
        <option disabled>──────────</option>
        <option value="__new__">+ New category…</option>
      </select>
    </div>
  );
}
