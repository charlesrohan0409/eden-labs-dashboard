// POST /api/crm-lead
// Called by the Chrome extension to add a contact to the CRM.
// Requires a valid owner Bearer token (same auth as /api/data).
//
// CORS is open (*) because the request originates from chrome-extension://
// which has no guessable origin. The endpoint is still protected by the owner
// token — without a valid PIN-derived token, nothing happens.

import { handleCRMLead } from "./_dataHandlers.js";

export default async function handler(req, res) {
  // CORS — needed for requests from chrome-extension:// origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const { status, body: out } = await handleCRMLead(req.headers, body);
  res.status(status).json(out);
}
