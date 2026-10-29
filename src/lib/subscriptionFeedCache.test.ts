import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, startOfWeekMon } from "../components/calendar/dateUtils.ts";
import { MONTH_PAN_BUFFER, MONTH_PAN_GROW } from "./monthVerticalScroll.ts";
import {
  cachedSubscriptionEvents,
  feedWindow,
  feedWindowWithinLimit,
  mergeRanges,
  rangeCovered,
  rememberSubscriptionEvents,
  resetSubscriptionFeedCache,
  uncoveredRanges,
} from "./subscriptionFeedCache.ts";
import type { SubscriptionEvent } from "./calendarFeed/types.ts";
import { WEEK_PAN_VISIBLE_DAYS, WEEK_PAN_WEEKS, weekPanBufferDays, weekPanOrigin } from "./weekHorizontalScroll.ts";

function event(id: string, calendarId: string): SubscriptionEvent {
  return {
    id,
    calendarId,
    source: "subscription",
    readOnly: true,
    title: id,
    allDay: false,
    start: "2026-10-01T08:00:00.000Z",
    end: "2026-10-01T09:00:00.000Z",
    location: null,
    description: null,
    recurrence: null,
  };
}

test("month fetch covers the mounted months and the next growth", () => {
  const anchor = new Date(2026, 9, 15);
  const window = feedWindow(anchor, "month");
  const pad = MONTH_PAN_BUFFER + MONTH_PAN_GROW;
  assert.equal(window.from.getTime(), new Date(2026, 9 - pad, 1).getTime());
  assert.equal(window.to.getTime(), new Date(2026, 9 + pad + 1, 1).getTime());
  assert.equal(feedWindowWithinLimit(anchor, "month"), true);
});

test("scrolling one month still has the new mounted months already loaded", () => {
  const current = feedWindow(new Date(2026, 9, 20), "month");
  const nextMonth = 10;
  const visibleFrom = new Date(2026, nextMonth - MONTH_PAN_BUFFER, 1).getTime();
  const visibleTo = new Date(2026, nextMonth + MONTH_PAN_BUFFER + 1, 1).getTime();
  assert.equal(current.from.getTime() <= visibleFrom, true);
  assert.equal(current.to.getTime() >= visibleTo, true);
});

test("week fetch covers the horizontal strip and one growth on each side", () => {
  const anchor = new Date(2026, 9, 29);
  const window = feedWindow(anchor, "week");
  const monday = startOfWeekMon(anchor);
  const origin = weekPanOrigin(anchor);
  const end = addDays(origin, weekPanBufferDays(1));
  assert.equal(window.from.getTime() <= origin.getTime(), true);
  assert.equal(window.to.getTime() >= end.getTime(), true);
  assert.equal(
    window.from.getTime(),
    addDays(monday, -(WEEK_PAN_WEEKS + 2) * WEEK_PAN_VISIBLE_DAYS).getTime(),
  );
  assert.equal(feedWindowWithinLimit(anchor, "week"), true);
});

test("scrolling one week still has the new strip already loaded", () => {
  const anchor = new Date(2026, 9, 26);
  const current = feedWindow(anchor, "week");
  const next = addDays(startOfWeekMon(anchor), 7);
  const origin = weekPanOrigin(next);
  const end = addDays(origin, weekPanBufferDays(1));
  assert.equal(current.from.getTime() <= origin.getTime(), true);
  assert.equal(current.to.getTime() >= end.getTime(), true);
});

test("cached web-address sessions stay when a later range is loaded", () => {
  resetSubscriptionFeedCache();
  const from = new Date(2026, 8, 1).getTime();
  const mid = new Date(2026, 10, 1).getTime();
  const to = new Date(2026, 11, 1).getTime();
  rememberSubscriptionEvents("cal", [event("a", "cal")], from, mid);
  rememberSubscriptionEvents("cal", [event("b", "cal")], mid, to);
  const ids = cachedSubscriptionEvents("cal").map((item) => item.id).sort();
  assert.deepEqual(ids, ["a", "b"]);
  assert.equal(rangeCovered(mergeRanges([], from, mid), from, to), false);
  assert.equal(
    rangeCovered(mergeRanges(mergeRanges([], from, mid), mid, to), from, to),
    true,
  );
  const loaded = mergeRanges([], from, mid);
  assert.deepEqual(uncoveredRanges(loaded, from, to), [{ from: mid, to }]);
  resetSubscriptionFeedCache();
});
