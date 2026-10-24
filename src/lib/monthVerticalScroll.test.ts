import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays } from "../components/calendar/dateUtils.ts";
import {
  buildMonthPan,
  focusedMonthAtMidpoint,
  monthBufferExtension,
  monthFromIndex,
  monthIndex,
  monthMountCovers,
  monthRenderRange,
  monthAfterFlick,
  classifyMonthWheel,
  closeMonthWheel,
  directionalSnapScrollTop,
  magneticScrollTop,
  monthFlickDirection,
  monthGestureTarget,
  monthCoastPlan,
  monthCoastScrollTop,
  monthCreatePulseDuration,
  monthCreatePulseScroll,
  MONTH_CREATE_EDGE_PX,
  MONTH_CREATE_EDGE_RELEASE_PX,
  MONTH_CREATE_PULSE_HOLD_MS,
  MONTH_CREATE_PULSE_INTERVAL_MS,
  MONTH_CREATE_PULSE_MS,
  monthCreateEdgeZone,
  nextMonthOriginScroll,
  monthCoastVelocity,
  monthPredictiveBrake,
  monthReleaseEdge,
  monthReleasePlan,
  monthWheelDecaying,
  MONTH_COAST_REST_SPEED,
  MONTH_COAST_TAU_MS,
  monthSettleScrollTop,
  monthSettleVelocity,
  monthSpringScrollTop,
  reduceMonthWheel,
  scrollTopForMonthWeek,
  snapScrollTop,
  visibleWeekRows,
  weeksBetweenMonthStarts,
} from "./monthVerticalScroll.ts";

describe("buildMonthPan", () => {
  const oct = monthIndex(2026, 9);
  const nov = monthIndex(2026, 10);

  it("starts each month on the Monday of the week that contains the 1st", () => {
    const pan = buildMonthPan(oct, nov);
    assert.equal(pan.monthStarts[0]?.week, 0);
    const novWeek = pan.monthStarts[1]?.week ?? 0;
    const novMonday = addDays(pan.start, novWeek * 7);
    const containsFirst = Array.from({ length: 7 }, (_, i) => addDays(novMonday, i)).some(
      (d) => d.getFullYear() === 2026 && d.getMonth() === 10 && d.getDate() === 1,
    );
    assert.equal(containsFirst, true);
  });

  it("includes a shared boundary week once", () => {
    const pan = buildMonthPan(oct, nov);
    const separate =
      buildMonthPan(oct, oct).weekCount + buildMonthPan(nov, nov).weekCount;
    assert.ok(pan.weekCount < separate);
    assert.equal(pan.monthStarts[1]!.week < pan.weekCount, true);
  });
});

describe("focusedMonthAtMidpoint", () => {
  const row = 168;
  const view = 800;
  const oct = monthIndex(2026, 9);
  const nov = monthIndex(2026, 10);
  const starts = buildMonthPan(oct, nov).monthStarts;
  const novY = starts[1]!.week * row;
  const scroll = novY - view / 2;

  it("switches when the next month's first week reaches the midpoint", () => {
    assert.equal(focusedMonthAtMidpoint(scroll - 1, view, row, starts), oct);
    assert.equal(focusedMonthAtMidpoint(scroll, view, row, starts), nov);
  });

  it("returns to the previous month when the boundary scrolls back below the midpoint", () => {
    assert.equal(focusedMonthAtMidpoint(scroll + 40, view, row, starts), nov);
    assert.equal(focusedMonthAtMidpoint(scroll - 1, view, row, starts), oct);
  });
});

describe("scrollTopForMonthWeek", () => {
  it("puts that week flush with the top of the view", () => {
    assert.equal(scrollTopForMonthWeek(0, 168), 0);
    assert.equal(scrollTopForMonthWeek(4, 168), 672);
  });
});

