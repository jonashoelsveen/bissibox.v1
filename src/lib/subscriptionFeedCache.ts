import { addDays, startOfWeekMon } from "../components/calendar/dateUtils.ts";
import { MONTH_PAN_BUFFER, MONTH_PAN_GROW } from "./monthVerticalScroll.ts";
import type { SubscriptionEvent } from "./calendarFeed/types.ts";
import { MAX_RANGE_DAYS } from "./calendarFeed/types.ts";
import { WEEK_PAN_VISIBLE_DAYS, WEEK_PAN_WEEKS } from "./weekHorizontalScroll.ts";

export type FeedRange = { from: number; to: number };

/**
 * Months kept on each side of the month under the viewport.
 * The grid mounts MONTH_PAN_BUFFER and grows by MONTH_PAN_GROW at the edge,
 * so this pad is already loaded before those weeks scroll into view.
 */
const MONTH_FETCH_PAD = MONTH_PAN_BUFFER + MONTH_PAN_GROW;

/**
 * Weeks kept on each side of the visible week.
 * The strip mounts WEEK_PAN_WEEKS and grows a week at the edge.
 */
const WEEK_FETCH_PAD_WEEKS = WEEK_PAN_WEEKS + 2;

export function feedWindow(anchor: Date, viewMode: string): { from: Date; to: Date } {
  if (viewMode === "year") {
    return {
      from: new Date(anchor.getFullYear(), 0, 1),
      to: new Date(anchor.getFullYear() + 1, 0, 1),
    };
  }
  if (viewMode === "week") {
    const start = startOfWeekMon(anchor);
    const padDays = WEEK_FETCH_PAD_WEEKS * WEEK_PAN_VISIBLE_DAYS;
    return {
      from: addDays(start, -padDays),
      to: addDays(start, WEEK_PAN_VISIBLE_DAYS + padDays),
    };
  }
  if (viewMode === "day") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    return { from: addDays(start, -1), to: addDays(start, 2) };
  }
  return {
    from: new Date(anchor.getFullYear(), anchor.getMonth() - MONTH_FETCH_PAD, 1),
    to: new Date(anchor.getFullYear(), anchor.getMonth() + MONTH_FETCH_PAD + 1, 1),
  };
}

export function feedWindowWithinLimit(anchor: Date, viewMode: string): boolean {
  const window = feedWindow(anchor, viewMode);
  return window.to.getTime() - window.from.getTime() <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
}

export function rangeCovered(ranges: FeedRange[], from: number, to: number): boolean {
  if (to <= from) return true;
  let cursor = from;
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  for (const range of sorted) {
    if (range.to <= cursor) continue;
    if (range.from > cursor) return false;
    cursor = range.to;
    if (cursor >= to) return true;
  }
  return cursor >= to;
}

/** Parts of [from, to] that are not inside an already loaded range. */
export function uncoveredRanges(ranges: FeedRange[], from: number, to: number): FeedRange[] {
  if (to <= from) return [];
  const gaps: FeedRange[] = [];
  let cursor = from;
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  for (const range of sorted) {
    if (range.to <= cursor) continue;
    if (range.from > cursor) gaps.push({ from: cursor, to: Math.min(range.from, to) });
    cursor = Math.max(cursor, range.to);
    if (cursor >= to) return gaps;
  }
  if (cursor < to) gaps.push({ from: cursor, to });
  return gaps;
}

export function mergeRanges(ranges: FeedRange[], from: number, to: number): FeedRange[] {
  if (to <= from) return ranges;
  const next = [...ranges, { from, to }].sort((a, b) => a.from - b.from);
  const merged: FeedRange[] = [];
  for (const range of next) {
    const last = merged[merged.length - 1];
    if (!last || range.from > last.to) merged.push({ from: range.from, to: range.to });
    else last.to = Math.max(last.to, range.to);
  }
  return merged;
}

type Bucket = {
  events: Map<string, SubscriptionEvent>;
  ranges: FeedRange[];
};

const buckets = new Map<string, Bucket>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeSubscriptionFeedCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSubscriptionFeedCacheVersion(): number {
  return version;
}

export function cachedSubscriptionEvents(calendarId: string): SubscriptionEvent[] {
  const bucket = buckets.get(calendarId);
  return bucket ? [...bucket.events.values()] : [];
}

/** Drop calendars that are no longer subscribed. Cached sessions for the rest stay. */
export function retainSubscriptionFeeds(ids: Iterable<string>): void {
  const keep = new Set(ids);
  let changed = false;
  for (const id of buckets.keys()) {
    if (keep.has(id)) continue;
    buckets.delete(id);
    changed = true;
  }
  if (changed) emit();
}

export function rememberSubscriptionEvents(
  calendarId: string,
  events: SubscriptionEvent[],
  from: number,
  to: number,
): void {
  const bucket = buckets.get(calendarId) ?? { events: new Map(), ranges: [] };
  for (const event of events) bucket.events.set(event.id, event);
  bucket.ranges = mergeRanges(bucket.ranges, from, to);
  buckets.set(calendarId, bucket);
}

export function resetSubscriptionFeedCache(): void {
  buckets.clear();
  inflight.clear();
  version = 0;
}

/**
 * Load any part of [from, to] that is not already cached.
 * A later scroll keeps the sessions already stored; a failed load does not clear them.
 */
export function ensureSubscriptionFeed(
  ids: string[],
  from: number,
  to: number,
  load: (id: string, from: number, to: number) => Promise<SubscriptionEvent[] | null>,
): void {
  const jobs = ids.flatMap((id) => {
    const gaps = uncoveredRanges(buckets.get(id)?.ranges ?? [], from, to);
    if (gaps.length === 0) return [];
    return [{ id, from: gaps[0]!.from, to: gaps[gaps.length - 1]!.to }];
  });
  if (jobs.length === 0) return;
  const flightKey = jobs
    .map((job) => `${job.id}:${job.from}:${job.to}`)
    .sort()
    .join("|");
  if (inflight.has(flightKey)) return;
  inflight.add(flightKey);
  void (async () => {
    try {
      const results = await Promise.all(
        jobs.map(async (job) => [job, await load(job.id, job.from, job.to)] as const),
      );
      let changed = false;
      for (const [job, events] of results) {
        if (!events) continue;
        rememberSubscriptionEvents(job.id, events, job.from, job.to);
        changed = true;
      }
      if (changed) emit();
    } finally {
      inflight.delete(flightKey);
    }
  })();
}
