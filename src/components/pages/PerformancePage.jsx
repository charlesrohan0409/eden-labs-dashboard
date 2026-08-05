import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  Eye, Users, Heart, MessageSquare, RefreshCw, Loader2, ExternalLink, AlertCircle,
  TrendingUp, Repeat2, BarChart3, Plug,
} from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import IconStat from "../ui/IconStat";
import PillTabs from "../ui/PillTabs";
import PrimaryButton from "../ui/PrimaryButton";
import { useBufferPerformance, RANGES } from "../../hooks/useBufferPerformance";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";

const SERIES = {
  impressions: { key: "impressions", label: "Impressions", color: COLORS.accent },
  reach: { key: "reach", label: "Reach", color: COLORS.teal },
  engagements: { key: "engagements", label: "Engagements", color: COLORS.violet },
  posts: { key: "posts", label: "Posts published", color: COLORS.amber },
};

const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n ?? 0));

export default function PerformancePage({ data }) {
  const [range, setRange] = useState("90");
  const [series, setSeries] = useState("impressions");
  const [sortBy, setSortBy] = useState("impressions");

  const bufferConnected = !!data.integrations.find((i) => i.id === "buffer")?.connected;
  const perf = useBufferPerformance({ enabled: bufferConnected, range });
  const { loading, error, totals, byMonth, byDay, byChannel, deltas, topPosts, fetchedAt, refresh } = perf;

  if (!bufferConnected) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Performance</h1>
          <p className="text-sm text-stone-500 mt-1">How your published content is actually doing.</p>
        </div>
        <Card className="p-10 text-center">
          <div className="w-11 h-11 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto">
            <Plug size={18} className="text-stone-400" />
          </div>
          <div className="text-[15px] font-semibold text-stone-800 mt-4">Buffer isn't connected</div>
          <div className="text-sm text-stone-500 mt-1 max-w-sm mx-auto">
            Impressions, reach, and engagement all come from Buffer. Connect it on the Integrations
            page and this fills in automatically.
          </div>
        </Card>
      </div>
    );
  }

  const sortedPosts = [...(topPosts || [])].sort((a, b) => {
    if (sortBy === "recent") return new Date(b.sentAt) - new Date(a.sentAt);
    return (b.metrics[sortBy] || 0) - (a.metrics[sortBy] || 0);
  });

  const bestDay = [...(byDay || [])].filter((d) => d.posts > 0).sort((a, b) => b.avgImpressions - a.avgImpressions)[0];
  const maxDayAvg = Math.max(...(byDay || []).map((d) => d.avgImpressions), 1);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Performance</h1>
          <p className="text-sm text-stone-500 mt-1">
            Live from Buffer{fetchedAt ? ` · synced ${new Date(fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PillTabs value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
          <PrimaryButton variant="ghost" icon={loading ? Loader2 : RefreshCw} onClick={refresh} disabled={loading}>
            {loading ? "Syncing…" : "Refresh"}
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading && !totals?.posts ? (
        <Card className="p-16 text-center text-sm text-stone-400">
          <Loader2 size={20} className="animate-spin mx-auto mb-3" />
          Pulling your post metrics from Buffer…
        </Card>
      ) : totals?.posts === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-[15px] font-semibold text-stone-800">No published posts in this window</div>
          <div className="text-sm text-stone-500 mt-1">Try a longer range.</div>
        </Card>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <IconStat
              dark icon={Eye} label="Impressions" value={compact(totals.impressions)}
              trend={deltas?.impressions} trendLabel="vs previous period"
              spark={
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={byMonth}>
                    <defs>
                      <linearGradient id="gPerfHero" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.accentSoft} stopOpacity={0.5} />
                        <stop offset="95%" stopColor={COLORS.accentSoft} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="impressions" stroke={COLORS.accentSoft} strokeWidth={2} fill="url(#gPerfHero)" />
                  </AreaChart>
                </ResponsiveContainer>
              }
            />
            <IconStat icon={Users} tone="teal" label="Reach" value={compact(totals.reach)} trend={deltas?.reach} trendLabel="unique people" />
            <IconStat icon={TrendingUp} tone="violet" label="Engagement rate" value={totals.engagementRate} unit="%" trendLabel={`${totals.engagements} total engagements`} />
            <IconStat icon={BarChart3} tone="amber" label="Posts published" value={totals.posts} trend={deltas?.posts} trendLabel={`${compact(totals.avgImpressions)} avg impressions`} />
          </div>

          {/* Secondary stat strip */}
          <Card className="p-1">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-stone-100">
              {[
                { icon: Heart, label: "Reactions", value: totals.reactions, tone: "text-rose-500" },
                { icon: MessageSquare, label: "Comments", value: totals.comments, tone: "text-sky-600" },
                { icon: Repeat2, label: "Shares", value: totals.shares, tone: "text-emerald-600" },
                { icon: Eye, label: "Avg per post", value: totals.avgImpressions, tone: "text-violet-600" },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="px-4 py-3.5 flex items-center gap-3">
                    <Icon size={16} className={s.tone} />
                    <div>
                      <div className="text-[11px] text-stone-400">{s.label}</div>
                      <div className="text-lg font-bold text-stone-900 tnum leading-tight">{s.value.toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Trend */}
          <Card className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Trend</div>
                <div className="text-xs text-stone-400 mt-0.5">Month by month</div>
              </div>
              <PillTabs
                value={series}
                onChange={setSeries}
                options={Object.values(SERIES).map((s) => ({ value: s.key, label: s.label }))}
              />
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={byMonth}>
                <defs>
                  <linearGradient id="gPerfTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES[series].color} stopOpacity={0.32} />
                    <stop offset="95%" stopColor={SERIES[series].color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={compact} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [v.toLocaleString(), SERIES[series].label]} />
                <Area type="monotone" dataKey={SERIES[series].key} stroke={SERIES[series].color} strokeWidth={2.5} fill="url(#gPerfTrend)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Best day */}
            <Card className="p-5">
              <CardTitle sub={bestDay ? `${bestDay.day} performs best — ${compact(bestDay.avgImpressions)} avg impressions` : "Average impressions by weekday"}>
                Best day to post
              </CardTitle>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byDay}>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={compact} />
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(v, n, p) => [`${v.toLocaleString()} avg · ${p.payload.posts} posts`, "Impressions"]}
                  />
                  <Bar dataKey="avgImpressions" radius={[4, 4, 0, 0]} barSize={26}>
                    {byDay.map((d) => (
                      <Cell key={d.day} fill={d.avgImpressions === maxDayAvg ? COLORS.accent : "#D6D3D1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-[11px] text-stone-400 mt-2">
                Based on {totals.posts} posts in this range — treat lightly until each weekday has a few posts behind it.
              </div>
            </Card>

            {/* Channels */}
            <Card className="p-5">
              <CardTitle sub="Where the impressions came from">By channel</CardTitle>
              <div className="space-y-3">
                {byChannel.map((c) => {
                  const share = totals.impressions ? Math.round((c.impressions / totals.impressions) * 100) : 0;
                  return (
                    <div key={c.channelId}>
                      <div className="flex items-center gap-2.5 mb-1.5">
                        {c.avatar
                          ? <img src={c.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          : <div className="w-7 h-7 rounded-full bg-stone-200 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-stone-800 truncate">{c.name}</div>
                          <div className="text-[11px] text-stone-400">{c.posts} posts · {c.engagementRate}% eng.</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-stone-900 tnum">{compact(c.impressions)}</div>
                          <div className="text-[11px] text-stone-400">{share}%</div>
                        </div>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-700 rounded-full" style={{ width: `${Math.max(share, 2)}%` }} />
                      </div>
                    </div>
                  );
                })}
                {byChannel.length === 0 && <div className="text-xs text-stone-400">No channel data.</div>}
              </div>
            </Card>
          </div>

          {/* Post table */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Every post</div>
                <div className="text-xs text-stone-400 mt-0.5">{sortedPosts.length} published in this range</div>
              </div>
              <PillTabs
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { value: "impressions", label: "Impressions" },
                  { value: "engagements", label: "Engagement" },
                  { value: "comments", label: "Comments" },
                  { value: "recent", label: "Recent" },
                ]}
              />
            </div>

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs text-stone-400 bg-stone-50">
                    <th className="py-2.5 px-3 font-medium rounded-l-lg">Post</th>
                    <th className="py-2.5 px-3 font-medium text-right">Impressions</th>
                    <th className="py-2.5 px-3 font-medium text-right">Reach</th>
                    <th className="py-2.5 px-3 font-medium text-right">Reactions</th>
                    <th className="py-2.5 px-3 font-medium text-right">Comments</th>
                    <th className="py-2.5 px-3 font-medium text-right">Eng.</th>
                    <th className="py-2.5 px-3 font-medium rounded-r-lg" />
                  </tr>
                </thead>
                <tbody>
                  {sortedPosts.map((p) => (
                    <tr key={p.id} className="border-b border-stone-100 last:border-0 align-top">
                      <td className="py-3 px-3 max-w-[22rem]">
                        <div className="text-stone-800 line-clamp-2 leading-snug">{p.text || "(no text)"}</div>
                        <div className="text-[11px] text-stone-400 mt-1 flex items-center gap-1.5 flex-wrap">
                          <span>{new Date(p.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })}</span>
                          <span>·</span>
                          <span className="truncate max-w-[9rem]">{p.channelName}</span>
                          {p.via === "buffer" && <Badge tone="teal">via Buffer</Badge>}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-stone-900 tnum">{p.metrics.impressions.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-stone-600 tnum">{p.metrics.reach.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right text-stone-600 tnum">{p.metrics.reactions}</td>
                      <td className="py-3 px-3 text-right tnum">
                        {p.metrics.comments > 0
                          ? <Badge tone="sky">{p.metrics.comments}</Badge>
                          : <span className="text-stone-300">0</span>}
                      </td>
                      <td className="py-3 px-3 text-right tnum">
                        {p.metrics.engagementRate
                          ? <Badge tone={p.metrics.engagementRate >= totals.engagementRate ? "emerald" : "stone"}>{p.metrics.engagementRate}%</Badge>
                          : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {p.externalLink && (
                          <a
                            href={p.externalLink}
                            target="_blank"
                            rel="noreferrer"
                            title="Open on LinkedIn"
                            className="inline-flex text-stone-400 hover:text-emerald-700"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="text-xs text-stone-400">
            Metrics come from Buffer and refresh on their own schedule — the numbers lag LinkedIn by a
            few hours. Buffer's API exposes counts only, so comment text isn't available here; use the
            link on each row to read and reply on LinkedIn.
          </div>
        </>
      )}
    </div>
  );
}
