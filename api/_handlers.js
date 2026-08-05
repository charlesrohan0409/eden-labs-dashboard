// The actual logic behind every /api/* route.
//
// Each handler takes a parsed request body and returns { status, body }. The
// files next to this one are thin Vercel wrappers, and vite.config.js mounts
// the same functions for `npm run dev` — so there is exactly one copy of each
// endpoint, and secrets are read here (server-side) and nowhere else.

import { parseICS } from "./_ical.js";

const BUFFER_ENDPOINT = "https://api.buffer.com";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

const missingKey = (name, what) => ({
  status: 501,
  body: { error: `${name} is not set on the server. Add it to .env.local (dev) or the Vercel project's environment variables (prod)${what ? ` to ${what}` : ""}, then restart.` },
});

// ---------------------------------------------------------------- Buffer ---
export async function handleBuffer(body) {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) return missingKey("BUFFER_API_KEY", "use Buffer");

  const { query, variables } = body || {};
  if (!query) return { status: 400, body: { error: "Missing GraphQL `query` in request body." } };

  try {
    const upstream = await fetch(BUFFER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, variables }),
    });
    return { status: upstream.status, body: await upstream.json() };
  } catch (e) {
    return { status: 502, body: { error: `Could not reach Buffer: ${e.message}` } };
  }
}

// -------------------------------------------------------------- Calendar ---
export async function handleCalendar(body) {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!url) return missingKey("GOOGLE_CALENDAR_ICAL_URL", "show your calendar");

  // The secret iCal URL is a bearer credential in disguise — anyone holding it
  // can read the calendar — so it is only ever used here, never sent to the client.
  const daysBack = Number(body?.daysBack) || 7;
  const daysAhead = Number(body?.daysAhead) || 60;
  const windowStart = new Date(Date.now() - daysBack * 86400000);
  const windowEnd = new Date(Date.now() + daysAhead * 86400000);

  try {
    const res = await fetch(url.replace(/^webcal:/i, "https:"), {
      headers: { "User-Agent": "EdenLabsDashboard/1.0" },
    });
    if (!res.ok) {
      return {
        status: 502,
        body: { error: `Calendar feed returned ${res.status}. Check the secret iCal address is still valid.` },
      };
    }
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      return { status: 502, body: { error: "That URL didn't return an iCalendar feed. Use the 'Secret address in iCal format' from Google Calendar settings." } };
    }
    return { status: 200, body: { events: parseICS(text, { windowStart, windowEnd }), fetchedAt: new Date().toISOString() } };
  } catch (e) {
    return { status: 502, body: { error: `Could not reach the calendar feed: ${e.message}` } };
  }
}

// ------------------------------------------------------------ Send email ---
export async function handleSendEmail(body) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return missingKey("RESEND_API_KEY", "send email");

  const { to, subject, html, text, replyTo, attachments } = body || {};
  if (!to || !subject || (!html && !text)) {
    return { status: 400, body: { error: "`to`, `subject`, and one of `html`/`text` are required." } };
  }

  // Resend only accepts a verified domain; their shared onboarding sender lets
  // this work before the user has set one up.
  const from = process.env.RESEND_FROM || "Eden Labs <onboarding@resend.dev>";

  try {
    const upstream = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
    });
    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return { status: upstream.status, body: { error: json?.message || json?.error?.message || `Resend rejected the send (${upstream.status}).` } };
    }
    return { status: 200, body: { success: true, id: json.id, from } };
  } catch (e) {
    return { status: 502, body: { error: `Could not reach Resend: ${e.message}` } };
  }
}

// ------------------------------------------------------------- Fathom -----
const FATHOM_ENDPOINT = "https://api.fathom.ai/external/v1/meetings";

export async function handleFathom(body) {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) return missingKey("FATHOM_API_KEY", "pull meeting transcripts");

  // Client sends plain filter params (createdAfter, domains, etc); we always
  // ask Fathom for the summary + transcript inline rather than a second
  // round trip per meeting.
  const params = body?.params || {};
  const qs = new URLSearchParams();
  qs.set("include_summary", "true");
  qs.set("include_transcript", "true");
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.createdAfter) qs.set("created_after", params.createdAfter);
  if (params.createdBefore) qs.set("created_before", params.createdBefore);
  (params.calendarInviteesDomains || []).forEach((d) => qs.append("calendar_invitees_domains[]", d));

  try {
    const upstream = await fetch(`${FATHOM_ENDPOINT}?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const hint = upstream.status === 401 ? " — check FATHOM_API_KEY is a current, unexpired key from developers.fathom.ai" : "";
      return { status: upstream.status, body: { error: (json?.message || json?.error || `Fathom rejected the request (${upstream.status}).`) + hint } };
    }
    return { status: 200, body: json };
  } catch (e) {
    return { status: 502, body: { error: `Could not reach Fathom: ${e.message}` } };
  }
}

export const ROUTES = {
  "/api/buffer": handleBuffer,
  "/api/calendar": handleCalendar,
  "/api/send-email": handleSendEmail,
  "/api/fathom": handleFathom,
};
