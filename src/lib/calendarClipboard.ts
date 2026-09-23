import type { CalendarEvent } from "@/components/calendar/yearStore";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import {
  fromISOLocal,
  makeEventId,
  setHM,
  startOfDay,
  toISOLocal,
} from "../components/calendar/dateUtils.ts";

export type ClipboardSourceView = ViewMode;
export type ClipboardOperation = "copy" | "cut";

export type ClipboardSession = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  allDay: boolean;
  title: string;
  color: string | null;
  categoryId?: string | null;
  description?: string | null;
  location?: string | null;
  locationUrl?: string | null;
  appGroupId?: string | null;
};

export type CalendarClipboardPayload = {
  version: 1;
  calId: string;
  sourceView: ClipboardSourceView;
  operation: ClipboardOperation;
  savedAt: number;
  sessions: ClipboardSession[];
};

const STORAGE_KEY = "calendar_clipboard_v1";

/** Paste / duplicate is always a one-off, even if the source was repeating. */
export function oneOffRepeatFields() {
  return {
    repeatRule: null,
    repeatSeriesId: null,
    repeatDetached: true,
  } as const;
}

/** Word-like session clipboard lifetime (24 hours within the browser tab). */
export const CALENDAR_CLIPBOARD_TTL_MS = 24 * 60 * 60 * 1000;

function isClipboardExpired(payload: CalendarClipboardPayload): boolean {
  return Date.now() - payload.savedAt > CALENDAR_CLIPBOARD_TTL_MS;
}

function sessionFingerprint(s: ClipboardSession): string {
  return [
    s.dayOfWeek,
    s.startMinutes,
    s.endMinutes,
    s.allDay ? 1 : 0,
    s.title,
    s.color ?? "",
    s.categoryId ?? "",
    s.description ?? "",
    s.location ?? "",
    s.locationUrl ?? "",
    s.appGroupId ?? "",
  ].join("|");
}

function eventToClipboardSession(event: CalendarEvent): ClipboardSession {
  const start = fromISOLocal(event.startISO);
  const end = fromISOLocal(event.endISO);
  return {
    dayOfWeek: start.getDay(),
    startMinutes: start.getHours() * 60 + start.getMinutes(),
    endMinutes: end.getHours() * 60 + end.getMinutes(),
    allDay: event.allDay,
    title: event.title.trim(),
    color: event.color,
    categoryId: event.categoryId ?? null,
    description: event.description ?? null,
    location: event.location ?? null,
    locationUrl: event.locationUrl ?? null,
    appGroupId: event.appGroupId ?? null,
  };
}

export function serializeEventsForClipboard(events: CalendarEvent[]): ClipboardSession[] {
  const seen = new Map<string, ClipboardSession>();
  for (const event of events) {
    const session = eventToClipboardSession(event);
    const key = sessionFingerprint(session);
    if (!seen.has(key)) seen.set(key, session);
  }
  return [...seen.values()];
}

export function readCalendarClipboard(): CalendarClipboardPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CalendarClipboardPayload;
    if (parsed?.version !== 1 || !Array.isArray(parsed.sessions)) return null;
    if (isClipboardExpired(parsed)) {
      clearCalendarClipboard();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCalendarClipboard(payload: CalendarClipboardPayload): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearCalendarClipboard(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function canPasteClipboard(
  _targetView: ClipboardSourceView,
  targetCalId: string,
): boolean {
  const buffer = readCalendarClipboard();
  if (!buffer || buffer.sessions.length === 0) return false;
  return buffer.calId === targetCalId;
}

function buildEventOnDate(session: ClipboardSession, date: Date): CalendarEvent {
  const dayStart = startOfDay(date);
  const startH = Math.floor(session.startMinutes / 60);
  const startM = session.startMinutes % 60;
  const endH = Math.floor(session.endMinutes / 60);
  const endM = session.endMinutes % 60;
  const start = setHM(dayStart, startH, startM);
  const end = session.allDay ? setHM(dayStart, 23, 59) : setHM(dayStart, endH, endM);
  return {
    id: makeEventId(),
    startISO: toISOLocal(start),
    endISO: toISOLocal(end),
    allDay: session.allDay,
    title: session.title,
    color: session.color,
    categoryId: session.categoryId ?? null,
    description: session.description ?? undefined,
    location: session.location ?? undefined,
    locationUrl: session.locationUrl ?? undefined,
    appGroupId: session.appGroupId ?? null,
    ...oneOffRepeatFields(),
  };
}

export function writeEventsToClipboard(
  events: CalendarEvent[],
  calId: string,
  sourceView: ClipboardSourceView,
  operation: ClipboardOperation = "copy",
): void {
  writeCalendarClipboard({
    version: 1,
    calId,
    sourceView,
    operation,
    savedAt: Date.now(),
    sessions: serializeEventsForClipboard(events),
  });
}

export function buildPasteEventsAtDate(
  payload: CalendarClipboardPayload,
  targetDate: Date,
): CalendarEvent[] {
  return payload.sessions.map((session) => buildEventOnDate(session, targetDate));
}

const CALENDAR_DAY_END_MIN = 24 * 60;

function clipboardDurationMin(session: ClipboardSession): number {
  if (session.allDay) return 24 * 60;
  let duration = session.endMinutes - session.startMinutes;
  if (duration <= 0) duration += 24 * 60;
  return Math.max(15, duration);
}

function clampTimedPasteToDayEnd(startMin: number, durationMin: number): {
  startMinutes: number;
  endMinutes: number;
} {
  const startMinutes = Math.max(0, Math.min(startMin, CALENDAR_DAY_END_MIN));
  const endMinutes = Math.min(CALENDAR_DAY_END_MIN, startMinutes + durationMin);
  return {
    startMinutes,
    endMinutes: Math.max(endMinutes, startMinutes),
  };
}

/** Week/day paste: keep duration, but never run past the end of that day. */
export function buildPasteEventsAtDateTime(
  payload: CalendarClipboardPayload,
  targetDate: Date,
  startMin: number,
): CalendarEvent[] {
  return payload.sessions.map((session) => {
    if (session.allDay) return buildEventOnDate(session, targetDate);
    const { startMinutes, endMinutes } = clampTimedPasteToDayEnd(
      startMin,
      clipboardDurationMin(session),
    );
    return buildEventOnDate(
      {
        ...session,
        startMinutes,
        endMinutes,
      },
      targetDate,
    );
  });
}

export function copySessionSuccessMessage(title?: string | null): string {
  const label = title?.trim() || "Session";
  return `${label} was copied to the clipboard.`;
}

export function duplicateSessionSuccessMessage(title?: string | null): string {
  const label = title?.trim() || "Session";
  return `${label} was duplicated.`;
}

/** Fields for a new session cloned from an existing one (no id / repeat / coach flags). */
export function eventToDuplicatePatch(event: CalendarEvent) {
  const title = event.title.trim() || "Session";
  return {
    startISO: event.startISO,
    endISO: event.endISO,
    title,
    allDay: event.allDay,
    color: event.color,
    categoryId: event.categoryId ?? null,
    ...(event.description != null && event.description !== ""
      ? { description: event.description }
      : {}),
    ...(event.location != null && event.location !== "" ? { location: event.location } : {}),
    ...(event.locationUrl != null && event.locationUrl !== ""
      ? { locationUrl: event.locationUrl }
      : {}),
    ...(event.appGroupId != null ? { appGroupId: event.appGroupId } : {}),
    ...(event.signUpEnabled ? { signUpEnabled: true } : {}),
    ...oneOffRepeatFields(),
  };
}
