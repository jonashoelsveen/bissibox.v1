import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarDayDelta, fromISOLocal, setHM, startOfWeekMon, toISOLocal } from "../components/calendar/dateUtils.ts";
import {
  bandEventColumns,
  eventCoversDay,
  isoFromMenuClocks,
  isAllDayBandEvent,
  untitledCalendarTitle,
  isFullDayTimedSpan,
  isMultiDaySession,
  promoteFullDayTimedSpan,
  timedMarkCoversFullDay,
  allDayBandLaneForRange,
  allDayBandLaneAtCursor,
  bandCreateSpan,
  bandWidthResizeResult,
  bandDragTargetColumn,
  bandDragWantsTimeDrop,
  continuousDragStartCol,
  compactAllDayBandLanes,
  layoutAllDayBand,
  layoutVisibleAllDayBand,
  layoutMonthWeekSpans,
  contiguousColumnsWhere,
  monthCellTileBudget,
  monthCreatePlaceholderLane,
  monthDragWeekPieces,
  monthSpanSort,
  previewSpanForGrabbedDay,
  multiDayDragBackHome,
  segmentTimedEventForDay,
  sessionDayCount,
  sessionInclusiveEndDay,
  sessionMenuClockRange,
  resizedBandColumns,
  resizedBandSpan,
  resizedMonthSpan,
  shiftedBandColumns,
} from "../components/calendar/multiDaySessions.ts";

function at(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m, d, h, min, 0, 0);
}

describe("segmentTimedEventForDay", () => {
  it("returns a single-day clock range", () => {
    const start = at(2026, 8, 23, 9, 0);
    const end = at(2026, 8, 23, 10, 30);
    const seg = segmentTimedEventForDay(start, end, at(2026, 8, 23));
    assert.deepEqual(seg, { startMin: 9 * 60, endMin: 10 * 60 + 30, kind: "single" });
    assert.equal(segmentTimedEventForDay(start, end, at(2026, 8, 24)), null);
  });

  it("treats next-day 00:00 as 24:00 on the start day, not a second day", () => {
    const start = at(2026, 8, 23, 22, 0);
    const end = at(2026, 8, 24, 0, 0);
    assert.equal(isMultiDaySession(start, end), false);
    const seg = segmentTimedEventForDay(start, end, at(2026, 8, 23));
    assert.deepEqual(seg, { startMin: 22 * 60, endMin: 24 * 60, kind: "single" });
    assert.equal(eventCoversDay(start, end, at(2026, 8, 24)), false);
  });

  it("splits a 3-day session into start, middle, and last minutes", () => {
    const start = at(2026, 8, 23, 10, 0);
    const end = at(2026, 8, 25, 11, 0);
    assert.equal(sessionDayCount(start, end), 3);
    assert.deepEqual(segmentTimedEventForDay(start, end, at(2026, 8, 23)), {
      startMin: 10 * 60,
      endMin: 24 * 60,
      kind: "start",
    });
    assert.deepEqual(segmentTimedEventForDay(start, end, at(2026, 8, 24)), {
      startMin: 0,
      endMin: 24 * 60,
      kind: "middle",
    });
    assert.deepEqual(segmentTimedEventForDay(start, end, at(2026, 8, 25)), {
      startMin: 0,
      endMin: 11 * 60,
      kind: "last",
    });
  });
});