describe("month create pulse", () => {
  const row = 136;
  const starts = [{ week: 0 }, { week: 4 }, { week: 9 }, { week: 13 }];

  it("steps to the closest 1st in the drag direction, then one month at a time", () => {
    assert.equal(nextMonthOriginScroll(row, 1, row, starts, 5000), 4 * row);
    assert.equal(nextMonthOriginScroll(4 * row, 1, row, starts, 5000), 9 * row);
    assert.equal(nextMonthOriginScroll(4 * row + 40, -1, row, starts, 5000), 4 * row);
    assert.equal(nextMonthOriginScroll(4 * row, -1, row, starts, 5000), 0);
    assert.equal(nextMonthOriginScroll(0, -1, row, starts, 5000), null);
    assert.equal(nextMonthOriginScroll(13 * row, 1, row, starts, 5000), null);
  });

  it("eases one month in a single pulse", () => {
    const from = 2 * row;
    const target = 6 * row;
    const dur = monthCreatePulseDuration(target - from);
    assert.equal(dur, MONTH_CREATE_PULSE_MS);
    assert.ok(dur < MONTH_CREATE_PULSE_INTERVAL_MS);
    assert.equal(monthCreatePulseScroll(from, target, 0, dur), from);
    const mid = monthCreatePulseScroll(from, target, dur / 2, dur);
    assert.ok(Math.abs(mid - (from + target) / 2) < 1);
    assert.equal(monthCreatePulseScroll(from, target, dur, dur), target);
    assert.equal(MONTH_CREATE_PULSE_HOLD_MS, 400);
    assert.equal(MONTH_CREATE_PULSE_INTERVAL_MS, 800);
  });

  it("lets a short move off the rim cancel the next month", () => {
    const top = 100;
    const bottom = 800;
    assert.ok(MONTH_CREATE_EDGE_RELEASE_PX < MONTH_CREATE_EDGE_PX);
    assert.equal(monthCreateEdgeZone(bottom - 40, top, bottom, false), 1);
    assert.equal(monthCreateEdgeZone(bottom - 40, top, bottom, true), 0);
    assert.equal(monthCreateEdgeZone(bottom - 8, top, bottom, true), 1);
    assert.equal(monthCreateEdgeZone(top + 30, top, bottom, false), -1);
    assert.equal(monthCreateEdgeZone(top + 30, top, bottom, true), 0);
    assert.equal(monthCreateEdgeZone(top + 8, top, bottom, true), -1);
  });
});

