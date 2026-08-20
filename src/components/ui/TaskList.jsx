import { useMemo, useState } from "react";
import { Check, Plus, Trash2, CalendarDays, X, Pencil, Repeat } from "lucide-react";
import Card from "./Card";
import Badge from "./Badge";
import PillTabs from "./PillTabs";
import PrimaryButton from "./PrimaryButton";
import { relativeDays, today } from "../../lib/utils";

const PRIORITY = {
  high: { label: "High", tone: "rose", dot: "bg-rose-500" },
  medium: { label: "Medium", tone: "amber", dot: "bg-amber-500" },
  low: { label: "Low", tone: "stone", dot: "bg-stone-300" },
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * To-do list shown on the main dashboard and, scoped to one client, on the
 * client detail page. Pass `clientId` to lock every new task to that client
 * and hide the client picker.
 */
export default function TaskList({ tasks, clients, onAdd, onToggle, onDelete, onUpdate, clientId = undefined, title = "Tasks" }) {
  const scoped = clientId === undefined ? tasks : tasks.filter((t) => t.clientId === clientId);
  const [filter, setFilter] = useState("open");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", clientId: clientId ?? "", dueDate: "", priority: "medium", recurrence: "none" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", clientId: "", dueDate: "", priority: "medium", recurrence: "none" });

  const clientName = (id) => clients.find((c) => c.id === id)?.name;

  const visible = useMemo(() => {
    const list = scoped.filter((t) => {
      if (filter === "done") return t.done;
      if (t.done) return false;
      if (filter === "today") {
        const r = relativeDays(t.dueDate);
        return r && r.days <= 0;
      }
      return true;
    });
    // Overdue first, then by due date, then by priority.
    return list.sort((a, b) => {
      const ad = a.dueDate || "9999-12-31";
      const bd = b.dueDate || "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    });
  }, [scoped, filter]);

  const openCount = scoped.filter((t) => !t.done).length;
  const dueTodayCount = scoped.filter((t) => {
    if (t.done) return false;
    const r = relativeDays(t.dueDate);
    return r && r.days <= 0;
  }).length;

  const submit = () => {
    if (!form.title.trim()) return;
    onAdd({
      title: form.title.trim(),
      clientId: form.clientId || null,
      dueDate: form.dueDate,
      priority: form.priority,
      recurrence: form.recurrence,
    });
    setForm({ title: "", clientId: clientId ?? "", dueDate: "", priority: "medium", recurrence: "none" });
    setAdding(false);
  };

  const startEdit = (t) => {
    setEditForm({ title: t.title, clientId: t.clientId || "", dueDate: t.dueDate || "", priority: t.priority || "medium", recurrence: t.recurrence || "none" });
    setEditingId(t.id);
    setAdding(false);
  };
  const submitEdit = () => {
    if (!editForm.title.trim()) return;
    onUpdate(editingId, {
      title: editForm.title.trim(),
      clientId: editForm.clientId || null,
      dueDate: editForm.dueDate,
      priority: editForm.priority,
      recurrence: editForm.recurrence,
    });
    setEditingId(null);
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight">{title}</div>
          {dueTodayCount > 0 && (
            <Badge tone="rose" dot>{dueTodayCount} due</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PillTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open", count: openCount },
              { value: "today", label: "Due" },
              { value: "done", label: "Done" },
            ]}
          />
          <PrimaryButton
            size="sm"
            variant={adding ? "ghost" : "primary"}
            icon={adding ? X : Plus}
            onClick={() => setAdding(!adding)}
          >
            {adding ? "Cancel" : "Add"}
          </PrimaryButton>
        </div>
      </div>

      {adding && (
        <div className="rounded-xl bg-stone-50 border border-line p-3 mb-4 space-y-2">
          <input
            autoFocus
            placeholder="What needs doing?"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className={`${inputCls} w-full`}
          />
          <div className="flex gap-2 flex-wrap">
            {clientId === undefined && (
              <select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className={`${inputCls} flex-1 min-w-[9rem]`}
              >
                <option value="">Internal / agency</option>
                {clients.filter((x) => !x.hidden).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={form.dueDate}
              min={today()}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={`${inputCls} flex-1 min-w-[9rem]`}
            />
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className={`${inputCls} w-32`}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={form.recurrence}
              onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
              className={`${inputCls} w-36`}
            >
              <option value="none">Doesn't repeat</option>
              <option value="daily">Repeats daily</option>
              <option value="weekly">Repeats weekly</option>
            </select>
            <PrimaryButton onClick={submit}>Add task</PrimaryButton>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {visible.map((t) => {
          const due = relativeDays(t.dueDate);
          const p = PRIORITY[t.priority] || PRIORITY.medium;

          if (editingId === t.id) {
            return (
              <div key={t.id} className="rounded-xl bg-stone-50 border border-line p-3 mb-1 space-y-2">
                <input
                  autoFocus
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && submitEdit()}
                  className={`${inputCls} w-full`}
                />
                <div className="flex gap-2 flex-wrap">
                  {clientId === undefined && (
                    <select
                      value={editForm.clientId}
                      onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                      className={`${inputCls} flex-1 min-w-[9rem]`}
                    >
                      <option value="">Internal / agency</option>
                      {clients.filter((x) => !x.hidden).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                    className={`${inputCls} flex-1 min-w-[9rem]`}
                  />
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                    className={`${inputCls} w-32`}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select
                    value={editForm.recurrence}
                    onChange={(e) => setEditForm({ ...editForm, recurrence: e.target.value })}
                    className={`${inputCls} w-36`}
                  >
                    <option value="none">Doesn't repeat</option>
                    <option value="daily">Repeats daily</option>
                    <option value="weekly">Repeats weekly</option>
                  </select>
                  <PrimaryButton onClick={submitEdit}>Save</PrimaryButton>
                  <PrimaryButton variant="ghost" onClick={() => setEditingId(null)}>Cancel</PrimaryButton>
                </div>
              </div>
            );
          }

          return (
            <div
              key={t.id}
              className="group flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <button
                onClick={() => onToggle(t.id)}
                aria-label={t.done ? "Mark task as not done" : "Mark task as done"}
                className={`mt-0.5 w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                  t.done
                    ? "bg-emerald-700 border-emerald-700 text-white"
                    : "border-stone-300 hover:border-emerald-600 bg-white"
                }`}
              >
                {t.done && <Check size={12} strokeWidth={3} />}
              </button>

              <div className="min-w-0 flex-1">
                <div className={`text-sm leading-snug flex items-center gap-1.5 ${t.done ? "text-stone-400 line-through" : "text-stone-800"}`}>
                  {t.title}
                  {t.recurrence && t.recurrence !== "none" && (
                    <Repeat size={11} className="text-stone-300 shrink-0" title={`Repeats ${t.recurrence}`} />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {!t.done && <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} title={`${p.label} priority`} />}
                  {clientId === undefined && (
                    <span className="text-[11px] text-stone-400">
                      {t.clientId ? clientName(t.clientId) || "Unknown client" : "Internal"}
                    </span>
                  )}
                  {due && !t.done && (
                    <span
                      className={`text-[11px] inline-flex items-center gap-1 ${
                        due.overdue ? "text-rose-600 font-medium" : due.soon ? "text-amber-600" : "text-stone-400"
                      }`}
                    >
                      <CalendarDays size={11} /> {due.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Always visible on touch (no hover state exists there) —
                  opacity-100 by default, only fading in-on-hover at the sm+
                  breakpoint where a mouse is more likely. */}
              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition shrink-0">
                <button
                  onClick={() => startEdit(t)}
                  aria-label="Edit task"
                  className="text-stone-300 hover:text-stone-600 p-1"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => onDelete(t.id)}
                  aria-label="Delete task"
                  className="text-stone-300 hover:text-rose-500 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div className="text-xs text-stone-400 py-6 text-center">
            {filter === "done" ? "Nothing completed yet." : filter === "today" ? "Nothing due — you're clear." : "No open tasks."}
          </div>
        )}
      </div>
    </Card>
  );
}
