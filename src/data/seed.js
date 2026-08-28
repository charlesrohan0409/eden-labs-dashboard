import { computeCommissionTotal, commissionInstallment } from "../lib/utils.js";
import { periodStartFor } from "../lib/recurrence.js";
import { DEFAULT_EXPENSE_CATEGORIES } from "../lib/finance.js";

// ---------- Client types ----------
// Each service line gets its own delivery-metric template and its own set of
// dashboard tabs, because what "on track" means for a book edit has nothing to
// do with what it means for a LinkedIn retainer.
export const CLIENT_TYPES = {
  linkedin: {
    id: "linkedin",
    label: "LinkedIn growth",
    blurb: "Content, outreach, and pipeline — the original Eden Labs service",
    // Tabs shown on the owner's Client Detail page and in the client portal.
    tabs: ["overview", "content", "dms", "contract", "activity", "report"],
    portalTabs: ["overview", "content", "outreach", "crm", "transcripts", "dms", "contract"],
    // Calls booked leads — it's the metric that actually indicates the
    // retainer is working. Target is a placeholder; the KPI editor on the
    // client page lets it be set per client, since that's owner judgment,
    // not a one-size-fits-all number.
    defaultDelivery: [
      { metric: "Calls booked", target: 4, current: 0 },
      // Content is the one deliverable that's explicitly cadence-based (5x
      // a week, resetting every week) rather than an ongoing cumulative
      // count — matches how this actually gets tracked in practice.
      { metric: "Posts per week", target: 5, current: 0, cadence: "weekly" },
    ],
  },
  book: {
    id: "book",
    label: "Book editing",
    blurb: "Manuscript editing — chapters, rounds, and a delivery deadline",
    tabs: ["overview", "dms", "contract", "activity", "report"],
    portalTabs: ["overview", "transcripts", "dms", "contract"],
    defaultDelivery: [
      { metric: "Chapters edited", target: 12, current: 0 },
      { metric: "Editing rounds done", target: 2, current: 0 },
    ],
  },
  app: {
    id: "app",
    label: "App / web build",
    blurb: "Building apps and web apps — milestones and shipped features",
    tabs: ["overview", "dms", "contract", "activity", "report"],
    portalTabs: ["overview", "transcripts", "dms", "contract"],
    defaultDelivery: [
      { metric: "Milestones shipped", target: 4, current: 0 },
      { metric: "Open bugs", target: 0, current: 0, direction: "lower" },
    ],
  },
};

export const DEFAULT_CLIENT_TYPE = "linkedin";

// ---------- Industries ----------
// A flat list rather than a per-client-type map — the industry a client
// operates in (finance, healthcare, etc.) is independent of which Eden Labs
// service line they're on.
export const INDUSTRIES = [
  "SaaS / Software", "Finance & Fintech", "Healthcare", "E-commerce & Retail",
  "Real Estate", "Consulting", "Marketing & Advertising", "Education",
  "Legal", "Manufacturing", "Media & Entertainment", "Nonprofit", "Other",
];

// ---------- Contract template ----------
const SERVICE_LINES = {
  content: "- LinkedIn content strategy, writing, and scheduling (up to 4 posts/week)",
  content_outreach:
    "- LinkedIn content strategy, writing, and scheduling (up to 4 posts/week)\n- Outbound outreach and DM management to qualified prospects",
  full:
    "- LinkedIn content strategy, writing, and scheduling (up to 4 posts/week)\n- Outbound outreach and DM management to qualified prospects\n- CRM tracking and monthly pipeline reporting",
};

// Keyed by billingType, same convention as SERVICE_LINES above — a plain
// string per key won't do here since the clause needs the actual deal
// numbers interpolated in, so these are functions instead.
const FEE_CLAUSES = {
  retainer: ({ value, cycle }) =>
    `Client agrees to pay Agency $${value}/${cycle === "monthly" ? "month" : cycle} for the services described above, due on the 1st of each billing cycle.`,
  oneTime: ({ value }) =>
    `Client agrees to pay Agency a one-time flat fee of $${value} for the services described above, due upon completion of the engagement.`,
  commission: ({ value, payoutMonths, commissionPct, commissionBasis }) =>
    `Client agrees to pay Agency a commission of ${commissionPct}% of $${commissionBasis} (totalling $${value}), payable in ${payoutMonths} equal monthly installments of $${commissionInstallment(value, payoutMonths).toFixed(2)}.`,
};
const TERM_CLAUSES = {
  retainer: ({ startDate, cycle }) =>
    `This agreement begins on ${startDate || "the effective date above"} and continues on a ${cycle} basis until terminated by either party.`,
  oneTime: ({ startDate }) =>
    `This agreement begins on ${startDate || "the effective date above"} and concludes upon delivery of the services and final payment of the fee described above.`,
  commission: ({ startDate, payoutMonths }) =>
    `This agreement begins on ${startDate || "the effective date above"} and concludes once all ${payoutMonths} commission installments have been paid.`,
};

