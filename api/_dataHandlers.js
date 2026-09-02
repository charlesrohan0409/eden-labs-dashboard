// Auth + data logic for the Supabase-backed dashboard. Kept separate from
// _handlers.js (third-party API proxies) since these import from src/data —
// a different concern, same "server-only" rule.

import { migrateData } from "../src/data/migrate.js";
import { financeAlerts, alertsEmail } from "../src/lib/financeAlerts.js";
import { handleSendEmail } from "./_handlers.js";
import { seedData } from "../src/data/seed.js";
import * as M from "../src/data/mutations.js";
import { getOwnerAuth, getAllClientCredentials, setClientCredential, deleteClientCredential, getAppData, upsertAppData, updateAppDataIfUnchanged, getLedger, upsertLedger, updateLedgerIfUnchanged, getIntegration, setIntegration, deleteIntegration, uploadToStorage } from "./_supabaseAdmin.js";
import { verifyPin, hashPin, genSalt, signToken, verifyToken, bearerFrom } from "./_crypto.js";
import { applyRecurringResets } from "../src/lib/recurrence.js";
import * as G from "./_gmail.js";

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
    // The portal builds its nav from this. Without it navForClient always
    // took its fallback and a content-only client still saw an Outreach tab —
    // precisely what the services field was added to prevent.
    services: c.services || [],
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

/**
 * Strips a client-supplied patch down to fields that client is allowed to set.
 *
 * Every update path here ownership-checks the record by its CURRENT id and
 * then applied the patch with a bare Object.assign. The check passing said
 * nothing about what the patch contained, so a client could send a patch for
 * a record they legitimately own and rewrite its identity:
 *
 *   { clientId: "<another client>" }  moves the record into their portal
 *   { clientId: null }                moves it into the agency's own CRM
 *   { id: "<someone else's id>" }     forges a collision, and the delete
 *                                     handlers filter by id, so the victim's
 *                                     row is removed alongside it
 *
 * An allowlist is the only shape that fails safe here: a field added later is
 * invisible to clients until someone deliberately lists it, rather than
 * becoming writable the moment it exists.
 */
function pickAllowed(patch, allowed) {
  const out = {};
  if (!patch || typeof patch !== "object") return out;
  allowed.forEach((k) => { if (patch[k] !== undefined) out[k] = patch[k]; });
  return out;
}

// Deliberately narrow. `id` and `clientId` are absent from all three by
// design — identity is never client-writable.
const CLIENT_PATCH_FIELDS = {
  // A client edits the words of their own post; status transitions go through
  // updatePostStatus, which validates them.
  post: ["content", "media", "poll", "type", "contentType", "topic"],
  contact: ["name", "company", "title", "email", "phone", "url", "notes", "dealValue"],
  commentTarget: ["name", "headline", "notes", "inSearch"],
  // A client runs their own campaigns now, so they edit the shape of a list
  // or script they created. `clientId` is absent by design — pickAllowed
  // drops it, so no patch can move a record to another owner.
  leadList: ["name", "channel", "niche", "status", "notes"],
  script: ["name", "channel", "body", "status", "notes"],
  outreachEntry: [
    "date", "listId", "scriptId", "notes",
    "linkedinConnectionsSent", "linkedinConnectionsAccepted", "linkedinConversationsStarted",
    "linkedinReplied", "linkedinCallsBooked", "linkedinDealsClosed",
    "emailSent", "emailReplied", "emailCallsBooked",
  ],
};

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
    // The portal's Outreach tab needs these. Strict === clientId, not the
    // forClient() helper: that treats a falsy clientId as "the agency's own",
    // so a bug there would leak Eden Labs' own outreach into a client's
    // dashboard rather than simply showing nothing.
    outreachLog: (full.outreachLog || []).filter((e) => e.clientId === clientId),
    // Names only — the list is context for the client's own numbers, and the
    // niche notes on it are internal targeting thinking, not theirs to read.
    // A list the CLIENT created comes back whole — they wrote it, and they
    // need its channel and niche to edit it. One the AGENCY built for them
    // stays names-only: the targeting thinking on it is Eden Labs' working
    // material, not part of what the client is buying.
    leadLists: (full.leadLists || [])
      .filter((l) => l.clientId === clientId)
      .map((l) => (l.createdByClient
        ? l
        : { id: l.id, name: l.name, status: l.status })),
    // Their own scripts, same rule — the body of an agency-written script is
    // the agency's copywriting, so only its name travels.
    scripts: (full.scripts || [])
      .filter((sc) => sc.clientId === clientId)
      .map((sc) => (sc.createdByClient
        ? sc
        : { id: sc.id, name: sc.name, status: sc.status, channel: sc.channel })),
    // The rhythm view needs these. Same strict === clientId as everything
    // else here, so the agency's own commenting never reaches a client.
    commentLog: (full.commentLog || []).filter((c) => c.clientId === clientId),
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

