/**
 * dateUtils — small, timezone-safe Date helpers shared by the calendar
 * Month and Week views.
 *
 * All functions operate in **local time**. We deliberately avoid
 * `toISOString()` for storage because that converts to UTC and can shift
 * the calendar date by ±1 when the user is east/west of the meridian.
 * Stored ISO strings look like "2026-05-04T09:30:00" (no trailing Z).
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Minutes from midnight on the session's start day.
 * A "24:00" end is stored as next-day 00:00 and is returned as 1440 so
 * week/day tiles and time wheels can round-trip 00:00–24:00.
 */
export function startEndMinsOnStartDay(
  start: Date,
  end: Date,
): { startMin: number; endMin: number } {
  const startMin = start.getHours() * 60 + start.getMinutes();
  let endMin = end.getHours() * 60 + end.getMinutes();
  if (!sameDay(start, end)) {
    const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    const dayDiff = (endDay - startDay) / 86400000;
    endMin += dayDiff * 1440;
  }
  return { startMin, endMin };
}

export function setHM(d: Date, h: number, m: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Local ISO without timezone suffix — survives a round trip with no shift. */
export function toISOLocal(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  );
}

export function fromISOLocal(s: string): Date {
  // Parse manually so a missing TZ never gets re-interpreted as UTC.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return new Date(s);
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
    0,
  );
}

export function diffMinutes(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** Generate a stable-ish unique id for new events. */
export function makeEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** ISO 8601 week number (1-53). Mondays anchor the week. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Monday 00:00 local of the week containing `d` (ISO: Mon–Sun). */
export function startOfWeekMon(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
