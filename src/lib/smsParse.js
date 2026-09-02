// Bank SMS, turned into the same alert shape Gmail already produces.
//
// SMS arrives faster than email and covers cards that never send one, so it
// closes the gap between spending money and the dashboard knowing about it.
//
// HOW THE MESSAGES GET HERE.
//
// iOS gives no app access to SMS at all, so there is no polling to build.
// What works on any phone is paste: open the bank's thread, select all, copy,
// drop it in. Android users can additionally export from SMS Backup &
// Restore and upload the XML. Both land in the same parser.
//
// UNPARSED LINES ARE REPORTED, NEVER DROPPED.
//
// The last parser I wrote scored 9/9 on samples I invented and 0/27 on the
// real inbox, because the failures were silent. Everything this can't read
// comes back in `unread` so a wrong pattern is visible immediately instead of
// looking like a quiet month.

const CLEAN = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Amounts: "Rs.60.00", "INR 1,234", "Rs 2,500.50", "₹99"
const AMOUNT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;

// Direction. Order matters — "debited" must be tested before the looser
// credit words, because "Your account is debited... available credit limit"
// contains both.
const DEBIT = /\b(?:debited|spent|sent|paid|withdrawn|purchase of|txn of|deducted|charged)\b/i;
const CREDIT = /\b(?:credited|received|deposited|refund(?:ed)?|cashback)\b/i;

// Account tails: "A/C x3752", "AC X3630", "Card xx9905", "a/c ending 3752"
const TAIL = /(?:a\/?c|acct|account|card)\s*(?:no\.?|number|ending(?:\s+with)?|xx+|x|\*+)?\s*(\d{4})\b/i;

// Dates in the shapes Indian banks actually send.
const DATES = [
  /\b(\d{2})[-/](\d{2})[-/](\d{2,4})\b/,                              // 30/08/26, 30-08-2026
  /\b(\d{4})-(\d{2})-(\d{2})\b/,                                      // 2026-08-30
  /\b(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})\b/,                    // 30-Aug-26
];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseDate(text, fallback) {
  for (const re of DATES) {
    const m = text.match(re);
    if (!m) continue;
    let y, mo, d;
    if (re === DATES[1]) { [, y, mo, d] = m; }
    else if (re === DATES[2]) {
      d = m[1]; mo = MONTHS[m[2].toLowerCase()]; y = m[3];
      if (!mo) continue;
    } else { [, d, mo, y] = m; }
    y = String(y); if (y.length === 2) y = "20" + y;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // A date the calendar rejects means the pattern matched something else —
    // a reference number, usually. Better to fall back than to store 2026-45-99.
    if (!isNaN(new Date(iso))) return iso;
  }
  return fallback || new Date().toISOString().slice(0, 10);
}