describe("snapScrollTop", () => {
  const row = 168;

  it("settles a partial row to the nearest full row", () => {
    assert.equal(snapScrollTop(0, row, 5000), 0);
    assert.equal(snapScrollTop(83, row, 5000), 0);
    assert.equal(snapScrollTop(84, row, 5000), row);
    assert.equal(snapScrollTop(row + 20, row, 5000), row);
    assert.equal(snapScrollTop(row + 100, row, 5000), row * 2);
  });

  it("stays inside the scroll range", () => {
    assert.equal(snapScrollTop(-40, row, 5000), 0);
    assert.equal(snapScrollTop(4900, row, 4800), 4800);
  });

  it("settles on the next row in the scroll direction", () => {
    assert.equal(directionalSnapScrollTop(6, row, 5000, 1), 0);
    assert.equal(directionalSnapScrollTop(20, row, 5000, 1), row);
    assert.equal(directionalSnapScrollTop(row - 8, row, 5000, 1), row);
    assert.equal(directionalSnapScrollTop(row, row, 5000, 1), row);
    assert.equal(directionalSnapScrollTop(row + 12, row, 5000, -1), row);
    assert.equal(directionalSnapScrollTop(row - 12, row, 5000, -1), 0);
    assert.equal(directionalSnapScrollTop(5000, row, 4800, 1), 4800);
  });

  it("eases to the next week line and never back to the row just left", () => {
    assert.equal(monthGestureTarget(0, 20, 0.2, 80, row, 5000), row);
    assert.equal(monthGestureTarget(0, 70, 1.2, 120, row, 5000), row);
    assert.equal(monthGestureTarget(row * 2, row * 2 - 60, -1.4, 100, row, 5000), row);
    assert.equal(monthGestureTarget(0, 200, 2, 100, row, 5000), row * 2);
    assert.equal(monthGestureTarget(0, 400, 0.4, 420, row, 5000), row * 3);
    assert.equal(monthGestureTarget(0, row, 1, 40, row, 5000), row);
    assert.equal(monthSettleVelocity(200, row, 2), 0);
  });

  it("springs toward the row without leaving the start on the first instant", () => {
    const start = monthSpringScrollTop(0, 0.4, row, 0);
    assert.ok(Math.abs(start.position) < 0.01);
    const late = monthSpringScrollTop(0, 0.4, row, 1200);
    assert.ok(Math.abs(late.position - row) < 1);
    assert.ok(Math.abs(late.velocity) < 0.05);
  });

  it("settles forward onto a week line and never back to the row just left", () => {
    assert.equal(monthSettleScrollTop(0, 40, row, 5000), row);
    assert.equal(monthSettleScrollTop(0, 100, row, 5000), row);
    assert.equal(monthSettleScrollTop(0, row, row, 5000), row);
    assert.equal(monthSettleScrollTop(0, 200, row, 5000), row * 2);
    assert.equal(monthSettleScrollTop(0, 300, row, 5000), row * 2);
    assert.equal(monthSettleScrollTop(0, row + row / 2 - 1, row, 5000), row * 2);
    assert.equal(monthSettleScrollTop(row * 3, row * 3 - 200, row, 5000), row);
    assert.ok(monthSettleScrollTop(row, row + 12, row, 5000) >= row + 12);
  });

  it("slows onto the next week line without gaining speed", () => {
    const gliding = monthCoastPlan(200, 0.3, 1, row, 5000, true);
    assert.ok(gliding);
    assert.equal(gliding.target, row * 2);
    assert.ok(Math.abs(gliding.velocity - 0.3) < 1e-9);
    assert.ok(gliding.durationMs + 0.01 >= MONTH_COAST_TAU_MS * 2);
    assert.equal(monthCoastPlan(200, 1.2, 1, row, 5000, true), null);
    const upward = monthCoastPlan(row * 2 - 60, -0.25, -1, row, 5000, true);
    assert.ok(upward);
    assert.equal(upward.target, row);
    assert.ok(upward.velocity < 0);
    assert.ok(Math.abs(upward.velocity) <= 0.25 + 1e-9);
    assert.equal(monthCoastPlan(340, -0.5, -1, row, 5000, true), null);
    const stopped = monthCoastPlan(20, 0, 1, row, 5000, false);
    assert.ok(stopped);
    assert.equal(stopped.target, row);
    assert.ok(Math.abs(stopped.velocity) <= MONTH_COAST_REST_SPEED + 0.001);
    const samples = [0, 0.2, 0.45, 0.7, 0.9, 1];
    let prevSpeed = Infinity;
    for (const unit of samples) {
      const elapsed = unit * gliding.durationMs;
      const speed = Math.abs(monthCoastVelocity(200, gliding.target, elapsed, gliding.durationMs));
      assert.ok(speed <= prevSpeed + 1e-9);
      prevSpeed = speed;
    }
    assert.ok(Math.abs(monthCoastScrollTop(200, gliding.target, 0, gliding.durationMs) - 200) < 0.01);
    assert.ok(
      Math.abs(monthCoastScrollTop(200, gliding.target, gliding.durationMs, gliding.durationMs) - gliding.target) <
        0.01,
    );
  });

  it("stops on the line ahead of an upper-part rest and never turns back", () => {
    const slowPast = monthReleasePlan(340, 0.05, 340, row, 5000);
    assert.ok(slowPast);
    assert.equal(slowPast.target, row * 3);
    assert.ok(slowPast.target > 340);
    assert.equal(slowPast.curve, "ease");
    assert.equal(slowPast.velocity, 0);
    const ended = monthReleasePlan(340, 0, 340, row, 5000, 1);
    assert.ok(ended);
    assert.equal(ended.target, row * 3);
    assert.ok(ended.target > 340);
    assert.equal(ended.curve, "ease");
    const aimed = monthReleasePlan(200, 0.4, 200, row, 5000);
    assert.ok(aimed);
    assert.equal(aimed.target, row * 2);
    assert.ok(Math.abs(aimed.velocity - 0.4) < 1e-6);
    assert.ok(Math.abs(aimed.durationMs - (2 * (row * 2 - 200)) / 0.4) < 1);
    const flick = monthReleasePlan(200, 2, 200, row, 5000);
    assert.ok(flick);
    assert.equal(flick.target, 200 + 2 * MONTH_COAST_TAU_MS);
    assert.ok(Math.abs(flick.velocity - 2) < 1e-6);
    const overshot = monthReleasePlan(200, 2, flick.target + 20, row, 5000);
    assert.ok(overshot);
    assert.ok(overshot.target > flick.target + 20);
    assert.ok(overshot.velocity > 0);
    assert.ok(Math.abs(overshot.velocity - 2) < 1e-6);
    let prev = Infinity;
    for (const unit of [0, 0.25, 0.5, 0.75, 1]) {
      const speed = Math.abs(monthCoastVelocity(200, aimed.target, unit * aimed.durationMs, aimed.durationMs));
      assert.ok(speed <= prev + 1e-9);
      prev = speed;
    }
    assert.ok(Math.abs(monthCoastVelocity(200, aimed.target, 0, aimed.durationMs) - 0.4) < 1e-6);
    const approaching = 300;
    const speed = (row * 2 + 30 - approaching) / MONTH_COAST_TAU_MS;
    const held = monthReleasePlan(approaching, speed, approaching, row, 5000);
    assert.ok(held);
    assert.equal(monthReleaseEdge(approaching, speed, row, 5000), row * 2);
    assert.equal(held.target, row * 2);
    assert.ok(held.target < row * 2 + 30);
    assert.ok(held.velocity > 0);
    assert.ok(Math.abs(held.velocity - speed) < 1e-6);
    let pos = approaching;
    for (let t = 0; t <= held.durationMs; t += 16) {
      const next = monthCoastScrollTop(approaching, held.target, t, held.durationMs);
      assert.ok(next >= pos - 1e-6);
      assert.ok(next <= held.target + 1e-6);
      pos = next;
    }
    const upward = monthReleaseEdge(row * 2 + 40, -((40 + 16) / MONTH_COAST_TAU_MS), row, 5000);
    assert.equal(upward, row * 2);
    assert.equal(monthReleaseEdge(340, 0.05, row, 5000), null);
  });

  it("brakes early onto the line when a slowing coast would die in the upper part", () => {
    const y = 250;
    const velocity = 0.4;
    const plan = monthPredictiveBrake(y, velocity, row, 5000);
    assert.ok(plan);
    assert.equal(plan!.target, row * 2);
    assert.equal(plan!.curve, "coast");
    assert.ok(Math.abs(plan!.velocity - velocity) < 1e-6);
    assert.ok(plan!.durationMs >= 140);
    let pos = y;
    for (let t = 0; t <= plan!.durationMs; t += 16) {
      const next = monthCoastScrollTop(y, plan!.target, t, plan!.durationMs);
      assert.ok(next >= pos - 1e-6);
      assert.ok(next <= plan!.target + 1e-6);
      pos = next;
    }
    assert.equal(monthPredictiveBrake(340, 0.4, row, 5000), null);
    assert.equal(monthPredictiveBrake(200, 1.3, row, 5000), null);
    const up = monthPredictiveBrake(row * 2 + 90, -0.4, row, 5000);
    assert.ok(up);
    assert.equal(up!.target, row * 2);
    assert.ok(up!.velocity < 0);
    assert.ok(Math.abs(up!.velocity) <= 0.4 + 1e-6);
  });

  it("treats a shrinking wheel burst as a coast and a steady one as still driven", () => {
    assert.equal(monthWheelDecaying([12, 28, 45, 40, 32]), true);
    assert.equal(monthWheelDecaying([15, 15, 15, 15]), false);
    assert.equal(monthWheelDecaying([10, 40]), false);
    assert.equal(monthWheelDecaying([8, 20, 36]), false);
    assert.equal(monthWheelDecaying([80, 30, 30, 30, 30, 30, 30]), false);
    const late = monthPredictiveBrake(row * 2 - 10, 0.2, row, 5000);
    assert.ok(late);
    assert.equal(late!.target, row * 2);
    assert.ok(late!.durationMs >= 80);
    assert.ok(late!.durationMs < 140);
  });

  it("eases toward the next row while the wheel is slowing", () => {
    const fast = magneticScrollTop(0, 40, row, 5000);
    assert.ok(fast >= 39 && fast <= 41);
    const slowing = magneticScrollTop(30, 4, row, 5000);
    assert.ok(slowing > 34);
    assert.ok(slowing < row);
    const upward = magneticScrollTop(row + 40, -4, row, 5000);
    assert.ok(upward < row + 36);
    assert.ok(upward > row);
  });
});

