import { useState } from "react";
import { TrendingUp, AlertTriangle, CheckCircle2, HelpCircle, Target } from "lucide-react";
import Card, { CardTitle } from "./Card";
import PillTabs from "./PillTabs";
import { diagnose, byList, byScript, daysSince } from "../../lib/outreach";
import { toDateKey } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const VERDICT = {
  pending: { icon: HelpCircle, chip: "bg-sky-50 text-sky-700 border-sky-200/70", bar: "bg-sky-300", dot: "bg-sky-300", label: "Too early" },
  good:    { icon: CheckCircle2,   chip: "bg-emerald-50 text-emerald-700 border-emerald-200/70", bar: "bg-emerald-500", dot: "bg-emerald-500", label: "Good" },
  ok:      { icon: TrendingUp,     chip: "bg-amber-50 text-amber-700 border-amber-200/70",       bar: "bg-amber-500",  dot: "bg-amber-500",  label: "OK" },
  bad:     { icon: AlertTriangle,  chip: "bg-rose-50 text-rose-700 border-rose-200/70",          bar: "bg-rose-500",   dot: "bg-rose-500",   label: "Problem" },
  unknown: { icon: HelpCircle,     chip: "bg-stone-100 text-stone-500 border-stone-200",         bar: "bg-stone-300",  dot: "bg-stone-300",  label: "No data" },
};

/**
 * The bit a spreadsheet can't do.
 *
 * A spreadsheet shows you 18%. It doesn't tell you that 18% means the LIST is
 * wrong rather than the message — and that distinction is the entire value of
 * tracking this, because it decides what you change tomorrow.
 *
 * So each ratio is rendered as a sentence with a culprit, not as a number to
 * be interpreted. "No data" is kept visibly distinct from 0%: an untested
 * list and a failed list look identical in a spreadsheet, and confusing them
 * is how a good list gets thrown away.
 */
export default function OutreachDiagnosis({ entries, lists, scripts, targets }) {
  // A WINDOW, not the whole log. This used to sum every entry ever recorded,
  // so "connections sent" only ever went up — it read 341 on an account
  // whose ceiling is 200 a week, which makes the number impossible to sanity
  // check and the rate impossible to act on. Worse, an old under-performing
  // batch permanently drags the ratio down, so a list that is working today
  // still reads as a problem.
  //
  // 30 days by default: long enough for acceptances to land (they lag sends
  // by days, so a short window structurally understates the rate), short
  // enough that the number reflects what you are doing now.
  const [days, setDays] = useState(30);
  const since = (() => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    return toDateKey(d);
  })();
  const windowed = (entries || []).filter((e) => !e.date || e.date >= since);

  const totals = windowed.length
    ? windowed.reduce((acc, e) => {
        Object.keys(acc).forEach((k) => { acc[k] += Number(e[k]) || 0; });
        return acc;
      }, {
        linkedinConnectionsSent: 0, linkedinConnectionsAccepted: 0,
        linkedinConversationsStarted: 0, linkedinReplied: 0,
        linkedinCallsBooked: 0, linkedinDealsClosed: 0,
      })
    : null;

  // Age of the log WITHIN the window, so a zero at any stage reads as "not
  // measured yet" rather than "failed" while the funnel is still filling in.
  const oldest = windowed.map((e) => e.date).filter(Boolean).sort()[0];
  const results = diagnose(totals || {}, targets, { daysSinceStart: daysSince(oldest) });
  const lists_ = byList(windowed, lists, targets);
  const scripts_ = byScript(windowed, scripts, targets);
  const worst = results.find((r) => r.verdict === "bad");

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-stone-900 tracking-tight">What's working</div>
            <div className="text-xs text-stone-400 mt-0.5">
              Each number blames one thing — that's what tells you which to change
            </div>
          </div>
          {/* The window is part of the number's meaning, so it's stated
              rather than assumed. */}
          <PillTabs
            size="sm"
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: "7 days" },
              { value: 30, label: "30 days" },
              { value: 90, label: "90 days" },
            ]}
          />
        </div>

        {worst && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200/70 bg-rose-50 px-3.5 py-3 mb-4">
            <AlertTriangle size={15} className="text-rose-600 shrink-0 mt-px" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-rose-900">
                Fix {worst.blames} first
              </div>
              <p className="text-[12.5px] text-rose-800/80 mt-0.5 leading-relaxed">{worst.message}</p>
            </div>
          </div>
        )}

        <div className="space-y-3.5">
          {results.map((r, i) => {
            const v = VERDICT[r.verdict];
            const Icon = v.icon;
            return (
              <div
                key={r.id}
                style={{ animationDelay: `${i * 50}ms` }}
                className="motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]"
              >
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[13px] font-medium text-stone-700">{r.label}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${v.chip}`}>
                    <Icon size={9} /> {v.label}
                  </span>
                  <span className="ml-auto text-[13px] font-bold text-stone-900 tabular-nums">
                    {r.rate == null ? "—" : `${r.rate}%`}
                  </span>
                  <span className="text-[11px] text-stone-400 tabular-nums w-24 text-right">
                    {r.to} of {r.from}
                  </span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${EASE} ${v.bar}`}
                    style={{ width: `${Math.min(100, r.rate ?? 0)}%` }}
                  />
                </div>
                <p className="text-[11.5px] text-stone-500 mt-1.5 leading-relaxed">{r.message}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {lists_.length > 0 && (
        <Card className="p-5">
          <CardTitle sub="Acceptance rate is the list's report card">Lead lists</CardTitle>
          <div className="space-y-2">
            {lists_.map((l) => {
              const accept = l.diagnostics.find((d) => d.id === "acceptRate");
              const v = VERDICT[accept.verdict];
              return (
                <div key={l.listId} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] truncate ${l.unassigned ? "text-stone-400 italic" : "text-stone-800"}`}>
                      {l.name}
                    </div>
                    <div className="text-[11px] text-stone-400 tabular-nums">
                      {l.totals.linkedinConnectionsSent} sent · {l.totals.linkedinConnectionsAccepted} accepted
                      {l.totals.linkedinDealsClosed > 0 && ` · ${l.totals.linkedinDealsClosed} signed`}
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold text-stone-900 tabular-nums shrink-0">
                    {accept.rate == null ? "—" : `${accept.rate}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {scripts_.length > 0 && (
        <Card className="p-5">
          <CardTitle sub="Reply rate is the script's report card — the list has no say in it">
            Scripts
          </CardTitle>
          <div className="space-y-2">
            {scripts_.map((sc) => {
              const v = VERDICT[sc.verdict];
              return (
                <div key={sc.scriptId} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-stone-800 truncate">{sc.name}</div>
                    <div className="text-[11px] text-stone-400 tabular-nums">
                      {sc.replied} replies from {sc.sent} DMs
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold text-stone-900 tabular-nums shrink-0">
                    {sc.rate == null ? "—" : `${sc.rate}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
