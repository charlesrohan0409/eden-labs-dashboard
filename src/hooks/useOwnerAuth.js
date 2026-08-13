import { useCallback, useMemo, useState } from "react";

const TOKEN_KEY = "eden-labs-owner-token";

// PIN-gated login for the owner dashboard. The PIN itself never touches
// localStorage or gets compared client-side — /api/auth-owner hashes and
// checks it against Supabase server-side and hands back a signed session
// token, which is what actually gates every /api/data request from here on.
// Storing that token (not the PIN) in localStorage is what makes "log in
// once, then open the dashboard from any device" work: the token itself is
// the credential, valid for 30 days, same idea as any other web app's login.
export function useOwnerAuth() {
  const [token, setToken] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : ""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = useCallback(async (pin) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.token) {
        setError(json.error || "That PIN didn't match.");
        return false;
      }
      localStorage.setItem(TOKEN_KEY, json.token);
      setToken(json.token);
      return true;
    } catch (e) {
      setError(e.message || "Couldn't reach the server — check your connection.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
  }, []);

  // Memoized so callers can safely depend on the whole returned object (or
  // just the stable login/logout functions) without it changing identity on
  // every render — an unmemoized object literal here fed a useCallback in
  // App.jsx whose changing identity caused useAppData's fetch effect to
  // refire on every single render, in an unbounded loop, the entire time the
  // dashboard was open. See App.jsx's handleOwnerUnauthorized for the fix on
  // the consuming side; this is the belt-and-suspenders fix at the source.
  return useMemo(() => ({ token, login, logout, loading, error }), [token, login, logout, loading, error]);
}
