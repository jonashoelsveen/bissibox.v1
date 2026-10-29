import { calendarDayDelta, startOfWeekMon } from "../components/calendar/dateUtils.ts";

/** Week row height in the diary month grid (five tile rows). */
export const MONTH_ROW_HEIGHT = 168;

/**
 * Calendar month week row. A day shows four sessions, or three plus “more”.
 */
export const CALENDAR_MONTH_ROW_HEIGHT = 136;

/** Months mounted on each side of the anchored month. */
export const MONTH_PAN_BUFFER = 3;

/** Months added when the viewport nears either end of the stack. */
export const MONTH_PAN_GROW = 2;

/** Extend the stack once the viewport is within this many weeks of an edge. */
export const MONTH_PAN_EDGE_WEEKS = 4;

/** Weeks mounted beyond the viewport on both sides. */
export const MONTH_RENDER_OVERSCAN = 2;

/** Weeks the viewport may travel inside the mounted window before another render. */
export const MONTH_RENDER_SLACK = 0;

/** Extra weeks mounted in the scroll direction so a long swipe does not rebuild the grid. */
export const MONTH_MOUNT_LOOKAHEAD = 14;

export type MonthIndex = { year: number; month: number };

export type MonthStart = { index: number; week: number };

export function monthIndex(year: number, month: number): number {
  return year * 12 + month;
}

export function monthFromIndex(index: number): MonthIndex {
  const year = Math.floor(index / 12);
  return { year, month: index - year * 12 };
}

export function monthPanSpanAround(index: number, buffer = MONTH_PAN_BUFFER): {
  first: number;
  last: number;
} {
  return { first: index - buffer, last: index + buffer };
}

/** Monday of the week that contains the 1st. That week is where the month starts. */
export function monthGridStart(year: number, month: number): Date {
  return startOfWeekMon(new Date(year, month, 1));
}

function weekDelta(from: Date, to: Date): number {
  return Math.round(calendarDayDelta(from, to) / 7);
}

/** Whole weeks from the earlier month's first week to the later month's first week. */
export function weeksBetweenMonthStarts(earlier: MonthIndex, later: MonthIndex): number {
  return weekDelta(
    monthGridStart(earlier.year, earlier.month),
    monthGridStart(later.year, later.month),
  );
}

export type MonthPan = {
  /** Monday of the first mounted week. */
  start: Date;
  weekCount: number;
  /** Each month's first week, as a row index in this stack. */
  monthStarts: MonthStart[];
};

/**
 * Continuous Monday–Sunday weeks from the first month through the last.
 * A week that contains two months is included once.
 */
export function buildMonthPan(firstIndex: number, lastIndex: number): MonthPan {
  const first = monthFromIndex(firstIndex);
  const last = monthFromIndex(lastIndex);
  const start = monthGridStart(first.year, first.month);
  const lastDay = new Date(last.year, last.month + 1, 0);
  const endMonday = startOfWeekMon(lastDay);
  const weekCount = weekDelta(start, endMonday) + 1;
  const monthStarts: MonthStart[] = [];
  for (let index = firstIndex; index <= lastIndex; index++) {
    const month = monthFromIndex(index);
    monthStarts.push({
      index,
      week: weekDelta(start, monthGridStart(month.year, month.month)),
    });
  }
  return { start, weekCount, monthStarts };
}

/**
 * The month whose first week has reached the vertical midpoint.
 * Crossing back above that line returns the previous month.
 */
export function focusedMonthAtMidpoint(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  monthStarts: MonthStart[],
): number {
  if (monthStarts.length === 0) return 0;
  const mid = scrollTop + (viewportHeight > 0 ? viewportHeight / 2 : 0);
  let focused = monthStarts[0]!.index;
  for (const month of monthStarts) {
    if (month.week * rowHeight <= mid) focused = month.index;
    else break;
  }
  return focused;
}

export type MonthFlickSample = { t: number; dy: number };

export type MonthWheelAction = "wait" | "flick" | "pan";

/**
 * One gesture lasts until the trackpad has actually gone quiet.
 * A long scroll stays inside this window, so it cannot be split into
 * a series of month flicks.
 */
