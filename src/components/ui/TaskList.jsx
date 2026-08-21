import { useMemo, useRef, useState } from "react";
import {
  Check, Plus, Trash2, CalendarDays, X, Pencil, Repeat, GripVertical,
  ChevronUp, ChevronDown, ChevronRight, AlignLeft, ArrowDownUp, CalendarArrowUp,
} from "lucide-react";
import Card from "./Card";
import Badge from "./Badge";
import PillTabs from "./PillTabs";
import PrimaryButton from "./PrimaryButton";
import { relativeDays, today } from "../../lib/utils";
import { nextOccurrenceFor } from "../../lib/recurrence";
import { TASK_CATEGORY_LIST, categoryMeta } from "../../lib/tasks";

const PRIORITY = {
  high: { label: "High", tone: "rose", dot: "bg-rose-500" },
  medium: { label: "Medium", tone: "amber", dot: "bg-amber-500" },
  low: { label: "Low", tone: "stone", dot: "bg-stone-300" },
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Strong ease-out — the built-in CSS easings are too weak to read as
// intentional at these durations.
// Tomorrow, from today — never from the task's own (possibly long past) due
// date, or "push to tomorrow" on an overdue task would land in the past.
const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const BLANK_FORM = { title: "", clientId: "", dueDate: "", priority: "medium", recurrence: "none", category: "", description: "" };

/**
 * To-do list shown on the main dashboard and, scoped to one client, on the
 * client detail page. Pass `clientId` to lock every new task to that client
 * and hide the client picker.
 *
 * Ordering is manual (drag, or the arrow buttons on touch) and persisted via
 * onReorder. Overdue tasks always pin to the top regardless of manual order —
 * an overdue list is a triage list, and manual ordering shouldn't be able to
 * bury something that's already late.
 */
export default function TaskList({
  tasks, clients, onAdd, onToggle, onDelete, onUpdate, onReorder,
  clientId = undefined, title = "Tasks",
}) {
  const scoped = clientId === undefined ? tasks : tasks.filter((t) => t.clientId === clientId);
  const [filter, setFilter] = useState("open");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM, clientId: clientId ?? "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(BLANK_FORM);
  const [expandedId, setExpandedId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, pos: "before" | "after" }
  const dragCleanup = useRef(null);

  const client = (id) => clients.find((c) => c.id === id);
  const clientName = (id) => client(id)?.name;

  const visible = useMemo(() => {
    const list = scoped.filter((t) => {
      if (categoryFilter !== "all" && (t.category || "") !== categoryFilter) return false;
      if (filter === "done") return t.done;
      // Upcoming is checked BEFORE the done-exclusion below, deliberately: a
      // recurring task you've already ticked off is exactly the one you want
      // here, because what it tells you is when it comes back. Filtering it
      // out as "done" would leave this view empty precisely when you're on
      // top of everything.
      if (filter === "upcoming") {
        if (t.recurrence && t.recurrence !== "none") return true;
        if (t.done) return false;
        const r = relativeDays(t.dueDate);
        return r && r.days > 0;
      }
      if (t.done) return false;
      if (filter === "today") {
        const r = relativeDays(t.dueDate);
        return r && r.days <= 0;
      }
      return true;
    });

    if (filter === "upcoming") {
      // Soonest first — the dates are the whole point of this view.
      return list.sort((a, b) => {
        const an = nextOccurrenceFor(a) || "9999-12-31";
        const bn = nextOccurrenceFor(b) || "9999-12-31";
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
    }

    // Overdue first (oldest-overdue first within that group), then manual
    // order, then date/priority as a tiebreak for equal sortIndex.
    return list.sort((a, b) => {
      const ao = relativeDays(a.dueDate)?.overdue ? 0 : 1;
      const bo = relativeDays(b.dueDate)?.overdue ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (ao === 0) {
        const ad = a.dueDate || "9999-12-31";
        const bd = b.dueDate || "9999-12-31";
        if (ad !== bd) return ad < bd ? -1 : 1;
      }
      const ai = a.sortIndex ?? 0;
      const bi = b.sortIndex ?? 0;
      if (ai !== bi) return ai - bi;
      const ad = a.dueDate || "9999-12-31";
      const bd = b.dueDate || "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    });
  }, [scoped, filter, categoryFilter]);

  const openCount = scoped.filter((t) => !t.done).length;
  const dueTodayCount = scoped.filter((t) => {
    if (t.done) return false;
    const r = relativeDays(t.dueDate);
    return r && r.days <= 0;
  }).length;
  const repeatCount = scoped.filter((t) => t.recurrence && t.recurrence !== "none").length;

  // Reordering only makes sense in a manually-ordered view — Upcoming is
  // sorted by date and Done is history.
  const canReorder = !!onReorder && filter !== "upcoming" && filter !== "done";

  const payloadFrom = (f) => ({
    title: f.title.trim(),
    clientId: f.clientId || null,
    dueDate: f.dueDate,
    priority: f.priority,
    recurrence: f.recurrence,
    category: f.category,
    description: f.description.trim(),
  });

  const submit = () => {
    if (!form.title.trim()) return;
    onAdd(payloadFrom(form));
    setForm({ ...BLANK_FORM, clientId: clientId ?? "" });
    setAdding(false);
  };

  const startEdit = (t) => {
    setEditForm({
      title: t.title, clientId: t.clientId || "", dueDate: t.dueDate || "",
      priority: t.priority || "medium", recurrence: t.recurrence || "none",
      category: t.category || "", description: t.description || "",
    });
    setEditingId(t.id);
    setAdding(false);
  };
  const submitEdit = () => {
    if (!editForm.title.trim()) return;
    onUpdate(editingId, payloadFrom(editForm));
    setEditingId(null);
  };

  // ---- reordering ----
  const applyOrder = (ids) => onReorder?.(ids);

  // Arrow buttons: the touch and keyboard path, since HTML5 drag-and-drop
  // does nothing on a touchscreen.
  const nudge = (id, delta) => {
    const ids = visible.map((t) => t.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    applyOrder(ids);
  };

  const clearDrag = () => { setDraggingId(null); setDropTarget(null); };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    // The id rides on the event itself; draggingId is for styling and may not
    // have flushed yet.
    const draggedId = e.dataTransfer.getData("text/plain") || draggingId;
    const pos = dropTarget?.id === targetId ? dropTarget.pos : "before";
    clearDrag();
    if (!draggedId || draggedId === targetId) return;
    const ids = visible.map((t) => t.id);
    if (!ids.includes(draggedId) || !ids.includes(targetId)) return;
    const without = ids.filter((id) => id !== draggedId);
    // Recomputed AFTER removing the dragged id, since pulling it out shifts
    // everything below it.
    const at = without.indexOf(targetId) + (pos === "after" ? 1 : 0);
    without.splice(at, 0, draggedId);
    applyOrder(without);
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  // Shared field block for the add and edit forms.
  const FormFields = ({ f, setF, onSubmit, submitLabel, onCancel }) => (
    <div className="space-y-2">
      <input
        autoFocus
        placeholder="What needs doing?"
        value={f.title}
        onChange={(e) => setF({ ...f, title: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        className={`${inputCls} w-full`}
      />
      <textarea
        placeholder="Notes (optional) — anything you'd forget by tomorrow"
        value={f.description}
        onChange={(e) => setF({ ...f, description: e.target.value })}
        rows={2}
        className={`${inputCls} w-full resize-none leading-relaxed`}
      />
      <div className="flex gap-2 flex-wrap">
        {clientId === undefined && (
          <select
            value={f.clientId}
            onChange={(e) => setF({ ...f, clientId: e.target.value })}
            className={`${inputCls} flex-1 min-w-[9rem]`}
          >
            <option value="">Eden Labs (internal)</option>
            {clients.filter((x) => !x.hidden).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <select
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
          className={`${inputCls} w-36`}
        >
          <option value="">No category</option>
          {TASK_CATEGORY_LIST.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={f.dueDate}
          onChange={(e) => setF({ ...f, dueDate: e.target.value })}
          className={`${inputCls} flex-1 min-w-[9rem]`}
        />
        <select
          value={f.priority}
          onChange={(e) => setF({ ...f, priority: e.target.value })}
          className={`${inputCls} w-28`}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={f.recurrence}
          onChange={(e) => setF({ ...f, recurrence: e.target.value })}
          className={`${inputCls} w-36`}
        >
          <option value="none">Doesn't repeat</option>
          <option value="daily">Repeats daily</option>
          <option value="weekly">Repeats weekly</option>
        </select>
        <PrimaryButton onClick={onSubmit}>{submitLabel}</PrimaryButton>
        {onCancel && <PrimaryButton variant="ghost" onClick={onCancel}>Cancel</PrimaryButton>}
      </div>
    </div>
  );

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight">{title}</div>
          {dueTodayCount > 0 && <Badge tone="rose" dot>{dueTodayCount} due</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <PillTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open", count: openCount },
              { value: "today", label: "Due" },
              { value: "upcoming", label: "Upcoming", count: repeatCount || undefined },
              { value: "done", label: "Done" },
            ]}
          />
          <PrimaryButton
            size="sm"
            variant={adding ? "ghost" : "primary"}
            icon={adding ? X : Plus}
            onClick={() => { setAdding(!adding); setEditingId(null); }}
          >
            {adding ? "Cancel" : "Add"}
          </PrimaryButton>
        </div>
      </div>

      {/* Category filter — a second, independent axis from the Open/Due tabs
          above, because "what kind of work" and "how urgent" are different
          questions. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {[{ id: "all", label: "All work" }, ...TASK_CATEGORY_LIST].map((c) => {
          const active = categoryFilter === c.id;
          const meta = categoryMeta(c.id);
          return (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors active:scale-[0.97] ${EASE} ${
                active
                  ? "bg-stone-800 border-stone-800 text-white"
                  : "bg-white border-line text-stone-500 hover:border-stone-300"
              }`}
            >
              {meta && <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white/70" : meta.dot}`} />}
              {c.label}
            </button>
          );
        })}
        {canReorder && visible.length > 1 && (
          <button
            onClick={() => {
              // Resets manual order back to date-then-priority — the old
              // default, available as a one-off action rather than a mode
              // you have to remember you're in.
              const byDate = [...visible].sort((a, b) => {
                const ad = a.dueDate || "9999-12-31";
                const bd = b.dueDate || "9999-12-31";
                if (ad !== bd) return ad < bd ? -1 : 1;
                return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
              });
              applyOrder(byDate.map((t) => t.id));
            }}
            title="Reset manual order to date, then priority"
            className={`ml-auto inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700 transition-colors active:scale-[0.97] ${EASE}`}
          >
            <ArrowDownUp size={12} /> Sort by date
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl bg-stone-50 border border-line p-3 mb-4">
          <FormFields f={form} setF={setForm} onSubmit={submit} submitLabel="Add task" />
        </div>
      )}

      <div className="space-y-0.5">
        {visible.map((t, idx) => {
          const isUpcoming = filter === "upcoming";
          const shownDate = isUpcoming ? nextOccurrenceFor(t) : t.dueDate;
          const due = relativeDays(shownDate);
          const p = PRIORITY[t.priority] || PRIORITY.medium;
          const cat = categoryMeta(t.category);
          const owner = t.clientId ? client(t.clientId) : null;
          const expanded = expandedId === t.id;
          const isDropTarget = dropTarget?.id === t.id;

          if (editingId === t.id) {
            return (
              <div key={t.id} className="rounded-xl bg-stone-50 border border-line p-3 my-1">
                <FormFields
                  f={editForm} setF={setEditForm} onSubmit={submitEdit}
                  submitLabel="Save" onCancel={() => setEditingId(null)}
                />
              </div>
            );
          }

          return (
            <div
              key={t.id}
              draggable={canReorder}
              onDragStart={(e) => {
                if (!canReorder) return;
                e.dataTransfer.effectAllowed = "move";
                // Firefox won't start a drag without data set.
                e.dataTransfer.setData("text/plain", t.id);
                setDraggingId(t.id);
              }}
              onDragEnd={clearDrag}
              onDragOver={(e) => {
                if (!canReorder || !draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                // Which half of the row the pointer is over decides whether
                // the dragged task lands above or below it.
                const box = e.currentTarget.getBoundingClientRect();
                const pos = e.clientY < box.top + box.height / 2 ? "before" : "after";
                if (dropTarget?.id !== t.id || dropTarget?.pos !== pos) setDropTarget({ id: t.id, pos });
              }}
              onDragLeave={() => { if (dropTarget?.id === t.id) setDropTarget(null); }}
              onDrop={(e) => handleDrop(e, t.id)}
              className={`group relative flex items-start gap-2.5 py-2.5 px-2 -mx-2 rounded-lg transition-[background-color,opacity,transform] duration-150 ${EASE} ${
                draggingId === t.id ? "opacity-40 scale-[0.99]" : "hover:bg-stone-50"
              }`}
            >
              {/* Drop indicator — a hairline where the task will land. */}
              {isDropTarget && draggingId !== t.id && (
                <span
                  className={`absolute left-2 right-2 h-0.5 rounded-full bg-emerald-600 ${
                    dropTarget.pos === "before" ? "-top-px" : "-bottom-px"
                  }`}
                />
              )}

              {canReorder && (
                <span
                  className="hidden sm:flex items-center self-stretch -ml-1 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
                  title="Drag to reorder"
                >
                  <GripVertical size={13} />
                </span>
              )}

              <button
                onClick={() => onToggle(t.id)}
                aria-label={t.done ? "Mark task as not done" : "Mark task as done"}
                className={`mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors active:scale-[0.94] ${EASE} ${
                  t.done
                    ? "bg-emerald-700 border-emerald-700 text-white"
                    : "border-stone-300 hover:border-emerald-600 bg-white"
                }`}
              >
                {t.done && <Check size={12} strokeWidth={3} />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm leading-snug ${t.done ? "text-stone-400 line-through" : "text-stone-800"}`}>
                    {t.title}
                  </span>
                  {t.recurrence && t.recurrence !== "none" && (
                    <Repeat size={11} className="text-stone-300 shrink-0" title={`Repeats ${t.recurrence}`} />
                  )}
                  {t.description && (
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      aria-label={expanded ? "Hide notes" : "Show notes"}
                      className="inline-flex items-center text-stone-300 hover:text-stone-600 transition-colors shrink-0"
                    >
                      <ChevronRight
                        size={13}
                        className={`transition-transform duration-150 ${EASE} ${expanded ? "rotate-90" : ""}`}
                      />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {!t.done && <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} title={`${p.label} priority`} />}

                  {/* Who the work is for. Shown even on a client-scoped list
                      when it's agency work, so an internal task sitting in a
                      client's list never looks like client work. */}
                  {(clientId === undefined || !t.clientId) && (
                    owner ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full pl-0.5 pr-2 py-0.5 bg-white ring-1 ring-stone-200 text-stone-600">
                        {owner.photoUrl || owner.logoUrl ? (
                          <img
                            src={owner.photoUrl || owner.logoUrl}
                            alt=""
                            className="w-3.5 h-3.5 rounded-full object-cover"
                          />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full bg-stone-200" />
                        )}
                        {owner.name.split(" ")[0]}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 bg-gradient-to-b from-stone-700 to-stone-900 text-white/90 ring-1 ring-stone-900/20">
                        Eden Labs
                      </span>
                    )
                  )}

                  {cat && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 ring-1 ${cat.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                      {cat.label}
                    </span>
                  )}

                  {/* In Upcoming the date is shown even for a completed
                      recurring task — "when does this come back" is the whole
                      question that view answers. Everywhere else a done task's
                      due date is just noise. */}
                  {due && (!t.done || isUpcoming) && (
                    <span
                      className={`text-[11px] inline-flex items-center gap-1 ${
                        due.overdue ? "text-rose-600 font-medium" : due.soon ? "text-amber-600" : "text-stone-400"
                      }`}
                    >
                      <CalendarDays size={11} />
                      {isUpcoming && t.done ? `Back ${due.label.toLowerCase()}` : due.label}
                    </span>
                  )}
                </div>

                {expanded && t.description && (
                  <div className="mt-2 text-xs text-stone-600 whitespace-pre-wrap leading-relaxed bg-stone-50 border border-line rounded-lg px-3 py-2 flex gap-2">
                    <AlignLeft size={12} className="text-stone-300 shrink-0 mt-0.5" />
                    <span className="min-w-0">{t.description}</span>
                  </div>
                )}
              </div>

              {/* Always visible on touch (no hover state exists there) —
                  opacity-100 by default, only fading in-on-hover at the sm+
                  breakpoint where a mouse is more likely. */}
              <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity shrink-0">
                {canReorder && (
                  <>
                    <button
                      onClick={() => nudge(t.id, -1)}
                      disabled={idx === 0}
                      aria-label="Move task up"
                      className={`text-stone-300 hover:text-stone-600 disabled:opacity-30 disabled:hover:text-stone-300 p-1 transition-colors active:scale-[0.9] ${EASE}`}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => nudge(t.id, 1)}
                      disabled={idx === visible.length - 1}
                      aria-label="Move task down"
                      className={`text-stone-300 hover:text-stone-600 disabled:opacity-30 disabled:hover:text-stone-300 p-1 transition-colors active:scale-[0.9] ${EASE}`}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </>
                )}
                {/* Push to tomorrow. The single most common thing done to a
                    task that isn't finishing it — previously that meant
                    opening the edit form and retyping a date, which is why
                    overdue items just sat there instead. Bumps from TODAY,
                    not from the old due date, so a task three days late
                    lands tomorrow rather than two days ago. */}
                {!t.done && (
                  <button
                    onClick={() => onUpdate?.(t.id, { dueDate: tomorrowStr() })}
                    aria-label="Push to tomorrow"
                    title="Push to tomorrow"
                    className={`text-stone-300 hover:text-amber-600 p-1 transition-colors active:scale-[0.9] ${EASE}`}
                  >
                    <CalendarArrowUp size={14} />
                  </button>
                )}
                <button
                  onClick={() => startEdit(t)}
                  aria-label="Edit task"
                  className={`text-stone-300 hover:text-stone-600 p-1 transition-colors active:scale-[0.9] ${EASE}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onDelete(t.id)}
                  aria-label="Delete task"
                  className={`text-stone-300 hover:text-rose-500 p-1 transition-colors active:scale-[0.9] ${EASE}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="text-xs text-stone-400 py-6 text-center">
            {filter === "done"
              ? "Nothing completed yet."
              : filter === "today"
              ? "Nothing due — you're clear."
              : filter === "upcoming"
              ? "Nothing scheduled ahead. Set a task to repeat and it'll show up here."
              : categoryFilter !== "all"
              ? `No open ${categoryMeta(categoryFilter)?.label.toLowerCase()} tasks.`
              : "No open tasks."}
          </div>
        )}
      </div>

      {filter === "upcoming" && visible.length > 0 && (
        <div className="text-[11px] text-stone-400 mt-3 pt-3 border-t border-stone-100">
          Repeating tasks show their next occurrence. They reopen automatically
          when the day or week turns over.
        </div>
      )}
    </Card>
  );
}
