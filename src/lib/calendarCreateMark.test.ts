import assert from "node:assert/strict";
import { test } from "node:test";
import { createDragMarkRangeFromPointer } from "./calendarCreateMark.ts";

const GRID_START_HOUR = 0;
const SLOT_ROWS = 48;

test("cross-day create drag preserves snapped start and end minutes", () => {
  const mark = createDragMarkRangeFromPointer(
    { month: 1, rank: 18, originMin: 8 * 60 + 15 },
    2,
    18,
    8 * 60 + 15,
    GRID_START_HOUR,
    SLOT_ROWS,
  );

  assert.deepEqual(mark, {
    month: 1,
    lo: 18,
    hi: 18,
    endMonth: 2,
    startMin: 8 * 60 + 15,
    endMin: 8 * 60 + 20,
  });
});

test("backward cross-day create drag preserves the chronological snapped minutes", () => {
  const mark = createDragMarkRangeFromPointer(
    { month: 3, rank: 20, originMin: 9 * 60 + 25 },
    2,
    18,
    8 * 60 + 15,
    GRID_START_HOUR,
    SLOT_ROWS,
  );

  assert.deepEqual(mark, {
    month: 2,
    lo: 18,
    hi: 20,
    endMonth: 3,
    startMin: 8 * 60 + 15,
    endMin: 9 * 60 + 30,
  });
});
