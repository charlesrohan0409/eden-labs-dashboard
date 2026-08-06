import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ArrowLeft, Plus, Send, Phone, DollarSign, FileText, Eye, ExternalLink, Loader2, ChevronRight } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import IconStat from "../ui/IconStat";
import Avatar from "../ui/Avatar";
import PillTabs from "../ui/PillTabs";
import PrimaryButton from "../ui/PrimaryButton";
import Badge from "../ui/Badge";
import { MONTHS, computeHealthScore, healthTone } from "../../lib/utils";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { useBufferPerformance } from "../../hooks/useBufferPerformance";
import { useCurrency } from "../../hooks/useCurrency";

const SERIES_CONFIG = {
  outreach: { key: "outreach", label: "Outreach sent", color: COLORS.accent },
  calls: { key: "calls", label: "Calls booked", color: COLORS.teal },
  content: { key: "content", label: "Content published", color: COLORS.amber },
};

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n ?? 0));

export default function GrowthDetail({ data, setView, onLogGrowth }) {
  const { money } = useCurrency();
  const [form, setForm] = useState({ contentPosts: "", outreachSent: "", callsBooked: "" });
  const [series, setSeries] = useState("outreach");

  // Content reach is growth too — pull the real numbers rather than only the
  // hand-logged post counts.
  const bufferConnected = !!data.integrations.find((i) => i.id === "buffer")?.connected;
  const perf = useBufferPerformance({ enabled: bufferConnected, range: "90" });

  const callsByMonth = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, calls: 0 }));
    data.calls.forEach((c) => {
      const m = MONTHS[new Date(c.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m].calls += 1;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [data.calls]);

  const dealsByMonth = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, deals: 0, value: 0 }));
    data.contacts.filter((c) => c.stage === "closed" && c.closedDate).forEach((c) => {
      const m = MONTHS[new Date(c.closedDate).getMonth() - 2];
      if (byMonth[m]) { byMonth[m].deals += 1; byMonth[m].value += Number(c.dealValue) || 0; }
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [data.contacts]);

  const combined = MONTHS.map((m) => {
    const g = data.growthLog.find((x) => x.month === m) || {};
    const c = callsByMonth.find((x) => x.month === m) || {};
    return { month: m, outreach: g.outreachSent || 0, calls: c.calls || 0, content: g.contentPosts || 0 };
  });

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

  const cfg = SERIES_CONFIG[series];
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
        <IconStat icon={Send} tone="sky" label="Outreach sent" value={combined.at(-1)?.outreach ?? 0} trend={trend(combined, "outreach")} trendLabel="vs last month" />
        <IconStat icon={Phone} tone="amber" label="Calls booked" value={combined.at(-1)?.calls ?? 0} trend={trend(combined, "calls")} trendLabel="vs last month" />
        <IconStat icon={DollarSign} tone="emerald" label="Deals closed" value={dealsByMonth.at(-1)?.deals ?? 0} trend={trend(dealsByMonth, "deals")} trendLabel="vs last month" />
        <IconStat icon={FileText} tone="violet" label="Content published" value={combined.at(-1)?.content ?? 0} trend={trend(combined, "content")} trendLabel="vs last month" />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Momentum</div>
            <div className="text-xs text-stone-400 mt-0.5">Trend over the last 6 months</div>
          </div>
          <PillTabs
            value={series}
            onChange={setSeries}
            options={[
              { value: "outreach", label: "Outreach" },
              { value: "calls", label: "Calls" },
              { value: "content", label: "Content" },
            ]}
          />
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={combined}>
            <defs>
              <linearGradient id="gSeries" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.32} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={COLORS.gridline} vertical={false} />
            <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
            <Tooltip {...chartTooltipStyle} formatter={(v) => [v, cfg.label]} />
            <Area type="monotone" dataKey={cfg.key} stroke={cfg.color} strokeWidth={2.5} fill="url(#gSeries)" />
          </AreaChart>
        </ResponsiveContainer>
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

      <Card className="p-5">
        <CardTitle sub="Adds an entry to the growth log for the current month">Log this month's numbers</CardTitle>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "contentPosts", label: "Content posts" },
            { key: "outreachSent", label: "Outreach sent" },
            { key: "callsBooked", label: "Calls booked" },
          ].map((f) => (
            <input
              key={f.key}
              type="number"
              placeholder={f.label}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className={`${inputCls} flex-1 min-w-[9rem]`}
            />
          ))}
          <PrimaryButton
            icon={Plus}
            onClick={() => {
              if (!form.contentPosts && !form.outreachSent && !form.callsBooked) return;
              onLogGrowth({
                // Real current month, not a hardcoded one — this always
                // logged to "Aug" before, silently landing in the wrong
                // bucket outside August. "en-US" pins the exact "Mar"/"Apr"/
                // etc format the MONTHS array and every chart key off.
                month: new Date().toLocaleDateString("en-US", { month: "short" }),
                contentPosts: Number(form.contentPosts) || 0,
                outreachSent: Number(form.outreachSent) || 0,
                callsBooked: Number(form.callsBooked) || 0,
              });
              setForm({ contentPosts: "", outreachSent: "", callsBooked: "" });
            }}
          >
            Log entry
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
