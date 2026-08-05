// Client-side Fathom helper. Same shape as buffer.js — the browser only ever
// calls our own same-origin /api/fathom; the key lives server-side in
// api/_handlers.js and never reaches the client.

async function fathomRequest(params) {
  const res = await fetch("/api/fathom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Fathom request failed (${res.status})`);
  return json;
}

/**
 * Every recorded meeting, most recent first, with summary + transcript
 * included. Paginates through Fathom's cursor until it runs out or we hit a
 * sane cap — this account isn't going to have thousands of recordings.
 */
export async function listFathomMeetings({ createdAfter } = {}) {
  const items = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const data = await fathomRequest({ cursor, createdAfter });
    items.push(...(data.items || []));
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return items;
}

/**
 * Meetings that plausibly involve a given client — matched on their email
 * domain and, failing that, their name against the calendar invitee list.
 * Real matching (invitee email/name) rather than string-searching the whole
 * JSON blob, which is what the original stub did.
 */
// Used by the Integrations page's "Test connection" — one small request just
// to confirm FATHOM_API_KEY actually works.
export async function testFathomConnection() {
  const data = await fathomRequest({});
  return { count: (data.items || []).length };
}

export function matchMeetingsToClient(meetings, client) {
  const domain = (client.email || "").split("@")[1]?.toLowerCase();
  const name = (client.name || "").toLowerCase();
  const company = (client.company || "").toLowerCase();

  return meetings.filter((m) => {
    const invitees = m.calendar_invitees || [];
    return invitees.some((inv) => {
      const invName = (inv.name || "").toLowerCase();
      const invDomain = (inv.email_domain || inv.email?.split("@")[1] || "").toLowerCase();
      return (domain && invDomain === domain) || (name && invName.includes(name)) || (company && invName.includes(company));
    });
  });
}
