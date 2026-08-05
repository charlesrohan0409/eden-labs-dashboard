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
export async function createBufferPost({ text, channelId, scheduledAt }) {
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
      },
    }
  );

  const result = data?.createPost;
  if (result?.message) throw new Error(result.message);
  if (!result?.post?.id) throw new Error("Buffer didn't confirm the post was created.");
  return result.post;
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
