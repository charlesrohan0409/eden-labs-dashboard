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
// TMBANK is Tamilnad Mercantile Bank — 2,100 messages of it on this Mac, and
// TMBL IFSC codes appear in his own transfers, so it is an account the books
// have never seen.
const BANK_SENDERS = [
  "KOTAK", "HDFC", "YESBNK", "YESBK", "ICICI", "AXIS", "SBIIN", "AMZNPY",
  "TMBANK", "TMBLTD",
];
const TXN_WORDS = ["debited", "credited", "Sent Rs", "spent", "received", "withdrawn"];

// sqlite3's CLI takes no bind parameters, so the query is assembled here. Every
// value in it is a constant defined directly above — nothing from a message
// and nothing from the network ever reaches this string.
const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;

// Apple stores message.date as an offset from 2001-01-01, but the UNIT changed:
// older rows are seconds, newer ones nanoseconds. Dividing everything by a
// billion sends every old row back to 2001, and a 30-day window then matches
// nothing — which is exactly what happened: 2,396 messages found with no date
// filter, zero with one.
const EPOCH = "(CASE WHEN m.date > 1000000000000 THEN m.date/1000000000 ELSE m.date END + 978307200)";
// CAST is not decoration. strftime() returns TEXT, and SQLite orders every
// text value above every number — so `EPOCH > strftime(...)` is false for
// every row ever written. The window silently matched nothing while the same
// query without it returned 2,135 messages.

// THE TEXT COLUMN IS NO LONGER FILLED IN.
//
// Newer macOS writes the message body only into `attributedBody`, a binary
// typedstream blob, and leaves `text` NULL. On this Mac every one of the 324
// recent bank messages has an empty text column while 4,394 older ones are
// fine — so a filter reading `text` sees a live inbox as an empty one.
//
// The body sits inside the archive after an NSString class marker: a '+'
// (0x2B), then a length, then UTF-8 bytes. Lengths above 127 are prefixed
// with 0x81 and stored as a little-endian short.
function decodeAttributedBody(hex) {
  if (!hex) return null;
  let buf;
  try { buf = Buffer.from(hex, "hex"); } catch { return null; }

  const marker = buf.lastIndexOf(Buffer.from("NSString", "utf8"));
  if (marker !== -1) {
    const plus = buf.indexOf(0x2b, marker);
    if (plus !== -1) {
      let i = plus + 1;
      let len = buf[i]; i += 1;
      if (len === 0x81) { len = buf.readUInt16LE(i); i += 2; }
      else if (len === 0x82) { len = buf.readUInt32LE(i); i += 4; }
      if (len > 0 && len < 4000 && i + len <= buf.length) {
        const text = buf.slice(i, i + len).toString("utf8");
        if (/[a-z]/i.test(text)) return text;
      }
    }
  }

  // Fallback: the longest run of printable text in the blob. Cruder, but a
  // bank SMS is far longer than the class names and keys around it, so it
  // wins on length — and returning something readable beats returning null
  // and calling a real transaction "unparseable".
  const runs = buf.toString("latin1").match(/[\x20-\x7E\u00A0-\u024F]{24,}/g) || [];
  const best = runs
    .map((r) => r.replace(/^[^A-Za-z0-9₹]+/, "").trim())
    .filter((r) => /\d/.test(r) && /[a-z]/i.test(r))
    .sort((a, b) => b.length - a.length)[0];
  return best || null;
}

function buildQuery(sinceRowId) {
  const senders = BANK_SENDERS.map((b) => `upper(h.id) LIKE ${quote("%" + b + "%")}`).join(" OR ");
  const words = TXN_WORDS.map((w) => `m.text LIKE ${quote("%" + w + "%")}`).join(" OR ");
  return `
    SELECT m.ROWID,
           COALESCE(h.id,'?'),
           COALESCE(m.text,''),
           strftime('%Y-%m-%d', ${EPOCH}, 'unixepoch', 'localtime'),
           COALESCE(hex(m.attributedBody),'')
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
     WHERE m.ROWID > ${Number(sinceRowId) || 0}
       ${sinceRowId || ALL ? "" : `AND ${EPOCH} > CAST(strftime('%s','now','-${Math.max(1, Math.round(DAYS))} days') AS INTEGER)`}
       AND m.is_from_me = 0
       AND (${senders})
     ORDER BY m.ROWID ASC
     LIMIT 400;`;
  // The wording filter moved OUT of the SQL, because SQL cannot see inside
  // the blob. It is applied in JS immediately below, against bank senders
  // only — so no personal message is ever examined, which was the point of
  // having it in the query in the first place.
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
      // No parent .app at all means launchd, which has no app to inherit a
      // grant from — a case with genuinely different instructions.
      ...(!app ? [
        "  Nothing is hosting this, so it is almost certainly the scheduled job.",
        "  launchd has no application to inherit Full Disk Access from, so the",
        "  BINARY needs the grant:",
        "",
        `    ${process.execPath}`,
        "",
        "    System Settings → Privacy & Security → Full Disk Access → +",
        "    then ⌘⇧G in the file picker and paste that path.",
        "",
        "  If that path is /usr/local/bin/node, granting it gives Messages access",
        "  to every node script on this Mac. Point the job at a dedicated copy",
        "  instead and grant only that:",
        "    mkdir -p ~/.edenlabs/bin && cp \"$(which node)\" ~/.edenlabs/bin/edenlabs-node",
      ] : isAssistant ? [
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
      const [rowid, sender, text, date, blob] = line.split("\x1f");
      const body = text || decodeAttributedBody(blob) || "";
      return { rowid: Number(rowid), sender, text: body, date };
    })
      // Only messages that actually describe a transaction.
      .filter((r) => r.text && TXN_WORDS.some((w) => r.text.toLowerCase().includes(w.toLowerCase())));
  } finally {
    for (const ext of ["", "-wal", "-shm"]) { try { fs.unlinkSync(tmp + ext); } catch { /* fine */ } }
  }
}