export const MONTH_WHEEL_GAP_MS = 240;

export type MonthWheelGesture = {
  focus: number;
  start: number;
  last: number;
  samples: MonthFlickSample[];
  mode: "unknown" | "month" | "pan";
};

/**
 * Two different gestures:
 * - A pan keeps its speed. It follows the finger and never changes month on its own.
 * - A flick is short: a sharp opening that has already started to die within
 *   150ms. That is one month, from the month focused when the gesture began.
 * A single large tick is not a flick while more ticks may still be coming —
 * that is how a long scroll was being split into many month jumps.
 * `closed` is true once the burst has gone quiet.
 */
export function classifyMonthWheel(
  samples: MonthFlickSample[],
  closed: boolean,
): { action: MonthWheelAction; direction: -1 | 1; hold: boolean } {
  if (samples.length === 0) return { action: "wait", direction: 1, hold: false };
  const last = samples[samples.length - 1]!;

  let peak = 0;
  let peakAt = 0;
  let opening = 0;
  let openingCount = 0;
  for (const sample of samples) {
    const mag = Math.abs(sample.dy);
    if (mag >= peak) {
      peak = mag;
      peakAt = sample.t;
    }
    if (sample.t <= 120) {
      opening += sample.dy;
      openingCount += 1;
    }
  }

  const travel = Math.abs(opening);
  const direction: -1 | 1 = opening > 0 ? 1 : opening < 0 ? -1 : last.dy >= 0 ? 1 : -1;
  // Still driving after the opening. This gesture is a pan for good.
  if (last.t > 150) return { action: "pan", direction: 1, hold: false };

  const sharp = openingCount >= 2 && travel >= 48 && peak >= 24;
  // One soft tick is a dip in a long scroll. A flick has started to end:
  // two quiet ticks after the peak, and the gesture is still short.
  const quietAfterPeak = samples.filter(
    (sample) => sample.t >= peakAt + 32 && Math.abs(sample.dy) <= peak * 0.5,
  );
  const decayed = quietAfterPeak.length >= 2 && Math.abs(last.dy) <= peak * 0.5;
  if (sharp && last.t <= 150 && (decayed || closed)) return { action: "flick", direction, hold: false };
  // A short flick that arrived as one coalesced tick, and then stopped.
  if (closed && samples.length === 1 && peak >= 80) return { action: "flick", direction, hold: false };
  if (closed) return { action: "pan", direction: 1, hold: false };
  return { action: "wait", direction, hold: false };
}

/** Direction of a flick, or 0 while the burst is still a pan or undecided. */
export function monthFlickDirection(samples: MonthFlickSample[], closed: boolean): -1 | 1 | 0 {
  const classified = classifyMonthWheel(samples, closed);
  return classified.action === "flick" ? classified.direction : 0;
}

export type MonthWheelStep = {
  gesture: MonthWheelGesture;
  prevent: boolean;
  /** Add this wheel's delta to the scroll position. False while a month glide owns the burst. */
  apply: boolean;
  jump: number | null;
};

/**
 * Fold one wheel delta into the current gesture.
 * A flick jumps once, to the month after the one focused when the burst
 * started. Later deltas in that same burst are swallowed so inertia cannot
 * skip a second month or drag the glide off its target.
 */
export function reduceMonthWheel(
  gesture: MonthWheelGesture | null,
  now: number,
  dy: number,
  focused: number,
): MonthWheelStep {
  let current = gesture;
  if (!current || now - current.last > MONTH_WHEEL_GAP_MS) {
    current = { focus: focused, start: now, last: now, samples: [], mode: "unknown" };
  }
  current = { ...current, last: now };
  if (current.mode === "month") return { gesture: current, prevent: true, apply: false, jump: null };
  if (current.mode === "pan") return { gesture: current, prevent: true, apply: true, jump: null };

  const samples = [...current.samples, { t: now - current.start, dy }];
  current = { ...current, samples };
  const classified = classifyMonthWheel(samples, false);
  if (classified.action === "flick") {
    return {
      gesture: { ...current, mode: "month" },
      prevent: true,
      apply: false,
      jump: monthAfterFlick(current.focus, classified.direction),
    };
  }
  if (classified.action === "pan") {
    return { gesture: { ...current, mode: "pan" }, prevent: true, apply: true, jump: null };
  }
  return { gesture: current, prevent: true, apply: true, jump: null };
}

