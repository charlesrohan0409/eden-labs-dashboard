import { seedData, DEFAULT_CLIENT_TYPE } from "./seed.js";
import { LEGACY_STAGE_MAP } from "../lib/utils.js";

// Saved data can predate any field added later, so every read is normalised
// against a fresh seed before the app touches it.
export function migrateData(loaded) {
  const defaults = seedData();
  const merged = { ...defaults, ...loaded };

  // Ensure every top-level collection exists and is the right type.
  [
    "clients", "contacts", "tasks", "posts", "dms", "expenses", "invoices",
    "growthLog", "outreachLog", "channelPerf", "integrations", "calls", "outreachByChannel",
    "comments", "swipeFile", "activityLog", "commentTargets",
    "accounts", "outgoings", "budgets",
  ].forEach((key) => {
    if (!Array.isArray(merged[key])) merged[key] = defaults[key];
  });

  // Ensure the Fathom integration entry exists on older saved integration lists.
  if (!merged.integrations.find((i) => i.id === "fathom")) {
    merged.integrations.push({ id: "fathom", name: "Fathom", desc: "Meeting transcripts & summaries", connected: false, apiKey: "" });
  }

  // Apollo/Lemlist/Calendly were seeded as connected:true in early builds —
  // they were never wired to a real API and that was misleading. Reset them.
  const PLACEHOLDER_IDS = new Set(["apollo", "lemlist", "calendly"]);
  merged.integrations = merged.integrations.map((i) =>
    PLACEHOLDER_IDS.has(i.id) ? { ...i, connected: false } : i
  );

  // Buffer gained a real connection test that lists channels, plus an
  // "unassigned content" default channel for posts with no client.
  merged.integrations = merged.integrations.map((i) =>
    i.id === "buffer" ? { channels: [], agencyChannelId: null, lastCheckedAt: null, ...i } : i
  );

  // The owner's own profile and display settings are newer than the first
  // saved shape — merge rather than replace so a saved photo isn't lost.
  merged.profile = { ...defaults.profile, ...(loaded?.profile || {}) };
  merged.settings = { ...defaults.settings, ...(loaded?.settings || {}) };

  // Ensure each client has the newer contract/email fields so nothing downstream reads undefined.
  // Clients saved before service lines existed are all LinkedIn work.
  merged.clients = merged.clients.map((c) => ({
    email: "", photoUrl: "", logoUrl: "", type: DEFAULT_CLIENT_TYPE, notes: "", industry: "",
    // Hiding is about decluttering the client list (an ended engagement you
    // don't want to scroll past), so it lives on the record and syncs across
    // devices — unlike the finance hide-amounts toggle, which is a
    // per-browser privacy preference in localStorage.
    hidden: false,
    ...c,
    contract: {
      value: 0, status: "active", cycle: "monthly", notes: "", serviceType: "content",
      startDate: "", renewalDate: "", history: [], bodyText: "", fileUrl: "", fileName: "", fileType: "",
      // Clients saved before billing types existed are all flat monthly
      // retainers — that was the only kind of engagement the app supported.
      billingType: "retainer", payoutMonths: null, commissionPct: null, commissionBasis: null,
      ...(c.contract || {}),
    },
    delivery: (Array.isArray(c.delivery) ? c.delivery : []).map((m) => ({
      // Delivery entries never got per-field backfilling before — a metric
      // saved before recurring cadence existed just accumulates forever,
      // same as it always has, unless the owner opts a KPI into resetting.
      cadence: "none", periodStart: "",
      ...m,
    })),
  }));

  // Ensure older contacts have deal/contact fields, and move any saved on the
  // previous five-stage pipeline onto the current one.
  merged.contacts = merged.contacts.map((c) => ({
    dealValue: 0, closedDate: null, clientId: null, phone: "", email: "", addedDate: "", photoUrl: "",
    ...c,
    stage: LEGACY_STAGE_MAP[c.stage] || c.stage || "lead",
  }));

  // Posts gained a type, media, poll, a precise publish time, and — once
  // actually pushed to Buffer — the id Buffer assigned it.
  merged.posts = merged.posts.map((p) => ({
    type: p.poll ? "poll" : p.media?.type || "text",
    media: null,
    poll: null,
    bufferPostId: null,
    // Older posts only stored a date; assume a 9am slot so they still sort.
    scheduledAt: p.status === "scheduled" && p.date ? `${p.date}T09:00` : null,
    ...p,
  }));

  // Contracts gained an explicit end record.
  merged.clients = merged.clients.map((c) => ({
    ...c,
    contract: { endedAt: null, endReason: "", ...c.contract },
  }));

  // Ensure older invoices have a billing period, and the fields the ad-hoc
  // invoice modal added (due date, a description line, free-text notes).
  //
  // currency/nativeAmount/fxRate: every pre-existing invoice was USD-only, so
  // it backfills as USD at rate 1 with nativeAmount mirroring the stored USD
  // amount. `amount` stays the USD snapshot every aggregate already sums;
  // `nativeAmount` is what the invoice document actually prints.
  merged.invoices = merged.invoices.map((i) => ({
    period: (i.date || "").slice(0, 7), description: "", dueDate: i.date || "", notes: "",
    currency: "USD", fxRate: 1, nativeAmount: Number(i.amount) || 0,
    ...i,
  }));

  // Tasks are newer than the first saved shape — fill in their defaults.
  // sortIndex seeds from array position — the one place insertion order gets
  // promoted into a real field, stable because migrate preserves order and
  // `...t` wins once a value has actually been written.
  // category defaults to "" (uncategorised) rather than a real category:
  // guessing one would silently mislabel real historical work.
  merged.tasks = merged.tasks.map((t, idx) => ({
    clientId: null, dueDate: "", priority: "medium", done: false, createdAt: "",
    recurrence: "none", periodStart: "",
    sortIndex: idx * 10, category: "", description: "",
    ...t,
  }));

  // Outreach rows gained a clientId — everything logged before this was the
  // owner's own agency outreach, so null (not a client) is the correct
  // backfill. See lib/outreach.js's forClient().
  merged.outreachLog = merged.outreachLog.map((e) => ({ clientId: null, ...e }));

  // The swipe file used to be a one-line "hook I liked" note. It's now a
  // saved-post library, so entries carry the author, their photo, the full
  // post text and a link. Old entries keep working: their `source` was the
  // author's name, so it maps straight onto `author`.
  merged.swipeFile = merged.swipeFile.map((s) => ({
    author: s.source || "", authorPhoto: "", authorUrl: "", url: "", text: "",
    savedAt: "", note: "", tag: "hook",
    ...s,
  }));

  // The commenting list (LinkedIn profiles to engage with daily) — owner-only,
  // populated from the Chrome extension or the dashboard.
  merged.commentTargets = merged.commentTargets.map((t) => ({
    name: "", profileUrl: "", photoUrl: "", headline: "", inSearch: false, addedAt: "", notes: "",
    ...t,
  }));

  // Display currency defaulted to USD back when USD was the only option, so
  // every existing save carries it whether or not it was ever chosen. This is
  // an India-based operation and INR is now the intended default, so flip it
  // exactly once, tracked by a flag so it never fights a later deliberate
  // switch back to USD. Display-only — no stored amount is touched.
  // Checked against the LOADED settings, not `merged` — merged has already
  // absorbed the seed defaults, which carry the flag, so testing merged would
  // always see it set and the flip would never fire. (It didn't, first time
  // round.) Testing what was actually saved is the only way to tell "this
  // user has been migrated" apart from "this key exists in the defaults".
  if (!loaded?.settings?.currencyDefaultApplied) {
    merged.settings = { ...merged.settings, currency: "INR", currencyDefaultApplied: true };
  }

  // Posts gained an angle (contentType), a topic, and the Buffer post id that
  // lets metrics be joined back exactly rather than by fuzzy text match.
  // All blank by default — guessing an angle for historical posts would put
  // fabricated data straight into the analytics this is meant to inform.
  merged.posts = merged.posts.map((p) => ({
    contentType: "", topic: "", bufferPostId: null,
    ...p,
  }));

  // ---- personal finance ----
  merged.accounts = merged.accounts.map((a) => ({
    name: "", type: "main", balance: 0, currency: "INR", note: "",
    // Brand mark: an uploaded image wins, otherwise a favicon is derived
    // from `website`. See components/ui/BrandMark.jsx.
    logoUrl: "", website: "",
    // Credit-card-only fields, harmless on a debit account.
    limit: 0, billDate: "", dueDate: "",
    ...a,
  }));

  merged.outgoings = merged.outgoings.map((o) => ({
    name: "", kind: "subscription", amount: 0, currency: "INR",
    logoUrl: "", website: "",
    cadence: "monthly", nextRenewal: "", accountId: null,
    category: "Software", status: "active", lastPaidDate: "", note: "",
    ...o,
  }));

  merged.budgets = merged.budgets.map((b) => ({
    category: "", limit: 0, currency: "INR", period: "monthly", note: "",
    ...b,
  }));

  // Expenses predate having a currency at all. Everything logged before this
  // was entered as USD (the only display currency that existed then), so USD
  // is the honest backfill — guessing INR would silently multiply every
  // historical expense by ~83. nativeAmount mirrors the invoice record: the
  // amount exactly as it was paid, never re-converted.
  merged.expenses = merged.expenses.map((e) => ({
    currency: "USD",
    nativeAmount: e.amount,
    ...e,
  }));

  return merged;
}