describe("isoFromMenuClocks / sessionMenuClockRange", () => {
  it("commits start clock on day 1 and end clock on the last day", () => {
    const { startISO, endISO } = isoFromMenuClocks(
      at(2026, 8, 21),
      at(2026, 8, 23),
      22 * 60,
      8 * 60,
    );
    assert.equal(startISO, toISOLocal(at(2026, 8, 21, 22, 0)));
    assert.equal(endISO, toISOLocal(at(2026, 8, 23, 8, 0)));
    const clocks = sessionMenuClockRange(setHM(at(2026, 8, 21), 22, 0), setHM(at(2026, 8, 23), 8, 0));
    assert.deepEqual(clocks, { startMin: 22 * 60, endMin: 8 * 60 });
  });

  it("keeps a same-day 24:00 end as next-day midnight", () => {
    const { startISO, endISO } = isoFromMenuClocks(
      at(2026, 8, 21),
      at(2026, 8, 21),
      8 * 60,
      24 * 60,
    );
    assert.equal(startISO, toISOLocal(at(2026, 8, 21, 8, 0)));
    assert.equal(endISO, toISOLocal(at(2026, 8, 22, 0, 0)));
    assert.equal(
      isMultiDaySession(setHM(at(2026, 8, 21), 8, 0), setHM(at(2026, 8, 22), 0, 0)),
      false,
    );
  });
});

describe("month span lanes", () => {
  it("keeps an older multi-day session above a newer one", () => {
    const older = { id: "older", start: at(2026, 8, 22), end: at(2026, 8, 23, 12, 0), sortIndex: 1 };
    const newer = { id: "newer", start: at(2026, 8, 21), end: at(2026, 8, 25, 12, 0), sortIndex: 2 };
    const ordered = [newer, older].sort(monthSpanSort);
    assert.deepEqual(ordered.map((e) => e.id), ["older", "newer"]);
    const monday = startOfWeekMon(at(2026, 8, 21));
    const { spans } = layoutMonthWeekSpans([newer, older], monday);
    assert.equal(spans.find((s) => s.id === "older")?.lane, 0);
    assert.equal(spans.find((s) => s.id === "newer")?.lane, 1);
  });

  it("wraps a Sat–Tue span at Sunday and continues Monday", () => {
    const monday = startOfWeekMon(at(2026, 8, 21));
    const nextMonday = startOfWeekMon(at(2026, 8, 28));
    const ev = {
      id: "wrap",
      start: at(2026, 8, 26, 9, 0),
      end: at(2026, 8, 29, 11, 0),
    };
    const week1 = layoutMonthWeekSpans([ev], monday);
    const week2 = layoutMonthWeekSpans([ev], nextMonday);
    assert.equal(week1.laneCount, 1);
    assert.deepEqual(week1.spans[0], { id: "wrap", startCol: 5, endCol: 6, lane: 0 });
    assert.equal(week2.laneCount, 1);
    assert.deepEqual(week2.spans[0], { id: "wrap", startCol: 0, endCol: 1, lane: 0 });
    assert.deepEqual(sessionInclusiveEndDay(ev.start, ev.end), at(2026, 8, 29));
  });

  it("splits a Sat–Tue span into both week pieces", () => {
    const start = at(2026, 8, 26, 9, 0);
    const end = at(2026, 8, 29, 11, 0);
    const pieces = monthDragWeekPieces(start, end);
    assert.equal(pieces.length, 2);
    assert.equal(pieces[0].days, 2);
    assert.equal(pieces[0].startCol, 5);
    assert.equal(pieces[1].days, 2);
    assert.equal(pieces[1].startCol, 0);
    assert.equal(pieces[0].days + pieces[1].days, sessionDayCount(start, end));
  });

  it("lets a drag cross from Sunday into Monday", () => {
    assert.equal(continuousDragStartCol(6, 0, 2), 6);
    assert.equal(continuousDragStartCol(0, 1, 2), -1);
    assert.equal(continuousDragStartCol(2, 0, 3), 2);
    assert.equal(continuousDragStartCol(5, 0, 4), 5);
  });

  it("keeps the full span when the grabbed day moves", () => {
    const start = at(2026, 8, 26, 9, 0);
    const end = at(2026, 8, 29, 11, 0);
    const preview = previewSpanForGrabbedDay(start, end, at(2026, 8, 27), at(2026, 8, 30));
    assert.deepEqual(preview.start, at(2026, 8, 29));
    assert.deepEqual(preview.end, at(2026, 9, 2));
    assert.equal(
      calendarDayDelta(preview.start, preview.end) + 1,
      sessionDayCount(start, end),
    );
  });

  it("treats a drop back on the grabbed day as the original span", () => {
    const start = at(2026, 8, 26, 9, 0);
    const end = at(2026, 8, 29, 11, 0);
    const grabbed = at(2026, 8, 27);
    assert.equal(multiDayDragBackHome(start, end, grabbed, grabbed), true);
    assert.equal(multiDayDragBackHome(start, end, grabbed, at(2026, 8, 28)), false);
  });

  it("packs non-overlapping equal spans into one lane", () => {
    const monday = startOfWeekMon(at(2026, 8, 21));
    const a = { id: "a", start: at(2026, 8, 21, 9, 0), end: at(2026, 8, 22, 10, 0) };
    const b = { id: "b", start: at(2026, 8, 24, 9, 0), end: at(2026, 8, 25, 10, 0) };
    const { spans, laneCount } = layoutMonthWeekSpans([a, b], monday);
    assert.equal(laneCount, 1);
    assert.equal(spans.find((s) => s.id === "a")?.lane, 0);
    assert.equal(spans.find((s) => s.id === "b")?.lane, 0);
  });
});

