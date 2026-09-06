import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Video, Check, ChevronDown, ExternalLink, Loader2, RefreshCw, UserPlus, ListChecks,
} from "lucide-react";
import Card, { CardTitle } from "./Card";
import Badge from "./Badge";
import { listFathomMeetings } from "../../lib/fathom";

// Meetings Fathom recorded, on Charles's own side of the dashboard.
//
// Until now these only ever appeared in a CLIENT's portal — he had no view of
// his own calls at all. Meanwhile the outreach log counts "calls booked" and
// the calls array was never written to by anything, so the two halves of the
// same funnel existed and only one was tracked.
//
// Nothing is filed automatically. A recorded meeting is not necessarily a
// client call — half of these are impromptu Google Meets with only himself on
// the invite — and the same rule applies here as everywhere else in Finance:
// he decides, one press at a time.

// Domains that say nothing about who someone works for. Two people on Gmail
// have exactly as much in common as two people with telephones.
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "hotmail.com",
  "outlook.com", "live.com", "icloud.com", "me.com", "protonmail.com",
  "proton.me", "rediffmail.com", "aol.com", "zoho.com",
]);

const dayLabel = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Fathom hands the summary back as { template_name, markdown_formatted }. */
const summaryText = (m) => (typeof m.default_summary === "string"
  ? m.default_summary
  : m.default_summary?.markdown_formatted || "");

/** Everyone on the invite who isn't him. */
function others(meeting, myEmails) {
  return (meeting.calendar_invitees || [])
    .map((i) => i.email)
    .filter((e) => e && !myEmails.some((m) => e.toLowerCase() === m));
}

