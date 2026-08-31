// Turning a bank alert into an expense the Finance tab understands.
//
// The alert knows three things: how much, which way, and roughly who. An
// expense record needs more — a category from Charles's own list, which
// account it came out of, and the USD figure the rest of the app reports in.
// This fills that gap and nothing else; the decision to record it stays a
// press of a button.
//
// ONLY DEBITS BECOME EXPENSES.
//
// A credit alert is money arriving. Filing it as an expense would be wrong in
// the most confusing possible way — it would show up as spending in every
// chart while the bank balance went up.

/**
 * Best-guess category, from the payee and the alert text.
 *
 * Matched against Charles's OWN category list rather than a canonical one:
 * an expense filed under a category that doesn't exist in his dashboard is
 * an expense he has to re-file by hand. Anything unrecognised returns null
 * rather than "Other" — a guess presented as an answer is worse than an
 * empty dropdown, because it gets accepted without being read.
 */
export function suggestCategory(alert, categories = []) {
  const hay = `${alert.payee || ""} ${alert.subject || ""} ${alert.text || ""}`.toUpperCase();
  const has = (...words) => words.some((w) => hay.includes(w.toUpperCase()));
  const pick = (name) => categories.find((c) => c.toLowerCase() === name.toLowerCase()) || null;

  if (has("SWIGGY", "ZOMATO", "DOMINO", "MCDONALD", "KFC", "BURGER", "PIZZA", "RESTAURANT",
          "IDLI", "BIRYANI", "CAFE", "BAKERY", "SHAWARMA", "FOOD", "EAT", "MESS", "HOTEL")) return pick("Food");
  if (has("BLINKIT", "ZEPTO", "INSTAMART", "DMART", "BIGBASKET", "SUPERMARKET", "HYPER",
          "MALIGAI", "PROVISION", "KIRANA", "GROCER", "STORES", "MART")) return pick("Groceries");
  if (has("STARBUCKS", "COFFEE", "TEA ")) return pick("Cafe Subscription") || pick("Food");
  if (has("ADOBE", "GOOGLE", "OPENAI", "NOTION", "SLACK", "CANVA", "GITHUB", "FIGMA",
          "LINKEDIN", "SHOPIFY", "HOSTINGER", "SOFTWARE", "SUBSCR")) return pick("Software");
  if (has("META ADS", "FACEBOOK", "GOOGLE ADS")) return pick("Marketing");
  if (has("RAPIDO", "UBER", "OLA ", "ROPPEN", "IRCTC", "INDIGO", "TRAVEL", "PETROL", "FUEL")) return pick("Travel");
  if (has("AIRTEL", "JIO", "VODAFONE", "ELECTRIC", "BROADBAND", "RECHARGE", "MUNICIPAL", "BILL")) return pick("Utilities");
  if (has("CHURCH", "BEULAH")) return pick("Church Food") || pick("Other");
  if (has("MEDICAL", "PHARMA", "CHEMIST", "HOSPITAL", "CLINIC")) return pick("Other");
  return null;
}

/** Which of his accounts the alert came out of. */
export function matchAccount(alert, accounts = []) {
  const TAIL = {
    3752: /hdfc bank|hdfc$/i, 9905: /hdfc bank/i,
    3630: /kotak/i, 5902: /hdfc credit/i,
  };
  if (alert.accountTail && TAIL[alert.accountTail]) {
    const a = accounts.find((x) => TAIL[alert.accountTail].test(x.name || ""));
    if (a) return a;
  }
  // Kotak's alerts name the bank but not the number.
  if (alert.bank) {
    const want = alert.bank.includes("kotak") ? /kotak/i
      : alert.bank.includes("card") ? /hdfc credit/i
      : /hdfc bank/i;
    const a = accounts.find((x) => want.test(x.name || ""));
    if (a) return a;
  }
  return null;
}

// Business categories, for the book split. Everything else is personal —
// which is the right default for someone whose spending is mostly personal.
const BUSINESS = new Set(["software", "marketing", "contractor", "rent"]);

/**
 * The expense record itself, in exactly the shape Finance already stores.
 *
 * `amount` is USD because that is what every report and chart in the app
 * totals; `nativeAmount` keeps the rupee figure that was actually spent. The
 * two must be derived from ONE rate — computing them separately is how a
 * ₹1,000 lunch becomes $10.47 in one place and $10.52 in another.
 */
export function toExpense(alert, { accounts = [], category = null, rate = 1, book = null } = {}) {
  if (alert.dir !== "DR") return null;                 // credits are not expenses
  const native = Number(alert.amount) || 0;
  if (!native) return null;
  const acct = matchAccount(alert, accounts);
  const cat = category || "Other";
  return {
    book: book || (BUSINESS.has(cat.toLowerCase()) ? "business" : "personal"),
    date: alert.date,
    amount: rate ? native / rate : native,
    fxRate: rate,
    vendor: alert.payee || alert.subject || "Bank alert",
    category: cat,
    currency: "INR",
    nativeAmount: native,
    accountId: acct?.id || null,
    // Carried through so the same alert can't be logged twice — see the
    // duplicate guard in GmailAlerts.
    gmailMessageId: alert.messageId,
  };
}
