// Correlates Buffer's per-post metrics with the format/type/topic this app
// records, to answer "what should I write more of?"
//
// The honest constraint baked in throughout: with a handful of posts a week,
// almost any ranking here is noise for the first few months. MIN_SAMPLE gates
// every insight, and the UI is expected to SHOW the sample size rather than
// present a confident answer built on four data points. A dashboard that says
// "not enough data yet" is worth more than one that reports randomness.

import { normalizeStatus, contentTypeLabel, hookOf } from "./content.js";

export const MIN_SAMPLE = 10;

// ---- matching -------------------------------------------------------------
// Buffer knows nothing about our posts, so metrics have to be joined back on
// something. `bufferPostId`, stored at schedule time, is exact and is always
// preferred. Text matching is the fallback for the backlog — everything
// published before scheduling went through this app.
function normaliseText(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

export function matchPosts(posts = [], bufferPosts = []) {
  const byId = new Map();
  const byText = new Map();
  bufferPosts.forEach((bp) => {
    if (bp.id) byId.set(String(bp.id), bp);
    const key = normaliseText(bp.text);
    // First writer wins: if two Buffer posts normalise identically, matching
    // either is a coin flip, so don't let a later one silently replace an
    // earlier match and shuffle results between renders.
    if (key && !byText.has(key)) byText.set(key, bp);
  });

  const matched = [];
  posts.forEach((p) => {
    let bp = p.bufferPostId ? byId.get(String(p.bufferPostId)) : null;
    if (!bp) {
      const key = normaliseText(p.content);
      if (key) bp = byText.get(key);
    }
    if (bp) matched.push({ post: p, buffer: bp, metrics: bp.metrics || {} });
  });
  return matched;
}

// ---- grouping -------------------------------------------------------------
const avg = (arr, read) => (arr.length ? arr.reduce((s, x) => s + (read(x) || 0), 0) / arr.length : 0);

/**
 * Rolls matched posts up by some key, returning groups sorted by average
 * engagement. `enough` marks whether a group cleared MIN_SAMPLE — the caller
 * is expected to visibly de-emphasise the ones that didn't rather than
 * silently drop them, so "we don't know yet" stays visible.
 */
export function groupBy(matched, keyOf, labelOf = (k) => k) {
  const groups = new Map();
  matched.forEach((m) => {
    const key = keyOf(m);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });

  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      label: labelOf(key),
      n: items.length,
      enough: items.length >= MIN_SAMPLE,
      avgImpressions: Math.round(avg(items, (m) => m.metrics.impressions)),
      avgEngagements: Math.round(avg(items, (m) => m.metrics.engagements)),
      avgEngagementRate: Number(
        (avg(items, (m) => (m.metrics.impressions ? (m.metrics.engagements / m.metrics.impressions) * 100 : 0))).toFixed(2)
      ),
    }))
    .sort((a, b) => b.avgEngagements - a.avgEngagements);
}

// ---- dimensions -----------------------------------------------------------
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Buckets rather than exact hours: 24 buckets over a few dozen posts would
// leave one post per bucket and rank pure noise.
export function timeBucket(iso) {
  const h = new Date(iso).getHours();
  if (h < 9) return "Early (before 9am)";
  if (h < 12) return "Morning (9am–12pm)";
  if (h < 15) return "Midday (12–3pm)";
  if (h < 18) return "Afternoon (3–6pm)";
  return "Evening (after 6pm)";
}

// Hook shape — classified from the first line, which is the only part most
// people read in-feed. Pattern-matched rather than AI-classified so this
// works with no API key and stays explainable.
export function hookShape(content) {
  const line = hookOf(content);
  if (!line) return "";
  if (/\?\s*$/.test(line)) return "Question";
  if (/^\s*\d|^\s*[A-Za-z]*\s*\d+[%x]/.test(line)) return "Number / stat";
  if (/^(how|why|what|when|the \w+ (way|reason|truth))/i.test(line)) return "How / why";
  if (/^(i |my |we |last year|when i)/i.test(line)) return "Personal";
  if (/(stop|never|don'?t|nobody|everyone|unpopular)/i.test(line)) return "Contrarian";
  return "Statement";
}

/**
 * Every dimension the analytics board reports on, in one place so the board
 * stays a rendering concern.
 */
export function buildInsights(matched) {
  return {
    format: groupBy(matched, (m) => m.post.type || "text", (k) => k.charAt(0).toUpperCase() + k.slice(1)),
    contentType: groupBy(matched, (m) => m.post.contentType, contentTypeLabel),
    topic: groupBy(matched, (m) => (m.post.topic || "").trim()),
    dayOfWeek: groupBy(matched, (m) => DAY_NAMES[new Date(m.buffer.sentAt).getDay()]),
    timeOfDay: groupBy(matched, (m) => timeBucket(m.buffer.sentAt)),
    hookShape: groupBy(matched, (m) => hookShape(m.post.content)),
  };
}

/** Top performing posts, for the "what actually worked" list. */
export function topPosts(matched, limit = 5) {
  return [...matched]
    .sort((a, b) => (b.metrics.engagements || 0) - (a.metrics.engagements || 0))
    .slice(0, limit);
}

export { normalizeStatus };
