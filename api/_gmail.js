// Reading bank alerts out of Gmail.
//
// WHY EMAIL AND NOT SCREEN-SCRAPING A BANK
//
// Statements arrive monthly and are the truth, but they are a month late.
// Bank alert emails arrive within seconds of the transaction and carry the
// same three facts a ledger entry needs: how much, which way, and who. So
// this is a freshness layer, not a replacement — the statement still wins on
// any disagreement, because the statement is what reconciles.
//
// SCOPE IS READ-ONLY, DELIBERATELY
//
// `gmail.readonly` cannot send, delete, or modify anything. Even if this
// code had a bug, or the token leaked, the worst it can do is read. There is
// no version of "pull my transactions" that needs write access to a mailbox,
// so it never asks for it.
//
// NOTHING IS WRITTEN TO THE LEDGER AUTOMATICALLY
//
// Alerts are noisy: banks send duplicates, reversals arrive as fresh alerts,
// and OTP mails mention amounts they have nothing to do with. Every parsed
// alert lands in a pending list that Charles approves. The ledger's whole
// value is that every row in it was verified, and a pipeline that writes
// unattended would spend that on convenience.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const clientId = () => process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || "";

/** Where Google sends the browser back. Must match the console exactly. */
export const redirectUri = (origin) => `${String(origin).replace(/\/$/, "")}/api/gmail-callback`;

/**
 * The consent URL.
 *
 * `prompt=consent` with `access_type=offline` is what actually returns a
 * refresh token. Without both, Google hands back an access token that dies
 * in an hour and a "connect" that silently stops working the same afternoon.
 */
export function consentUrl({ origin, state }) {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Google token request failed (${res.status})`);
  return json;
}

export const exchangeCode = ({ code, origin }) =>
  tokenRequest({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(origin), grant_type: "authorization_code" });

export const refreshAccessToken = (refresh_token) =>
  tokenRequest({ refresh_token, client_id: clientId(), client_secret: clientSecret(), grant_type: "refresh_token" });

// ---- reading mail ---------------------------------------------------------

// Senders worth reading. Kept as a list rather than a broad "anything
// mentioning Rs." search: a wide net pulls in shopping receipts and OTP
// mails, and every false positive is something Charles has to reject by hand.
export const BANK_SENDERS = [
  "alerts@hdfcbank.net", "alerts@hdfcbank.com", "emailstatements.hdfcbank@hdfcbank.net",
  "creditcards@hdfcbank.net", "noreply@kotak.com", "alerts@kotak.com",
  "creditcardalerts@kotak.com", "no-reply@kotak.com",
];

export const searchQuery = ({ days = 30, senders = BANK_SENDERS } = {}) =>
  `newer_than:${days}d {${senders.map((s) => `from:${s}`).join(" ")}}`;

async function gapi(path, accessToken) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Gmail request failed (${res.status})`);
  return json;
}

