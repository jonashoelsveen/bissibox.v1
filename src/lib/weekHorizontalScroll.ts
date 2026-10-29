import { addDays, calendarDayDelta, startOfDay, startOfWeekMon } from "../components/calendar/dateUtils.ts";

/** Weeks rendered on each side of the anchored week. */
export const WEEK_PAN_WEEKS = 6;

/** Days kept in view. Column width is the viewport divided by this. */
export const WEEK_PAN_VISIBLE_DAYS = 7;

/**
 * Extra days mounted on each side of the viewport. Columns have to exist
 * before they slide in, without painting the whole pan buffer.
 */
export const WEEK_RENDER_OVERSCAN_DAYS = 5;

/**
 * Mounted days kept beyond the viewport before another window is built.
 * Remounting on every day the pan crosses forces a React render mid-gesture.
 */
export const WEEK_RENDER_EXPAND_SLACK = 2;

/** Extra days mounted ahead of the pan so one render covers the rest of a swipe. */
export const WEEK_MOUNT_LOOKAHEAD_DAYS = 10;

/** Wheel samples closer than this belong to one trackpad pan. */
export const WEEK_PAN_WHEEL_BURST_MS = 45;

export function weekPanBufferDays(extraWeeks = 0): number {
  return (WEEK_PAN_WEEKS * 2 + 1 + extraWeeks) * WEEK_PAN_VISIBLE_DAYS;
}

/** Monday `WEEK_PAN_WEEKS` before the week that contains `anchor`. */
export function weekPanOrigin(anchor: Date, extraWeeksBefore = 0): Date {
  const monday = startOfWeekMon(anchor);
  const shift = (WEEK_PAN_WEEKS + extraWeeksBefore) * WEEK_PAN_VISIBLE_DAYS;
  return startOfDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - shift));
}

/**
 * Column indexes whose day intersects the scrollport by more than a sliver.
 * A day that only touches the edge does not count as shown.
 */
export function visibleDayRange(
  scrollLeft: number,
  viewportWidth: number,
  dayWidth: number,
  dayCount: number,
): { start: number; end: number } {
  if (dayWidth <= 0 || dayCount <= 0 || viewportWidth <= 0) {
    return { start: 0, end: Math.max(0, dayCount - 1) };
  }
  const eps = 0.5;
  const start = Math.max(0, Math.floor((scrollLeft + eps) / dayWidth));
  const end = Math.min(dayCount - 1, Math.ceil((scrollLeft + viewportWidth - eps) / dayWidth) - 1);
  if (end < start)
    return { start: Math.min(start, dayCount - 1), end: Math.min(start, dayCount - 1) };
  return { start, end };
}

/**
 * The seven days the week view is showing. A partial column counts once it
 * covers more than half the viewport's first slot, so the window stays seven
 * days while the pan is between snaps.
 */
export function visibleWeekSpan(
  scrollLeft: number,
  dayWidth: number,
  dayCount: number,
  span = WEEK_PAN_VISIBLE_DAYS,
): { start: number; end: number } {
  if (dayCount <= 0) return { start: 0, end: 0 };
  const count = Math.max(1, Math.min(span, dayCount));
  if (dayWidth <= 0) return { start: 0, end: count - 1 };
  const maxStart = Math.max(0, dayCount - count);
  const start = Math.max(0, Math.min(maxStart, Math.round(scrollLeft / dayWidth)));
  return { start, end: Math.min(dayCount - 1, start + count - 1) };
}

/** First and last day drawn on a month grid, including the leading and trailing weeks. */
function monthGridBounds(year: number, month: number): { first: number; last: number } {
  const gridStart = startOfWeekMon(new Date(year, month, 1));
  const lastOfMonth = new Date(year, month + 1, 0);
  const lastDow = (lastOfMonth.getDay() + 6) % 7;
  const gridEnd = addDays(startOfDay(lastOfMonth), 6 - lastDow);
  return { first: gridStart.getTime(), last: startOfDay(gridEnd).getTime() };
}

