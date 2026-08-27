import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  FileText, Phone, DollarSign, CheckCircle2, Download, MessageSquare,
  Video, Users, Send, Inbox,
} from "lucide-react";
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
import IconStat from "../ui/IconStat";
import PortalHero from "./PortalHero";
import PortalEmpty from "./PortalEmpty";
import CrmBoard from "../ui/CrmBoard";
import { isMetricOnTrack, metricProgressPct, contractValueLabel, monthBuckets, toDateKey } from "../../lib/utils";
import { COLORS, chartTooltipStyle, axisTick } from "../../lib/theme";
import { listFathomMeetings, matchMeetingsToClient } from "../../lib/fathom";
import { CLIENT_TYPES, DEFAULT_CLIENT_TYPE } from "../../data/seed";
import { useCurrency } from "../../hooks/useCurrency";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const TAB_LABELS = {
  overview: "Overview", content: "Content", outreach: "Outreach", crm: "CRM",
  transcripts: "Transcripts", dms: "Messages", contract: "Contract",
};

export default function ClientPortal({
  exitLabel = "Exit preview",
  data, clientId, onExit, onAddPost, onUpdatePost, onAddContact, onUpdateStage,
  onAddComment, onUpdatePostStatus, onUpdateContact, onDeleteContact,
  onRefresh, refreshing, token,
}) {
  const [tab, setTab] = useState("overview");
  const [approvingId, setApprovingId] = useState(null);
  const [contentView, setContentView] = useState("list");
  const [transcripts, setTranscripts] = useState([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [transcriptsError, setTranscriptsError] = useState("");
  const { money } = useCurrency();

  // The portal shipped `profile` in its payload and then ignored it, printing
  // a hardcoded "Eden Labs" instead — so renaming the agency would have left
  // the client's own dashboard showing the old name.
  const agencyName = data.profile?.company || data.profile?.name || "Eden Labs";
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
    const b = monthBuckets(() => ({ published: 0, scheduled: 0 }));
    clientPosts.forEach((p) => {
      if (p.status !== "published" && p.status !== "scheduled") return;
      b.add(p.date, (m) => { m[p.status] += 1; });
    });
    return b.series();
  }, [clientPosts]);

  const callsSeries = useMemo(() => {
    const b = monthBuckets(() => ({ inbound: 0, outbound: 0 }));
    clientCalls.forEach((c) => b.add(c.date, (m) => {
      if (c.direction === "inbound" || c.direction === "outbound") m[c.direction] += 1;
    }));
    return b.series();
  }, [clientCalls]);

  const dealsSeries = useMemo(() => {
    const b = monthBuckets(() => ({ value: 0 }));
    clientDeals.forEach((c) => b.add(c.closedDate, (m) => {
      m.value += Number(c.dealValue) || 0;
    }));
    return b.series();
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
  const totalClosed = clientDeals.reduce((s, d) => s + (Number(d.dealValue) || 0), 0);

  const heroStats = {
    pendingApproval: clientPosts.filter((p) => p.status === "pending_review").length,
    published: clientPosts.filter((p) => p.status === "published").length,
    deals: clientDeals.length,
    dealValue: totalClosed ? money(totalClosed) : "nothing closed yet",
  };

  // Only the tabs this client's service line uses — a book-editing client has
  // no LinkedIn content pipeline or CRM to look at.
  const clientType = CLIENT_TYPES[client.type] || CLIENT_TYPES[DEFAULT_CLIENT_TYPE];
  const visibleTabs = clientType.portalTabs.map((t) => ({ value: t, label: TAB_LABELS[t] || t }));
  const activeTab = clientType.portalTabs.includes(tab) ? tab : "overview";

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-4 md:pt-6">
        <PortalHero
          client={client}
          agencyName={agencyName}
          stats={heroStats}
          onExit={onExit}
          exitLabel={exitLabel}
          onRefresh={onRefresh}
          refreshing={refreshing}
          onGoToApprovals={() => setTab("content")}
        />
      </div>

      {/* The CRM board needs the full width; everything else reads better
          constrained, so the container widens only on that tab. */}
      <div className={`${activeTab === "crm" ? "max-w-[1400px]" : "max-w-5xl"} mx-auto px-4 md:px-8 pt-4 pb-24 md:pb-10 space-y-5`}>
        {/* Sticky so navigation doesn't scroll away on a long tab — the portal
            has no persistent nav of its own, unlike the owner shell. PillTabs
            already handles its own horizontal overflow; the extra wrapper that
            used to be here nested a second scroll container inside it. */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-canvas/85 backdrop-blur-sm">
          <PillTabs value={activeTab} onChange={setTab} options={visibleTabs} size="md" />
        </div>

        {/* Keyed on the tab so switching REMOUNTS the panel and replays the
            entrance. Without it, tab changes were an instant hard swap. */}
        <div key={activeTab} className="motion-safe:animate-fade-up space-y-5">

        {/* ══ Overview ══ */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <Card className="p-5">
              <CardTitle sub="What we committed to this cycle">
                <span className="flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-700" /> Your progress</span>
              </CardTitle>
              <div className="space-y-3">
                {client.delivery.length === 0 && (
                  <PortalEmpty icon={CheckCircle2} title="No goals set yet" compact>
                    The targets agreed for this cycle will show here, with live progress
                    against each.
                  </PortalEmpty>
                )}
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
                {/* An axis grid with no bars in it looks broken, not empty —
                    and this is exactly what a brand-new client sees first. */}
                {clientPosts.length === 0 ? (
                  <PortalEmpty icon={FileText} title="Nothing published yet" compact>
                    Once posts start going out, you'll see the monthly rhythm here.
                  </PortalEmpty>
                ) : (
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
                )}
              </Card>

              <Card className="p-5">
                <CardTitle sub="Inbound vs outbound">
                  <span className="flex items-center gap-2"><Phone size={15} className="text-sky-700" /> Calls</span>
                </CardTitle>
                {clientCalls.length === 0 ? (
                  <PortalEmpty icon={Phone} title="No calls yet" compact>
                    Calls taken or booked on your behalf appear here month by month.
                  </PortalEmpty>
                ) : (
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
                )}
              </Card>
            </div>

            <Card className="p-5">
              <CardTitle sub={`Total closed: ${money(totalClosed)}`}>
                <span className="flex items-center gap-2"><DollarSign size={15} className="text-amber-600" /> Deals closed</span>
              </CardTitle>
              {clientDeals.length === 0 ? (
                <PortalEmpty icon={DollarSign} title="No deals closed yet" compact>
                  Won deals and their value are tracked here as they land.
                </PortalEmpty>
              ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={dealsSeries}>
                  <CartesianGrid stroke={COLORS.gridline} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={42} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                  <Bar dataKey="value" fill={COLORS.amber} radius={[4, 4, 0, 0]} name="Deal value" barSize={16} />
                </BarChart>
              </ResponsiveContainer>
              )}
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
              // PendingApproval already implements a full pending state; the
              // prop driving it was simply never passed, so the portal's most
              // consequential action gave no feedback and invited a double-click.
              approvingId={approvingId}
              onApprove={async (id) => {
                setApprovingId(id);
                try { await onUpdatePostStatus(id, "scheduled"); }
                finally { setApprovingId(null); }
              }}
              onRequestChanges={async (id, feedback) => {
                setApprovingId(id);
                try {
                  // Sequential, not fired in parallel. Both are read-modify-write
                  // on the same blob, so firing them together meant one silently
                  // overwrote the other — you got the status revert OR the
                  // feedback comment, never reliably both.
                  await onUpdatePostStatus(id, "draft");
                  const now = new Date();
                  await onAddComment({
                    clientId, tab: "content", author: "Client",
                    text: `Requested changes: ${feedback}`,
                    date: `${toDateKey(now)} ${now.toTimeString().slice(0, 5)}`,
                  });
                } finally { setApprovingId(null); }
              }}
            />

            <Card className="p-4 sm:p-5">
              <PostComposer
                isOwnerView={false}
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
                  {clientPosts.length === 0 && (
                    <PortalEmpty icon={FileText} title="No posts yet" compact>
                      Drafts written for you appear here as soon as they're ready — you'll
                      be asked to approve each one before it goes out.
                    </PortalEmpty>
                  )}
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
                <PortalEmpty icon={FileText} title="No performance data yet" compact>
                  Likes, comments and views land here once your first post has been
                  live long enough to gather them.
                </PortalEmpty>
              )}
            </Card>

            <CommentThread comments={data.comments} clientId={clientId} tabKey="content" author="Client" onAdd={onAddComment} />
          </div>
        )}

        {/* ══ Outreach ══ */}
        {activeTab === "outreach" && (
          <div className="space-y-4">
            {/* IconStat is the shared tile the owner dashboard uses — icon
                chip, tone, consistent type scale. The portal was hand-rolling
                a plainer copy of it four times. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <IconStat icon={Inbox} tone="teal" label="Inbound calls"
                value={clientCalls.filter((c) => c.direction === "inbound").length} />
              <IconStat icon={Send} tone="sky" label="Outbound calls"
                value={clientCalls.filter((c) => c.direction === "outbound").length} />
              <IconStat icon={Users} tone="violet" label="Deals closed" value={clientDeals.length} />
              <IconStat icon={DollarSign} tone="amber" label="Closed value" value={money(totalClosed)} />
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
                {clientOutreach.length === 0 && (
                  <PortalEmpty icon={Send} title="No outreach logged yet" compact>
                    Messages sent on your behalf are counted here, split by channel.
                  </PortalEmpty>
                )}
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
                {clientCalls.length === 0 && (
                  <PortalEmpty icon={Phone} title="No calls logged yet" compact>
                    Every call booked or taken on your behalf is recorded here with notes.
                  </PortalEmpty>
                )}
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
              onUpdateContact={onUpdateContact}
              onDeleteContact={onDeleteContact}
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
                    <PortalEmpty icon={Video} title="No meetings loaded" compact>
                      Your recorded calls with {agencyName}, with summaries — press
                      "Load meetings" to pull the latest.
                    </PortalEmpty>
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
                {clientDms.length === 0 && (
                  <PortalEmpty icon={MessageSquare} title="No messages yet" compact>
                    Outreach conversations handled on your behalf show up here.
                  </PortalEmpty>
                )}
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
              {/* The uploaded, signed document wins over the generated text —
                  matching the owner-side rule that an upload REPLACES the
                  template. Until now the client only ever saw the template
                  even when a real contract had been uploaded, and had no way
                  to get a copy of their own agreement. */}
              {client.contract.fileUrl ? (
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="flex items-center gap-2 min-w-0">
                      <FileText size={15} className="text-stone-400 shrink-0" />
                      <span className="text-sm text-stone-700 truncate">
                        {client.contract.fileName || "Signed contract"}
                      </span>
                    </span>
                    <a
                      href={client.contract.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-[13px] font-medium text-stone-700 bg-white border border-stone-300 rounded-lg
                        px-3 py-1.5 flex items-center gap-1.5 hover:bg-stone-50 hover:border-stone-400
                        transition-[transform,background-color,border-color] duration-150 ${EASE} active:scale-[0.97]`}
                    >
                      <Download size={13} /> Open a copy
                    </a>
                  </div>
                  {client.contract.fileType === "application/pdf" ? (
                    <iframe
                      src={client.contract.fileUrl}
                      title="Contract"
                      className="w-full h-[420px] rounded-lg border border-stone-200 bg-stone-50"
                    />
                  ) : (
                    <img
                      src={client.contract.fileUrl}
                      alt="Contract"
                      className="w-full rounded-lg border border-stone-200"
                    />
                  )}
                </div>
              ) : client.contract.bodyText ? (
                <div className="pt-4 font-serif text-[15px] text-stone-600 whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto">
                  {client.contract.bodyText}
                </div>
              ) : (
                <div className="pt-6 pb-2 text-center">
                  <span className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-2.5">
                    <FileText size={17} className="text-stone-400" />
                  </span>
                  <div className="text-[14px] font-semibold text-stone-800">No contract on file yet</div>
                  <p className="text-[13px] text-stone-500 mt-1">
                    Your agreement will appear here once it's been added.
                  </p>
                </div>
              )}
            </Card>
            <CommentThread comments={data.comments} clientId={clientId} tabKey="contract" author="Client" onAdd={onAddComment} />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