/**
 * Refuses an outreach entry that points at someone else's list or script.
 *
 * The clientId hinge stops a client writing a row that BELONGS to another
 * client, but says nothing about what that row REFERENCES — and a listId is
 * a foreign key into a table full of other people's campaigns. Without this,
 * a hand-made request could file its numbers against a rival's list and read
 * back that list's name in its own dashboard.
 */
function refNotOwned(full, clientId, fields) {
  if (fields.listId) {
    const l = (full.leadLists || []).find((x) => x.id === fields.listId);
    if (!l || l.clientId !== clientId) return { status: 403, body: { error: "Not your list." } };
  }
  if (fields.scriptId) {
    const sc = (full.scripts || []).find((x) => x.id === fields.scriptId);
    if (!sc || sc.clientId !== clientId) return { status: 403, body: { error: "Not your script." } };
  }
  return null;
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
        M.updatePost(full, p.id, pickAllowed(p.patch, CLIENT_PATCH_FIELDS.post));
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
        M.updateContact(full, p.id, pickAllowed(p.patch, CLIENT_PATCH_FIELDS.contact));
        break;
      }
      case "deleteContact": {
        const contact = full.contacts.find((x) => x.id === p?.id);
        if (!contact || contact.clientId !== clientId) return { status: 403, body: { error: "Not your contact." } };
        M.deleteContact(full, p.id);
        break;
      }

      // ---- campaigns: lists, scripts, and the daily numbers ----
      //
      // A client session could already log outreach through the Chrome
      // extension (EXTENSION_ACTIONS.logOutreachEntry) while their own
      // dashboard offered no way to do the same thing, or to create the list
      // the extension's picker was asking them to choose from. These close
      // that gap. Every one forces clientId from the token and refuses to
      // touch a record belonging to anyone else.
      case "addLeadList":
        M.addLeadList(full, {
          ...pickAllowed(p, CLIENT_PATCH_FIELDS.leadList),
          clientId,
          // Marks it as the client's own work, which is what lets
          // buildPortalData hand back its full detail rather than just a
          // name — the stripping exists to keep the agency's targeting
          // notes private, and a list the client wrote isn't that.
          createdByClient: true,
        });
        break;
      case "updateLeadList": {
        const list = (full.leadLists || []).find((x) => x.id === p?.id);
        if (!list || list.clientId !== clientId) return { status: 403, body: { error: "Not your list." } };
        M.updateLeadList(full, p.id, pickAllowed(p.patch, CLIENT_PATCH_FIELDS.leadList));
        break;
      }
      case "deleteLeadList": {
        const list = (full.leadLists || []).find((x) => x.id === p?.id);
        if (!list || list.clientId !== clientId) return { status: 403, body: { error: "Not your list." } };
        // Only their own. A list the agency built for them stays put — the
        // history hanging off it is the agency's record of work delivered.
        if (!list.createdByClient) return { status: 403, body: { error: "This list was set up by Eden Labs — ask them to remove it." } };
        M.deleteLeadList(full, p.id);
        break;
      }

      case "addScript":
        M.addScript(full, { ...pickAllowed(p, CLIENT_PATCH_FIELDS.script), clientId, createdByClient: true });
        break;
      case "updateScript": {
        const sc = (full.scripts || []).find((x) => x.id === p?.id);
        if (!sc || sc.clientId !== clientId) return { status: 403, body: { error: "Not your script." } };
        M.updateScript(full, p.id, pickAllowed(p.patch, CLIENT_PATCH_FIELDS.script));
        break;
      }
      case "deleteScript": {
        const sc = (full.scripts || []).find((x) => x.id === p?.id);
        if (!sc || sc.clientId !== clientId) return { status: 403, body: { error: "Not your script." } };
        if (!sc.createdByClient) return { status: 403, body: { error: "This script was written by Eden Labs — ask them to remove it." } };
        M.deleteScript(full, p.id);
        break;
      }

      case "logOutreachEntry": {
        const fields = pickAllowed(p, CLIENT_PATCH_FIELDS.outreachEntry);
        const bad = refNotOwned(full, clientId, fields);
        if (bad) return bad;
        M.addOutreachEntry(full, { ...fields, clientId });
        break;
      }
      case "updateOutreachEntry": {
        const e = (full.outreachLog || []).find((x) => x.id === p?.id);
        if (!e || e.clientId !== clientId) return { status: 403, body: { error: "Not your entry." } };
        const patch = pickAllowed(p.patch, CLIENT_PATCH_FIELDS.outreachEntry);
        const bad = refNotOwned(full, clientId, patch);
        if (bad) return bad;
        M.updateOutreachEntry(full, p.id, patch);
        break;
      }
      case "deleteOutreachEntry": {
        const e = (full.outreachLog || []).find((x) => x.id === p?.id);
        if (!e || e.clientId !== clientId) return { status: 403, body: { error: "Not your entry." } };
        M.deleteOutreachEntry(full, p.id);
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
  listSwipeFolders:    { ownerOnly: false, readOnly: true },
  // Filing at save time is the only moment the reason for filing is fresh,
  // and that's worthless if the right folder doesn't exist yet and making
  // one means leaving LinkedIn for the dashboard. Client sessions get this
  // for the same reason they get saveSwipe — the folders are scoped by the
  // clientId hinge below, so one can only ever create its own.
  addSwipeFolder:      { ownerOnly: false },
  // Same reasoning as addSwipeFolder: listCampaigns asks you to pick a list,
  // and being unable to create one without leaving LinkedIn for the
  // dashboard is why the picker sat empty.
  addLeadList:         { ownerOnly: false },
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

  if (action === "listSwipeFolders") {
    const folders = (data.swipeFolders || [])
      .filter((f) => (f.clientId || null) === clientId)
      .map((f) => ({ id: f.id, name: f.name }));
    return { status: 200, body: { ok: true, folders } };
  }

  if (action === "listCampaigns") {
    const mine = (arr) => (arr || []).filter((x) => (x.clientId || null) === clientId && x.status === "active");
    return {
      status: 200,
      body: { ok: true, lists: mine(data.leadLists), scripts: mine(data.scripts) },
    };
  }

  // Ids minted inside the switch that the caller needs back. The extension
  // can't guess one — it's assigned here — and a "create folder then file
  // this post into it" flow would otherwise need two round-trips and a
  // re-list to find out what it just made.
  let extra = {};

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
        photoUrl: p.photoUrl || "",
        // Split, same as invoices and expenses: dealValue is the USD
        // snapshot every pipeline total sums, nativeDealValue is what was
        // actually quoted. The extension does the conversion (it can reach
        // an FX source; this handler can't) and sends a null snapshot
        // rather than a wrong one if no rate was available.
        dealValue: p.dealValue ?? null,
        nativeDealValue: p.nativeDealValue ?? null,
        dealCurrency: p.dealCurrency || "USD",
        dealFxRate: p.dealFxRate ?? null,
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
      // folderId is ownership-checked rather than trusted: a client session
      // could otherwise file a post into the agency's folder, or another
      // client's, just by sending its id.
      const folder = p.folderId
        ? (data.swipeFolders || []).find((f) => f.id === p.folderId && (f.clientId || null) === clientId)
        : null;
      M.addSwipe(data, {
        clientId,
        author: p.author || "", authorPhoto: p.authorPhoto || "", authorUrl: p.authorUrl || "",
        headline: p.headline || "",
        url: p.url || "", text: p.text || "", note: p.note || "", tag: p.tag || "hook",
        folderId: folder ? folder.id : null,
        stats: p.stats && typeof p.stats === "object"
          ? {
              reactions: Number(p.stats.reactions) || 0,
              comments: Number(p.stats.comments) || 0,
              reposts: Number(p.stats.reposts) || 0,
            }
          : null,
        // Already uploaded to our own Storage by the time they arrive — the
        // extension copies them rather than sending LinkedIn's signed CDN
        // links, which expire. Capped and type-checked here anyway, since
        // this is a public endpoint and the blob is shared state.
        images: Array.isArray(p.images)
          ? p.images.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)).slice(0, 4)
          : [],
        savedAt: new Date().toISOString(),
      });
      break;
    }
    // Mirrors addSwipeFolder exactly, including the same-name guard: the
    // popup's list picker is one tap away from a "+" and typing a list that
    // already exists is the expected mistake, not an edge case.
    case "addLeadList": {
      const name = (p.name || "").trim();
      if (!name) return { status: 400, body: { error: "List needs a name." } };
      const existing = (data.leadLists || []).find(
        (l) => (l.clientId || null) === clientId && (l.name || "").trim().toLowerCase() === name.toLowerCase()
      );
      if (existing) { extra = { listId: existing.id }; break; }
      M.addLeadList(data, {
        clientId, name,
        channel: p.channel || "linkedin",
        niche: p.niche || "",
        ...(isOwner ? {} : { createdByClient: true }),
      });
      extra = { listId: (data.leadLists || []).at(-1)?.id };
      break;
    }

    case "addSwipeFolder": {
      const name = (p.name || "").trim();
      if (!name) return { status: 400, body: { error: "Folder needs a name." } };
      // Same name, same owner = the folder they meant. The "+" button is
      // one tap next to a dropdown that may be scrolled past the existing
      // folder, so typing a name that already exists is the expected
      // mistake, not an edge case — and silently making a second "Hooks"
      // would split the library in a way that's tedious to undo.
      const existing = (data.swipeFolders || []).find(
        (f) => (f.clientId || null) === clientId && (f.name || "").trim().toLowerCase() === name.toLowerCase()
      );
      if (existing) { extra = { folderId: existing.id }; break; }
      M.addSwipeFolder(data, { clientId, name });
      extra = { folderId: (data.swipeFolders || []).at(-1)?.id || null };
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
      M.updateCommentTarget(data, p.id, pickAllowed(p.patch, CLIENT_PATCH_FIELDS.commentTarget));
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
  return { status: 200, body: { ok: true, ...extra } };
}

