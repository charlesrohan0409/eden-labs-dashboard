import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchUsdToInr, formatMoney, convertFromUsd, CURRENCIES } from "../lib/currency";

// Currency is needed by nearly every page (finance, clients, CRM, dashboard),
// so it goes through context rather than being threaded as a prop through
// half the component tree.
const CurrencyContext = createContext(null);

// "Hide amounts" is a per-browser preference (localStorage, not synced to
// Supabase) — someone glancing at the screen shouldn't see revenue, but the
// dashboard itself doesn't need to remember this across devices. Masking
// lives inside money() itself rather than being threaded through every call
// site individually: every dollar figure in the app already goes through
// this one function, so toggling it here hides all of them at once. The
// owner's dashboard and the client portal each mount their own
// CurrencyProvider instance (see App.jsx), so this never leaks into what an
// actual client sees on their own portal — only a same-device "Preview
// client portal" carries it over, since that's the same physical screen.
const HIDE_KEY = "eden-labs-hide-amounts";
const MASK = "••••••";

export function CurrencyProvider({ currency = "USD", children }) {
  const [fx, setFx] = useState({ rate: null, fetchedAt: null, stale: false, loading: true });
  const [hideAmounts, setHideAmounts] = useState(() => localStorage.getItem(HIDE_KEY) === "1");

  const toggleHideAmounts = () => {
    setHideAmounts((h) => {
      const next = !h;
      localStorage.setItem(HIDE_KEY, next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    // Only bother hitting the FX API when a non-USD currency is actually
    // selected — no point fetching a rate nothing will use.
    if (currency === "USD") {
      setFx({ rate: 1, fetchedAt: null, stale: false, loading: false });
      return;
    }
    let cancelled = false;
    setFx((f) => ({ ...f, loading: true }));
    fetchUsdToInr().then((res) => {
      if (!cancelled) setFx({ ...res, loading: false });
    });
    return () => { cancelled = true; };
  }, [currency]);

  const value = useMemo(() => ({
    currency,
    rate: fx.rate,
    fxStale: fx.stale,
    fxLoading: fx.loading,
    fxFetchedAt: fx.fetchedAt,
    symbol: (CURRENCIES[currency] || CURRENCIES.USD).symbol,
    hideAmounts,
    toggleHideAmounts,
    // The two functions components actually call.
    money: (usd, opts = {}) => (hideAmounts ? MASK : formatMoney(usd, { currency, rate: fx.rate, ...opts })),
    convert: (usd) => convertFromUsd(usd, currency, fx.rate),
  }), [currency, fx, hideAmounts]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  // Falling back to plain USD formatting keeps any component usable outside a
  // provider (tests, the client portal shell) instead of throwing.
  if (!ctx) {
    return {
      currency: "USD", rate: 1, symbol: "$", fxStale: false, fxLoading: false,
      hideAmounts: false, toggleHideAmounts: () => {},
      money: (usd, opts = {}) => formatMoney(usd, { currency: "USD", rate: 1, ...opts }),
      convert: (usd) => Number(usd) || 0,
    };
  }
  return ctx;
}
