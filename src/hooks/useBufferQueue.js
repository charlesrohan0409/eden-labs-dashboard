import { useCallback, useEffect, useState } from "react";
import { fetchBufferQueue } from "../lib/buffer";

// Same module-level cache shape as useBufferPerformance, and for the same
// reason: Buffer's free plan allows 100 requests / 15 min and more than one
// view wants this data. Kept in a SEPARATE cache from the performance one
// because the queue changes whenever you schedule or unschedule something,
// whereas sent-post metrics only move when a post goes out — sharing a cache
// would mean either refetching metrics needlessly or serving a stale queue.
let cache = null;
let inflight = null;

async function loadOnce(force) {
  if (force) { cache = null; inflight = null; }
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchBufferQueue()
      .then((res) => { cache = { ...res, fetchedAt: new Date().toISOString() }; return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Drops the cache so the next mount refetches — call after a write. */
export function invalidateBufferQueue() {
  cache = null;
  inflight = null;
}

/**
 * What is actually sitting in Buffer's queue right now.
 *
 * This is the source of truth for the content calendar. Our own `posts`
 * records are a mirror that can drift (and did): they only carry a
 * `bufferPostId` if the post was scheduled from this dashboard, and their
 * `scheduledAt` isn't re-synced if the time is later changed in Buffer.
 */
export function useBufferQueue({ enabled = true } = {}) {
  const [state, setState] = useState({ loading: enabled, error: "", data: cache });

  const load = useCallback((force = false) => {
    if (!enabled) { setState({ loading: false, error: "", data: null }); return; }
    setState((s) => ({ ...s, loading: true, error: "" }));
    loadOnce(force)
      .then((data) => setState({ loading: false, error: "", data }))
      .catch((e) => setState({ loading: false, error: e.message, data: null }));
  }, [enabled]);

  useEffect(() => { load(false); }, [load]);

  return {
    ...state,
    queue: state.data?.posts || [],
    channels: state.data?.channels || [],
    fetchedAt: state.data?.fetchedAt,
    refresh: () => load(true),
  };
}