/** Quiet end of a burst that never got a falling sample. */
export function closeMonthWheel(gesture: MonthWheelGesture): { gesture: MonthWheelGesture; jump: number | null } {
  if (gesture.mode !== "unknown") return { gesture, jump: null };
  const classified = classifyMonthWheel(gesture.samples, true);
  if (classified.action !== "flick") return { gesture: { ...gesture, mode: "pan" }, jump: null };
  return {
    gesture: { ...gesture, mode: "month" },
    jump: monthAfterFlick(gesture.focus, classified.direction),
  };
}

/** The month a flick lands on: one step from the month that was focused. */
export function monthAfterFlick(focusedIndex: number, direction: -1 | 1): number {
  return focusedIndex + direction;
}

/** Scroll offset that puts a month's first week at the top of the view. */
export function scrollTopForMonthWeek(week: number, rowHeight: number): number {
  return Math.max(0, week) * rowHeight;
}

/** Top and bottom band that arms the first month pulse while a multi-day session is dragged. */
export const MONTH_CREATE_EDGE_PX = 50;

/**
 * After a month has pulsed, the pointer must stay this close to the rim for the
 * next month. A short move back toward the days leaves this band and cancels it.
 */
export const MONTH_CREATE_EDGE_RELEASE_PX = 20;

/**
 * Which edge the pointer is in. Once paging, only the tighter release band counts.
 * `startPastLine` waits to arm the top edge until the pointer is above `top`.
 * The bottom edge is unchanged. After the first pulse, the top release band
 * is measured from that same line.
 */
export function monthCreateEdgeZone(
  clientY: number,
  top: number,
  bottom: number,
  paging: boolean,
  startPastLine = false,
): -1 | 0 | 1 {
  const bottomBand = paging ? MONTH_CREATE_EDGE_RELEASE_PX : MONTH_CREATE_EDGE_PX;
  if (startPastLine) {
    const topBand = paging ? MONTH_CREATE_EDGE_RELEASE_PX : 0;
    if (clientY < top + topBand) return -1;
  } else {
    const band = paging ? MONTH_CREATE_EDGE_RELEASE_PX : MONTH_CREATE_EDGE_PX;
    if (clientY < top + band) return -1;
  }
  if (clientY > bottom - bottomBand) return 1;
  return 0;
}

/** Hover in the edge band before the first month pulse. */
export const MONTH_CREATE_PULSE_HOLD_MS = 400;

/** Time from the start of one month pulse to the start of the next, while the pointer stays at the edge. */
export const MONTH_CREATE_PULSE_INTERVAL_MS = 800;

/** Length of one month pulse. Fixed, so every month is a single glide. */
export const MONTH_CREATE_PULSE_MS = 520;

/**
 * Scroll offset of the next month whose first week should sit on the top row.
 * From between months, this is the closest 1st in the drag direction.
 * From a month that is already on the top row, this is one month further.
 */
export function nextMonthOriginScroll(
  scrollTop: number,
  direction: -1 | 1,
  rowHeight: number,
  monthStarts: { week: number }[],
  maxScroll: number,
): number | null {
  if (rowHeight <= 0 || monthStarts.length === 0) return null;
  const max = Math.max(0, maxScroll);
  const y = Math.max(0, Math.min(max, scrollTop));
  const tops = monthStarts
    .map((month) => Math.max(0, month.week) * rowHeight)
    .filter((top) => top <= max + 0.5)
    .sort((a, b) => a - b);
  if (direction > 0) return tops.find((top) => top > y + 0.5) ?? null;
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i]! < y - 0.5) return tops[i]!;
  }
  return null;
}

/** Duration of one month pulse. One ease for the whole month, not a chain of row steps. */
export function monthCreatePulseDuration(_distancePx = 0): number {
  return MONTH_CREATE_PULSE_MS;
}

