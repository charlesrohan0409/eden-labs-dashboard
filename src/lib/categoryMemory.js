// Remembering what Charles chose, so he doesn't choose it forty times.
//
// He asked for every transaction to wait for him, and that stands — nothing
// here files anything. But "Zepto is Groceries" is a decision he has already
// made, and asking again next week is not carefulness, it's friction.
//
// The distinction that matters: a SUGGESTION is the machine guessing from
// keywords, and he asked for those to stop acting on their own. A MEMORY is
// his own past decision played back. It is still offered as a chip he has to
// press — but it carries his authority rather than mine, and it gets more
// accurate every time he uses it instead of less.

export const MEMORY_KEY = "categoryMemory";

/**
 * The key a payee is remembered under.
 *
 * Bank narrations for the same shop are never byte-identical — "UPI-AYYAPPAN
 * IDLI-PAYTMQR6WFRR7@PTYS-YESB0PTMUPI-660827853949-UPI" one week and
 * "AYYAPPAN IDLI" the next. So the reference numbers, VPA handles and bank
 * codes are stripped and what's left is lowercased: both reduce to
 * "ayyappan idli".
 */
// Words that appear in bank narrations but say nothing about who was paid.
const NOISE = new Set([
  "upi", "imps", "neft", "pos", "ach", "nach", "me", "dc", "si", "ref",
  "ybl", "ptys", "paytm", "okhdfcbank", "okicici", "oksbi", "okaxis", "okbizaxis",
  "pvt", "private", "limited", "ltd", "llc", "inc", "co", "company", "india",
  "bank", "com", "in", "the", "and", "payment", "pay", "txn",
]);

export function payeeKey(payee) {
  const tokens = String(payee || "")
    .toLowerCase()
    // VPA handles. The local part deliberately EXCLUDES the hyphen: bank
    // narrations join fields with hyphens, so "-" in the class made
    // "marketplace-zepto@ybl" one match and swallowed the merchant's own
    // second word along with the handle.
    .replace(/\b[a-z0-9._]+@[a-z][a-z0-9]*\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    // Anything carrying a digit is a reference number, an IFSC or a masked
    // card tail — never a name. This is what separates "zepto marketplace"
    // from "zepto marketplace zepto yesb0yblupi 660886313816".
    .filter((t) => t && !/\d/.test(t) && !NOISE.has(t) && t.length > 1);

  // The first two surviving words. Bank narrations pad the same shop out
  // differently every time — "UPI-ZEPTO MARKETPLACE-ZEPTO@YBL-YESB0YBLUPI-
  // 660886313816-UPI" one week, "ZEPTO MARKETPLACE PRIVATE LIMITED" the next
  // — and it is the opening of the name that stays put. Two words rather than
  // one so SWIGGY INSTAMART and SWIGGY LIMITED stay separate.
  return tokens.slice(0, 2).join(" ");
}

/** What he chose last time for this payee, or null. */
export function recallCategory(data, payee, categories = []) {
  const key = payeeKey(payee);
  if (!key || key.length < 3) return null;
  const hit = data?.settings?.[MEMORY_KEY]?.[key];
  if (!hit) return null;
  // A category he has since deleted must not come back from the dead.
  if (categories.length && !categories.some((c) => c.toLowerCase() === String(hit.category || hit).toLowerCase())) return null;
  return typeof hit === "string" ? { category: hit, count: 1 } : hit;
}

/**
 * Record a choice. Mutates `data` in place, like every other mutation here.
 *
 * `count` is kept so the UI can say "you've filed this here 6 times" — the
 * difference between a habit and a one-off, which is exactly what tells you
 * whether to trust it at a glance.
 */
export function rememberCategory(data, payee, category) {
  const key = payeeKey(payee);
  if (!key || key.length < 3 || !category) return data;
  if (!data.settings) data.settings = {};
  const mem = { ...(data.settings[MEMORY_KEY] || {}) };
  const prev = mem[key];
  const prevCat = typeof prev === "string" ? prev : prev?.category;
  mem[key] = {
    category,
    // Changing his mind resets the count rather than inheriting confidence
    // from the category he just rejected.
    count: prevCat === category ? (prev?.count || 1) + 1 : 1,
    at: new Date().toISOString().slice(0, 10),
  };
  data.settings[MEMORY_KEY] = mem;
  return data;
}

/** Everything remembered, most-used first — for a settings view or a purge. */
export function allMemories(data) {
  return Object.entries(data?.settings?.[MEMORY_KEY] || {})
    .map(([key, v]) => ({ key, ...(typeof v === "string" ? { category: v, count: 1 } : v) }))
    .sort((a, b) => (b.count || 0) - (a.count || 0));
}

export function forgetCategory(data, key) {
  if (!data?.settings?.[MEMORY_KEY]) return data;
  const mem = { ...data.settings[MEMORY_KEY] };
  delete mem[key];
  data.settings[MEMORY_KEY] = mem;
  return data;
}
