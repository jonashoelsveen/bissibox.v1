import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDragRangeFromPointer,
  markRangeFromPointer,
  markRangeMinutes,
  weekMinutesToRank,
} from "./calendarCreateDragRange.ts";

describe("calendar create-drag range", () => {
  const gridStartHour = 0;
  const slotRows = 48;

  it("preserves exact 5-minute times when edge-pulsing inside the origin day", () => {
    const originMin = 9 * 60 + 5;
    const pointerMin = 9 * 60 + 20;
    const start = {
      month: 2,
      rank: weekMinutesToRank(originMin, gridStartHour, slotRows),
      originMin,
    };
    const pointerRank = weekMinutesToRank(pointerMin, gridStartHour, slotRows);

    const precise = createDragRangeFromPointer(
      start,
      start.month,
      pointerRank,
      pointerMin,
      gridStartHour,
      slotRows,
    );

    assert.deepEqual(markRangeMinutes(precise!, gridStartHour), {
      startMin: originMin,
      endMin: pointerMin + 5,
    });
    assert.notDeepEqual(
      markRangeMinutes(markRangeFromPointer(start, start.month, pointerRank)!, gridStartHour),
      markRangeMinutes(precise!, gridStartHour),
    );
  });

  it("keeps multi-day edge-pulse ranges rank-based", () => {
    const originMin = 9 * 60 + 5;
    const pointerMin = 9 * 60 + 20;
    const start = {
      month: 2,
      rank: weekMinutesToRank(originMin, gridStartHour, slotRows),
      originMin,
    };
    const pointerRank = weekMinutesToRank(pointerMin, gridStartHour, slotRows);

    const multiDay = createDragRangeFromPointer(
      start,
      start.month + 1,
      pointerRank,
      pointerMin,
      gridStartHour,
      slotRows,
    );

    assert.equal(multiDay?.endMonth, start.month + 1);
    assert.equal(multiDay?.startMin, undefined);
    assert.equal(multiDay?.endMin, undefined);
  });
});