/** Position along a month pulse. Rest at both ends, one determined move between them. */
export function monthCreatePulseScroll(
  from: number,
  target: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) return target;
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  if (t >= 1) return target;
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return from + (target - from) * eased;
}

/**
 * The next row in the scroll direction. Once the viewport has left a row,
 * it settles on the following one and does not return to the row just left.
 */
export function directionalSnapScrollTop(
  scrollTop: number,
  rowHeight: number,
  maxScroll: number,
  direction: -1 | 1,
  deadzone = 10,
): number {
  if (rowHeight <= 0) return 0;
  const max = Math.max(0, maxScroll);
  const y = Math.max(0, Math.min(max, scrollTop));
  const row = y / rowHeight;
  const base = direction > 0 ? Math.floor(row + 1e-6) : Math.ceil(row - 1e-6);
  const boundary = base * rowHeight;
  const progressed = direction > 0 ? y - boundary : boundary - y;
  if (progressed <= deadzone) return Math.max(0, Math.min(max, boundary));
  const next = direction > 0 ? base + 1 : base - 1;
  return Math.max(0, Math.min(max, next * rowHeight));
}

/**
 * Follow a wheel delta, and once it is slowing, ease toward the next row.
 * The pull happens on the deltas that are still arriving, so the row settles
 * before the finger has left the trackpad. A fast delta is applied unchanged.
 * The nudge never aims back at the row just left.
 */
export function magneticScrollTop(
  scrollTop: number,
  dy: number,
  rowHeight: number,
  maxScroll: number,
): number {
  if (rowHeight <= 0 || dy === 0) return scrollTop;
  const max = Math.max(0, maxScroll);
  const direction: -1 | 1 = dy > 0 ? 1 : -1;
  const moved = Math.max(0, Math.min(max, scrollTop + dy));
  const speed = Math.abs(dy);
  if (speed >= 32) return moved;
  const target = directionalSnapScrollTop(moved, rowHeight, max, direction, 0.5);
  const gap = target - moved;
  if (Math.abs(gap) <= 0.5) return moved;
  const pull = 0.1 + (1 - speed / 32) * 0.16;
  const step = gap * pull;
  const capped = Math.sign(step) * Math.min(Math.abs(step), 36);
  return Math.max(0, Math.min(max, moved + capped));
}

/**
 * Where a finished scroll lands.
 * The landing is always at or ahead of `scrollTop` in the travel direction.
 * A rest in the upper part of a row finishes on the next line forward.
 * It does not return to the line just left.
 */
export function monthSettleScrollTop(
  startTop: number,
  scrollTop: number,
  rowHeight: number,
  maxScroll: number,
): number {
  if (rowHeight <= 0) return 0;
  const max = Math.max(0, maxScroll);
  const y = Math.max(0, Math.min(max, scrollTop));
  const start = Math.max(0, Math.min(max, startTop));
  const direction: -1 | 1 = y >= start ? 1 : -1;
  return monthReleasePlan(y, 0, y, rowHeight, max, direction)?.target ?? y;
}

/**
 * Nearest week-row boundary. A row that is more than half cut off scrolls
 * away; otherwise that row settles fully into view. Clamped to the scroll range.
 */
export function snapScrollTop(scrollTop: number, rowHeight: number, maxScroll: number): number {
  if (rowHeight <= 0) return 0;
  const snapped = Math.round(scrollTop / rowHeight) * rowHeight;
  return Math.max(0, Math.min(Math.max(0, maxScroll), snapped));
}

/**
 * Landing when the user stops. Always the next week line in the travel
 * direction, never the row just left. Already on a line stays there.
 */
export function monthGestureTarget(
  _startTop: number,
  endTop: number,
  velocityPxPerMs: number,
  _elapsedMs: number,
  rowHeight: number,
  maxScroll: number,
): number {
  if (rowHeight <= 0) return 0;
  const max = Math.max(0, maxScroll);
  const y = Math.max(0, Math.min(max, endTop));
  const direction: -1 | 1 = velocityPxPerMs < 0 ? -1 : 1;
  const ahead = direction > 0
    ? Math.ceil((y - 1e-4) / rowHeight) * rowHeight
    : Math.floor((y + 1e-4) / rowHeight) * rowHeight;
  return Math.max(0, Math.min(max, ahead));
}

