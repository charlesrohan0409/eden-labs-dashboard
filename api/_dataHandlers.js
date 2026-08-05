// Auth + data logic for the Supabase-backed dashboard. Kept separate from
// _handlers.js (third-party API proxies) since these import from src/data —
// a different concern, same "server-only" rule.

import { migrateData } from "../src/data/migrate.js";
import { seedData } from "../src/data/seed.js";
import * as M from "../src/data/mutations.js";
import { getOwnerAuth, getAllClientCredentials, setClientCredential, getAppData, upsertAppData } from "./_supabaseAdmin.js";
import { verifyPin, hashPin, genSalt, signToken, verifyToken, bearerFrom } from "./_crypto.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — "log in once, use from anywhere"

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set on the server. Add it to .env.local (dev) or the Vercel project's environment variables (prod), then restart.");
  return s;
}

// ------------------------------------------------------------------ auth ---
export async function handleAuthOwner(body) {
  const pin = String(body?.pin || "").trim();
  if (!pin) return { status: 400, body: { error: "PIN is required." } };
  const row = await getOwnerAuth();
  if (!row) return { status: 501, body: { error: "Owner login isn't set up on the server yet." } };
  if (!verifyPin(pin, row.pin_salt, row.pin_hash)) {
    return { status: 401, body: { error: "That PIN didn't match." } };
  }
  const token = signToken({ role: "owner" }, secret(), SESSION_TTL_SECONDS);
  return { status: 200, body: { token, expiresIn: SESSION_TTL_SECONDS } };
}

export async function handleAuthClient(body) {
  const pin = String(body?.pin || "").trim();
  if (!pin) return { status: 400, body: { error: "PIN is required." } };
  const creds = await getAllClientCredentials();
  const match = creds.find((c) => verifyPin(pin, c.pin_salt, c.pin_hash));
  if (!match) {
    // Never hint at valid PINs — this endpoint is public.
    return { status: 401, body: { error: "That PIN didn't match. Check the one Eden Labs sent you." } };
  }
  const token = signToken({ role: "client", clientId: match.client_id }, secret(), SESSION_TTL_SECONDS);
  return { status: 200, body: { token, expiresIn: SESSION_TTL_SECONDS, clientId: match.client_id } };
}

function requireOwner(headers) {
  const payload = verifyToken(bearerFrom(headers), secret());
  return payload?.role === "owner" ? payload : null;
}

function requireClient(headers) {
  const payload = verifyToken(bearerFrom(headers), secret());
  return payload?.role === "client" && payload.clientId ? payload : null;
}

// ------------------------------------------------------------- app data ---
async function loadData() {
  const row = await getAppData();
  if (!row) {
    const fresh = seedData();
    await upsertAppData(fresh);
    return fresh;
  }
  return migrateData(row.data);
}

export async function handleDataGet(headers) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  return { status: 200, body: { data: await loadData() } };
}

export async function handleDataPut(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  if (!body?.data || typeof body.data !== "object") return { status: 400, body: { error: "Missing `data` object." } };
  await upsertAppData(body.data);
  return { status: 200, body: { ok: true } };
}

// Adds a CRM contact from the Chrome extension. Accepts the full contact
// payload (name, company, title, stage, url, notes, etc.) and merges it into
// the app_data blob via the same addContact mutation the dashboard uses.
export async function handleCRMLead(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  const { name } = body || {};
  if (!name?.trim()) return { status: 400, body: { error: "`name` is required." } };
  const data = await loadData();
  M.addContact(data, {
    name:       name.trim(),
    company:    body.company   || "",
    title:      body.title     || "",
    stage:      body.stage     || "lead",
    source:     body.source    || "Chrome Extension",
    url:        body.url       || "",
    notes:      body.notes     || "",
    email:      body.email     || "",
    phone:      body.phone     || "",
    dealValue:  body.dealValue || null,
    clientId:   null,
    closedDate: null,
    addedDate:  new Date().toISOString().slice(0, 10),
  });
  await upsertAppData(data);
  return { status: 200, body: { ok: true, count: data.contacts.length } };
}

