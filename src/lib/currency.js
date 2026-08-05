// Display currency.
//
// Every amount in the app is STORED in USD — invoices, contract values,
// expenses, deal values. Currency is purely a display concern: switching to
// INR converts at the live rate at render time and never rewrites stored data.
// That matters because a stored-value rewrite would silently change what an
// invoice says it's worth every time the rate moved.

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
 * Format a USD-denominated amount in the active display currency.
 * `compact` gives "₹96k" / "$1.2k" for tight spots like chart axes and tiles.
 */
export function formatMoney(usdAmount, { currency = "USD", rate, compact = false, decimals = 0 } = {}) {
  const value = convertFromUsd(usdAmount, currency, rate);
  const { symbol } = CURRENCIES[currency] || CURRENCIES.USD;

  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 10000000) return `${symbol}${(value / 10000000).toFixed(1)}Cr`; // INR crore
    if (abs >= 100000 && currency === "INR") return `${symbol}${(value / 100000).toFixed(1)}L`; // lakh
    if (abs >= 1000) return `${symbol}${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${symbol}${Math.round(value)}`;
  }

  return `${symbol}${value.toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