/**
 * How long the current speed would keep gliding, in milliseconds.
 * Remaining travel is about `speed * MONTH_COAST_TAU_MS`. The row settle
 * starts only once that travel fits in the gap to the next week line, so a
 * fast flick is left alone until it is actually slowing to a stop.
 */
export const MONTH_COAST_TAU_MS = 320;

/**
 * Entry speed in px/ms when the scroll has already stopped short of a line.
 * The glide then only slows down. It stays far below the speed a short ease
 * would need in order to rush the remaining row.
 */
export const MONTH_COAST_REST_SPEED = 0.18;

const MONTH_COAST_MAX_MS = 1600;

export type MonthCoastPlan = {
  target: number;
  durationMs: number;
  /** Signed px/ms at the first moment of the glide. Zero when `curve` is `ease`. */
  velocity: number;
  /**
   * `coast` slows down from the release speed and never speeds up.
   * `ease` is a settle from rest, used when the view has already stopped
   * short of a line and must finish forward.
   */
  curve?: "coast" | "ease";
};

/**
 * How a slowing month scroll finishes on the next week line.
 * While the view is still moving, this returns a plan only when a constant
 * slowdown from the current speed can reach that line. The plan keeps that
 * speed as its fastest moment. A faster scroll, one that would still pass
 * the line, returns null so the caller does not pull it forward.
 * When the view has already stopped, the glide eases in from a low fixed
 * speed and slows the rest of the way. It does not speed up mid-glide.
 */
export function monthCoastPlan(
  scrollTop: number,
  velocityPxPerMs: number,
  direction: -1 | 1,
  rowHeight: number,
  maxScroll: number,
  moving: boolean,
): MonthCoastPlan | null {
  if (rowHeight <= 0) return null;
  const max = Math.max(0, maxScroll);
  const y = Math.max(0, Math.min(max, scrollTop));
  const dir: -1 | 1 = velocityPxPerMs < -0.02 ? -1 : velocityPxPerMs > 0.02 ? 1 : direction;
  const target = monthGestureTarget(0, y, dir < 0 ? -1 : 1, 0, rowHeight, max);
  const gap = target - y;
  if (Math.abs(gap) <= 0.5) return { target: y, durationMs: 0, velocity: 0 };
  const toward = dir > 0 ? velocityPxPerMs : -velocityPxPerMs;
  const speed = toward > 0 ? toward : 0;
  if (moving) {
    if (speed < 0.02) return null;
    const coast = speed * MONTH_COAST_TAU_MS;
    if (coast > Math.abs(gap) + 0.5) return null;
    const duration = (2 * Math.abs(gap)) / speed;
    if (duration > MONTH_COAST_MAX_MS) return null;
    return { target, durationMs: duration, velocity: dir * speed };
  }
  const duration = Math.max(320, (2 * Math.abs(gap)) / MONTH_COAST_REST_SPEED);
  const entry = (2 * Math.abs(gap)) / duration;
  return { target, durationMs: duration, velocity: dir * entry };
}

/** Position along a constant slowdown that starts at peak speed and ends at rest. */
export function monthCoastScrollTop(
  from: number,
  target: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) return target;
  const u = Math.min(1, Math.max(0, elapsedMs) / durationMs);
  if (u >= 1) return target;
  const gap = target - from;
  return from + gap * (2 * u - u * u);
}

/**
 * Fraction of a week row, measured from the line the scroll is about to
 * cross, that should not be a resting place. A coast that would die there
 * slows onto that line instead, while the line is still ahead.
 */
export const MONTH_ROW_FIRST_PART = 0.5;

/** Shortest glide that still reads as a slowdown rather than a stop. */
const MONTH_BRAKE_MIN_MS = 80;

/** Longest glide that is still the end of this coast, not an early grab. */
const MONTH_BRAKE_MAX_MS = 680;

