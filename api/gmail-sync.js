import { handleGmailSync, handleGmailStatus, handleGmailDisconnect } from "./_dataHandlers.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { status, body } = await handleGmailStatus(req.headers);
    res.status(status).json(body); return;
  }
  if (req.method === "DELETE") {
    const { status, body } = await handleGmailDisconnect(req.headers);
    res.status(status).json(body); return;
  }
  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const { status, body: out } = await handleGmailSync(req.headers, body);
    res.status(status).json(out); return;
  }
  res.status(405).json({ error: "GET, POST or DELETE only" });
}
