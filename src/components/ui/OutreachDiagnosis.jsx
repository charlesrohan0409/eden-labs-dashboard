import { TrendingUp, AlertTriangle, CheckCircle2, HelpCircle, Target } from "lucide-react";
import Card, { CardTitle } from "./Card";
import { diagnose, byList, byScript } from "../../lib/outreach";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const VERDICT = {
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
  const totals = entries?.length
    ? entries.reduce((acc, e) => {
        Object.keys(acc).forEach((k) => { acc[k] += Number(e[k]) || 0; });
        return acc;
      }, {
        linkedinConnectionsSent: 0, linkedinConnectionsAccepted: 0,
        linkedinConversationsStarted: 0, linkedinReplied: 0,
        linkedinCallsBooked: 0, linkedinDealsClosed: 0,
      })
    : null;

  const results = diagnose(totals || {}, targets);
  const lists_ = byList(entries, lists, targets);
  const scripts_ = byScript(entries, scripts, targets);
  const worst = results.find((r) => r.verdict === "bad");

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <CardTitle sub="Each number blames one thing — that's what tells you which to change">
          What's working
        </CardTitle>

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