export function buildContractTemplate({
  name, company, email, value, cycle = "monthly", serviceType = "content", startDate,
  billingType = "retainer", payoutMonths, commissionPct, commissionBasis,
}) {
  const clauseArgs = { value, cycle, startDate, payoutMonths, commissionPct, commissionBasis };
  return `SERVICE AGREEMENT

Between: Eden Labs ("Agency")
And: ${name}, ${company} ("Client")
Client contact: ${email || "—"}

Effective date: ${startDate || "—"}

1. SCOPE OF SERVICES
Agency will provide the following services to Client:
${SERVICE_LINES[serviceType] || SERVICE_LINES.content}

2. FEES
${(FEE_CLAUSES[billingType] || FEE_CLAUSES.retainer)(clauseArgs)}

3. TERM
${(TERM_CLAUSES[billingType] || TERM_CLAUSES.retainer)(clauseArgs)}

4. TERMINATION
Either party may terminate this agreement with 30 days' written notice.

5. CONFIDENTIALITY
Both parties agree to keep confidential all non-public information shared during the engagement.

6. OWNERSHIP
All content created under this agreement becomes the property of Client upon full payment, with Agency retaining the right to reference the work in its own portfolio unless otherwise agreed.

Agreed:

_____________________          _____________________
Eden Labs                       ${name}, ${company}`;
}

export function buildNewClient(c) {
  const type = c.type || DEFAULT_CLIENT_TYPE;
  const billingType = c.billingType || "retainer";
  // A commission deal's total is derived from the % and basis the owner
  // actually agreed to, not hand-typed — see computeCommissionTotal's own
  // comment. Retainer/one-time just use whatever flat number was entered.
  const payoutMonths = billingType === "commission" ? Number(c.payoutMonths) || 0 : null;
  const commissionPct = billingType === "commission" ? Number(c.commissionPct) || 0 : null;
  const commissionBasis = billingType === "commission" ? Number(c.commissionBasis) || 0 : null;
  const value = billingType === "commission"
    ? computeCommissionTotal(commissionPct, commissionBasis)
    : Number(c.value) || 0;
  return {
    id: Date.now().toString(),
    name: c.name,
    company: c.company || "—",
    email: c.email || "",
    photoUrl: c.photoUrl || "",
    logoUrl: c.logoUrl || "",
    status: "active",
    type,
    industry: c.industry || "",
    hidden: false,
    pin: Math.floor(1000 + Math.random() * 9000).toString(),
    contract: {
      value, status: "active", cycle: "monthly", notes: "",
      serviceType: c.serviceType || "content", startDate: c.startDate || "",
      billingType, payoutMonths, commissionPct, commissionBasis,
      bodyText: buildContractTemplate({
        name: c.name, company: c.company || "—", email: c.email, value,
        cycle: "monthly", serviceType: c.serviceType || "content", startDate: c.startDate,
        billingType, payoutMonths, commissionPct, commissionBasis,
      }),
    },
    // Each service line starts with metrics that actually mean something for
    // that kind of work — a book edit has no "posts per week". Cadenced
    // metrics (e.g. "Posts per week") get a real periodStart now, rather
    // than waiting for the next load's applyRecurringResets to compute one.
    delivery: (CLIENT_TYPES[type] || CLIENT_TYPES[DEFAULT_CLIENT_TYPE]).defaultDelivery.map((d) => ({
      cadence: "none",
      ...d,
      periodStart: periodStartFor(d.cadence || "none"),
    })),
  };
}

/**
 * Welcome email with the client's portal link and PIN.
 *
 * This used to be leftover artifact code that POSTed to api.anthropic.com from
 * the browser with a Gmail MCP server attached — which only ever worked inside
 * claude.ai and threw "Failed to fetch" here. It now goes through the same
 * Resend proxy as invoices.
 *
 * Returns { sent, error } rather than a bare boolean so the caller can tell
 * "Resend isn't configured yet" apart from "the send genuinely failed".
 */