// ------------------------------------------------------------------ ledger ---
//
// Owner-only, and separate from /api/data on purpose — see app_ledger in
// _supabaseAdmin.js. The Analysis page reads this once; nothing else in the
// app touches it, so it never rides along on a normal save.
export async function handleLedgerGet(headers) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Not authorised." } };
  const row = await getLedger();
  if (!row) {
    // The migration seeds an empty row, but a fresh database might not have
    // run it yet. Creating it here beats a 500 the owner can do nothing with.
    const version = await upsertLedger([]);
    return { status: 200, body: { entries: [], version } };
  }
  return { status: 200, body: { entries: row.entries || [], version: row.updated_at } };
}

/**
 * Appends entries to the ledger without the caller holding the whole thing.
 *
 * A dashboard action knows about one transaction, not three thousand. Making
 * it read the entire ledger, splice, and write it back would mean every
 * logged expense round-trips a megabyte and races every other tab. Reading
 * and appending server-side keeps the client's job to "here is what happened".
 */
export async function handleLedgerAppend(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Not authorised." } };
  const add = body?.append;
  if (!Array.isArray(add) || !add.length) return { status: 400, body: { error: "append must be a non-empty array." } };

  const bad = add.filter((tx) => !Array.isArray(tx?.legs) || tx.legs.reduce((a, l) => a + (Number(l?.base) || 0), 0) !== 0);
  if (bad.length) return { status: 400, body: { error: `${bad.length} transaction(s) do not balance — refusing to store.` } };

  const row = await getLedger();
  const entries = row?.entries || [];
  // Idempotent on ref.origin: a retried save, or the same action fired twice
  // by a double-click, must not book the expense twice.
  const seen = new Set(entries.map((t) => t.ref?.origin).filter(Boolean));
  const fresh = add.filter((t) => !t.ref?.origin || !seen.has(t.ref.origin));
  if (!fresh.length) return { status: 200, body: { ok: true, added: 0, skipped: add.length, total: entries.length } };

  const next = [...entries, ...fresh].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const res = row?.updated_at
    ? await updateLedgerIfUnchanged(next, row.updated_at)
    : { ok: true, version: await upsertLedger(next) };
  if (!res.ok) return { status: 409, body: { error: "The ledger changed while saving. Try again." } };
  return { status: 200, body: { ok: true, added: fresh.length, skipped: add.length - fresh.length, total: next.length, version: res.version } };
}