/**
 * Month the mini calendar should show for a visible day span.
 * Prefers a month whose grid contains every day, then the month that holds
 * more of those days.
 */
export function miniMonthAnchorForSpan(start: Date, end: Date): Date {
  const days: Date[] = [];
  let cursor = startOfDay(start);
  const last = startOfDay(end).getTime();
  while (cursor.getTime() <= last && days.length < 14) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  if (days.length === 0) return startOfDay(start);
  const months: Date[] = [];
  const seen = new Set<number>();
  for (const day of days) {
    const key = day.getFullYear() * 12 + day.getMonth();
    if (seen.has(key)) continue;
    seen.add(key);
    months.push(new Date(day.getFullYear(), day.getMonth(), 1));
  }
  const spanStart = days[0]!.getTime();
  const spanEnd = days[days.length - 1]!.getTime();
  const fitting = months.filter((month) => {
    const bounds = monthGridBounds(month.getFullYear(), month.getMonth());
    return spanStart >= bounds.first && spanEnd <= bounds.last;
  });
  const pool = fitting.length > 0 ? fitting : months;
  let best = pool[0]!;
  let bestCount = -1;
  for (const month of pool) {
    const count = days.filter(
      (day) => day.getFullYear() === month.getFullYear() && day.getMonth() === month.getMonth(),
    ).length;
    if (count > bestCount) {
      best = month;
      bestCount = count;
    }
  }
  return best;
}