export async function sendOnboardingEmail(client) {
  if (!client.email) return { sent: false, error: "No email address on file." };

  // Computed from the current origin (not stored on the client) so it's
  // always a real, working link — see lib/utils.js's portalLinkFor.
  const link = `${window.location.origin}/portal/${client.id}`;

  const text = `Hi ${client.name},

Welcome aboard! Your Eden Labs client dashboard is ready.

Dashboard link: ${link}
Your PIN: ${client.pin}

Use these to log in and track your work with us in real time.

Looking forward to working together.

— Eden Labs`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917;line-height:1.6;max-width:520px">
  <p>Hi ${client.name},</p>
  <p>Welcome aboard! Your Eden Labs client dashboard is ready.</p>
  <div style="background:#f4f3f0;border:1px solid #e7e4de;border-radius:12px;padding:16px;margin:20px 0">
    <div style="font-size:12px;color:#78716c">Dashboard link</div>
    <div style="font-weight:600;margin-bottom:10px"><a href="${link}" style="color:#166534">${link}</a></div>
    <div style="font-size:12px;color:#78716c">Your PIN</div>
    <div style="font-weight:600;font-size:20px;letter-spacing:2px">${client.pin}</div>
  </div>
  <p>Use these to log in and track your work with us in real time.</p>
  <p>Looking forward to working together.<br/>— Eden Labs</p>
</div>`;

  try {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: client.email,
        subject: "Welcome to Eden Labs — your client dashboard",
        text,
        html,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) return { sent: false, error: json.error || `Send failed (${res.status})` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e.message };
  }
}

// ---------- Seed data ----------
export const seedData = () => ({
  // The owner's own identity — used as the author on agency posts and in the
  // dashboard header, rather than the hardcoded "Eden Labs" string this used
  // to scatter across components.
  profile: {
    name: "Charles Rohan",
    headline: "LinkedIn content & client acquisition for fractional CFOs",
    photoUrl: "",
    company: "Eden Labs",
  },
  // Display currency. Rates are fetched live and cached in `fx`.
  // INR is the default: this is an India-based operation, so rupees are the
  // currency most numbers here are actually thought about in. Client billing
  // is still per-invoice (see the invoice record's own `currency`) — this
  // setting only controls what the dashboard DISPLAYS.
  settings: { currency: "INR", currencyDefaultApplied: true },
  clients: [
    {
      id: "c1", name: "Chris Alman", company: "Equip CFO", status: "active", type: "linkedin",
      pin: "4821", link: "elabs.app/c/eq-cfo-9f3", email: "chris@equipcfo.com", photoUrl: "", logoUrl: "", notes: "",
      contract: {
        value: 3500, status: "active", cycle: "monthly", notes: "Performance-based, 90-day pilot.",
        serviceType: "full", startDate: "2026-06-01", renewalDate: "2026-09-01", history: [],
        bodyText: buildContractTemplate({ name: "Chris Alman", company: "Equip CFO", email: "chris@equipcfo.com", value: 3500, cycle: "monthly", serviceType: "full", startDate: "2026-06-01" }),
      },
      delivery: [
        { metric: "Posts per week", target: 4, current: 4 },
        { metric: "DM response time (hrs)", target: 12, current: 9 },
      ],
    },
    {
      id: "c2", name: "Alexandre Chemaly", company: "Leadbolt", status: "active", type: "linkedin",
      pin: "1190", link: "elabs.app/c/leadbolt-2c1", email: "alexandre@leadbolt.com", photoUrl: "", logoUrl: "", notes: "",
      contract: {
        value: 2800, status: "active", cycle: "monthly", notes: "Content + inbound systems.",
        serviceType: "content_outreach", startDate: "2026-05-15", renewalDate: "2026-08-15", history: [],
        bodyText: buildContractTemplate({ name: "Alexandre Chemaly", company: "Leadbolt", email: "alexandre@leadbolt.com", value: 2800, cycle: "monthly", serviceType: "content_outreach", startDate: "2026-05-15" }),
      },
      delivery: [
        { metric: "Posts per week", target: 3, current: 2 },
        { metric: "Content approval rate", target: 100, current: 85 },
      ],
    },
    {
      id: "c3", name: "Merlin Manrold", company: "Independent", status: "at-risk", type: "linkedin",
      pin: "7734", link: "elabs.app/c/merlin-a01", email: "merlin@example.com", photoUrl: "", logoUrl: "", notes: "",
      contract: {
        value: 1200, status: "active", cycle: "monthly", notes: "Ghostwriting outreach coaching.",
        serviceType: "content", startDate: "2026-07-01", renewalDate: "2026-10-01", history: [],
        bodyText: buildContractTemplate({ name: "Merlin Manrold", company: "Independent", email: "merlin@example.com", value: 1200, cycle: "monthly", serviceType: "content", startDate: "2026-07-01" }),
      },
      delivery: [{ metric: "Outreach sent / wk", target: 20, current: 11 }],
    },
  ],
  contacts: [
    { id: "k1", name: "Sarah Whitfield", company: "Meridian CFO Partners", title: "Founder", stage: "proposal_sent", source: "Apollo", clientId: null, dealValue: 3200, closedDate: null, phone: "603 555-0123", email: "sarah@meridiancfo.com", addedDate: "2026-07-15" },
    { id: "k2", name: "Daniel Osei", company: "Northbridge Advisory", title: "Managing Partner", stage: "lead", source: "Sales Nav", clientId: null, dealValue: 2400, closedDate: null, phone: "239 555-0108", email: "daniel@northbridge.com", addedDate: "2026-07-18" },
    { id: "k3", name: "Priya Raman", company: "Ledger & Co", title: "CFO", stage: "lead", source: "extension", clientId: null, dealValue: 1800, closedDate: null, phone: "808 555-0111", email: "priya@ledgerco.com", addedDate: "2026-07-22" },
    { id: "k4", name: "Tom Reyes", company: "Vantage Fractional", title: "Founder", stage: "call_booked", source: "Lemlist", clientId: null, dealValue: 2000, closedDate: null, phone: "217 555-0113", email: "tom@vantagefractional.com", addedDate: "2026-07-25" },
    { id: "k5", name: "Wren Castellan", company: "Aster Fractional CFO", title: "Partner", stage: "closed", source: "manual", clientId: "c1", dealValue: 4200, closedDate: "2026-07-30", phone: "907 555-0101", email: "wren@asterfcfo.com", addedDate: "2026-07-10" },
    { id: "k6", name: "Marcus Vale", company: "Halden Partners", title: "Director", stage: "lead", source: "Sales Nav", clientId: null, dealValue: 2600, closedDate: null, phone: "405 555-0128", email: "marcus@haldenpartners.com", addedDate: "2026-07-28" },
    { id: "k7", name: "Elena Fischer", company: "Brightline CFO", title: "Founder", stage: "lead", source: "Apollo", clientId: null, dealValue: 3000, closedDate: null, phone: "629 555-0129", email: "elena@brightlinecfo.com", addedDate: "2026-08-01" },
  ],
  // Owner to-do list. clientId === null means an internal / agency task.
  tasks: [
    { id: "t1", title: "Send Equip CFO the July performance recap", clientId: "c1", dueDate: "2026-08-05", priority: "high", done: false, createdAt: "2026-08-01" },
    { id: "t2", title: "Chase Leadbolt on the August invoice", clientId: "c2", dueDate: "2026-08-03", priority: "high", done: false, createdAt: "2026-07-30" },
    { id: "t3", title: "Draft 4 posts for Merlin's next batch", clientId: "c3", dueDate: "2026-08-08", priority: "medium", done: false, createdAt: "2026-08-02" },
    { id: "t4", title: "Rewrite the agency landing page hero", clientId: null, dueDate: "2026-08-14", priority: "low", done: false, createdAt: "2026-07-29" },
    { id: "t5", title: "Book Q3 check-in call with Chris", clientId: "c1", dueDate: "2026-08-11", priority: "medium", done: false, createdAt: "2026-08-03" },
    { id: "t6", title: "Renew Apollo seat", clientId: null, dueDate: "2026-08-01", priority: "medium", done: true, createdAt: "2026-07-20" },
  ],
  posts: [
    { id: "p1", clientId: null, type: "text", content: "Most fractional CFOs lose deals not on price, but on silence.\n\nThe deal goes quiet. You wait. You tell yourself you're being respectful.\n\nThree weeks later you find out they signed with someone who followed up on day four.\n\nHere's the fix: book the next step before the current call ends. Every time. No exceptions.", status: "published", date: "2026-07-28" },
    { id: "p2", clientId: "c1", type: "text", content: "3 numbers every CFO client should see in week one:\n\n1. Cash runway in weeks, not months — months hide the cliff\n2. Gross margin by product line, not blended\n3. Collections ageing past 60 days\n\nIf you can't produce these in week one, you're not ready to advise them.", status: "scheduled", date: "2026-08-06", scheduledAt: "2026-08-06T09:30" },
    { id: "p3", clientId: "c1", type: "text", content: "Why fractional CFOs should stop pitching hours and start pitching outcomes.\n\nNobody wakes up wanting 20 hours of finance work. They want to stop worrying about payroll.\n\nSell the second thing.", status: "published", date: "2026-07-14", stats: { likes: 84, comments: 12, reposts: 6, views: 3400 } },
    { id: "p4", clientId: "c1", type: "text", content: "The 3 numbers I check before taking on a new CFO client.\n\nIf any one of them is missing, I pass — not because the business is bad, but because they're not ready to be helped yet.", status: "published", date: "2026-07-21", stats: { likes: 61, comments: 8, reposts: 3, views: 2650 } },
    { id: "p5", clientId: "c2", type: "text", content: "Lubricant buyers don't want specs. They want uptime.\n\nWe rewrote every line of the pitch around downtime cost. Same product. 3x the reply rate.", status: "published", date: "2026-07-18", stats: { likes: 47, comments: 5, reposts: 2, views: 1900 } },
    {
      id: "p6", clientId: "c1", type: "poll",
      content: "Curious where everyone lands on this — you've just closed a new client. What's the very first thing you build for them?",
      status: "pending_review", date: "2026-08-08", scheduledAt: "2026-08-08T08:00",
      poll: {
        question: "First deliverable for a new CFO client?",
        options: [
          { text: "13-week cash forecast", votes: 0 },
          { text: "Monthly close checklist", votes: 0 },
          { text: "KPI dashboard", votes: 0 },
        ],
        durationDays: 7,
      },
    },
    {
      id: "p7", clientId: "c1", type: "text",
      content: "The exact framework I use to spot a CFO client who's about to churn.\n\nIt's never the invoice. It's the reply time on Slack.\n\nWhen a client goes from answering in minutes to answering in days, you have about six weeks.",
      status: "pending_review", date: "2026-08-07", scheduledAt: "2026-08-07T10:15",
    },
  ],
  dms: [
    { id: "d1", clientId: "c1", direction: "sent", content: "Sent connection note to 4 CFO founders re: Q3 hiring signals.", date: "2026-08-02" },
    { id: "d2", clientId: "c2", direction: "received", content: "Client asked for tone to be more direct, less corporate.", date: "2026-08-01" },
  ],
  expenses: [
    { id: "e1", category: "Software", vendor: "Buffer", amount: 120, date: "2026-06-01" },
    { id: "e2", category: "Software", vendor: "Apollo", amount: 149, date: "2026-06-05" },
    { id: "e3", category: "Software", vendor: "Lemlist", amount: 99, date: "2026-07-01" },
    { id: "e4", category: "Contractor", vendor: "Freelance editor", amount: 400, date: "2026-07-10" },
  ],
  invoices: [
    { id: "i1", clientId: "c1", amount: 3500, status: "paid", date: "2026-06-01", period: "2026-06" },
    { id: "i2", clientId: "c2", amount: 2800, status: "paid", date: "2026-06-01", period: "2026-06" },
    { id: "i3", clientId: "c3", amount: 1200, status: "paid", date: "2026-06-01", period: "2026-06" },
    { id: "i4", clientId: "c1", amount: 3500, status: "paid", date: "2026-07-01", period: "2026-07" },
    { id: "i5", clientId: "c2", amount: 2800, status: "pending", date: "2026-08-01", period: "2026-08" },
    { id: "i6", clientId: "c3", amount: 1200, status: "overdue", date: "2026-07-01", period: "2026-07" },
  ],
  // Real numbers only — nothing here is tracked automatically yet (there's
  // no pipeline that rolls posts/DMs/calls up into a monthly log), so every
  // month starts at zero rather than shipping with a fake demo trend. Log
  // actual months via the Growth page as they happen.
  // Day-by-day LinkedIn + email outreach funnel — see lib/outreach.js for the
  // stage definitions and the chart/aggregation helpers built on top of this.
  outreachLog: [],
  // Same story — this claims to be "sourced from CRM contact attribution"
  // but nothing computes it from data.contacts yet, so it shipped as a
  // static, fake breakdown. Empty until that's wired up for real.
  channelPerf: [],
  calls: [
    { id: "cl1", clientId: "c1", direction: "inbound", date: "2026-07-20", notes: "Discovery call — referral from existing client" },
    { id: "cl2", clientId: "c1", direction: "outbound", date: "2026-07-25", notes: "Follow-up call after LinkedIn DM thread" },
    { id: "cl3", clientId: "c2", direction: "inbound", date: "2026-07-22", notes: "Inbound from gated content download" },
  ],
  outreachByChannel: [
    { id: "o1", clientId: "c1", channel: "LinkedIn organic", count: 40 },
    { id: "o2", clientId: "c1", channel: "Apollo", count: 25 },
    { id: "o3", clientId: "c1", channel: "Referral", count: 6 },
    { id: "o4", clientId: "c2", channel: "Apollo", count: 18 },
    { id: "o5", clientId: "c2", channel: "Lemlist", count: 22 },
  ],
  comments: [
    { id: "cm1", clientId: "c1", tab: "content", author: "Client", text: "Love the tone on the last post — more like this please.", date: "2026-07-29 10:14" },
  ],
  // Saved posts from other creators — the swipe library. `text` holds the
  // full post, so it can be read back without leaving the dashboard.
  swipeFile: [
    { id: "s1", author: "Justin Welsh", authorPhoto: "", authorUrl: "", url: "", text: "", note: "Contrarian opener + 3-point list structure", tag: "hook", savedAt: "" },
    { id: "s2", author: "Alex Hormozi", authorPhoto: "", authorUrl: "", url: "", text: "", note: "Cost-of-inaction framing before the offer", tag: "structure", savedAt: "" },
  ],
  // LinkedIn profiles to comment on daily. Owner-only — this is the owner's
  // own engagement routine, not a client deliverable. `inSearch` tracks which
  // ones are already in the saved LinkedIn search being worked through.
  commentTargets: [],
  // ---- personal finance ----
  // Bank/credit accounts shown in the balance bar. Balances are entered by
  // hand and stored in the account's OWN currency — a ₹ account stores
  // rupees, not converted dollars, so the number never drifts as FX moves.
  // (Same lesson the invoice record learned; see lib/currency.js.)
  // Seeded empty: fake balances in a personal-finance view are worse than
  // none, since there's no way to tell them apart from real ones at a glance.
  accounts: [],
  // Subscriptions and fixed bills — one collection, distinguished by `kind`.
  // Nothing here charges itself; `nextRenewal` is a reminder and "Mark paid"
  // is what actually books the expense. See lib/finance.js for why.
  outgoings: [],
  // Spending limits per expense category, checked against `expenses`.
  budgets: [],
  // The category vocabulary shared by expenses, budgets and recurring items.
  // Owner-editable — see lib/finance.js.
  expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
  // Chronological record of money events — see lib/finance.js. Derived data
  // could reconstruct most of this, but not WHEN you recorded something or
  // that a budget was breached at a moment now buried under later spending.
  financeLog: [],
  // Inbound enquiries: people who messaged first. Separate from `contacts`
  // on purpose — see lib/inbound.js.
  inbound: [],
  // Outreach campaigns and DM templates — see lib/outreach.js for why these
  // are records rather than free-text fields on each log entry.
  leadLists: [],
  scripts: [],
  commentLog: [],
  swipeFolders: [],
  // Activity log — chronological record of key events per client.
  // Shape is Supabase-ready: each entry maps cleanly to a row.
  // clientId === null means an agency-level event (e.g. new expense).
  activityLog: [],
  integrations: [
    { id: "buffer", name: "Buffer", desc: "Post scheduling & analytics per client", connected: true },
    { id: "apollo", name: "Apollo.io", desc: "Prospect data & outreach sequences", connected: false },
    { id: "lemlist", name: "Lemlist", desc: "Cold email sequences", connected: false },
    { id: "calendly", name: "Calendly", desc: "Booked calls sync to Calls page", connected: false },
    { id: "fathom", name: "Fathom", desc: "Meeting transcripts & summaries", connected: false, apiKey: "" },
  ],
});
