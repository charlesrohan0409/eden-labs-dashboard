import { useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  TrendingUp, DollarSign, CheckCircle2, ChevronRight, Send, FileText, Phone,
  ListChecks, ArrowUpRight, AlertTriangle, CalendarDays, Loader2,
} from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import IconStat from "../ui/IconStat";
import Avatar from "../ui/Avatar";
import TaskList from "../ui/TaskList";
import MeetingRow from "../ui/MeetingRow";
import { MONTHS, computeHealthScore, healthTone, STAGE_WEIGHTS, relativeDays, isMetricOnTrack, metricProgressPct, computeMRR } from "../../lib/utils";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { useBufferPerformance } from "../../hooks/useBufferPerformance";
import { useCurrency } from "../../hooks/useCurrency";
import { useGoogleCalendar } from "../../hooks/useGoogleCalendar";
import { buildDailySeries, sumEntries, forClient } from "../../lib/outreach";

function greetingFor(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeDashboard({ data, setView, setSelectedClient, onAddTask, onToggleTask, onDeleteTask, onUpdateTask, onReorderTasks }) {
  const { money } = useCurrency();
  const finSeries = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, revenue: 0, cost: 0 }));
    data.invoices.forEach((i) => {
      const m = MONTHS[new Date(i.date).getMonth() - 2];
      if (byMonth[m] && i.status === "paid") byMonth[m].revenue += i.amount;
    });
    data.expenses.forEach((e) => {
      const m = MONTHS[new Date(e.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m].cost += e.amount;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [data.invoices, data.expenses]);

  const totalRevenue = finSeries.reduce((s, m) => s + m.revenue, 0);
  const totalCost = finSeries.reduce((s, m) => s + m.cost, 0);
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue ? Math.round((profit / totalRevenue) * 100) : 0;

  const mrr = computeMRR(data.clients);

  const onTrackCount = data.clients.reduce(
    (acc, c) => acc + c.delivery.filter(isMetricOnTrack).length, 0
  );
  const totalMetrics = data.clients.reduce((acc, c) => acc + c.delivery.length, 0);
  const onTrackPct = totalMetrics ? Math.round((onTrackCount / totalMetrics) * 100) : 0;

  const statusCounts = data.clients.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  const weightedPipeline = data.contacts
    .filter((c) => !c.clientId && c.stage !== "closed")
    .reduce((s, c) => s + (Number(c.dealValue) || 0) * (STAGE_WEIGHTS[c.stage] ?? 0), 0);

  const openTasks = data.tasks.filter((t) => !t.done);
  const overdueTasks = openTasks.filter((t) => {
    const r = relativeDays(t.dueDate);
    return r && r.overdue;
  });

  const healthScores = data.clients.map((c) => ({
    ...c,
    health: computeHealthScore(c, data.invoices),
  }));
  const atRiskAuto = healthScores.filter((c) => c.health < 50);

  // Real outreach tracking (LinkedIn + email funnels), not the old
  // hand-logged monthly growthLog — see lib/outreach.js and the Growth
  // detail page for the full daily/weekly/monthly breakdown.
  // Agency-level rows only — the growth mini-card tracks the owner's own
  // outreach, matching the Growth detail page it links to.
  const outreachLog = forClient(data.outreachLog, null);
  const dailyOutreach = useMemo(
    () => buildDailySeries(outreachLog, 14).map((d) => ({ ...d, combinedSent: d.linkedinConnectionsSent + d.emailSent })),
    [outreachLog]
  );
  const since7 = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }, []);
  const last7 = useMemo(() => sumEntries(outreachLog, since7), [outreachLog, since7]);
  const contentPublishedThisMonth = useMemo(() => {
    const now = new Date();
    return data.posts.filter((p) => {
      if (p.status !== "published" || !p.date) return false;
      const d = new Date(p.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [data.posts]);

  const bufferConnected = !!data.integrations.find((i) => i.id === "buffer")?.connected;
  const perf = useBufferPerformance({ enabled: bufferConnected, range: "90" });
  const calendar = useGoogleCalendar();
  const nextMeetings = calendar.upcoming.slice(0, 4);

  return (
    <div className="space-y-5">
      {/* ── Greeting header ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="rounded-2xl px-6 py-4 sm:py-5 flex-1 min-w-[16rem] bg-night">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {greetingFor(new Date().getHours())}, {(data.profile?.name || "Charles").split(" ")[0]}
          </h1>
          <p className="text-sm text-white/70 mt-0.5">Stay on top of your clients, delivery, and pipeline.</p>
        </div>
        <div className="flex items-center gap-2.5 bg-white border border-line rounded-full pl-3 pr-1.5 py-1.5">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-stone-800 leading-none">{data.profile?.name}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">{data.profile?.company || "Eden Labs"}</div>
          </div>
          <Avatar name={data.profile?.name || "Charles Rohan"} photoUrl={data.profile?.photoUrl} size={30} />
        </div>
      </div>

      {/* ── Headline stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IconStat
          dark
          privacyToggle
          icon={DollarSign}
          label="Monthly recurring"
          value={money(mrr)}
          trendLabel={`${statusCounts.active || 0} active contracts`}
          spark={
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={finSeries}>
                <defs>
                  <linearGradient id="gHomeMrr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.accentSoft} stopOpacity={0.5} />
                    <stop offset="95%" stopColor={COLORS.accentSoft} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="revenue" stroke={COLORS.accentSoft} strokeWidth={2} fill="url(#gHomeMrr)" />
              </AreaChart>
            </ResponsiveContainer>
          }
        />
        <IconStat
          icon={CheckCircle2}
          tone="teal"
          label="Delivery on track"
          value={onTrackPct}
          unit="%"
          trendLabel={`${onTrackCount} of ${totalMetrics} metrics`}
        />
        <IconStat
          icon={TrendingUp}
          tone="violet"
          label="Weighted pipeline"
          value={money(Math.round(weightedPipeline))}
          trendLabel="probability adjusted"
        />
        <IconStat
          icon={ListChecks}
          tone={overdueTasks.length ? "rose" : "emerald"}
          label="Open tasks"
          value={openTasks.length}
          trendLabel={overdueTasks.length ? `${overdueTasks.length} overdue` : "nothing overdue"}
        />
      </div>

      {/* ── Tasks + delivery ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TaskList
            tasks={data.tasks}
            clients={data.clients}
            onAdd={onAddTask}
            onToggle={onToggleTask}
            onDelete={onDeleteTask}
            onUpdate={onUpdateTask}
            onReorder={onReorderTasks}
            title="Your tasks"
          />
        </div>

        <Card className="p-5">
          <CardTitle
            sub="Metrics hitting target"
            action={
              <button onClick={() => setView("clients")} className="text-xs text-emerald-800 flex items-center gap-0.5 hover:underline shrink-0">
                All clients <ChevronRight size={13} />
              </button>
            }
          >
            Delivery
          </CardTitle>

          <div className="space-y-3">
            {healthScores.map((c) => {
              const onTrack = c.delivery.filter(isMetricOnTrack).length;
              const pct = c.delivery.length ? Math.round((onTrack / c.delivery.length) * 100) : 0;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c.id); setView("client-detail"); }}
                  className="w-full text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.name} photoUrl={c.photoUrl} logoUrl={c.logoUrl} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-800 truncate group-hover:text-emerald-800">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-stone-400">{onTrack}/{c.delivery.length} on track</div>
                    </div>
                    <Badge tone={healthTone(c.health)}>{c.health}</Badge>
                  </div>
                  <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-600" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {atRiskAuto.length > 0 && (
            <div className="mt-4 pt-3 border-t border-stone-100 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {atRiskAuto.map((c) => c.name).join(", ")} scoring below 50 — worth a check-in even if status shows active.
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* ── Growth + finance ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <CardTitle
            sub="Connections + emails sent, last 14 days"
            action={
              <button onClick={() => setView("growth-detail")} className="text-xs text-emerald-800 flex items-center gap-0.5 hover:underline shrink-0">
                View details <ChevronRight size={13} />
              </button>
            }
          >
            Growth
          </CardTitle>

          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={dailyOutreach}>
              <defs>
                <linearGradient id="gHomeGrowth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={COLORS.gridline} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
              <Tooltip {...chartTooltipStyle} formatter={(v) => [v, "Outreach sent"]} />
              <Area type="monotone" dataKey="combinedSent" stroke={COLORS.accent} fill="url(#gHomeGrowth)" strokeWidth={2.5} name="Outreach sent" />
            </AreaChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-3 gap-2 border-t border-stone-100 mt-3 pt-4">
            {[
              { icon: FileText, tone: "bg-violet-50 text-violet-700", label: "Content", value: contentPublishedThisMonth, sub: "this month" },
              { icon: Send, tone: "bg-sky-50 text-sky-700", label: "Outreach", value: last7.linkedinConnectionsSent + last7.emailSent, sub: "last 7d" },
              { icon: Phone, tone: "bg-amber-50 text-amber-700", label: "Calls", value: last7.linkedinCallsBooked + last7.emailCallsBooked, sub: "last 7d" },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${s.tone}`}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-stone-400">{s.label}</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-bold text-stone-900 tnum">{s.value ?? 0}</span>
                      <span className="text-[10px] text-stone-400">{s.sub}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Content growth — impressions and engagement, live from Buffer.
              Nothing else on this chart on purpose; the full breakdown lives
              on the Growth detail page and the Performance page. */}
          {bufferConnected ? (
            <div className="border-t border-stone-100 mt-4 pt-4">
              <div className="text-[11px] font-medium text-stone-400 mb-2">Content growth · impressions &amp; engagement</div>
              {perf.loading && !perf.totals?.posts ? (
                <div className="h-24 flex items-center justify-center text-xs text-stone-400">
                  <Loader2 size={14} className="animate-spin mr-2" /> Loading…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={130}>
                  <AreaChart data={perf.byMonth}>
                    <defs>
                      <linearGradient id="gHomeImpr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.violet} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="impressions" hide />
                    <YAxis yAxisId="engagements" hide orientation="right" />
                    <Tooltip {...chartTooltipStyle} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      yAxisId="impressions" type="monotone" dataKey="impressions" name="Impressions"
                      stroke={COLORS.violet} fill="url(#gHomeImpr)" strokeWidth={2}
                    />
                    <Area
                      yAxisId="engagements" type="monotone" dataKey="engagements" name="Engagement"
                      stroke={COLORS.teal} fill="none" strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          ) : (
            <div className="border-t border-stone-100 mt-4 pt-3 text-xs text-stone-400">
              Connect Buffer on Integrations to see content impressions &amp; engagement here.
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <CardTitle
              sub="Revenue vs cost"
              action={
                <button onClick={() => setView("finance-detail")} className="text-xs text-emerald-800 flex items-center gap-0.5 hover:underline shrink-0">
                  Details <ChevronRight size={13} />
                </button>
              }
            >
              Finance
            </CardTitle>

            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={finSeries} barGap={2}>
                <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                <Bar dataKey="revenue" fill={COLORS.accent} radius={[3, 3, 0, 0]} name="Revenue" barSize={9} />
                <Bar dataKey="cost" fill={COLORS.night} radius={[3, 3, 0, 0]} name="Cost" barSize={9} />
              </BarChart>
            </ResponsiveContainer>

            <div className="flex items-center gap-4 text-[11px] text-stone-400 mt-1">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-700" /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-night" /> Cost</span>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-stone-100 mt-4 pt-4">
              <div>
                <div className="text-[11px] text-stone-400">Revenue</div>
                <div className="text-sm font-bold text-stone-900 tnum">{money(totalRevenue)}</div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Profit</div>
                <div className="text-sm font-bold text-stone-900 tnum">{money(profit)}</div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Margin</div>
                <div className="text-sm font-bold text-emerald-700 tnum flex items-center gap-0.5">
                  {margin}% <ArrowUpRight size={12} />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardTitle
              sub="From your real calendar"
              action={
                <button onClick={() => setView("calendar")} className="text-xs text-emerald-800 flex items-center gap-0.5 hover:underline shrink-0">
                  Full calendar <ChevronRight size={13} />
                </button>
              }
            >
              <span className="flex items-center gap-2"><CalendarDays size={15} className="text-sky-600" /> Upcoming meetings</span>
            </CardTitle>

            {calendar.loading && nextMeetings.length === 0 ? (
              <div className="text-xs text-stone-400 py-6 text-center">
                <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
              </div>
            ) : calendar.error ? (
              <div className="text-xs text-stone-400 py-2">
                {calendar.error.includes("not set on the server")
                  ? "Not connected — add GOOGLE_CALENDAR_ICAL_URL in .env.local."
                  : calendar.error}
              </div>
            ) : nextMeetings.length === 0 ? (
              <div className="text-xs text-stone-400 py-6 text-center">Nothing coming up.</div>
            ) : (
              <div>
                {nextMeetings.map((e) => <MeetingRow key={e.uid + e.start} event={e} dense />)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
