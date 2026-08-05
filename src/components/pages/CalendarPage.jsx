import { useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import Card from "../ui/Card";
import PillTabs from "../ui/PillTabs";
import PrimaryButton from "../ui/PrimaryButton";
import MeetingRow from "../ui/MeetingRow";
import { useGoogleCalendar } from "../../hooks/useGoogleCalendar";

const RANGES = [
  { value: "recent", label: "Recent", past: true },
  { value: "7",      label: "This week", days: 7 },
  { value: "31",     label: "This month", days: 31 },
  { value: "all",    label: "All upcoming", days: null },
];

export default function CalendarPage() {
  const [range, setRange] = useState("recent");
  const { loading, error, byDay, byDayPast, upcoming, past, fetchedAt, refresh } = useGoogleCalendar();

  const cfg = RANGES.find((r) => r.value === range);

  const groups = useMemo(() => {
    if (cfg.past) {
      // Recent — last 90 days of past meetings, newest first.
      return byDayPast;
    }
    if (!cfg.days) return byDay;
    const cutoff = Date.now() + cfg.days * 86400000;
    return byDay
      .map((g) => ({ ...g, events: g.events.filter((e) => new Date(e.start).getTime() <= cutoff) }))
      .filter((g) => g.events.length > 0);
  }, [byDay, byDayPast, cfg]);

  // When the chosen range is empty, suggest the most useful alternative.
  const suggestion = useMemo(() => {
    if (groups.length > 0) return null;
    if (cfg.past && upcoming.length > 0) return "all"; // has future events
    if (!cfg.past && past.length > 0) return "recent"; // only past events exist
    return null;
  }, [groups.length, cfg.past, upcoming.length, past.length]);

  const isNotConfigured = error?.includes("not set on the server");

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Calendar</h1>
          <p className="text-sm text-stone-500 mt-1">
            {fetchedAt
              ? `Synced ${new Date(fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "Your real Google Calendar, read-only"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PillTabs value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
          <PrimaryButton variant="ghost" icon={loading ? Loader2 : RefreshCw} onClick={refresh} disabled={loading}>
            {loading ? "Syncing…" : "Refresh"}
          </PrimaryButton>
        </div>
      </div>

      {error ? (
        <Card className="p-10 text-center">
          <div className="w-11 h-11 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto">
            <CalendarDays size={18} className="text-stone-400" />
          </div>
          <div className="text-[15px] font-semibold text-stone-800 mt-4">
            {isNotConfigured ? "Calendar isn't connected" : "Couldn't load your calendar"}
          </div>
          <div className="text-sm text-stone-500 mt-1 max-w-md mx-auto flex items-start gap-1.5 text-left justify-center">
            {!isNotConfigured && <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-500" />}
            <span>{error}</span>
          </div>
          {isNotConfigured && (
            <div className="text-xs text-stone-400 mt-3 max-w-sm mx-auto">
              Google Calendar → Settings → your calendar → "Secret address in iCal format". Paste it into
              GOOGLE_CALENDAR_ICAL_URL in .env.local and restart the dev server.
            </div>
          )}
        </Card>
      ) : loading && upcoming.length === 0 && past.length === 0 ? (
        <Card className="p-16 text-center text-sm text-stone-400">
          <Loader2 size={20} className="animate-spin mx-auto mb-3" />
          Loading your calendar…
        </Card>
      ) : groups.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-[15px] font-semibold text-stone-800">Nothing here</div>
          <div className="text-sm text-stone-500 mt-1">
            {suggestion
              ? <>No events in this range — try{" "}
                  <button
                    onClick={() => setRange(suggestion)}
                    className="text-emerald-700 font-medium hover:underline"
                  >
                    {RANGES.find(r => r.value === suggestion)?.label}
                  </button>
                </>
              : "Nothing scheduled for this period."}
          </div>
        </Card>
      ) : (
        <>
          {cfg.past && (
            <div className="text-xs text-stone-400 text-right">
              Showing past meetings from the last 90 days, newest first.
            </div>
          )}
          <div className="space-y-4">
            {groups.map((g) => (
              <Card key={g.key} className="p-5">
                <div className="text-[13px] font-semibold text-stone-700 mb-1">{g.label}</div>
                <div>
                  {g.events.map((e) => <MeetingRow key={e.uid + e.start} event={e} />)}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
