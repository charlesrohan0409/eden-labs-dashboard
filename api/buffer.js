import { handleBuffer } from "./_handlers.js";

// Thin Vercel wrapper — the logic lives in _handlers.js so the dev server can
// mount the identical function (see vite.config.js).
export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { status, body: out } = await handleBuffer(body);
  res.status(status).json(out);
}
