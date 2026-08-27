import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchUsdToInr, formatMoney, formatAmount, formatFrom, convertFromUsd, convertBetween, CURRENCIES } from "../lib/currency";

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

  // The write stays OUT of the updater. StrictMode double-invokes updaters in
  // dev, so a side effect in there runs twice — harmless for an idempotent
  // localStorage write like this one, but it is the exact impure-updater shape
  // that caused a real data-loss bug in this codebase before, and it stops
  // being harmless the moment anything order-dependent moves inside.
  const toggleHideAmounts = () => {
    setHideAmounts((h) => !h);
  };

  useEffect(() => {
    localStorage.setItem(HIDE_KEY, hideAmounts ? "1" : "0");
  }, [hideAmounts]);

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
    // The functions components actually call.
    // money()   — a USD-stored amount, converted into the global display currency.
    // moneyIn() — an amount that already IS in `code` (an invoice's own
    //             currency), rendered as-is with no conversion.
    // moneyFrom() — an amount stored in its own currency (a bank account, a
    //               subscription) that SHOULD still follow the display toggle,
    //               so everything can be compared in one currency.
    money: (usd, opts = {}) => (hideAmounts ? MASK : formatMoney(usd, { currency, rate: fx.rate, ...opts })),
    moneyIn: (amount, code, opts = {}) =>
      (hideAmounts ? MASK : formatAmount(amount, { currency: code || "USD", ...opts })),
    moneyFrom: (amount, from, opts = {}) =>
      (hideAmounts ? MASK : formatFrom(amount, from, { currency, rate: fx.rate, ...opts })),
    convert: (usd) => convertFromUsd(usd, currency, fx.rate),
    convertFrom: (amount, from) => convertBetween(amount, from || "USD", currency, fx.rate),
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
      moneyIn: (amount, code, opts = {}) => formatAmount(amount, { currency: code || "USD", ...opts }),
      moneyFrom: (amount, from, opts = {}) => formatFrom(amount, from, { currency: "USD", rate: 1, ...opts }),
      convert: (usd) => Number(usd) || 0,
      convertFrom: (amount) => Number(amount) || 0,
    };
  }
  return ctx;
}