function monthKey(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

/**
 * Date that should drive the week title and the corner month.
 * The previous week stays while any of its days is visible, and the previous
 * month stays while any of its days is visible. The result is a visible day
 * in both the chosen week and the chosen month when one exists.
 * Returns `prev` unchanged when both are still represented.
 */
export function anchorDateForVisibleDays(prev: Date, visible: Date[]): Date {
  if (visible.length === 0) return prev;
  const prevWeek = startOfWeekMon(prev).getTime();
  const prevMonth = monthKey(prev);
  const weekKept = visible.some((d) => startOfWeekMon(d).getTime() === prevWeek);
  const monthKept = visible.some((d) => monthKey(d) === prevMonth);
  if (weekKept && monthKept) return prev;
  const weekOf = weekKept ? prevWeek : startOfWeekMon(visible[0]!).getTime();
  const monthOf = monthKept ? prevMonth : monthKey(visible[0]!);
  const match = visible.find(
    (d) => startOfWeekMon(d).getTime() === weekOf && monthKey(d) === monthOf,
  );
  return match ?? visible[0]!;
}

/**
 * The viewport still sits inside the mounted columns, far enough from the
 * edge that scrolling can continue without mounting more days.
 */
export function weekMountCovers(
  visibleStart: number,
  visibleEnd: number,
  mountStart: number,
  mountEnd: number,
  slack = WEEK_RENDER_EXPAND_SLACK,
): boolean {
  return visibleStart >= mountStart + slack && visibleEnd <= mountEnd - slack;
}

/**
 * Visible-column window biased in the pan direction. Overscan is applied
 * later; this only decides which days count as the window's core.
 */
export function weekMountWindow(
  visibleStart: number,
  visibleEnd: number,
  dayCount: number,
  direction: -1 | 0 | 1,
  extra = WEEK_MOUNT_LOOKAHEAD_DAYS,
): { start: number; end: number } {
  if (dayCount <= 0) return { start: 0, end: 0 };
  const last = dayCount - 1;
  const back = direction < 0 ? extra : 0;
  const forward = direction > 0 ? extra : 0;
  const start = Math.max(0, Math.min(visibleStart, last) - back);
  const end = Math.min(last, Math.max(visibleEnd, visibleStart, 0) + forward);
  return { start, end: Math.max(start, end) };
}

/** Inclusive column indexes to mount around the days currently in view. */
export function weekRenderRange(
  visibleStart: number,
  visibleEnd: number,
  dayCount: number,
  overscan = WEEK_RENDER_OVERSCAN_DAYS,
): { start: number; end: number } {
  if (dayCount <= 0) return { start: 0, end: 0 };
  const last = dayCount - 1;
  const start = Math.max(0, Math.min(visibleStart, last) - overscan);
  const end = Math.min(last, Math.max(visibleEnd, visibleStart, 0) + overscan);
  return { start, end: Math.max(start, end) };
}

/** Wheel delta in pixels. Line and page modes are not pixel deltas. */
export function wheelDeltaPixels(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 800;
  return delta;
}

/**
 * A mouse-wheel notch should step one day. Trackpad pans stay on the
 * browser's native scroll path: a burst of samples, or a delta outside
 * the size of one notch.
 */
export function weekPanWheelShouldStep(deltaPx: number, deltaMode: number, gapMs: number): boolean {
  if (deltaPx === 0 || gapMs <= WEEK_PAN_WHEEL_BURST_MS) return false;
  if (deltaMode !== 0) return true;
  const abs = Math.abs(deltaPx);
  return abs >= 40 && abs <= 180;
}

/**
 * Horizontal distance for one mouse-wheel notch.
 * Trackpad movement is not scaled here — the scroller tracks it natively,
 * one pixel per pixel. A notch advances most of one column, and the settle
 * finishes on the day boundary.
 */
export function weekPanWheelDelta(deltaPx: number, dayWidth = 0, discrete = false): number {
  if (deltaPx === 0) return 0;
  const sign = Math.sign(deltaPx);
  if (discrete) {
    const col = dayWidth > 0 ? dayWidth : 160;
    return sign * Math.min(col * 0.92, col);
  }
  return deltaPx;
}

/** Nearest day boundary, clamped to the scroll range. */
export function snapScrollLeft(scrollLeft: number, dayWidth: number, maxScroll: number): number {
  if (dayWidth <= 0) return 0;
  const snapped = Math.round(scrollLeft / dayWidth) * dayWidth;
  return Math.max(0, Math.min(maxScroll, snapped));
}

/**
 * Scroll offset of the next week, with Monday flush at the left.
 * From between weeks, this is the closest Monday in the drag direction.
 * From a week already on the left, this is one week further.
 */
export function nextWeekOriginScroll(
  scrollLeft: number,
  direction: -1 | 1,
  dayWidth: number,
  maxScroll: number,
  daysPerWeek = WEEK_PAN_VISIBLE_DAYS,
): number | null {
  if (dayWidth <= 0 || daysPerWeek <= 0) return null;
  const week = dayWidth * daysPerWeek;
  const max = Math.max(0, maxScroll);
  const y = Math.max(0, Math.min(max, scrollLeft));
  const last = Math.floor((max + 0.5) / week);
  const tops: number[] = [];
  for (let i = 0; i <= last; i++) tops.push(i * week);
  if (direction > 0) return tops.find((top) => top > y + 0.5) ?? null;
  for (let i = tops.length - 1; i >= 0; i--) {
    if (tops[i]! < y - 0.5) return tops[i]!;
  }
  return null;
}

/** How many days the anchored Monday sits from the buffer origin. */
export function mondayIndexInBuffer(origin: Date, anchor: Date): number {
  return calendarDayDelta(origin, startOfWeekMon(anchor));
}

/**
 * Day to keep when the view menu switches week → day.
 * Prefers the current day when it is already on screen, otherwise the same
 * weekday inside the visible week so the week does not jump.
 */
export function dateForWeekDayViewToggle(
  currentDate: Date,
  liveWeek: { start: Date; end: Date } | null,
): Date {
  const day = startOfDay(currentDate);
  if (!liveWeek) return day;
  const t = day.getTime();
  const start = startOfDay(liveWeek.start);
  const end = startOfDay(liveWeek.end);
  if (t >= start.getTime() && t <= end.getTime()) return day;
  const offset = calendarDayDelta(startOfWeekMon(day), day);
  const pinned = addDays(start, Math.max(0, Math.min(6, offset)));
  return pinned.getTime() <= end.getTime() ? pinned : start;
}