describe("monthFlickDirection", () => {
  const focused = monthIndex(2026, 9);

  it("steps one month from the focused month on a short sharp flick", () => {
    const down = monthFlickDirection(
      [
        { t: 0, dy: 40 },
        { t: 16, dy: 52 },
        { t: 48, dy: 18 },
        { t: 96, dy: 8 },
      ],
      false,
    );
    assert.equal(down, 1);
    assert.equal(monthAfterFlick(focused, down), monthIndex(2026, 10));
    const up = monthFlickDirection(
      [
        { t: 0, dy: -30 },
        { t: 20, dy: -22 },
      ],
      true,
    );
    assert.equal(up, -1);
    assert.equal(monthAfterFlick(focused, up), monthIndex(2026, 8));
  });

  it("decides before the inertia tail, and leaves a sustained pan on the weeks", () => {
    assert.equal(
      classifyMonthWheel(
        [
          { t: 0, dy: 22 },
          { t: 16, dy: 48 },
          { t: 32, dy: 55 },
          { t: 80, dy: 14 },
          { t: 120, dy: 8 },
        ],
        false,
      ).action,
      "flick",
    );
    assert.equal(
      monthFlickDirection(
        [
          { t: 0, dy: 40 },
          { t: 16, dy: 48 },
          { t: 32, dy: 50 },
          { t: 64, dy: 16 },
          { t: 80, dy: 46 },
          { t: 180, dy: 42 },
        ],
        false,
      ),
      0,
    );
    assert.equal(
      monthFlickDirection(
        [
          { t: 0, dy: 24 },
          { t: 30, dy: 26 },
          { t: 60, dy: 28 },
          { t: 100, dy: 27 },
          { t: 160, dy: 26 },
        ],
        false,
      ),
      0,
    );
    assert.equal(monthFlickDirection([{ t: 0, dy: 12 }], true), 0);
    assert.equal(monthFlickDirection([{ t: 0, dy: 96 }], false), 0);
    assert.equal(monthFlickDirection([{ t: 0, dy: 96 }], true), 1);
  });

  it("jumps once from the month that was focused when the flick started", () => {
    const events: Array<[number, number]> = [
      [0, 22],
      [16, 48],
      [32, 55],
      [48, 36],
      [80, 14],
      [140, 6],
      [220, 3],
      [360, 1],
    ];
    let gesture = null;
    const jumps: number[] = [];
    for (const [t, dy] of events) {
      const step = reduceMonthWheel(gesture, t, dy, focused);
      gesture = step.gesture;
      if (step.jump != null) jumps.push(step.jump);
      assert.equal(step.gesture.focus, focused);
    }
    assert.deepEqual(jumps, [monthIndex(2026, 10)]);
    assert.equal(gesture?.mode, "month");
    const tail = reduceMonthWheel(gesture, 500, 60, monthIndex(2026, 11));
    assert.equal(tail.jump, null);
    assert.equal(tail.prevent, true);
    assert.equal(tail.gesture.focus, focused);

    const next = reduceMonthWheel(null, 2000, 40, monthIndex(2026, 10));
    const next2 = reduceMonthWheel(next.gesture, 2016, 56, monthIndex(2026, 10));
    const next3 = reduceMonthWheel(next2.gesture, 2080, 12, monthIndex(2026, 10));
    const next4 = reduceMonthWheel(next3.gesture, 2128, 8, monthIndex(2026, 10));
    assert.equal(next.jump, null);
    assert.equal(next4.jump, monthIndex(2026, 11));
    assert.equal(next4.gesture.focus, monthIndex(2026, 10));
  });

  it("still steps one month when a short burst goes quiet before it falls", () => {
    const opened = reduceMonthWheel(null, 0, -40, focused);
    const held = reduceMonthWheel(opened.gesture, 18, -32, focused);
    assert.equal(held.jump, null);
    assert.equal(held.apply, true);
    const closed = closeMonthWheel(held.gesture);
    assert.equal(closed.jump, monthIndex(2026, 8));
  });

  it("keeps a long scroll on the weeks instead of stepping a month per burst", () => {
    let gesture = null;
    const jumps: number[] = [];
    for (let i = 0; i < 40; i++) {
      const step = reduceMonthWheel(gesture, i * 16, 32, focused);
      gesture = step.gesture;
      if (step.jump != null) jumps.push(step.jump);
      assert.equal(step.apply, true);
    }
    assert.deepEqual(jumps, []);
    assert.equal(gesture?.mode, "pan");
  });
});