describe("layoutAllDayBand", () => {
  it("keeps a multi-day span intact when another session shares a day", () => {
    const { spans, laneCount } = layoutAllDayBand([
      { id: "span", startCol: 0, endCol: 4, sortIndex: 1 },
      { id: "wed", startCol: 2, endCol: 2, sortIndex: 2 },
    ]);
    assert.equal(laneCount, 2);
    assert.deepEqual(spans.find((s) => s.id === "span"), {
      id: "span",
      startCol: 0,
      endCol: 4,
      lane: 0,
    });
    assert.equal(spans.find((s) => s.id === "wed")?.lane, 1);
  });

  it("grows to the busiest day, not the number of sessions in the week", () => {
    const { spans, laneCount } = layoutAllDayBand([
      { id: "mon-fri", startCol: 0, endCol: 4 },
      { id: "tue", startCol: 1, endCol: 1 },
      { id: "thu-sun", startCol: 3, endCol: 6 },
      { id: "sat", startCol: 5, endCol: 5 },
      { id: "wed", startCol: 2, endCol: 2 },
    ]);
    assert.equal(laneCount, 2);
    assert.equal(spans.find((s) => s.id === "mon-fri")?.endCol, 4);
    assert.equal(spans.find((s) => s.id === "thu-sun")?.startCol, 3);
    assert.equal(spans.find((s) => s.id === "thu-sun")?.endCol, 6);
    const byDay = Array.from({ length: 7 }, () => 0);
    for (const span of spans) {
      for (let col = span.startCol; col <= span.endCol; col++) byDay[col] += 1;
    }
    assert.equal(Math.max(...byDay), laneCount);
  });

  it("opens another lane while a widened span overlaps, then closes it when the overlap ends", () => {
    const apart = layoutAllDayBand([
      { id: "mon", startCol: 0, endCol: 0 },
      { id: "wed", startCol: 2, endCol: 2 },
    ]);
    assert.equal(apart.laneCount, 1);
    const overlapping = layoutAllDayBand([
      { id: "mon", startCol: 0, endCol: 2 },
      { id: "wed", startCol: 2, endCol: 2 },
    ]);
    assert.equal(overlapping.laneCount, 2);
    const byDay = Array.from({ length: 7 }, () => 0);
    for (const span of overlapping.spans) {
      for (let col = span.startCol; col <= span.endCol; col++) byDay[col] += 1;
    }
    assert.equal(Math.max(...byDay), overlapping.laneCount);
    assert.equal(
      layoutAllDayBand([
        { id: "mon", startCol: 0, endCol: 1 },
        { id: "wed", startCol: 2, endCol: 2 },
      ]).laneCount,
      1,
    );
  });

  it("shares a lane when sessions do not cover the same day", () => {
    const { spans, laneCount } = layoutAllDayBand([
      { id: "mon", startCol: 0, endCol: 0 },
      { id: "wed", startCol: 2, endCol: 2 },
    ]);
    assert.equal(laneCount, 1);
    assert.equal(spans.every((s) => s.lane === 0), true);
  });

  it("stacks every session on a single day-view column", () => {
    const { spans, laneCount } = layoutAllDayBand([
      { id: "a", startCol: 0, endCol: 0, sortIndex: 1 },
      { id: "b", startCol: 0, endCol: 0, sortIndex: 2 },
      { id: "c", startCol: 0, endCol: 0, sortIndex: 3 },
    ]);
    assert.equal(laneCount, 3);
    assert.deepEqual(
      spans.map((s) => s.lane),
      [0, 1, 2],
    );
  });

  it("keeps a saved session in the lane its create placeholder used", () => {
    const existing = [
      { id: "old-short", startCol: 2, endCol: 2, sortIndex: 1 },
      { id: "old-long", startCol: 0, endCol: 4, sortIndex: 2 },
    ];
    const created = { id: "new", startCol: 0, endCol: 4, sortIndex: 3 };
    const before = layoutAllDayBand(existing);
    const placeholderLane = allDayBandLaneForRange(before.spans, created.startCol, created.endCol);
    const after = layoutAllDayBand([...existing, created]);
    assert.ok(placeholderLane > 0);
    assert.equal(after.spans.find((s) => s.id === "new")?.lane, placeholderLane);
    for (const span of before.spans) {
      assert.equal(after.spans.find((s) => s.id === span.id)?.lane, span.lane);
    }
  });

  it("follows the cursor only through lanes that already exist on those days", () => {
    const spans = [
      { id: "top", startCol: 0, endCol: 1, lane: 0 },
      { id: "mid", startCol: 2, endCol: 4, lane: 1 },
      { id: "bot", startCol: 6, endCol: 6, lane: 2 },
    ];
    assert.equal(allDayBandLaneAtCursor(spans, 2, 4, 0.1), 0);
    assert.equal(allDayBandLaneAtCursor(spans, 2, 4, 0.5), 0);
    assert.equal(allDayBandLaneAtCursor(spans, 2, 4, 0.9), 0);
    assert.equal(
      allDayBandLaneAtCursor(
        [
          { startCol: 2, endCol: 4, lane: 0 },
          { startCol: 2, endCol: 4, lane: 2 },
        ],
        2,
        4,
        0.5,
      ),
      1,
    );
    assert.equal(allDayBandLaneAtCursor(spans, 5, 5, 0.9), 0);
    assert.equal(allDayBandLaneAtCursor(spans, 0, 6, 0.1), 3);
    assert.equal(
      allDayBandLaneAtCursor([{ startCol: 2, endCol: 4, lane: 0 }], 2, 4, 0.9),
      1,
    );
    assert.equal(allDayBandLaneAtCursor(spans, 2, 4, null), 0);
    assert.equal(allDayBandLaneAtCursor(spans, 2, 4, null, 2), 2);
  });

  it("places a create preview in the first lane that is free on those days", () => {
    const { spans, laneCount } = layoutAllDayBand([
      { id: "span", startCol: 0, endCol: 4 },
      { id: "wed", startCol: 2, endCol: 2 },
    ]);
    assert.equal(allDayBandLaneForRange(spans, 2, 2), laneCount);
    assert.equal(allDayBandLaneForRange(spans, 5, 6), 0);
  });

  it("drops sessions that sit outside the visible days so no empty row remains", () => {
    const events = [
      { id: "above", startCol: 0, endCol: 8, sortIndex: 1 },
      { id: "below", startCol: 6, endCol: 14, sortIndex: 2 },
    ];
    const global = layoutAllDayBand(events);
    assert.equal(global.spans.find((s) => s.id === "below")?.lane, 1);
    const visible = layoutVisibleAllDayBand(events, 10, 16);
    assert.equal(visible.laneCount, 1);
    assert.equal(visible.spans.find((s) => s.id === "below")?.lane, 0);
    assert.equal(visible.spans.some((s) => s.id === "above"), false);
  });

  it("closes a lane that a scrolled-away session left empty", () => {
    const compacted = compactAllDayBandLanes([
      { id: "top", startCol: 10, endCol: 12, lane: 0 },
      { id: "bottom", startCol: 10, endCol: 12, lane: 2 },
    ]);
    assert.equal(compacted.laneCount, 2);
    assert.equal(compacted.spans.find((s) => s.id === "top")?.lane, 0);
    assert.equal(compacted.spans.find((s) => s.id === "bottom")?.lane, 1);
  });
});

