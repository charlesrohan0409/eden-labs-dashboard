import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Plus, Phone, DollarSign, FileText, Eye, ExternalLink, Loader2, ChevronRight,
  Users, Mail, Trash2, ArrowRight,
} from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import IconStat from "../ui/IconStat";
import Avatar from "../ui/Avatar";
import PrimaryButton from "../ui/PrimaryButton";
import Badge from "../ui/Badge";
import { MONTHS, computeHealthScore, healthTone, today } from "../../lib/utils";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { useBufferPerformance } from "../../hooks/useBufferPerformance";
import { useCurrency } from "../../hooks/useCurrency";
import {
  LINKEDIN_STAGES, EMAIL_STAGES, EMPTY_ENTRY, sumEntries, buildDailySeries, buildWeeklySeries,
  buildMonthlySeries, conversionPct, forClient,
} from "../../lib/outreach";
import PillTabs from "../ui/PillTabs";

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n ?? 0));

// One funnel, reused for LinkedIn (6 stages) and email (3) — walks the
// stage list and shows the conversion % dropping from each stage into the
// next, which is the whole point of tracking a funnel instead of just a
// pile of unrelated counters.
function FunnelCard({ title, icon: Icon, tone, stages, totals, windowLabel }) {
  return (
    <Card className="p-5">
      <CardTitle sub={windowLabel}>
        <span className="flex items-center gap-2"><Icon size={15} className={tone} /> {title}</span>
      </CardTitle>
      <div className="space-y-1">
        {stages.map((s, i) => {
          const val = totals[s.key] || 0;
          const prevVal = i > 0 ? totals[stages[i - 1].key] || 0 : null;
          const pct = i > 0 ? conversionPct(prevVal, val) : null;
          return (
            <div key={s.key} className="flex items-center gap-2 py-1.5">
              {i > 0 && <ArrowRight size={11} className="text-stone-300 shrink-0" />}
              <span className={`text-xs text-stone-500 flex-1 ${i === 0 ? "" : ""}`}>{s.label}</span>
              {pct != null && (
                <span className="text-[11px] text-stone-400 tnum w-10 text-right">{pct == null ? "—" : `${pct}%`}</span>
              )}
              <span className="text-sm font-semibold text-stone-800 tnum w-8 text-right">{val}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function GrowthDetail({ data, setView, onLogOutreachDay, onDeleteOutreachDay }) {
  const { money } = useCurrency();
  const [funnelDays, setFunnelDays] = useState(7);
  const [chartMetric, setChartMetric] = useState("linkedinConnectionsSent");
  const [granularity, setGranularity] = useState("daily"); // daily | weekly | monthly
  const [logDate, setLogDate] = useState(today());
  const [logForm, setLogForm] = useState(EMPTY_ENTRY);

  // Content reach is growth too — pull the real numbers rather than only the
  // hand-logged post counts.
  const bufferConnected = !!data.integrations.find((i) => i.id === "buffer")?.connected;
  const perf = useBufferPerformance({ enabled: bufferConnected, range: "90" });

  // This page is the owner's OWN growth, so it reads only agency-level rows
  // (clientId null). Per-client outreach lives on each client's page.
  const outreachLog = forClient(data.outreachLog, null);

  const sinceDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - funnelDays + 1);
    return d.toISOString().slice(0, 10);
  }, [funnelDays]);
  const totals = useMemo(() => sumEntries(outreachLog, sinceDate), [outreachLog, sinceDate]);

  // Same underlying data, three ways to look at it — daily for "what
  // happened this week," weekly/monthly for "is this actually trending up."
  const chartSeries = useMemo(() => {
    if (granularity === "weekly") return buildWeeklySeries(outreachLog, 12);
    if (granularity === "monthly") return buildMonthlySeries(outreachLog, 6);
    return buildDailySeries(outreachLog, 30);
  }, [outreachLog, granularity]);

  // Re-syncs the form to whatever's already logged for the picked date, so
  // fixing one number on a past day doesn't wipe out the rest of that day's
  // entry when saved.
  useEffect(() => {
    const existing = outreachLog.find((e) => e.date === logDate);
    setLogForm(existing ? { ...EMPTY_ENTRY, ...existing } : EMPTY_ENTRY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate]);

  const submitLog = () => {
    onLogOutreachDay({ date: logDate, ...logForm });
  };

  const recentEntries = [...outreachLog].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);

  const contentPublishedThisMonth = useMemo(() => {
    const now = new Date();
    return data.posts.filter((p) => {
      if (p.status !== "published" || !p.date) return false;
      const d = new Date(p.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [data.posts]);

  const dealsByMonth = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, deals: 0, value: 0 }));
    data.contacts.filter((c) => c.stage === "closed" && c.closedDate).forEach((c) => {
      const m = MONTHS[new Date(c.closedDate).getMonth() - 2];
      if (byMonth[m]) { byMonth[m].deals += 1; byMonth[m].value += Number(c.dealValue) || 0; }
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [data.contacts]);

  const trend = (arr, key) => {
    if (arr.length < 2) return 0;
    const latest = arr.at(-1)[key], prev = arr.at(-2)[key];
    if (!prev) return latest > 0 ? 100 : 0;
    return Math.round(((latest - prev) / prev) * 100);
  };

  const topClients = data.clients.map((c) => {
    const calls = data.calls.filter((x) => x.clientId === c.id).length;
    const deals = data.contacts.filter((x) => x.clientId === c.id && x.stage === "closed");
    const dealValue = deals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0);
    return { ...c, calls, dealsCount: deals.length, dealValue, health: computeHealthScore(c, data.invoices) };
  }).sort((a, b) => b.dealValue - a.dealValue);

  const ALL_STAGES = [...LINKEDIN_STAGES, ...EMAIL_STAGES];
  const chartLabel = ALL_STAGES.find((s) => s.key === chartMetric)?.label || "Outreach";
  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";

  return (
    <div className="space-y-5">
      <button onClick={() => setView("home")} className="text-sm text-stone-500 flex items-center gap-1 hover:text-stone-800">
        <ArrowLeft size={14} /> Dashboard
      </button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Growth</h1>
        <p className="text-sm text-stone-500 mt-1">Outreach, content, and pipeline momentum across every client.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IconStat icon={Users} tone="sky" label="LI connections sent" value={totals.linkedinConnectionsSent} trendLabel={`last ${funnelDays}d`} />
        <IconStat icon={Phone} tone="amber" label="Calls booked" value={totals.linkedinCallsBooked + totals.emailCallsBooked} trendLabel={`last ${funnelDays}d · LI + email`} />
        <IconStat icon={DollarSign} tone="emerald" label="Deals closed" value={dealsByMonth.at(-1)?.deals ?? 0} trend={trend(dealsByMonth, "deals")} trendLabel="vs last month" />
        <IconStat icon={FileText} tone="violet" label="Content published" value={contentPublishedThisMonth} trendLabel="this month" />
      </div>

      {/* ── Funnels — the actual conversion story, not just raw counts ── */}
      <div className="flex items-center justify-end">
        <PillTabs
          value={funnelDays}
          onChange={setFunnelDays}
          options={[
            { value: 7, label: "Last 7 days" },
            { value: 30, label: "Last 30 days" },
          ]}
        />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <FunnelCard
          title="LinkedIn funnel"
          icon={Users}
          tone="text-sky-700"
          stages={LINKEDIN_STAGES}
          totals={totals}
          windowLabel={`Last ${funnelDays} days · booking calls is the main indicator`}
        />
        <FunnelCard
          title="Email funnel"
          icon={Mail}
          tone="text-violet-700"
          stages={EMAIL_STAGES}
          totals={totals}
          windowLabel={`Last ${funnelDays} days`}
        />
      </div>

      {/* ── Daily/weekly/monthly trend for any single metric ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Outreach trend</div>
            <div className="text-xs text-stone-400 mt-0.5">{chartLabel}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={chartMetric}
              onChange={(e) => setChartMetric(e.target.value)}
              className="text-xs border border-line rounded-full px-3 py-1.5 bg-white focus:outline-none"
            >
              <optgroup label="LinkedIn">
                {LINKEDIN_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </optgroup>
              <optgroup label="Email">
                {EMAIL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </optgroup>
            </select>
            <PillTabs
              value={granularity}
              onChange={setGranularity}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartSeries}>
            <defs>
              <linearGradient id="gOutreach" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.32} />
                <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.gridline} vertical={false} />
            <XAxis
              dataKey="label"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              interval={granularity === "daily" ? 3 : granularity === "weekly" ? 1 : 0}
            />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <Tooltip {...chartTooltipStyle} formatter={(v) => [v, chartLabel]} />
            <Area type="monotone" dataKey={chartMetric} stroke={COLORS.accent} strokeWidth={2.5} fill="url(#gOutreach)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Log a day's numbers ── */}
      <Card className="p-5">
        <CardTitle sub="One entry per day — logging again for the same date updates it instead of adding a duplicate">
          Log outreach
        </CardTitle>
        <div className="mb-4">
          <label className="text-xs text-stone-500 font-medium">Date</label>
          <input
            type="date"
            value={logDate}
            max={today()}
            onChange={(e) => setLogDate(e.target.value)}
            className={`${inputCls} w-44 mt-1`}
          />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-semibold text-stone-600 mb-2.5 flex items-center gap-1.5">
              <Users size={13} className="text-sky-700" /> LinkedIn
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {LINKEDIN_STAGES.map((s) => (
                <div key={s.key}>
                  <label className="text-[11px] text-stone-400">{s.label}</label>
                  <input
                    type="number"
                    min="0"
                    value={logForm[s.key] || ""}
                    onChange={(e) => setLogForm({ ...logForm, [s.key]: Number(e.target.value) || 0 })}
                    className={`${inputCls} w-full mt-0.5`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-stone-600 mb-2.5 flex items-center gap-1.5">
              <Mail size={13} className="text-violet-700" /> Email
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {EMAIL_STAGES.map((s) => (
                <div key={s.key}>
                  <label className="text-[11px] text-stone-400">{s.label}</label>
                  <input
                    type="number"
                    min="0"
                    value={logForm[s.key] || ""}
                    onChange={(e) => setLogForm({ ...logForm, [s.key]: Number(e.target.value) || 0 })}
                    className={`${inputCls} w-full mt-0.5`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <PrimaryButton className="mt-5" icon={Plus} onClick={submitLog}>
          Save {logDate === today() ? "today's" : "this"} entry
        </PrimaryButton>
      </Card>

      {/* ── Recent entries — click a day to load it back into the form above ── */}
      <Card className="p-5">
        <CardTitle sub="Click a day to edit it">Recent entries</CardTitle>
        <div className="space-y-1">
          {recentEntries.map((e) => (
            <div key={e.id} className="group flex items-center justify-between gap-3 py-2.5 border-b border-stone-100 last:border-0">
              <button onClick={() => setLogDate(e.date)} className="text-sm text-stone-700 hover:text-emerald-700 text-left shrink-0 w-28">
                {new Date(e.date + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </button>
              <div className="flex items-center gap-3 text-[11px] text-stone-400 flex-1 justify-end flex-wrap">
                <span>{e.linkedinConnectionsSent || 0} sent</span>
                <span>{e.linkedinCallsBooked || 0} LI calls</span>
                <span>{e.emailSent || 0} emails</span>
                <span>{e.emailCallsBooked || 0} email calls</span>
              </div>
              <button
                onClick={() => onDeleteOutreachDay(e.id)}
                aria-label="Delete entry"
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-stone-300 hover:text-rose-500 transition p-1 shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {recentEntries.length === 0 && (
            <div className="text-xs text-stone-400 py-6 text-center">No entries logged yet — add today's numbers above.</div>
          )}
        </div>
      </Card>

      {/* ── Content performance (live from Buffer) ── */}
      {bufferConnected && (
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Content performance</div>
              <div className="text-xs text-stone-400 mt-0.5">
                Last 90 days on LinkedIn, live from Buffer
              </div>
            </div>
            <button
              onClick={() => setView("performance")}
              className="text-xs text-emerald-800 flex items-center gap-0.5 hover:underline shrink-0"
            >
              Full breakdown <ChevronRight size={13} />
            </button>
          </div>

          {perf.loading && !perf.totals?.posts ? (
            <div className="text-xs text-stone-400 py-10 text-center">
              <Loader2 size={16} className="animate-spin mx-auto mb-2" /> Loading from Buffer…
            </div>
          ) : perf.error ? (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{perf.error}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Impressions", value: compact(perf.totals.impressions), trend: perf.deltas?.impressions },
                  { label: "Reach", value: compact(perf.totals.reach), trend: perf.deltas?.reach },
                  { label: "Engagement rate", value: `${perf.totals.engagementRate}%` },
                  { label: "Posts published", value: perf.totals.posts, trend: perf.deltas?.posts },
                ].map((s) => (
                  <div key={s.label} className="bg-stone-50 border border-line rounded-xl p-3.5">
                    <div className="text-[11px] text-stone-400">{s.label}</div>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-bold text-stone-900 tnum">{s.value}</span>
                      {s.trend != null && (
                        <span className={`text-[11px] tnum ${s.trend >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          {s.trend >= 0 ? "+" : ""}{s.trend}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={perf.byMonth}>
                  <defs>
                    <linearGradient id="gGrowthContent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.violet} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={42} tickFormatter={compact} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => [v.toLocaleString(), "Impressions"]} />
                  <Area type="monotone" dataKey="impressions" stroke={COLORS.violet} strokeWidth={2.5} fill="url(#gGrowthContent)" />
                </AreaChart>
              </ResponsiveContainer>

              {perf.topPosts?.length > 0 && (
                <div className="mt-5 pt-4 border-t border-stone-100">
                  <div className="text-xs font-medium text-stone-500 mb-2">Top posts by impressions</div>
                  <div className="space-y-1">
                    {perf.topPosts.slice(0, 3).map((p) => (
                      <a
                        key={p.id}
                        href={p.externalLink || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start gap-3 py-2.5 border-b border-stone-100 last:border-0 hover:bg-stone-50 -mx-2 px-2 rounded-lg transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-stone-700 line-clamp-1 group-hover:text-stone-900">{p.text || "(no text)"}</div>
                          <div className="text-[11px] text-stone-400 mt-0.5">
                            {new Date(p.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {p.metrics.reactions} reactions · {p.metrics.comments} comments
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-stone-600">
                          <Eye size={13} className="text-stone-300" />
                          <span className="text-sm font-semibold tnum">{compact(p.metrics.impressions)}</span>
                          <ExternalLink size={12} className="text-stone-300 group-hover:text-emerald-700" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <CardTitle sub="Sourced from CRM contact attribution">Channel performance</CardTitle>
          <div className="space-y-3">
            {data.channelPerf.map((ch) => (
              <div key={ch.channel} className="flex items-center gap-3">
                <span className="text-xs text-stone-500 w-32 shrink-0 truncate">{ch.channel}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-2">
                  <div className="bg-emerald-700 h-2 rounded-full" style={{ width: `${ch.value}%` }} />
                </div>
                <span className="text-xs text-stone-500 w-9 text-right tnum">{ch.value}%</span>
              </div>
            ))}
            {data.channelPerf.length === 0 && (
              <div className="text-xs text-stone-400 py-4 text-center">No channel data yet.</div>
            )}
          </div>
          <div className="text-xs text-stone-400 mt-4">
            Will sync automatically once the Apollo and Lemlist integrations are live.
          </div>
        </Card>

        <Card className="p-5">
          <CardTitle sub="Ranked by closed deal value">Top clients this period</CardTitle>
          <div className="space-y-2">
            {topClients.slice(0, 4).map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
                <Avatar name={c.name} photoUrl={c.photoUrl} logoUrl={c.logoUrl} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-800 truncate">{c.name}</div>
                  <div className="text-[11px] text-stone-400 truncate">{c.company}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] text-stone-400">Calls</div>
                    <div className="text-xs font-semibold text-stone-700 tnum">{c.calls}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-stone-400">Closed</div>
                    <div className="text-xs font-semibold text-stone-700 tnum">{money(c.dealValue)}</div>
                  </div>
                  <Badge tone={healthTone(c.health)}>{c.health}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

    </div>
  );
}
