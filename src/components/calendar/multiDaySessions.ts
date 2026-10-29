/**
 * Multi-day calendar sessions — span, segment, and lane helpers.
 *
 * Persistence is still one startISO/endISO. Next-day 00:00 is the existing
 * 24:00-on-start-day convention and is not treated as a second calendar day.
 */

import {
  addDays,
  calendarDayDelta,
  fromISOLocal,
  sameDay,
  setHM,
  startOfDay,
  startOfWeekMon,
  toISOLocal,
} from "./dateUtils.ts";

const DAY_MINUTES = 24 * 60;

export function clockMins(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** True when end is next-day 00:00, i.e. 24:00 on the start day. */
export function isMidnightEndNextDay(start: Date, end: Date): boolean {
  return clockMins(end) === 0 && calendarDayDelta(start, end) === 1;
}

export function sessionInclusiveEndDay(start: Date, end: Date): Date {
  if (clockMins(end) === 0 && !sameDay(start, end)) {
    return startOfDay(addDays(end, -1));
  }
  return startOfDay(end);
}

export function sessionDayCount(start: Date, end: Date): number {
  return Math.max(
    1,
    calendarDayDelta(startOfDay(start), sessionInclusiveEndDay(start, end)) + 1,
  );
}

export function isMultiDaySession(start: Date, end: Date): boolean {
  return sessionDayCount(start, end) > 1;
}

/**
 * One day running 00:00–24:00. Next-day 00:00 is 24:00 on the start day,
 * not a second day. A shorter span that merely ends at midnight stays timed.
 */
export function isFullDayTimedSpan(start: Date, end: Date): boolean {
  if (clockMins(start) !== 0) return false;
  if (isMultiDaySession(start, end)) return false;
  return isMidnightEndNextDay(start, end);
}

/** True when a week/day create-drag covers every minute from 00:00 through 24:00. */
export function timedMarkCoversFullDay(startMin: number, endMin: number): boolean {
  return startMin <= 0 && endMin >= DAY_MINUTES;
}

/** Move a 00:00–24:00 timed span into the all-day row (00:00–23:59, all-day). */
export function promoteFullDayTimedSpan(
  startISO: string,
  endISO: string,
): { startISO: string; endISO: string; allDay: true } | null {
  if (!startISO || !endISO) return null;
  const start = fromISOLocal(startISO);
  const end = fromISOLocal(endISO);
  if (!isFullDayTimedSpan(start, end)) return null;
  const day = startOfDay(start);
  return {
    startISO: toISOLocal(setHM(day, 0, 0)),
    endISO: toISOLocal(setHM(day, 23, 59)),
    allDay: true,
  };
}

/** Timed week/day all-day row: all-day sessions and true multi-day spans. */
export function isAllDayBandEvent(ev: {
  allDay?: boolean;
  startISO: string;
  endISO: string;
}): boolean {
  if (ev.allDay) return true;
  if (!ev.startISO || !ev.endISO) return false;
  return isMultiDaySession(fromISOLocal(ev.startISO), fromISOLocal(ev.endISO));
}

/** Empty-title label. All-day and multi-day spans are events; timed stays a session. */
export function untitledCalendarTitle(allDayOrMultiDay: boolean): string {
  return allDayOrMultiDay ? "New event" : "New session";
}

/** Visible day-column span for a session in week (7) or day (1) view. */
export function bandEventColumns(
  start: Date,
  end: Date,
  weekDates: Date[],
): { startCol: number; endCol: number } | null {
  let startCol = -1;
  let endCol = -1;
  for (let i = 0; i < weekDates.length; i++) {
    if (!eventCoversDay(start, end, weekDates[i])) continue;
    if (startCol < 0) startCol = i;
    endCol = i;
  }
  if (startCol < 0) return null;
  return { startCol, endCol };
}

/** Menu from/to dates (clocks ignored). */
export function isMultiDayDateRange(start: Date, end: Date): boolean {
  return calendarDayDelta(startOfDay(start), startOfDay(end)) >= 1;
}

export function eventCoversDay(start: Date, end: Date, day: Date): boolean {
  const lo = startOfDay(start).getTime();
  const hi = sessionInclusiveEndDay(start, end).getTime();
  const t = startOfDay(day).getTime();
  return t >= lo && t <= hi;
}

export type TimedDaySegment = {
  startMin: number;
  endMin: number;
  kind: "start" | "middle" | "last" | "single";
};

/**
 * Minutes-from-midnight on `day` for painting a timed session.
 * Continuation days cover 00:00–24:00 (or 00:00–end clock on the last day).
 */
export function segmentTimedEventForDay(
  start: Date,
  end: Date,
  day: Date,
): TimedDaySegment | null {
  if (!eventCoversDay(start, end, day)) return null;
  const startDay = startOfDay(start);
  const lastDay = sessionInclusiveEndDay(start, end);
  const single = sameDay(startDay, lastDay);
  const startMinClock = clockMins(start);
  let endMinClock = clockMins(end);
  if (endMinClock === 0 && !sameDay(start, end)) endMinClock = DAY_MINUTES;

  if (single) {
    return {
      startMin: startMinClock,
      endMin: endMinClock === 0 ? DAY_MINUTES : endMinClock,
      kind: "single",
    };
  }
  if (sameDay(day, startDay)) {
    return { startMin: startMinClock, endMin: DAY_MINUTES, kind: "start" };
  }
  if (sameDay(day, lastDay)) {
    return { startMin: 0, endMin: endMinClock === 0 ? DAY_MINUTES : endMinClock, kind: "last" };
  }
  return { startMin: 0, endMin: DAY_MINUTES, kind: "middle" };
}

/** Clocks for the session menu wheels (0–1440 on each endpoint day). */
export function sessionMenuClockRange(
  start: Date,
  end: Date,
): { startMin: number; endMin: number } {
  const startMin = clockMins(start);
  if (!isMultiDaySession(start, end)) {
    let endMin = clockMins(end);
    if (!sameDay(start, end)) endMin += calendarDayDelta(start, end) * DAY_MINUTES;
    return { startMin, endMin };
  }
  let endMin = clockMins(end);
  if (endMin === 0) endMin = DAY_MINUTES;
  return { startMin, endMin };
}

export function isoFromMenuClocks(
  startDay: Date,
  endDay: Date,
  startMin: number,
  endMin: number,
): { startISO: string; endISO: string } {
  const from = startOfDay(startDay);
  const to = startOfDay(endDay);
  const [lo, hi] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
  const nextStart = setHM(
    lo,
    Math.floor(startMin / 60),
    startMin % 60,
  );
  const same = sameDay(lo, hi);
  let nextEnd: Date;
  if (endMin >= DAY_MINUTES) {
    nextEnd = setHM(addDays(hi, 1), 0, 0);
  } else {
    nextEnd = setHM(hi, Math.floor(endMin / 60), endMin % 60);
    if (same && nextEnd.getTime() <= nextStart.getTime()) {
      nextEnd = setHM(addDays(lo, 1), 0, 0);
    }
  }
  return { startISO: toISOLocal(nextStart), endISO: toISOLocal(nextEnd) };
}

/** Keep clocks; move start onto `startDate` and end onto `endDate`. */
export function isoRangeOnDates(
  startISO: string,
  endISO: string,
  startDate: Date,
  endDate: Date,
): { startISO: string; endISO: string } {
  const start = fromISOLocal(startISO);
  const end = fromISOLocal(endISO);
  const { startMin, endMin } = sessionMenuClockRange(start, end);
  return isoFromMenuClocks(startDate, endDate, startMin, endMin);
}

/**
 * Width resize of a session that already lives in the all-day / multi-day row.
 * Every resulting width stays in that row. A one-day result is an all-day chip
 * (00:00–23:59). A midnight-to-midnight span shortened to one day would otherwise
 * become a 00:00–24:00 block in the hour grid.
 */
export function bandWidthResizeResult(
  startISO: string,
  endISO: string,
  allDay: boolean,
  nextStart: Date,
  nextEnd: Date,
): { startISO: string; endISO: string; allDay: boolean } {
  const shifted = isoRangeOnDates(startISO, endISO, nextStart, nextEnd);
  const start = fromISOLocal(shifted.startISO);
  const end = fromISOLocal(shifted.endISO);
  if (isMultiDaySession(start, end)) {
    return { startISO: shifted.startISO, endISO: shifted.endISO, allDay };
  }
  const day = startOfDay(start);
  return {
    startISO: toISOLocal(setHM(day, 0, 0)),
    endISO: toISOLocal(setHM(day, 23, 59)),
    allDay: true,
  };
}

export type MonthSpanLaneEvent = {
  id: string;
  start: Date;
  end: Date;
  /** Older sessions (smaller index) claim a lane first and stay above newer ones. */
  sortIndex?: number;
};

export function monthSpanSort(a: MonthSpanLaneEvent, b: MonthSpanLaneEvent): number {
  const ia = a.sortIndex ?? 0;
  const ib = b.sortIndex ?? 0;
  if (ia !== ib) return ia - ib;
  const da = sessionDayCount(a.start, a.end);
  const db = sessionDayCount(b.start, b.end);
  if (db !== da) return db - da;
  const ae = sessionInclusiveEndDay(a.start, a.end).getTime();
  const be = sessionInclusiveEndDay(b.start, b.end).getTime();
  if (ae !== be) return ae - be;
  return a.id.localeCompare(b.id);
}

export type MonthWeekSpan = {
  id: string;
  startCol: number;
  endCol: number;
  lane: number;
};

export type AllDayBandSpan = {
  id: string;
  startCol: number;
  endCol: number;
  lane: number;
};

/**
 * Stack all-day and multi-day sessions in the week/day band.
 * Older sessions claim a lane first, so a newly created session stays under
 * the ones already there — the same lane as its create placeholder. Sessions
 * that do not cover the same day still share a lane, and a span keeps one
 * lane across every day it covers.
 */
export function layoutAllDayBand(
  events: Array<{ id: string; startCol: number; endCol: number; sortIndex?: number }>,
): { spans: AllDayBandSpan[]; laneCount: number } {
  const items = events.filter((ev) => ev.startCol >= 0 && ev.endCol >= ev.startCol);
  items.sort((a, b) => {
    const ia = a.sortIndex ?? 0;
    const ib = b.sortIndex ?? 0;
    if (ia !== ib) return ia - ib;
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    const spanA = a.endCol - a.startCol;
    const spanB = b.endCol - b.startCol;
    if (spanA !== spanB) return spanB - spanA;
    return a.id.localeCompare(b.id);
  });
  const lanes: Array<Array<{ startCol: number; endCol: number }>> = [];
  const spans: AllDayBandSpan[] = [];
  for (const ev of items) {
    let lane = lanes.findIndex((occupied) =>
      occupied.every((span) => span.endCol < ev.startCol || span.startCol > ev.endCol),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push({ startCol: ev.startCol, endCol: ev.endCol });
    spans.push({ id: ev.id, startCol: ev.startCol, endCol: ev.endCol, lane });
  }
  return { spans, laneCount: lanes.length };
}

/**
 * Pack only the sessions that cross the days on screen.
 * A session that sits entirely outside that range does not keep a row.
 */
export function layoutVisibleAllDayBand(
  events: Array<{ id: string; startCol: number; endCol: number; sortIndex?: number }>,
  visibleStart: number,
  visibleEnd: number,
): { spans: AllDayBandSpan[]; laneCount: number } {
  return layoutAllDayBand(
    events.filter((ev) => ev.endCol >= visibleStart && ev.startCol <= visibleEnd),
  );
}

/** Close lanes nothing occupies, keeping the order of the lanes that remain. */
export function compactAllDayBandLanes(spans: AllDayBandSpan[]): {
  spans: AllDayBandSpan[];
  laneCount: number;
} {
  if (spans.length === 0) return { spans: [], laneCount: 0 };
  const used = [...new Set(spans.map((span) => span.lane))].sort((a, b) => a - b);
  const map = new Map(used.map((lane, index) => [lane, index]));
  return {
    spans: spans.map((span) => ({ ...span, lane: map.get(span.lane) ?? 0 })),
    laneCount: used.length,
  };
}

/**
 * Column under a horizontal drag, matching timed-session column snap:
 * round the pointer travel to a column, then keep that column inside the week.
 */
export function bandDragTargetColumn(
  grabCol: number,
  dx: number,
  colWidth: number,
  columnCount: number,
): number {
  const last = Math.max(0, columnCount - 1);
  const colW = colWidth > 0 ? colWidth : 1;
  const colShift = Math.round(dx / colW);
  return Math.max(0, Math.min(last, grabCol + colShift));
}

/**
 * Days covered by a click-drag that starts in the week all-day row.
 * One column is not a multi-day create. Pointer Y is not an input: the
 * hour grid must not scroll while this gesture is held.
 */
export function bandCreateSpan(
  originCol: number,
  pointerCol: number,
): { startCol: number; endCol: number } | null {
  if (originCol < 0 || pointerCol < 0 || originCol === pointerCol) return null;
  return {
    startCol: Math.min(originCol, pointerCol),
    endCol: Math.max(originCol, pointerCol),
  };
}

/**
 * Single-day all-day bars can be dragged down into the hour grid.
 * Week view also shifts them sideways. A sideways drag must not take the
 * hour-grid path just because the pointer slips below the short band.
 * Day view (`canShift` false) still converts as soon as the pointer enters
 * the hour grid.
 */
export function bandDragWantsTimeDrop(input: {
  canDragOut: boolean;
  canShift: boolean;
  dx: number;
  dy: number;
  pointerY: number;
  scrollerTop: number;
  thresholdPx?: number;
}): boolean {
  if (!input.canDragOut) return false;
  if (input.pointerY < input.scrollerTop) return false;
  if (!input.canShift) return true;
  const threshold = input.thresholdPx ?? 12;
  if (input.pointerY < input.scrollerTop + threshold) return false;
  return input.dy > threshold && input.dy > Math.abs(input.dx);
}

/** Visible columns after shifting a span by `dayDelta`, clipped to the week. */
export function shiftedBandColumns(
  startCol: number,
  endCol: number,
  dayDelta: number,
  columnCount: number,
): { startCol: number; endCol: number } | null {
  const last = Math.max(0, columnCount - 1);
  const start = startCol + dayDelta;
  const end = endCol + dayDelta;
  const visStart = Math.max(0, start);
  const visEnd = Math.min(last, end);
  if (visStart > visEnd) return null;
  return { startCol: visStart, endCol: visEnd };
}

function laneIndexAtFraction(laneCount: number, fraction: number): number {
  const n = Math.max(1, laneCount);
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return Math.min(n - 1, Math.floor(f * n));
}

/**
 * Lane for a create placeholder in the all-day row.
 * `cursorFrac` is the pointer's Y inside the band (0 top, 1 bottom).
 * The pointer may only land in a lane that already exists on the days under
 * the drag. Dragging further down does not open empty rows. If every one of
 * those lanes is taken, the placeholder goes in the row directly under that
 * stack, never on top of a session. A null fraction keeps the lowest free
 * lane and may open one when every existing lane is taken.
 * `preferLane` pins a placeholder that already chose a lane, so saving the
 * name does not move it.
 */
export function allDayBandLaneAtCursor(
  spans: Array<{ startCol: number; endCol: number; lane: number }>,
  startCol: number,
  endCol: number,
  cursorFrac: number | null,
  preferLane?: number | null,
): number {
  const taken = new Set<number>();
  let laneCount = 0;
  for (const span of spans) {
    laneCount = Math.max(laneCount, span.lane + 1);
    if (span.endCol < startCol || span.startCol > endCol) continue;
    taken.add(span.lane);
  }
  const free: number[] = [];
  for (let lane = 0; lane < laneCount; lane++) {
    if (!taken.has(lane)) free.push(lane);
  }
  // A create-drag may only sit in lanes that already exist on the days it
  // covers. The pointer's row is read from the full band, then clamped so a
  // busier day elsewhere cannot offer extra rows here.
  if (cursorFrac != null && !(preferLane != null && preferLane >= 0)) {
    let local = 1;
    for (const span of spans) {
      if (span.endCol < startCol || span.startCol > endCol) continue;
      local = Math.max(local, span.lane + 1);
    }
    const visual = laneIndexAtFraction(Math.max(local, laneCount, 1), cursorFrac);
    const wantLocal = Math.min(visual, local - 1);
    if (!taken.has(wantLocal)) return wantLocal;
    for (let lane = local - 1; lane >= 0; lane--) {
      if (!taken.has(lane)) return lane;
    }
    return local;
  }
  const want =
    preferLane != null && preferLane >= 0
      ? preferLane
      : null;
  if (want != null && want <= laneCount && !taken.has(want)) return want;
  if (want != null) {
    if (free.length > 0) return free[free.length - 1];
    return laneCount;
  }
  if (free.length > 0) return free[0];
  return laneCount;
}

/** Lowest lane with no session covering [startCol, endCol]. */
export function allDayBandLaneForRange(
  spans: Array<{ startCol: number; endCol: number; lane: number }>,
  startCol: number,
  endCol: number,
): number {
  return allDayBandLaneAtCursor(spans, startCol, endCol, null);
}

export type MonthCellTileBudget = {
  /** Lane slots reserved from the top. Hidden bars do not keep a gap. */
  visibleSpanLanes: number;
  /** Single-day chips to show. In-list preview chips are already reserved. */
  maxChips: number;
  /** Hidden multi-day bars plus hidden single-day chips. */
  overflow: number;
  /** Bars whose lane is this or higher are not drawn. */
  spanLaneLimit: number;
};

/**
 * Row for a new multi-day bar: directly under the other multi-day bars.
 * Single-day tiles stay below it. A full stack keeps the bar in the last
 * tile row so “+ more” can sit beneath it.
 */
export function monthCreatePlaceholderLane(multiDayRows: number, maxRows = 4): number {
  const natural = Math.max(0, multiDayRows);
  if (natural + 1 <= maxRows) return natural;
  return Math.min(natural, Math.max(0, maxRows - 2));
}

/**
 * A calendar month cell holds four tiles, or three plus “+ more”.
 * Multi-day lanes take the top rows. A drag placeholder sits under those
 * bars and above the single-day tiles, matching week view.
 */
export function monthCellTileBudget(input: {
  maxRows: number;
  spanLanes: number[];
  itemCount: number;
  previewSlots: number;
  /** Set while a multi-day create bar covers this day. */
  placeholderLane?: number | null;
}): MonthCellTileBudget {
  const lanes = input.spanLanes.filter((lane) => Number.isFinite(lane) && lane >= 0);
  const laneDepth = lanes.length === 0 ? 0 : Math.max(...lanes) + 1;
  const placeholder =
    input.placeholderLane != null && input.placeholderLane >= 0
      ? input.placeholderLane
      : null;
  if (placeholder == null) {
    const total = laneDepth + input.itemCount + input.previewSlots;
    const overflowing = total > input.maxRows;
    const tileRows = Math.max(0, overflowing ? input.maxRows - 1 : input.maxRows);
    const shown = lanes.filter((lane) => lane < tileRows);
    const visibleSpanLanes = shown.length === 0 ? 0 : Math.max(...shown) + 1;
    const maxChips = Math.max(0, tileRows - visibleSpanLanes - input.previewSlots);
    const hiddenSpans = lanes.filter((lane) => lane >= tileRows).length;
    const hiddenItems = Math.max(0, input.itemCount - maxChips);
    return {
      visibleSpanLanes,
      maxChips,
      overflow: hiddenSpans + hiddenItems,
      spanLaneLimit: tileRows,
    };
  }
  const barRows = placeholder + 1;
  const hiddenSpans = lanes.filter((lane) => lane >= placeholder).length;
  const needsMore =
    hiddenSpans > 0 || barRows + input.itemCount + input.previewSlots > input.maxRows;
  const tileRows = Math.max(0, needsMore ? input.maxRows - 1 : input.maxRows);
  const visibleSpanLanes = Math.min(barRows, tileRows);
  const maxChips = Math.max(
    0,
    Math.min(input.itemCount, tileRows - visibleSpanLanes - input.previewSlots),
  );
  const hiddenItems = Math.max(0, input.itemCount - maxChips);
  return {
    visibleSpanLanes,
    maxChips,
    overflow: hiddenSpans + hiddenItems,
    spanLaneLimit: placeholder,
  };
}

/** Column runs where a week-long bar is allowed to stay inside the cell. */
export function contiguousColumnsWhere(
  startCol: number,
  endCol: number,
  show: (col: number) => boolean,
): Array<{ startCol: number; endCol: number }> {
  const runs: Array<{ startCol: number; endCol: number }> = [];
  let runStart: number | null = null;
  for (let col = startCol; col <= endCol; col++) {
    if (show(col)) {
      if (runStart == null) runStart = col;
    } else if (runStart != null) {
      runs.push({ startCol: runStart, endCol: col - 1 });
      runStart = null;
    }
  }
  if (runStart != null) runs.push({ startCol: runStart, endCol });
  return runs;
}

/**
 * Place multi-day events into lanes for one Mon–Sun week.
 * Older sessions first, so a newly saved session stays under the multi-day
 * bars already there. Non-overlapping columns may share a lane.
 */
export function layoutMonthWeekSpans(
  events: MonthSpanLaneEvent[],
  weekMonday: Date,
): { spans: MonthWeekSpan[]; laneCount: number } {
  const weekStart = startOfWeekMon(weekMonday);
  const weekEnd = addDays(weekStart, 6);
  const clipped: Array<MonthSpanLaneEvent & { startCol: number; endCol: number }> = [];
  for (const ev of events) {
    const spanStart = startOfDay(ev.start);
    const spanEnd = sessionInclusiveEndDay(ev.start, ev.end);
    if (spanEnd.getTime() < weekStart.getTime() || spanStart.getTime() > weekEnd.getTime()) {
      continue;
    }
    const lo = spanStart.getTime() < weekStart.getTime() ? weekStart : spanStart;
    const hi = spanEnd.getTime() > weekEnd.getTime() ? weekEnd : spanEnd;
    const startCol = calendarDayDelta(weekStart, lo);
    const endCol = calendarDayDelta(weekStart, hi);
    if (endCol < 0 || startCol > 6) continue;
    clipped.push({
      ...ev,
      startCol: Math.max(0, startCol),
      endCol: Math.min(6, endCol),
    });
  }
  clipped.sort(monthSpanSort);
  const laneEnds: number[] = [];
  const spans: MonthWeekSpan[] = [];
  for (const ev of clipped) {
    let lane = laneEnds.findIndex((endCol) => endCol < ev.startCol);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(ev.endCol);
    } else {
      laneEnds[lane] = ev.endCol;
    }
    spans.push({ id: ev.id, startCol: ev.startCol, endCol: ev.endCol, lane });
  }
  return { spans, laneCount: laneEnds.length };
}

export function orderedDates(a: Date, b: Date): { start: Date; end: Date } {
  const sa = startOfDay(a);
  const sb = startOfDay(b);
  return sa.getTime() <= sb.getTime() ? { start: sa, end: sb } : { start: sb, end: sa };
}

export type MonthDragWeekPiece = {
  start: Date;
  days: number;
  /** Monday = 0 … Sunday = 6 */
  startCol: number;
};

/** Split a session into Mon–Sun pieces so a drag preview can show every week. */
export function monthDragWeekPieces(start: Date, end: Date): MonthDragWeekPiece[] {
  const last = sessionInclusiveEndDay(start, end);
  const pieces: MonthDragWeekPiece[] = [];
  let cursor = startOfDay(start);
  while (cursor.getTime() <= last.getTime()) {
    const startCol = (cursor.getDay() + 6) % 7;
    const days = Math.min(7 - startCol, calendarDayDelta(cursor, last) + 1);
    pieces.push({ start: cursor, days, startCol });
    cursor = addDays(cursor, days);
  }
  return pieces;
}

/**
 * Monday-based column where a drag preview starts.
 * A result below 0 or past 6 means the span crosses into the previous
 * Sunday or the next Monday instead of being pulled back into the week.
 */
export function continuousDragStartCol(
  targetCol: number,
  grabIndex: number,
  _dayCount: number,
): number {
  return targetCol - grabIndex;
}

/**
 * Visible columns after dragging one edge of an all-day / multi-day bar.
 * The undragged edge stays put until the pointer passes it. Past that edge
 * the span flips and the pointer keeps extending the other side.
 */
export function resizedBandColumns(input: {
  edge: "start" | "end";
  visibleStart: number;
  visibleEnd: number;
  targetCol: number;
  columnCount: number;
}): { startCol: number; endCol: number } {
  const last = Math.max(0, input.columnCount - 1);
  const target = Math.max(0, Math.min(last, input.targetCol));
  const anchor = input.edge === "start" ? input.visibleEnd : input.visibleStart;
  if (target <= anchor) {
    return { startCol: target, endCol: anchor };
  }
  return { startCol: anchor, endCol: target };
}

/**
 * Inclusive start/end days after dragging one edge onto `targetCol`.
 * The other edge stays put until the pointer passes it, then the span flips
 * and that edge follows the pointer. Days outside this week stay put when
 * the dragged edge is released on the same visible column it started on.
 */
export function resizedBandSpan(input: {
  edge: "start" | "end";
  start: Date;
  end: Date;
  weekDates: Date[];
  visibleStart: number;
  visibleEnd: number;
  targetCol: number;
}): { startCol: number; endCol: number; start: Date; end: Date } {
  const count = input.weekDates.length;
  const last = Math.max(0, count - 1);
  const targetCol = Math.max(0, Math.min(last, input.targetCol));
  const trueStart = startOfDay(input.start);
  const trueEnd = sessionInclusiveEndDay(input.start, input.end);
  const weekStart = startOfDay(input.weekDates[0]);
  const weekEnd = startOfDay(input.weekDates[last]);
  const pinnedOutside =
    (input.edge === "start" &&
      targetCol === input.visibleStart &&
      trueStart.getTime() < weekStart.getTime()) ||
    (input.edge === "end" &&
      targetCol === input.visibleEnd &&
      trueEnd.getTime() > weekEnd.getTime());
  let start = trueStart;
  let end = trueEnd;
  if (!pinnedOutside) {
    const anchor = input.edge === "start" ? trueEnd : trueStart;
    const targetDay = startOfDay(input.weekDates[targetCol]);
    if (targetDay.getTime() <= anchor.getTime()) {
      start = targetDay;
      end = anchor;
    } else {
      start = anchor;
      end = targetDay;
    }
  }
  const lo = start.getTime() < weekStart.getTime() ? weekStart : start;
  const hi = end.getTime() > weekEnd.getTime() ? weekEnd : end;
  return {
    startCol: Math.max(0, Math.min(last, calendarDayDelta(weekStart, lo))),
    endCol: Math.max(0, Math.min(last, calendarDayDelta(weekStart, hi))),
    start,
    end,
  };
}

/**
 * Inclusive calendar days after dragging one edge of a month multi-day bar
 * onto `targetDay`. `start` and `end` are already inclusive days. The other
 * edge stays put until the pointer passes it, then the span flips and the
 * pointer keeps extending that side.
 */
export function resizedMonthSpan(
  edge: "start" | "end",
  start: Date,
  end: Date,
  targetDay: Date,
): { start: Date; end: Date } {
  const originStart = startOfDay(start);
  const originEnd = startOfDay(end);
  const target = startOfDay(targetDay);
  const anchor = edge === "start" ? originEnd : originStart;
  if (target.getTime() <= anchor.getTime()) {
    return { start: target, end: anchor };
  }
  return { start: anchor, end: target };
}

/**
 * Inclusive start/end days after moving `grabbedDay` onto `dropDay`.
 * The rest of the session shifts by the same number of days.
 */
export function previewSpanForGrabbedDay(
  start: Date,
  end: Date,
  grabbedDay: Date,
  dropDay: Date,
): { start: Date; end: Date } {
  const origin = startOfDay(start);
  const offset = calendarDayDelta(origin, grabbedDay);
  const previewStart = addDays(startOfDay(dropDay), -offset);
  const span = calendarDayDelta(origin, sessionInclusiveEndDay(start, end));
  return { start: previewStart, end: addDays(previewStart, span) };
}

/** True when a rigid multi-day drag would cover the same days it started on. */
export function multiDayDragBackHome(
  start: Date,
  end: Date,
  grabbedDay: Date,
  dropDay: Date,
): boolean {
  const preview = previewSpanForGrabbedDay(start, end, grabbedDay, dropDay);
  return (
    sameDay(preview.start, start) &&
    sameDay(preview.end, sessionInclusiveEndDay(start, end))
  );
}
