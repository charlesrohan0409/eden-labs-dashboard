// Task categories — what KIND of work a task is.
//
// Deliberately orthogonal to `clientId`, which answers a different question:
// clientId is WHO the work is for (null = Eden Labs itself), category is what
// kind of work it is. Both matter independently:
//
//   "Comment on 20 posts for Acme"  → { clientId: acme, category: growth }
//   "Write Acme's carousel"         → { clientId: acme, category: delivery }
//   "File GST return"               → { clientId: null, category: admin }
//
// The tempting mistake is deriving one from the other — don't. A client task
// can be growth work, and agency work can be delivery-shaped.

export const TASK_CATEGORIES = {
  growth: {
    id: "growth",
    label: "Growth",
    // Pipeline work: outreach, prospecting, commenting, content that sells.
    tone: "sky",
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 ring-sky-600/15",
  },
  delivery: {
    id: "delivery",
    label: "Delivery",
    // The work a client is actually paying for.
    tone: "emerald",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  },
  admin: {
    id: "admin",
    label: "Admin",
    // Invoicing, taxes, tooling, everything that keeps the lights on.
    tone: "violet",
    dot: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 ring-violet-600/15",
  },
};

export const TASK_CATEGORY_LIST = Object.values(TASK_CATEGORIES);

// "" is a real, expected value — every task created before categories existed
// has one, and guessing a category for historical work would mislabel it.
export const categoryMeta = (id) => TASK_CATEGORIES[id] || null;
