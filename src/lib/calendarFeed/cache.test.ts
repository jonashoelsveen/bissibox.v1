import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearFeedCache, isStale, readCache, resolveRefresh, singleFlight, writeCache } from "./cache.ts";
import { assertRate, clearRateLimits } from "./rateLimit.ts";
import { FeedError, type ParsedFeed } from "./types.ts";

function model(name: string): ParsedFeed {
  return { name, color: null, timeZone: null, intervalSeconds: 3600, blocks: [] };
}

function entry(name: string, fetchedAt: number) {
  return {
    model: model(name),
    fetchedAt,
    etag: "one",
    lastModified: "Mon, 01 Jan 2024 00:00:00 GMT",
    intervalSeconds: 3600,
  };
}

describe("feed cache", () => {
  it("returns a fresh hit and treats an older entry as stale", () => {
    clearFeedCache();
    const now = Date.parse("2026-10-28T12:00:00Z");
    writeCache("abc", entry("First", now));
    assert.equal(readCache("abc", now)?.model.name, "First");
    assert.equal(isStale(entry("First", now), now + 10 * 60 * 1000), false);
    assert.equal(isStale(entry("First", now), now + 3600 * 1000 + 1), true);
    assert.equal(readCache("abc", now + 8 * 24 * 60 * 60 * 1000), null);
  });

  it("keeps the previous model on 304 and replaces it on 200", () => {
    const cached = entry("First", 1_000);
    const notModified = resolveRefresh({
      cached,
      outcome: "not_modified",
      etag: "one",
      now: 5_000,
    });
    assert.equal(notModified.failed, false);
    assert.equal(notModified.entry?.model.name, "First");
    assert.equal(notModified.entry?.fetchedAt, 5_000);

    const replaced = resolveRefresh({
      cached,
      outcome: "ok",
      parsed: model("Second"),
      etag: "two",
      now: 9_000,
    });
    assert.equal(replaced.entry?.model.name, "Second");
    assert.equal(replaced.entry?.etag, "two");
  });

  it("serves the last good model when a refresh fails", () => {
    const cached = entry("First", 1_000);
    const failed = resolveRefresh({ cached, outcome: "failed", now: 9_000 });
    assert.equal(failed.failed, true);
    assert.equal(failed.entry?.model.name, "First");
    assert.equal(failed.entry?.fetchedAt, 1_000);
    const empty = resolveRefresh({ cached: null, outcome: "not_modified", now: 9_000 });
    assert.equal(empty.entry, null);
    assert.equal(empty.failed, true);
  });

  it("shares one in-flight refetch", async () => {
    clearFeedCache();
    let calls = 0;
    const task = () =>
      singleFlight("shared", async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return entry("Shared", Date.now());
      });
    const [a, b] = await Promise.all([task(), task()]);
    assert.equal(calls, 1);
    assert.equal(a.model.name, "Shared");
    assert.equal(b, a);
  });

  it("limits refresh-now to one request per minute", () => {
    clearRateLimits();
    const now = Date.parse("2026-10-28T12:00:00Z");
    assertRate("refresh:user:cal", 1, 60_000, now);
    assert.throws(() => assertRate("refresh:user:cal", 1, 60_000, now + 1_000), (error: unknown) => {
      assert.ok(error instanceof FeedError);
      assert.equal(error.code, "rate_limited");
      return true;
    });
    assert.doesNotThrow(() => assertRate("refresh:user:cal", 1, 60_000, now + 61_000));
  });
});
