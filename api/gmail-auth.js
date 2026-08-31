import { handleGmailAuth } from "./_dataHandlers.js";

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const origin = `${proto}://${req.headers.host}`;
  const { status, body } = await handleGmailAuth(req.headers, origin);
  res.status(status).json(body);
}
