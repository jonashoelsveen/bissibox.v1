import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anchorDateForVisibleDays,
  miniMonthAnchorForSpan,
  snapScrollLeft,
  nextWeekOriginScroll,
  visibleDayRange,
  visibleWeekSpan,
  weekMountCovers,
  weekMountWindow,
  weekPanWheelDelta,
  weekPanWheelShouldStep,
  weekRenderRange,
  wheelDeltaPixels,
} from "./weekHorizontalScroll.ts";

const day = (y: number, m: number, d: number) => new Date(y, m, d);

describe("visibleDayRange", () => {
  const width = 100;
  const view = 700;

  it("shows seven days when snapped to a boundary", () => {
    assert.deepEqual(visibleDayRange(0, view, width, 84), { start: 0, end: 6 });
    assert.deepEqual(visibleDayRange(300, view, width, 84), { start: 3, end: 9 });
  });

  it("keeps a day that is only partly in view", () => {
    const range = visibleDayRange(40, view, width, 84);
    assert.equal(range.start, 0);
    assert.equal(range.end, 7);
  });
});

describe("visibleWeekSpan", () => {
  it("stays on seven days and advances at the halfway point", () => {
    assert.deepEqual(visibleWeekSpan(0, 100, 84), { start: 0, end: 6 });
    assert.deepEqual(visibleWeekSpan(40, 100, 84), { start: 0, end: 6 });
    assert.deepEqual(visibleWeekSpan(50, 100, 84), { start: 1, end: 7 });
    assert.deepEqual(visibleWeekSpan(300, 100, 84), { start: 3, end: 9 });
  });

  it("keeps seven days at the end of the buffer", () => {
    assert.deepEqual(visibleWeekSpan(10_000, 100, 20), { start: 13, end: 19 });
  });
});

describe("miniMonthAnchorForSpan", () => {
  it("stays on the month that can show the whole span", () => {
    const october = miniMonthAnchorForSpan(day(2026, 9, 19), day(2026, 9, 25));
    assert.equal(october.getFullYear(), 2026);
    assert.equal(october.getMonth(), 9);

    // Wed 28 Oct – Tue 3 Nov does not fit on October's grid (it ends 1 Nov).
    const november = miniMonthAnchorForSpan(day(2026, 9, 28), day(2026, 10, 3));
    assert.equal(november.getFullYear(), 2026);
    assert.equal(november.getMonth(), 10);
  });
});

describe("anchorDateForVisibleDays", () => {
  it("keeps the week and month while one of their days remains", () => {
    const prev = day(2026, 9, 18); // Sun 18 Oct, week 42
    const visible = [
      day(2026, 9, 18),
      day(2026, 9, 19),
      day(2026, 9, 20),
      day(2026, 9, 21),
      day(2026, 9, 22),
      day(2026, 9, 23),
      day(2026, 9, 24),
    ];
    assert.equal(anchorDateForVisibleDays(prev, visible).getTime(), prev.getTime());
  });

  it("moves to the new week once the previous week has left", () => {
    const prev = day(2026, 9, 18);
    const visible = [
      day(2026, 9, 19),
      day(2026, 9, 20),
      day(2026, 9, 21),
      day(2026, 9, 22),
      day(2026, 9, 23),
      day(2026, 9, 24),
      day(2026, 9, 25),
    ];
    const next = anchorDateForVisibleDays(prev, visible);
    assert.equal(next.getDate(), 19);
    assert.equal(next.getMonth(), 9);
  });

  it("keeps October while one October day of a straddling week remains", () => {
    const prev = day(2026, 9, 26); // Mon 26 Oct, week 44
    const visible = [
      day(2026, 9, 31),
      day(2026, 10, 1),
      day(2026, 10, 2),
      day(2026, 10, 3),
      day(2026, 10, 4),
      day(2026, 10, 5),
      day(2026, 10, 6),
    ];
    const next = anchorDateForVisibleDays(prev, visible);
    assert.equal(next.getTime(), prev.getTime());
  });

  it("switches the month when no day of it remains, and keeps the week", () => {
    const prev = day(2026, 9, 31); // Sat 31 Oct, week 44
    const visible = [
      day(2026, 10, 1),
      day(2026, 10, 2),
      day(2026, 10, 3),
      day(2026, 10, 4),
      day(2026, 10, 5),
      day(2026, 10, 6),
      day(2026, 10, 7),
    ];
    const next = anchorDateForVisibleDays(prev, visible);
    assert.equal(next.getFullYear(), 2026);
    assert.equal(next.getMonth(), 10);
    assert.equal(next.getDate(), 1);
  });
});

