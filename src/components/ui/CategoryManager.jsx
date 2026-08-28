import { useMemo, useState } from "react";
import { Pencil, Trash2, Check, X, Tag, AlertTriangle } from "lucide-react";
import Card, { CardTitle } from "./Card";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const inputCls =
  "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

/**
 * Rename and remove expense categories.
 *
 * Both mutations already existed and cascade correctly — renaming rewrites
 * every expense, subscription and budget using the old name — but nothing in
 * the UI reached them. So a category could be created and never corrected: a
 * typo was permanent, and the picker only ever grew.
 *
 * Deleting shows the usage count first, because a category in use isn't
 * really removable — the records keep the old string and would drop out of
 * every budget that matched it. Renaming is offered as the safer action.
 */
export default function CategoryManager({ categories, expenses, outgoings, budgets, onRename, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(null);

  const usage = useMemo(() => {
    const count = {};
    (categories || []).forEach((c) => { count[c] = 0; });
    [...(expenses || []), ...(outgoings || []), ...(budgets || [])].forEach((r) => {
      if (r?.category && count[r.category] != null) count[r.category] += 1;
    });
    return count;
  }, [categories, expenses, outgoings, budgets]);

  const commit = (from) => {
    const to = draft.trim();
    if (to && to !== from) onRename(from, to);
    setEditing(null);
    setDraft("");
  };

  return (
    <Card className="p-5">
      <CardTitle sub="Renaming updates every expense, subscription and budget using it">
        <span className="flex items-center gap-2"><Tag size={15} className="text-violet-600" /> Categories</span>
      </CardTitle>

      <div className="space-y-0.5">
        {(categories || []).map((c) => {
          const used = usage[c] || 0;
          if (editing === c) {
            return (
              <div key={c} className="flex items-center gap-1.5 py-1.5">
                <input
                  autoFocus value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commit(c); }
                    if (e.key === "Escape") { setEditing(null); setDraft(""); }
                  }}
                  className={`${inputCls} flex-1`}
                />
                <button onClick={() => commit(c)} aria-label="Save"
                  className={`p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-transform duration-150 ${EASE} active:scale-[0.94]`}>
                  <Check size={14} />
                </button>
                <button onClick={() => { setEditing(null); setDraft(""); }} aria-label="Cancel"
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg">
                  <X size={14} />
                </button>
              </div>
            );
          }
          return (
            <div key={c} className="group flex items-center gap-2 py-1.5 border-b border-stone-100 last:border-0">
              <span className="text-[13.5px] text-stone-700 flex-1 min-w-0 truncate">{c}</span>
              <span className="text-[11px] text-stone-300 tabular-nums shrink-0">
                {used === 0 ? "unused" : `${used} in use`}
              </span>
              <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                <button
                  onClick={() => { setEditing(c); setDraft(c); setConfirming(null); }}
                  aria-label={`Rename ${c}`}
                  className="p-1 text-stone-300 hover:text-stone-600"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setConfirming(confirming === c ? null : c)}
                  aria-label={`Remove ${c}`}
                  className="p-1 text-stone-300 hover:text-rose-500"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {confirming === c && (
                <div className="w-full basis-full mt-1.5 rounded-lg bg-stone-50 border border-line p-2.5 motion-safe:animate-fade-up">
                  {used > 0 ? (
                    <div className="flex items-start gap-2 text-[12px] text-amber-800">
                      <AlertTriangle size={13} className="shrink-0 mt-px" />
                      <span>
                        {used} record{used === 1 ? "" : "s"} still use "{c}". Removing it leaves them
                        with a category that's no longer in any picker, and any budget on it stops
                        matching. Rename it instead.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] text-stone-600">Remove "{c}"?</span>
                      <button
                        onClick={() => { onDelete(c); setConfirming(null); }}
                        className={`text-[12px] font-medium bg-rose-600 text-white rounded-lg px-2.5 py-1
                          transition-transform duration-150 ${EASE} active:scale-[0.96]`}
                      >
                        Remove
                      </button>
                      <button onClick={() => setConfirming(null)} className="text-[12px] text-stone-500 px-1">
                        Keep
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(categories || []).length === 0 && (
          <div className="text-xs text-stone-400 py-4 text-center">
            No categories yet — add one from any category picker.
          </div>
        )}
      </div>
    </Card>
  );
}
