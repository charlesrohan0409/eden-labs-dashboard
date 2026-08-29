import { useMemo, useState } from "react";
import { Plus, X, UserPlus, StickyNote, Check } from "lucide-react";
import Card, { CardTitle } from "./Card";
import PrimaryButton from "./PrimaryButton";
import { LINKEDIN_STAGES } from "../../lib/outreach";
import { workToday } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const inputCls =
  "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

const BLANK = () => ({
  // null = untouched (fall back to the only list); "" = deliberately unassigned.
  date: workToday(), listId: null, scriptId: null, notes: "",
  ...Object.fromEntries(LINKEDIN_STAGES.map((s) => [s.key, ""])),
});

/**
 * The form that replaces the spreadsheet.
 *
 * Two things it does that a spreadsheet row can't:
 *
 *  - It attaches every entry to a LEAD LIST and a SCRIPT. Without those, a
 *    low acceptance rate is just a number; with them it names which list to
 *    drop and which script to keep.
 *  - It takes the NAMES of whoever replied, in the same form, at the moment
 *    you type the number. Capturing them later never happens, and capturing
 *    all 200 people you contacted is both useless and expensive — the ones
 *    who wrote back are the only ones worth a record.
 */
export default function OutreachLogger({
  clientId = null, lists, scripts, onAdd, onAddList, onAddScript,
}) {
  const [f, setF] = useState(BLANK);
  const [replied, setReplied] = useState([]);
  const [saved, setSaved] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [addingList, setAddingList] = useState(false);

  // Only this owner's / client's own campaigns, and retired ones stay out of
  // the picker while remaining valid on historic entries.
  const myLists = useMemo(
    () => (lists || []).filter((l) => (l.clientId || null) === (clientId || null) && l.status === "active"),
    [lists, clientId]
  );
  const myScripts = useMemo(
    () => (scripts || []).filter((s) => (s.clientId || null) === (clientId || null) && s.status === "active"),
    [scripts, clientId]
  );

  // Default to the only list when there is one — most days there is — but
  // only until the field is TOUCHED. Deriving with `||` meant picking
  // "Unassigned" set f.listId to "" and the fallback immediately re-applied
  // the single list, so the select snapped back and every entry was
  // force-attributed. Untouched is null; "" is a real, chosen, empty answer.
  const listId = f.listId ?? (myLists.length === 1 ? myLists[0].id : "");
  const scriptId = f.scriptId ?? (myScripts.length === 1 ? myScripts[0].id : "");

  const num = (k) => Number(f[k]) || 0;
  const repliedCount = num("linkedinReplied");
  const hasAnything = LINKEDIN_STAGES.some((s) => num(s.key) > 0);

  const submit = () => {
    if (!hasAnything) return;
    const entry = {
      clientId, date: f.date || workToday(), listId: listId || null,
      scriptId: scriptId || null, notes: f.notes.trim(),
      ...Object.fromEntries(LINKEDIN_STAGES.map((s) => [s.key, num(s.key)])),
    };
    onAdd(entry, replied.filter((r) => r.trim()));
    setF(BLANK());
    setReplied([]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const createList = () => {
    if (!newListName.trim()) return;
    onAddList({ name: newListName.trim(), clientId });
    setNewListName("");
    setAddingList(false);
  };

  return (
    <Card className="p-5">
      <CardTitle sub="One entry per list. Log the same day twice if you worked two lists.">
        Log outreach
      </CardTitle>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Date</span>
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={`${inputCls} w-full`} />
          </label>
          <label className="block">
            <span className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Script used</span>
            <select value={scriptId} onChange={(e) => setF({ ...f, scriptId: e.target.value })} className={`${inputCls} w-full`}>
              <option value="">No script</option>
              {myScripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>

        <div>
          <span className="block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Lead list</span>
          {addingList ? (
            <div className="flex gap-1.5">
              <input
                autoFocus placeholder="e.g. Fractional CFOs — US"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); createList(); }
                  if (e.key === "Escape") { setAddingList(false); setNewListName(""); }
                }}
                className={`${inputCls} flex-1`}
              />
              <button onClick={createList}
                className={`shrink-0 text-xs font-medium bg-emerald-800 text-white rounded-lg px-3
                  transition-transform duration-150 ${EASE} active:scale-[0.96]`}>
                Add
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <select value={listId} onChange={(e) => setF({ ...f, listId: e.target.value })} className={`${inputCls} flex-1`}>
                <option value="">Unassigned</option>
                {myLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button
                onClick={() => setAddingList(true)}
                title="New lead list"
                className={`shrink-0 text-xs font-medium text-stone-600 border border-line rounded-lg px-2.5
                  hover:bg-stone-50 transition-[transform,background-color] duration-150 ${EASE} active:scale-[0.96]`}
              >
                <Plus size={13} />
              </button>
            </div>
          )}
          {!listId && myLists.length > 0 && (
            <p className="text-[11px] text-amber-600 mt-1">
              Without a list this entry counts toward totals but can't be diagnosed.
            </p>
          )}
        </div>

        {/* The funnel, in order. Reading top to bottom is the same order the
            events actually happen in, which is what makes a gap obvious. */}
        <div className="space-y-1.5 pt-1">
          {LINKEDIN_STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2.5">
              <span className="w-4 text-[10px] text-stone-300 tabular-nums shrink-0">{i + 1}</span>
              <span className="text-[13px] text-stone-600 flex-1 min-w-0 truncate">{s.label}</span>
              <input
                type="number" min="0" placeholder="0"
                value={f[s.key]}
                onChange={(e) => setF({ ...f, [s.key]: e.target.value })}
                className={`${inputCls} w-20 text-right tabular-nums`}
              />
            </div>
          ))}
        </div>

        {/* Names appear the moment a reply count is entered — the one place
            they can be captured without it becoming a separate chore. */}
        {repliedCount > 0 && (
          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3 motion-safe:animate-fade-up">
            <div className="flex items-center gap-1.5 mb-2">
              <UserPlus size={13} className="text-emerald-700" />
              <span className="text-[12px] font-medium text-emerald-900">
                Who replied? ({replied.filter((r) => r.trim()).length} of {repliedCount})
              </span>
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: repliedCount }).map((_, i) => (
                <input
                  key={i}
                  placeholder={`Name${i === 0 ? "  ·  or  Name | Company" : ""}`}
                  value={replied[i] || ""}
                  onChange={(e) => {
                    const next = [...replied];
                    next[i] = e.target.value;
                    setReplied(next);
                  }}
                  className={`${inputCls} w-full bg-white`}
                />
              ))}
            </div>
            <p className="text-[11px] text-emerald-800/70 mt-2">
              Each name becomes a lead in your CRM, tagged to this list and script.
              Leave blank to just count them.
            </p>
          </div>
        )}

        <label className="block">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
            <StickyNote size={11} /> Notes
          </span>
          <textarea
            rows={2}
            placeholder="What you tried, what you noticed"
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            className={`${inputCls} w-full resize-none leading-relaxed`}
          />
        </label>

        <PrimaryButton
          className="w-full"
          icon={saved ? Check : Plus}
          onClick={submit}
          disabled={!hasAnything}
        >
          {saved ? "Logged" : "Log entry"}
        </PrimaryButton>
      </div>
    </Card>
  );
}
