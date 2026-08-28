import {
  LayoutDashboard, FileText, Send, Contact, Video, MessageSquare, ScrollText,
} from "lucide-react";

/**
 * What a client sees, derived from what they actually bought.
 *
 * Built from the client's `services` list rather than from a client TYPE,
 * because the two real combinations — content only, and content plus
 * outreach — are scopes WITHIN the LinkedIn service, not different services.
 * Modelling them as types would have meant duplicating the whole LinkedIn
 * config twice and keeping the copies in sync forever.
 *
 * The rule that matters: a tab only exists if we do that work for them. A
 * content-only client never sees an empty Outreach tab, because an empty tab
 * reads as a broken product, not as a service they didn't buy.
 */
export const PORTAL_NAV = {
  overview:    { id: "overview",    label: "Overview",  icon: LayoutDashboard, always: true },
  content:     { id: "content",     label: "Content",   icon: FileText,        service: "content" },
  outreach:    { id: "outreach",    label: "Outreach",  icon: Send,            service: "outreach" },
  crm:         { id: "crm",         label: "Leads",     icon: Contact,         service: "outreach" },
  transcripts: { id: "transcripts", label: "Meetings",  icon: Video,           always: true },
  dms:         { id: "dms",         label: "Messages",  icon: MessageSquare,   always: true },
  contract:    { id: "contract",    label: "Contract",  icon: ScrollText,      always: true },
};

const ORDER = ["overview", "content", "outreach", "crm", "transcripts", "dms", "contract"];

export function navForClient(client) {
  // Older clients predate the services field; a LinkedIn client with nothing
  // set gets the full service rather than a stripped portal, since that was
  // the only LinkedIn offering when they were created.
  const services = Array.isArray(client?.services) && client.services.length
    ? client.services
    : (client?.type === "linkedin" ? ["content", "outreach"] : []);

  return ORDER
    .map((id) => PORTAL_NAV[id])
    .filter((item) => item.always || services.includes(item.service));
}

export const hasService = (client, service) => navForClient(client).some((i) => i.service === service);
