import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDGE_ROLL_MAX_PX,
  hourRowAtTop,
  resistedEdgeOffset,
} from "../components/calendar/timedEdgeRoll.ts";

describe("timed edge roll", () => {
  it("resists toward a cap and unwinds without sticking", () => {
    let offset = 0;
    offset = resistedEdgeOffset(offset, 40);
    assert.ok(offset > 20 && offset < EDGE_ROLL_MAX_PX);
    const near = resistedEdgeOffset(EDGE_ROLL_MAX_PX - 1, 80);
    assert.ok(near <= EDGE_ROLL_MAX_PX);
    assert.ok(near > EDGE_ROLL_MAX_PX - 1);
    assert.equal(resistedEdgeOffset(30, -30), 0);
    assert.equal(resistedEdgeOffset(30, -10), 20);
    assert.equal(resistedEdgeOffset(-24, 24), 0);
  });

  it("picks the hour row crossing the top of the grid", () => {
    assert.equal(hourRowAtTop(0, 48, 18), 0);
    assert.equal(hourRowAtTop(47, 48, 18), 0);
    assert.equal(hourRowAtTop(48, 48, 18), 1);
    assert.equal(hourRowAtTop(5000, 48, 18), 17);
    assert.equal(hourRowAtTop(10, 0, 18), 0);
  });
});
