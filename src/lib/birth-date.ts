/** Build a canonical `YYYY-MM-DD` birth date, or null if the parts are incomplete/invalid. */
export function formatBirthIso(year: string, month: string, day: string): string | null {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  const nowYear = new Date().getUTCFullYear();
  if (y < 1900 || y > nowYear) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Coerce DB/JSON/metadata values into padded `YYYY-MM-DD`, or null. */
export function normalizeBirthDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatBirthIso(
      String(value.getUTCFullYear()),
      String(value.getUTCMonth() + 1),
      String(value.getUTCDate()),
    );
  }
  const match = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return formatBirthIso(match[1], match[2], match[3]);
}

export function birthDateFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  return normalizeBirthDate(meta?.birth_date);
}

export function parseBirthDateParts(iso: string | null | undefined): {
  year: string;
  month: string;
  day: string;
} {
  const normalized = normalizeBirthDate(iso);
  if (!normalized) return { year: "", month: "", day: "" };
  const [year, month, day] = normalized.split("-");
  return { year: year ?? "", month: month ?? "", day: day ?? "" };
}
