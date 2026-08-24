import { useEffect, useRef, useState } from "react";
import { Sparkles, Search, Plus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import PrimaryButton from "../ui/PrimaryButton";
import PillTabs from "../ui/PillTabs";
import PostComposer from "../ui/PostComposer";
import CommentsInbox from "../ui/CommentsInbox";
import Modal from "../ui/Modal";
import ContentBoard from "../ui/ContentBoard";
import SavedContent from "../ui/SavedContent";
import ScheduleModal from "../ui/ScheduleModal";
import ContentAnalytics from "../ui/ContentAnalytics";
import RepurposePanel from "../ui/RepurposePanel";
import ContentHeader from "../ui/ContentHeader";
import ContentCalendar from "../ui/ContentCalendar";
import { useBufferPerformance } from "../../hooks/useBufferPerformance";
import { formatDateTime } from "../../lib/utils";
import { normalizeStatus } from "../../lib/content";

export default function ContentPage({
  data, onAddPost, onUpdatePost, onDeletePost, onUpdatePostStatus,
  onAddSwipe, onDeleteSwipe, onSetAgencyBufferChannel, onSyncPublished, token,
}) {
  const [view, setView] = useState("board");
  const [filters, setFilters] = useState({});
  const [scheduling, setScheduling] = useState(null);
  const [composerPostId, setComposerPostId] = useState(null);
  const [repurposeSeed, setRepurposeSeed] = useState(null);

  // Agency content only — a client's posts live on their own page, where the
  // board additionally shows the approval column.
  const agencyPosts = data.posts.filter((p) => !p.clientId);
  const byStage = (stage) => agencyPosts.filter((p) => normalizeStatus(p.status) === stage).length;
  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const bufferIntegration = data.integrations.find((i) => i.id === "buffer") || { connected: false, channels: [] };
  // 90 days keeps the comment list to conversations still worth joining.
  const perf = useBufferPerformance({ enabled: bufferIntegration.connected, range: "90" });

  // Auto-move scheduled -> published once Buffer says the post actually went
  // out. Runs on whatever Buffer data is already loaded rather than polling,
  // so it costs no extra requests. The ref guards against re-firing the same
  // reconciliation on every render — the mutation is idempotent, but each
  // call rewrites the whole blob, which is exactly the write amplification
  // that got the bandwidth budget blown once already.
  const syncedRef = useRef("");
  useEffect(() => {
    if (!onSyncPublished || !perf.data?.posts?.length) return;
    const sent = perf.data.posts
      .filter((bp) => bp.status === "sent" || bp.sentAt)
      .map((bp) => ({ bufferPostId: bp.id, sentAt: bp.sentAt }));
    const pending = data.posts.filter(
      (p) => p.bufferPostId && p.status !== "published" &&
             sent.some((s) => String(s.bufferPostId) === String(p.bufferPostId))
    );
    if (!pending.length) return;
    const key = pending.map((p) => p.id).sort().join(",");
    if (syncedRef.current === key) return;
    syncedRef.current = key;
    onSyncPublished(sent);
  }, [perf.data, data.posts, onSyncPublished]);

  return (
    <div className="space-y-5">
      <ContentHeader
        posts={agencyPosts}
        bufferPosts={perf.data?.posts || []}
        onCompose={() => { setComposerPostId(null); setView("composer"); }}
      />

      <PillTabs
        size="md"
        value={view}
        onChange={setView}
        options={[
          { value: "board", label: "Board" },
          { value: "composer", label: "Composer" },
          { value: "calendar", label: "Calendar" },
          { value: "analytics", label: "Analytics" },
          { value: "repurpose", label: "Repurpose" },
          { value: "saved", label: "Saved content" },
        ]}
      />

      {/* ══ Board ══ */}
      {view === "board" && (
        <Card className="p-4 sm:p-5">
          <CardTitle sub="Drag a post between columns — or use the ⋮ menu on touch">
            Content pipeline
          </CardTitle>
          <ContentBoard
            posts={agencyPosts}
            clients={data.clients}
            clientId={null}
            onUpdateStatus={onUpdatePostStatus}
            onDelete={onDeletePost}
            onOpen={(post) => { setComposerPostId(post.id); setView("composer"); }}
            onRequestSchedule={setScheduling}
            filters={filters}
            onFiltersChange={setFilters}
            onAddIdea={(content) =>
              onAddPost({
                clientId: null, content, status: "idea", type: "text",
                media: null, poll: null, scheduledAt: null,
                date: new Date().toISOString().slice(0, 10),
              })
            }
          />
        </Card>
      )}

      {/* ══ Composer ══ */}
      {view === "composer" && (
        <>
          <Card className="p-4 sm:p-5">
            <CardTitle sub="Posts written here are unassigned — agency content, not client work">
              Composer
            </CardTitle>
            <PostComposer
              clientId={null}
              posts={data.posts}
              onAddPost={onAddPost}
              onUpdatePost={onUpdatePost}
              onDeletePost={onDeletePost}
              author={data.profile?.name || "Eden Labs"}
              headline={data.profile?.headline || ""}
              avatarUrl={data.profile?.photoUrl || ""}
              bufferConnected={bufferIntegration.connected}
              bufferChannels={bufferIntegration.channels || []}
              bufferChannelId={bufferIntegration.agencyChannelId}
              onSetBufferChannel={onSetAgencyBufferChannel}
              openPostId={composerPostId}
              onOpened={() => setComposerPostId(null)}
              repurposeSeed={repurposeSeed}
              onSeedUsed={() => setRepurposeSeed(null)}
              token={token}
            />
          </Card>

          {bufferIntegration.connected && (
            <CommentsInbox
              posts={perf.withComments || []}
              loading={perf.loading}
              error={perf.error}
              onRefresh={perf.refresh}
            />
          )}
        </>
      )}

      {/* ══ Calendar ══ */}
      {view === "calendar" && (
        <ContentCalendar
          posts={data.posts}
          clients={data.clients}
          onOpenPost={(post) => { setComposerPostId(post.id); setView("composer"); }}
        />
      )}

      {/* ══ Analytics ══ */}
      {view === "analytics" && (
        <ContentAnalytics
          posts={data.posts}
          bufferPosts={perf.data?.posts || []}
          loading={perf.loading}
          error={bufferIntegration.connected ? perf.error : "Connect Buffer on the Integrations page to see what's working."}
          onRefresh={perf.refresh}
        />
      )}

      {/* ══ Repurpose ══ */}
      {view === "repurpose" && (
        <RepurposePanel
          posts={agencyPosts}
          bufferPosts={perf.data?.posts || []}
          onRepurpose={(post, angle) => {
            // Hands the composer a STARTING POINT, not a finished draft:
            // the original text plus an explicit instruction for the new
            // angle. Rewriting is the owner's job — an auto-paraphrase
            // reads as a repeat, which is worse than not reposting.
            setRepurposeSeed({ post, angle });
            setComposerPostId(null);
            setView("composer");
          }}
        />
      )}

      {/* ══ Saved content ══ */}
      {view === "saved" && (
        <SavedContent items={data.swipeFile} onAdd={onAddSwipe} onDelete={onDeleteSwipe} />
      )}

      <ScheduleModal
        open={!!scheduling}
        post={scheduling}
        channels={bufferIntegration.channels || []}
        channelId={bufferIntegration.agencyChannelId}
        bufferConnected={bufferIntegration.connected}
        onClose={() => setScheduling(null)}
        onConfirm={({ scheduledAt, bufferPostId }) => {
          onUpdatePost(scheduling.id, { status: "scheduled", scheduledAt, bufferPostId });
        }}
      />
    </div>
  );
}
