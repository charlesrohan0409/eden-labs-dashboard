// Deciding where a bank alert actually belongs.
//
// A bank alert says three things: how much left, which account, and roughly
// who got it. Every one of them was previously filed the same way — a new row
// in Expenses. That is right for a shop and wrong for everything else Charles
// has set up, in two ways that cost real money:
//
//   1. A CREDIT-CARD BILL PAYMENT IS NOT AN EXPENSE. The purchases that built
//      the balance were expensed when they happened. Booking the statement
//      payment as a second expense counts the same spending twice — inflating
//      totals, the P&L, and every category budget. mutations.payOutgoing
//      already handles this correctly; nothing was ever routed to it.
//
//   2. A SUBSCRIPTION RENEWAL IS ALREADY ON THE BOOKS as a recurring item
//      with a due date. Filing its debit as a loose expense leaves the
//      subscription looking unpaid forever, so the dashboard keeps saying
//      Claude is due while the money has already gone.
//
// This module makes that decision and nothing else. It does not mutate: it
// returns a routing verdict, and the caller applies it. A matcher that also
// wrote would be a matcher nobody could test against a real inbox — which is
// how the last parser scored 9/9 on invented samples and 0/27 on the real one.

import { matchAccount } from "./alertToExpense.js";

// ---------------------------------------------------------------- aliases ---
//
// What a subscription calls itself and what the bank prints are rarely the
// same string. "Claude" arrives as ANTHROPIC; Google Workspace as GOOGLE
// *GSUITE; the electricity board as BEST or BESTUNDERTAKING. Keyed by the
// lowercased outgoing name, and merged with the name and website host, so a
// new subscription still matches on its own name without an entry here.
const ALIASES = {
  "claude": ["anthropic", "claude.ai", "claude"],
  "adobe lightroom": ["adobe", "lightroom"],
  "google workspace": ["google", "gsuite", "workspace"],
  "google one": ["google", "google one"],
  "apple music": ["apple", "itunes", "applemusic", "appleservices"],
  "apple icloud": ["apple", "icloud", "appleservices"],
  "canva": ["canva"],
  "linkedin sales navigator": ["linkedin", "sales navigator", "salesnav"],
  "electricity": ["best ", "bestundertaking", "b.e.s.t", "electricity", "adani electricity", "tata power"],
  "amazon pay": ["amazonpay", "amazon pay later"],
  "yes bank credit card bill": ["ybl card"],
  "hdfc credit card bill": ["billpay", "hdfc9d"],
};

// THE BANK'S OWN NAME IS NOT EVIDENCE OF ANYTHING.
//
// Every alert HDFC sends contains the words "HDFC Bank" — it is the sender,
// not the payee. With "hdfc" as a search term on the HDFC card bill, a ₹248
// Swiggy order matched the card bill on the strength of the bank naming
// itself, scored 5 on name + account, and was offered as "pays down HDFC
// Credit — no expense booked". Every HDFC alert did. Booking spending as a
// card transfer loses the expense entirely and credits the card for money
// that never went near it.
//
// This did not show up in testing because those tests ran on statement
// narrations, which say "UPI-AYYAPPAN IDLI-PAYTMQR..." and never name the
// bank. Real emails do, on every single line.
//
// So issuer names are stripped from the search terms. What identifies a card
// bill is the PAYMENT wording — BILLPAY, BPPY, CRED — plus the account, and
// those are matched separately.
const ISSUER_WORDS = new Set([
  "hdfc", "hdfcbank", "hdfc bank",
  "kotak", "kotakbank", "kotak bank", "kotak811",
  "yes bank", "yesbank", "ybl",
  "icici", "axis", "axisbank", "sbi", "amazon",
  "bank", "credit", "card", "creditcard", "credit card", "bill",
]);