// Called right after a new client is created — hashes their portal PIN into
// client_credentials so /api/auth-client can actually find them. The
// plaintext PIN itself still only lives in the app_data blob (shown to the
// owner, sent once in the onboarding email) — this table never supports it.
export async function handleRegisterClientPin(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  const { clientId, pin } = body || {};
  if (!clientId || !pin) return { status: 400, body: { error: "`clientId` and `pin` are required." } };
  const salt = genSalt();
  await setClientCredential(clientId, hashPin(pin, salt), salt);
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------- client portal ---
function stripClientForPortal(c) {
  const { pin, ...rest } = c;
  return rest;
}

function buildPortalData(full, clientId) {
  const client = full.clients.find((c) => c.id === clientId);
  return {
    profile: full.profile,
    settings: full.settings,
    clients: client ? [stripClientForPortal(client)] : [],
    posts: full.posts.filter((p) => p.clientId === clientId),
    dms: full.dms.filter((d) => d.clientId === clientId),
    calls: full.calls.filter((c) => c.clientId === clientId),
    outreachByChannel: full.outreachByChannel.filter((o) => o.clientId === clientId),
    contacts: full.contacts.filter((c) => c.clientId === clientId),
    comments: full.comments.filter((c) => c.clientId === clientId),
  };
}

export async function handlePortalDataGet(headers) {
  const payload = requireClient(headers);
  if (!payload) return { status: 401, body: { error: "Unauthorized" } };
  const full = await loadData();
  if (!full.clients.find((c) => c.id === payload.clientId)) {
    return { status: 404, body: { error: "This client no longer exists." } };
  }
  return { status: 200, body: { data: buildPortalData(full, payload.clientId) } };
}

// Small allowlist of actions a client session may trigger. Every one forces
// clientId to the token's own — a client can never write another client's
// data no matter what payload they send.
export async function handlePortalAction(headers, body) {
  const payload = requireClient(headers);
  if (!payload) return { status: 401, body: { error: "Unauthorized" } };
  const clientId = payload.clientId;
  const { action, payload: p } = body || {};
  const full = await loadData();

  switch (action) {
    case "addPost":
      M.addPost(full, { ...p, clientId });
      break;
    case "updatePost": {
      const post = full.posts.find((x) => x.id === p?.id);
      if (!post || post.clientId !== clientId) return { status: 403, body: { error: "Not your post." } };
      M.updatePost(full, p.id, p.patch || {});
      break;
    }
    case "updatePostStatus": {
      const post = full.posts.find((x) => x.id === p?.id);
      if (!post || post.clientId !== clientId) return { status: 403, body: { error: "Not your post." } };
      M.updatePostStatus(full, p.id, p.status);
      break;
    }
    case "addContact":
      M.addContact(full, { ...p, clientId });
      break;
    case "updateStage": {
      const contact = full.contacts.find((x) => x.id === p?.id);
      if (!contact || contact.clientId !== clientId) return { status: 403, body: { error: "Not your contact." } };
      M.updateStage(full, p.id, p.stage);
      break;
    }
    case "addComment":
      M.addComment(full, { ...p, clientId, author: "Client" });
      break;
    default:
      return { status: 400, body: { error: `Unknown or disallowed action: ${action}` } };
  }

  await upsertAppData(full);
  return { status: 200, body: { data: buildPortalData(full, clientId) } };
}

// Routes that need the HTTP method and headers, not just a POST body — kept
// separate from _handlers.js's ROUTES (which are all fire-and-forget POST
// proxies) so that dev server plumbing stays simple for both.
export const DATA_ROUTES = {
  "/api/auth-owner": { method: "POST", handler: ({ body }) => handleAuthOwner(body) },
  "/api/auth-client": { method: "POST", handler: ({ body }) => handleAuthClient(body) },
  "/api/register-client-pin": { method: "POST", handler: ({ headers, body }) => handleRegisterClientPin(headers, body) },
  "/api/data": {
    handler: ({ method, headers, body }) => {
      if (method === "GET") return handleDataGet(headers);
      if (method === "PUT") return handleDataPut(headers, body);
      return { status: 405, body: { error: "GET or PUT only" } };
    },
  },
  "/api/portal-data": { method: "GET", handler: ({ headers }) => handlePortalDataGet(headers) },
  "/api/portal-action": { method: "POST", handler: ({ headers, body }) => handlePortalAction(headers, body) },
};
