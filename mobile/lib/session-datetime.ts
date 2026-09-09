/**
 * Calendar session datetime helpers — must match desktop `yearStore` convention:
 * wall-clock digits are stored with a trailing `Z` (not converted to UTC).
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock → DB (`2026-06-29T09:00:00Z` means 09:00 local). */
export function sessionTimeToDb(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`
  );
}

/** DB → local Date (ignores timezone suffix; preserves wall-clock). */
export function sessionTimeFromDb(s: string): Date {
  const cleaned = s.replace(/(Z|[+-]\d{2}:?\d{2})$/i, "").slice(0, 19);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(cleaned);
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

export function sessionDateKeyFromDb(s: string): string {
  const d = sessionTimeFromDb(s);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