// How a payment TO a card looks in Charles's own statements and alerts. These
// are taken from lines that actually appear in his HDFC and Kotak history —
// not invented — because a missed pattern here silently double-counts.
const CARD_PAYMENT_MARKERS = [
  /\bIB\s*BILLPAY\b/i,
  /\bBPPY\b/i,
  /\bCC\s*PAYMENT\b/i,
  /\bCREDIT\s*CARD\s*PAYMENT\b/i,
  /\bCRED(?:\s|\.|-)?CLUB\b/i,
  /\bCRED\.CLUB@/i,
  /\bTELE\s*TRANSFER\s*CREDIT\b/i,
  /\bCARD\s*BILL\b/i,
  /\bPAYMENT\s*(?:TO|TOWARDS)\s*(?:YOUR\s*)?CARD\b/i,
  /\bAUTOPAY.*CARD\b/i,
];

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Everything the alert gives us to match against, as one lowercased string. */
function haystack(alert) {
  return norm(`${alert.payee || ""} ${alert.subject || ""} ${alert.text || ""}`);
}

/** The bare host of a website field: "https://www.icloud.com/" -> "icloud". */
function hostRoot(website) {
  const h = norm(website).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const parts = h.split(".").filter(Boolean);
  if (!parts.length) return "";
  // drop the tld, and a country second-level like .co.in / .bank.in
  return parts[0];
}

/** Search terms for one outgoing: its aliases, its name, its website host. */
function termsFor(o) {
  const set = new Set(ALIASES[norm(o.name)] || []);
  const n = norm(o.name);
  if (n.length >= 4) set.add(n);
  const host = hostRoot(o.website);
  if (host.length >= 4) set.add(host);
  // An issuer name matches every alert that bank sends, so it can only
  // produce false positives — see ISSUER_WORDS. The full outgoing name is
  // kept even when it contains one ("hdfc credit card bill" is specific);
  // it's the bare words that have to go.
  return [...set].filter((t) => t && !ISSUER_WORDS.has(t));
}

const daysBetween = (a, b) => {
  const x = new Date(a), y = new Date(b);
  if (isNaN(x) || isNaN(y)) return 999;
  return Math.abs((x - y) / 86400000);
};

/**
 * Does this alert look like a payment towards a credit card?
 *
 * Deliberately generous on the text patterns and strict on what it does with
 * a hit: a suspected card payment that can't be tied to a specific card
 * outgoing is returned as `needsReview`, never auto-applied. Getting this
 * wrong in the permissive direction loses one expense; getting it wrong in
 * the other direction double-counts every card bill forever.
 */
export function looksLikeCardPayment(alert) {
  const hay = haystack(alert);
  return CARD_PAYMENT_MARKERS.some((re) => re.test(hay));
}

/**
 * Find the recurring item this alert is paying, if any.
 *
 * Scored rather than first-match: several subscriptions are billed by Google
 * or Apple, and the one that also matches the amount and the due date is
 * almost certainly the right one. Returns null when nothing scores enough to
 * be worth showing.
 */
