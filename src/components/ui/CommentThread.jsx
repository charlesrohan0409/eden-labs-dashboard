import { useState } from "react";
import { MessageSquare } from "lucide-react";
import Card from "./Card";
import PrimaryButton from "./PrimaryButton";

export default function CommentThread({ comments, clientId, tabKey, author, onAdd }) {
  const [text, setText] = useState("");
  const filtered = comments.filter((c) => c.clientId === clientId && c.tab === tabKey);

  const post = () => {
    if (!text.trim()) return;
    const now = new Date();
    const stamp = now.toISOString().slice(0, 10) + " " + now.toTimeString().slice(0, 5);
    onAdd({ clientId, tab: tabKey, author, text, date: stamp });
    setText("");
  };

  return (
    <Card className="p-5">
      <div className="text-xs font-medium text-stone-500 mb-3 flex items-center gap-1.5">
        <MessageSquare size={13} /> Comments
      </div>
      <div className="space-y-3 mb-3">
        {filtered.map((c) => (
          <div key={c.id} className="text-sm border-b border-stone-100 pb-3 last:border-0 last:pb-0">
            <div className="flex justify-between items-baseline gap-2">
              <span className="font-semibold text-stone-700">{c.author}</span>
              <span className="text-[10px] text-stone-400 shrink-0">{c.date}</span>
            </div>
            <div className="text-stone-600 mt-0.5">{c.text}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-xs text-stone-300">No comments yet.</div>}
      </div>
      <div className="flex gap-2">
        <input
          placeholder="Add a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && post()}
          className="flex-1 min-w-[8rem] border border-line rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
        />
        <PrimaryButton variant="dark" onClick={post}>Post</PrimaryButton>
      </div>
    </Card>
  );
}
