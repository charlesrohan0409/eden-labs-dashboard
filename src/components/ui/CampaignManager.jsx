import { useState } from "react";
import {
  Plus, Pencil, Trash2, Check, X, Copy, Target, MessageSquareText, Archive, RotateCcw,
} from "lucide-react";
import Card, { CardTitle } from "./Card";
import PillTabs from "./PillTabs";
import PrimaryButton from "./PrimaryButton";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const inputCls =
  "border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

/**
 * Create, rename, retire and delete lead lists and scripts.
 *
 * Scripts had no way in at all before this: the logger threaded an
 * onAddScript prop it never called, so data.scripts stayed empty forever —
 * which quietly killed one of the three diagnostics the whole feature is
 * built on, since "replies ÷ DMs blames the script" needs scripts to exist.
 *
 * Scripts hold their actual text so the one that worked can be reused rather
 * than half-remembered, and copied straight to the clipboard — the DM is
 * being written on LinkedIn, not here.
 */
export default function CampaignManager({
  clientId = null, lists, scripts,
  onAddList, onUpdateList, onDeleteList,
  onAddScript, onUpdateScript, onDeleteScript,
}) {
  const [tab, setTab] = useState("lists");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", niche: "", body: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", niche: "", body: "" });
  const [confirming, setConfirming] = useState(null);
  const [copied, setCopied] = useState(null);

  const mine = (arr) => (arr || []).filter((x) => (x.clientId || null) === (clientId || null));
  const myLists = mine(lists);
  const myScripts = mine(scripts);
  const isLists = tab === "lists";
  const rows = isLists ? myLists : myScripts;

  const reset = () => { setForm({ name: "", niche: "", body: "" }); setAdding(false); };

  const submitAdd = () => {
    if (!form.name.trim()) return;
    if (isLists) onAddList({ name: form.name.trim(), niche: form.niche.trim(), clientId });
    else onAddScript({ name: form.name.trim(), body: form.body, clientId });
    reset();
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditForm({ name: r.name || "", niche: r.niche || "", body: r.body || "" });
    setConfirming(null);
  };
  const submitEdit = () => {
    const patch = isLists
      ? { name: editForm.name.trim(), niche: editForm.niche.trim() }
      : { name: editForm.name.trim(), body: editForm.body };
    if (!patch.name) return;
    (isLists ? onUpdateList : onUpdateScript)(editingId, patch);
    setEditingId(null);
  };

  const copyBody = async (r) => {
    try {
      await navigator.clipboard.writeText(r.body || "");
      setCopied(r.id);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard blocked — the text is still visible to select */ }
  };

  return (
    <Card className="p-5">
      <CardTitle sub="A list is who you're targeting. A script is what you send them.">
        Campaigns
      </CardTitle>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <PillTabs
          value={tab}
          onChange={(v) => { setTab(v); setAdding(false); setEditingId(null); }}
          options={[
            { value: "lists", label: "Lead lists", count: myLists.length || undefined },
            { value: "scripts", label: "Scripts", count: myScripts.length || undefined },
          ]}
        />
        <PrimaryButton
          size="sm"
          variant={adding ? "ghost" : "primary"}
          icon={adding ? X : Plus}
          className="ml-auto"
          onClick={() => { setAdding(!adding); setEditingId(null); }}
        >
          {adding ? "Cancel" : isLists ? "New list" : "New script"}
        </PrimaryButton>
      </div>

      {adding && (
        <div className="rounded-xl bg-stone-50 border border-line p-3 mb-3 space-y-2 motion-safe:animate-fade-up">
          <input
            autoFocus
            placeholder={isLists ? "List name — e.g. Fractional CFOs, US" : "Script name — e.g. Value-first v1"}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && isLists) { e.preventDefault(); submitAdd(); } }}
            className={`${inputCls} w-full`}
          />
          {isLists ? (
            <input
              placeholder="Who's on it? (optional)"
              value={form.niche}
              onChange={(e) => setForm({ ...form, niche: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }}
              className={`${inputCls} w-full`}
            />
          ) : (
            <textarea
              rows={4}
              placeholder="The message you actually send…"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className={`${inputCls} w-full resize-none leading-relaxed`}
            />
          )}
          <PrimaryButton size="sm" icon={Plus} onClick={submitAdd} className="w-full">
            {isLists ? "Add list" : "Add script"}
          </PrimaryButton>
        </div>
      )}

      <div className="space-y-1">
        {rows.map((r) => {
          if (editingId === r.id) {
            return (
              <div key={r.id} className="rounded-xl bg-stone-50 border border-line p-3 space-y-2">
                <input
                  autoFocus value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={`${inputCls} w-full`}
                />
                {isLists ? (
                  <input
                    placeholder="Who's on it?"
                    value={editForm.niche}
                    onChange={(e) => setEditForm({ ...editForm, niche: e.target.value })}
                    className={`${inputCls} w-full`}
                  />
                ) : (
                  <textarea
                    rows={4} value={editForm.body}
                    onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                    className={`${inputCls} w-full resize-none leading-relaxed`}
                  />
                )}
                <div className="flex gap-1.5">
                  <PrimaryButton size="sm" icon={Check} onClick={submitEdit}>Save</PrimaryButton>
                  <PrimaryButton size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</PrimaryButton>
                </div>
              </div>
            );
          }

          const retired = r.status && r.status !== "active";
          return (
            <div key={r.id} className={`group py-2.5 border-b border-stone-100 last:border-0 ${retired ? "opacity-55" : ""}`}>
              <div className="flex items-center gap-2">
                {isLists
                  ? <Target size={13} className="text-sky-600 shrink-0" />
                  : <MessageSquareText size={13} className="text-violet-600 shrink-0" />}
                <span className="text-[13.5px] text-stone-800 truncate flex-1 min-w-0">{r.name}</span>
                {retired && <span className="text-[10px] text-stone-400 shrink-0">retired</span>}

                <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  {!isLists && r.body && (
                    <button
                      onClick={() => copyBody(r)}
                      aria-label="Copy script"
                      title="Copy to clipboard"
                      className={`p-1 ${copied === r.id ? "text-emerald-600" : "text-stone-300 hover:text-stone-600"}
                        transition-transform duration-150 ${EASE} active:scale-[0.9]`}
                    >
                      {copied === r.id ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  )}
                  <button
                    onClick={() => (isLists ? onUpdateList : onUpdateScript)(r.id, { status: retired ? "active" : isLists ? "done" : "retired" })}
                    aria-label={retired ? "Reactivate" : "Retire"}
                    title={retired ? "Bring back" : "Retire — keeps its history, hides it from pickers"}
                    className="p-1 text-stone-300 hover:text-stone-600"
                  >
                    {retired ? <RotateCcw size={13} /> : <Archive size={13} />}
                  </button>
                  <button onClick={() => startEdit(r)} aria-label="Edit" className="p-1 text-stone-300 hover:text-stone-600">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => setConfirming(confirming === r.id ? null : r.id)}
                    aria-label="Delete"
                    className="p-1 text-stone-300 hover:text-rose-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {isLists && r.niche && (
                <div className="text-[11.5px] text-stone-400 mt-0.5 pl-5 truncate">{r.niche}</div>
              )}
              {!isLists && r.body && (
                <div className="text-[11.5px] text-stone-500 mt-1 pl-5 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                  {r.body}
                </div>
              )}

              {confirming === r.id && (
                <div className="mt-2 ml-5 rounded-lg bg-stone-50 border border-line p-2.5 motion-safe:animate-fade-up">
                  <p className="text-[12px] text-stone-600 mb-2">
                    Delete "{r.name}"? Entries logged against it stay, but lose the link —
                    they'd show as Unassigned and stop being diagnosable.
                    {" "}Retiring keeps the history and just hides it from the pickers.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => { (isLists ? onDeleteList : onDeleteScript)(r.id); setConfirming(null); }}
                      className={`text-[12px] font-medium bg-rose-600 text-white rounded-lg px-2.5 py-1
                        transition-transform duration-150 ${EASE} active:scale-[0.96]`}
                    >
                      Delete anyway
                    </button>
                    <button onClick={() => setConfirming(null)} className="text-[12px] text-stone-500 px-1">
                      Keep
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {rows.length === 0 && !adding && (
          <div className="text-center py-7">
            <div className="text-[13.5px] font-medium text-stone-700">
              {isLists ? "No lead lists yet" : "No scripts yet"}
            </div>
            <p className="text-[12.5px] text-stone-500 mt-1 max-w-xs mx-auto leading-relaxed">
              {isLists
                ? "Naming who you're targeting is what lets the app tell you a list is bad, rather than just that something is."
                : "Save the message you send and the app can tell you which one actually gets replies."}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
