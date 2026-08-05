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
    "growthLog", "channelPerf", "integrations", "calls", "outreachByChannel",
    "comments", "swipeFile", "activityLog",
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
    email: "", photoUrl: "", logoUrl: "", type: DEFAULT_CLIENT_TYPE, notes: "",
    ...c,
    contract: { value: 0, status: "active", cycle: "monthly", notes: "", serviceType: "content", startDate: "", renewalDate: "", history: [], bodyText: "", ...(c.contract || {}) },
    delivery: Array.isArray(c.delivery) ? c.delivery : [],
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
  merged.invoices = merged.invoices.map((i) => ({
    period: (i.date || "").slice(0, 7), description: "", dueDate: i.date || "", notes: "",
    ...i,
  }));

  // Tasks are newer than the first saved shape — fill in their defaults.
  merged.tasks = merged.tasks.map((t) => ({ clientId: null, dueDate: "", priority: "medium", done: false, createdAt: "", ...t }));

  return merged;
}
