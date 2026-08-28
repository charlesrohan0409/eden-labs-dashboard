import { useMemo, useState } from "react";
import { ChevronLeft, Eye } from "lucide-react";
import Avatar from "../ui/Avatar";
import Card from "../ui/Card";
import ClientPortal from "./ClientPortal";
import { CurrencyProvider } from "../../hooks/useCurrency";

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * "Preview client portal", for the owner.
 *
 * Previously this dropped Charles on the client PIN screen — so checking what
 * a client actually sees meant knowing (or asking for) their PIN, despite him
 * already being signed in as owner and able to read every one of those records
 * on the client detail page. Pure friction, no security gained.
 *
 * The payload is assembled here in exactly the shape api/_dataHandlers.js
 * sends a real client, INCLUDING the same field-level stripping, so the
 * preview is honest: if something is hidden from clients, it's hidden here
 * too, and Charles can trust what he's looking at.
 */
function portalShapeFor(data, clientId) {
  const c = data.clients.find((x) => x.id === clientId);
  if (!c) return null;
  return {
    profile: data.profile,
    settings: data.settings,
    // Mirrors stripClientForPortal on the server — allowlist, not a denylist.
    clients: [{
      id: c.id, name: c.name, company: c.company, photoUrl: c.photoUrl,
      logoUrl: c.logoUrl, type: c.type, services: c.services || [], delivery: c.delivery || [],
      contract: {
        value: c.contract?.value ?? 0, status: c.contract?.status || "",
        cycle: c.contract?.cycle || "", serviceType: c.contract?.serviceType || "",
        startDate: c.contract?.startDate || "", renewalDate: c.contract?.renewalDate || "",
        bodyText: c.contract?.bodyText || "", fileUrl: c.contract?.fileUrl || "",
        fileName: c.contract?.fileName || "", fileType: c.contract?.fileType || "",
      },
    }],
    posts: data.posts.filter((p) => p.clientId === clientId),
    dms: data.dms.filter((d) => d.clientId === clientId),
    calls: data.calls.filter((x) => x.clientId === clientId),
    outreachByChannel: (data.outreachByChannel || []).filter((o) => o.clientId === clientId),
    contacts: data.contacts.filter((x) => x.clientId === clientId),
    comments: (data.comments || []).filter((x) => x.clientId === clientId),
    outreachLog: (data.outreachLog || []).filter((e) => e.clientId === clientId),
    leadLists: (data.leadLists || [])
      .filter((l) => l.clientId === clientId)
      .map((l) => ({ id: l.id, name: l.name, status: l.status })),
  };
}

export default function OwnerPortalPreview({ data, actions, onExit }) {
  const clients = (data.clients || []).filter((c) => !c.hidden);
  const [clientId, setClientId] = useState(clients[0]?.id || null);
  const payload = useMemo(() => (clientId ? portalShapeFor(data, clientId) : null), [data, clientId]);

  if (!clients.length) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <Card className="p-10 text-center max-w-sm">
          <div className="text-[15px] font-semibold text-stone-900">No clients yet</div>
          <p className="text-[13px] text-stone-500 mt-1.5">
            Add a client and their portal will be previewable here.
          </p>
          <button onClick={onExit} className="text-[13px] text-emerald-800 hover:underline mt-4">
            Back to the dashboard
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Preview chrome, deliberately distinct from the portal itself so it's
          never mistaken for something the client can see. */}
      <div className="bg-stone-900 text-white px-4 md:px-8 py-2.5 flex items-center gap-3 flex-wrap">
        <button
          onClick={onExit}
          className={`text-xs text-white/70 hover:text-white flex items-center gap-1
            transition-[transform,color] duration-150 ${EASE} active:scale-[0.96]`}
        >
          <ChevronLeft size={14} /> Back to dashboard
        </button>
        <span className="flex items-center gap-1.5 text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-1">
          <Eye size={11} /> Preview — this is what the client sees
        </span>
        <div className="ml-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setClientId(c.id)}
              className={`flex items-center gap-1.5 text-xs rounded-full pl-1 pr-2.5 py-1 shrink-0
                transition-[transform,background-color,color] duration-150 ${EASE} active:scale-[0.96]
                ${c.id === clientId
                  ? "bg-white text-stone-900"
                  : "text-white/60 hover:text-white hover:bg-white/10"}`}
            >
              <Avatar name={c.name} photoUrl={c.photoUrl} logoUrl={c.logoUrl} size={18} />
              {c.company || c.name}
            </button>
          ))}
        </div>
      </div>

      {payload && (
        <CurrencyProvider currency={data.settings?.currency}>
          <ClientPortal
            key={clientId}
            data={payload}
            clientId={clientId}
            onExit={onExit}
            exitLabel="Exit preview"
            // Real owner actions — a preview that silently no-ops would be a
            // worse lie than one that works.
            onAddPost={actions.addPost}
            onUpdatePost={actions.updatePost}
            onAddContact={actions.addContact}
            onUpdateStage={actions.updateStage}
            onUpdateContact={actions.updateContact}
            onDeleteContact={actions.deleteContact}
            onAddComment={actions.addComment}
            onUpdatePostStatus={actions.updatePostStatus}
          />
        </CurrencyProvider>
      )}
    </div>
  );
}
