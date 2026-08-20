// A recurring delivery KPI ("Posts per week: target 5") or a recurring
// owner task ("Commenting - 30 mins", daily) needs its progress/completion
// to reset when its period rolls over — a week that's already passed
// shouldn't leave `current` sitting at whatever it hit last Monday, and a
// task marked done on Tuesday shouldn't stay checked off forever.
//
// No cron/scheduled function exists in this app, and doesn't need to:
// applyRecurringResets runs lazily, every time data is loaded (see
// api/_dataHandlers.js's loadData()), and is a plain, idempotent function of
// "what period is it right now" — self-healing the moment the owner next
// opens the dashboard after a period actually rolled over, rather than
// depending on anything firing exactly at midnight/Monday.

import { today, weekStart, addDays } from "./utils.js";

// The start-of-period key for a given cadence, "" for anything else (so a
// stale/missing cadence just never matches and never resets — the safe
// default matches "none"). Exported so a newly-created KPI/task can be
// seeded with the right periodStart immediately, without waiting for the
// next load to compute it (see mutations.js's addTask/addDeliveryMetric).
export function periodStartFor(cadence) {
  if (cadence === "daily") return today();
  if (cadence === "weekly") return weekStart(today());
  return "";
}

// Mutates `data` in place (same convention as everything in mutations.js)
// and reports whether anything actually changed, so the caller knows
// whether the reset needs persisting back to Supabase — a reset that only
// ever lived in one GET response's return value would be recomputed
// differently (or not at all) the next time the row is read fresh.
export function applyRecurringResets(data) {
  let changed = false;

  (data.clients || []).forEach((c) => {
    (c.delivery || []).forEach((metric) => {
      const cadence = metric.cadence || "none";
      if (cadence === "none") return;
      const expected = periodStartFor(cadence);
      if (metric.periodStart !== expected) {
        metric.current = 0;
        metric.periodStart = expected;
        changed = true;
      }
    });
  });

  (data.tasks || []).forEach((t) => {
    const recurrence = t.recurrence || "none";
    if (recurrence === "none") return;
    const expected = periodStartFor(recurrence);
    if (t.periodStart !== expected) {
      // A recurring task reopens for the new period rather than staying
      // checked off — its dueDate (if it had one) moves forward with it so
      // TaskList's existing overdue/soon styling keeps making sense instead
      // of showing a date that's now in the past for no reason.
      t.done = false;
      if (t.dueDate) t.dueDate = expected;
      t.periodStart = expected;
      changed = true;
    }
  });

  return { data, changed };
}

// When a recurring task next comes due.
//
// Note what this deliberately is NOT: applyRecurringResets above reuses the
// same task row rather than creating one row per occurrence, so there are no
// future task rows to list and we must not invent any — generated instances
// would double-count against the source row and be regenerated on every
// server read. So "upcoming" is computed on demand, right here next to the
// reset logic that defines the period, so the two can never disagree.
//
// The honest limitation: this gives the ONE next occurrence, not a series.
export function nextOccurrenceFor(task) {
  const recurrence = task.recurrence || "none";
  if (recurrence === "none") return task.dueDate || "";
  // Not yet done this period — it's due in the current one.
  if (!task.done) return task.periodStart || today();
  // Already ticked off, so the next time it reopens is the next period.
  return recurrence === "daily" ? addDays(today(), 1) : addDays(weekStart(today()), 7);
}