describe("month buffer", () => {
  it("grows when the viewport nears either end and holds in the middle", () => {
    assert.deepEqual(monthBufferExtension(0, 800, 30, 168, 4), {
      prepend: true,
      append: false,
    });
    assert.deepEqual(monthBufferExtension(4000, 800, 30, 168, 4), {
      prepend: false,
      append: true,
    });
    assert.deepEqual(monthBufferExtension(10 * 168, 800, 30, 168, 4), {
      prepend: false,
      append: false,
    });
  });

  it("measures a prepend as the weeks between the two month starts", () => {
    const sep = monthFromIndex(monthIndex(2026, 8));
    const oct = monthFromIndex(monthIndex(2026, 9));
    const pan = buildMonthPan(monthIndex(2026, 8), monthIndex(2026, 9));
    assert.equal(weeksBetweenMonthStarts(sep, oct), pan.monthStarts[1]?.week);
    assert.ok((pan.monthStarts[1]?.week ?? 0) > 0);
  });
});

describe("month virtual rows", () => {
  it("keeps the visible weeks and expands in the scroll direction", () => {
    assert.deepEqual(visibleWeekRows(168 * 3, 168 * 4, 168, 40), { start: 3, end: 6 });
    const down = monthRenderRange(3, 6, 40, 1);
    assert.ok(down.start <= 3);
    assert.ok(down.end > 6 + 2);
    assert.equal(monthMountCovers(4, 6, down.start, down.end), true);
  });
});