function clampScroll(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

/**
 * The week line that opens the upper part containing `end`, in the travel
 * direction. Null when `end` is on a line, or far enough into the row that
 * the row should be entered.
 */
function openingLineForRest(
  end: number,
  dir: -1 | 1,
  rowHeight: number,
  max: number,
): number | null {
  const rowStart = Math.floor((end + 1e-6) / rowHeight) * rowHeight;
  const into = end - rowStart;
  if (dir > 0) {
    if (into <= 0.5 || into > rowHeight * MONTH_ROW_FIRST_PART) return null;
    return clampScroll(rowStart, max);
  }
  if (into >= rowHeight - 0.5 || into < rowHeight * (1 - MONTH_ROW_FIRST_PART)) return null;
  return clampScroll(rowStart + rowHeight, max);
}

/** Next week line in the travel direction. A position already on a line stays. */
function forwardWeekLine(pos: number, dir: -1 | 1, rowHeight: number, max: number): number {
  const raw =
    dir > 0
      ? Math.ceil((pos - 1e-4) / rowHeight) * rowHeight
      : Math.floor((pos + 1e-4) / rowHeight) * rowHeight;
  return clampScroll(raw, max);
}

function lineStillAhead(line: number, from: number, dir: -1 | 1): boolean {
  return dir > 0 ? line >= from - 0.5 : line <= from + 0.5;
}

/**
 * The week line to hold when the coast would come to rest in the upper part
 * of a row, and that line is still ahead of `scrollTop`.
 * Null when the coast stops on a line, deep enough into a row that the row
 * should be entered, or the line is already behind the view.
 */
export function monthReleaseEdge(
  scrollTop: number,
  velocityPxPerMs: number,
  rowHeight: number,
  maxScroll: number,
): number | null {
  if (rowHeight <= 0 || Math.abs(velocityPxPerMs) < 0.008) return null;
  const max = Math.max(0, maxScroll);
  const y = clampScroll(scrollTop, max);
  const dir: -1 | 1 = velocityPxPerMs > 0 ? 1 : -1;
  const natural = clampScroll(y + velocityPxPerMs * MONTH_COAST_TAU_MS, max);
  const edge = openingLineForRest(natural, dir, rowHeight, max);
  if (edge == null || !lineStillAhead(edge, y, dir)) return null;
  if (Math.abs(edge - y) <= 0.5) return null;
  return edge;
}

/**
 * Landing chosen for a month scroll.
 * The rest point is `releaseTop + velocity * MONTH_COAST_TAU_MS`.
 * When that point falls in the upper part of a row and the line before it
 * is still ahead of `fromTop`, the glide slows onto that line and does not
 * enter the upper part. The entry speed stays the release speed, so the
 * handoff is a continuation that only decelerates.
 * Once the view has passed that line, the landing is the next line further
 * along. The target is never behind `fromTop`.
 * `curve` is `coast` while the release speed still carries the view, and
 * `ease` when the view has essentially stopped and must settle forward.
 */
export function monthReleasePlan(
  releaseTop: number,
  velocityPxPerMs: number,
  fromTop: number,
  rowHeight: number,
  maxScroll: number,
  direction: -1 | 1 = 1,
): MonthCoastPlan | null {
  if (rowHeight <= 0) return null;
  const max = Math.max(0, maxScroll);
  const release = clampScroll(releaseTop, max);
  const from = clampScroll(fromTop, max);
  const dir: -1 | 1 = velocityPxPerMs > 0.02 ? 1 : velocityPxPerMs < -0.02 ? -1 : direction;
  const moving = Math.abs(velocityPxPerMs) >= 0.02;
  const natural = clampScroll(release + velocityPxPerMs * MONTH_COAST_TAU_MS, max);
  const end = moving ? natural : from;
  const opening = openingLineForRest(end, dir, rowHeight, max);
  if (opening != null && Math.abs(opening - from) <= 0.5) {
    return { target: from, durationMs: 0, velocity: 0, curve: "coast" };
  }
  const holding = opening != null && lineStillAhead(opening, from, dir);
  const basis = moving ? (dir > 0 ? Math.max(from, end) : Math.min(from, end)) : from;
  let target = holding ? opening! : forwardWeekLine(basis, dir, rowHeight, max);
  if (!lineStillAhead(target, from, dir)) target = forwardWeekLine(from, dir, rowHeight, max);
  target = clampScroll(target, max);
  const gap = target - from;
  if (Math.abs(gap) <= 0.5 || (dir > 0 ? gap < 0 : gap > 0)) {
    return { target: from, durationMs: 0, velocity: 0, curve: "coast" };
  }
  const toward = velocityPxPerMs * gap > 0 ? Math.abs(velocityPxPerMs) : 0;
  const coastReach = toward * MONTH_COAST_TAU_MS;
  // Momentum that dies well short of the line is not a coast onto it.
  // Ease forward from rest instead of speeding up to cover the gap.
  // A held line is still ahead, so the current speed can finish on it.
  if (toward < 0.02 || (!holding && (toward < 0.08 || coastReach * 1.75 < Math.abs(gap)))) {
    const duration = Math.min(480, Math.max(240, Math.abs(gap) * 1.65));
    return { target, durationMs: duration, velocity: 0, curve: "ease" };
  }
  const naturalMs = (2 * Math.abs(gap)) / toward;
  const duration = holding
    ? Math.max(80, naturalMs)
    : Math.max(80, Math.min(naturalMs, (2 * Math.abs(gap)) / MONTH_COAST_REST_SPEED));
  const used = (2 * Math.abs(gap)) / duration;
  return { target, durationMs: duration, velocity: Math.sign(gap) * used, curve: "coast" };
}

/**
 * Take over a slowing month scroll while the week line is still ahead.
 * Returns a coast that starts at the current speed and ends at rest on the
 * line before the upper part. Null when that stop would be behind the view,
 * would have to change speed, or would be too short or too early to feel
 * like the end of the same gesture.
 */
export function monthPredictiveBrake(
  scrollTop: number,
  velocityPxPerMs: number,
  rowHeight: number,
  maxScroll: number,
): MonthCoastPlan | null {
  if (rowHeight <= 0 || Math.abs(velocityPxPerMs) < 0.05) return null;
  const dir: -1 | 1 = velocityPxPerMs > 0 ? 1 : -1;
  const edge = monthReleaseEdge(scrollTop, velocityPxPerMs, rowHeight, maxScroll);
  if (edge == null) return null;
  const distance = Math.abs(edge - scrollTop);
  const speed = Math.abs(velocityPxPerMs);
  const naturalMs = (2 * distance) / speed;
  if (naturalMs < MONTH_BRAKE_MIN_MS || naturalMs > MONTH_BRAKE_MAX_MS) return null;
  const plan = monthReleasePlan(scrollTop, velocityPxPerMs, scrollTop, rowHeight, maxScroll, dir);
  if (!plan || plan.curve === "ease" || Math.abs(plan.target - edge) > 0.5) return null;
  if ((plan.target - scrollTop) * dir <= 0) return null;
  if (Math.abs(Math.abs(plan.velocity) - speed) > 0.02) return null;
  return plan;
}

/**
 * A wheel burst has left its fastest tick and is slowing down.
 * Steady or still-building input is not a coast yet, so the view keeps
 * following the trackpad.
 */
export function monthWheelDecaying(deltas: number[]): boolean {
  if (deltas.length < 3) return false;
  const recent = deltas.slice(-6);
  const mags = recent.map((delta) => Math.abs(delta));
  const last = mags[mags.length - 1]!;
  const prev = mags[mags.length - 2]!;
  const prev2 = mags[mags.length - 3]!;
  if (last > prev * 1.08 || prev > prev2 * 1.08) return false;
  let peak = 0;
  for (const mag of mags) if (mag > peak) peak = mag;
  if (peak < 6) return false;
  return last <= peak * 0.85 && last <= prev * 1.02;
}

/** Signed px/ms along `monthCoastScrollTop`. Falls to zero and never rises. */
export function monthCoastVelocity(
  from: number,
  target: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) return 0;
  const u = Math.min(1, Math.max(0, elapsedMs) / durationMs);
  if (u >= 1) return 0;
  return ((target - from) * (2 - 2 * u)) / durationMs;
}

