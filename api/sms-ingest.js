import { handleSmsIngest, handleSmsQueueGet, handleSmsQueueClear } from "./_dataHandlers.js";

// POST — the phone pushing one message in, authenticated by SMS_INGEST_TOKEN.
// GET / DELETE — the dashboard reading and clearing the queue, owner-only.
export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const query = Object.fromEntries(url.searchParams);
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = { text: body }; } }

  if (req.method === "POST") {
    const { status, body: out } = await handleSmsIngest(req.headers, body || {}, query);
    res.status(status).json(out);
    return;
  }
  if (req.method === "GET") {
    const { status, body: out } = await handleSmsQueueGet(req.headers);
    res.status(status).json(out);
    return;
  }
  if (req.method === "DELETE") {
    const { status, body: out } = await handleSmsQueueClear(req.headers, body || {});
    res.status(status).json(out);
    return;
  }
  res.status(405).json({ error: "POST, GET or DELETE only" });
}
