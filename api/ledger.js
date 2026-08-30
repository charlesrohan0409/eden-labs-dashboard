import { handleLedgerGet, handleLedgerPut } from "./_dataHandlers.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { status, body: out } = await handleLedgerGet(req.headers);
    res.status(status).json(out);
    return;
  }
  if (req.method === "PUT") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const { status, body: out } = await handleLedgerPut(req.headers, body);
    res.status(status).json(out);
    return;
  }
  res.status(405).json({ error: "GET or PUT only" });
}
