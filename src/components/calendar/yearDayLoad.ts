/**
 * Year-view day load.
 *
 * Eight grades, one per three hours of timed sessions on that calendar day.
 * No timed sessions stays white. Any session under 3 hours is the lightest
 * grey. 21 hours through 24 is black.
 * All-day and multi-day sessions contribute nothing.
 *
 * Painted steps are a neutral OKLCH grey. Lightness runs in equal steps
 * from white (no fill) to black.
 */

import { fromISOLocal } from "./dateUtils.ts";
import { isMultiDaySession, segmentTimedEventForDay } from "./multiDaySessions.ts";

export const YEAR_BUSY_GRADE_COUNT = 8;
/** Each grade covers this many minutes. 21 hours is the last step. */
export const YEAR_BUSY_STEP_MINUTES = 3 * 60;

/** No fill. The white year canvas shows through. */
const LIGHTEST_L = 1;
/** 21 hours or more. */
const DARKEST_L = 0;

export type YearBusySession = {
  startISO: string;
  endISO: string;
  allDay?: boolean;
};

export function yearDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** 0 = under 3 hours, 7 = 21 hours or more. */
export function yearBusyGrade(minutes: number): number {
  const safe = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return Math.min(
    YEAR_BUSY_GRADE_COUNT - 1,
    Math.floor(safe / YEAR_BUSY_STEP_MINUTES),
  );
}

/** OKLCH lightness for a grade. Equal steps from lightest to darkest. */
export function yearBusyLightness(grade: number): number {
  const clamped = Math.min(YEAR_BUSY_GRADE_COUNT - 1, Math.max(0, grade));
  const t = clamped / (YEAR_BUSY_GRADE_COUNT - 1);
  return LIGHTEST_L + (DARKEST_L - LIGHTEST_L) * t;
}

/** Null under 3 hours, so an empty grade stays white. Black from 21 hours up. */
export function yearBusyShade(grade: number): string | null {
  if (grade <= 0) return null;
  return `oklch(${yearBusyLightness(grade).toFixed(3)} 0 0)`;
}

/** Dark year canvas. Empty days stay this colour; busier days step toward white. */
const DARK_CANVAS = "#0c0c0c";

/**
 * Same grades as the light scale, reversed. Less time stays near the dark
 * canvas. 21 hours or more is white.
 */
export function yearBusyDarkShade(grade: number): string | null {
  if (grade <= 0) return null;
  const whitePct = ((1 - yearBusyLightness(grade)) * 100).toFixed(1);
  return `color-mix(in oklch, white ${whitePct}%, ${DARK_CANVAS})`;
}

/**
 * Day fill. No timed time stays white. A session under 3 hours uses the
 * lightest grey, halfway from white to the 3-hour shade. Longer days keep
 * their grade.
 */
export function yearBusyShadeForMinutes(minutes: number): string | null {
  if (!(minutes > 0)) return null;
  const grade = yearBusyGrade(minutes);
  if (grade > 0) return yearBusyShade(grade);
  const lowest = (LIGHTEST_L + yearBusyLightness(1)) / 2;
  return `oklch(${lowest.toFixed(3)} 0 0)`;
}

/** Dark-theme fill. Empty stays the canvas. Any session steps toward white. */
export function yearBusyDarkShadeForMinutes(minutes: number): string | null {
  if (!(minutes > 0)) return null;
  const grade = yearBusyGrade(minutes);
  if (grade > 0) return yearBusyDarkShade(grade);
  const lightLowest = (LIGHTEST_L + yearBusyLightness(1)) / 2;
  const whitePct = ((1 - lightLowest) * 100).toFixed(1);
  return `color-mix(in oklch, white ${whitePct}%, ${DARK_CANVAS})`;
}

/** The four darker steps need light type. */
export function yearBusyShadeUsesLightText(grade: number): boolean {
  return grade >= 4;
}

function unionMinutes(spans: Array<[number, number]>): number {
  if (spans.length === 0) return 0;
  const sorted = spans.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let total = 0;
  let lo = sorted[0][0];
  let hi = sorted[0][1];
  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i][0];
    const end = sorted[i][1];
    if (start <= hi) hi = Math.max(hi, end);
    else {
      total += hi - lo;
      lo = start;
      hi = end;
    }
  }
  return total + (hi - lo);
}

/**
 * Minutes of the day covered by normal sessions.
 * Overlaps count once. All-day and multi-day sessions are ignored.
 */
export function yearBusyMinutesByDay(
  events: readonly YearBusySession[],
): Map<string, number> {
  const spans = new Map<string, Array<[number, number]>>();
  for (const ev of events) {
    if (ev.allDay) continue;
    if (!ev.startISO || !ev.endISO) continue;
    const start = fromISOLocal(ev.startISO);
    const end = fromISOLocal(ev.endISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (isMultiDaySession(start, end)) continue;
    const seg = segmentTimedEventForDay(start, end, start);
    if (!seg || seg.endMin <= seg.startMin) continue;
    const key = yearDayKey(start);
    const list = spans.get(key);
    if (list) list.push([seg.startMin, seg.endMin]);
    else spans.set(key, [[seg.startMin, seg.endMin]]);
  }
  const out = new Map<string, number>();
  for (const [key, list] of spans) out.set(key, unionMinutes(list));
  return out;
}