describe("weekRenderRange", () => {
  it("keeps a margin of days around the viewport", () => {
    assert.deepEqual(weekRenderRange(42, 48, 91, 5), { start: 37, end: 53 });
  });

  it("clamps to the buffer", () => {
    assert.deepEqual(weekRenderRange(0, 6, 91, 5), { start: 0, end: 11 });
    assert.deepEqual(weekRenderRange(84, 90, 91, 5), { start: 79, end: 90 });
  });
});

describe("wheelDeltaPixels", () => {
  it("scales line and page deltas into pixels", () => {
    assert.equal(wheelDeltaPixels(12, 0), 12);
    assert.equal(wheelDeltaPixels(2, 1), 32);
    assert.equal(wheelDeltaPixels(1, 2), 800);
  });
});

describe("weekMountCovers", () => {
  it("stays mounted while the viewport is inside the slack band", () => {
    assert.equal(weekMountCovers(42, 48, 37, 53), true);
    assert.equal(weekMountCovers(39, 45, 37, 53), true);
    assert.equal(weekMountCovers(38, 44, 37, 53), false);
    assert.equal(weekMountCovers(46, 52, 37, 53), false);
  });
});

describe("weekMountWindow", () => {
  it("extends only in the pan direction", () => {
    assert.deepEqual(weekMountWindow(42, 48, 91, 1, 10), { start: 42, end: 58 });
    assert.deepEqual(weekMountWindow(42, 48, 91, -1, 10), { start: 32, end: 48 });
    assert.deepEqual(weekMountWindow(0, 6, 91, -1, 10), { start: 0, end: 6 });
  });
});

describe("nextWeekOriginScroll", () => {
  const day = 100;
  const week = day * 7;
  const max = week * 4;

  it("steps to the closest Monday in the drag direction, then one week at a time", () => {
    assert.equal(nextWeekOriginScroll(day, 1, day, max), week);
    assert.equal(nextWeekOriginScroll(week, 1, day, max), week * 2);
    assert.equal(nextWeekOriginScroll(week + 40, -1, day, max), week);
    assert.equal(nextWeekOriginScroll(week, -1, day, max), 0);
    assert.equal(nextWeekOriginScroll(0, -1, day, max), null);
    assert.equal(nextWeekOriginScroll(max, 1, day, max), null);
  });
});

describe("weekPanWheelShouldStep", () => {
  it("steps an isolated mouse notch and leaves a trackpad burst alone", () => {
    assert.equal(weekPanWheelShouldStep(100, 0, 80), true);
    assert.equal(weekPanWheelShouldStep(3, 1, 80), true);
    assert.equal(weekPanWheelShouldStep(12, 0, 8), false);
    assert.equal(weekPanWheelShouldStep(400, 0, 80), false);
    assert.equal(weekPanWheelShouldStep(8, 0, 80), false);
    assert.equal(weekPanWheelShouldStep(0, 0, 80), false);
  });
});

describe("weekPanWheelDelta", () => {
  it("keeps a trackpad sample 1:1 and steps a wheel notch by most of a column", () => {
    assert.equal(weekPanWheelDelta(40), 40);
    assert.equal(weekPanWheelDelta(-20), -20);
    assert.equal(weekPanWheelDelta(400), 400);
    assert.equal(weekPanWheelDelta(48, 180, true), 165.6);
    assert.equal(weekPanWheelDelta(-3, 100, true), -92);
    assert.equal(weekPanWheelDelta(0), 0);
  });
});

describe("snapScrollLeft", () => {
  it("lands on a day boundary", () => {
    assert.equal(snapScrollLeft(140, 100, 1000), 100);
    assert.equal(snapScrollLeft(160, 100, 1000), 200);
    assert.equal(snapScrollLeft(990, 100, 950), 950);
    assert.equal(snapScrollLeft(-20, 100, 950), 0);
  });
});
