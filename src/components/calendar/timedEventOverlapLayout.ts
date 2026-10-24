/**
 * iCloud / Apple Calendar equal-column layout for overlapping timed sessions.
 *
 * Concurrent events split the day column evenly. Columns are first-fit reused
 * when two sessions in the same cluster do not actually overlap, and a session
 * stretches right into free columns so it can fill the day when nothing else
 * occupies that time. Touching endpoints do not collide.
 */

export type TimedLayoutEvent = {
  id: string;
  startMin: number;
  endMin: number;
  sortIndex?: number;
  /**
   * Prefer this overlap column while it stays free.
   * If it is blocked, use the rightmost remaining hole (or a new column).
   */
  preferCol?: number;
  /**
   * Fallback when `preferCol` is omitted: prefer a hole to the right of
   * overlapping tiles when one exists; otherwise fill a left/middle hole.
   */
  preferRight?: boolean;
};

export type TimedOverlapPlacement = {
  col: number;
  colCount: number;
  span: number;
  leftPct: number;
  widthPct: number;
};

/** Live create-preview / drop target — always packed after persisted sessions. */
export const NEWCOMER_SORT_INDEX = Number.MAX_SAFE_INTEGER;

export function overlapRecency(sortIndex: unknown): number {
  const n = typeof sortIndex === "number" ? sortIndex : Number(sortIndex);
  return Number.isFinite(n) ? n : 0;
}

/** Absolute inset for an equal-width overlap column (2px rail inset, 1px gap). */
export function timedOverlapTileBox(place: TimedOverlapPlacement): {
  left: string;
  width: string;
  right: "auto";
} {
  const { col, colCount, span } = place;
  const last = col + span >= colCount;
  return {
    left: `calc(2px + ${col} * (100% - 4px) / ${colCount})`,
    width: last
      ? `calc(${span} * (100% - 4px) / ${colCount})`
      : `calc(${span} * (100% - 4px) / ${colCount} - 1px)`,
    // Always clear a leftover `right` from the full-width drag tile.
    right: "auto",
  };
}

/** Touching endpoints (end === next start) do not collide. */
export function timedEventsOverlap(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number },
): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function sortKey(ev: TimedLayoutEvent): number {
  return overlapRecency(ev.sortIndex);
}

function clusterEvents(events: TimedLayoutEvent[]): TimedLayoutEvent[][] {
  const n = events.length;
  if (n === 0) return [];
  const parent = events.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[a] = b;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (timedEventsOverlap(events[i], events[j])) union(i, j);
    }
  }
  const groups = new Map<number, TimedLayoutEvent[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(events[i]);
    else groups.set(root, [events[i]]);
  }
  return [...groups.values()];
}

function columnBlocked(
  col: TimedLayoutEvent[],
  ev: TimedLayoutEvent,
): boolean {
  return col.some((other) => timedEventsOverlap(ev, other));
}

function firstFreeColumn(
  ev: TimedLayoutEvent,
  cols: TimedLayoutEvent[][],
  from: number,
  to: number,
): number | null {
  for (let i = from; i < to; i++) {
    if (!columnBlocked(cols[i], ev)) return i;
  }
  return null;
}

function lastFreeColumn(
  ev: TimedLayoutEvent,
  cols: TimedLayoutEvent[][],
): number | null {
  for (let i = cols.length - 1; i >= 0; i--) {
    if (!columnBlocked(cols[i], ev)) return i;
  }
  return null;
}

/** Map a 0–1 X position in the day column to an overlap lane. */
export function overlapColumnAtX(colCount: number, fraction: number): number {
  const n = Math.max(1, colCount);
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return Math.min(n - 1, Math.floor(f * n));
}

export function maxOverlapColCount(
  layout: Map<string, TimedOverlapPlacement>,
): number {
  let max = 1;
  for (const place of layout.values()) max = Math.max(max, place.colCount);
  return max;
}

/**
 * Default: first-fit from the left.
 * `preferCol`: stay in that lane while free; otherwise the rightmost hole.
 * `preferRight`: right hole if one exists, else left/middle, else a new column.
 */
function assignColumn(ev: TimedLayoutEvent, cols: TimedLayoutEvent[][]): number {
  if (ev.preferCol != null) {
    const want = ev.preferCol;
    if (want >= 0 && want < cols.length && !columnBlocked(cols[want], ev)) {
      return want;
    }
    return lastFreeColumn(ev, cols) ?? cols.length;
  }
  if (ev.preferRight) {
    let rightOfOverlap = 0;
    for (let i = 0; i < cols.length; i++) {
      if (columnBlocked(cols[i], ev)) rightOfOverlap = i + 1;
    }
    return (
      firstFreeColumn(ev, cols, rightOfOverlap, cols.length) ??
      firstFreeColumn(ev, cols, 0, rightOfOverlap) ??
      cols.length
    );
  }
  return firstFreeColumn(ev, cols, 0, cols.length) ?? cols.length;
}

function placeCluster(cluster: TimedLayoutEvent[]): Map<string, TimedOverlapPlacement> {
  const out = new Map<string, TimedOverlapPlacement>();
  if (cluster.length === 1) {
    out.set(cluster[0].id, { col: 0, colCount: 1, span: 1, leftPct: 0, widthPct: 1 });
    return out;
  }

  // Oldest first so a newly dropped / created session lands to the right of
  // sessions it actually overlaps, matching the live drop placeholder.
  // First-fit checks real overlap (not last-end) so a session that starts
  // above a busy stretch can still reuse a column that is free in its range —
  // the same packing that already worked when creating from below.
  const sorted = [...cluster].sort(
    (a, b) => sortKey(a) - sortKey(b) || a.startMin - b.startMin || a.id.localeCompare(b.id),
  );

  const cols: TimedLayoutEvent[][] = [];
  const colOf = new Map<string, number>();
  for (const ev of sorted) {
    const col = assignColumn(ev, cols);
    while (cols.length <= col) cols.push([]);
    cols[col].push(ev);
    colOf.set(ev.id, col);
  }

  const colCount = Math.max(1, cols.length);

  for (const ev of sorted) {
    const placedCol = colOf.get(ev.id)!;
    const fillFree = ev.preferCol != null || !!ev.preferRight;
    let col = placedCol;
    let span = 1;
    if (fillFree) {
      let start = placedCol;
      let end = placedCol;
      while (start > 0 && !columnBlocked(cols[start - 1], ev)) start--;
      while (end + 1 < colCount && !columnBlocked(cols[end + 1], ev)) end++;
      col = start;
      span = end - start + 1;
    } else {
      for (let c = placedCol + 1; c < colCount; c++) {
        if (columnBlocked(cols[c], ev)) break;
        span++;
      }
    }
    out.set(ev.id, {
      col,
      colCount,
      span,
      leftPct: col / colCount,
      widthPct: span / colCount,
    });
  }
  return out;
}

/** Per-column placements. Solo events fill the column; overlaps split equally. */
export function layoutTimedOverlaps(
  events: TimedLayoutEvent[],
): Map<string, TimedOverlapPlacement> {
  const out = new Map<string, TimedOverlapPlacement>();
  if (events.length === 0) return out;
  for (const cluster of clusterEvents(events)) {
    for (const [id, place] of placeCluster(cluster)) out.set(id, place);
  }
  return out;
}
