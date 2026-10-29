import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { feedVisibleTo } from "./access.ts";
import { decryptFeedUrl, encryptFeedUrl, feedUrlHmac, normalizeFeedUrl } from "./crypto.ts";
import { FeedError } from "./types.ts";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("subscription access", () => {
  it("lets only the owner read a live subscription", () => {
    assert.equal(feedVisibleTo(USER_A, USER_A, null), true);
    assert.equal(feedVisibleTo(USER_A, USER_B, null), false);
    assert.equal(feedVisibleTo(USER_B, USER_A, null), false);
    assert.equal(feedVisibleTo(USER_A, USER_A, "2026-10-28T00:00:00Z"), false);
    assert.equal(feedVisibleTo("", USER_A, null), false);
  });

  it("does not put the feed URL in client selects or in an error", () => {
    const context = readFileSync(new URL("../../components/calendar/UserCalendarsContext.tsx", import.meta.url), "utf8");
    assert.equal(context.includes("url_ciphertext"), false);
    assert.equal(context.includes("url_hmac"), false);
    const migration = readFileSync(
      new URL("../../../supabase/migrations/20261028231943_user_calendar_subscriptions.sql", import.meta.url),
      "utf8",
    );
    assert.match(migration, /REVOKE ALL ON TABLE public\.user_calendar_subscriptions FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /REVOKE SELECT \(url_ciphertext, url_iv, url_hmac\)/);
    const error = new FeedError("forbidden_host");
    assert.equal(error.message.includes("http"), false);
  });

  it("round-trips the URL only for the same calendar and owner", () => {
    const keys = { encKey: randomBytes(32), hmacKey: randomBytes(32), keyVersion: 1 };
    const url = normalizeFeedUrl("webcal://Calendar.Example/Feed.ics#section");
    assert.equal(url, "https://calendar.example/Feed.ics");
    const sealed = encryptFeedUrl(url, USER_A, USER_A, keys);
    assert.equal(decryptFeedUrl(sealed.ciphertext, sealed.iv, USER_A, USER_A, keys.encKey), url);
    assert.throws(() => decryptFeedUrl(sealed.ciphertext, sealed.iv, USER_B, USER_A, keys.encKey));
    const hmac = feedUrlHmac(url, keys.hmacKey);
    assert.equal(hmac.equals(feedUrlHmac(url, keys.hmacKey)), true);
    assert.equal(hmac.equals(feedUrlHmac("https://calendar.example/other.ics", keys.hmacKey)), false);
  });
});