export function matchOutgoing(alert, outgoings = [], accounts = []) {
  const hay = haystack(alert);
  const native = Number(alert.amount) || 0;
  const cardish = looksLikeCardPayment(alert);
  const active = outgoings.filter((o) => !o.status || o.status === "active");

  // How many different subscriptions answer to each search term.
  //
  // "adobe" belongs to one thing; "google" belongs to Workspace AND Google
  // One, and "appleservices" to Apple Music AND iCloud — which are both ₹219,
  // so amount cannot break the tie either. Tested against the real statements
  // this mattered: a ₹199 GOOGLE PLAY app purchase was being matched to the
  // ₹219 Workspace subscription on the strength of the word "google" alone.
  // A term shared by several items is weak evidence, and is scored as such.
  const shared = new Map();
  for (const o of active) for (const t of termsFor(o)) shared.set(t, (shared.get(t) || 0) + 1);

  // Card bills that actually pay a card down. If there is exactly one, then
  // "IB BILLPAY" or a CRED payment can only mean that one; if there are
  // several, the wording alone genuinely cannot say which card was paid.
  const cardPayers = active.filter((o) => o.paysDownAccountId);

  let best = null, second = null;
  for (const o of active) {
    const isCard = !!o.paysDownAccountId || o.kind === "card";
    const terms = termsFor(o);
    const hits = terms.filter((t) => hay.includes(t));
    const nameHit = hits.length > 0;
    // The most specific term that matched: unique to this item, or shared.
    const unique = hits.some((t) => (shared.get(t) || 0) === 1);

    // A card-bill outgoing can match on the card-payment markers alone —
    // "IB BILLPAY DR-HDFC9D" names no subscription, but it is unambiguously
    // the HDFC card bill when that is the only card outgoing.
    if (!nameHit && !(isCard && cardish)) continue;

    let score = 0;
    const why = [];
    if (nameHit) { score += unique ? 3 : 1; why.push(unique ? "name" : "name (shared)"); }
    if (isCard && cardish) {
      // Unique card payer: the wording is conclusive on its own. Several:
      // deliberately left short of the auto threshold so the caller asks.
      score += cardPayers.length === 1 && o.paysDownAccountId ? 6 : 3;
      why.push(cardPayers.length === 1 ? "card-payment wording" : "card-payment wording (which card?)");
    }

    // Amount. Fixed subscriptions are exact; a card bill is different every
    // month, so amount is not evidence either way for those.
    const amt = Number(o.amount) || 0;
    if (!isCard && amt && native) {
      const drift = Math.abs(native - amt) / amt;
      if (drift < 0.02) { score += 3; why.push("amount"); }
      else if (drift < 0.15) { score += 1; why.push("amount ~"); }
      else score -= 2;                       // wrong size for this subscription
    }

    // Due date.
    if (o.nextRenewal && alert.date) {
      const d = daysBetween(o.nextRenewal, alert.date);
      if (d <= 3) { score += 2; why.push("due date"); }
      else if (d <= 10) { score += 1; why.push("due ~"); }
    }

    // Funding account. The alert names a card/account tail; alertToExpense
    // resolves that to one of his accounts, and routeAlert passes the result
    // through. Agreement is corroboration, disagreement is a real objection —
    // a debit from Kotak cannot be paying a subscription funded from HDFC.
    const resolved = matchAccount(alert, accounts);
    if (o.accountId && resolved) {
      if (resolved.id === o.accountId) { score += 2; why.push("account"); }
      else { score -= 2; why.push("wrong account"); }
    }

    // Already paid on this exact date — almost certainly the same debit
    // arriving twice (a re-sync, or the alert plus the statement).
    if (o.lastPaidDate && alert.date && o.lastPaidDate === alert.date) {
      score -= 4; why.push("already paid that day");
    }

    if (!best || score > best.score) { second = best; best = { outgoing: o, score, why, isCard }; }
    else if (!second || score > second.score) second = { outgoing: o, score, why, isCard };
  }

  if (!best || best.score < 4) return null;

  // A NEAR-TIE IS NOT A MATCH.
  //
  // A CRED payment names no card in the narration, so with three card bills
  // set up the only thing separating them is which happens to be due nearest
  // that day — and paying Amazon Pay through CRED on the 10th would then
  // credit the HDFC card instead. Two candidates within a point of each other
  // means the evidence genuinely does not choose between them, and the answer
  // is to ask rather than to let a due-date coincidence decide.
  const margin = second ? best.score - second.score : Infinity;
  const ambiguous = margin < 2;

  return {
    outgoing: best.outgoing,
    isCardPayment: !!best.outgoing.paysDownAccountId,
    confidence: ambiguous ? "likely" : best.score >= 6 ? "certain" : "likely",
    ambiguous,
    runnerUp: ambiguous && second ? second.outgoing : null,
    why: best.why.join(" + ") + (ambiguous && second ? ` — but ${second.outgoing.name} fits just as well` : ""),
  };
}

