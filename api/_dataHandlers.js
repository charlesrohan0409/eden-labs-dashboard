// Auth + data logic for the Supabase-backed dashboard. Kept separate from
// _handlers.js (third-party API proxies) since these import from src/data —
// a different concern, same "server-only" rule.

import { migrateData } from "../src/data/migrate.js";
import { seedData } from "../src/data/seed.js";
import * as M from "../src/data/mutations.js";
import { getOwnerAuth, getAllClientCredentials, setClientCredential, deleteClientCredential, getAppData, upsertAppData, updateAppDataIfUnchanged, uploadToStorage } from "./_supabaseAdmin.js";
import { verifyPin, hashPin, genSalt, signToken, verifyToken, bearerFrom } from "./_crypto.js";
import { applyRecurringResets } from "../src/lib/recurrence.js";

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

// Upload is the one endpoint either session type can call — the owner
// uploads client photos/logos/contracts, but a client also attaches post
// media through their own portal session (PostComposer is shared).
function requireOwnerOrClient(headers) {
  const payload = verifyToken(bearerFrom(headers), secret());
  if (payload?.role === "owner") return payload;
  if (payload?.role === "client" && payload.clientId) return payload;
  return null;
}

// ------------------------------------------------------------------ upload ---
// Takes a data: URL (the client already downscales/re-encodes the file
// before sending it here — see src/lib/media.js), uploads the raw bytes to
// Supabase Storage, and hands back a public URL. Every caller in src/
// stores that URL in the app_data blob instead of the data: URL itself —
// this is the fix for the blob having been ~1MB of inline base64 images
// re-sent on every single load and mutation.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function handleUpload(headers, body) {
  if (!requireOwnerOrClient(headers)) return { status: 401, body: { error: "Unauthorized" } };
  const { dataUrl, filename } = body || {};
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return { status: 400, body: { error: "`dataUrl` must be a data: URL." } };
  }
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return { status: 400, body: { error: "Malformed data URL." } };
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return { status: 413, body: { error: "File is too large to upload." } };
  }
  const ext = filename && filename.includes(".")
    ? filename.split(".").pop().replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)
    : (contentType.split("/")[1] || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10);
  const path = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext || "bin"}`;
  try {
    const url = await uploadToStorage(path, bytes, contentType);
    return { status: 200, body: { url } };
  } catch (e) {
    return { status: 502, body: { error: e.message } };
  }
}

// ------------------------------------------------------------- app data ---
// Returns the data only. loadWithVersion is the variant used by the routes
// that need the optimistic-locking token as well.
async function loadData() {
  return (await loadWithVersion()).data;
}

/**
 * Read-modify-write that can't clobber a concurrent writer.
 *
 * The owner's own PUT /api/data has been optimistically locked for a while
 * (version token in, 409 + replay out). The portal and extension write paths
 * were not: each did loadData() -> mutate -> upsertAppData(full), an
 * unconditional overwrite of the ENTIRE blob. So a client approving a post,
 * or the extension saving a lead from LinkedIn, would happily write back a
 * snapshot taken before whatever the owner had just changed in the dashboard
 * — silently reverting it.
 *
 * `mutate` receives the freshly-loaded data and either mutates it in place or
 * returns an error object `{ status, body }` to abort without writing. It may
 * be called more than once, so it must be a pure function of the data it is
 * handed — the same property that makes the client-side replay safe.
 */
async function mutateWithRetry(mutate, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const { data, version } = await loadWithVersion();
    const abort = mutate(data);
    if (abort) return abort;
    const res = await updateAppDataIfUnchanged(data, version);
    if (res.ok) return { status: 200, body: null, data };
    // Someone else wrote in between. Reload and reapply rather than
    // overwriting them.
  }
  return {
    status: 409,
    body: { error: "Couldn't save — the dashboard was being edited at the same time. Try again." },
  };
}

async function loadWithVersion() {
  const row = await getAppData();
  if (!row) {
    const fresh = seedData();
    const version = await upsertAppData(fresh);
    return { data: fresh, version };
  }
  const migrated = migrateData(row.data);
  // Self-healing reset for weekly/daily-cadence KPIs and recurring tasks —
  // see lib/recurrence.js. Persisted immediately when it actually changes
  // anything, so the reset survives past this one response instead of only
  // existing in-memory for this request.
  const { data, changed } = applyRecurringResets(migrated);
  // The one-time INR display default (see migrate.js) MUST be persisted, not
  // just returned. Left unsaved it would re-apply on every single read, which
  // would silently overwrite a deliberate switch back to USD every time —
  // making the currency toggle look broken rather than merely re-defaulted.
  const currencyDefaultPending = !row.data?.settings?.currencyDefaultApplied;
  let version = row.updated_at;
  if (changed || currencyDefaultPending) version = await upsertAppData(data);
  return { data, version };
}

export async function handleDataGet(headers) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  const { data, version } = await loadWithVersion();
  return { status: 200, body: { data, version } };
}

export async function handleDataPut(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  if (!body?.data || typeof body.data !== "object") return { status: 400, body: { error: "Missing `data` object." } };

  // A write with no version is a caller that predates optimistic locking.
  // Accepted rather than rejected so an old open tab keeps working, but it
  // gets the old last-write-wins behaviour — there's nothing to compare.
  if (!body.version) {
    const version = await upsertAppData(body.data);
    return { status: 200, body: { ok: true, version } };
  }

  const result = await updateAppDataIfUnchanged(body.data, body.version);
  if (result.ok) return { status: 200, body: { ok: true, version: result.version } };

  // 409 carries the CURRENT server state, so the client can replay its
  // mutation against fresh data in one round trip instead of refetching.
  const { data, version } = await loadWithVersion();
  return {
    status: 409,
    body: { error: "This data changed somewhere else while you were working.", data, version },
  };
}

// Adds a CRM contact from the Chrome extension. Accepts the full contact
// payload (name, company, title, stage, url, notes, etc.) and merges it into
// the app_data blob via the same addContact mutation the dashboard uses.
export async function handleCRMLead(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  const { name } = body || {};
  if (!name?.trim()) return { status: 400, body: { error: "`name` is required." } };
  const { data, version } = await loadWithVersion();
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
    photoUrl:   body.photoUrl  || "",
    dealValue:  body.dealValue || null,
    clientId:   null,
    closedDate: null,
    addedDate:  new Date().toISOString().slice(0, 10),
  });
  const saved = await updateAppDataIfUnchanged(data, version);
  if (!saved.ok) {
    return { status: 409, body: { error: "The dashboard was being edited at the same time. Try saving that lead again." } };
  }
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

// Mirror of handleRegisterClientPin — called right after deleteClient wipes
// the client out of the app_data blob, so their old portal PIN stops working
// instead of quietly continuing to authenticate into a client that no longer
// exists.
export async function handleDeleteClientPin(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Unauthorized" } };
  const { clientId } = body || {};
  if (!clientId) return { status: 400, body: { error: "`clientId` is required." } };
  await deleteClientCredential(clientId);
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------- client portal ---
/**
 * What the client is allowed to see of their own record.
 *
 * ALLOWLIST, not a denylist, deliberately. This used to be
 * `const { pin, ...rest } = c` — which was correct on the day it was written
 * and silently wrong the moment anyone added a field. By the time this was
 * caught it was shipping `notes` (the owner's private notes — the UI that
 * edits them is literally labelled "private, not shown to the client"),
 * `contract.notes`, `contract.history` and `hidden` into the client's own
 * browser on every portal load. Not rendered, but one devtools tab away.
 *
 * A new field on the client record is now invisible to the portal until
 * someone deliberately adds it here, which is the safe direction to fail.
 */
function stripClientForPortal(c) {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    photoUrl: c.photoUrl,
    logoUrl: c.logoUrl,
    type: c.type,
    delivery: c.delivery || [],
    contract: {
      value: c.contract?.value ?? 0,
      status: c.contract?.status || "",
      cycle: c.contract?.cycle || "",
      serviceType: c.contract?.serviceType || "",
      startDate: c.contract?.startDate || "",
      renewalDate: c.contract?.renewalDate || "",
      bodyText: c.contract?.bodyText || "",
      // The signed document itself. Was withheld entirely, so a client whose
      // real contract had been uploaded still only ever saw the generated
      // template — see the portal's Contract tab.
      fileUrl: c.contract?.fileUrl || "",
      fileName: c.contract?.fileName || "",
      fileType: c.contract?.fileType || "",
    },
  };
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

  // Version-checked, retrying — see mutateWithRetry. Previously this loaded,
  // mutated and unconditionally overwrote the whole blob, so a client
  // approving a post could silently revert whatever the owner had changed in
  // the dashboard a moment earlier.
  const result = await mutateWithRetry((full) => {
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
      // A client could add a CRM lead but never correct or remove one, so a
      // typo was permanent and a duplicate was forever. Ownership-checked the
      // same way as posts — a client can only touch their own contacts.
      case "updateContact": {
        const contact = full.contacts.find((x) => x.id === p?.id);
        if (!contact || contact.clientId !== clientId) return { status: 403, body: { error: "Not your contact." } };
        M.updateContact(full, p.id, p.patch || {});
        break;
      }
      case "deleteContact": {
        const contact = full.contacts.find((x) => x.id === p?.id);
        if (!contact || contact.clientId !== clientId) return { status: 403, body: { error: "Not your contact." } };
        M.deleteContact(full, p.id);
        break;
      }
      default:
        return { status: 400, body: { error: `Unknown or disallowed action: ${action}` } };
      }
    return null;
  });

  if (result.body) return result;
  return { status: 200, body: { data: buildPortalData(result.data, clientId) } };
}

// ------------------------------------------------------------- extension ---
// Single envelope for everything the Chrome extension writes, rather than a
// separate endpoint file per action (each would re-duplicate the CORS/
// OPTIONS/body boilerplate — exactly the drift crm-lead.js already shows) or
// loosening handlePortalAction's requireClient-only boundary, which is the
// real client portal's security perimeter and returns a full portal payload
// on every call — the wrong shape and the wrong risk for this.
//
// The extension authenticates as EITHER an owner session or a client session
// (role-aware login: a Chrome profile dedicated to one client's LinkedIn
// login can be signed into the extension with that client's own PIN instead
// of the owner's, so everything logged from that profile is scoped to them
// automatically). ownerOnly gates the actions a client session must never
// reach — CRM-adjacent leads and per-client outreach are fine either way,
// but the swipe-file library and the comment-target list are owner tools.
const EXTENSION_ACTIONS = {
  saveLead:            { ownerOnly: false },
  logOutreach:         { ownerOnly: false },
  // NOT owner-only: a Chrome profile signed in with a client's PIN is
  // sitting in that client's LinkedIn inbox, so enquiries captured there
  // belong to them. The clientId hinge below assigns it from the token, so
  // a client session physically cannot file one against someone else.
  saveInbound:         { ownerOnly: false },
  // Opened to client sessions. A Chrome profile signed in with a client's
  // PIN is sitting in THAT client's LinkedIn — the posts it saves and the
  // people it lists to comment on are that client's work, not the agency's.
  // The clientId hinge below files them from the token, so a client session
  // physically cannot write to another client's library.
  saveSwipe:           { ownerOnly: false },
  addCommentTarget:    { ownerOnly: false },
  updateCommentTarget: { ownerOnly: false },
  deleteCommentTarget: { ownerOnly: false },
  // Manual outreach logging from the popup, and the lists/scripts the
  // pickers need to offer.
  logOutreachEntry:    { ownerOnly: false },
  listCampaigns:       { ownerOnly: false, readOnly: true },
  // Read-only — the overlay's panel needs to show what's already on the
  // list, not just write to it. Owner-only like the rest of the comment-
  // target actions, and deliberately returns just this one array rather
  // than routing through handlePortalDataGet's shape (which is client-only
  // and scoped to a single client's posts/dms/calls, not this).
  listCommentTargets: { ownerOnly: false, readOnly: true },
};

export async function handleExtension(headers, body) {
  const payload = verifyToken(bearerFrom(headers), secret());
  const isOwner = payload?.role === "owner";
  const isClient = payload?.role === "client" && !!payload.clientId;
  if (!payload || (!isOwner && !isClient)) return { status: 401, body: { error: "Unauthorized" } };

  const { action, payload: p = {} } = body || {};
  const spec = EXTENSION_ACTIONS[action];
  if (!spec) return { status: 400, body: { error: `Unknown or disallowed action: ${action}` } };
  if (spec.ownerOnly && !isOwner) return { status: 403, body: { error: "This action is owner-only." } };

  // The security hinge: clientId is NEVER read from the payload for a client
  // session — only the token's own clientId. An owner session may target any
  // client (or null = agency) via the payload, since the owner is trusted to
  // say who a save is for.
  const clientId = isOwner ? (p.clientId || null) : payload.clientId;

  const { data, version } = await loadWithVersion();

  if (action === "listCommentTargets") {
    // Scoped to whoever is signed in — an owner session sees the agency's own
    // list (clientId null), a client session sees only theirs.
    const targets = (data.commentTargets || []).filter((t) => (t.clientId || null) === clientId);
    return { status: 200, body: { ok: true, targets } };
  }

  if (action === "listCampaigns") {
    const mine = (arr) => (arr || []).filter((x) => (x.clientId || null) === clientId && x.status === "active");
    return {
      status: 200,
      body: { ok: true, lists: mine(data.leadLists), scripts: mine(data.scripts) },
    };
  }

  // Never PUT /api/data here — there's no optimistic locking, so a stale
  // full-blob write from a long-open popup would roll back everything the
  // dashboard did since the popup was opened. Every action below does its
  // own read-modify-save against the live blob instead.
  switch (action) {
    case "saveLead": {
      if (!p.name?.trim()) return { status: 400, body: { error: "`name` is required." } };
      M.addContact(data, {
        name: p.name.trim(), company: p.company || "", title: p.title || "",
        stage: p.stage || "lead", source: p.source || "Chrome Extension",
        url: p.url || "", notes: p.notes || "", email: p.email || "", phone: p.phone || "",
        photoUrl: p.photoUrl || "", dealValue: p.dealValue || null,
        clientId, closedDate: null, addedDate: new Date().toISOString().slice(0, 10),
      });
      break;
    }
    // Kept for extension versions that haven't been reloaded yet — 1.5.0 and
    // earlier still send this. Deliberately routed to the APPEND path rather
    // than the old upsert-by-day: with several entries per day now normal,
    // the old behaviour would find the day's first entry and overwrite it,
    // silently destroying one of that day's lead lists. An un-reloaded
    // extension is now merely unattributed, not destructive.
    case "logOutreach": {
      if (!p.date) return { status: 400, body: { error: "`date` is required." } };
      M.addOutreachEntry(data, { ...p, clientId, listId: null, scriptId: null });
      break;
    }
    case "saveInbound": {
      if (!p.name?.trim()) return { status: 400, body: { error: "`name` is required." } };
      M.addInbound(data, {
        name: p.name.trim(),
        headline: p.headline || "",
        profileUrl: p.profileUrl || "",
        photoUrl: p.photoUrl || "",
        message: p.message || "",
        channel: p.channel || "linkedin",
        // From the token for a client session; from the payload (or null =
        // the owner's own inbox) for an owner session.
        clientId,
        receivedAt: p.receivedAt || new Date().toISOString().slice(0, 10),
      });
      break;
    }
    case "saveSwipe": {
      if (!p.author?.trim() && !p.text?.trim()) return { status: 400, body: { error: "Need at least an author or some text." } };
      M.addSwipe(data, {
        clientId,
        author: p.author || "", authorPhoto: p.authorPhoto || "", authorUrl: p.authorUrl || "",
        url: p.url || "", text: p.text || "", note: p.note || "", tag: p.tag || "hook",
        savedAt: new Date().toISOString(),
      });
      break;
    }
    case "addCommentTarget": {
      if (!p.profileUrl?.trim()) return { status: 400, body: { error: "`profileUrl` is required." } };
      M.upsertCommentTarget(data, {
        clientId,
        name: p.name || "", profileUrl: p.profileUrl, photoUrl: p.photoUrl || "",
        headline: p.headline || "", notes: p.notes || "",
      });
      break;
    }
    case "updateCommentTarget": {
      if (!p.id) return { status: 400, body: { error: "`id` is required." } };
      // Ownership-checked now that clients can reach this — without it a
      // client session could edit a row belonging to the agency or another
      // client just by knowing its id.
      const t = (data.commentTargets || []).find((x) => x.id === p.id);
      if (!t || (t.clientId || null) !== clientId) return { status: 403, body: { error: "Not your list." } };
      M.updateCommentTarget(data, p.id, p.patch || {});
      break;
    }
    case "deleteCommentTarget": {
      if (!p.id) return { status: 400, body: { error: "`id` is required." } };
      const t = (data.commentTargets || []).find((x) => x.id === p.id);
      if (!t || (t.clientId || null) !== clientId) return { status: 403, body: { error: "Not your list." } };
      M.deleteCommentTarget(data, p.id);
      break;
    }
    case "logOutreachEntry": {
      M.addOutreachEntry(data, {
        clientId,
        date: p.date || new Date().toISOString().slice(0, 10),
        listId: p.listId || null,
        scriptId: p.scriptId || null,
        notes: p.notes || "",
        linkedinConnectionsSent: Number(p.linkedinConnectionsSent) || 0,
        linkedinConnectionsAccepted: Number(p.linkedinConnectionsAccepted) || 0,
        linkedinConversationsStarted: Number(p.linkedinConversationsStarted) || 0,
        linkedinReplied: Number(p.linkedinReplied) || 0,
        linkedinCallsBooked: Number(p.linkedinCallsBooked) || 0,
        linkedinDealsClosed: Number(p.linkedinDealsClosed) || 0,
      });
      if (Array.isArray(p.repliedNames) && p.repliedNames.length) {
        M.addRepliedLeads(data, {
          names: p.repliedNames, clientId,
          listId: p.listId || null, scriptId: p.scriptId || null, date: p.date,
        });
      }
      break;
    }
  }

  // Version-checked like every other write path. A popup that has been open
  // on a LinkedIn tab for an hour must not be able to write back a blob it
  // read before the dashboard changed.
  const saved = await updateAppDataIfUnchanged(data, version);
  if (!saved.ok) {
    return { status: 409, body: { error: "The dashboard was being edited at the same time. Try that again." } };
  }
  return { status: 200, body: { ok: true } };
}

// Routes that need the HTTP method and headers, not just a POST body — kept
// separate from _handlers.js's ROUTES (which are all fire-and-forget POST
// proxies) so that dev server plumbing stays simple for both.
export const DATA_ROUTES = {
  "/api/auth-owner": { method: "POST", handler: ({ body }) => handleAuthOwner(body) },
  "/api/auth-client": { method: "POST", handler: ({ body }) => handleAuthClient(body) },
  "/api/register-client-pin": { method: "POST", handler: ({ headers, body }) => handleRegisterClientPin(headers, body) },
  "/api/delete-client-pin": { method: "POST", handler: ({ headers, body }) => handleDeleteClientPin(headers, body) },
  "/api/data": {
    handler: ({ method, headers, body }) => {
      if (method === "GET") return handleDataGet(headers);
      if (method === "PUT") return handleDataPut(headers, body);
      return { status: 405, body: { error: "GET or PUT only" } };
    },
  },
  "/api/portal-data": { method: "GET", handler: ({ headers }) => handlePortalDataGet(headers) },
  "/api/portal-action": { method: "POST", handler: ({ headers, body }) => handlePortalAction(headers, body) },
  "/api/upload": { method: "POST", handler: ({ headers, body }) => handleUpload(headers, body) },
  "/api/extension": { method: "POST", handler: ({ headers, body }) => handleExtension(headers, body) },
};
