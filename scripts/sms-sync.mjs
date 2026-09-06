#!/usr/bin/env node
//
// Kotak sends no transaction email — only SMS. This reads the bank messages
// your iPhone already forwards to this Mac and pushes them to the dashboard,
// so nothing has to be copied by hand.
//
// ONLY BANK MESSAGES LEAVE THIS MACHINE.
//
// The Messages database holds every conversation on this Mac. This reads it
// with a deliberately narrow filter — a known bank sender AND wording that
// looks like a transaction — and never sends anything else. Personal messages
// are not read into memory, let alone transmitted: the filter is in the SQL.
//
// SETUP
//   1. System Settings → Privacy & Security → Full Disk Access → add Terminal
//      (macOS blocks every process from chat.db until you do; there is no way
//      around it and no way for a script to ask.)
//   2. On your iPhone: Settings → Messages → Text Message Forwarding → this Mac
//   3. node scripts/sms-sync.mjs          (add --dry to see without sending)
//
// Then schedule it — see scripts/sms-sync.plist.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOME = os.homedir();
const DB = path.join(HOME, "Library/Messages/chat.db");
const STATE = path.join(HOME, ".edenlabs-sms-sync.json");
// fileURLToPath, not URL.pathname: the project lives under "EdenLabs
// Dashboard" and pathname leaves the space percent-encoded, so the file was
// never found and the script reported a missing token that was right there.
const ENV = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
const DRY = process.argv.includes("--dry");

// --- config ---------------------------------------------------------------
const env = {};
try {
  for (const line of fs.readFileSync(ENV, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* fall through to the check below */ }

const BASE = process.env.EDENLABS_URL || env.EDENLABS_URL || "https://dashboard.theedenlabs.com";
const TOKEN = process.env.SMS_INGEST_TOKEN || env.SMS_INGEST_TOKEN;
if (!TOKEN) {
  console.error("SMS_INGEST_TOKEN not found in .env.local — nothing to authenticate with.");
  process.exit(1);
}

// --- who counts as a bank -------------------------------------------------
//
// Indian bank senders are short codes like AD-HDFCBK, VM-KOTAKB, JD-ICICIB.
// Matched on the sender AND on transaction wording, so a marketing blast from
// the same short code never travels.
const BANK_SENDERS = ["KOTAK", "HDFC", "YESBNK", "YESBK", "ICICI", "AXIS", "SBIIN", "AMZNPY"];
const TXN_WORDS = ["debited", "credited", "Sent Rs", "spent", "received", "withdrawn"];

// sqlite3's CLI takes no bind parameters, so the query is assembled here. Every
// value in it is a constant defined directly above — nothing from a message
// and nothing from the network ever reaches this string.
const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;

function buildQuery(sinceRowId) {
  const senders = BANK_SENDERS.map((b) => `upper(h.id) LIKE ${quote("%" + b + "%")}`).join(" OR ");
  const words = TXN_WORDS.map((w) => `m.text LIKE ${quote("%" + w + "%")}`).join(" OR ");
  return `
    SELECT m.ROWID,
           COALESCE(h.id,'?'),
           m.text,
           strftime('%Y-%m-%d', m.date/1000000000 + 978307200, 'unixepoch', 'localtime')
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
     WHERE m.ROWID > ${Number(sinceRowId) || 0}
       AND m.is_from_me = 0
       AND m.text IS NOT NULL
       AND (${senders})
       AND (${words})
     ORDER BY m.ROWID ASC
     LIMIT 400;`;
}

function readMessages(sinceRowId) {
  // Copy first: Messages keeps the database open with a write-ahead log, and
  // querying it in place can fail or return a stale view.
  const tmp = path.join(os.tmpdir(), `edenlabs-chat-${process.pid}.db`);
  // The main file MUST copy. Swallowing this left sqlite3 opening a database
  // that didn't exist and reporting "no such table: message" — which tells you
  // nothing about the real cause, which is always the same one.
  try {
    fs.copyFileSync(DB, tmp);
  } catch (e) {
    const why = e.code === "EPERM" || e.code === "EACCES"
      ? "macOS is blocking access to Messages."
      : `Could not read ${DB}: ${e.message}`;
    throw new Error(`${why}\n\n  Grant Full Disk Access:\n    System Settings → Privacy & Security → Full Disk Access\n    → + → Applications → Utilities → Terminal\n  then QUIT Terminal completely (⌘Q) and reopen it.`);
  }
  // These two may legitimately be absent.
  for (const ext of ["-wal", "-shm"]) {
    try { fs.copyFileSync(DB + ext, tmp + ext); } catch { /* fine */ }
  }
  try {
    const out = execFileSync("sqlite3", ["-separator", "\x1f", tmp, buildQuery(sinceRowId)],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return out.split("\n").filter(Boolean).map((line) => {
      const [rowid, sender, text, date] = line.split("\x1f");
      return { rowid: Number(rowid), sender, text, date };
    });
  } finally {
    for (const ext of ["", "-wal", "-shm"]) { try { fs.unlinkSync(tmp + ext); } catch { /* fine */ } }
  }
}

// --- run ------------------------------------------------------------------
let state = { lastRowId: 0 };
try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { /* first run */ }

let rows;
try {
  rows = readMessages(state.lastRowId || 0);
} catch (e) {
  console.error(e.message || String(e));
  process.exit(1);
}

if (!rows.length) {
  console.log(`Nothing new (last seen message #${state.lastRowId || 0}).`);
  process.exit(0);
}
console.log(`${rows.length} new bank message${rows.length === 1 ? "" : "s"} since #${state.lastRowId || 0}`);

let sent = 0, dup = 0, unread = 0, failed = 0;
for (const r of rows) {
  if (DRY) {
    console.log(`  [dry] ${r.date}  ${r.sender.padEnd(12)} ${r.text.slice(0, 78).replace(/\s+/g, " ")}`);
    continue;
  }
  try {
    const res = await fetch(`${BASE}/api/sms-ingest?token=${encodeURIComponent(TOKEN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: r.text, date: r.date, from: r.sender }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { failed++; console.error(`  failed ${res.status}: ${j.error || ""}`); continue; }
    if (j.duplicate) dup++;
    else if (j.read) { sent++; console.log(`  ${r.date}  ₹${j.amount}  ${j.payee || "(no payee)"}`); }
    else { unread++; console.log(`  ${r.date}  queued but unreadable — ${j.reason}`); }
  } catch (e) {
    failed++;
    console.error(`  network error: ${e.message}`);
  }
}

// Only advance past what actually went. A failed send must be retried next
// run, not skipped because the pointer moved.
if (!DRY && !failed) {
  fs.writeFileSync(STATE, JSON.stringify({ lastRowId: rows[rows.length - 1].rowid, at: new Date().toISOString() }));
}
console.log(DRY
  ? "\n(dry run — nothing sent, nothing recorded)"
  : `\n${sent} pushed, ${dup} already had, ${unread} unreadable, ${failed} failed`);
if (failed) console.log("Pointer not advanced — the failures will be retried next run.");