/**
 * The routing verdict for one alert.
 *
 * Four outcomes:
 *   { kind: "skip" }            — a credit, or no amount: not spending
 *   { kind: "card-payment" }    — pay down a card; books NO expense
 *   { kind: "outgoing" }        — a recurring item; payOutgoing books it
 *   { kind: "expense" }         — an ordinary purchase
 *
 * `needsReview` marks anything the caller must not apply unattended. The
 * auto-log path is allowed to act only on verdicts without it.
 */
export function routeAlert(alert, { outgoings = [], accounts = [], categories = [] } = {}) {
  if (alert.dir !== "DR") return { kind: "skip", reason: "not a debit" };
  if (!Number(alert.amount)) return { kind: "skip", reason: "no amount" };

  const m = matchOutgoing(alert, outgoings, accounts);

  if (m && m.isCardPayment) {
    return {
      kind: "card-payment",
      outgoing: m.outgoing,
      amount: Number(alert.amount),
      confidence: m.confidence,
      needsReview: m.confidence !== "certain",
      runnerUp: m.runnerUp || null,
      why: m.why,
      note: "Transfer, not an expense — the purchases were already recorded.",
    };
  }

  if (m) {
    return {
      kind: "outgoing",
      outgoing: m.outgoing,
      amount: Number(alert.amount),
      category: m.outgoing.category || null,
      confidence: m.confidence,
      needsReview: m.confidence !== "certain",
      runnerUp: m.runnerUp || null,
      why: m.why,
    };
  }

  // Looks like a card payment but matched no card outgoing. Never auto-file:
  // as a plain expense it would double-count, and silently dropping it would
  // lose real money. Ask.
  if (looksLikeCardPayment(alert)) {
    // Which card bills it COULD be, so the caller can offer a choice rather
    // than a dead end. A CRED payment names no card in the narration; with
    // three cards set up, only Charles knows which one he settled.
    const candidates = outgoings.filter(
      (o) => (!o.status || o.status === "active") && o.paysDownAccountId
    );
    return {
      kind: "card-payment",
      outgoing: null,
      candidates,
      amount: Number(alert.amount),
      confidence: "unsure",
      needsReview: true,
      why: candidates.length
        ? "card-payment wording, but the narration doesn't say which card"
        : "card-payment wording, but no card bill is set up to pay a card down",
      note: "This reads as a credit-card bill payment. Filing it as an expense would count the spending twice.",
    };
  }

  return { kind: "expense", amount: Number(alert.amount), needsReview: false };
}

/**
 * The date this outgoing should next fall due, once this payment lands.
 *
 * Advanced from the RENEWAL DATE, not from the payment date: a bill paid
 * three days late still renews on its own monthly cycle, and stepping from
 * the payment would walk the due date forward a little every month until it
 * had drifted into the wrong part of the month entirely.
 */
export function advanceRenewal(outgoing, paidOn) {
  const base = outgoing?.nextRenewal || paidOn;
  const d = new Date(base);
  if (isNaN(d)) return "";
  const cadence = norm(outgoing?.cadence) || "monthly";
  if (cadence === "yearly" || cadence === "annual") d.setFullYear(d.getFullYear() + 1);
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else if (cadence === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);

  // If that still leaves it in the past (a bill paid weeks late, or a gap in
  // syncing), keep stepping until it is genuinely the NEXT one.
  const paid = new Date(paidOn);
  let guard = 0;
  while (!isNaN(paid) && d <= paid && guard++ < 24) {
    if (cadence === "yearly" || cadence === "annual") d.setFullYear(d.getFullYear() + 1);
    else if (cadence === "weekly") d.setDate(d.getDate() + 7);
    else if (cadence === "quarterly") d.setMonth(d.getMonth() + 3);
    else d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}
