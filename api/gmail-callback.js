import { handleGmailCallback } from "./_dataHandlers.js";

// Google redirects the BROWSER here, so this responds with a page rather than
// JSON — there is no fetch on the other end to read a status code.
export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const origin = `${proto}://${req.headers.host}`;
  const url = new URL(req.url, origin);
  const { html } = await handleGmailCallback({
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
    origin,
  });
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
