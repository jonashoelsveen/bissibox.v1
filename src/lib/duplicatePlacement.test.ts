import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutTimedOverlaps } from "../components/calendar/timedEventOverlapLayout.ts";
import {
  compareMonthDayEvents,
  duplicateSortIndex,
  effectiveSortIndex,
  implicitSortIndexes,
} from "./duplicatePlacement.ts";

const day = "2026-10-29T09:00:00";
const later = "2026-10-29T11:00:00";

test("a duplicate sorts directly under its source in month view", () => {
  const source = { id: "b", startISO: day, sortIndex: 2 };
  const others = [
    { id: "a", startISO: day, sortIndex: 1 },
    { id: "c", startISO: day, sortIndex: 4 },
    { id: "later", startISO: later, sortIndex: 0 },
  ];
  const place = duplicateSortIndex(source, [source, ...others]);
  const copy = { id: "b-copy", startISO: day, sortIndex: place.sortIndex };
  const ordered = [source, ...others, copy].slice().sort(compareMonthDayEvents);
  assert.deepEqual(
    ordered.map((event) => event.id),
    ["a", "b", "b-copy", "c", "later"],
  );
});

test("a duplicate is the overlap column just to the right of its source", () => {
  const source = { id: "b", sortIndex: 2 };
  const events = [
    { id: "a", sortIndex: 1 },
    source,
    { id: "c", sortIndex: 4 },
  ];
  const place = duplicateSortIndex(source, events);
  const layout = layoutTimedOverlaps([
    { id: "a", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 1 },
    { id: "b", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 2 },
    { id: "b-copy", startMin: 9 * 60, endMin: 10 * 60, sortIndex: place.sortIndex },
    { id: "c", startMin: 9 * 60, endMin: 10 * 60, sortIndex: 4 },
  ]);
  assert.equal(layout.get("a")?.col, 0);
  assert.equal(layout.get("b")?.col, 1);
  assert.equal(layout.get("b-copy")?.col, 2);
  assert.equal(layout.get("c")?.col, 3);
});

test("a web address duplicate sits just right of its source, not after every other web address session", () => {
  const origin = { id: "feed-b", startISO: day };
  const peers = [
    { id: "feed-a", startISO: day },
    origin,
    { id: "feed-c", startISO: day },
    { id: "local", startISO: day, sortIndex: 1_700_000_000_000 },
  ];
  const place = duplicateSortIndex(origin, peers);
  const implicit = implicitSortIndexes(peers);
  const layout = layoutTimedOverlaps(
    peers.map((event) => ({
      id: event.id,
      startMin: 9 * 60,
      endMin: 10 * 60,
      sortIndex: effectiveSortIndex(event, implicit),
    })).concat({
      id: "feed-b-copy",
      startMin: 9 * 60,
      endMin: 10 * 60,
      sortIndex: place.sortIndex,
    }),
  );
  const originCol = layout.get("feed-b")?.col ?? -1;
  assert.equal(layout.get("feed-b-copy")?.col, originCol + 1);
  assert.ok((layout.get("feed-c")?.col ?? 0) > originCol + 1);
  assert.ok((layout.get("local")?.col ?? 0) > originCol + 1);
  const ordered = [...peers, { id: "feed-b-copy", startISO: day, sortIndex: place.sortIndex }].sort(
    (a, b) => compareMonthDayEvents(a, b, implicit),
  );
  assert.deepEqual(
    ordered.map((event) => event.id),
    ["feed-a", "feed-b", "feed-b-copy", "feed-c", "local"],
  );
});

test("consecutive sort indexes shift so the duplicate still sits immediately after the source", () => {
  const source = { id: "b", sortIndex: 2 };
  const events = [
    { id: "a", sortIndex: 1 },
    source,
    { id: "c", sortIndex: 3 },
    { id: "d", sortIndex: 8 },
  ];
  const place = duplicateSortIndex(source, events);
  assert.equal(place.sortIndex, 3);
  assert.deepEqual(place.bumps, [{ id: "c", sortIndex: 4 }]);
});
