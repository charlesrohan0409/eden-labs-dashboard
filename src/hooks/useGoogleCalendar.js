import { useEffect, useMemo, useState } from "react";

// Same module-level cache pattern as useBufferPerformance: the Overview card
// and the full Calendar page both want this, and there's no reason to fetch
// the feed twice just because two components mounted.
//
// The fetch window is fixed rather than a hook parameter on purpose — a
// shared cache keyed by nothing would serve one caller's window to another
// if two components asked for different ranges. Any "this week / this
// month" filtering happens client-side over this one full window instead.
const FETCH_PARAMS = { daysBack: 3, daysAhead: 180 };

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

  // Agenda grouping — "Today", "Tomorrow", then a normal date heading.
  const byDay = useMemo(() => {
    const fmt = (d) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(new Date());

    const groups = {};
    upcoming.forEach((e) => {
      const d = new Date(e.start);
      const key = startOfDay(d);
      if (!groups[key]) {
        const diffDays = Math.round((key - today) / 86400000);
        groups[key] = {
          key,
          label: diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : fmt(d),
          events: [],
        };
      }
      groups[key].events.push(e);
    });
    return Object.values(groups).sort((a, b) => a.key - b.key);
  }, [upcoming]);

  return { ...state, upcoming, byDay, refresh };
}
