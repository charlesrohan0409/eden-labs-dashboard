import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBufferPerformance } from "../lib/buffer";

// Buffer's free plan allows 100 requests / 15 min, and both the Performance
// page and Growth want the same data. Cache it at module level so switching
// between them doesn't burn quota, and only refetch when asked.
let cache = null;
let inflight = null;

let generation = 0;

async function loadOnce(force) {
  if (force) { cache = null; inflight = null; generation += 1; }
  if (cache) return cache;
  if (!inflight) {
    // `gen` pins this fetch to the refresh that started it. Without it, a
    // refresh fired while an earlier fetch was still running would have that
    // earlier promise resolve late, overwrite `cache` with pre-refresh data
    // and null out the NEW request's `inflight` from its own .finally.
    const gen = generation;
    inflight = fetchBufferPerformance()
      .then((res) => {
        const next = { ...res, fetchedAt: new Date().toISOString() };
        if (gen === generation) cache = next;
        return next;
      })
      .finally(() => { if (gen === generation) inflight = null; });
  }
  return inflight;
}

export const RANGES = [
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "12 months", days: 365 },
  { value: "all", label: "All time", days: null },
];

const sum = (arr, key) => arr.reduce((s, p) => s + (p.metrics[key] || 0), 0);

/**
 * Loads every sent post from Buffer and derives the numbers each view needs.
 * `enabled` is false until Buffer is actually connected, so we never fire a
 * request that's guaranteed to 501.
 */
export function useBufferPerformance({ enabled = true, range = "90" } = {}) {
  const [state, setState] = useState({ loading: enabled, error: "", data: cache });

  const load = useCallback((force = false) => {
    if (!enabled) { setState({ loading: false, error: "", data: null }); return; }
    setState((s) => ({ ...s, loading: true, error: "" }));
    loadOnce(force)
      .then((data) => setState({ loading: false, error: "", data }))
      .catch((e) => setState({ loading: false, error: e.message, data: null }));
  }, [enabled]);

  useEffect(() => { load(false); }, [load]);

  const derived = useMemo(() => {
    const posts = state.data?.posts || [];
    const cfg = RANGES.find((r) => r.value === range) || RANGES[1];
    const cutoff = cfg.days ? Date.now() - cfg.days * 86400000 : null;
    const inRange = cutoff ? posts.filter((p) => new Date(p.sentAt).getTime() >= cutoff) : posts;

    const totals = {
      posts: inRange.length,
      impressions: sum(inRange, "impressions"),
      reach: sum(inRange, "reach"),
      reactions: sum(inRange, "reactions"),
      comments: sum(inRange, "comments"),
      shares: sum(inRange, "shares"),
      clicks: sum(inRange, "clicks"),
      engagements: sum(inRange, "engagements"),
    };
    // Recompute rather than averaging Buffer's per-post rate: a post with 5
    // impressions shouldn't weigh the same as one with 5,000.
    totals.engagementRate = totals.impressions
      ? Number(((totals.engagements / totals.impressions) * 100).toFixed(2))
      : 0;
    totals.avgImpressions = inRange.length ? Math.round(totals.impressions / inRange.length) : 0;

    // Month-by-month trend, oldest first.
    const byMonthMap = {};
    inRange.forEach((p) => {
      const d = new Date(p.sentAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonthMap[key] = byMonthMap[key] || {
        key, label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        posts: 0, impressions: 0, reach: 0, reactions: 0, comments: 0, engagements: 0,
      };
      const m = byMonthMap[key];
      m.posts += 1;
      m.impressions += p.metrics.impressions;
      m.reach += p.metrics.reach;
      m.reactions += p.metrics.reactions;
      m.comments += p.metrics.comments;
      m.engagements += p.metrics.engagements;
    });
    // Mark the current calendar month as partial — it hasn't finished yet so
    // its numbers will always look low next to complete months. Charts and
    // tooltips use this flag to add "(in progress)" so the visual dip isn't
    // mistaken for a real decline.
    const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const byMonth = Object.values(byMonthMap)
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((m) => ({
        ...m,
        isPartial: m.key === nowKey,
        engagementRate: m.impressions ? Number(((m.engagements / m.impressions) * 100).toFixed(2)) : 0,
      }));

    // Which weekday actually performs, by median-ish average impressions.
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const byDayMap = DAYS.map((d) => ({ day: d, posts: 0, impressions: 0, engagements: 0 }));
    inRange.forEach((p) => {
      const idx = new Date(p.sentAt).getDay();
      byDayMap[idx].posts += 1;
      byDayMap[idx].impressions += p.metrics.impressions;
      byDayMap[idx].engagements += p.metrics.engagements;
    });
    const byDay = byDayMap.map((d) => ({
      ...d,
      avgImpressions: d.posts ? Math.round(d.impressions / d.posts) : 0,
      engagementRate: d.impressions ? Number(((d.engagements / d.impressions) * 100).toFixed(2)) : 0,
    }));

    // Per-channel split.
    const byChannelMap = {};
    inRange.forEach((p) => {
      byChannelMap[p.channelId] = byChannelMap[p.channelId] || {
        channelId: p.channelId, name: p.channelName, service: p.service, avatar: p.channelAvatar,
        posts: 0, impressions: 0, reach: 0, engagements: 0, comments: 0,
      };
      const c = byChannelMap[p.channelId];
      c.posts += 1;
      c.impressions += p.metrics.impressions;
      c.reach += p.metrics.reach;
      c.engagements += p.metrics.engagements;
      c.comments += p.metrics.comments;
    });
    const byChannel = Object.values(byChannelMap)
      .map((c) => ({ ...c, engagementRate: c.impressions ? Number(((c.engagements / c.impressions) * 100).toFixed(2)) : 0 }))
      .sort((a, b) => b.impressions - a.impressions);

    // Previous equal-length window, for the trend arrows.
    let deltas = null;
    if (cfg.days) {
      const prevStart = Date.now() - cfg.days * 2 * 86400000;
      const prevEnd = Date.now() - cfg.days * 86400000;
      const prev = posts.filter((p) => {
        const t = new Date(p.sentAt).getTime();
        return t >= prevStart && t < prevEnd;
      });
      const pct = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
      deltas = {
        posts: pct(inRange.length, prev.length),
        impressions: pct(totals.impressions, sum(prev, "impressions")),
        reach: pct(totals.reach, sum(prev, "reach")),
        engagements: pct(totals.engagements, sum(prev, "engagements")),
      };
    }

    const topPosts = [...inRange].sort((a, b) => b.metrics.impressions - a.metrics.impressions);
    // Anything with a comment is something to go reply to.
    const withComments = [...inRange]
      .filter((p) => p.metrics.comments > 0)
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    return { inRange, totals, byMonth, byDay, byChannel, deltas, topPosts, withComments };
  }, [state.data, range]);

  return {
    ...state,
    ...derived,
    allPosts: state.data?.posts || [],
    channels: state.data?.channels || [],
    fetchedAt: state.data?.fetchedAt,
    refresh: () => load(true),
  };
}
