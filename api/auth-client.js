import { handleAuthClient } from "./_dataHandlers.js";

export default async function handler(req, res) {
  // CORS for Chrome extension (chrome-extension:// origin) — the extension's
  // role-aware login falls back to this endpoint whenever the PIN entered
  // isn't the owner's.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { status, body: out } = await handleAuthClient(body);
  res.status(status).json(out);
}
