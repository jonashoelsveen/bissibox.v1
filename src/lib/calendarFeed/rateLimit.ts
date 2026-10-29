import { FeedError } from "./types.ts";

const hits = new Map<string, number[]>();

/** True when the caller is still inside the limit. */
export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export function clearRateLimits(): void {
  hits.clear();
}

export function assertRate(key: string, limit: number, windowMs: number, now = Date.now()): void {
  if (!takeToken(key, limit, windowMs, now)) throw new FeedError("rate_limited");
}