export async function listMessages(accessToken, { days, max = 100 } = {}) {
  const q = encodeURIComponent(searchQuery({ days }));
  const out = [];
  let pageToken = "";
  while (out.length < max) {
    const page = await gapi(`/messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`, accessToken);
    out.push(...(page.messages || []));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return out.slice(0, max);
}

/** Gmail returns base64url with no padding; atob wants neither. */
const b64 = (s) => {
  try { return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }
  catch { return ""; }
};

function flattenBody(part, acc = []) {
  if (!part) return acc;
  if (part.body?.data) acc.push({ mime: part.mimeType, text: b64(part.body.data) });
  for (const p of part.parts || []) flattenBody(p, acc);
  return acc;
}

export async function getMessage(accessToken, id) {
  const m = await gapi(`/messages/${id}?format=full`, accessToken);
  const headers = Object.fromEntries((m.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
  const parts = flattenBody(m.payload);
  const plain = parts.find((p) => p.mime === "text/plain")?.text;
  const html = parts.find((p) => p.mime === "text/html")?.text;
  const text = (plain || stripHtml(html) || m.snippet || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return {
    id: m.id,
    date: new Date(Number(m.internalDate)).toISOString().slice(0, 10),
    from: headers.from || "",
    subject: headers.subject || "",
    text,
  };
}

const stripHtml = (h) =>
  h ? h.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ") : "";

// ---- turning an alert into a transaction ---------------------------------

// Amounts appear as "Rs.1,234.50", "Rs 1234", "INR 1,234.50" and "₹1,234".
const AMOUNT = String.raw`(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d{1,2})?)`;

// Ordered most specific first: a "debited ... credited" reversal mail matches
// several of these, and the first pattern that fits should be the one that
// describes the actual movement rather than the one mentioned in passing.
const PATTERNS = [
  { dir: "DR", re: new RegExp(String.raw`(?:sent|paid|debited(?:\s+by)?|spent|withdrawn)\s*(?:of\s*)?${AMOUNT}`, "i") },
  { dir: "DR", re: new RegExp(`${AMOUNT}\\s*(?:has been|is|was)?\\s*debited`, "i") },
  // Verb after the amount: "Rs 320.00 spent on your HDFC Bank Debit Card".
  { dir: "DR", re: new RegExp(`${AMOUNT}\\s+(?:spent|paid|withdrawn|sent|used)`, "i") },
  { dir: "CR", re: new RegExp(String.raw`(?:received|credited(?:\s+by)?|deposited)\s*(?:of\s*)?${AMOUNT}`, "i") },
  { dir: "CR", re: new RegExp(`${AMOUNT}\\s*(?:has been|is|was)?\\s*credited`, "i") },
  // Card alerts announce a purchase without ever using the word "debited":
  // "Thank you for using your HDFC Bank Credit Card ending 5902 for Rs 2,454
  // at STARBUCKS". Using the card IS the debit.
  { dir: "DR", re: new RegExp(String.raw`card\s+(?:ending\s+)?[xX*\d]*\s*for\s+${AMOUNT}`, "i") },
  { dir: "DR", re: new RegExp(`${AMOUNT}\\s+(?:at|on)\\s+[A-Z]`, "") },
];

// The counterparty, wherever the bank chose to put it this time.
const PAYEE = [
  /\b(?:to|towards)\s+VPA\s+([^\s]+?)(?:\s+on|\s+ref|\.|,|$)/i,
  // A bare VPA with no "VPA" label — Kotak writes "To snitch@icici".
  /\b(?:to|from)\s+([a-z0-9][a-z0-9._-]*@[a-z][a-z0-9]*)\b/i,
  /\b(?:at|to)\s+([A-Z0-9][A-Za-z0-9 &.'*_-]{2,40}?)\s+on\s+\d/i,
  /\bfrom\s+([A-Za-z0-9][A-Za-z0-9 &.'*_-]{2,40}?)\s+on\s+\d/i,
  /\binfo[:\s]+([A-Za-z0-9][A-Za-z0-9 &.'*_-]{2,40})/i,
];

const ACCOUNT_TAIL = /(?:a\/?c|account|card)\s*(?:no\.?|ending|xx+|\*+)?\s*[xX*]*(\d{4})\b/i;

/**
 * One alert email → one candidate transaction, or null.
 *
 * Returns null rather than guessing when the amount or direction can't be
 * read. A pending list of things that might be transactions is worse than a
 * shorter list of things that are, because every wrong row costs attention
 * to dismiss and trains you to approve without reading.
 */
export function parseAlert(msg) {
  const t = msg.text || "";
  // OTPs and balance summaries quote amounts but move no money.
  if (/\bOTP\b|one[- ]time password|do not share|available balance is|statement is ready/i.test(t) &&
      !/debited|credited|spent|sent|received/i.test(t)) return null;

  let hit = null;
  for (const p of PATTERNS) { const m = t.match(p.re); if (m) { hit = { dir: p.dir, amount: Number(m[1].replace(/,/g, "")) }; break; } }
  if (!hit || !hit.amount) return null;

  let payee = null;
  for (const re of PAYEE) { const m = t.match(re); if (m) { payee = m[1].trim().replace(/\s+/g, " "); break; } }
  const acct = t.match(ACCOUNT_TAIL)?.[1] || null;

  return {
    source: "gmail",
    messageId: msg.id,
    date: msg.date,
    amount: hit.amount,
    dir: hit.dir,
    payee: payee || null,
    accountTail: acct,
    subject: msg.subject,
    text: t.slice(0, 300),
  };
}

/** Which ledger account a 4-digit tail belongs to. */
export const ACCOUNT_FOR_TAIL = { 3752: "asset:bank:hdfc", 3630: "asset:bank:kotak", 5902: "liability:card:hdfc", 9905: "asset:bank:hdfc" };

/**
 * Drops alerts the ledger already knows about.
 *
 * Matched on same day (±3) and same amount against the same account, because
 * an alert and a statement row describe the same event in different words —
 * the narration will never match, but the money always does. The window is
 * ±3 days because a card alert fires on purchase and the statement posts it
 * later.
 */
export function findNew(candidates, ledger) {
  const seen = new Set();
  for (const tx of ledger || []) {
    for (const l of tx.legs) {
      if (!l.account.startsWith("asset:bank") && !l.account.startsWith("liability:card")) continue;
      seen.add(`${l.account}|${Math.abs(l.base)}|${tx.date}`);
    }
  }
  const near = (acct, minor, date) => {
    for (let d = -3; d <= 3; d++) {
      const dt = new Date(date); dt.setDate(dt.getDate() + d);
      if (seen.has(`${acct}|${minor}|${dt.toISOString().slice(0, 10)}`)) return true;
    }
    return false;
  };
  return candidates.filter((c) => {
    const acct = ACCOUNT_FOR_TAIL[c.accountTail];
    if (!acct) return true;                       // unknown account — show it, let him decide
    return !near(acct, Math.round(c.amount * 100), c.date);
  });
}
