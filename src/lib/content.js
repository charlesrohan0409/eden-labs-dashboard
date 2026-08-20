// Content pipeline: the columns a post moves through, and the post-type
// vocabulary the cards are built from.
//
// `status` is a free string on the post record with no validation anywhere
// (mutations.js, migrate.js and the API all pass it through), so adding a
// stage costs nothing at the data layer. What it does cost is every place
// that switches on status — keep those reading from here rather than
// hardcoding, which is how "qualified" once became an unreachable CRM stage.

// The board is adaptive. Agency content is written and shipped by one
// person, so it has no approval step. Client content does — the post goes to
// their portal and they approve or request changes, which is a real handoff
// and deserves its own column rather than being a badge you might miss.
export const AGENCY_STAGES = ["idea", "writing", "ready", "scheduled", "published"];
export const CLIENT_STAGES = ["idea", "writing", "pending_review", "ready", "scheduled", "published"];

export const stagesFor = (clientId) => (clientId ? CLIENT_STAGES : AGENCY_STAGES);

// Tailwind can only see class names it can read literally, so these are
// written out rather than composed — same reason CrmBoard's STAGE_META is.
export const STAGE_META = {
  idea: {
    label: "Ideas",
    hint: "Anything worth writing about",
    dot: "bg-stone-400",
    tone: "stone",
    head: "bg-stone-100",
    ring: "ring-stone-400/30",
    drop: "bg-stone-50",
  },
  writing: {
    label: "Writing",
    hint: "Drafting now",
    dot: "bg-sky-500",
    tone: "sky",
    head: "bg-sky-50/70",
    ring: "ring-sky-500/30",
    drop: "bg-sky-50",
  },
  pending_review: {
    label: "In review",
    hint: "With the client to approve",
    dot: "bg-amber-500",
    tone: "amber",
    head: "bg-amber-50/70",
    ring: "ring-amber-500/30",
    drop: "bg-amber-50",
  },
  ready: {
    label: "Ready",
    hint: "Approved — needs a slot",
    dot: "bg-violet-500",
    tone: "violet",
    head: "bg-violet-50/70",
    ring: "ring-violet-500/30",
    drop: "bg-violet-50",
  },
  scheduled: {
    label: "Scheduled",
    hint: "Queued to go out",
    dot: "bg-teal-500",
    tone: "teal",
    head: "bg-teal-50/70",
    ring: "ring-teal-500/30",
    drop: "bg-teal-50",
  },
  published: {
    label: "Published",
    hint: "Live on LinkedIn",
    dot: "bg-emerald-500",
    tone: "emerald",
    head: "bg-emerald-50/70",
    ring: "ring-emerald-500/30",
    drop: "bg-emerald-50",
  },
};

// "draft" predates this board and is still written by the composer's "Save
// draft" button and by a client requesting changes from their portal. It
// means the same thing "writing" does, so it maps onto that column rather
// than becoming an orphan status with nowhere to render — the exact failure
// mode that made "qualified" leads invisible on the CRM board.
export const LEGACY_POST_STATUS = { draft: "writing", approved: "ready" };

export const normalizeStatus = (status) => LEGACY_POST_STATUS[status] || status || "idea";

// Post types, with the colour each card is tinted by. Colouring by TYPE
// rather than by column is deliberate: the column is already obvious from
// where the card sits, whereas "is this a carousel or a text post" is the
// thing you actually scan a content board for.
export const POST_TYPE_META = {
  text:     { label: "Text",     accent: "text-stone-500",   chip: "bg-stone-100 text-stone-600" },
  image:    { label: "Photo",    accent: "text-sky-600",     chip: "bg-sky-50 text-sky-700" },
  carousel: { label: "Carousel", accent: "text-violet-600",  chip: "bg-violet-50 text-violet-700" },
  document: { label: "PDF",      accent: "text-violet-600",  chip: "bg-violet-50 text-violet-700" },
  video:    { label: "Video",    accent: "text-rose-600",    chip: "bg-rose-50 text-rose-700" },
  poll:     { label: "Poll",     accent: "text-amber-600",   chip: "bg-amber-50 text-amber-700" },
};

export const LINKEDIN_CHAR_LIMIT = 3000;

// The hook — LinkedIn truncates around 210 characters on desktop, so the
// first line is what actually decides whether a post gets read. It's the
// most useful thing a card can show.
export function hookOf(content) {
  const first = (content || "").split("\n").find((l) => l.trim());
  return first ? first.trim() : "";
}
