// Server-only Supabase access — the service_role key bypasses RLS, which is
// exactly why every table in the migration has RLS enabled with zero
// policies: nothing is reachable except through this client, and this file
// is only ever imported from files under /api, never from src/.
//
// No supabase-js dependency needed for what we do here (a handful of reads/
// writes against a couple of tables) — plain REST calls against PostgREST
// keep the dependency list unchanged.

// Read lazily, not at module top-level: this file is imported by
// vite.config.js before its dev-server plugin has loaded .env.local into
// process.env, so caching these in top-level consts would permanently
// capture `undefined`.
function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured on the server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (dev) or the Vercel project's environment variables (prod), then restart."
    );
  }
  return { url, key };
}

async function rest(path, { method = "GET", body, headers = {} } = {}) {
  const { url: SUPABASE_URL, key: SERVICE_KEY } = config();
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------- app_data ---
export async function getAppData() {
  const rows = await rest("/app_data?id=eq.1&select=data,updated_at");
  return rows?.[0] || null;
}

// Unconditional write. Used for the very first insert and for server-side
// read-modify-write inside a single request (portal/extension actions), which
// read fresh data microseconds earlier and so aren't the stale-write risk
// that a long-open browser tab is.
//
// `updated_at` is always set explicitly: the column defaults to now() on
// INSERT but has no trigger, so an UPDATE would otherwise leave it frozen —
// and it's the version token optimistic locking compares against, so a write
// that didn't bump it would make every later conflict invisible.
export async function upsertAppData(data) {
  const now = new Date().toISOString();
  await rest("/app_data?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [{ id: 1, data, updated_at: now }],
  });
  return now;
}

/**
 * Compare-and-swap write: only succeeds if the row still carries the
 * `updated_at` the caller last read.
 *
 * This is what stops a browser tab that has been open for an hour from
 * flattening everything written since it loaded. It has happened for real —
 * comment-list rows added from the Chrome extension vanished when the
 * dashboard saved a blob it had read before they existed.
 *
 * Returns { ok: false } rather than throwing on a version mismatch: a
 * conflict is an expected, recoverable outcome here (the caller replays its
 * mutation against fresh data), not an error condition.
 */
export async function updateAppDataIfUnchanged(data, expectedVersion) {
  const now = new Date().toISOString();
  const rows = await rest(
    `/app_data?id=eq.1&updated_at=eq.${encodeURIComponent(expectedVersion)}`,
    {
      method: "PATCH",
      // Without return=representation PostgREST answers 204 whether or not
      // anything matched, making a conflict indistinguishable from success.
      headers: { Prefer: "return=representation" },
      body: { data, updated_at: now },
    }
  );
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false };
  return { ok: true, version: rows[0].updated_at || now };
}

// ---------------------------------------------------------------- app_ledger ---
//
// Deliberately NOT part of the app_data blob. That blob is rewritten in full
// on every mutation, and the ledger is ~2,500 entries of historical bank
// data — folding it in would make marking a task done upload a megabyte, on
// every save, forever. Different write pattern, different row.
//
// Same single-row / compare-and-swap shape as app_data, for the same reason:
// a browser tab open for an hour must not flatten an import that happened
// while it sat there.
export async function getLedger() {
  const rows = await rest("/app_ledger?id=eq.1&select=entries,updated_at");
  return rows?.[0] || null;
}

export async function upsertLedger(entries) {
  const now = new Date().toISOString();
  await rest("/app_ledger?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [{ id: 1, entries, updated_at: now }],
  });
  return now;
}

export async function updateLedgerIfUnchanged(entries, expectedVersion) {
  const now = new Date().toISOString();
  const rows = await rest(
    `/app_ledger?id=eq.1&updated_at=eq.${encodeURIComponent(expectedVersion)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { entries, updated_at: now },
    }
  );
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false };
  return { ok: true, version: rows[0].updated_at || now };
}

// -------------------------------------------------------------- owner_auth ---
export async function getOwnerAuth() {
  const rows = await rest("/owner_auth?id=eq.1&select=pin_hash,pin_salt");
  return rows?.[0] || null;
}

export async function setOwnerAuth(pinHash, pinSalt) {
  await rest("/owner_auth?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [{ id: 1, pin_hash: pinHash, pin_salt: pinSalt }],
  });
}

// -------------------------------------------------------- client_credentials ---
export async function getAllClientCredentials() {
  return (await rest("/client_credentials?select=client_id,pin_hash,pin_salt")) || [];
}

export async function setClientCredential(clientId, pinHash, pinSalt) {
  await rest("/client_credentials?on_conflict=client_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [{ client_id: clientId, pin_hash: pinHash, pin_salt: pinSalt }],
  });
}

export async function deleteClientCredential(clientId) {
  await rest(`/client_credentials?client_id=eq.${encodeURIComponent(clientId)}`, { method: "DELETE" });
}

// ------------------------------------------------------------------ storage ---
// Uploads to the "media" bucket (public read, created once up front — see
// the one-off setup script, not part of the app). Same "no supabase-js
// needed" philosophy as the rest of this file: a plain fetch against
// Supabase's Storage REST API, same service-role-key auth as `rest()`
// above, just a different base path (/storage/v1 instead of /rest/v1) and a
// binary body instead of JSON.
//
// This is what actually fixes the runaway bandwidth: a photo used to sit
// inline in the one JSON blob that's re-sent in full on every single page
// load and every single mutation. Uploaded once here, it's referenced
// afterward by a ~80-byte URL instead of hundreds of KB of base64.
export async function uploadToStorage(path, bytes, contentType) {
  const { url: SUPABASE_URL, key: SERVICE_KEY } = config();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Storage upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}
