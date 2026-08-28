import {
  CheckCircle2, Receipt, Send, Clock, CreditCard, ArrowRight, Sparkles,
  MessageSquare, PhoneCall,
} from "lucide-react";
import { buildToday, dueLabel, TODAY_GROUPS, groupIdFor } from "../../lib/today";
import { buildRhythm, weekScore } from "../../lib/rhythm";
import { PenLine, Send as SendIcon } from "lucide-react";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const KIND_ICON = {
  call: PhoneCall,
  task: CheckCircle2,
  invoice: Receipt,
  post: Send,
  review: Clock,
  money: CreditCard,
  inbound: MessageSquare,
};

// Urgency reads through colour on the dot alone. The rows themselves stay
// uniform — tinting a whole row per urgency turns a list you scan into a
// traffic light you squint at.
const URGENCY_DOT = {
  overdue: "bg-rose-400",
  today: "bg-amber-400",
  soon: "bg-stone-500",
};

/**
 * The dark hero block that opens the dashboard: everything due across every
 * section, grouped by KIND rather than dumped into one flat list.
 *
 * A call, a bill and a task used to render identically — same row shape, same
 * dot, distinguishable only by a small icon nobody reads at a glance — which
 * made the whole panel look like one undifferentiated pile even though the
 * three things need completely different responses. Fixed sections (Calls,
 * Replies, Tasks, Content, Money) fix that: you can tell "I have 2 calls and
 * a bill" apart from "I have 3 things" without reading a single row.
 *
 * Still one urgency-sorted list under the hood (lib/today.js) — grouping is
 * purely a rendering concern, so the underlying "what's most overdue" logic
 * doesn't fork in two places.
 *
 * Dark on purpose. The app is otherwise white-cards-on-warm-grey, which is
 * calm but flat — nothing announces where to look first. One dark surface per
 * screen gives the eye an anchor, and this is the block that has earned it.
 */
// The three pillars, at a glance, before the task list. Whether the habit
// happened today is a different question from what's overdue, and it's the
// one that decides whether next month has any pipeline in it — so it sits
// above the list rather than inside it.
const PILLAR_ICON = { content: PenLine, outreach: SendIcon, commenting: MessageSquare };
const PILLAR_TONE = {
  content: "text-violet-300 bg-violet-500/15",
  outreach: "text-sky-300 bg-sky-500/15",
  commenting: "text-amber-300 bg-amber-500/15",
};

function RhythmStrip({ data, onGo }) {
  const rhythm = buildRhythm({
    posts: data.posts, outreachLog: data.outreachLog,
    commentLog: data.commentLog, clientId: null, days: 14,
  });
  const scores = weekScore(rhythm);
  const anyMissing = scores.some((p) => !p.doneToday);
  if (!anyMissing) return null;   // nothing to nag about — stay out of the way

  return (
    <button
      onClick={() => onGo?.("growth-detail")}
      className={`w-full flex items-center gap-2 mb-3 px-2.5 py-2 rounded-xl bg-white/[0.04]
        border border-white/[0.06] text-left
        transition-[background-color,transform] duration-150 ${EASE} hover:bg-white/[0.07] active:scale-[0.99]`}
    >
      <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wide shrink-0">
        Not yet today
      </span>
      <span className="flex items-center gap-1.5 flex-wrap">
        {scores.filter((p) => !p.doneToday).map((p) => {
          const Icon = PILLAR_ICON[p.id];
          return (
            <span
              key={p.id}
              className={`flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 ${PILLAR_TONE[p.id]}`}
            >
              <Icon size={10} /> {p.label}
              <span className="text-white/30 tabular-nums">{p.done}/{p.target}</span>
            </span>
          );
        })}
      </span>
      <ArrowRight size={12} className="text-white/25 ml-auto shrink-0" />
    </button>
  );
}

export default function TodayPanel({ data, calendarEvents = [], onGo, onOpenClient }) {
  const items = buildToday(data, { limit: 14, calendarEvents });
  const overdue = items.filter((i) => i.urgency === "overdue").length;

  // Bucket into the fixed section order from lib/today.js, dropping any
  // section that has nothing in it rather than showing an empty header.
  const sections = TODAY_GROUPS
    .map((g) => ({ ...g, items: items.filter((it) => groupIdFor(it.kind) === g.id) }))
    .filter((g) => g.items.length > 0);

  let rowIndex = -1;

  return (
    <div className="bg-night text-white border border-white/[0.07] rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight">Today</div>
          <div className="text-xs text-white/40 mt-0.5">
            {items.length === 0
              ? "Nothing due — you're clear"
              : overdue > 0
                ? `${items.length} need${items.length === 1 ? "s" : ""} you · ${overdue} overdue`
                : `${items.length} need${items.length === 1 ? "s" : ""} you`}
          </div>
        </div>
        {items.length === 0 && (
          <span className="shrink-0 w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Sparkles size={14} className="text-emerald-400" />
          </span>
        )}
      </div>

      <RhythmStrip data={data} onGo={onGo} />

      {items.length === 0 ? (
        <div className="text-[13px] text-white/50 leading-relaxed">
          No calls, overdue tasks, invoices or posts. Good time to write something, or
          get ahead on next week.
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.id}>
              <div className="flex items-center gap-2 px-2 mb-1">
                <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wide">
                  {section.label}
                </span>
                <span className="text-[10px] text-white/20 tabular-nums">{section.items.length}</span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="space-y-0.5 -mx-2">
                {section.items.map((item) => {
                  rowIndex += 1;
                  const Icon = KIND_ICON[item.kind] || CheckCircle2;
                  const label = dueLabel(item);
                  return (
                    <button
                      key={item.id}
                      style={{ animationDelay: `${Math.min(rowIndex, 10) * 35}ms` }}
                      onClick={() => {
                        if (item.clientId && onOpenClient) onOpenClient(item.clientId);
                        else onGo?.(item.view);
                      }}
                      className={`group w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left
                        motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]
                        transition-colors duration-150 ${EASE} hover:bg-white/[0.06] active:scale-[0.995]`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${URGENCY_DOT[item.urgency]}`} />
                      <Icon size={13} className="text-white/30 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-white/90 truncate">{item.title}</span>
                        <span className="block text-[11px] text-white/35 truncate">{item.context}</span>
                      </span>
                      {label && (
                        <span className={`text-[11px] shrink-0 tabular-nums ${
                          item.urgency === "overdue" ? "text-rose-300" : "text-white/40"
                        }`}>
                          {label}
                        </span>
                      )}
                      <ArrowRight size={12} className="text-white/0 group-hover:text-white/30 transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