describe("band horizontal drag", () => {
  it("snaps a grabbed day to either end of the week", () => {
    assert.equal(bandDragTargetColumn(3, -400, 100, 7), 0);
    assert.equal(bandDragTargetColumn(3, 400, 100, 7), 6);
    assert.equal(bandDragTargetColumn(2, 140, 100, 7), 3);
    assert.equal(bandDragTargetColumn(0, -80, 100, 7), 0);
  });

  it("keeps a sideways week drag on the day shift even if it grazes the hour grid", () => {
    const base = {
      canDragOut: true,
      canShift: true,
      scrollerTop: 200,
      thresholdPx: 12,
    };
    assert.equal(
      bandDragWantsTimeDrop({ ...base, dx: 80, dy: 6, pointerY: 198 }),
      false,
    );
    assert.equal(
      bandDragWantsTimeDrop({ ...base, dx: 90, dy: 18, pointerY: 214 }),
      false,
    );
    assert.equal(
      bandDragWantsTimeDrop({ ...base, dx: 10, dy: 40, pointerY: 240 }),
      true,
    );
    assert.equal(
      bandDragWantsTimeDrop({
        canDragOut: true,
        canShift: false,
        dx: 4,
        dy: 20,
        pointerY: 210,
        scrollerTop: 200,
      }),
      true,
    );
    assert.equal(
      bandDragWantsTimeDrop({
        canDragOut: false,
        canShift: true,
        dx: 4,
        dy: 80,
        pointerY: 280,
        scrollerTop: 200,
      }),
      false,
    );
  });

  it("drags either edge to change how many days the bar covers", () => {
    const week = Array.from({ length: 7 }, (_, i) => at(2026, 9, 5 + i));
    assert.deepEqual(
      resizedBandColumns({
        edge: "end",
        visibleStart: 0,
        visibleEnd: 0,
        targetCol: 4,
        columnCount: 7,
      }),
      { startCol: 0, endCol: 4 },
    );
    assert.deepEqual(
      resizedBandColumns({
        edge: "start",
        visibleStart: 0,
        visibleEnd: 4,
        targetCol: 2,
        columnCount: 7,
      }),
      { startCol: 2, endCol: 4 },
    );
    assert.deepEqual(
      resizedBandColumns({
        edge: "start",
        visibleStart: 0,
        visibleEnd: 2,
        targetCol: 6,
        columnCount: 7,
      }),
      { startCol: 2, endCol: 6 },
    );
    const grown = resizedBandSpan({
      edge: "end",
      start: at(2026, 9, 5, 0, 0),
      end: at(2026, 9, 5, 23, 59),
      weekDates: week,
      visibleStart: 0,
      visibleEnd: 0,
      targetCol: 2,
    });
    assert.equal(grown.start.getDate(), 5);
    assert.equal(grown.end.getDate(), 7);
    const shrunk = resizedBandSpan({
      edge: "start",
      start: at(2026, 9, 5, 9, 0),
      end: at(2026, 9, 9, 17, 0),
      weekDates: week,
      visibleStart: 0,
      visibleEnd: 4,
      targetCol: 2,
    });
    assert.equal(shrunk.start.getDate(), 7);
    assert.equal(shrunk.end.getDate(), 9);
    const kept = resizedBandSpan({
      edge: "start",
      start: at(2026, 9, 2, 0, 0),
      end: at(2026, 9, 7, 23, 59),
      weekDates: week,
      visibleStart: 0,
      visibleEnd: 2,
      targetCol: 0,
    });
    assert.equal(kept.start.getDate(), 2);
    assert.equal(kept.end.getDate(), 7);
    const flipped = resizedBandSpan({
      edge: "start",
      start: at(2026, 9, 5, 0, 0),
      end: at(2026, 9, 7, 23, 59),
      weekDates: week,
      visibleStart: 0,
      visibleEnd: 2,
      targetCol: 4,
    });
    assert.equal(flipped.start.getDate(), 7);
    assert.equal(flipped.end.getDate(), 9);
    assert.equal(flipped.startCol, 2);
    assert.equal(flipped.endCol, 4);
  });

  it("drags a month span edge past the other end and keeps going", () => {
    const start = at(2026, 9, 5);
    const end = at(2026, 9, 8);
    const grown = resizedMonthSpan("end", start, end, at(2026, 9, 11));
    assert.equal(grown.start.getDate(), 5);
    assert.equal(grown.end.getDate(), 11);
    const shrunk = resizedMonthSpan("start", start, end, at(2026, 9, 7));
    assert.equal(shrunk.start.getDate(), 7);
    assert.equal(shrunk.end.getDate(), 8);
    const flipped = resizedMonthSpan("start", start, end, at(2026, 9, 20));
    assert.equal(flipped.start.getDate(), 8);
    assert.equal(flipped.end.getDate(), 20);
    const flippedBack = resizedMonthSpan("end", start, end, at(2026, 9, 2));
    assert.equal(flippedBack.start.getDate(), 2);
    assert.equal(flippedBack.end.getDate(), 5);
  });

  it("shifts a multi-day span with the grabbed day and clips it to the week", () => {
    assert.deepEqual(shiftedBandColumns(1, 3, 2, 7), { startCol: 3, endCol: 5 });
    assert.deepEqual(shiftedBandColumns(0, 2, -2, 7), { startCol: 0, endCol: 0 });
    assert.deepEqual(shiftedBandColumns(4, 6, 2, 7), { startCol: 6, endCol: 6 });
    assert.equal(shiftedBandColumns(4, 6, 3, 7), null);
  });
});

