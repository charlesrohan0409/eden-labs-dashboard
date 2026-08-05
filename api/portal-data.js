import { handlePortalDataGet } from "./_dataHandlers.js";

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "GET only" }); return; }
  const { status, body: out } = await handlePortalDataGet(req.headers);
  res.status(status).json(out);
}
