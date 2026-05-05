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

/**
 * Normalize imported datetimes into a local ISO string while preserving the
 * literal clock time from the source. If the input includes a timezone suffix
 * like Z or +02:00, we intentionally ignore that offset because imported file
 * times should land exactly as written in the document.
 */
export function normalizeImportedLocalISO(value: string): string | null {
  const trimmed = value.trim();
  const literal = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(trimmed);
  if (literal) {
    return `${literal[1]}-${literal[2]}-${literal[3]}T${literal[4]}:${literal[5]}:${literal[6] ?? "00"}`;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? toISOLocal(parsed) : null;
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
