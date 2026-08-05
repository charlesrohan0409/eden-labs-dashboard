import { Clock, Video, MapPin, Users, ExternalLink } from "lucide-react";

const timeFmt = (d) => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * One calendar event, compact enough for both the Overview mini-card and the
 * full agenda page. `dense` drops the location/attendee lines for the card
 * where space is tight.
 */
export default function MeetingRow({ event, dense = false }) {
  const joinUrl = event.conferenceUrl || (/^https?:\/\//i.test(event.location) ? event.location : null);
  const attendeeCount = (event.attendees || []).filter((a) => a.email && !a.email.includes("resource.calendar")).length;

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-stone-100 last:border-0">
      <div className="w-14 shrink-0 text-right pt-0.5">
        {event.allDay ? (
          <span className="text-[11px] font-medium text-stone-400">All day</span>
        ) : (
          <span className="text-xs font-semibold text-stone-700 tnum">{timeFmt(event.start)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-stone-800 font-medium truncate">{event.summary}</div>
        {!dense && (
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {!event.allDay && (
              <span className="flex items-center gap-1 text-[11px] text-stone-400">
                <Clock size={11} /> {timeFmt(event.start)}–{timeFmt(event.end)}
              </span>
            )}
            {event.location && !joinUrl && (
              <span className="flex items-center gap-1 text-[11px] text-stone-400 truncate max-w-[12rem]">
                <MapPin size={11} /> {event.location}
              </span>
            )}
            {attendeeCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-stone-400">
                <Users size={11} /> {attendeeCount}
              </span>
            )}
          </div>
        )}
      </div>
      {joinUrl && (
        <a
          href={joinUrl}
          target="_blank"
          rel="noreferrer"
          title="Join"
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 hover:underline mt-0.5"
        >
          <Video size={12} /> {!dense && "Join"} <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}
