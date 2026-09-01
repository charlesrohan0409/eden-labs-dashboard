import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, X, Check, ListPlus, Lock } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import { LINKEDIN_STAGES, EMAIL_STAGES } from "../../lib/outreach";
import { today } from "../../lib/utils";

// The client's own campaign controls.
//
// PortalOutreach next door is the analytics view — it reads. This is the
// half that was missing entirely: a client could see the funnel their
// outreach produced but had no way to create the list it ran against or log
// a day's numbers, while the SAME client session could already do both from
// the Chrome extension. That asymmetry is what this closes.
//
// Records the agency created stay read-only here. A list Eden Labs built
// carries their targeting thinking and the history hanging off it is their
// record of work delivered; the client edits what the client wrote.

const input = "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
const label = "block text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1";
const ghost = "text-[12px] border border-line rounded-lg px-2 py-1 inline-flex items-center gap-1 hover:border-stone-300 transition-colors";

export default function PortalCampaigns({
  lists = [], scripts = [], entries = [], channel = "linkedin",
  onAddList, onUpdateList, onDeleteList, onLogEntry, onUpdateEntry, onDeleteEntry,
}) {
  const [newList, setNewList] = useState(null);        // null = form closed
  const [editingList, setEditingList] = useState(null);
  const [logging, setLogging] = useState(false);
  const [entry, setEntry] = useState(() => blankEntry());

  const stages = channel === "email" ? EMAIL_STAGES : LINKEDIN_STAGES;
  function blankEntry() {
    return { date: today(), listId: "", scriptId: "", notes: "" };
  }

  const active = useMemo(() => lists.filter((l) => (l.status || "active") === "active"), [lists]);
  const mine = (r) => !!r.createdByClient;
  const recent = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8),
    [entries]
  );
  const listName = (id) => lists.find((l) => l.id === id)?.name || "Unassigned";

  const submitEntry = () => {
    const numbers = {};
    for (const s of stages) {
      const v = Number(entry[s.key]) || 0;
      if (v) numbers[s.key] = v;
    }
    // An entry of all zeroes is a row that says nothing and still shows up in
    // every average — refuse it rather than storing a silent distortion.
    if (!Object.keys(numbers).length) return;
    onLogEntry?.({
      date: entry.date || today(),
      listId: entry.listId || null,
      scriptId: entry.scriptId || null,
      notes: entry.notes || "",
      ...numbers,
    });
    setEntry(blankEntry());
    setLogging(false);
  };

  return (
    <div className="space-y-3">

      {/* ── lists ───────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <CardTitle sub={lists.length
            ? "The audiences your outreach runs against."
            : "No lists yet — make one and your numbers can be tracked against it."}>
            Lead lists
          </CardTitle>
          {!newList && (
            <button
              onClick={() => setNewList({ name: "", channel, niche: "" })}
              className="bg-night text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0 transition-transform active:scale-[0.97]"
            >
              <ListPlus size={13} /> New list
            </button>
          )}
        </div>

        {newList && (
          <div className="mb-4 pb-4 border-b border-line grid sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-1">
              <label className={label}>Name</label>
              <input
                className={input} autoFocus value={newList.name}
                placeholder="e.g. Mumbai founders"
                onChange={(e) => setNewList({ ...newList, name: e.target.value })}
              />
            </div>
            <div>
              <label className={label}>Channel</label>
              <select className={input} value={newList.channel} onChange={(e) => setNewList({ ...newList, channel: e.target.value })}>
                <option value="linkedin">LinkedIn</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className={label}>Who's on it</label>
              <input
                className={input} value={newList.niche}
                placeholder="e.g. seed-stage SaaS"
                onChange={(e) => setNewList({ ...newList, niche: e.target.value })}
              />
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <button
                disabled={!newList.name.trim()}
                onClick={() => { onAddList?.({ ...newList, name: newList.name.trim() }); setNewList(null); }}
                className="bg-night text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 transition-transform active:scale-[0.97]"
              >
                Create list
              </button>
              <button onClick={() => setNewList(null)} className={ghost}>Cancel</button>
            </div>
          </div>
        )}

        {!lists.length && !newList && (
          <p className="text-[13px] text-stone-400">Nothing here yet.</p>
        )}

        <div className="space-y-1.5">
          {lists.map((l) => {
            const editing = editingList?.id === l.id;
            if (editing) {
              return (
                <div key={l.id} className="grid sm:grid-cols-3 gap-2.5 py-2.5 border-b border-stone-100 last:border-0">
                  <input className={input} value={editingList.name} onChange={(e) => setEditingList({ ...editingList, name: e.target.value })} />
                  <input className={input} value={editingList.niche || ""} placeholder="Who's on it" onChange={(e) => setEditingList({ ...editingList, niche: e.target.value })} />
                  <div className="flex gap-1.5">
                    <select className={input} value={editingList.status || "active"} onChange={(e) => setEditingList({ ...editingList, status: e.target.value })}>
                      <option value="active">Running</option>
                      <option value="paused">Paused</option>
                      <option value="done">Finished</option>
                    </select>
                    <button
                      className={ghost}
                      onClick={() => {
                        onUpdateList?.(l.id, {
                          name: editingList.name.trim() || l.name,
                          niche: editingList.niche || "",
                          status: editingList.status || "active",
                        });
                        setEditingList(null);
                      }}
                    ><Check size={12} /></button>
                    <button className={ghost} onClick={() => setEditingList(null)}><X size={12} /></button>
                  </div>
                </div>
              );
            }
            return (
              <div key={l.id} className="flex items-center gap-2.5 py-2.5 border-b border-stone-100 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{l.name || "Untitled list"}</div>
                  <div className="text-[11.5px] text-stone-400">
                    {l.niche ? l.niche : mine(l) ? "No audience noted" : "Built by Eden Labs"}
                    {l.channel ? ` · ${l.channel === "email" ? "Email" : "LinkedIn"}` : ""}
                  </div>
                </div>
                <Badge tone={(l.status || "active") === "active" ? "emerald" : "stone"}>
                  {(l.status || "active") === "active" ? "Running" : l.status === "paused" ? "Paused" : "Finished"}
                </Badge>
                {mine(l) ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button className={ghost} title="Edit" onClick={() => setEditingList({ id: l.id, name: l.name || "", niche: l.niche || "", status: l.status || "active" })}>
                      <Pencil size={11} />
                    </button>
                    <button className={ghost} title="Delete" onClick={() => onDeleteList?.(l.id)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ) : (
                  <span className="text-stone-300 shrink-0" title="Set up by Eden Labs — ask them to change it">
                    <Lock size={12} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── log a day ───────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <CardTitle sub="Record what you sent, so the funnel above reflects your own activity too.">
            Log outreach
          </CardTitle>
          {!logging && (
            <button
              onClick={() => setLogging(true)}
              className="bg-night text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0 transition-transform active:scale-[0.97]"
            >
              <Plus size={13} /> Add numbers
            </button>
          )}
        </div>

        {logging && (
          <div className="mb-4 pb-4 border-b border-line space-y-2.5">
            <div className="grid sm:grid-cols-3 gap-2.5">
              <div>
                <label className={label}>Date</label>
                <input className={input} type="date" max={today()} value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} />
              </div>
              <div>
                <label className={label}>List</label>
                <select className={input} value={entry.listId} onChange={(e) => setEntry({ ...entry, listId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Script</label>
                <select className={input} value={entry.scriptId} onChange={(e) => setEntry({ ...entry, scriptId: e.target.value })} disabled={!scripts.length}>
                  <option value="">{scripts.length ? "None" : "No scripts yet"}</option>
                  {scripts.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {stages.map((s) => (
                <div key={s.key}>
                  <label className={label}>{s.label}</label>
                  <input
                    className={input} type="number" min="0" placeholder="0"
                    value={entry[s.key] ?? ""}
                    onChange={(e) => setEntry({ ...entry, [s.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className={label}>Note (optional)</label>
              <input className={input} value={entry.notes} placeholder="Anything worth remembering about this batch" onChange={(e) => setEntry({ ...entry, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={submitEntry} className="bg-night text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition-transform active:scale-[0.97]">
                Save
              </button>
              <button onClick={() => { setEntry(blankEntry()); setLogging(false); }} className={ghost}>Cancel</button>
            </div>
          </div>
        )}

        {!recent.length ? (
          <p className="text-[13px] text-stone-400">Nothing logged yet.</p>
        ) : (
          <div className="space-y-1">
            {recent.map((e) => {
              const nums = stages.filter((s) => Number(e[s.key]) > 0);
              return (
                <div key={e.id} className="flex items-start gap-2.5 py-2.5 border-b border-stone-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="tnum text-stone-500">{e.date}</span>
                      {nums.map((s) => (
                        <span key={s.key}><strong className="tnum font-semibold">{e[s.key]}</strong> <span className="text-stone-400">{s.label.toLowerCase()}</span></span>
                      ))}
                      {!nums.length && <span className="text-stone-400">no numbers</span>}
                    </div>
                    <div className="text-[11.5px] text-stone-400 mt-0.5">
                      {listName(e.listId)}{e.notes ? ` · ${e.notes}` : ""}
                    </div>
                  </div>
                  <button className={`${ghost} shrink-0`} title="Delete" onClick={() => onDeleteEntry?.(e.id)}>
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
