import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchUsdToInr, formatMoney, convertFromUsd, CURRENCIES } from "../lib/currency";

// Currency is needed by nearly every page (finance, clients, CRM, dashboard),
// so it goes through context rather than being threaded as a prop through
// half the component tree.
const CurrencyContext = createContext(null);

export function CurrencyProvider({ currency = "USD", children }) {
  const [fx, setFx] = useState({ rate: null, fetchedAt: null, stale: false, loading: true });

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
    // The two functions components actually call.
    money: (usd, opts = {}) => formatMoney(usd, { currency, rate: fx.rate, ...opts }),
    convert: (usd) => convertFromUsd(usd, currency, fx.rate),
  }), [currency, fx]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  // Falling back to plain USD formatting keeps any component usable outside a
  // provider (tests, the client portal shell) instead of throwing.
  if (!ctx) {
    return {
      currency: "USD", rate: 1, symbol: "$", fxStale: false, fxLoading: false,
      money: (usd, opts = {}) => formatMoney(usd, { currency: "USD", rate: 1, ...opts }),
      convert: (usd) => Number(usd) || 0,
    };
  }
  return ctx;
}