export async function handleLedgerPut(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Not authorised." } };
  const entries = body?.entries;
  if (!Array.isArray(entries)) {
    return { status: 400, body: { error: "entries must be an array." } };
  }
  // Refuse an unbalanced ledger at the door. The whole point of double entry
  // is that a broken entry never reaches storage, and a client that has been
  // edited or half-migrated is exactly where one would come from.
  const bad = entries.filter((tx) => !Array.isArray(tx?.legs) || tx.legs.reduce((a, l) => a + (Number(l?.base) || 0), 0) !== 0);
  if (bad.length) {
    return { status: 400, body: { error: `${bad.length} transaction(s) do not balance — refusing to store.`, ids: bad.slice(0, 5).map((t) => t.id || t.date) } };
  }
  const version = body?.version;
  if (!version) {
    const v = await upsertLedger(entries);
    return { status: 200, body: { ok: true, version: v } };
  }
  const res = await updateLedgerIfUnchanged(entries, version);
  if (!res.ok) {
    const fresh = await getLedger();
    return { status: 409, body: { error: "The ledger changed since you loaded it.", entries: fresh?.entries || [], version: fresh?.updated_at } };
  }
  return { status: 200, body: { ok: true, version: res.version } };
}


// ------------------------------------------------------------------ gmail ---