export default function RecordedMeetings({
  clients = [], contacts = [], calls = [], profile = {},
  onLogMeeting, onAddContact,
}) {
  const [meetings, setMeetings] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});

  const myEmails = useMemo(() => [
    profile?.email, "rohanantony29@gmail.com", "charles@theedenlabs.com",
  ].filter(Boolean).map((e) => e.toLowerCase()), [profile]);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { setMeetings(await listFathomMeetings()); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Which meetings are already filed, by Fathom's own recording id — see
  // logMeetingAsCall for why that beats matching on date and title.
  const logged = useMemo(
    () => new Set((calls || []).map((c) => c.fathomId).filter(Boolean)),
    [calls]
  );

  // Who a meeting was with.
  //
  // A company domain identifies a client; a FREE-MAIL domain identifies
  // nothing at all. Matching on the domain alone put a clarity call with
  // philliplecheminant@gmail.com down as a meeting with Merlin, whose address
  // is also @gmail.com — so for those the whole address has to match.
  const clientFor = useCallback((meeting) => {
    const guests = others(meeting, myEmails).map((e) => e.toLowerCase());
    if (!guests.length) return null;
    return clients.find((c) => {
      const email = (c.email || "").toLowerCase();
      if (!email) return false;
      if (guests.includes(email)) return true;
      const domain = email.split("@")[1];
      if (!domain || FREE_MAIL.has(domain)) return false;
      return guests.some((g) => g.split("@")[1] === domain);
    }) || null;
  }, [clients, myEmails]);

  const knownContact = useCallback(
    (email) => (contacts || []).some((c) => (c.email || "").toLowerCase() === email.toLowerCase()),
    [contacts]
  );

  if (meetings === null && busy) {
    return <Card className="p-6 text-sm text-stone-400 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Reading Fathom…</Card>;
  }
  if (error) {
    return (
      <Card className="p-5">
        <div className="text-sm text-rose-700">{error}</div>
        <button onClick={load} className="mt-2 text-[12.5px] border border-line rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 hover:border-stone-300 transition-colors">
          <RefreshCw size={12} /> Try again
        </button>
      </Card>
    );
  }

  const list = meetings || [];
  const unlogged = list.filter((m) => !logged.has(m.recording_id));

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <CardTitle sub={list.length
          ? `${unlogged.length} not yet filed as a call. Nothing is recorded until you say so — plenty of these are solo recordings, not client conversations.`
          : "Nothing recorded in Fathom yet."}>
          <span className="inline-flex items-center gap-2"><Video size={15} /> Recorded meetings</span>
        </CardTitle>
        <button onClick={load} disabled={busy}
          className="text-[12.5px] border border-line rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 hover:border-stone-300 disabled:opacity-50 transition-colors shrink-0">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
      </div>

      <div className="space-y-1">
        {list.map((m) => {
          const id = m.recording_id;
          const guests = others(m, myEmails);
          const client = clientFor(m);
          const isLogged = logged.has(id);
          const expanded = open[id];
          const actions = Array.isArray(m.action_items)
            ? m.action_items.map((a) => (typeof a === "string" ? a : a?.description || a?.text || "")).filter(Boolean)
            : [];

          return (
            <div key={id} className="border-b border-stone-100 last:border-0 py-2.5">
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{m.title || m.meeting_title || "Untitled meeting"}</span>
                    {client && <Badge tone="emerald">{client.name}</Badge>}
                    {!guests.length && <Badge tone="stone">solo recording</Badge>}
                    {isLogged && <span className="text-[11.5px] text-emerald-700 inline-flex items-center gap-1"><Check size={11} /> filed</span>}
                  </div>
                  <div className="text-[11.5px] text-stone-400 mt-0.5">
                    {dayLabel(m.scheduled_start_time || m.created_at)}
                    {guests.length ? ` · ${guests.join(", ")}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {(summaryText(m) || actions.length) && (
                    <button
                      onClick={() => setOpen((s) => ({ ...s, [id]: !s[id] }))}
                      className="text-[12px] border border-line rounded-lg px-2 py-1 inline-flex items-center gap-1 hover:border-stone-300 transition-colors"
                    >
                      <ChevronDown size={11} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
                      Summary
                    </button>
                  )}
                  {(m.share_url || m.url) && (
                    <a href={m.share_url || m.url} target="_blank" rel="noreferrer"
                      className="text-stone-300 hover:text-stone-600 p-1 transition-colors" title="Open in Fathom">
                      <ExternalLink size={13} />
                    </a>
                  )}
                  {!isLogged && guests.length > 0 && (
                    <button
                      onClick={() => onLogMeeting?.(m, { clientId: client?.id || null })}
                      className="bg-night text-white text-[12px] font-medium px-2.5 py-1 rounded-lg transition-transform active:scale-[0.97]"
                    >
                      Log as call
                    </button>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="mt-2 pl-0.5 space-y-2">
                  {summaryText(m) && (
                    <p className="text-[13px] text-stone-600 whitespace-pre-wrap leading-relaxed max-w-[70ch]">
                      {summaryText(m)}
                    </p>
                  )}
                  {actions.length > 0 && (
                    <div>
                      <div className="text-[10.5px] font-semibold text-stone-400 uppercase tracking-wide mb-1 inline-flex items-center gap-1">
                        <ListChecks size={11} /> Action items
                      </div>
                      <ul className="text-[13px] text-stone-600 list-disc pl-4 space-y-0.5">
                        {actions.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {/* Someone on a call who isn't a client and isn't in the CRM
                      is a prospect nobody wrote down. */}
                  {guests.filter((g) => !knownContact(g) && !client).length > 0 && onAddContact && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {guests.filter((g) => !knownContact(g)).map((g) => (
                        <button
                          key={g}
                          onClick={() => onAddContact({
                            name: g.split("@")[0].replace(/[._]/g, " "),
                            email: g,
                            company: g.split("@")[1] || "",
                            stage: "call booked",
                            source: "Fathom meeting",
                            notes: `From "${m.title || "a recorded meeting"}" on ${dayLabel(m.scheduled_start_time || m.created_at)}`,
                          })}
                          className="text-[11px] text-sky-900 bg-sky-50 border border-sky-100 rounded-md px-1.5 py-0.5 hover:bg-sky-100 transition-colors inline-flex items-center gap-1"
                        >
                          <UserPlus size={10} /> Add {g} to CRM
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!list.length && <p className="text-[13px] text-stone-400">Nothing to show.</p>}
      </div>
    </Card>
  );
}
