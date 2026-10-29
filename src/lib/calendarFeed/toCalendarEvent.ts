import { fromISOLocal } from "@/components/calendar/dateUtils";
import { isMultiDaySession, untitledCalendarTitle } from "@/components/calendar/multiDaySessions";
import type { CalendarEvent } from "@/components/calendar/yearStore";
import type { SubscriptionEvent } from "./types.ts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function utcToLocalIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function subscriptionToCalendarEvent(event: SubscriptionEvent, color: string): CalendarEvent {
  const startISO = event.allDay ? `${event.start}T00:00:00` : utcToLocalIso(event.start);
  const endISO = event.allDay ? `${event.end}T00:00:00` : utcToLocalIso(event.end);
  const multiDay = isMultiDaySession(fromISOLocal(startISO), fromISOLocal(endISO));
  const title = event.title.trim() || untitledCalendarTitle(event.allDay || multiDay);
  return {
    id: event.id,
    startISO,
    endISO,
    allDay: event.allDay,
    title,
    color,
    description: event.description ?? undefined,
    location: event.location?.label,
    locationUrl: event.location?.url,
    userCalendarId: event.calendarId,
    followsCalendarColor: true,
  };
}
