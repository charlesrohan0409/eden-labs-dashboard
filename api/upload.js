// POST /api/upload
// Accepts { dataUrl, filename }, uploads the decoded bytes to Supabase
// Storage, returns { url }. Called by src/lib/media.js in place of what
// used to just be a base64 data: URL embedded directly in the app_data
// blob — see api/_dataHandlers.js's handleUpload for why that mattered.
//
// Same-origin only (both the owner dashboard and the client portal share
// this origin) — no CORS headers needed, unlike crm-lead.js which is
// called from a chrome-extension:// origin.

import { handleUpload } from "./_dataHandlers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { status, body: out } = await handleUpload(req.headers, body);
  res.status(status).json(out);
}
