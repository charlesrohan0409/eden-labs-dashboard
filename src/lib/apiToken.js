// The session token the browser sends to our own /api proxies.
//
// Those proxies (buffer, calendar, send-email, fathom) forward requests using
// Charles's third-party keys, so they have to know who is asking. Threading a
// token argument through every exported helper would mean changing a dozen
// signatures and every call site — including deep inside Buffer's queue and
// performance code, which has no business knowing about auth.
//
// So it is set once, when a session starts, and read where the request is
// actually made. Module-level rather than React context because the callers
// are plain functions, not components.
let current = null;

/** Called on sign-in (owner or client) and cleared on sign-out. */
export function setApiToken(token) { current = token || null; }
export function apiToken() { return current; }
