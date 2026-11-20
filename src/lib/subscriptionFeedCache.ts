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

/** Enough to paint a subscription before the calendar list returns. */
export type FeedCalendarSnap = {
  id: string;
  name: string;
  color: string;
  hidden: boolean;
};

const SNAPSHOT_KEY = "calendar:feed-snapshot:v1";

const buckets = new Map<string, Bucket>();
const calendarSnaps = new Map<string, FeedCalendarSnap>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let snapshotUserId: string | null = null;
let snapshotEpoch = 0;

function canUseWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isFeedEvent(value: unknown): value is SubscriptionEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as SubscriptionEvent;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.calendarId === "string" &&
    row.source === "subscription" &&
    typeof row.title === "string" &&
    typeof row.start === "string" &&
    typeof row.end === "string"
  );
}

function isFeedRange(value: unknown): value is FeedRange {
  if (!value || typeof value !== "object") return false;
  const row = value as FeedRange;
  return typeof row.from === "number" && typeof row.to === "number" && row.to > row.from;
}

function isFeedCalendarSnap(value: unknown): value is FeedCalendarSnap {
  if (!value || typeof value !== "object") return false;
  const row = value as FeedCalendarSnap;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.name === "string" &&
    typeof row.color === "string" &&
    typeof row.hidden === "boolean"
  );
}

function persistSnapshot(): void {
  if (!canUseWindow()) return;
  try {
    if (!snapshotUserId && buckets.size === 0 && calendarSnaps.size === 0) {
      window.localStorage.removeItem(SNAPSHOT_KEY);
      return;
    }
    const payload = {
      userId: snapshotUserId,
      calendars: [...calendarSnaps.values()],
      buckets: [...buckets.entries()].map(([id, bucket]) => ({
        id,
        events: [...bucket.events.values()],
        ranges: bucket.ranges,
      })),
    };
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    /* quota — the in-memory copy still paints this visit */
  }
}

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

let clientHydrated = false;

/** Browser snapshot. The server snapshot stays empty so hydration matches. */
export function getClientSubscriptionFeedCacheVersion(): number {
  if (!clientHydrated) {
    clientHydrated = true;
    hydrateSubscriptionFeedSnapshot();
    if (snapshotUserId || buckets.size > 0 || calendarSnaps.size > 0) version += 1;
  }
  return version;
}

export function getServerSubscriptionFeedCacheVersion(): number {
  return 0;
}

export function cachedSubscriptionEvents(calendarId: string): SubscriptionEvent[] {
  const bucket = buckets.get(calendarId);
  return bucket ? [...bucket.events.values()] : [];
}

export function cachedFeedCalendars(): FeedCalendarSnap[] {
  return [...calendarSnaps.values()];
}

export function feedSnapshotUserId(): string | null {
  return snapshotUserId;
}

export function feedSnapshotBelongsTo(userId: string | null | undefined): boolean {
  return !!userId && snapshotUserId === userId;
}

/**
 * Keep the saved feed with the signed-in user.
 * A different account drops the previous snapshot before anything paints.
 */
export function bindFeedSnapshotUser(userId: string): void {
  if (snapshotUserId !== userId && (snapshotUserId || buckets.size > 0 || calendarSnaps.size > 0)) {
    snapshotEpoch += 1;
    buckets.clear();
    calendarSnaps.clear();
    inflight.clear();
    snapshotUserId = userId;
    persistSnapshot();
    emit();
    return;
  }
  if (snapshotUserId === userId) return;
  snapshotUserId = userId;
  persistSnapshot();
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
  for (const id of calendarSnaps.keys()) {
    if (keep.has(id)) continue;
    calendarSnaps.delete(id);
    changed = true;
  }
  if (!changed) return;
  persistSnapshot();
  emit();
}

export function rememberSubscriptionCalendars(userId: string, calendars: FeedCalendarSnap[]): void {
  bindFeedSnapshotUser(userId);
  if (snapshotUserId !== userId) return;
  const nextIds = new Set(calendars.map((calendar) => calendar.id));
  let changed = calendarSnaps.size !== calendars.length;
  for (const id of [...calendarSnaps.keys()]) {
    if (nextIds.has(id)) continue;
    calendarSnaps.delete(id);
    changed = true;
  }
  for (const calendar of calendars) {
    const prev = calendarSnaps.get(calendar.id);
    if (
      prev &&
      prev.name === calendar.name &&
      prev.color === calendar.color &&
      prev.hidden === calendar.hidden
    ) {
      continue;
    }
    calendarSnaps.set(calendar.id, {
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      hidden: calendar.hidden,
    });
    changed = true;
  }
  if (changed) persistSnapshot();
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
  persistSnapshot();
}

export function resetSubscriptionFeedCache(): void {
  snapshotEpoch += 1;
  buckets.clear();
  calendarSnaps.clear();
  inflight.clear();
  snapshotUserId = null;
  version = 0;
  if (!canUseWindow()) return;
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/** Replace memory from the last local snapshot. Used on startup and in tests. */
export function hydrateSubscriptionFeedSnapshot(): void {
  buckets.clear();
  calendarSnaps.clear();
  snapshotUserId = null;
  if (!canUseWindow()) return;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SNAPSHOT_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const body = parsed as {
    userId?: unknown;
    calendars?: unknown;
    buckets?: unknown;
  };
  if (typeof body.userId === "string" && body.userId) snapshotUserId = body.userId;
  if (Array.isArray(body.calendars)) {
    for (const row of body.calendars) {
      if (!isFeedCalendarSnap(row)) continue;
      calendarSnaps.set(row.id, row);
    }
  }
  if (!Array.isArray(body.buckets)) return;
  for (const row of body.buckets) {
    if (!row || typeof row !== "object") continue;
    const bucket = row as { id?: unknown; events?: unknown; ranges?: unknown };
    if (typeof bucket.id !== "string" || !bucket.id) continue;
    const events = new Map<string, SubscriptionEvent>();
    if (Array.isArray(bucket.events)) {
      for (const event of bucket.events) {
        if (!isFeedEvent(event)) continue;
        events.set(event.id, event);
      }
    }
    const ranges = Array.isArray(bucket.ranges) ? bucket.ranges.filter(isFeedRange) : [];
    if (events.size === 0 && ranges.length === 0) continue;
    buckets.set(bucket.id, { events, ranges });
  }
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
  const epoch = snapshotEpoch;
  void (async () => {
    try {
      const results = await Promise.all(
        jobs.map(async (job) => [job, await load(job.id, job.from, job.to)] as const),
      );
      if (epoch !== snapshotEpoch) return;
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