describe("untitledCalendarTitle", () => {
  it("names an empty all-day or multi-day title as an event", () => {
    assert.equal(untitledCalendarTitle(true), "New event");
    assert.equal(untitledCalendarTitle(false), "New session");
  });
});

describe("isAllDayBandEvent", () => {
  it("puts all-day sessions in the week/day band", () => {
    assert.equal(
      isAllDayBandEvent({
        allDay: true,
        startISO: toISOLocal(at(2026, 8, 23, 0, 0)),
        endISO: toISOLocal(at(2026, 8, 23, 23, 59)),
      }),
      true,
    );
  });

  it("puts true multi-day timed sessions in the band", () => {
    assert.equal(
      isAllDayBandEvent({
        allDay: false,
        startISO: toISOLocal(at(2026, 8, 23, 9, 0)),
        endISO: toISOLocal(at(2026, 8, 25, 11, 0)),
      }),
      true,
    );
  });

  it("moves a dragged 00:00–24:00 span into the all-day row", () => {
    const start = at(2026, 8, 23, 0, 0);
    const end = at(2026, 8, 24, 0, 0);
    assert.equal(isFullDayTimedSpan(start, end), true);
    assert.equal(isAllDayBandEvent({ allDay: false, startISO: toISOLocal(start), endISO: toISOLocal(end) }), false);
    const promoted = promoteFullDayTimedSpan(toISOLocal(start), toISOLocal(end));
    assert.equal(promoted?.allDay, true);
    assert.ok(promoted);
    assert.equal(isAllDayBandEvent(promoted), true);
    const promotedStart = fromISOLocal(promoted.startISO);
    const promotedEnd = fromISOLocal(promoted.endISO);
    assert.equal(promotedStart.getHours(), 0);
    assert.equal(promotedEnd.getHours(), 23);
    assert.equal(promotedEnd.getMinutes(), 59);
    assert.equal(promotedEnd.getDate(), promotedStart.getDate());
  });

  it("treats a hold-drag across every 00:00–24:00 slot as a full day", () => {
    const startMin = 0 * 60 + (2 - 2) * 30;
    const endMin = 0 * 60 + (49 - 2 + 1) * 30;
    assert.equal(startMin, 0);
    assert.equal(endMin, 24 * 60);
    assert.equal(timedMarkCoversFullDay(startMin, endMin), true);
    assert.equal(timedMarkCoversFullDay(0, 23 * 60 + 30), false);
    assert.equal(timedMarkCoversFullDay(30, 24 * 60), false);
  });

  it("keeps a session that only ends at midnight in the hour grid", () => {
    const start = at(2026, 8, 23, 22, 0);
    const end = at(2026, 8, 24, 0, 0);
    assert.equal(isFullDayTimedSpan(start, end), false);
    assert.equal(promoteFullDayTimedSpan(toISOLocal(start), toISOLocal(end)), null);
  });

  it("keeps next-day 00:00 as a timed single-day session", () => {
    assert.equal(
      isAllDayBandEvent({
        allDay: false,
        startISO: toISOLocal(at(2026, 8, 23, 22, 0)),
        endISO: toISOLocal(at(2026, 8, 24, 0, 0)),
      }),
      false,
    );
  });

  it("keeps same-day timed sessions out of the band", () => {
    assert.equal(
      isAllDayBandEvent({
        allDay: false,
        startISO: toISOLocal(at(2026, 8, 23, 9, 0)),
        endISO: toISOLocal(at(2026, 8, 23, 10, 30)),
      }),
      false,
    );
  });
});

