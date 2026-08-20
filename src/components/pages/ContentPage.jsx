import { useState } from "react";
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
import { useBufferPerformance } from "../../hooks/useBufferPerformance";
import { formatDateTime } from "../../lib/utils";
import { normalizeStatus } from "../../lib/content";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Colour dot per post status shown in calendar chips
const STATUS_DOT = {
  scheduled:      "bg-amber-400",
  published:      "bg-emerald-500",
  draft:          "bg-stone-300",
  pending_review: "bg-violet-400",
};
const STATUS_TONE = {
  scheduled:      "amber",
  published:      "emerald",
  draft:          "stone",
  pending_review: "stone",
};

function ContentCalendar({ posts, clients }) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [viewingPost, setViewingPost] = useState(null);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay(); // 0=Sun
  const totalCells = Math.ceil((startOffset + lastDate) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = i - startOffset + 1;
    return d >= 1 && d <= lastDate ? d : null;
  });

  // Map each post to its calendar date
  const postsThisMonth = posts.filter((p) => {
    const dateStr = p.scheduledAt ? p.scheduledAt.slice(0, 10) : p.date;
    if (!dateStr) return false;
    const d = new Date(dateStr + "T12:00:00");
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const byDay = {};
  postsThisMonth.forEach((p) => {
    const dateStr = p.scheduledAt ? p.scheduledAt.slice(0, 10) : p.date;
    const day = new Date(dateStr + "T12:00:00").getDate();
    (byDay[day] = byDay[day] || []).push(p);
  });

  const clientName = (id) => {
    if (!id) return "Agency";
    return clients.find((c) => c.id === id)?.name?.split(" ")[0] || "?";
  };

  const isToday = (day) =>
    day && now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[15px] font-semibold text-stone-900 w-40 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
        <button onClick={goToday} className="text-xs text-stone-400 hover:text-stone-700 transition-colors">
          Today
        </button>
      </div>

      {/* Day-name row */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-stone-400 py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border border-stone-100 rounded-xl overflow-hidden divide-x divide-y divide-stone-100">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`min-h-[4.5rem] p-1.5 flex flex-col gap-1 ${day ? "bg-white" : "bg-stone-50/60"}`}
          >
            {day && (
              <span className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-medium self-start
                ${isToday(day) ? "bg-emerald-700 text-white" : "text-stone-400"}`}>
                {day}
              </span>
            )}
            {(byDay[day] || []).map((p) => (
              <button
                key={p.id}
                onClick={() => setViewingPost(p)}
                className="text-left w-full text-[10px] rounded px-1.5 py-1 bg-stone-50 border border-stone-100 hover:bg-emerald-50 hover:border-emerald-200 transition-colors truncate leading-snug"
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${STATUS_DOT[p.status] || "bg-stone-300"}`} />
                {clientName(p.clientId)}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-stone-400">
        {Object.entries({ scheduled: "Scheduled", published: "Published", pending_review: "Pending review", draft: "Draft" }).map(([s, label]) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
            {label}
          </span>
        ))}
      </div>

      {/* Post preview modal */}
      {viewingPost && (
        <Modal open title="Post preview" onClose={() => setViewingPost(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={STATUS_TONE[viewingPost.status] || "stone"} dot>
                {viewingPost.status?.replace(/_/g, " ")}
              </Badge>
              {viewingPost.scheduledAt && (
                <span className="text-xs text-stone-500">
                  Scheduled {formatDateTime(viewingPost.scheduledAt)}
                </span>
              )}
              {viewingPost.clientId && (
                <Badge tone="stone">{clientName(viewingPost.clientId)}</Badge>
              )}
            </div>
            <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
              {viewingPost.content || "(media only)"}
            </p>
          </div>
        </Modal>
      )}
    </Card>
  );
}

export default function ContentPage({ data, onAddPost, onUpdatePost, onDeletePost, onUpdatePostStatus, onAddSwipe, onDeleteSwipe, onSetAgencyBufferChannel, token }) {
  const [view, setView] = useState("board");

  // Agency content only — a client's posts live on their own page, where the
  // board additionally shows the approval column.
  const agencyPosts = data.posts.filter((p) => !p.clientId);
  const byStage = (stage) => agencyPosts.filter((p) => normalizeStatus(p.status) === stage).length;
  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const bufferIntegration = data.integrations.find((i) => i.id === "buffer") || { connected: false, channels: [] };
  // 90 days keeps the comment list to conversations still worth joining.
  const perf = useBufferPerformance({ enabled: bufferIntegration.connected, range: "90" });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Content</h1>
          <p className="text-sm text-stone-500 mt-1">
            {byStage("idea")} ideas · {byStage("writing")} writing · {byStage("scheduled")} scheduled · {byStage("published")} published
          </p>
        </div>
      </div>

      <PillTabs
        size="md"
        value={view}
        onChange={setView}
        options={[
          { value: "board", label: "Board" },
          { value: "composer", label: "Composer" },
          { value: "calendar", label: "Calendar" },
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
            onOpen={() => setView("composer")}
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
        <ContentCalendar posts={data.posts} clients={data.clients} />
      )}

      {/* ══ Saved content ══ */}
      {view === "saved" && (
        <SavedContent items={data.swipeFile} onAdd={onAddSwipe} onDelete={onDeleteSwipe} />
      )}

    </div>
  );
}