// --- what's actually in the database ---------------------------------------
//
// When nothing comes back the question is always the same: is it the filter,
// the dates, or is forwarding simply off? This answers all three without
// sending anything or printing a single personal message.
if (process.argv.includes("--debug")) {
  const tmp = path.join(os.tmpdir(), `edenlabs-debug-${process.pid}.db`);
  try { fs.copyFileSync(DB, tmp); } catch (e) { console.error("Cannot read Messages: " + e.message); process.exit(1); }
  const q = (sql) => execFileSync("sqlite3", ["-separator", " | ", tmp, sql], { encoding: "utf8" }).trim();
  const senders = BANK_SENDERS.map((b) => `upper(h.id) LIKE ${quote("%" + b + "%")}`).join(" OR ");
  const words = TXN_WORDS.map((w) => `m.text LIKE ${quote("%" + w + "%")}`).join(" OR ");
  const D = (expr) => `strftime('%Y-%m-%d', ${expr}, 'unixepoch', 'localtime')`;

  console.log("every message on this Mac:      " + q("select count(*) from message;"));
  console.log("  newest / oldest:              " + q(`select max(${D(EPOCH)}), min(${D(EPOCH)}) from message m;`));
  console.log("from a bank sender:             " + q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where ${senders};`));
  console.log("  ...and transaction wording:   " + q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and (${words});`));
  console.log("  ...in the last 30 days:       " + q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and (${words}) and ${EPOCH} > CAST(strftime('%s','now','-30 days') AS INTEGER);`));
  // WHICH CLAUSE IS KILLING IT.
  //
  // "0 in the last 30 days" has two possible causes and the counts above
  // cannot separate them: either the dates are wrong, or recent messages use
  // wording the filter doesn't know. So take the clauses apart.
  const RECENT = `${EPOCH} > CAST(strftime('%s','now','-30 days') AS INTEGER)`;
  console.log("\nlast 30 days, clause by clause:");
  console.log("  bank sender, any wording:     " + q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and ${RECENT};`));
  console.log("  bank sender + wording:        " + q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and (${words}) and ${RECENT};`));
  console.log("  ...and not from me:           " + q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and (${words}) and ${RECENT} and m.is_from_me=0;`));
  console.log("  ...and text is not null:      " + q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and (${words}) and ${RECENT} and m.is_from_me=0 and m.text is not null;`));
  console.log("\nwhich words actually appear (last 30 days, bank senders):");
  for (const w of TXN_WORDS) {
    const n = q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and m.text LIKE ${quote("%" + w + "%")} and ${RECENT};`);
    console.log(`  ${String(w).padEnd(12)} ${n}`);
  }
  // The single most useful line: is m.text even populated? Newer macOS stores
  // some message bodies only in attributedBody, leaving text NULL.
  console.log("\nbank messages in the last 30 days with an EMPTY text column: " +
    q(`select count(*) from message m left join handle h on m.handle_id=h.ROWID where (${senders}) and ${RECENT} and (m.text is null or m.text='');`));

  console.log("\nmost recent bank senders (name and date only, no message text):");
  console.log(q(`select ${D(EPOCH)}, coalesce(h.id,'?') from message m left join handle h on m.handle_id=h.ROWID where ${senders} order by m.ROWID desc limit 12;`).split("\n").map((l) => "  " + l).join("\n"));
  console.log("\nsenders the filter does NOT recognise, that look like shortcodes:");
  console.log(q(`select coalesce(h.id,'?'), count(*) from message m left join handle h on m.handle_id=h.ROWID where NOT (${senders}) and length(coalesce(h.id,'')) between 6 and 14 and h.id not like '+%' group by 1 order by 2 desc limit 12;`).split("\n").map((l) => "  " + l).join("\n"));
  try { fs.unlinkSync(tmp); } catch { /* fine */ }
  process.exit(0);
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
