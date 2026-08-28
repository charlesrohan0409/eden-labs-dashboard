import { useMemo, useState } from "react";
import {
  PenLine, Send, MessageCircle, Check, Plus, Minus, Flame, AlertTriangle,
} from "lucide-react";
import Card, { CardTitle } from "./Card";
import { buildRhythm, weekScore, currentStreak, PILLARS, WEEKLY_TARGET_DAYS } from "../../lib/rhythm";
import { today } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const ICON = { content: PenLine, outreach: Send, commenting: MessageCircle };
const ACCENT = {
  content:    { on: "bg-violet-500",  soft: "bg-violet-100",  text: "text-violet-700",  chip: "bg-violet-50" },
  outreach:   { on: "bg-sky-500",     soft: "bg-sky-100",     text: "text-sky-700",     chip: "bg-sky-50" },
  commenting: { on: "bg-amber-500",   soft: "bg-amber-100",   text: "text-amber-700",   chip: "bg-amber-50" },
};

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * The three growth pillars, and whether they actually happened.
 *
 * Content and outreach are INFERRED from work already recorded — asking
 * someone to tick a box for something the app can already see is how habit
 * tracking gets abandoned in week two. Commenting is the only one logged by
 * hand, because it happens entirely on LinkedIn's feed and leaves nothing
 * here.
 *
 * Measured as four days a week, not a streak. A streak breaks once and stops
 * meaning anything — it punishes one missed Sunday exactly as hard as a lost
 * fortnight. Four-of-seven survives a bad day, which is what makes it worth
 * looking at every morning rather than avoiding.
 */
export default function GrowthRhythm({
  posts, outreachLog, commentLog, clientId = null, onLogComments, onBumpComments, days = 28,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const rhythm = useMemo(
    () => buildRhythm({ posts, outreachLog, commentLog, clientId, days }),
    [posts, outreachLog, commentLog, clientId, days]
  );
  const scores = useMemo(() => weekScore(rhythm), [rhythm]);
  const streak = useMemo(() => currentStreak(rhythm), [rhythm]);
  const todayRow = rhythm[rhythm.length - 1];
  const todayComments = todayRow?.commentCount || 0;

  // Grid runs Monday-first so the columns line up with how a week reads.
  const cells = useMemo(() => {
    const first = new Date(`${rhythm[0].date}T12:00:00`);
    const pad = (first.getDay() + 6) % 7;
    return [...Array(pad).fill(null), ...rhythm];
  }, [rhythm]);

  const commit = () => {
    const n = Number(draft);
    if (!Number.isNaN(n) && draft !== "") onLogComments({ clientId, date: today(), count: Math.max(0, n) });
    setEditing(false);
    setDraft("");
  };

  return (
    <Card className="p-5">
      <CardTitle sub={`At least ${WEEKLY_TARGET_DAYS} days a week on each — ideally every day`}>
        <span className="flex items-center gap-2">
          Your rhythm
          {streak > 1 && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200/70 rounded-full px-2 py-0.5">
              <Flame size={10} /> {streak} day{streak === 1 ? "" : "s"} all three
            </span>
          )}
        </span>
      </CardTitle>

      {/* ── this week, per pillar ── */}
      <div className="space-y-2.5 mb-4">
        {scores.map((p) => {
          const Icon = ICON[p.id];
          const a = ACCENT[p.id];
          return (
            <div key={p.id} className="flex items-center gap-3">
              <span className={`w-7 h-7 rounded-full ${a.chip} flex items-center justify-center shrink-0`}>
                <Icon size={13} className={a.text} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-stone-700">{p.label}</span>
                  {p.doneToday && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                      <Check size={10} /> today
                    </span>
                  )}
                  {p.atRisk && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-rose-600">
                      <AlertTriangle size={10} /> can't hit 4 now
                    </span>
                  )}
                  <span className="ml-auto text-[12px] tabular-nums text-stone-500 shrink-0">
                    {p.done}<span className="text-stone-300">/{p.target}</span>
                  </span>
                </div>
                {/* One block per required day — a bar would hide that this is
                    a count of days, not a percentage. */}
                <div className="flex gap-1 mt-1.5">
                  {Array.from({ length: p.target }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${EASE} ${
                        i < p.done ? a.on : a.soft
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── log today's commenting ── */}
      <div className="rounded-xl border border-line bg-stone-50/70 p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <MessageCircle size={13} className="text-amber-700 shrink-0" />
          <span className="text-[12.5px] text-stone-600">Comments today</span>

          {editing ? (
            <span className="flex items-center gap-1.5 ml-auto">
              <input
                autoFocus type="number" min="0"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commit(); }
                  if (e.key === "Escape") { setEditing(false); setDraft(""); }
                }}
                onBlur={commit}
                className="w-16 border border-line rounded-lg px-2 py-1 text-sm text-right tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </span>
          ) : (
            <span className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() => onBumpComments({ clientId, date: today(), by: -1 })}
                disabled={todayComments === 0}
                aria-label="One fewer"
                className={`w-7 h-7 rounded-full border border-line bg-white flex items-center justify-center
                  text-stone-500 disabled:opacity-40
                  transition-transform duration-150 ${EASE} active:scale-[0.9]`}
              >
                <Minus size={13} />
              </button>
              <button
                onClick={() => { setDraft(String(todayComments)); setEditing(true); }}
                title="Type an exact number"
                className="text-[17px] font-bold text-stone-900 tabular-nums w-10 text-center hover:text-emerald-800 transition-colors"
              >
                {todayComments}
              </button>
              <button
                onClick={() => onBumpComments({ clientId, date: today(), by: 1 })}
                aria-label="One more"
                className={`w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center
                  transition-transform duration-150 ${EASE} active:scale-[0.9] hover:bg-stone-800`}
              >
                <Plus size={13} />
              </button>
            </span>
          )}
        </div>
        <p className="text-[11px] text-stone-400 mt-1.5">
          Tap as you go, or click the number to set it in one. Content and outreach fill in
          on their own from what you've logged.
        </p>
      </div>

      {/* ── the last four weeks ── */}
      <div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW.map((d, i) => (
            <div key={i} className="text-center text-[9.5px] font-semibold text-stone-300 uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} />;
            const isToday = d.date === today();
            const hits = PILLARS.filter((p) => d[p.id]).length;
            return (
              <div
                key={d.date}
                title={`${d.date} — ${hits === 0 ? "nothing logged" : PILLARS.filter((p) => d[p.id]).map((p) => p.label).join(", ")}${d.commentCount ? ` (${d.commentCount} comments)` : ""}`}
                className={`aspect-square rounded-md flex flex-col justify-end gap-[2px] p-[3px]
                  ${isToday ? "ring-1 ring-stone-900 ring-offset-1" : ""}
                  ${hits === 0 ? "bg-stone-100" : "bg-stone-50"}`}
              >
                {/* Three stacked bars, one per pillar — a single heat shade
                    would say "a bit was done" without saying WHICH, and the
                    whole point is spotting the one that keeps slipping. */}
                {PILLARS.map((p) => (
                  <span
                    key={p.id}
                    className={`h-[3px] rounded-full ${d[p.id] ? ACCENT[p.id].on : "bg-stone-200/70"}`}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {PILLARS.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-[10.5px] text-stone-400">
              <span className={`w-2 h-[3px] rounded-full ${ACCENT[p.id].on}`} /> {p.label}
            </span>
          ))}
          <span className="text-[10.5px] text-stone-300 ml-auto">last 4 weeks</span>
        </div>
      </div>
    </Card>
  );
}
