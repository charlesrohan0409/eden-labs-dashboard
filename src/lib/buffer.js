// Client-side Buffer helper. Every call goes to our own same-origin
// /api/buffer, never to api.buffer.com directly — see api/buffer.js and the
// bufferDevProxy plugin in vite.config.js for why (CORS + secret handling).

async function bufferGraphQL(query, variables) {
  const res = await fetch("/api/buffer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || `Buffer request failed (${res.status})`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

/**
 * Confirms the configured key works and returns every channel across every
 * organization on the account — this is what "Connect" tests and what
 * populates the channel picker clients get mapped to.
 */
export async function listBufferChannels() {
  const orgData = await bufferGraphQL(`
    query GetOrganizations {
      account { organizations { id name } }
    }
  `);
  const orgs = orgData?.account?.organizations || [];

  const channelLists = await Promise.all(
    orgs.map((org) =>
      bufferGraphQL(
        `query GetChannels($orgId: OrganizationId!) {
          channels(input: { organizationId: $orgId }) { id name service avatar }
        }`,
        { orgId: org.id }
      ).then((d) => d?.channels || [])
    )
  );

  return channelLists.flat();
}

// "2026-08-06T09:30" (local, no zone — from a datetime-local input) -> UTC ISO.
function localToUtcISO(localDatetime) {
  return new Date(localDatetime).toISOString();
}

/**
 * Schedules a text post to a specific channel and moment. Buffer has no
 * concept of "draft in our app" — this is only called once a post is actually
 * being sent to Buffer's queue.
 */
/**
 * Turns this app's `media` object into Buffer's `assets` array.
 *
 * Buffer has no file-upload endpoint — you host the file and hand it a
 * publicly reachable URL, which it fetches when the post goes out. That
 * happens to be exactly what we already have: media was migrated off inline
 * base64 onto Supabase Storage public URLs in an earlier pass, so nothing
 * needs uploading again here.
 *
 * Two consequences worth knowing:
 *  - The URL must stay reachable until the post PUBLISHES, not just until
 *    it's scheduled. Deleting a Storage object for a queued post breaks it.
 *  - Polls have no Buffer equivalent, so they can't be scheduled remotely.
 */
export function mediaToAssets(media) {
  if (!media?.items?.length) return [];
  const urls = media.items.map((i) => i.url).filter(Boolean);
  if (!urls.length) return [];

  switch (media.type) {
    case "video":
      return [{ video: { url: urls[0] } }];
    case "document":
      return [{ document: { url: urls[0] } }];
    case "image":
    case "carousel":
      // An ordered array of images IS a carousel to Buffer — same shape,
      // one entry per slide.
      return urls.map((url) => ({ image: { url } }));
    default:
      return [];
  }
}

export function bufferSupportsMedia(media) {
  if (!media) return true;              // text-only always works
  if (media.type === "poll") return false;
  return mediaToAssets(media).length > 0;
}

/**
 * Schedules a post to a specific channel and moment, with media if present.
 * Buffer has no concept of "draft in our app" — this is only called once a
 * post is actually being sent to Buffer's queue.
 */
export async function createBufferPost({ text, channelId, scheduledAt, media = null }) {
  const assets = mediaToAssets(media);

  const data = await bufferGraphQL(
    `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id text } }
        ... on MutationError { message }
      }
    }`,
    {
      input: {
        text,
        channelId,
        schedulingType: "automatic",
        mode: "customScheduled",
        dueAt: localToUtcISO(scheduledAt),
        ...(assets.length ? { assets } : {}),
      },
    }
  );

  const result = data?.createPost;
  if (result?.message) throw new Error(result.message);
  if (!result?.post?.id) throw new Error("Buffer didn't confirm the post was created.");
  return result.post;
}

/**
 * Moves a post OUT of Buffer's queue without destroying it — Buffer keeps the
 * text and media as a draft on its side, we keep our own copy either way.
 *
 * Deliberately `saveToDraft` rather than `deletePost`: unscheduling is a
 * change of mind about *timing*, not about the post. Deleting would make an
 * undo impossible and would throw away anything that had been edited on
 * Buffer's side since it was queued.
 */
export async function unscheduleBufferPost(id) {
  const data = await bufferGraphQL(
    `mutation Unschedule($input: EditPostInput!) {
      editPost(input: $input) {
        __typename
        ... on PostActionSuccess { post { id status } }
        ... on NotFoundError { message }
        ... on UnauthorizedError { message }
        ... on InvalidInputError { message }
        ... on UnexpectedError { message }
      }
    }`,
    { input: { id, saveToDraft: true } }
  );
  const r = data?.editPost;
  if (r?.message) throw new Error(r.message);
  if (r?.__typename !== "PostActionSuccess") {
    throw new Error("Buffer didn't confirm the post was unscheduled.");
  }
  return r.post;
}

/** Moves a queued post to a new time, on Buffer itself. */
export async function rescheduleBufferPost(id, scheduledAt) {
  const data = await bufferGraphQL(
    `mutation Reschedule($input: EditPostInput!) {
      editPost(input: $input) {
        __typename
        ... on PostActionSuccess { post { id dueAt status } }
        ... on NotFoundError { message }
        ... on UnauthorizedError { message }
        ... on InvalidInputError { message }
        ... on UnexpectedError { message }
      }
    }`,
    { input: { id, dueAt: new Date(scheduledAt).toISOString(), mode: "customScheduled" } }
  );
  const r = data?.editPost;
  if (r?.message) throw new Error(r.message);
  if (r?.__typename !== "PostActionSuccess") {
    throw new Error("Buffer didn't confirm the new time.");
  }
  return r.post;
}

/** Hard-deletes a post from Buffer. Not undoable — prefer unschedule. */
export async function deleteBufferPost(id) {
  const data = await bufferGraphQL(
    `mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) {
        __typename
        ... on VoidMutationError { message }
      }
    }`,
    { input: { id } }
  );
  const r = data?.deletePost;
  if (r?.message) throw new Error(r.message);
  return true;
}

// ---------------------------------------------------------------------------
// The queue — what is ACTUALLY scheduled
// ---------------------------------------------------------------------------
//
// `fetchBufferPerformance` below filters to `status: [sent]`, so nothing in
// the app ever knew about posts that haven't gone out yet. That made the
// content calendar wrong in a way that was easy to miss: it rendered our own
// `posts` records, which only carry a `bufferPostId` when the post was
// scheduled THROUGH this dashboard. Anything queued in Buffer's own app was
// invisible here, and any local record whose time had drifted showed the
// stale time rather than the real one.
//
// Buffer is the source of truth for what is going out and when. This fetches
// that directly, and the calendar renders it.

export const QUEUE_STATUSES = ["scheduled", "draft", "sending", "error"];

async function fetchOrgsAndChannels() {
  const orgData = await bufferGraphQL(`query { account { organizations { id name } } }`);
  const orgs = orgData?.account?.organizations || [];
  if (!orgs.length) return { orgs: [], channels: [] };

  const channelLists = await Promise.all(
    orgs.map((org) =>
      bufferGraphQL(
        `query GetChannels($orgId: OrganizationId!) {
          channels(input: { organizationId: $orgId }) { id name service avatar type }
        }`,
        { orgId: org.id }
      ).then((d) => (d?.channels || []).map((c) => ({ ...c, organizationId: org.id })))
    )
  );
  return { orgs, channels: channelLists.flat() };
}

const QUEUE_QUERY = `query GetQueue($orgId: OrganizationId!, $statuses: [PostStatus!], $first: Int, $after: String) {
  posts(input: { organizationId: $orgId, filter: { status: $statuses } }, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id text status dueAt via isCustomScheduled createdAt updatedAt
        channelId channelService
        channel { id name service avatar }
        tags { id name }
        assets { __typename type thumbnail }
        error { __typename }
      }
    }
  }
}`;

/**
 * Every post sitting in Buffer's queue (scheduled, draft, sending, failed),
 * soonest first. `dueAt` comes back as a UTC instant — callers must convert
 * to local rather than slicing the string, or a late-evening post lands on
 * the wrong calendar day.
 */
export async function fetchBufferQueue() {
  const { orgs, channels } = await fetchOrgsAndChannels();
  if (!orgs.length) return { posts: [], channels: [] };

  const all = [];
  for (const org of orgs) {
    let after = null;
    for (let page = 0; page < 25; page++) {
      const data = await bufferGraphQL(QUEUE_QUERY, {
        orgId: org.id, statuses: QUEUE_STATUSES, first: 100, after,
      });
      const conn = data?.posts;
      (conn?.edges || []).forEach((e) => {
        const n = e.node;
        all.push({
          id: n.id,
          text: n.text || "",
          status: n.status,
          dueAt: n.dueAt,
          via: n.via,
          isCustomScheduled: n.isCustomScheduled,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          channelId: n.channelId,
          service: n.channelService,
          channelName: n.channel?.name || "Unknown channel",
          channelAvatar: n.channel?.avatar || "",
          organizationId: org.id,
          tags: n.tags || [],
          assets: (n.assets || []).map((a) => ({
            kind: a.type || "",
            thumbnail: a.thumbnail || "",
          })),
          hasError: !!n.error,
        });
      });
      if (!conn?.pageInfo?.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
  }

  // Soonest first. Anything without a dueAt (an untimed draft) sorts last
  // rather than to 1970, which is where `new Date(null)` would put it.
  all.sort((a, b) => {
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt) - new Date(b.dueAt);
  });
  return { posts: all, channels };
}

// ---------------------------------------------------------------------------
// Performance / analytics
// ---------------------------------------------------------------------------
//
// Buffer exposes two ways to get metrics:
//
//   1. `aggregatedPostMetrics` — pre-rolled totals, but capped at 31 days of
//      history on the free plan ("Free-plan Insights are limited to the last
//      31 days of history").
//   2. `posts { metrics }` — per-post, with NO such cap; verified returning
//      data back to Sept 2025 on this account.
//
// So we pull per-post metrics and roll them up ourselves. Same numbers, full
// history, and one request instead of several.

// Buffer returns metrics as a list of {type, value}; everything downstream
// wants an object, and wants a 0 rather than a missing key.
export const METRIC_KEYS = [
  "impressions", "reach", "reactions", "comments", "shares", "reposts",
  "clicks", "saves", "views", "viewers", "follows", "quotes",
  "totalTimeWatched", "engagementRate",
];

function normaliseMetrics(list = []) {
  const out = {};
  METRIC_KEYS.forEach((k) => { out[k] = 0; });
  list.forEach((m) => {
    if (m && m.type) out[m.type] = Number(m.value) || 0;
  });
  // A post's engagement in absolute terms — Buffer only gives the rate.
  out.engagements = out.reactions + out.comments + out.shares + out.reposts;
  return out;
}

/**
 * Every sent post on the account, with metrics normalised and channels
 * attached. Paginates until Buffer says there's nothing left.
 */
export async function fetchBufferPerformance() {
  const orgData = await bufferGraphQL(`query { account { organizations { id name } } }`);
  const orgs = orgData?.account?.organizations || [];
  if (!orgs.length) return { posts: [], channels: [], organizations: [] };

  const channelLists = await Promise.all(
    orgs.map((org) =>
      bufferGraphQL(
        `query GetChannels($orgId: OrganizationId!) {
          channels(input: { organizationId: $orgId }) { id name service avatar type }
        }`,
        { orgId: org.id }
      ).then((d) => (d?.channels || []).map((c) => ({ ...c, organizationId: org.id })))
    )
  );
  const channels = channelLists.flat();
  const channelById = Object.fromEntries(channels.map((c) => [c.id, c]));

  const POSTS_QUERY = `query GetSentPosts($orgId: OrganizationId!, $first: Int, $after: String) {
    posts(input: { organizationId: $orgId, filter: { status: [sent] } }, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id text sentAt dueAt status via externalLink
          channelId channelService metricsUpdatedAt
          tags { id name }
          metrics { type value unit name }
        }
      }
    }
  }`;

  const all = [];
  for (const org of orgs) {
    let after = null;
    // Guard against a pathological pagination loop.
    for (let page = 0; page < 25; page++) {
      const data = await bufferGraphQL(POSTS_QUERY, { orgId: org.id, first: 100, after });
      const conn = data?.posts;
      (conn?.edges || []).forEach((e) => {
        const n = e.node;
        all.push({
          id: n.id,
          text: n.text || "",
          sentAt: n.sentAt,
          via: n.via,
          externalLink: n.externalLink,
          channelId: n.channelId,
          service: n.channelService,
          channelName: channelById[n.channelId]?.name || "Unknown channel",
          channelAvatar: channelById[n.channelId]?.avatar || "",
          organizationId: org.id,
          tags: n.tags || [],
          metricsUpdatedAt: n.metricsUpdatedAt,
          metrics: normaliseMetrics(n.metrics),
        });
      });
      if (!conn?.pageInfo?.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
  }

  all.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  return { posts: all, channels, organizations: orgs };
}
