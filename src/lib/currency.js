// Display currency.
//
// Two distinct paths, and the difference matters:
//
// 1. DISPLAY (formatMoney) — contract values, expenses, deal values and every
//    aggregate are stored in USD and converted at render time. Switching the
//    global currency never rewrites stored data, because a stored-value
//    rewrite would silently change what things are worth every time the rate
//    moved.
//
// 2. PER-RECORD (formatAmount) — an invoice carries its OWN currency and its
//    own already-denominated `nativeAmount`, plus the FX rate frozen at issue
//    time. An invoice sent for ₹50,000 must say ₹50,000 forever, whatever the
//    global toggle is set to and whatever the rate does afterwards — it's a
//    legal document, not a dashboard tile. Those render through formatAmount,
//    which does no conversion at all.
//
// Invoices additionally keep a USD `amount` snapshot so app-wide totals
// (revenue charts, health scores) stay summable — adding ₹ to $ is meaningless.

export const CURRENCIES = {
  USD: { code: "USD", symbol: "$", label: "US Dollar" },
  INR: { code: "INR", symbol: "₹", label: "Indian Rupee" },
};

const RATE_CACHE_KEY = "eden-labs-fx-rate";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // Rates move slowly; twice a day is plenty.

// Only used if every live source fails AND nothing is cached — the UI labels
// it "approximate" when that happens rather than passing it off as live.
const FALLBACK_USD_TO_INR = 95;

// Both are free, keyless, and CORS-enabled (verified against the live
// endpoints — exchangerate.host now requires an API key and frankfurter
// blocks browser origins, so neither is usable here). Two sources rather than
// one so a single provider outage doesn't drop us to the hardcoded constant.
const RATE_SOURCES = [
  {
    url: "https://open.er-api.com/v6/latest/USD",
    read: (j) => j?.rates?.INR,
  },
  {
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    read: (j) => j?.usd?.inr,
  },
];

/**
 * Live USD->INR rate, cached in localStorage for 12h.
 * Returns {rate, fetchedAt, stale} — `stale` means it isn't a fresh live rate,
 * so the UI can say so instead of implying precision it doesn't have.
 */
export async function fetchUsdToInr() {
  try {
    const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
    if (cached?.rate && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached, stale: false };
    }
  } catch { /* corrupt cache — just refetch */ }

  for (const source of RATE_SOURCES) {
    try {
      const res = await fetch(source.url);
      if (!res.ok) continue;
      const rate = source.read(await res.json());
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
      const entry = { rate, fetchedAt: Date.now() };
      localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(entry));
      return { ...entry, stale: false };
    } catch { /* try the next source */ }
  }

  // Prefer an expired cached rate over the hardcoded constant — yesterday's
  // real rate beats one baked in months ago.
  try {
    const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
    if (cached?.rate) return { ...cached, stale: true };
  } catch { /* fall through */ }
  return { rate: FALLBACK_USD_TO_INR, fetchedAt: null, stale: true };
}

export const convertFromUsd = (usd, currency, rate) =>
  currency === "INR" ? (Number(usd) || 0) * (rate || FALLBACK_USD_TO_INR) : (Number(usd) || 0);

/**
 * Format an amount that is ALREADY denominated in `currency` — no conversion.
 * This is what an invoice needs: a ₹50,000 invoice is ₹50,000, full stop, and
 * must never be run through an FX rate again.
 * `compact` gives "₹96k" / "$1.2k" for tight spots like chart axes and tiles.
 */
export function formatAmount(value, { currency = "USD", compact = false, decimals = 0 } = {}) {
  const n = Number(value) || 0;
  const { symbol } = CURRENCIES[currency] || CURRENCIES.USD;

  if (compact) {
    const abs = Math.abs(n);
    if (abs >= 10000000) return `${symbol}${(n / 10000000).toFixed(1)}Cr`; // INR crore
    if (abs >= 100000 && currency === "INR") return `${symbol}${(n / 100000).toFixed(1)}L`; // lakh
    if (abs >= 1000) return `${symbol}${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${symbol}${Math.round(n)}`;
  }

  return `${symbol}${n.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format a USD-denominated amount in the active display currency — converts
 * first, then formats. This is the whole-app display path; `formatAmount` is
 * the per-record path for anything storing its own currency.
 */
export function formatMoney(usdAmount, { currency = "USD", rate, ...rest } = {}) {
  return formatAmount(convertFromUsd(usdAmount, currency, rate), { currency, ...rest });
}
