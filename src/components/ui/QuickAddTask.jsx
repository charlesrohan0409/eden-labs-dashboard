import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import Modal from "./Modal";
import PrimaryButton from "./PrimaryButton";

const PRIORITY_OPTIONS = [
  { value: "high", label: "High priority" },
  { value: "medium", label: "Medium priority" },
  { value: "low", label: "Low priority" },
];

const BLANK = { title: "", clientId: "", dueDate: "", priority: "medium" };

/**
 * Floating quick-add task button visible on every owner page.
 * Shortcut: ⌘K / Ctrl+K  (opens/closes the modal).
 * Press Enter in the title field to submit.
 */
export default function QuickAddTask({ clients = [], onAdd }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);

  // Global keyboard shortcut — doesn't fire when focus is inside an input or
  // textarea so normal ⌘K browser behaviour isn't disrupted.
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const submit = () => {
    if (!form.title.trim()) return;
    onAdd({
      title: form.title.trim(),
      clientId: form.clientId || null,
      dueDate: form.dueDate || "",
      priority: form.priority,
    });
    setForm(BLANK);
    setOpen(false);
  };

  const inputCls = "w-full border border-line rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <>
      {/* Floating button — sits above the mobile bottom nav (z-[80] > nav z-[70]) */}
      <button
        onClick={() => setOpen(true)}
        title="Quick-add task (⌘K)"
        aria-label="Quick-add task"
        className="fixed bottom-24 right-5 lg:bottom-8 lg:right-8 z-[80] w-12 h-12 rounded-full bg-emerald-800 text-white shadow-lg flex items-center justify-center hover:bg-emerald-900 active:scale-95 transition-all"
      >
        <Plus size={22} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Quick-add task" subtitle="⌘K to open from anywhere">
        <div className="space-y-3">
          <input
            autoFocus
            placeholder="What needs to be done?"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className={inputCls}
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              className="border border-line rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none"
            >
              <option value="">No client (internal)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="border border-line rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-stone-400 font-medium">Due date (optional)</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>

          <PrimaryButton
            variant="dark"
            onClick={submit}
            disabled={!form.title.trim()}
            className="w-full"
          >
            Add task
          </PrimaryButton>
        </div>
      </Modal>
    </>
  );
}
