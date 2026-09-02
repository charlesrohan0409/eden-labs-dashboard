import { handleFinanceDigest } from "./_dataHandlers.js";

// Scheduled by vercel.json. Also callable by hand with an owner token — add
// ?dry=1 to see exactly what the next run would send without sending it.
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "GET or POST only" });
    return;
  }
  const url = new URL(req.url, "http://x");
  const query = Object.fromEntries(url.searchParams);
  const { status, body } = await handleFinanceDigest(req.headers, query);
  res.status(status).json(body);
}
