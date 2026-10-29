type OrderedSession = {
  id: string;
  sortIndex?: number;
  startISO?: string;
};

/**
 * Web-address sessions have no stored sort index, so they would otherwise
 * share 0 and a duplicate would land after every one of them. Spacing their
 * order by this stride leaves a run of integers immediately after each one.
 */
export const IMPLICIT_SORT_STRIDE = 1024;

function storedSortIndex(event: OrderedSession): number | null {
  const value = event.sortIndex;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sortKey(event: OrderedSession): number {
  return storedSortIndex(event) ?? 0;
}

/** Stable order for sessions that have never been given a sort index. */
export function implicitSortIndexes(events: OrderedSession[]): Map<string, number> {
  const missing = events.filter((event) => storedSortIndex(event) == null);
  missing.sort((a, b) => {
    const ta = a.startISO ? Date.parse(a.startISO) : 0;
    const tb = b.startISO ? Date.parse(b.startISO) : 0;
    if (ta !== tb) {
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      return ta - tb;
    }
    return a.id.localeCompare(b.id);
  });
  const indexes = new Map<string, number>();
  missing.forEach((event, index) => {
    indexes.set(event.id, index * IMPLICIT_SORT_STRIDE);
  });
  return indexes;
}

/** Stored sort index, or the spaced index used for a web-address session. */
export function effectiveSortIndex(event: OrderedSession, implicit: Map<string, number>): number {
  return storedSortIndex(event) ?? implicit.get(event.id) ?? 0;
}

/**
 * Integer sort index for a duplicate, immediately after its source.
 * `sort_index` is a bigint, so the slot is a whole number. When the next
 * session already occupies that number, later sessions shift up by the
 * smallest amount that keeps their order.
 */
export function duplicateSortIndex(
  source: OrderedSession,
  events: OrderedSession[],
): { sortIndex: number; bumps: Array<{ id: string; sortIndex: number }> } {
  const implicit = implicitSortIndexes(events);
  const keyOf = (event: OrderedSession) => effectiveSortIndex(event, implicit);
  const sourceKey = keyOf(source);
  const after = events
    .filter((event) => event.id !== source.id)
    .filter((event) => {
      const value = keyOf(event);
      if (value > sourceKey) return true;
      if (value < sourceKey) return false;
      return event.id.localeCompare(source.id) > 0;
    })
    .sort((a, b) => keyOf(a) - keyOf(b) || a.id.localeCompare(b.id));

  const sortIndex = sourceKey + 1;
  if (after.length === 0 || keyOf(after[0]!) > sortIndex) {
    return { sortIndex, bumps: [] };
  }

  // The next integer is taken. Walk forward only until a free number, so a
  // duplicate does not rewrite every later session.
  const bumps: Array<{ id: string; sortIndex: number }> = [];
  let cursor = sortIndex;
  for (const event of after) {
    if (keyOf(event) > cursor) break;
    cursor += 1;
    bumps.push({ id: event.id, sortIndex: cursor });
  }
  return { sortIndex, bumps };
}

/** Month chips: time first, then the duplicate sits directly under its source. */
export function compareMonthDayEvents(
  a: { id: string; startISO: string; sortIndex?: number },
  b: { id: string; startISO: string; sortIndex?: number },
  implicit?: Map<string, number>,
): number {
  const byTime = Date.parse(a.startISO) - Date.parse(b.startISO);
  if (byTime !== 0) return byTime;
  const byIndex = implicit
    ? effectiveSortIndex(a, implicit) - effectiveSortIndex(b, implicit)
    : sortKey(a) - sortKey(b);
  if (byIndex !== 0) return byIndex;
  return a.id.localeCompare(b.id);
}
