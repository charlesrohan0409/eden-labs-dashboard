// Minimal iCalendar (RFC 5545) reader — enough for a Google Calendar feed.
//
// Deliberately not a full implementation: it handles the parts a calendar view
// actually needs (timed and all-day events, timezones, and the common
// recurrence rules) and ignores the rest rather than pretending to support it.

// Long lines are folded with CRLF + a single space or tab.
function unfold(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

// "DTSTART;TZID=Asia/Kolkata:20260805T100000" -> {name, params, value}
function parseLine(line) {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = left.split(";");
  const params = {};
  paramParts.forEach((p) => {
    const eq = p.indexOf("=");
    if (eq > -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  });
  return { name: name.toUpperCase(), params, value };
}

// How far a zone is from UTC at a given instant, in ms.
function tzOffsetAt(utcMs, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const map = {};
    dtf.formatToParts(new Date(utcMs)).forEach((p) => { map[p.type] = p.value; });
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
    return asUTC - utcMs;
  } catch {
    return 0; // Unknown zone — treat as UTC rather than throwing the feed away.
  }
}

// A wall-clock time in `timeZone` -> the real UTC instant.
function zonedToUtc(y, mo, d, h, mi, s, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // One correction pass is enough except within a DST transition hour.
  return new Date(guess - tzOffsetAt(guess, timeZone));
}

function parseDateValue(value, params) {
  const isDateOnly = params.VALUE === "DATE" || /^\d{8}$/.test(value);
  if (isDateOnly) {
    const y = +value.slice(0, 4), mo = +value.slice(4, 6), d = +value.slice(6, 8);
    return { date: new Date(Date.UTC(y, mo - 1, d)), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  if (params.TZID) return { date: zonedToUtc(+y, +mo, +d, +h, +mi, +s, params.TZID), allDay: false };
  // Floating time — interpret in the server's zone, the best available guess.
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

const DAY_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRRule(value) {
  const out = {};
  value.split(";").forEach((part) => {
    const [k, v] = part.split("=");
    out[k.toUpperCase()] = v;
  });
  return {
    freq: out.FREQ,
    interval: Math.max(1, parseInt(out.INTERVAL || "1", 10)),
    count: out.COUNT ? parseInt(out.COUNT, 10) : null,
    until: out.UNTIL ? parseDateValue(out.UNTIL, {})?.date : null,
    byDay: out.BYDAY ? out.BYDAY.split(",").map((d) => d.replace(/^[-+]?\d+/, "")) : null,
  };
}

/**
 * Expand a recurring event into concrete occurrences inside [start, end].
 * Bounded on both iterations and results so a malformed rule can't hang.
 */
function expandRecurrence(event, rule, windowStart, windowEnd, exdates) {
  const out = [];
  const durationMs = event.end - event.start;
  const stopAt = rule.until && rule.until < windowEnd ? rule.until : windowEnd;
  let cursor = new Date(event.start);
  let emitted = 0;

  for (let i = 0; i < 2000; i++) {
    if (cursor > stopAt) break;
    if (rule.count && emitted >= rule.count) break;

    let occurrences = [new Date(cursor)];

    // Weekly rules can name several weekdays per interval.
    if (rule.freq === "WEEKLY" && rule.byDay?.length) {
      const weekStart = new Date(cursor);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      occurrences = rule.byDay
        .map((d) => DAY_INDEX[d])
        .filter((n) => n !== undefined)
        .map((n) => {
          const o = new Date(weekStart);
          o.setUTCDate(weekStart.getUTCDate() + n);
          o.setUTCHours(cursor.getUTCHours(), cursor.getUTCMinutes(), cursor.getUTCSeconds(), 0);
          return o;
        });
    }

    for (const occ of occurrences) {
      if (occ < event.start) continue;
      if (occ > stopAt) continue;
      if (rule.count && emitted >= rule.count) break;
      emitted++;
      if (occ >= windowStart && !exdates.has(occ.getTime())) {
        out.push({ ...event, start: occ, end: new Date(occ.getTime() + durationMs), recurring: true });
      }
      if (out.length > 200) return out;
    }

    if (rule.freq === "DAILY") cursor.setUTCDate(cursor.getUTCDate() + rule.interval);
    else if (rule.freq === "WEEKLY") cursor.setUTCDate(cursor.getUTCDate() + 7 * rule.interval);
    else if (rule.freq === "MONTHLY") cursor.setUTCMonth(cursor.getUTCMonth() + rule.interval);
    else if (rule.freq === "YEARLY") cursor.setUTCFullYear(cursor.getUTCFullYear() + rule.interval);
    else break; // Unsupported frequency — emit the first occurrence only.
  }
  return out;
}

const unescape = (s = "") =>
  s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

export function parseICS(text, { windowStart, windowEnd }) {
  const lines = unfold(text).split(/\r?\n/);
  const events = [];
  let current = null;
  let rrule = null;
  let exdates = new Set();

  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (raw === "BEGIN:VEVENT") { current = {}; rrule = null; exdates = new Set(); continue; }

    if (raw === "END:VEVENT") {
      if (current?.start) {
        const base = {
          uid: current.uid || `${current.start?.getTime()}-${current.summary || ""}`,
          summary: current.summary || "(no title)",
          description: current.description || "",
          location: current.location || "",
          start: current.start,
          end: current.end || new Date(current.start.getTime() + 3600000),
          allDay: !!current.allDay,
          attendees: current.attendees || [],
          organizer: current.organizer || "",
          status: current.status || "",
          conferenceUrl: current.conferenceUrl || "",
          recurring: false,
        };
        if (rrule) {
          events.push(...expandRecurrence(base, rrule, windowStart, windowEnd, exdates));
        } else if (base.end >= windowStart && base.start <= windowEnd) {
          events.push(base);
        }
      }
      current = null;
      continue;
    }

    if (!current) continue;
    const line = parseLine(raw);
    if (!line) continue;

    switch (line.name) {
      case "UID": current.uid = line.value; break;
      case "SUMMARY": current.summary = unescape(line.value); break;
      case "DESCRIPTION": {
        current.description = unescape(line.value);
        // Google puts Meet links in the description when there's no CONFERENCE prop.
        const meet = current.description.match(/https:\/\/meet\.google\.com\/[a-z-]+/i);
        if (meet && !current.conferenceUrl) current.conferenceUrl = meet[0];
        break;
      }
      case "LOCATION": {
        current.location = unescape(line.value);
        if (/^https?:\/\//i.test(current.location) && !current.conferenceUrl) {
          current.conferenceUrl = current.location;
        }
        break;
      }
      case "STATUS": current.status = line.value; break;
      case "ORGANIZER": current.organizer = (line.params.CN || line.value || "").replace(/^mailto:/i, ""); break;
      case "ATTENDEE": {
        current.attendees = current.attendees || [];
        current.attendees.push({
          name: line.params.CN || (line.value || "").replace(/^mailto:/i, ""),
          email: (line.value || "").replace(/^mailto:/i, ""),
          status: line.params.PARTSTAT || "",
        });
        break;
      }
      case "DTSTART": {
        const p = parseDateValue(line.value, line.params);
        if (p) { current.start = p.date; current.allDay = p.allDay; }
        break;
      }
      case "DTEND": {
        const p = parseDateValue(line.value, line.params);
        if (p) current.end = p.date;
        break;
      }
      case "RRULE": rrule = parseRRule(line.value); break;
      case "EXDATE": {
        line.value.split(",").forEach((v) => {
          const p = parseDateValue(v, line.params);
          if (p) exdates.add(p.date.getTime());
        });
        break;
      }
      default: break;
    }
  }

  return events
    .filter((e) => e.status !== "CANCELLED")
    .sort((a, b) => a.start - b.start)
    .slice(0, 500)
    .map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() }));
}
