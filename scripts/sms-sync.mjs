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
// How far back a FIRST run looks.
//
// With no watermark the query takes everything, and Charles has 2,396 bank
// messages going back years — almost all of it already in the ledger from
// bank statements. Pushing the lot would bury the genuinely new dozen under
// a thousand duplicates. Recent history is the useful part; --all or
// --days=N is there for when it isn't.
const ALL = process.argv.includes("--all");
const DAYS = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1]) || 30;

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
       ${sinceRowId || ALL ? "" : `AND m.date/1000000000 + 978307200 > strftime('%s','now','-${Math.max(1, Math.round(DAYS))} days')`}
       AND m.is_from_me = 0
       AND m.text IS NOT NULL
       AND (${senders})
       AND (${words})
     ORDER BY m.ROWID ASC
     LIMIT 400;`;
}

/**
 * Which application is actually running this.
 *
 * Full Disk Access is granted per-app, and the app is whichever one owns the
 * shell — Terminal, iTerm, VS Code, or the Claude desktop app if the command
 * was typed into its terminal panel. Granting the wrong one looks identical
 * to granting none, which is a genuinely confusing half hour. So rather than
 * assume Terminal, walk up the process tree and name what is really there.
 */
function hostApp() {
  try {
    let pid = process.ppid;
    for (let i = 0; i < 8 && pid > 1; i++) {
      const line = execFileSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], { encoding: "utf8" }).trim();
      if (!line) break;
      const ppid = Number(line.split(/\s+/)[0]);
      const comm = line.slice(String(ppid).length).trim();
      const m = comm.match(/([^/]+)\.app\/Contents\/MacOS\//);
      if (m) return { name: m[1], path: comm.slice(0, comm.indexOf(".app") + 4) };
      pid = ppid;
    }
  } catch { /* naming it is a nicety, not a requirement */ }
  return null;
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
    if (e.code !== "EPERM" && e.code !== "EACCES") {
      throw new Error(`Could not read ${DB}: ${e.message}`);
    }
    const app = hostApp();
    const isAssistant = app && /claude|cursor|copilot|code helper/i.test(app.name);
    const who = app ? `"${app.name}"` : "the app you are running this from";

    // Full Disk Access is granted PER APP, and the app is whichever one owns
    // the shell. Granting it to Terminal and then running the command in a
    // different app's terminal panel looks exactly like granting nothing.
    //
    // When that app is an AI assistant, Terminal is the recommendation rather
    // than a footnote: the grant would give it read access to everything on
    // the Mac, and a nested helper bundle may not even be the path macOS
    // attributes the permission to. Terminal is unambiguous and narrow.
    throw new Error([
      "macOS is blocking access to Messages.",
      "",
      `  This is running inside ${who}, and Full Disk Access is granted per app —`,
      "  so granting it to a different terminal has no effect.",
      "",
      ...(isAssistant ? [
        "  DO THIS: open Terminal.app and run the command there.",
        "",
        "    System Settings → Privacy & Security → Full Disk Access",
        "      → + → Applications → Utilities → Terminal",
        "    Quit Terminal completely (⌘Q), reopen it, then run:",
        "",
        `      node ${fileURLToPath(import.meta.url).replace(/ /g, "\\ ")} --dry`,
        "",
        `  You could instead grant ${who} the same access, but that gives it`,
        "  read access to everything on this Mac. Terminal is the narrower door.",
      ] : [
        "  System Settings → Privacy & Security → Full Disk Access",
        app ? `    → + → ${app.path}` : "    → + → the app you are using",
        `  then quit ${who} completely (⌘Q, not just the window) and reopen it.`,
      ]),
    ].join("\n"));
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
const window = state.lastRowId ? `since #${state.lastRowId}` : ALL ? "(entire history)" : `(last ${DAYS} days)`;
console.log(`${rows.length} bank message${rows.length === 1 ? "" : "s"} ${window}`);
if (!state.lastRowId && !ALL) {
  console.log("First run, so only recent messages — older ones are already in the ledger from your statements.");
  console.log("Use --all, or --days=90, to reach further back.");
}

let sent = 0, dup = 0, unread = 0, failed = 0, consecutive = 0;
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
    if (res.status === 401 || res.status === 403) {
      // Configuration, not a bad message. Retrying it 2,395 more times cannot
      // help and only fills the screen.
      console.error(`\n  ${j.error || "Not authorised."}`);
      console.error("  Nothing was sent. Set SMS_INGEST_TOKEN in Vercel, redeploy, and run again.");
      console.error("  (Vercel bakes env vars in at build time — adding one does nothing until you redeploy.)");
      process.exit(1);
    }
    if (!res.ok) {
      failed++;
      console.error(`  failed ${res.status}: ${j.error || ""}`);
      // A run of failures means something systemic; stop rather than grind on.
      if (++consecutive >= 5) {
        console.error("  Five failures in a row — stopping. Nothing after this point was attempted.");
        break;
      }
      continue;
    }
    consecutive = 0;
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
