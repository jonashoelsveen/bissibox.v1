import type { ParsedFeed } from "./types.ts";

export type CacheEntry = {
  model: ParsedFeed;
  fetchedAt: number;
  etag: string | null;
  lastModified: string | null;
  intervalSeconds: number;
};

const PHYSICAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

export function readCache(key: string, now = Date.now()): CacheEntry | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (now > entry.fetchedAt + PHYSICAL_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function writeCache(key: string, entry: CacheEntry): void {
  store.set(key, entry);
}

export function isStale(entry: CacheEntry, now = Date.now()): boolean {
  return now > entry.fetchedAt + entry.intervalSeconds * 1000;
}

export function bumpFetchedAt(key: string, now = Date.now()): CacheEntry | null {
  const entry = store.get(key);
  if (!entry) return null;
  const next = { ...entry, fetchedAt: now };
  store.set(key, next);
  return next;
}

/** Concurrent refetches of one feed share one promise. */
export function singleFlight(key: string, task: () => Promise<CacheEntry>): Promise<CacheEntry> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = task().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

export function clearFeedCache(): void {
  store.clear();
  inflight.clear();
}

/**
 * A 304 is only useful while the previous body is cached.
 * A failed refresh keeps that body. A successful 200 replaces it.
 */
export function resolveRefresh(input: {
  cached: CacheEntry | null;
  outcome: "not_modified" | "ok" | "failed";
  parsed?: ParsedFeed | null;
  etag?: string | null;
  lastModified?: string | null;
  now?: number;
}): { entry: CacheEntry | null; failed: boolean } {
  const now = input.now ?? Date.now();
  if (input.outcome === "not_modified") {
    if (!input.cached) return { entry: null, failed: true };
    return {
      failed: false,
      entry: {
        ...input.cached,
        fetchedAt: now,
        etag: input.etag ?? input.cached.etag,
        lastModified: input.lastModified ?? input.cached.lastModified,
      },
    };
  }
  if (input.outcome === "ok" && input.parsed) {
    return {
      failed: false,
      entry: {
        model: input.parsed,
        fetchedAt: now,
        etag: input.etag ?? null,
        lastModified: input.lastModified ?? null,
        intervalSeconds: input.parsed.intervalSeconds,
      },
    };
  }
  return { entry: input.cached, failed: true };
}
