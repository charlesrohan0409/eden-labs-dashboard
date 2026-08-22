import { useState } from "react";
import { FileDown } from "lucide-react";
import Avatar from "../ui/Avatar";
import PrimaryButton from "../ui/PrimaryButton";
import CrmBoard from "../ui/CrmBoard";
import InboundBoard from "../ui/InboundBoard";
import PillTabs from "../ui/PillTabs";
import { awaitingReply } from "../../lib/inbound";
import { downloadCSV } from "../../lib/utils";

export default function CRM({
  data, onAddContact, onUpdateStage, onUpdateContact, onDeleteContact,
  onAddInbound, onUpdateInboundStage, onToggleInboundReplied, onDeleteInbound, onConvertInbound,
}) {
  // Two boards, not one. Outbound leads you chose to chase and inbound
  // enquiries waiting on a reply are different motions with different
  // urgency — see lib/inbound.js.
  const [board, setBoard] = useState("pipeline");
  // Leads owned by the agency; leads tied to a client live in that client's portal.
  const agencyContacts = data.contacts.filter((c) => !c.clientId);
  const unreplied = awaitingReply(data.inbound).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Leads</h1>
          <p className="text-sm text-stone-500 mt-1">
            {board === "pipeline"
              ? `${agencyContacts.length} leads across your pipeline — drag a card to move it.`
              : `${data.inbound.length} enquiries — people who messaged you first.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrimaryButton
            variant="ghost"
            icon={FileDown}
            onClick={() => downloadCSV(
              "eden-labs-leads.csv",
              ["Name", "Company", "Title", "Stage", "Source", "Deal value", "Phone", "Email", "Added"],
              agencyContacts.map((c) => [c.name, c.company, c.title, c.stage, c.source, c.dealValue, c.phone, c.email, c.addedDate])
            )}
          >
            Export
          </PrimaryButton>
          <div className="flex items-center gap-2.5 bg-white border border-line rounded-full pl-3 pr-1.5 py-1.5">
            <span className="text-xs font-medium text-stone-600 hidden sm:block">Hi, Charles</span>
            <Avatar name="Charles Rohan" size={28} />
          </div>
        </div>
      </div>

      <PillTabs
        size="md"
        value={board}
        onChange={setBoard}
        options={[
          { value: "pipeline", label: "Pipeline", count: agencyContacts.length },
          { value: "inbound", label: "Inbound", count: unreplied || undefined },
        ]}
      />

      {board === "pipeline" ? (
        <CrmBoard
          contacts={agencyContacts}
          onAddContact={onAddContact}
          onUpdateStage={onUpdateStage}
          onUpdateContact={onUpdateContact}
          onDeleteContact={onDeleteContact}
        />
      ) : (
        <InboundBoard
          inbound={data.inbound}
          clients={data.clients}
          onAdd={onAddInbound}
          onUpdateStage={onUpdateInboundStage}
          onToggleReplied={onToggleInboundReplied}
          onDelete={onDeleteInbound}
          onConvert={onConvertInbound}
        />
      )}
    </div>
  );
}
