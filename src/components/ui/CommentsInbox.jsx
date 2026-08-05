import { MessageSquare, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import Card from "./Card";
import Badge from "./Badge";
import PrimaryButton from "./PrimaryButton";

/**
 * "You have comments to reply to."
 *
 * Buffer's API gives a comment COUNT per post, never the comment text or the
 * commenter — there's no such field in the schema (the only comment-shaped
 * field, `LinkedInPostMetadata.firstComment`, is the first comment you attach
 * to your own post). So this can't be a real inbox. What it can do — and what
 * is actually useful — is tell you which posts have conversation waiting and
 * take you straight to them on LinkedIn.
 */
export default function CommentsInbox({ posts = [], loading, error, onRefresh, limit = 6 }) {
  const total = posts.reduce((s, p) => s + p.metrics.comments, 0);
  const shown = posts.slice(0, limit);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight flex items-center gap-2">
            <MessageSquare size={15} className="text-sky-600" />
            Comments to reply to
            {total > 0 && <Badge tone="sky" dot>{total}</Badge>}
          </div>
          <div className="text-xs text-stone-400 mt-0.5">
            Posts with conversation waiting — open each one to read and reply on LinkedIn
          </div>
        </div>
        {onRefresh && (
          <PrimaryButton size="sm" variant="ghost" icon={loading ? Loader2 : RefreshCw} onClick={onRefresh} disabled={loading}>
            {loading ? "Syncing…" : "Refresh"}
          </PrimaryButton>
        )}
      </div>

      {error ? (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{error}</div>
      ) : loading && posts.length === 0 ? (
        <div className="text-xs text-stone-400 py-8 text-center">
          <Loader2 size={16} className="animate-spin mx-auto mb-2" /> Checking Buffer…
        </div>
      ) : shown.length === 0 ? (
        <div className="text-xs text-stone-400 py-8 text-center">
          No comments on your recent posts yet.
        </div>
      ) : (
        <div className="space-y-1">
          {shown.map((p) => (
            <a
              key={p.id}
              href={p.externalLink || "#"}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-3 py-3 border-b border-stone-100 last:border-0 hover:bg-stone-50 -mx-2 px-2 rounded-lg transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-sky-700 tnum">{p.metrics.comments}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-stone-700 line-clamp-2 leading-snug group-hover:text-stone-900">
                  {p.text || "(no text)"}
                </div>
                <div className="text-[11px] text-stone-400 mt-1">
                  {new Date(p.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  {" · "}{p.channelName}
                  {" · "}{p.metrics.comments} {p.metrics.comments === 1 ? "comment" : "comments"}
                </div>
              </div>
              <ExternalLink size={14} className="text-stone-300 group-hover:text-emerald-700 shrink-0 mt-1" />
            </a>
          ))}
          {posts.length > limit && (
            <div className="text-[11px] text-stone-400 pt-2">
              +{posts.length - limit} more on the Performance page.
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-stone-400 mt-3 pt-3 border-t border-stone-100">
        Buffer's API returns comment counts, not the comments themselves — so this flags where the
        conversation is, and LinkedIn is where you read it.
      </div>
    </Card>
  );
}
