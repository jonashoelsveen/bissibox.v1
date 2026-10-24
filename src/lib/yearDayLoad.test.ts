import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  YEAR_BUSY_GRADE_COUNT,
  YEAR_BUSY_STEP_MINUTES,
  yearBusyDarkShade,
  yearBusyDarkShadeForMinutes,
  yearBusyGrade,
  yearBusyLightness,
  yearBusyMinutesByDay,
  yearBusyShade,
  yearBusyShadeForMinutes,
  yearBusyShadeUsesLightText,
  yearDayKey,
} from "../components/calendar/yearDayLoad.ts";

describe("year day load grades", () => {
  it("uses eight grades on three-hour steps", () => {
    assert.equal(YEAR_BUSY_GRADE_COUNT, 8);
    assert.equal(YEAR_BUSY_STEP_MINUTES, 180);
    assert.equal(yearBusyGrade(0), 0);
    assert.equal(yearBusyGrade(179), 0);
    assert.equal(yearBusyGrade(180), 1);
    assert.equal(yearBusyGrade(8 * 60), 2);
    assert.equal(yearBusyGrade(12 * 60), 4);
    assert.equal(yearBusyGrade(21 * 60 - 1), 6);
    assert.equal(yearBusyGrade(21 * 60), 7);
    assert.equal(yearBusyGrade(24 * 60), 7);
  });

  it("leaves under 3 hours unshaded and paints 21 hours or more black", () => {
    const lights = Array.from({ length: 8 }, (_, grade) => yearBusyLightness(grade));
    assert.equal(lights[0], 1);
    assert.equal(lights[7], 0);
    assert.equal(yearBusyShade(0), null);
    assert.equal(yearBusyShade(7), "oklch(0.000 0 0)");
    const step = lights[0] - lights[1];
    for (let i = 1; i < lights.length; i++) {
      assert.ok(Math.abs(lights[i - 1] - lights[i] - step) < 1e-9);
      assert.equal(yearBusyShade(i), `oklch(${lights[i].toFixed(3)} 0 0)`);
    }
    assert.equal(yearBusyShadeUsesLightText(0), false);
    assert.equal(yearBusyShadeUsesLightText(3), false);
    assert.equal(yearBusyShadeUsesLightText(4), true);
    assert.equal(yearBusyShadeUsesLightText(7), true);
  });

  it("keeps an empty day white and paints any shorter session in the lightest grey", () => {
    assert.equal(yearBusyShadeForMinutes(0), null);
    const lowest = yearBusyShadeForMinutes(15);
    assert.equal(lowest, yearBusyShadeForMinutes(179));
    assert.equal(lowest, "oklch(0.929 0 0)");
    assert.equal(yearBusyShadeForMinutes(3 * 60), yearBusyShade(1));
    assert.equal(yearBusyShadeForMinutes(21 * 60), yearBusyShade(7));
  });

  it("reverses the scale in dark theme, from the canvas toward white", () => {
    assert.equal(yearBusyDarkShadeForMinutes(0), null);
    assert.equal(yearBusyDarkShade(0), null);
    const short = yearBusyDarkShadeForMinutes(15);
    assert.equal(short, yearBusyDarkShadeForMinutes(179));
    assert.equal(short, "color-mix(in oklch, white 7.1%, #0c0c0c)");
    assert.equal(yearBusyDarkShadeForMinutes(3 * 60), yearBusyDarkShade(1));
    assert.equal(yearBusyDarkShade(7), "color-mix(in oklch, white 100.0%, #0c0c0c)");
    const lights = [15, 3 * 60, 9 * 60, 15 * 60, 21 * 60].map(
      (minutes) => yearBusyDarkShadeForMinutes(minutes),
    );
    const whiteShare = lights.map((shade) => Number(shade!.match(/white ([0-9.]+)%/)?.[1]));
    for (let i = 1; i < whiteShare.length; i++) {
      assert.ok(whiteShare[i] > whiteShare[i - 1]);
    }
  });
});

describe("year day load minutes", () => {
  const day = new Date(2026, 9, 21);

  it("sums a normal session and ignores all-day and multi-day sessions", () => {
    const minutes = yearBusyMinutesByDay([
      { startISO: "2026-10-21T09:00:00", endISO: "2026-10-21T12:30:00", allDay: false },
      { startISO: "2026-10-21T00:00:00", endISO: "2026-10-21T23:59:00", allDay: true },
      { startISO: "2026-10-21T22:00:00", endISO: "2026-10-22T02:00:00", allDay: false },
      { startISO: "2026-10-20T09:00:00", endISO: "2026-10-22T17:00:00", allDay: false },
    ]);
    assert.equal(minutes.get(yearDayKey(day)), 3 * 60 + 30);
    assert.equal(minutes.get(yearDayKey(new Date(2026, 9, 20))), undefined);
    assert.equal(minutes.get(yearDayKey(new Date(2026, 9, 22))), undefined);
  });

  it("counts overlapping sessions once", () => {
    const minutes = yearBusyMinutesByDay([
      { startISO: "2026-10-21T09:00:00", endISO: "2026-10-21T12:00:00" },
      { startISO: "2026-10-21T11:00:00", endISO: "2026-10-21T14:00:00" },
      { startISO: "2026-10-21T16:00:00", endISO: "2026-10-21T17:00:00" },
    ]);
    assert.equal(minutes.get(yearDayKey(day)), 6 * 60);
    assert.equal(yearBusyGrade(minutes.get(yearDayKey(day))!), 2);
  });

  it("treats a same-day midnight end as a full timed day", () => {
    const minutes = yearBusyMinutesByDay([
      { startISO: "2026-10-21T00:00:00", endISO: "2026-10-22T00:00:00", allDay: false },
    ]);
    assert.equal(minutes.get(yearDayKey(day)), 24 * 60);
    assert.equal(yearBusyGrade(24 * 60), 7);
  });
});
