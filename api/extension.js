// POST /api/extension
// Single action envelope for everything the Chrome extension writes —
// see handleExtension in _dataHandlers.js for the action allowlist and the
// owner/client security hinge.
//
// CORS is open (*) for the same reason crm-lead.js's is: requests originate
// from a chrome-extension:// origin, which has no guessable value to allow-
// list. The endpoint is still protected by the Bearer session token.

import { handleExtension } from "./_dataHandlers.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

  const { status, body: out } = await handleExtension(req.headers, body);
  res.status(status).json(out);
}
