// Client-side helper for the one email route. Same pattern as buffer.js: the
// browser only ever calls our own same-origin /api/send-email — the Resend
// key lives server-side in api/_handlers.js and nowhere else.
export async function sendEmail({ to, subject, html, text, replyTo, attachments }) {
  const res = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, text, replyTo, attachments }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `Send failed (${res.status})`);
  return json;
}
