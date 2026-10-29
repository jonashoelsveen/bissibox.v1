import ICAL from "ical.js";
import { buildFeedDescription, buildFeedLocation } from "./location.ts";
import {
  FeedError,
  MAX_INSTANCES,
  MAX_ITERATIONS,
  type ParsedFeed,
  type SubscriptionEvent,
} from "./types.ts";

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zoneParts(date: Date, timeZone: string): ZoneParts {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => Number(formatted.find((part) => part.type === type)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24,
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Wall clock in `timeZone` as a UTC instant. */
export function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = wanted;
  for (let i = 0; i < 3; i += 1) {
    const parts = zoneParts(new Date(utc), timeZone);
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = seen - wanted;
    if (delta === 0) break;
    utc -= delta;
  }
  return new Date(utc);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateOnly(time: ICAL.Time): string {
  return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
}

function occurrenceStamp(time: ICAL.Time, feedZone: string | null, viewerZone: string): string {
  return time.isDate ? dateOnly(time) : timeToUtc(time, feedZone, viewerZone);
}

function occurrenceEnd(start: ICAL.Time, master: ICAL.Event): ICAL.Time {
  const end = start.clone();
  if (master.duration) end.addDuration(master.duration);
  else if (start.isDate) end.adjust(1, 0, 0, 0);
  return end;
}

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function timeToUtc(time: ICAL.Time, feedZone: string | null, viewerZone: string): string {
  const tzid = time.zone?.tzid ?? "";
  if (tzid && tzid !== "floating") return time.toJSDate().toISOString();
  const namedZone = (time as { timezone?: string }).timezone;
  const named = namedZone && namedZone !== "floating" ? namedZone : "";
  const zone = named || feedZone || viewerZone || "UTC";
  return zonedWallToUtc(time.year, time.month, time.day, time.hour, time.minute, time.second, zone).toISOString();
}

function componentOf(item: ICAL.Component | ICAL.Event): ICAL.Component {
  return item instanceof ICAL.Component ? item : item.component;
}

function statusOf(item: ICAL.Component | ICAL.Event): string {
  const value = componentOf(item).getFirstPropertyValue("status");
  return typeof value === "string" ? value.toUpperCase() : "";
}

function instanceFrom(
  item: ICAL.Component | ICAL.Event,
  calendarId: string,
  uid: string,
  recurring: boolean,
  recurrenceId: string | null,
  start: ICAL.Time,
  end: ICAL.Time,
  feedZone: string | null,
  viewerZone: string,
): SubscriptionEvent {
  const component = componentOf(item);
  const allDay = start.isDate;
  let startValue: string;
  let endValue: string;
  if (allDay) {
    startValue = dateOnly(start);
    endValue = end.isDate ? dateOnly(end) : dateOnly(start);
    if (endValue <= startValue) endValue = addDays(startValue, 1);
  } else {
    startValue = timeToUtc(start, feedZone, viewerZone);
    const hasEnd = component.getFirstProperty("dtend") || component.getFirstProperty("duration");
    endValue = hasEnd ? timeToUtc(end, feedZone, viewerZone) : startValue;
  }
  const location = buildFeedLocation(component);
  const description = buildFeedDescription(component, location?.url ?? null);
  const stamp = recurrenceId ?? startValue;
  return {
    id: `${calendarId}:${uid}:${stamp}`,
    calendarId,
    source: "subscription",
    readOnly: true,
    title: typeof component.getFirstPropertyValue("summary") === "string"
      ? String(component.getFirstPropertyValue("summary"))
      : "",
    allDay,
    start: startValue,
    end: endValue,
    location,
    description,
    recurrence: recurring ? { isRecurring: true, seriesUid: uid, recurrenceId } : null,
  };
}

function overlaps(event: SubscriptionEvent, from: Date, to: Date): boolean {
  if (event.allDay) {
    const start = new Date(`${event.start}T00:00:00Z`);
    const end = new Date(`${event.end}T00:00:00Z`);
    return start < to && end > from;
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  return start < to && end > from;
}

export function expandFeed(
  feed: ParsedFeed,
  input: {
    calendarId: string;
    from: Date;
    to: Date;
    timeZone: string;
    limit?: number;
  },
): SubscriptionEvent[] {
  const limit = input.limit ?? MAX_INSTANCES;
  const events: SubscriptionEvent[] = [];
  const rangeStart = ICAL.Time.fromJSDate(input.from, true);
  const rangeEnd = ICAL.Time.fromJSDate(input.to, true);
  for (const block of feed.blocks) {
    let calendar: ICAL.Component;
    try {
      calendar = new ICAL.Component(block as unknown[]);
    } catch {
      throw new FeedError("parse_failed");
    }
    const exceptions = new Map<string, ICAL.Event>();
    for (const vevent of calendar.getAllSubcomponents("vevent")) {
      let event: ICAL.Event;
      try {
        event = new ICAL.Event(vevent);
      } catch {
        throw new FeedError("parse_failed");
      }
      if (!event.isRecurrenceException() || !event.uid || !event.recurrenceId) continue;
      exceptions.set(
        `${event.uid}\n${occurrenceStamp(event.recurrenceId, feed.timeZone, input.timeZone)}`,
        event,
      );
    }
    for (const vevent of calendar.getAllSubcomponents("vevent")) {
      if (events.length >= limit) return events;
      let master: ICAL.Event;
      try {
        master = new ICAL.Event(vevent);
      } catch {
        throw new FeedError("parse_failed");
      }
      if (master.isRecurrenceException()) continue;
      if (!master.uid) continue;
      if (statusOf(master.component) === "CANCELLED") continue;
      const recurring = master.isRecurring();
      if (!recurring) {
        const event = instanceFrom(
          master.component,
          input.calendarId,
          master.uid,
          false,
          null,
          master.startDate,
          master.endDate,
          feed.timeZone,
          input.timeZone,
        );
        if (overlaps(event, input.from, input.to)) events.push(event);
        continue;
      }
      const iterator = master.iterator();
      let steps = 0;
      while (steps < MAX_ITERATIONS && events.length < limit) {
        steps += 1;
        let next: ICAL.Time | null;
        try {
          next = iterator.next();
        } catch {
          throw new FeedError("parse_failed");
        }
        if (!next) break;
        if (next.compare(rangeEnd) >= 0) break;
        const stamp = occurrenceStamp(next, feed.timeZone, input.timeZone);
        const exception = exceptions.get(`${master.uid}\n${stamp}`) ?? null;
        const source = exception ?? master;
        if (statusOf(source) === "CANCELLED") continue;
        const start = exception ? exception.startDate : next;
        const end = exception ? exception.endDate : occurrenceEnd(next, master);
        if (end.compare(rangeStart) <= 0) continue;
        const event = instanceFrom(
          source,
          input.calendarId,
          master.uid,
          true,
          stamp,
          start,
          end,
          feed.timeZone,
          input.timeZone,
        );
        if (overlaps(event, input.from, input.to)) events.push(event);
      }
    }
  }
  return events;
}
