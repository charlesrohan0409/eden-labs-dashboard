import { useState } from "react";
import { CheckCircle2, Eye, Clock, Image as ImageIcon, Film, LayoutGrid, BarChart3, Loader2 } from "lucide-react";
import PrimaryButton from "./PrimaryButton";
import Badge from "./Badge";
import Modal from "./Modal";
import PostPreview, { LinkedInPost } from "./PostPreview";
import { formatDateTime } from "../../lib/utils";

const TYPE_META = {
  image: { icon: ImageIcon, label: "Photo" },
  carousel: { icon: LayoutGrid, label: "Carousel" },
  video: { icon: Film, label: "Video" },
  poll: { icon: BarChart3, label: "Poll" },
};

/**
 * The client's approval queue. Each post renders as it will actually appear on
 * LinkedIn — a one-line summary gives a client no basis to approve anything.
 * "See full post" opens it larger with the mobile/desktop switch.
 */
export default function PendingApproval({ posts, onApprove, onRequestChanges, author, headline, avatarUrl, approvingId = null }) {
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [viewing, setViewing] = useState(null);

  if (posts.length === 0) return null;

  const submitFeedback = (id) => {
    if (!feedback.trim()) return;
    onRequestChanges(id, feedback);
    setFeedback("");
    setFeedbackFor(null);
    setViewing(null);
  };

  return (
    <>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="text-[15px] font-semibold text-stone-900 tracking-tight">
            Pending your approval
          </div>
          <Badge tone="amber" dot>{posts.length}</Badge>
        </div>

        <div className="space-y-4">
          {posts.map((p) => {
            const meta = TYPE_META[p.poll ? "poll" : p.media?.type];
            const TypeIcon = meta?.icon;
            return (
              <div key={p.id} className="bg-white border border-line rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-stone-100 flex-wrap">
                  {TypeIcon && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                      <TypeIcon size={12} /> {meta.label}
                    </span>
                  )}
                  {p.scheduledAt && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                      <Clock size={12} /> {formatDateTime(p.scheduledAt)}
                    </span>
                  )}
                  <button
                    onClick={() => setViewing(p)}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
                  >
                    <Eye size={13} /> See full post
                  </button>
                </div>

                {/* The post exactly as it will publish. */}
                <div className="bg-[#F4F2EE] p-3">
                  <LinkedInPost
                    author={author}
                    headline={headline}
                    avatarUrl={avatarUrl}
                    content={p.content}
                    media={p.media}
                    poll={p.poll}
                    timeLabel={p.scheduledAt ? formatDateTime(p.scheduledAt) : "Scheduled"}
                  />
                </div>

                <div className="p-3.5 border-t border-stone-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PrimaryButton
                      icon={approvingId === p.id ? Loader2 : CheckCircle2}
                      iconClassName={approvingId === p.id ? "animate-spin" : ""}
                      onClick={() => onApprove(p.id)}
                      disabled={approvingId === p.id}
                    >
                      {approvingId === p.id ? "Publishing…" : "Approve & schedule"}
                    </PrimaryButton>
                    <PrimaryButton
                      variant="ghost"
                      disabled={approvingId === p.id}
                      onClick={() => setFeedbackFor(feedbackFor === p.id ? null : p.id)}
                    >
                      Request changes
                    </PrimaryButton>
                  </div>

                  {feedbackFor === p.id && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <input
                        autoFocus
                        placeholder="What should change?"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitFeedback(p.id)}
                        className="flex-1 min-w-[10rem] border border-line rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      />
                      <PrimaryButton variant="dark" onClick={() => submitFeedback(p.id)}>Send</PrimaryButton>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full-post view */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Full post"
        subtitle={viewing?.scheduledAt ? `Scheduled for ${formatDateTime(viewing.scheduledAt)}` : "Awaiting your approval"}
        width="lg"
        footer={
          <>
            <PrimaryButton variant="ghost" onClick={() => { setFeedbackFor(viewing.id); setViewing(null); }}>
              Request changes
            </PrimaryButton>
            <PrimaryButton icon={CheckCircle2} onClick={() => { onApprove(viewing.id); setViewing(null); }}>
              Approve &amp; schedule
            </PrimaryButton>
          </>
        }
      >
        {viewing && (
          <PostPreview
            author={author}
            headline={headline}
            avatarUrl={avatarUrl}
            content={viewing.content}
            media={viewing.media}
            poll={viewing.poll}
            timeLabel={viewing.scheduledAt ? formatDateTime(viewing.scheduledAt) : "Scheduled"}
          />
        )}
      </Modal>
    </>
  );
}
