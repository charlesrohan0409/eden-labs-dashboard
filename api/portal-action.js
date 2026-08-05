import { handlePortalAction } from "./_dataHandlers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { status, body: out } = await handlePortalAction(req.headers, body);
  res.status(status).json(out);
}
