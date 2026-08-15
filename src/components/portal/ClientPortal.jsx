import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { LogOut, FileText, Phone, DollarSign, CheckCircle2 } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import Avatar from "../ui/Avatar";
import StatBlock from "../ui/StatBlock";
import PillTabs from "../ui/PillTabs";
import PrimaryButton from "../ui/PrimaryButton";
import PostComposer from "../ui/PostComposer";
import PendingApproval from "../ui/PendingApproval";
import CommentThread from "../ui/CommentThread";
import MiniCalendar from "../ui/MiniCalendar";
import CrmBoard from "../ui/CrmBoard";
import { MONTHS, isMetricOnTrack, metricProgressPct, contractValueLabel } from "../../lib/utils";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { listFathomMeetings, matchMeetingsToClient } from "../../lib/fathom";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../../data/seed";
import { useCurrency } from "../../hooks/useCurrency";

const TAB_LABELS = {
  overview: "Overview", content: "Content", outreach: "Outreach", crm: "CRM",
  transcripts: "Transcripts", dms: "Messages", contract: "Contract",
};

export default function ClientPortal({
  data, clientId, onExit, onAddPost, onUpdatePost, onAddContact, onUpdateStage,
  onAddComment, onUpdatePostStatus, token,
}) {
  const [tab, setTab] = useState("overview");
  const [contentView, setContentView] = useState("list");
  const [transcripts, setTranscripts] = useState([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [transcriptsError, setTranscriptsError] = useState("");
  const { money } = useCurrency();

  const client = data.clients.find((c) => c.id === clientId);
  const clientDms = data.dms.filter((d) => d.clientId === clientId);
  const clientPosts = data.posts.filter((p) => p.clientId === clientId);
  const publishedWithStats = clientPosts.filter((p) => p.status === "published" && p.stats);
  const clientCalls = data.calls.filter((c) => c.clientId === clientId);
  const clientOutreach = data.outreachByChannel.filter((o) => o.clientId === clientId);
  const clientContacts = data.contacts.filter((c) => c.clientId === clientId);
  const clientDeals = clientContacts.filter((c) => c.stage === "closed");
  // No Buffer wiring in the client portal on purpose — Buffer is connected
  // under Charles's own personal account (see Integrations), so it never
  // publishes on a client's behalf. Approving here only flips local status;
  // actually getting it onto LinkedIn is still a manual step for Charles.

  const postsSeries = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, published: 0, scheduled: 0 }));
    clientPosts.forEach((p) => {
      const m = MONTHS[new Date(p.date).getMonth() - 2];
      if (byMonth[m] && (p.status === "published" || p.status === "scheduled")) byMonth[m][p.status] += 1;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [clientPosts]);

  const callsSeries = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, inbound: 0, outbound: 0 }));
    clientCalls.forEach((c) => {
      const m = MONTHS[new Date(c.date).getMonth() - 2];
      if (byMonth[m]) byMonth[m][c.direction] += 1;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [clientCalls]);

  const dealsSeries = useMemo(() => {
    const byMonth = {};
    MONTHS.forEach((m) => (byMonth[m] = { month: m, value: 0 }));
    clientDeals.forEach((c) => {
      if (!c.closedDate) return;
      const m = MONTHS[new Date(c.closedDate).getMonth() - 2];
      if (byMonth[m]) byMonth[m].value += Number(c.dealValue) || 0;
    });
    return MONTHS.map((m) => byMonth[m]);
  }, [clientDeals]);

  if (!client) return null;

  // Goes through /api/fathom — Charles's own account key, server-side, never
  // something a client types in here. Matched to this client by their real
  // email domain/name against Fathom's calendar_invitees, not a string search.
  const fetchTranscripts = async () => {
    setTranscriptsLoading(true);
    setTranscriptsError("");
    try {
      const meetings = await listFathomMeetings();
      setTranscripts(matchMeetingsToClient(meetings, client));
    } catch (e) {
      setTranscriptsError(e.message);
    } finally {
      setTranscriptsLoading(false);
    }
  };

  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const totalClosed = clientDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0);

  // Only the tabs this client's service line uses — a book-editing client has
  // no LinkedIn content pipeline or CRM to look at.
  const clientType = CLIENT_TYPES[client.type] || CLIENT_TYPES[DEFAULT_CLIENT_TYPE];
  const visibleTabs = clientType.portalTabs.map((t) => ({ value: t, label: TAB_LABELS[t] || t }));
  const activeTab = clientType.portalTabs.includes(tab) ? tab : "overview";

  return (
    <div className="min-h-screen bg-canvas">
      <div className="bg-night text-white px-4 md:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={client.name} photoUrl={client.photoUrl} logoUrl={client.logoUrl} size={42} />
          <div>
            <div className="text-lg font-semibold tracking-tight">{client.company}</div>
            <div className="text-xs text-stone-400">Eden Labs · Client Dashboard</div>
          </div>
        </div>
        {/* Only present for the owner's own "Preview client portal" — a real
            client viewing their actual dashboard isn't "previewing" anything. */}
        {onExit && (
          <button onClick={onExit} className="text-xs text-stone-300 flex items-center gap-1.5 hover:text-white border border-white/10 rounded-full px-3.5 py-2">
            <LogOut size={13} /> Exit preview
          </button>
        )}
      </div>

      {/* The CRM board needs the full width; everything else reads better
          constrained, so the container widens only on that tab. */}
      <div className={`${activeTab === "crm" ? "max-w-[1400px]" : "max-w-5xl"} mx-auto p-4 md:p-8 space-y-5`}>
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
          <PillTabs value={activeTab} onChange={setTab} options={visibleTabs} size="md" />
        </div>

        {/* ══ Overview ══ */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <Card className="p-5">
              <CardTitle sub="What we committed to this cycle">
                <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-700" /> Your progress</span>
              </CardTitle>
              <div className="space-y-3">
                {client.delivery.map((d, i) => {
                  const onTrack = isMetricOnTrack(d);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-stone-600">{d.metric}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-stone-400 text-xs tnum">{d.current} / {d.target}</span>
                          <Badge tone={onTrack ? "emerald" : "amber"}>
                            {onTrack ? "on track" : "in progress"}
                          </Badge>
                        </div>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${onTrack ? "bg-emerald-600" : "bg-amber-500"}`}
                          style={{ width: `${metricProgressPct(d)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-5">
                <CardTitle sub="Published vs scheduled">
                  <span className="flex items-center gap-2"><FileText size={15} className="text-emerald-700" /> Posts</span>
                </CardTitle>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={postsSeries} barGap={3}>
                    <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                    <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={26} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="published" fill={COLORS.accent} radius={[3, 3, 0, 0]} name="Published" barSize={10} />
                    <Bar dataKey="scheduled" fill={COLORS.teal} radius={[3, 3, 0, 0]} name="Scheduled" barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-5">
                <CardTitle sub="Inbound vs outbound">
                  <span className="flex items-center gap-2"><Phone size={15} className="text-sky-700" /> Calls</span>
                </CardTitle>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={callsSeries} barGap={3}>
                    <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                    <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={26} />
                    <Tooltip {...chartTooltipStyle} />
                    <Bar dataKey="inbound" fill={COLORS.teal} radius={[3, 3, 0, 0]} name="Inbound" barSize={10} />
                    <Bar dataKey="outbound" fill={COLORS.muted} radius={[3, 3, 0, 0]} name="Outbound" barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <Card className="p-5">
              <CardTitle sub={`Total closed: ${money(totalClosed)}`}>
                <span className="flex items-center gap-2"><DollarSign size={15} className="text-amber-600" /> Deals closed</span>
              </CardTitle>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={dealsSeries}>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={42} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                  <Bar dataKey="value" fill={COLORS.amber} radius={[4, 4, 0, 0]} name="Deal value" barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <CommentThread comments={data.comments} clientId={clientId} tabKey="overview" author="Client" onAdd={onAddComment} />
          </div>
        )}

        {/* ══ Content ══ */}
        {activeTab === "content" && (
          <div className="space-y-4">
            <PendingApproval
              posts={clientPosts.filter((p) => p.status === "pending_review")}
              author={client.name}
              headline={client.company}
              avatarUrl={client.photoUrl}
              onApprove={(id) => onUpdatePostStatus(id, "scheduled")}
              onRequestChanges={(id, feedback) => {
                onUpdatePostStatus(id, "draft");
                onAddComment({
                  clientId, tab: "content", author: "Client",
                  text: `Requested changes: ${feedback}`,
                  date: new Date().toISOString().slice(0, 10) + " " + new Date().toTimeString().slice(0, 5),
                });
              }}
            />

            <Card className="p-4 sm:p-5">
              <PostComposer
                clientId={client.id}
                posts={data.posts}
                onAddPost={onAddPost}
                onUpdatePost={onUpdatePost}
                author={client.name}
                headline={client.company}
                avatarUrl={client.photoUrl}
                token={token}
              />
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="text-[15px] font-semibold text-stone-900 tracking-tight">Schedule</div>
                <PillTabs
                  value={contentView}
                  onChange={setContentView}
                  options={[{ value: "list", label: "List" }, { value: "calendar", label: "Calendar" }]}
                />
              </div>
              {contentView === "list" ? (
                <div className="space-y-1">
                  {clientPosts.map((p) => (
                    <div key={p.id} className="flex justify-between items-start gap-3 text-sm border-b border-stone-100 last:border-0 py-2.5">
                      <span className="text-stone-600 line-clamp-1 whitespace-pre-wrap">{p.content}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-stone-400 tnum">{p.date}</span>
                        <Badge tone={p.status === "published" ? "emerald" : p.status === "scheduled" ? "teal" : "stone"} dot>
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {clientPosts.length === 0 && <div className="text-xs text-stone-400 py-6 text-center">No posts yet.</div>}
                </div>
              ) : (
                <MiniCalendar posts={data.posts} clientId={clientId} />
              )}
            </Card>

            <Card className="p-5">
              <CardTitle sub="Synced from Buffer once connected">Post performance</CardTitle>
              {publishedWithStats.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={publishedWithStats.map((p) => ({ name: p.date.slice(5), likes: p.stats.likes, comments: p.stats.comments }))} barGap={3}>
                      <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                      <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={26} />
                      <Tooltip {...chartTooltipStyle} />
                      <Bar dataKey="likes" fill={COLORS.accent} radius={[3, 3, 0, 0]} name="Likes" barSize={12} />
                      <Bar dataKey="comments" fill={COLORS.teal} radius={[3, 3, 0, 0]} name="Comments" barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-3 divide-x divide-stone-100 border-t border-stone-100 mt-3 pt-1">
                    <StatBlock label="Total likes" value={publishedWithStats.reduce((s, p) => s + p.stats.likes, 0)} />
                    <StatBlock label="Total comments" value={publishedWithStats.reduce((s, p) => s + p.stats.comments, 0)} />
                    <StatBlock label="Total views" value={publishedWithStats.reduce((s, p) => s + p.stats.views, 0).toLocaleString()} />
                  </div>
                </>
              ) : (
                <div className="text-xs text-stone-400 py-6 text-center">No published posts with stats yet.</div>
              )}
            </Card>

            <CommentThread comments={data.comments} clientId={clientId} tabKey="content" author="Client" onAdd={onAddComment} />
          </div>
        )}

        {/* ══ Outreach ══ */}
        {activeTab === "outreach" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4">
                <div className="text-xs text-stone-400 font-medium">Inbound calls</div>
                <div className="text-2xl font-bold tracking-tight text-stone-900 mt-1 tnum">
                  {clientCalls.filter((c) => c.direction === "inbound").length}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-stone-400 font-medium">Outbound calls</div>
                <div className="text-2xl font-bold tracking-tight text-stone-900 mt-1 tnum">
                  {clientCalls.filter((c) => c.direction === "outbound").length}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-stone-400 font-medium">Deals closed</div>
                <div className="text-2xl font-bold tracking-tight text-stone-900 mt-1 tnum">{clientDeals.length}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-stone-400 font-medium">Closed value</div>
                <div className="text-2xl font-bold tracking-tight text-stone-900 mt-1 tnum">{money(totalClosed)}</div>
              </Card>
            </div>

            <Card className="p-5">
              <CardTitle sub="Messages sent per channel">Outreach by channel</CardTitle>
              <div className="space-y-3">
                {clientOutreach.map((o) => (
                  <div key={o.id} className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 w-32 shrink-0 truncate">{o.channel}</span>
                    <div className="flex-1 bg-stone-100 rounded-full h-2">
                      <div className="bg-emerald-700 h-2 rounded-full" style={{ width: `${Math.min(100, o.count)}%` }} />
                    </div>
                    <span className="text-xs text-stone-500 w-8 text-right tnum">{o.count}</span>
                  </div>
                ))}
                {clientOutreach.length === 0 && <div className="text-xs text-stone-400">No outreach logged yet.</div>}
              </div>
            </Card>

            <Card className="p-5">
              <CardTitle sub={`${clientCalls.length} calls logged`}>Call log</CardTitle>
              <div className="space-y-1">
                {clientCalls.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 text-sm border-b border-stone-100 last:border-0 py-2.5">
                    <Badge tone={c.direction === "inbound" ? "teal" : "stone"}>{c.direction}</Badge>
                    <span className="text-stone-600 flex-1">{c.notes}</span>
                    <span className="text-xs text-stone-400 shrink-0 tnum">{c.date}</span>
                  </div>
                ))}
                {clientCalls.length === 0 && <div className="text-xs text-stone-400 py-6 text-center">No calls logged yet.</div>}
              </div>
            </Card>

            <CommentThread comments={data.comments} clientId={clientId} tabKey="outreach" author="Client" onAdd={onAddComment} />
          </div>
        )}

        {/* ══ CRM ══ */}
        {activeTab === "crm" && (
          <div className="space-y-4">
            <CrmBoard
              contacts={clientContacts}
              onAddContact={(form) => onAddContact({ ...form, clientId })}
              onUpdateStage={onUpdateStage}
              showExtensionHint={false}
            />
            <CommentThread comments={data.comments} clientId={clientId} tabKey="crm" author="Client" onAdd={onAddComment} />
          </div>
        )}

        {/* ══ Transcripts ══ */}
        {activeTab === "transcripts" && (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="space-y-3">
                <CardTitle
                  sub="Pulled live from Fathom, matched to your meetings with Eden Labs"
                  action={
                    <PrimaryButton size="sm" variant="ghost" onClick={fetchTranscripts} disabled={transcriptsLoading}>
                      {transcriptsLoading ? "Fetching…" : transcripts.length ? "Refresh" : "Load meetings"}
                    </PrimaryButton>
                  }
                >
                  Meeting transcripts
                </CardTitle>

                {transcriptsError && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3.5 py-2.5">
                    {transcriptsError.includes("not set on the server")
                      ? "Meeting transcripts aren't connected yet — check back soon."
                      : transcriptsError}
                  </div>
                )}

                {transcripts.length > 0 ? (
                  <div className="space-y-1">
                    {transcripts.map((m) => (
                      <div key={m.recording_id} className="text-sm border-b border-stone-100 last:border-0 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-stone-700">{m.meeting_title || m.title || "Meeting"}</span>
                          {m.share_url && (
                            <a href={m.share_url} target="_blank" rel="noreferrer" className="text-xs text-emerald-800 hover:underline shrink-0">
                              Watch
                            </a>
                          )}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5">
                          {new Date(m.recording_start_time || m.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                        {m.default_summary?.markdown_formatted && (
                          <div className="text-xs text-stone-500 mt-1.5 whitespace-pre-wrap line-clamp-4">
                            {m.default_summary.markdown_formatted}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  !transcriptsLoading && !transcriptsError && (
                    <div className="text-xs text-stone-400 py-6 text-center">No transcripts pulled yet — hit "Load meetings".</div>
                  )
                )}
              </div>
            </Card>
            <CommentThread comments={data.comments} clientId={clientId} tabKey="transcripts" author="Client" onAdd={onAddComment} />
          </div>
        )}

        {/* ══ Messages ══ */}
        {activeTab === "dms" && (
          <div className="space-y-4">
            <Card className="p-5">
              <CardTitle sub="Outreach activity on your behalf">Messages</CardTitle>
              <div className="space-y-1">
                {clientDms.map((d) => (
                  <div key={d.id} className="flex items-start gap-2.5 text-sm py-2.5 border-b border-stone-100 last:border-0">
                    <Badge tone={d.direction === "sent" ? "teal" : "stone"}>
                      {d.direction === "sent" ? "Eden Labs" : "You"}
                    </Badge>
                    <span className="text-stone-600 flex-1">{d.content}</span>
                    <span className="text-xs text-stone-400 shrink-0 tnum">{d.date}</span>
                  </div>
                ))}
                {clientDms.length === 0 && <div className="text-sm text-stone-400 py-6 text-center">No messages yet.</div>}
              </div>
            </Card>
            <CommentThread comments={data.comments} clientId={clientId} tabKey="dms" author="Client" onAdd={onAddComment} />
          </div>
        )}

        {/* ══ Contract ══ */}
        {activeTab === "contract" && (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-stone-100">
                <div>
                  <div className="text-[11px] text-stone-400">{contractValueLabel(client.contract)}</div>
                  <div className="text-xl font-bold text-stone-900 tnum">{money(client.contract.value)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-stone-400">Status</div>
                  <div className="mt-1"><Badge tone="emerald" dot>{client.contract.status}</Badge></div>
                </div>
              </div>
              <div className="pt-4 font-serif text-[15px] text-stone-600 whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto">
                {client.contract.bodyText}
              </div>
            </Card>
            <CommentThread comments={data.comments} clientId={clientId} tabKey="contract" author="Client" onAdd={onAddComment} />
          </div>
        )}
      </div>
    </div>
  );
}
