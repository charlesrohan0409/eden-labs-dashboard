// Inbound enquiries — someone messaged YOU.
//
// Deliberately a separate collection from `contacts`, not a stage on the CRM
// board. The two are different motions: a CRM lead is someone you decided to
// pursue and can sit untouched for a week without consequence, whereas an
// inbound enquiry is a person waiting on a reply right now. Mixing them means
// the urgent ones get buried among prospects you're slowly working, which is
// exactly how inbound gets dropped.
//
// `replied` is a flag, NOT a stage. A conversation can be at any stage and
// still be waiting on you — you can have replied to someone who's only just
// enquired, and you can be mid-negotiation with someone whose last message
// you haven't answered. Collapsing those into one axis loses the thing that
// actually matters day to day.

export const INBOUND_STAGES = ["new", "conversation", "qualified", "closed"];

export const INBOUND_STAGE_META = {
  new: {
    label: "New",
    hint: "Just landed in your inbox",
    dot: "bg-sky-500", tone: "sky",
    head: "bg-sky-50/70", ring: "ring-sky-500/30", drop: "bg-sky-50",
  },
  conversation: {
    label: "In conversation",
    hint: "Talking, not yet qualified",
    dot: "bg-violet-500", tone: "violet",
    head: "bg-violet-50/70", ring: "ring-violet-500/30", drop: "bg-violet-50",
  },
  qualified: {
    label: "Qualified",
    hint: "Real fit — worth a call",
    dot: "bg-amber-500", tone: "amber",
    head: "bg-amber-50/70", ring: "ring-amber-500/30", drop: "bg-amber-50",
  },
  closed: {
    label: "Closed",
    hint: "Won, lost, or gone quiet",
    dot: "bg-stone-400", tone: "stone",
    head: "bg-stone-100", ring: "ring-stone-400/30", drop: "bg-stone-50",
  },
};

export const inboundStageMeta = (id) => INBOUND_STAGE_META[id] || INBOUND_STAGE_META.new;
export const normalizeInboundStage = (s) => (INBOUND_STAGES.includes(s) ? s : "new");

// Channels an enquiry can arrive through. LinkedIn is the one that matters
// today; the others exist so logging an email enquiry doesn't require
// pretending it came from LinkedIn.
export const INBOUND_CHANNELS = {
  linkedin: { label: "LinkedIn", chip: "bg-sky-50 text-sky-700" },
  email:    { label: "Email",    chip: "bg-violet-50 text-violet-700" },
  whatsapp: { label: "WhatsApp", chip: "bg-emerald-50 text-emerald-700" },
  other:    { label: "Other",    chip: "bg-stone-100 text-stone-600" },
};
export const INBOUND_CHANNEL_LIST = Object.entries(INBOUND_CHANNELS).map(([id, m]) => ({ id, ...m }));
export const channelMeta = (id) => INBOUND_CHANNELS[id] || INBOUND_CHANNELS.other;

/** Enquiries still waiting on a reply — what the Today panel surfaces. */
export const awaitingReply = (inbound = []) =>
  inbound.filter((e) => !e.replied && normalizeInboundStage(e.stage) !== "closed");

/** How long someone has been waiting, in whole days. */
export function waitingDays(receivedAt) {
  if (!receivedAt) return null;
  const d = new Date(String(receivedAt).slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((today - d) / 86400000));
}

export function waitLabel(receivedAt) {
  const d = waitingDays(receivedAt);
  if (d === null) return { text: "", tone: "stone" };
  if (d === 0) return { text: "Today", tone: "emerald" };
  if (d === 1) return { text: "1 day waiting", tone: "amber" };
  if (d <= 3) return { text: `${d} days waiting`, tone: "amber" };
  return { text: `${d} days waiting`, tone: "rose" };
}