/**
 * Launch speed for the settle. Speed aimed away from the next line is dropped,
 * and speed aimed at it is limited so the ease slows into the line.
 */
export function monthSettleVelocity(
  from: number,
  target: number,
  velocityPxPerMs: number,
  omega = 8,
): number {
  const gap = target - from;
  if (Math.abs(gap) <= 0.5) return 0;
  if (Math.sign(velocityPxPerMs) !== Math.sign(gap)) return 0;
  const critical = (gap * omega) / 1000;
  return Math.abs(velocityPxPerMs) > Math.abs(critical) ? critical : velocityPxPerMs;
}

/**
 * Critically damped spring toward `target`. Time is milliseconds and
 * velocity is px/ms. A lower omega makes the end of the glide slower.
 */
export function monthSpringScrollTop(
  from: number,
  velocityPxPerMs: number,
  target: number,
  elapsedMs: number,
  omega = 8,
): { position: number; velocity: number } {
  const dt = Math.max(0, elapsedMs) / 1000;
  const velocity = velocityPxPerMs * 1000;
  const offset = from - target;
  const slope = velocity + offset * omega;
  const decay = Math.exp(-omega * dt);
  const position = target + (offset + slope * dt) * decay;
  const nextVelocity = (slope - omega * (offset + slope * dt)) * decay;
  return { position, velocity: nextVelocity / 1000 };
}

