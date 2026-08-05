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

export async function upsertAppData(data) {
  await rest("/app_data?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: [{ id: 1, data }],
  });
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