/**
 * Step one: hand back a consent URL.
 *
 * The browser then leaves for Google and comes back to /api/gmail-callback,
 * which carries no Authorization header — Google controls that redirect. So
 * the proof that an owner started this is carried in `state`, signed with the
 * same secret as a session and good for ten minutes. Without it, anyone who
 * knew the callback URL could bind their own mailbox to this dashboard.
 */
export async function handleGmailAuth(headers, origin) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Not authorised." } };
  if (!G.clientId()) return { status: 501, body: { error: "GOOGLE_CLIENT_ID isn't set on the server." } };
  const state = signToken({ role: "owner", purpose: "gmail" }, secret(), 600);
  return { status: 200, body: { url: G.consentUrl({ origin, state }) } };
}

const page = (title, message, tone) => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#F4F3F0;color:#1C1917;
display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
.c{background:#fff;border:1px solid #E7E4DE;border-radius:16px;padding:28px 32px;max-width:420px;text-align:center;
box-shadow:0 8px 24px rgba(0,0,0,.05)}h1{font-size:17px;margin:0 0 6px}p{font-size:14px;color:#57534E;margin:0 0 18px;line-height:1.5}
a{display:inline-block;background:#141413;color:#fff;text-decoration:none;font-size:13px;font-weight:500;padding:9px 16px;border-radius:9px}
.d{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;margin:0 auto 14px;font-size:17px;
background:${tone === "ok" ? "#ECFDF5" : "#FEF2F2"}}</style>
<div class="c"><div class="d">${tone === "ok" ? "✓" : "!"}</div><h1>${title}</h1><p>${message}</p>
<a href="/">Back to the dashboard</a></div>`;

export async function handleGmailCallback({ code, state, error, origin }) {
  if (error) return { html: page("Gmail wasn't connected", `Google returned "${error}". Nothing was changed.`, "bad") };
  if (!code || !state) return { html: page("Gmail wasn't connected", "That link was missing its authorisation code.", "bad") };
  const payload = verifyToken(state, secret());
  if (payload?.role !== "owner" || payload?.purpose !== "gmail") {
    return { html: page("Gmail wasn't connected", "That link has expired or wasn't started from your dashboard. Try Connect again.", "bad") };
  }
  try {
    const tok = await exchangeAndStore(code, origin);
    return { html: page("Gmail connected", `Reading bank alerts from ${tok.email || "your inbox"}. Open Finance and press Sync to pull them in.`, "ok") };
  } catch (e) {
    return { html: page("Gmail wasn't connected", e.message, "bad") };
  }
}

async function exchangeAndStore(code, origin) {
  const tok = await G.exchangeCode({ code, origin });
  if (!tok.refresh_token) {
    throw new Error("Google didn't return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.");
  }
  let email = null;
  try {
    const me = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then((r) => r.json());
    email = me.emailAddress || null;
  } catch { /* the address is a nicety, not worth failing the connect over */ }
  await setIntegration("gmail", { refresh_token: tok.refresh_token, email, connectedAt: new Date().toISOString() });
  return { email };
}

export async function handleGmailStatus(headers) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Not authorised." } };
  const row = await getIntegration("gmail");
  const id = G.clientId();
  // The token itself is never returned — only whether one exists. The client
  // ID IS returned: it is public by construction (it travels in the consent
  // URL), and when Google answers "OAuth client was not found" the only way
  // to tell a typo from a missing credential is to read back what the server
  // is actually sending and compare it against the console.
  return {
    status: 200,
    body: {
      connected: !!row?.refresh_token,
      email: row?.email || null,
      connectedAt: row?.connectedAt || null,
      clientId: id || null,
      clientIdLooksValid: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id),
      hasSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    },
  };
}

export async function handleGmailDisconnect(headers) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Not authorised." } };
  await deleteIntegration("gmail");
  return { status: 200, body: { ok: true } };
}

/**
 * Reads recent bank alerts and returns the ones the ledger hasn't got.
 *
 * Writes nothing. The response is a proposal; recording is a separate,
 * deliberate act — see the note at the top of _gmail.js.
 */
export async function handleGmailSync(headers, body) {
  if (!requireOwner(headers)) return { status: 401, body: { error: "Not authorised." } };
  const row = await getIntegration("gmail");
  if (!row?.refresh_token) return { status: 400, body: { error: "Gmail isn't connected yet." } };

  const days = Math.min(Math.max(Number(body?.days) || 30, 1), 365);
  let access;
  try {
    access = (await G.refreshAccessToken(row.refresh_token)).access_token;
  } catch (e) {
    return { status: 502, body: { error: `Google refused the saved token: ${e.message}. Disconnect and connect again.` } };
  }

  const ids = await G.listMessages(access, { days, max: Number(body?.max) || 120 });
  const msgs = [];
  for (const { id } of ids) {
    try { msgs.push(await G.getMessage(access, id)); } catch { /* one unreadable mail shouldn't sink the batch */ }
  }
  const parsed = [], unparsed = [];
  for (const m of msgs) {
    const p = G.parseAlert(m);
    if (p) parsed.push(p);
    else unparsed.push({ id: m.id, date: m.date, subject: m.subject, preview: m.text.slice(0, 160) });
  }
  const { entries: ledger } = (await handleLedgerGet(headers)).body;
  const fresh = G.findNew(parsed, ledger);

  return {
    status: 200,
    body: {
      scanned: msgs.length, parsed: parsed.length, alreadyInLedger: parsed.length - fresh.length,
      pending: fresh.sort((a, b) => b.date.localeCompare(a.date)),
      // Returned so the parser can be calibrated against real mail rather
      // than guessed at — bank alert wording varies and mine are patterns.
      unrecognised: unparsed.slice(0, 20),
    },
  };
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
  "/api/ledger": {
    handler: ({ method, headers, body }) => {
      if (method === "GET") return handleLedgerGet(headers);
      if (method === "PUT") return handleLedgerPut(headers, body);
      if (method === "POST") return handleLedgerAppend(headers, body);
      return { status: 405, body: { error: "GET, POST or PUT only" } };
    },
  },
  "/api/gmail-auth": { method: "GET", handler: ({ headers, origin }) => handleGmailAuth(headers, origin) },
  "/api/gmail-sync": {
    handler: ({ method, headers, body }) => {
      if (method === "GET") return handleGmailStatus(headers);
      if (method === "DELETE") return handleGmailDisconnect(headers);
      if (method === "POST") return handleGmailSync(headers, body);
      return { status: 405, body: { error: "GET, POST or DELETE only" } };
    },
  },
  "/api/portal-data": { method: "GET", handler: ({ headers }) => handlePortalDataGet(headers) },
  "/api/portal-action": { method: "POST", handler: ({ headers, body }) => handlePortalAction(headers, body) },
  "/api/upload": { method: "POST", handler: ({ headers, body }) => handleUpload(headers, body) },
  "/api/extension": { method: "POST", handler: ({ headers, body }) => handleExtension(headers, body) },
};

// ------------------------------------------------------ finance digest ---

/**
 * The scheduled money check: works out what's wrong and emails it.
 *
 * Runs on a cron rather than on page load, because the whole point is to
 * reach Charles on a day he DOESN'T open the dashboard — a budget breach he
 * only discovers by going to look at budgets is not a notification.
 *
 * Authorised by CRON_SECRET (what Vercel's scheduler sends) or an ordinary
 * owner token, so the same endpoint can be triggered by hand to preview
 * exactly what the next scheduled run would say.
 *
 * `?dry=1` computes and returns without sending. Nothing here writes.
 */
export async function handleFinanceDigest(headers, query = {}) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = bearerFrom(headers);
  const viaCron = !!cronSecret && bearer === cronSecret;
  const viaOwner = !!requireOwner(headers);
  if (!viaCron && !viaOwner) return { status: 401, body: { error: "Not authorised." } };

  const data = await loadData();
  const ledgerRow = await getLedger();
  const alerts = financeAlerts(data, ledgerRow?.entries || []);

  // Info-only weeks are not worth an email. A digest that arrives every day
  // saying everything is fine trains you to delete it unread, and then the
  // one that matters gets deleted too.
  const worthSending = alerts.filter((a) => a.severity === "critical" || a.severity === "warning");
  const dry = query.dry === "1" || query.dry === "true";

  if (!worthSending.length) {
    return { status: 200, body: { ok: true, sent: false, reason: "nothing critical or warning", alerts } };
  }

  const mail = alertsEmail(alerts, { name: (data.profile?.name || "Charles").split(" ")[0] });
  const to = data.profile?.email || process.env.DIGEST_TO;
  if (!to) return { status: 200, body: { ok: true, sent: false, reason: "no email on the profile", alerts } };
  if (dry) return { status: 200, body: { ok: true, sent: false, dry: true, to, subject: mail.subject, alerts } };

  const res = await handleSendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text });
  return {
    status: 200,
    body: { ok: res.status === 200, sent: res.status === 200, to, subject: mail.subject, count: alerts.length, error: res.body?.error },
  };
}