// Who got the money. Ordered most specific first; the last few are broad
// enough to catch a merchant name but not so broad they grab reference codes.
const PAYEE = [
  /\bto\s+VPA\s+\S+\s*\(([^)]{2,40})\)/i,
  // "Info: XFLOWPAY" — how HDFC names the counterparty on a credit, where
  // there is no "to X" at all because the money came the other way.
  /\binfo:?\s*([A-Za-z][A-Za-z0-9 &.'\-]{2,38}?)(?:\.|\s+avl|\s+ref|$)/i,
  // `to` STRICTLY BEFORE `from`. A debit SMS says "Sent Rs.85 from Kotak Bank
  // AC X3630 to soft corner@ybl" — both words appear, and the one that names
  // the payee is `to`. Matching `from` first read the sender's own account
  // number back as the merchant.
  //
  // `@` is inside the class because a VPA is often written with the shop's
  // name in front of it: "soft corner@ybl" is one payee, not two.
  /\b(?:to|towards)\s+([A-Za-z][A-Za-z0-9 &.'@_\-]{2,38}?)\s+(?:on|ref|upi|at|dt)\b/i,
  // Only now `from`, which is what names the payer on a credit — without it
  // every incoming payment came back with no payee at all.
  /\bfrom\s+([A-Za-z][A-Za-z0-9 &.'@_\-]{2,38}?)\s+(?:on|ref|upi|dt)\b/i,
  /\bat\s+([A-Za-z][A-Za-z0-9 &.'\-]{2,38}?)\s+(?:on|ref|dt)\b/i,
  /\b(?:to|from)\s+([a-z0-9][a-z0-9._-]*@[a-z][a-z0-9]*)\b/i,
  /\bto\s+([A-Za-z][A-Za-z0-9 &.'\-]{2,38})\.?$/i,
];

// A capture that is really an account reference, not a counterparty.
// "from Kotak Bank AC X3630 to ..." will hand back the bank's own wording if
// nothing rejects it, and a payee of "HDFC Bank A/C x3752" is worse than none.
const NOT_A_PAYEE = /\b(?:a\/?c|acct|account|bank\s+(?:a|ac)\b|card)\b|^\s*x+\d/i;

function parsePayee(text) {
  for (const re of PAYEE) {
    const m = text.match(re);
    if (!m) continue;
    const v = CLEAN(m[1]).replace(/\s+(?:on|ref|upi|to)$/i, "");
    if (v.length < 2) continue;
    if (NOT_A_PAYEE.test(v)) continue;
    return v;
  }
  return null;
}

const BANKS = [
  [/\bkotak\b/i, "kotak"],
  [/\bhdfc\b/i, "hdfc"],
  [/\byes\s*bank\b/i, "yesbank"],
  [/\bicici\b/i, "icici"],
  [/\baxis\b/i, "axis"],
  [/\bsbi\b|\bstate bank\b/i, "sbi"],
  [/\bamazon\s*pay\b/i, "amazonpay"],
];

// Messages that mention money but aren't a transaction. Without this, an OTP
// and a "you can spend up to" promo both arrive as spending.
const NOT_A_TXN = [
  /\bOTP\b|\bone[- ]time password\b/i,
  /\bdo not share\b/i,
  /\bwill be debited\b|\bdue on\b|\bis due\b/i,          // reminders, not events
  /\bavailable balance\b(?!.*(?:debited|credited))/i,
  /\beligible\b|\bpre-?approved\b|\boffer\b|\bapply now\b/i,
  /\brequest(?:ed)? (?:you|for)\b/i,
  /\bfailed\b|\bdeclined\b|\breversed\b.*\bnot\b/i,
];

/** One SMS -> an alert, or null with a reason. */
export function parseSms(raw, { fallbackDate } = {}) {
  const text = CLEAN(raw);
  if (text.length < 20) return { ok: false, reason: "too short", text };

  for (const re of NOT_A_TXN) {
    if (re.test(text)) return { ok: false, reason: "not a transaction (OTP, reminder or offer)", text };
  }

  const am = text.match(AMOUNT);
  if (!am) return { ok: false, reason: "no amount found", text };
  const amount = Number(am[1].replace(/,/g, ""));
  if (!amount) return { ok: false, reason: "amount read as zero", text };

  const isDebit = DEBIT.test(text);
  const isCredit = CREDIT.test(text);
  if (!isDebit && !isCredit) return { ok: false, reason: "can't tell if money went in or out", text };

  const tail = text.match(TAIL);
  const bankHit = BANKS.find(([re]) => re.test(text));

  return {
    ok: true,
    alert: {
      source: "sms",
      // Stable across re-pastes, so the same message can't be logged twice —
      // the same job ref.origin does for the ledger and gmailMessageId does
      // for an expense.
      messageId: "sms:" + fingerprint(text),
      date: parseDate(text, fallbackDate),
      amount,
      // Debit wins a tie: "debited ... your available credit" mentions both,
      // and treating a spend as income is the more damaging way to be wrong.
      dir: isDebit ? "DR" : "CR",
      payee: parsePayee(text),
      accountTail: tail ? tail[1] : null,
      bank: bankHit ? bankHit[1] : null,
      subject: "",
      text: text.slice(0, 300),
    },
  };
}

/** A pasted blob or an exported file -> alerts, plus everything unread. */
export function parseSmsBatch(input, { fallbackDate } = {}) {
  const messages = looksLikeXml(input) ? fromBackupXml(input) : splitPaste(input);
  const alerts = [];
  const unread = [];
  const seen = new Set();
  for (const m of messages) {
    const r = parseSms(m.body, { fallbackDate: m.date || fallbackDate });
    if (!r.ok) { unread.push({ text: r.text, reason: r.reason }); continue; }
    if (seen.has(r.alert.messageId)) continue;      // same message pasted twice
    seen.add(r.alert.messageId);
    alerts.push(r.alert);
  }
  alerts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { alerts, unread, total: messages.length };
}

const looksLikeXml = (s) => /^\s*<\?xml|<smses/i.test(String(s || ""));

/**
 * Android's SMS Backup & Restore format.
 *
 * Attribute order isn't guaranteed, so body and date are pulled independently
 * rather than by position.
 */
function fromBackupXml(xml) {
  const out = [];
  const rows = String(xml).match(/<sms\b[^>]*\/?>/gi) || [];
  for (const row of rows) {
    const body = row.match(/\bbody="([^"]*)"/i)?.[1];
    if (!body) continue;
    const ms = Number(row.match(/\bdate="(\d+)"/i)?.[1]);
    const date = ms ? new Date(ms).toISOString().slice(0, 10) : null;
    out.push({ body: decodeEntities(body), date });
  }
  return out;
}

/**
 * A pasted conversation into individual messages.
 *
 * Blank lines separate them when copied from most phones. Where they don't,
 * a line starting with a currency-carrying bank phrase is treated as the
 * start of a new one, because a run-together paste would otherwise read as a
 * single unparseable wall.
 */
function splitPaste(text) {
  const blocks = String(text || "")
    .split(/\n\s*\n+/)
    .flatMap((b) => (b.split("\n").length > 1 && !AMOUNT.test(b.split("\n")[0]) ? [b] : b.split(/\n(?=(?:Sent|Spent|Received|Update!|Dear|Rs\.?|INR|An amount|Thank you|Your\b))/i)))
    .map(CLEAN)
    .filter((b) => b.length > 10);
  return blocks.map((body) => ({ body, date: null }));
}

const decodeEntities = (s) => String(s)
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#10;/g, " ");

/** Short stable hash of the message text, for the duplicate guard. */
function fingerprint(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
