// The three pillars of the growth engine, and whether they actually happened.
//
// Content, outreach and commenting are the three activities Eden Labs runs on.
// The app already recorded the OUTPUT of each (posts, outreach entries) but
// never the HABIT — so "did I do my three things today" was unanswerable, and
// commenting, which is a full hour a day, left no trace at all.
//
// The target is deliberately "at least 4 days a week", not a streak.
// A streak breaks once and stops meaning anything, which punishes a single
// missed Sunday exactly as hard as a lost fortnight. Four-of-seven is the
// real commitment and it survives one bad day, which is what makes it worth
// looking at every morning.

import { toDateKey } from "./utils.js";
import { normalizeStatus } from "./content.js";

export const PILLARS = [
  {
    id: "content",
    label: "Content",
    verb: "Wrote or shipped a post",
    // Derived from posts, not logged by hand: the act of writing already
    // leaves a record, and asking someone to tick a box for something the
    // app can see is how tracking gets abandoned.
    derived: true,
  },
  {
    id: "outreach",
    label: "Outreach",
    verb: "Sent connections or DMs",
    derived: true,
  },
  {
    id: "commenting",
    label: "Commenting",
    verb: "Commented on the feed",
    // The one that genuinely has to be logged: commenting happens on
    // LinkedIn and leaves nothing behind here.
    derived: false,
  },
];

export const WEEKLY_TARGET_DAYS = 4;

export const DEFAULT_REST = { weekly: [0], dates: [] };

/** Is nothing expected on this day? */
export function isRestDay(dateStr, rest = DEFAULT_REST) {
  if (!dateStr) return false;
  if ((rest.dates || []).includes(dateStr)) return true;
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  return (rest.weekly || []).includes(dow);
}

/** The last `days` dates, oldest first, as YYYY-MM-DD. */
export function recentDays(days = 28, from = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    out.push(toDateKey(d));
  }
  return out;
}

/**
 * Which pillars happened on which day.
 *
 * Content and outreach are inferred from work already recorded. Commenting
 * comes from `commentLog` — one row per day, written by the dashboard or the
 * extension.
 */
export function buildRhythm({ posts, outreachLog, commentLog, clientId = null, days = 28, rest = DEFAULT_REST } = {}) {
  const dates = recentDays(days);
  const inScope = (x) => (x.clientId || null) === (clientId || null);

  const contentDays = new Set();
  (posts || []).filter(inScope).forEach((p) => {
    // Any movement counts: writing a draft is doing the work, even if it
    // doesn't go out that day. Publishing counts on the day it published.
    const stage = normalizeStatus(p.status);
    const d = stage === "published" && p.scheduledAt ? p.scheduledAt.slice(0, 10) : p.date;
    if (d) contentDays.add(d);
  });

  const outreachDays = new Set();
  (outreachLog || []).filter(inScope).forEach((e) => {
    const did = (Number(e.linkedinConnectionsSent) || 0) + (Number(e.linkedinConversationsStarted) || 0);
    if (did > 0 && e.date) outreachDays.add(e.date);
  });

  const commentByDay = {};
  (commentLog || []).filter(inScope).forEach((c) => {
    if (c.date) commentByDay[c.date] = (commentByDay[c.date] || 0) + (Number(c.count) || 0);
  });

  return dates.map((date) => ({
    date,
    rest: isRestDay(date, rest),
    content: contentDays.has(date),
    outreach: outreachDays.has(date),
    commenting: (commentByDay[date] || 0) > 0,
    commentCount: commentByDay[date] || 0,
  }));
}

/** Monday-start week key, matching the rest of the app's weekly buckets. */
function weekKeyOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateKey(d);
}

/**
 * Per-pillar performance against the 4-days-a-week commitment, for the week
 * containing `from`.
 *
 * `daysLeft` includes today, so "2 more days" is achievable rather than a
 * demand for time already gone.
 */
export function weekScore(rhythm, from = new Date()) {
  const key = weekKeyOf(toDateKey(from));
  const thisWeek = rhythm.filter((d) => weekKeyOf(d.date) === key);
  const todayKey = toDateKey(from);
  const dayIdx = (from.getDay() + 6) % 7;   // Monday = 0 … Sunday = 6

  // Only days something is actually expected on count toward the goal or the
  // catch-up maths. Rest days aren't shortfall.
  const working = thisWeek.filter((d) => !d.rest);
  const daysLeft = thisWeek.filter((d, i) => i >= dayIdx && !d.rest).length;
  // A week with fewer working days than the target can't demand the target.
  const target = Math.min(WEEKLY_TARGET_DAYS, Math.max(1, working.length || WEEKLY_TARGET_DAYS));
  const restToday = thisWeek.some((d) => d.date === todayKey && d.rest);

  return PILLARS.map((p) => {
    const done = working.filter((d) => d[p.id]).length;
    const remaining = Math.max(0, target - done);
    return {
      ...p,
      done,
      target,
      remaining,
      daysLeft,
      restToday,
      hit: done >= target,
      // Behind and unable-to-catch-up are different states; only the second
      // deserves a red flag.
      atRisk: remaining > 0 && remaining > daysLeft,
      doneToday: restToday || thisWeek.some((d) => d.date === todayKey && d[p.id]),
    };
  });
}

/**
 * Consecutive WORKING days back from today where all three happened.
 *
 * Rest days are skipped rather than counted or breaking the run — the whole
 * point of blocking a day is that nothing was expected, so a deliberate
 * Sunday off must not read the same as a Tuesday you forgot.
 *
 * Today only breaks a streak once it's over: an incomplete today leaves
 * yesterday's run standing rather than showing zero every morning.
 */
export function currentStreak(rhythm, todayKey) {
  let n = 0;
  for (let i = rhythm.length - 1; i >= 0; i--) {
    const d = rhythm[i];
    if (d.rest) continue;
    const all = d.content && d.outreach && d.commenting;
    if (all) { n++; continue; }
    if (d.date === todayKey) continue;   // still in progress
    break;
  }
  return n;
}

/** Longest run of complete working days anywhere in the window. */
export function bestStreak(rhythm) {
  let best = 0, run = 0;
  rhythm.forEach((d) => {
    if (d.rest) return;
    if (d.content && d.outreach && d.commenting) { run++; best = Math.max(best, run); }
    else run = 0;
  });
  return best;
}
