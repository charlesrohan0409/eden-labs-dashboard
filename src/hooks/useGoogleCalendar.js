import { useEffect, useMemo, useState } from "react";

// Same module-level cache pattern as useBufferPerformance: the Overview card
// and the full Calendar page both want this, and there's no reason to fetch
// the feed twice just because two components mounted.
//
// The fetch window is fixed rather than a hook parameter on purpose — a
// shared cache keyed by nothing would serve one caller's window to another
// if two components asked for different ranges. Any "this week / this
// month" filtering happens client-side over this one full window instead.
// Fetch a larger back-window so the Calendar page can show recent past meetings
// (common case: the calendar owner's upcoming events are sparse but recent ones exist).
const FETCH_PARAMS = { daysBack: 90, daysAhead: 180 };

let cache = null;
let inflight = null;

async function loadOnce(force) {
  if (force) { cache = null; inflight = null; }
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(FETCH_PARAMS),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Calendar request failed (${res.status})`);
        cache = json;
        return cache;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useGoogleCalendar() {
  const [state, setState] = useState({ loading: true, error: "", events: [] });

  useEffect(() => {
    loadOnce(false)
      .then((data) => setState({ loading: false, error: "", events: data.events || [], fetchedAt: data.fetchedAt }))
      .catch((e) => setState({ loading: false, error: e.message, events: [] }));
  }, []);

  const refresh = () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    loadOnce(true)
      .then((data) => setState({ loading: false, error: "", events: data.events || [], fetchedAt: data.fetchedAt }))
      .catch((e) => setState({ loading: false, error: e.message, events: [] }));
  };

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (state.events || [])
      .filter((e) => new Date(e.end).getTime() >= now)
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [state.events]);

  // Past events — newest first so the most recent meeting is at the top.
  const past = useMemo(() => {
    const now = Date.now();
    return (state.events || [])
      .filter((e) => new Date(e.end).getTime() < now)
      .sort((a, b) => new Date(b.start) - new Date(a.start));
  }, [state.events]);

  // Build grouped agenda from any sorted event list.
  function groupByDay(events, reversed = false) {
    const fmt = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayTs = startOfDay(new Date());

    const groups = {};
    events.forEach((e) => {
      const d = new Date(e.start);
      const key = startOfDay(d);
      if (!groups[key]) {
        const diffDays = Math.round((key - todayTs) / 86400000);
        let label;
        if (diffDays === 0) label = "Today";
        else if (diffDays === 1) label = "Tomorrow";
        else if (diffDays === -1) label = "Yesterday";
        else label = fmt(d);
        groups[key] = { key, label, events: [] };
      }
      groups[key].events.push(e);
    });
    const sorted = Object.values(groups).sort((a, b) => a.key - b.key);
    return reversed ? sorted.slice().reverse() : sorted;
  }

  // Agenda grouping — "Today", "Tomorrow", then a normal date heading.
  const byDay = useMemo(() => groupByDay(upcoming, false), [upcoming]);

  // Past grouped newest-first (Yesterday, then older dates).
  const byDayPast = useMemo(() => groupByDay(past, true), [past]);

  return { ...state, upcoming, past, byDay, byDayPast, refresh };
}
