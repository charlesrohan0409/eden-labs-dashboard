import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, RefreshCw, CalendarDays, Clock, AlertTriangle,
  Loader2, Image as ImageIcon, FileText, Video, CalendarOff, Zap, Link2Off,
  ArrowUpRight, Send,
} from "lucide-react";
import Card from "./Card";
import Avatar from "./Avatar";
import Modal from "./Modal";
import { hookOf } from "../../lib/content";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ── date helpers ───────────────────────────────────────────────────────────
// Buffer hands back `dueAt` as a UTC instant. Every one of these converts to
// LOCAL first — slicing the ISO string instead (which the old calendar did
// with its own `scheduledAt`) drops a 9pm post onto tomorrow.

const pad = (n) => String(n).padStart(2, "0");
const dayKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDayKey = (utcIso) => (utcIso ? dayKeyOf(new Date(utcIso)) : "");
const localTime = (utcIso) =>
  utcIso ? new Date(utcIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

const startOfWeek = (d) => {
  const out = new Date(d);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7)); // Monday-first
  out.setHours(0, 0, 0, 0);
  return out;
};

function relativeWhen(utcIso) {
  if (!utcIso) return "";
  const ms = new Date(utcIso) - Date.now();
  if (ms < 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

// ── Buffer's own status vocabulary ─────────────────────────────────────────
// Deliberately NOT our pipeline stages. These describe what Buffer is doing
// with the post, which is a different question from where it sits in our
// workflow — conflating them is what made the old calendar lie.
const QUEUE_STATUS_META = {
  scheduled: { label: "Scheduled", dot: "bg-teal-500",   chip: "bg-teal-50 text-teal-700 border-teal-200/70" },
  draft:     { label: "Draft",     dot: "bg-stone-400",  chip: "bg-stone-100 text-stone-600 border-stone-200" },
  sending:   { label: "Sending",   dot: "bg-amber-500",  chip: "bg-amber-50 text-amber-700 border-amber-200/70" },
  error:     { label: "Failed",    dot: "bg-rose-500",   chip: "bg-rose-50 text-rose-700 border-rose-200/70" },
};
const statusMeta = (s) => QUEUE_STATUS_META[s] || QUEUE_STATUS_META.draft;

const ASSET_ICON = { image: ImageIcon, video: Video, document: FileText };

/**
 * A seven-column grid at phone width gives each day ~45px, which wraps post
 * text to one character per line. The phone layouts below are structurally
 * different rather than just smaller, so this needs to be a real branch in
 * JS, not a set of responsive classes.
 */
function useIsNarrow(breakpoint = 640) {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [breakpoint]);
  return narrow;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Segmented Month / Week control

   The sliding pill is one transform on one element rather than a background
   swap on two — a colour crossfade between two buttons always shows both
   states at once for a frame, whereas a moving pill reads as a single object.
   ═════════════════════════════════════════════════════════════════════════ */
function ViewToggle({ value, onChange }) {
  const OPTIONS = [{ id: "month", label: "Month" }, { id: "week", label: "Week" }];
  const idx = Math.max(0, OPTIONS.findIndex((o) => o.id === value));
  return (
    <div className="relative flex p-0.5 rounded-[10px] bg-stone-100/90 border border-stone-200/60">
      <span
        aria-hidden
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-[62px] rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]
          transition-transform duration-200 ${EASE}`}
        style={{ transform: `translateX(${idx * 62}px)` }}
      />
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`relative z-10 w-[62px] py-1 text-xs font-medium rounded-lg
            transition-colors duration-200 ${EASE}
            ${value === o.id ? "text-stone-900" : "text-stone-500 hover:text-stone-700"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   One queued post, rendered at two densities.
   ═════════════════════════════════════════════════════════════════════════ */
function QueueCard({ item, dense, index, dragging, onOpen, onDragStart, onDragEnd }) {
  const { post: q, local, client } = item;
  const meta = statusMeta(q.status);
  const thumb = q.assets?.find((a) => a.thumbnail)?.thumbnail || "";
  const AssetIcon = ASSET_ICON[q.assets?.[0]?.kind] || null;
  const canDrag = q.status === "scheduled";

  return (
    <button
      draggable={canDrag}
      onDragStart={(e) => {
        if (!canDrag) { e.preventDefault(); return; }
        e.dataTransfer.setData("text/plain", q.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(q.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(item)}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      title={hookOf(q.text) || "(media only)"}
      className={`group/card relative w-full text-left rounded-lg border bg-white overflow-hidden
        motion-safe:animate-fade-up
        transition-[transform,box-shadow,border-color] duration-200 ${EASE}
        ${dragging ? "opacity-40" : ""}
        ${canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
        border-stone-200/80 hover:border-stone-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]
        motion-safe:hover:-translate-y-[1px] active:scale-[0.98]
        ${dense ? "px-1.5 py-1" : "p-2"}`}
    >
      {/* Status rail — colour lives on one hairline edge rather than tinting
          the whole card, so a week of posts still reads as one list. */}
      <span className={`absolute left-0 top-0 bottom-0 w-[2.5px] ${meta.dot}`} />

      <span className={`flex items-center gap-1 ${dense ? "pl-1" : "pl-1.5"}`}>
        <Clock size={dense ? 8 : 10} className="text-stone-400 shrink-0" />
        <span className={`${dense ? "text-[9.5px]" : "text-[11px]"} font-medium text-stone-500 tabular-nums truncate`}>
          {q.dueAt ? localTime(q.dueAt) : "No time set"}
        </span>
        {AssetIcon && <AssetIcon size={dense ? 8 : 10} className="text-stone-400 shrink-0 ml-auto" />}
        {q.status === "error" && <AlertTriangle size={dense ? 8 : 10} className="text-rose-500 shrink-0" />}
      </span>

      <span className={`flex gap-1.5 mt-0.5 ${dense ? "pl-1" : "pl-1.5"}`}>
        {!dense && thumb && (
          <img
            src={thumb} alt="" loading="lazy"
            className="w-9 h-9 rounded object-cover shrink-0 bg-stone-100"
          />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block leading-tight text-stone-700 ${
            dense ? "text-[10.5px] line-clamp-2" : "text-[12px] line-clamp-3"
          }`}>
            {hookOf(q.text) || "(media only)"}
          </span>
          {!dense && client && (
            <span className="flex items-center gap-1 mt-1">
              <Avatar name={client.name} photoUrl={client.photoUrl} size={12} />
              <span className="text-[10px] text-stone-400 truncate">{client.name}</span>
            </span>
          )}
        </span>
      </span>

      {!dense && !local && (
        <span className="flex items-center gap-1 mt-1.5 pl-1.5 text-[9.5px] text-amber-600">
          <Link2Off size={9} /> not in your board
        </span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Content calendar — Buffer's queue, not our mirror of it.

   WHY THIS RENDERS FROM BUFFER: our own `posts` records only carry a
   `bufferPostId` when the post was scheduled from this dashboard, and their
   `scheduledAt` is never re-synced if the time is later changed in Buffer's
   own app. So the previous version of this calendar silently missed anything
   scheduled directly in Buffer and showed stale times for anything that had
   moved. A calendar that is wrong about when things go out is worse than no
   calendar, so the queue itself is the source of truth here and local records
   are joined onto it for context (client, board link) where they exist.
   ═════════════════════════════════════════════════════════════════════════ */
export default function ContentCalendar({
  posts, clients, queue = [], loading, error, fetchedAt, bufferConnected = true,
  onRefresh, onOpenPost, onUnschedule, onReschedule,
}) {
  const now = new Date();
  const [view, setView] = useState("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [viewing, setViewing] = useState(null);
  const [dayViewing, setDayViewing] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmingUnschedule, setConfirmingUnschedule] = useState(false);
  const enterCount = useRef({});
  const isNarrow = useIsNarrow();

  // Join Buffer's queue onto our own records once, here.
  const items = useMemo(() => {
    const localByBufferId = new Map(
      (posts || []).filter((p) => p.bufferPostId).map((p) => [String(p.bufferPostId), p])
    );
    return queue.map((q) => {
      const local = localByBufferId.get(String(q.id)) || null;
      return {
        post: q,
        local,
        client: local?.clientId ? clients?.find((c) => c.id === local.clientId) : null,
        dayKey: localDayKey(q.dueAt),
      };
    });
  }, [queue, posts, clients]);

  const byDay = useMemo(() => {
    const map = {};
    items.forEach((it) => {
      if (!it.dayKey) return;
      (map[it.dayKey] = map[it.dayKey] || []).push(it);
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => new Date(a.post.dueAt) - new Date(b.post.dueAt))
    );
    return map;
  }, [items]);

  // ── the visible period ───────────────────────────────────────────────────
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const monthCells = useMemo(() => {
    const first = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const total = Math.ceil((offset + lastDate) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const dayNum = i - offset + 1;
      if (dayNum < 1 || dayNum > lastDate) return null;
      return dayKeyOf(new Date(year, month, dayNum));
    });
  }, [year, month]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return dayKeyOf(d);
    });
  }, [anchor]);

  const visibleDays = view === "month" ? monthCells : weekDays;
  const periodKeys = visibleDays.filter(Boolean);
  const periodCount = periodKeys.reduce((n, k) => n + (byDay[k]?.length || 0), 0);

  const periodLabel = view === "month"
    ? `${MONTH_NAMES[month]} ${year}`
    : (() => {
        const s = startOfWeek(anchor);
        const e = new Date(s); e.setDate(s.getDate() + 6);
        const sameMonth = s.getMonth() === e.getMonth();
        return sameMonth
          ? `${s.getDate()}–${e.getDate()} ${MONTH_NAMES[s.getMonth()].slice(0, 3)} ${s.getFullYear()}`
          : `${s.getDate()} ${MONTH_NAMES[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MONTH_NAMES[e.getMonth()].slice(0, 3)}`;
      })();

  // Soonest post still ahead of us, wherever it falls — the calendar can be
  // parked on any month, but "what goes out next" is always worth knowing.
  const nextUp = useMemo(
    () => items.filter((it) => it.post.dueAt && new Date(it.post.dueAt) > now && it.post.status === "scheduled")[0],
    [items] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const step = (delta) => {
    setAnchor((a) => {
      const d = new Date(a);
      if (view === "month") d.setMonth(d.getMonth() + delta, 1);
      else d.setDate(d.getDate() + delta * 7);
      return d;
    });
  };

  // ── actions ──────────────────────────────────────────────────────────────
  const run = async (key, fn) => {
    setBusy(key);
    setActionError("");
    try { await fn(); }
    catch (e) { setActionError(e.message || "That didn't work."); }
    finally { setBusy(""); }
  };

  const handleDrop = (e, dayKey) => {
    e.preventDefault();
    enterCount.current[dayKey] = 0;
    setOverDay(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    const item = items.find((it) => it.post.id === id);
    if (!item || !dayKey || item.dayKey === dayKey) return;

    // Keep the time of day, move only the date — a carefully chosen 7pm slot
    // shouldn't silently become midnight because the card moved sideways.
    const src = new Date(item.post.dueAt);
    const [y, m, d] = dayKey.split("-").map(Number);
    const next = new Date(y, m - 1, d, src.getHours(), src.getMinutes());
    run(`move-${id}`, () => onReschedule(item.post, item.local, next.toISOString()));
  };

  const closeModal = () => { setViewing(null); setConfirmingUnschedule(false); setActionError(""); };

  // ── empty / disconnected states ──────────────────────────────────────────
  if (!bufferConnected) {
    return (
      <Card className="p-10 text-center">
        <span className="w-11 h-11 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
          <CalendarOff size={18} className="text-stone-400" />
        </span>
        <div className="text-[15px] font-semibold text-stone-900">Connect Buffer to see your calendar</div>
        <p className="text-[13px] text-stone-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
          This calendar shows what's genuinely queued to publish. That lives in Buffer,
          so it needs the connection before it can show you anything.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      {/* ══ header ══ */}
      <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-stone-100">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} aria-label="Previous"
              className={`p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800
                transition-[transform,background-color,color] duration-150 ${EASE} active:scale-[0.92]`}>
              <ChevronLeft size={16} />
            </button>
            <span className="text-[15px] font-semibold text-stone-900 tracking-tight min-w-[10.5rem] text-center tabular-nums">
              {periodLabel}
            </span>
            <button onClick={() => step(1)} aria-label="Next"
              className={`p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800
                transition-[transform,background-color,color] duration-150 ${EASE} active:scale-[0.92]`}>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className={`ml-1 text-xs font-medium text-stone-500 hover:text-stone-900 px-2.5 py-1 rounded-lg
                hover:bg-stone-100 transition-[transform,background-color,color] duration-150 ${EASE} active:scale-[0.95]`}
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ViewToggle value={view} onChange={setView} />
            <button
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh from Buffer"
              className={`p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100
                transition-[transform,background-color,color] duration-150 ${EASE} active:scale-[0.92] disabled:opacity-50`}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* ══ live strip: what's real, straight from Buffer ══ */}
        <div className="flex items-center gap-3 mt-2.5 text-xs flex-wrap">
          <span className="flex items-center gap-1.5 text-stone-500">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-teal-400 opacity-70 motion-safe:animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-teal-500" />
            </span>
            <span className="font-semibold text-stone-800 tabular-nums">{queue.length}</span>
            in Buffer's queue
          </span>
          <span className="w-px h-3 bg-line" />
          <span className="text-stone-500">
            <span className="font-semibold text-stone-800 tabular-nums">{periodCount}</span>
            {" "}this {view}
          </span>
          {nextUp && (
            <>
              <span className="w-px h-3 bg-line" />
              <span className="flex items-center gap-1.5 text-stone-500 min-w-0">
                <Zap size={11} className="text-amber-500 shrink-0" />
                next {relativeWhen(nextUp.post.dueAt)}
                <span className="text-stone-400 truncate max-w-[16rem] hidden sm:inline">
                  · {hookOf(nextUp.post.text) || "(media only)"}
                </span>
              </span>
            </>
          )}
          {fetchedAt && (
            <span className="text-stone-300 ml-auto hidden sm:block">
              synced {localTime(fetchedAt)}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-2.5 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/70 rounded-lg px-2.5 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}
        {actionError && !viewing && (
          <div className="mt-2.5 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200/70 rounded-lg px-2.5 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-px" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* ══ grid ══ */}
      <div className="p-3 sm:p-4">
        {/* ── phone: month as a tap-through dot grid ──
            Text cards can't survive a 45px column, so the month view becomes
            a density map — which days have something, how much — and the day
            itself opens the detail. Same information, readable size. */}
        {isNarrow && view === "month" && (
          <>
            <div className="grid grid-cols-7 mb-1.5">
              {DAY_NAMES.map((d, i) => (
                <div key={d} className={`text-center text-[10px] font-semibold uppercase tracking-wide py-1
                  ${i >= 5 ? "text-stone-300" : "text-stone-400"}`}>
                  {d.slice(0, 1)}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {visibleDays.map((dayKey, i) => {
                if (!dayKey) return <div key={`blank-${i}`} />;
                const list = byDay[dayKey] || [];
                const isToday = dayKey === dayKeyOf(now);
                const isPast = dayKey < dayKeyOf(now);
                return (
                  <button
                    key={dayKey}
                    onClick={() => list.length && setDayViewing(dayKey)}
                    disabled={!list.length}
                    className={`aspect-square rounded-lg border flex flex-col items-center justify-center gap-1
                      transition-[transform,background-color,border-color] duration-150 ${EASE}
                      ${list.length ? "active:scale-[0.94] border-stone-200 bg-white" : "border-stone-100 bg-stone-50/40"}
                      ${isPast ? "opacity-60" : ""}`}
                  >
                    <span className={`text-[11px] font-semibold tabular-nums flex items-center justify-center
                      ${isToday ? "bg-stone-900 text-white w-[20px] h-[20px] rounded-full" : "text-stone-500"}`}>
                      {Number(dayKey.slice(-2))}
                    </span>
                    {list.length > 0 && (
                      <span className="flex items-center gap-[3px]">
                        {list.slice(0, 3).map((it) => (
                          <span key={it.post.id}
                            className={`w-[5px] h-[5px] rounded-full ${statusMeta(it.post.status).dot}`} />
                        ))}
                        {list.length > 3 && (
                          <span className="text-[8px] font-semibold text-stone-400">+{list.length - 3}</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── phone: week as a vertical agenda ──
            A week has few enough days to list downward, which gives each post
            the full screen width it needs to be readable. */}
        {isNarrow && view === "week" && (
          <div className="space-y-2">
            {visibleDays.map((dayKey, i) => {
              const list = byDay[dayKey] || [];
              const isToday = dayKey === dayKeyOf(now);
              const d = new Date(`${dayKey}T12:00:00`);
              return (
                <div key={dayKey} className={`rounded-xl border px-2.5 py-2
                  ${isToday ? "border-stone-300 bg-white" : "border-stone-100 bg-stone-50/40"}
                  ${dayKey < dayKeyOf(now) ? "opacity-70" : ""}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[11px] font-semibold tabular-nums flex items-center justify-center px-1.5 py-0.5 rounded-md
                      ${isToday ? "bg-stone-900 text-white" : "text-stone-500"}`}>
                      {DAY_NAMES[i]} {d.getDate()}
                    </span>
                    {list.length === 0 && <span className="text-[11px] text-stone-300">nothing queued</span>}
                    {list.length > 0 && (
                      <span className="text-[10px] text-stone-400 tabular-nums ml-auto">{list.length}</span>
                    )}
                  </div>
                  {list.length > 0 && (
                    <div className="space-y-1.5">
                      {list.map((it, idx) => (
                        <QueueCard
                          key={it.post.id}
                          item={it}
                          index={idx}
                          dense={false}
                          dragging={busy === `move-${it.post.id}`}
                          onOpen={(x) => { setViewing(x); setConfirmingUnschedule(false); setActionError(""); }}
                          onDragStart={() => {}}
                          onDragEnd={() => {}}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── tablet and up: the real grid ── */}
        {!isNarrow && (
        <>
        <div className="grid grid-cols-7 mb-1.5">
          {DAY_NAMES.map((d, i) => (
            <div key={d} className={`text-center text-[10.5px] font-semibold uppercase tracking-wide py-1
              ${i >= 5 ? "text-stone-300" : "text-stone-400"}`}>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {visibleDays.map((dayKey, i) => {
            const isToday = dayKey === dayKeyOf(now);
            const list = dayKey ? byDay[dayKey] || [] : [];
            const isOver = overDay === dayKey;
            const isWeekend = i % 7 >= 5;
            const dayNum = dayKey ? Number(dayKey.slice(-2)) : null;
            const isPast = dayKey && dayKey < dayKeyOf(now);

            return (
              <div
                key={dayKey || `blank-${i}`}
                onDragOver={(e) => { if (dayKey) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                onDragEnter={() => {
                  if (!dayKey) return;
                  enterCount.current[dayKey] = (enterCount.current[dayKey] || 0) + 1;
                  setOverDay(dayKey);
                }}
                onDragLeave={() => {
                  if (!dayKey) return;
                  enterCount.current[dayKey] = Math.max(0, (enterCount.current[dayKey] || 0) - 1);
                  if (enterCount.current[dayKey] === 0) setOverDay((d) => (d === dayKey ? null : d));
                }}
                onDrop={(e) => handleDrop(e, dayKey)}
                className={`rounded-lg border flex flex-col gap-1 p-1.5
                  transition-[background-color,border-color] duration-200 ${EASE}
                  ${view === "week" ? "min-h-[22rem]" : "min-h-[7rem]"}
                  ${!dayKey ? "border-transparent bg-transparent"
                    : isOver ? "border-teal-300 bg-teal-50/70 border-dashed"
                    : isToday ? "border-stone-300 bg-white"
                    : isWeekend ? "border-stone-100 bg-stone-50/40"
                    : "border-stone-100 bg-white"}
                  ${isPast && dayKey ? "opacity-[0.72]" : ""}`}
              >
                {dayKey && (
                  <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[11px] font-semibold tabular-nums flex items-center justify-center
                      transition-colors duration-200 ${EASE}
                      ${isToday
                        ? "bg-stone-900 text-white w-[22px] h-[22px] rounded-full"
                        : isWeekend ? "text-stone-300" : "text-stone-400"}`}>
                      {view === "week" && !isToday
                        ? `${DAY_NAMES[i]} ${dayNum}`.replace(/^.{3} /, "")
                        : dayNum}
                    </span>
                    {list.length > 1 && (
                      <span className="text-[9.5px] font-medium text-stone-300 tabular-nums">{list.length}</span>
                    )}
                  </div>
                )}

                {list.map((it, idx) => (
                  <QueueCard
                    key={it.post.id}
                    item={it}
                    index={idx}
                    dense={view === "month"}
                    dragging={dragId === it.post.id || busy === `move-${it.post.id}`}
                    onOpen={(x) => { setViewing(x); setConfirmingUnschedule(false); setActionError(""); }}
                    onDragStart={setDragId}
                    onDragEnd={() => setDragId(null)}
                  />
                ))}
              </div>
            );
          })}
        </div>
        </>
        )}

        {/* ══ footer legend ══ */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-stone-100 text-[11px] text-stone-400">
          {Object.entries(QUEUE_STATUS_META).map(([k, m]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
              {m.label}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1.5">
            <CalendarDays size={11} />
            live from Buffer{!isNarrow && " · drag a scheduled post to move it"}
          </span>
        </div>

        {!loading && queue.length === 0 && !error && (
          <div className="text-center py-10">
            <span className="w-11 h-11 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
              <CalendarDays size={18} className="text-stone-400" />
            </span>
            <div className="text-[14px] font-semibold text-stone-800">Nothing queued yet</div>
            <p className="text-[13px] text-stone-500 mt-1 max-w-sm mx-auto leading-relaxed">
              Posts show up here the moment they're scheduled to Buffer. Write one in the
              composer and pick a time.
            </p>
          </div>
        )}
      </div>

      {/* ══ phone: one day's posts ══ */}
      {dayViewing && (
        <Modal
          open
          title={new Date(`${dayViewing}T12:00:00`).toLocaleDateString([], {
            weekday: "long", day: "numeric", month: "long",
          })}
          subtitle={`${(byDay[dayViewing] || []).length} queued`}
          onClose={() => setDayViewing(null)}
        >
          <div className="space-y-2">
            {(byDay[dayViewing] || []).map((it, idx) => (
              <QueueCard
                key={it.post.id}
                item={it}
                index={idx}
                dense={false}
                dragging={false}
                onOpen={(x) => {
                  setDayViewing(null);
                  setViewing(x);
                  setConfirmingUnschedule(false);
                  setActionError("");
                }}
                onDragStart={() => {}}
                onDragEnd={() => {}}
              />
            ))}
          </div>
        </Modal>
      )}

      {/* ══ detail ══ */}
      {viewing && (
        <Modal
          open
          width="lg"
          title={viewing.post.dueAt ? new Date(viewing.post.dueAt).toLocaleString([], {
            weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
          }) : "Untimed draft"}
          subtitle={`${statusMeta(viewing.post.status).label} · ${viewing.post.channelName}`}
          onClose={closeModal}
        >
          <div className="space-y-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1.5
                ${statusMeta(viewing.post.status).chip}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusMeta(viewing.post.status).dot}`} />
                {statusMeta(viewing.post.status).label}
              </span>
              {viewing.post.dueAt && (
                <span className="text-[11px] text-stone-500">{relativeWhen(viewing.post.dueAt)}</span>
              )}
              {viewing.client && (
                <span className="flex items-center gap-1.5">
                  <Avatar name={viewing.client.name} photoUrl={viewing.client.photoUrl} size={16} />
                  <span className="text-[11px] text-stone-500">{viewing.client.name}</span>
                </span>
              )}
              {viewing.post.channelAvatar && (
                <span className="flex items-center gap-1.5 ml-auto">
                  <img src={viewing.post.channelAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                  <span className="text-[11px] text-stone-400">{viewing.post.channelName}</span>
                </span>
              )}
            </div>

            {viewing.post.assets?.some((a) => a.thumbnail) && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {viewing.post.assets.filter((a) => a.thumbnail).map((a, i) => (
                  <img key={i} src={a.thumbnail} alt=""
                    className="h-24 rounded-lg border border-stone-200 object-cover shrink-0" />
                ))}
              </div>
            )}

            <p className="text-[13.5px] text-stone-700 whitespace-pre-wrap leading-relaxed max-h-[38vh] overflow-y-auto">
              {viewing.post.text || "(media only)"}
            </p>

            {!viewing.local && (
              <div className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-2">
                <Link2Off size={13} className="shrink-0 mt-px" />
                <span>
                  This was scheduled straight in Buffer, so there's no matching card on your
                  board. Unscheduling it here won't leave a draft behind in the dashboard.
                </span>
              </div>
            )}

            {actionError && (
              <div className="flex items-start gap-2 text-[12px] text-rose-700 bg-rose-50 border border-rose-200/70 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 mt-px" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {viewing.local && onOpenPost && (
                <button
                  onClick={() => { onOpenPost(viewing.local); closeModal(); }}
                  className={`flex-1 min-w-[9rem] text-[13px] font-medium bg-stone-900 text-white rounded-lg px-4 py-2.5
                    flex items-center justify-center gap-1.5
                    transition-[transform,background-color] duration-150 ${EASE} active:scale-[0.98] hover:bg-stone-800`}
                >
                  Open in composer <ArrowUpRight size={14} />
                </button>
              )}

              {viewing.post.status === "scheduled" && (
                confirmingUnschedule ? (
                  <div className="flex-1 min-w-[13rem] flex items-center gap-2">
                    <button
                      onClick={() => run("unschedule", async () => {
                        await onUnschedule(viewing.post, viewing.local);
                        closeModal();
                      })}
                      disabled={!!busy}
                      className={`flex-1 text-[13px] font-medium bg-rose-600 text-white rounded-lg px-3 py-2.5
                        flex items-center justify-center gap-1.5 disabled:opacity-60
                        transition-[transform,background-color] duration-150 ${EASE} active:scale-[0.98] hover:bg-rose-700`}
                    >
                      {busy === "unschedule"
                        ? <><Loader2 size={14} className="animate-spin" /> Removing…</>
                        : "Yes, take it out of the queue"}
                    </button>
                    <button
                      onClick={() => setConfirmingUnschedule(false)}
                      disabled={!!busy}
                      className={`text-[13px] font-medium text-stone-500 rounded-lg px-3 py-2.5 hover:bg-stone-100
                        transition-[transform,background-color] duration-150 ${EASE} active:scale-[0.98]`}
                    >
                      Keep it
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingUnschedule(true)}
                    className={`flex-1 min-w-[9rem] text-[13px] font-medium text-stone-700 bg-white border border-stone-300
                      rounded-lg px-4 py-2.5 flex items-center justify-center gap-1.5 hover:bg-stone-50 hover:border-stone-400
                      transition-[transform,background-color,border-color] duration-150 ${EASE} active:scale-[0.98]`}
                  >
                    <CalendarOff size={14} /> Unschedule
                  </button>
                )
              )}
            </div>

            {viewing.post.status === "scheduled" && !confirmingUnschedule && (
              <p className="text-[11px] text-stone-400 leading-relaxed">
                Unscheduling pulls it out of Buffer's queue and keeps the text as a draft on
                both sides — nothing is deleted{viewing.local ? ", and the card returns to Ready on your board" : ""}.
              </p>
            )}
          </div>
        </Modal>
      )}
    </Card>
  );
}
