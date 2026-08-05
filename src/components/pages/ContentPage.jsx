import { useState } from "react";
import { Sparkles, Search, Plus } from "lucide-react";
import Card, { CardTitle } from "../ui/Card";
import Badge from "../ui/Badge";
import PrimaryButton from "../ui/PrimaryButton";
import PostComposer from "../ui/PostComposer";
import CommentsInbox from "../ui/CommentsInbox";
import { useBufferPerformance } from "../../hooks/useBufferPerformance";

export default function ContentPage({ data, onAddPost, onUpdatePost, onAddSwipe, onSetAgencyBufferChannel }) {
  const [note, setNote] = useState("");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("hook");
  const [search, setSearch] = useState("");

  const filtered = data.swipeFile.filter((s) => {
    const q = search.trim().toLowerCase();
    return !q || s.note.toLowerCase().includes(q) || (s.source || "").toLowerCase().includes(q) || (s.tag || "").toLowerCase().includes(q);
  });

  const byStatus = (status) => data.posts.filter((p) => p.status === status).length;
  const inputCls = "border border-line rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20";
  const bufferIntegration = data.integrations.find((i) => i.id === "buffer") || { connected: false, channels: [] };
  // 90 days keeps the comment list to conversations still worth joining.
  const perf = useBufferPerformance({ enabled: bufferIntegration.connected, range: "90" });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Content</h1>
        <p className="text-sm text-stone-500 mt-1">
          {byStatus("published")} published · {byStatus("scheduled")} scheduled · {byStatus("draft")} drafts
        </p>
      </div>

      <Card className="p-4 sm:p-5">
        <CardTitle sub="Posts written here are unassigned — agency content, not client work">
          Composer
        </CardTitle>
        <PostComposer
          clientId={null}
          posts={data.posts}
          onAddPost={onAddPost}
          onUpdatePost={onUpdatePost}
          author={data.profile?.name || "Eden Labs"}
          headline={data.profile?.headline || ""}
          avatarUrl={data.profile?.photoUrl || ""}
          bufferConnected={bufferIntegration.connected}
          bufferChannels={bufferIntegration.channels || []}
          bufferChannelId={bufferIntegration.agencyChannelId}
          onSetBufferChannel={onSetAgencyBufferChannel}
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

      <Card className="p-5">
        <CardTitle
          sub="Hooks and structures worth stealing"
          action={<Sparkles size={15} className="text-amber-500 shrink-0" />}
        >
          Swipe file
        </CardTitle>

        <div className="relative mb-4">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-300" />
          <input
            placeholder="Search by source, tag, or note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-line rounded-full pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
          />
        </div>

        <div className="space-y-1 mb-4">
          {filtered.map((s) => (
            <div key={s.id} className="text-sm text-stone-600 border-b border-stone-100 last:border-0 py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-semibold text-stone-800">{s.source}</span>
                <span className="text-stone-400"> — </span>
                {s.note}
              </div>
              {s.tag && <Badge tone="stone">{s.tag}</Badge>}
            </div>
          ))}
          {filtered.length === 0 && <div className="text-xs text-stone-400 py-6 text-center">No matches.</div>}
        </div>

        <div className="flex gap-2 flex-wrap pt-4 border-t border-stone-100">
          <input placeholder="Source (e.g. Justin Welsh)" value={source} onChange={(e) => setSource(e.target.value)} className={`${inputCls} flex-1 min-w-[9rem]`} />
          <input placeholder="Save a hook or pattern you liked..." value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} flex-1 min-w-[11rem]`} />
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={`${inputCls} w-28`}>
            <option value="hook">hook</option>
            <option value="structure">structure</option>
            <option value="cta">cta</option>
            <option value="story">story</option>
          </select>
          <PrimaryButton
            icon={Plus}
            variant="dark"
            onClick={() => {
              if (!note.trim()) return;
              onAddSwipe({ source: source.trim() || "Saved", note, tag });
              setNote("");
              setSource("");
            }}
          >
            Save
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