/** Inclusive week rows that intersect the viewport. */
export function visibleWeekRows(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  weekCount: number,
): { start: number; end: number } {
  if (weekCount <= 0) return { start: 0, end: 0 };
  if (rowHeight <= 0) return { start: 0, end: weekCount - 1 };
  const last = weekCount - 1;
  const start = Math.max(0, Math.min(last, Math.floor(Math.max(0, scrollTop) / rowHeight)));
  if (viewportHeight <= 0) return { start, end: Math.min(last, start + 5) };
  const end = Math.max(
    start,
    Math.min(last, Math.ceil((scrollTop + viewportHeight) / rowHeight) - 1),
  );
  return { start, end };
}

/** The mounted rows still surround the viewport, with room to scroll either way. */
export function monthMountCovers(
  visibleStart: number,
  visibleEnd: number,
  mountStart: number,
  mountEnd: number,
  slack = MONTH_RENDER_SLACK,
): boolean {
  return visibleStart >= mountStart + slack && visibleEnd <= mountEnd - slack;
}

/** Week rows to mount around the viewport, with extra rows in the scroll direction. */
export function monthRenderRange(
  visibleStart: number,
  visibleEnd: number,
  weekCount: number,
  direction: -1 | 0 | 1 = 0,
  overscan = MONTH_RENDER_OVERSCAN,
  lookahead = MONTH_MOUNT_LOOKAHEAD,
): { start: number; end: number } {
  if (weekCount <= 0) return { start: 0, end: 0 };
  const last = weekCount - 1;
  const back = overscan + (direction < 0 ? lookahead : 0);
  const forward = overscan + (direction > 0 ? lookahead : 0);
  const start = Math.max(0, Math.min(visibleStart, last) - back);
  const end = Math.min(last, Math.max(visibleEnd, visibleStart, 0) + forward);
  return { start, end: Math.max(start, end) };
}

/**
 * The viewport is close enough to a stack edge that more months should be mounted.
 * `prepend` means weeks are added above the current origin.
 */
export function monthBufferExtension(
  scrollTop: number,
  viewportHeight: number,
  weekCount: number,
  rowHeight: number,
  edgeWeeks = MONTH_PAN_EDGE_WEEKS,
): { prepend: boolean; append: boolean } {
  if (weekCount <= 0 || rowHeight <= 0) return { prepend: false, append: false };
  const edge = edgeWeeks * rowHeight;
  const total = weekCount * rowHeight;
  const view = Math.max(0, viewportHeight);
  return {
    prepend: scrollTop < edge,
    append: total - (scrollTop + view) < edge,
  };
}
