import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, Radio, CalendarDays,
} from "lucide-react";
import Card from "./Card";
import Avatar from "./Avatar";
import Badge from "./Badge";
import Modal from "./Modal";
import {
  normalizeStatus, STAGE_META, POST_TYPE_META, hookOf,
} from "../../lib/content";
import { formatDateTime } from "../../lib/utils";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const iso = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The date a post sits on — always its Buffer-scheduled slot, since every
// post reaching this calendar is guaranteed to have one (see the filter
// below). No fallback to `date` here: that field is when a post was
// created or last edited, not when it's going out.
const dateOf = (p) => (p.scheduledAt ? p.scheduledAt.slice(0, 10) : "");

/**
 * Content calendar.
 *
 * Shows ONLY posts genuinely queued on Buffer (`bufferPostId` set) — not
 * drafts, not ideas that merely have a day picked, not anything "scheduled"
 * locally without an actual Buffer channel behind it. A calendar is a
 * commitment view: if it's on here, it is really going out at that time,
 * full stop. Everything else (ideas, drafts, writing-in-progress) lives on
 * the Board instead, where "when" isn't settled yet.
 *
 * One consequence worth knowing: because every visible post is Buffer-
 * confirmed, none of them can be dragged to a new day from here — moving a
 * card wouldn't move Buffer's own copy, so this calendar is read-only by
 * design rather than an editing surface. Reschedule the old-fashioned way:
 * open the post and change its time in the composer/Buffer.
 */
export default function ContentCalendar({ posts, clients, onOpenPost }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [viewing, setViewing] = useState(null);

  const clientOf = (id) => clients?.find((c) => c.id === id);

  // Only posts truly queued on Buffer belong on a calendar — see file doc.
  const scheduledPosts = useMemo(
    () => (posts || []).filter((p) => !!p.bufferPostId),
    [posts]
  );

  // Monday-first: the working week starts on Monday, and a content calendar
  // is a working calendar.
  const firstOfMonth = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDate) / 7) * 7;

  const byDay = useMemo(() => {
    const map = {};
    scheduledPosts.forEach((p) => {
      const key = dateOf(p);
      if (!key) return;
      (map[key] = map[key] || []).push(p);
    });
    // Within a day, in time order — that's the order they'll actually
    // happen in.
    Object.values(map).forEach((list) =>
      list.sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")))
    );
    return map;
  }, [scheduledPosts]);

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1 || dayNum > lastDate) return null;
    return iso(new Date(year, month, dayNum));
  });

  // Published-per-week for this month, the honest cadence signal.
  const cadence = useMemo(() => {
    const weeks = {};
    Object.entries(byDay).forEach(([key, list]) => {
      if (!key.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)) return;
      const d = new Date(`${key}T12:00:00`);
      const wk = Math.floor((d.getDate() + startOffset - 1) / 7);
      weeks[wk] = (weeks[wk] || 0) + list.filter((p) => normalizeStatus(p.status) === "published").length;
    });
    const vals = Object.values(weeks);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "0";
  }, [byDay, year, month, startOffset]);

  const monthCount = Object.entries(byDay)
    .filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .reduce((n, [, list]) => n + list.length, 0);

  const step = (delta) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button onClick={() => step(-1)} aria-label="Previous month"
            className={`p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 transition-transform duration-150 ${EASE} active:scale-[0.92]`}>
            <ChevronLeft size={16} />
          </button>
          <span className="text-[15px] font-semibold text-stone-900 w-[9.5rem] text-center tabular-nums">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={() => step(1)} aria-label="Next month"
            className={`p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 transition-transform duration-150 ${EASE} active:scale-[0.92]`}>
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
            className="ml-1 text-xs text-stone-400 hover:text-stone-700 transition-colors px-2 py-1 rounded-lg hover:bg-stone-100"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-stone-400">
          <span><span className="font-semibold text-stone-600 tabular-nums">{monthCount}</span> queued on Buffer</span>
          <span className="w-px h-3 bg-line" />
          <span className="flex items-center gap-1">
            <CalendarDays size={12} />
            <span className="font-semibold text-stone-600 tabular-nums">{cadence}</span>/week published
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-stone-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 border border-stone-100 rounded-xl overflow-hidden divide-x divide-y divide-stone-100">
        {cells.map((dayKey, i) => {
          const isToday = dayKey === iso(now);
          const list = dayKey ? byDay[dayKey] || [] : [];
          return (
            <div
              key={i}
              className={`min-h-[6.5rem] p-1.5 flex flex-col gap-1 ${!dayKey ? "bg-stone-50/60" : "bg-white"}`}
            >
              {dayKey && (
                <span className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full font-medium ${
                  isToday ? "bg-emerald-700 text-white" : "text-stone-400"
                }`}>
                  {Number(dayKey.slice(-2))}
                </span>
              )}

              {list.map((p) => {
                const stage = normalizeStatus(p.status);
                const meta = STAGE_META[stage] || STAGE_META.idea;
                const typeMeta = POST_TYPE_META[p.type] || POST_TYPE_META.text;
                return (
                  <button
                    key={p.id}
                    onClick={() => setViewing(p)}
                    title={hookOf(p.content)}
                    className={`text-left w-full rounded-lg px-1.5 py-1 border transition-all duration-150 ${EASE}
                      border-stone-100 bg-stone-50 hover:bg-white hover:border-stone-300 active:scale-[0.98]`}
                  >
                    <span className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                      <span className="text-[9.5px] text-stone-400 truncate flex-1">
                        {p.scheduledAt ? p.scheduledAt.slice(11, 16) : typeMeta.label}
                      </span>
                    </span>
                    <span className="block text-[10.5px] leading-tight text-stone-700 line-clamp-2 mt-0.5">
                      {hookOf(p.content) || "(media only)"}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-stone-400">
        {["scheduled", "published"].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${STAGE_META[s].dot}`} />
            {STAGE_META[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1 ml-auto">
          <Radio size={10} /> only posts queued on Buffer show here — drafts and ideas live on the Board
        </span>
      </div>

      {viewing && (
        <Modal open title="Post" onClose={() => setViewing(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={(STAGE_META[normalizeStatus(viewing.status)] || STAGE_META.idea).tone} dot>
                {(STAGE_META[normalizeStatus(viewing.status)] || STAGE_META.idea).label}
              </Badge>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                (POST_TYPE_META[viewing.type] || POST_TYPE_META.text).chip
              }`}>
                {(POST_TYPE_META[viewing.type] || POST_TYPE_META.text).label}
              </span>
              {viewing.scheduledAt && (
                <span className="text-xs text-stone-500">{formatDateTime(viewing.scheduledAt)}</span>
              )}
              {viewing.clientId && clientOf(viewing.clientId) && (
                <span className="flex items-center gap-1.5">
                  <Avatar name={clientOf(viewing.clientId).name} photoUrl={clientOf(viewing.clientId).photoUrl} size={18} />
                  <span className="text-xs text-stone-500">{clientOf(viewing.clientId).name}</span>
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-emerald-700">
                <Radio size={11} /> queued on Buffer
              </span>
            </div>

            <p className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed max-h-[45vh] overflow-y-auto">
              {viewing.content || "(media only)"}
            </p>

            {onOpenPost && (
              <button
                onClick={() => { onOpenPost(viewing); setViewing(null); }}
                className={`w-full text-sm font-medium bg-emerald-800 text-white rounded-lg px-4 py-2.5
                  transition-transform duration-150 ${EASE} active:scale-[0.98] hover:bg-emerald-900`}
              >
                Open in composer
              </button>
            )}
          </div>
        </Modal>
      )}
    </Card>
  );
}
