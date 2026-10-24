import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MONTH_CREATE_EDGE_PX,
  monthCreateEdgeSnapGain,
  stepMonthCreateEdgeScroll,
} from "./edgeScroll.ts";

describe("month create edge scroll", () => {
  const band = {
    top: 100,
    bottom: 700,
    maxScroll: 4000,
    edge: MONTH_CREATE_EDGE_PX,
  };

  it("stays put until the pointer is dragged into the edge", () => {
    const next = stepMonthCreateEdgeScroll({
      scroll: 500,
      pointer: band.top + MONTH_CREATE_EDGE_PX + 8,
      dt: 16,
      velocity: 0,
      intent: -1,
      ...band,
    });
    assert.equal(next.scroll, 500);
    assert.equal(next.velocity, 0);
  });

  it("speeds up smoothly toward the rim instead of jumping a week row", () => {
    let velocity = 0;
    let scroll = 800;
    const speeds: number[] = [];
    for (let i = 0; i < 8; i++) {
      const next = stepMonthCreateEdgeScroll({
        scroll,
        pointer: band.bottom + 12,
        dt: 16,
        velocity,
        intent: 1,
        ...band,
      });
      const step = next.scroll - scroll;
      speeds.push(step);
      assert.ok(step > 0, "scrolls downward");
      assert.ok(step < 20, "one frame stays well under a week row");
      scroll = next.scroll;
      velocity = next.velocity;
    }
    assert.ok(speeds[7]! > speeds[0]!, "speed builds across frames");
  });

  it("eases to a stop after the pointer comes back off the edge", () => {
    let velocity = 0.6;
    let scroll = 800;
    let first = 0;
    for (let i = 0; i < 40; i++) {
      const next = stepMonthCreateEdgeScroll({
        scroll,
        pointer: band.top + 200,
        dt: 16,
        velocity,
        intent: 0,
        ...band,
      });
      if (i === 0) first = next.velocity;
      assert.ok(next.velocity <= velocity + 1e-9);
      scroll = next.scroll;
      velocity = next.velocity;
    }
    assert.ok(first > 0.4, "the first frame keeps most of the speed");
    assert.ok(Math.abs(velocity) < 0.02);
  });

  it("holds a steady downward scroll while the pointer stays in the edge", () => {
    let velocity = 0;
    let scroll = 800;
    for (let i = 0; i < 24; i++) {
      const next = stepMonthCreateEdgeScroll({
        scroll,
        pointer: band.bottom - 4,
        dt: 16,
        velocity,
        intent: 1,
        ...band,
      });
      assert.ok(next.scroll > scroll);
      scroll = next.scroll;
      velocity = next.velocity;
    }
    const later = stepMonthCreateEdgeScroll({
      scroll,
      pointer: band.bottom - 4,
      dt: 16,
      velocity,
      intent: 1,
      ...band,
    });
    assert.ok(Math.abs(later.velocity - velocity) < 0.02);
  });

  it("drops the week-line snap once the pointer is far into the edge", () => {
    const row = 136;
    const top = band.top;
    const bottom = band.bottom;
    assert.equal(monthCreateEdgeSnapGain(bottom + 8, top, bottom), 0);
    assert.equal(monthCreateEdgeSnapGain(bottom - 2, top, bottom), 0);
    assert.ok(monthCreateEdgeSnapGain(bottom - 34, top, bottom) > 0.9);
    let scroll = row + 40;
    let velocity = 0.6;
    let crossed = false;
    for (let i = 0; i < 12; i++) {
      const next = stepMonthCreateEdgeScroll({
        scroll,
        pointer: bottom - 2,
        dt: 16,
        velocity,
        intent: 1,
        rowHeight: row,
        ...band,
      });
      if (next.scroll >= row * 2) crossed = true;
      const step = next.scroll - scroll;
      assert.ok(step < row * 0.25, "a frame does not hurry across a week row");
      scroll = next.scroll;
      velocity = next.velocity;
    }
    assert.equal(crossed, true);
  });

  it("eases onto the next week line as the pointer comes back toward center", () => {
    const row = 136;
    const from = row + 50;
    let scroll = from;
    let velocity = 0.55;
    const pointer = band.bottom - 36;
    assert.ok(monthCreateEdgeSnapGain(pointer, band.top, band.bottom) > 0.9);
    for (let i = 0; i < 40; i++) {
      const next = stepMonthCreateEdgeScroll({
        scroll,
        pointer,
        dt: 16,
        velocity,
        intent: 1,
        rowHeight: row,
        ...band,
      });
      assert.ok(next.scroll <= row * 2 + 0.01, "does not pass the next week line");
      assert.ok(next.scroll + 0.01 >= scroll);
      const step = next.scroll - scroll;
      assert.ok(step < 12, "the snap does not jump the row");
      scroll = next.scroll;
      velocity = next.velocity;
    }
    assert.ok(Math.abs(scroll - row * 2) < 1);
  });
});
