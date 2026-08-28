import { useMemo } from "react";
import { Send, Users, MessageSquare, Phone, Handshake, ArrowDown } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import PortalEmpty from "./PortalEmpty";
import WeeklyPace from "../ui/WeeklyPace";
import { LINKEDIN_STAGES, funnelOf, diagnose, conversionPct } from "../../lib/outreach";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const STAGE_ICON = {
  linkedinConnectionsSent: Send,
  linkedinConnectionsAccepted: Users,
  linkedinConversationsStarted: MessageSquare,
  linkedinReplied: MessageSquare,
  linkedinCallsBooked: Phone,
  linkedinDealsClosed: Handshake,
};

// Client-facing wording. The owner's version names the culprit ("the script
// is wrong") because that's an instruction to himself. A client reads the
// same number as a status report, so it's phrased as what's happening and
// what's being done — honest about a problem without sounding like the
// agency is blaming its own tools in front of the person paying for them.
const CLIENT_WORDING = {
  acceptRate: {
    good: "The people we're reaching are the right fit.",
    ok: "Reaching the right people. We're tightening the targeting further.",
    bad: "This audience isn't responding — we're rebuilding the target list.",
  },
  replyRate: {
    good: "The opening message is landing well.",
    ok: "Conversations are starting. We're testing a stronger opener.",
    bad: "Fewer replies than we want — we're rewriting the opening message.",
  },
  closeRate: {
    good: "Calls are converting well.",
    ok: "Calls are converting. There's room to sharpen the offer.",
    bad: "Getting the calls, but they're not closing — worth reviewing the offer together.",
  },
};

const TONE = {
  good: { chip: "emerald", bar: "bg-emerald-500" },
  ok: { chip: "amber", bar: "bg-amber-500" },
  bad: { chip: "rose", bar: "bg-rose-500" },
  unknown: { chip: "stone", bar: "bg-stone-300" },
};

/**
 * The client's view of outreach done on their behalf.
 *
 * Shows the funnel, the same diagnosis the owner sees but phrased as a status
 * report rather than a self-instruction, and the people who actually replied.
 *
 * It does NOT list everyone contacted. 200 cold names a week is not
 * transparency, it's noise nobody scrolls — and the conversations that are
 * live are the only part a client can act on.
 */
export default function PortalOutreach({ entries, lists, contacts, clients, targets, weeklyTarget }) {
  const totals = useMemo(() => funnelOf(entries), [entries]);
  const results = useMemo(() => diagnose(totals, targets), [totals, targets]);
  const anything = totals.linkedinConnectionsSent > 0 || totals.linkedinConversationsStarted > 0;

  // Only people who wrote back — that's who a client can actually do
  // something about.
  const replied = useMemo(
    () => (contacts || []).filter((c) => c.repliedAt).sort((a, b) => (a.repliedAt < b.repliedAt ? 1 : -1)),
    [contacts]
  );

  if (!anything) {
    return (
      <Card className="p-6">
        <PortalEmpty icon={Send} title="Outreach hasn't started yet">
          Once we begin reaching out on your behalf, you'll see exactly how many people
          were contacted, how many replied, and every conversation that's live.
        </PortalEmpty>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <WeeklyPace entries={entries} target={weeklyTarget} />
        {[
          { label: "People reached", value: totals.linkedinConnectionsSent, sub: "connection requests" },
          { label: "Conversations", value: totals.linkedinReplied, sub: "people who replied" },
          { label: "Calls booked", value: totals.linkedinCallsBooked, sub: "from outreach" },
        ].map((s, i) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-stone-400 font-medium">{s.label}</div>
            <div className="text-2xl font-bold tracking-tight text-stone-900 mt-1 tabular-nums">{s.value}</div>
            <div className="text-[11px] text-stone-400 mt-0.5">{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* ── the funnel ── */}
      <Card className="p-5">
        <CardTitle sub="Every stage, and how many make it through">Your outreach funnel</CardTitle>
        <div className="space-y-1">
          {LINKEDIN_STAGES.map((s, i) => {
            const value = totals[s.key] || 0;
            const prev = i > 0 ? totals[LINKEDIN_STAGES[i - 1].key] || 0 : null;
            const pct = i > 0 ? conversionPct(prev, value) : null;
            const width = totals.linkedinConnectionsSent
              ? Math.max(4, (value / totals.linkedinConnectionsSent) * 100)
              : 0;
            const Icon = STAGE_ICON[s.key] || Send;
            return (
              <div key={s.key} style={{ animationDelay: `${i * 45}ms` }}
                className="motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]">
                {i > 0 && (
                  <div className="flex items-center gap-1 pl-1 py-0.5">
                    <ArrowDown size={10} className="text-stone-300" />
                    <span className="text-[10.5px] text-stone-400 tabular-nums">
                      {pct == null ? "—" : `${pct}%`} carry through
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <Icon size={13} className="text-stone-400 shrink-0" />
                  <span className="text-[13px] text-stone-600 w-40 shrink-0 truncate">{s.label}</span>
                  <div className="flex-1 h-6 bg-stone-100/70 rounded-md overflow-hidden min-w-0">
                    <div
                      className={`h-full rounded-md bg-emerald-600/85 transition-[width] duration-500 ${EASE}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className="text-[13px] font-semibold text-stone-900 tabular-nums w-12 text-right shrink-0">
                    {value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── how it's going, in words ── */}
      <Card className="p-5">
        <CardTitle sub="What the numbers mean and what we're doing about them">
          How it's going
        </CardTitle>
        <div className="space-y-3.5">
          {results.map((r) => {
            const t = TONE[r.verdict];
            const wording = CLIENT_WORDING[r.id]?.[r.verdict];
            return (
              <div key={r.id}>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[13px] font-medium text-stone-700">{r.label}</span>
                  <Badge tone={t.chip} dot>
                    {r.rate == null ? "no data yet" : `${r.rate}%`}
                  </Badge>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-[width] duration-500 ${EASE} ${t.bar}`}
                    style={{ width: `${Math.min(100, r.rate ?? 0)}%` }} />
                </div>
                <p className="text-[12px] text-stone-500 mt-1.5 leading-relaxed">
                  {wording || "Not enough data yet to say."}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── live conversations ── */}
      <Card className="p-5">
        <CardTitle sub="People who wrote back — these are the ones worth your attention">
          Live conversations
        </CardTitle>
        {replied.length === 0 ? (
          <PortalEmpty icon={MessageSquare} title="No replies yet" compact>
            When someone responds to our outreach, they'll appear here with where the
            conversation stands.
          </PortalEmpty>
        ) : (
          <div className="space-y-1">
            {replied.map((c, i) => (
              <div key={c.id} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                className="flex items-center gap-3 py-2.5 border-b border-stone-100 last:border-0
                  motion-safe:animate-fade-up motion-safe:[animation-fill-mode:both]">
                <Avatar name={c.name} photoUrl={c.photoUrl} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] text-stone-800 truncate">{c.name}</div>
                  <div className="text-[11px] text-stone-400 truncate">
                    {c.company || c.title || "—"}
                    {c.repliedAt && ` · replied ${c.repliedAt}`}
                  </div>
                </div>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer"
                    className="text-[11px] text-emerald-800 hover:underline shrink-0">
                    Profile
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
