import { useMemo, useState } from "react";
import {
  PenLine, Send, MessageCircle, Check, Plus, Minus, Flame, AlertTriangle, Moon,
} from "lucide-react";
import Card, { CardTitle } from "./Card";
import { buildRhythm, weekScore, currentStreak, bestStreak, PILLARS, DEFAULT_REST } from "../../lib/rhythm";
import { workToday } from "../../lib/utils";
import { useEffect, useRef } from "react";

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
  posts, outreachLog, commentLog, clientId = null,
  rest = DEFAULT_REST, onToggleRestDate,
  onLogComments, onBumpComments, days = 28,
  // The client sees the same record, but it's a report to them rather than
  // a control panel — logging and blocking days are the owner's decisions.
  readOnly = false, title = "Your rhythm", subtitle,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // workToday, not today: work done at 1am belongs to the previous day.
  // With calendar midnight, a late session broke the streak for the day it
  // was actually done and double-counted the day it was filed under.
  const todayKey = workToday();

  const rhythm = useMemo(
    () => buildRhythm({ posts, outreachLog, commentLog, clientId, days, rest }),
    [posts, outreachLog, commentLog, clientId, days, rest]
  );
  const scores = useMemo(() => weekScore(rhythm), [rhythm]);
  const streak = useMemo(() => currentStreak(rhythm, todayKey), [rhythm, todayKey]);
  const best = useMemo(() => bestStreak(rhythm), [rhythm]);

  // Fires the pop only when the streak actually GROWS. Re-animating on every
  // render would make a permanent fixture twitch constantly.
  const prevStreak = useRef(streak);
  const [justGrew, setJustGrew] = useState(false);
  useEffect(() => {
    if (streak > prevStreak.current) {
      setJustGrew(true);
      const t = setTimeout(() => setJustGrew(false), 700);
      prevStreak.current = streak;
      return () => clearTimeout(t);
    }
    prevStreak.current = streak;
  }, [streak]);
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
    if (!Number.isNaN(n) && draft !== "") onLogComments({ clientId, date: workToday(), count: Math.max(0, n) });
    setEditing(false);
    setDraft("");
  };

  return (
    <Card className="p-5">
      <CardTitle sub={subtitle ?? `At least ${scores[0]?.target ?? 4} days a week on each — ideally every day. Sundays are off.`}>
        <span className="flex items-center gap-2 flex-wrap">
          {title}
          {streak > 0 && (
            <span
              className={`flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1
                bg-gradient-to-r from-amber-100 to-orange-100 text-amber-800 border border-amber-300/60
                ${justGrew ? "motion-safe:animate-streak-pop" : ""}`}
            >
              <Flame size={11} className="text-orange-500 motion-safe:animate-ember" />
              {streak} day{streak === 1 ? "" : "s"}
              {best > streak && (
                <span className="text-amber-600/60 font-normal">best {best}</span>
              )}
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
                  {p.restToday ? (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-stone-400">
                      <Moon size={10} /> rest day
                    </span>
                  ) : p.doneToday && (
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
      {!readOnly && !scores[0]?.restToday && (
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
                onClick={() => onBumpComments({ clientId, date: workToday(), by: -1 })}
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
                onClick={() => onBumpComments({ clientId, date: workToday(), by: 1 })}
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
      )}

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
            const isToday = d.date === todayKey;
            const future = d.date > todayKey;
            const hits = PILLARS.filter((p) => d[p.id]).length;
            const label = d.rest
              ? "Rest day — nothing expected"
              : hits === 0
                ? "Nothing logged"
                : PILLARS.filter((p) => d[p.id]).map((p) => p.label).join(", ");

            return (
              <button
                key={d.date}
                onClick={() => { if (!readOnly) onToggleRestDate?.(d.date); }}
                disabled={readOnly}
                title={`${d.date} — ${label}${d.commentCount ? ` (${d.commentCount} comments)` : ""}${readOnly ? "" : `\nClick to ${d.rest ? "un-block" : "block"} this day`}`}
                className={`aspect-square rounded-md flex flex-col justify-end gap-[2px] p-[3px] relative
                  transition-[transform,background-color] duration-150 ${EASE} active:scale-[0.9]
                  ${isToday ? "ring-1 ring-stone-900 ring-offset-1" : ""}
                  ${d.rest
                    ? "bg-stone-100/70 border border-dashed border-stone-300"
                    : hits === 0 && !future ? "bg-rose-50" : "bg-stone-50"}`}
              >
                {d.rest ? (
                  // A blocked day shows a moon, not empty bars — "nothing was
                  // expected" and "nothing happened" have to look different or
                  // the record punishes you for resting.
                  <Moon size={11} className="text-stone-400 mx-auto my-auto" />
                ) : (
                  PILLARS.map((p) => (
                    <span
                      key={p.id}
                      className={`h-[3px] rounded-full transition-colors duration-300 ${EASE} ${
                        d[p.id] ? ACCENT[p.id].on : future ? "bg-stone-200/50" : "bg-stone-200"
                      }`}
                    />
                  ))
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {PILLARS.map((p) => (
            <span key={p.id} className="flex items-center gap-1 text-[10.5px] text-stone-400">
              <span className={`w-2 h-[3px] rounded-full ${ACCENT[p.id].on}`} /> {p.label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10.5px] text-stone-400">
            <Moon size={9} /> rest
          </span>
          <span className="text-[10.5px] text-stone-300 ml-auto">
            last 4 weeks{readOnly ? "" : " · click a day to block it"}
          </span>
        </div>
      </div>
    </Card>
  );
}
