// Server-only auth primitives — PIN hashing and session tokens.
//
// No new dependency: Node's built-in `crypto` covers both. PINs are hashed
// with scrypt (salted, slow-by-design) rather than compared in plaintext —
// the old client-side `data.clients.find(c => c.pin === pin)` check is what
// this replaces. Sessions are a signed, stateless token (HMAC-SHA256 over a
// JSON payload) rather than a DB-backed session table: cheap to verify on
// every request, and there's nothing to garbage-collect.

import crypto from "node:crypto";

const KEY_LEN = 64;

export function genSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, KEY_LEN).toString("hex");
}

export function verifyPin(pin, salt, expectedHashHex) {
  const got = crypto.scryptSync(String(pin), salt, KEY_LEN);
  const expected = Buffer.from(expectedHashHex, "hex");
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(got, expected);
}

const b64url = (buf) => buf.toString("base64url");
const fromB64url = (str) => Buffer.from(str, "base64url");

function sign(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

// payload: plain object, e.g. { role: "owner" } or { role: "client", clientId }
// ttlSeconds: how long the session stays valid — long-lived on purpose, since
// the point is "log in once, stay signed in on this device."
export function signToken(payload, secret, ttlSeconds) {
  const body = { ...payload, iat: Date.now(), exp: Date.now() + ttlSeconds * 1000 };
  const encoded = b64url(Buffer.from(JSON.stringify(body)));
  const sig = sign(encoded, secret);
  return `${encoded}.${sig}`;
}

// Returns the payload object if the token is well-formed, correctly signed,
// and unexpired — otherwise null. Never throws, so call sites can just check
// truthiness.
export function verifyToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expectedSig = sign(encoded, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(fromB64url(encoded).toString());
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
  return payload;
}

// Pulls the bearer token out of a Fetch-style Headers-ish object (plain
// object of lowercased header names, which is what our two runtimes give us).
export function bearerFrom(headers) {
  const auth = headers?.authorization || headers?.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1] : null;
}