describe("week create-drag across days", () => {
  it("materializes a multi-day range that the band classifies", () => {
    const { startISO, endISO } = isoFromMenuClocks(
      at(2026, 8, 23),
      at(2026, 8, 25),
      10 * 60,
      11 * 60,
    );
    const start = fromISOLocal(startISO);
    const end = fromISOLocal(endISO);
    assert.equal(sessionDayCount(start, end), 3);
    assert.equal(isAllDayBandEvent({ allDay: false, startISO, endISO }), true);
    const week = Array.from({ length: 7 }, (_, i) => at(2026, 8, 21 + i));
    assert.deepEqual(bandEventColumns(start, end, week), { startCol: 2, endCol: 4 });
  });

  it("keeps a top-row session in the band when its width changes", () => {
    const wide = isoFromMenuClocks(at(2026, 8, 22), at(2026, 8, 24), 0, 24 * 60);
    assert.equal(isAllDayBandEvent({ allDay: false, ...wide }), true);
    const shrunk = bandWidthResizeResult(
      wide.startISO,
      wide.endISO,
      false,
      at(2026, 8, 23),
      at(2026, 8, 23),
    );
    assert.equal(shrunk.allDay, true);
    assert.equal(isAllDayBandEvent(shrunk), true);
    const start = fromISOLocal(shrunk.startISO);
    const end = fromISOLocal(shrunk.endISO);
    assert.equal(isMultiDaySession(start, end), false);
    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
    assert.equal(end.getDate(), start.getDate());
    const timed = segmentTimedEventForDay(start, end, start);
    assert.equal(timed?.endMin, 23 * 60 + 59);

    const stillWide = bandWidthResizeResult(
      wide.startISO,
      wide.endISO,
      false,
      at(2026, 8, 22),
      at(2026, 8, 25),
    );
    assert.equal(stillWide.allDay, false);
    assert.equal(isAllDayBandEvent(stillWide), true);

    const day = {
      startISO: toISOLocal(setHM(at(2026, 8, 22), 0, 0)),
      endISO: toISOLocal(setHM(at(2026, 8, 22), 23, 59)),
    };
    const widened = bandWidthResizeResult(day.startISO, day.endISO, true, at(2026, 8, 22), at(2026, 8, 24));
    assert.equal(widened.allDay, true);
    assert.equal(isAllDayBandEvent(widened), true);
    const back = bandWidthResizeResult(
      widened.startISO,
      widened.endISO,
      widened.allDay,
      at(2026, 8, 23),
      at(2026, 8, 23),
    );
    assert.equal(back.allDay, true);
    assert.equal(isAllDayBandEvent(back), true);
  });

  it("builds an ordered multi-day span from a top-row drag", () => {
    assert.equal(bandCreateSpan(2, 2), null);
    assert.deepEqual(bandCreateSpan(1, 4), { startCol: 1, endCol: 4 });
    assert.deepEqual(bandCreateSpan(5, 2), { startCol: 2, endCol: 5 });
    const { startISO, endISO } = isoFromMenuClocks(
      at(2026, 8, 22),
      at(2026, 8, 24),
      0,
      24 * 60,
    );
    const start = fromISOLocal(startISO);
    const end = fromISOLocal(endISO);
    assert.equal(isAllDayBandEvent({ allDay: false, startISO, endISO }), true);
    const week = Array.from({ length: 7 }, (_, i) => at(2026, 8, 21 + i));
    assert.deepEqual(bandEventColumns(start, end, week), { startCol: 1, endCol: 3 });
  });

  it("keeps a month cell to four tiles, counting multi-day lanes", () => {
    assert.deepEqual(
      monthCellTileBudget({ maxRows: 4, spanLanes: [0, 1, 2, 3], itemCount: 0, previewSlots: 0 }),
      { visibleSpanLanes: 4, maxChips: 0, overflow: 0, spanLaneLimit: 4 },
    );
    assert.deepEqual(
      monthCellTileBudget({ maxRows: 4, spanLanes: [0, 1, 2, 3, 4], itemCount: 0, previewSlots: 0 }),
      { visibleSpanLanes: 3, maxChips: 0, overflow: 2, spanLaneLimit: 3 },
    );
    assert.deepEqual(
      monthCellTileBudget({ maxRows: 4, spanLanes: [0, 1], itemCount: 3, previewSlots: 0 }),
      { visibleSpanLanes: 2, maxChips: 1, overflow: 2, spanLaneLimit: 3 },
    );
    assert.deepEqual(
      monthCellTileBudget({ maxRows: 4, spanLanes: [0, 1, 2, 3, 4], itemCount: 2, previewSlots: 0 }),
      { visibleSpanLanes: 3, maxChips: 0, overflow: 4, spanLaneLimit: 3 },
    );
    assert.deepEqual(contiguousColumnsWhere(0, 4, (col) => col !== 2), [
      { startCol: 0, endCol: 1 },
      { startCol: 3, endCol: 4 },
    ]);
    assert.equal(monthCreatePlaceholderLane(0), 0);
    assert.equal(monthCreatePlaceholderLane(2), 2);
    assert.equal(monthCreatePlaceholderLane(3), 3);
    assert.equal(monthCreatePlaceholderLane(4), 2);
    assert.deepEqual(
      monthCellTileBudget({
        maxRows: 4,
        spanLanes: [0, 1],
        itemCount: 2,
        previewSlots: 0,
        placeholderLane: 2,
      }),
      { visibleSpanLanes: 3, maxChips: 0, overflow: 2, spanLaneLimit: 2 },
    );
    assert.deepEqual(
      monthCellTileBudget({
        maxRows: 4,
        spanLanes: [],
        itemCount: 2,
        previewSlots: 0,
        placeholderLane: 0,
      }),
      { visibleSpanLanes: 1, maxChips: 2, overflow: 0, spanLaneLimit: 0 },
    );
  });

  it("clips a spanning session to the visible day column", () => {
    const start = at(2026, 8, 23, 9, 0);
    const end = at(2026, 8, 25, 11, 0);
    assert.deepEqual(bandEventColumns(start, end, [at(2026, 8, 24)]), {
      startCol: 0,
      endCol: 0,
    });
  });
});
