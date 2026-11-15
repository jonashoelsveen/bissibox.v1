import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markRangeMinutes, snapPointerToCreateMinute, timedCreateMark } from "./createDragRange.ts";

describe("calendar create-drag range", () => {
  it("snaps pointer position to 5-minute boundaries", () => {
    assert.equal(snapPointerToCreateMinute(47, 60, 0, 24), 20);
    assert.equal(snapPointerToCreateMinute(1439, 60, 0, 24), 715);
  });

  it("preserves exact 5-minute bounds alongside slot ranks", () => {
    const range = timedCreateMark(2, 8 * 60 + 10, 8 * 60 + 45, 0, 48);

    assert.deepEqual(markRangeMinutes(range, 0), {
      startMin: 8 * 60 + 10,
      endMin: 8 * 60 + 50,
    });
    assert.notDeepEqual(markRangeMinutes({ lo: range.lo, hi: range.hi }, 0), {
      startMin: 8 * 60 + 10,
      endMin: 8 * 60 + 50,
    });
  });
});
