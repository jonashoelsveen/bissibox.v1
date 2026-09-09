/**
 * Shared Macro Gantt week geometry — calendar-year week columns (Mon–Sun).
 */

import { addDays, isoWeekNumber, startOfDay, startOfWeekMon } from "./dateUtils";

export interface GanttWeekColumn {
  /** 0-based index in the year grid. */
  index: number;
  /** ISO week number (1–53) for the label. */
  isoWeek: number;
  monday: Date;
  sunday: Date;
  /** ISO Thursday month (legacy); month headers use monthDaySpansForGrid. */
  month: number;
}

export interface GanttMonthDaySpan {
  /** Calendar month 0–11. */
  month: number;
  /** Calendar year of this month segment (may be prev/next at grid edges). */
  year: number;
  /** Inclusive day offset from the first Monday of the year grid. */
  startDay: number;
  endDay: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weeks that intersect the calendar year (Mon–Sun). */
export function weeksForCalendarYear(year: number): GanttWeekColumn[] {
  const yearStart = startOfDay(new Date(year, 0, 1));
  const yearEnd = startOfDay(new Date(year, 11, 31));
  let mon = startOfWeekMon(yearStart);
  const out: GanttWeekColumn[] = [];
  let index = 0;

  while (mon <= yearEnd) {
    const sunday = addDays(mon, 6);
    if (sunday >= yearStart) {
      const thursday = addDays(mon, 3);
      out.push({
        index,
        isoWeek: isoWeekNumber(mon),
        monday: mon,
        sunday,
        month: thursday.getMonth(),
      });
      index += 1;
    }
    mon = addDays(mon, 7);
  }
  return out;
}

/**
 * Month segments aligned to calendar month starts (1st of each month),
 * independent of week-column boundaries.
 */
export function monthDaySpansForGrid(weeks: GanttWeekColumn[]): GanttMonthDaySpan[] {
  if (weeks.length === 0) return [];
  const spans: GanttMonthDaySpan[] = [];
  const total = weeks.length * 7;
  for (let d = 0; d < total; d++) {
    const date = dateFromDayOffset(weeks, d);
    const month = date.getMonth();
    const year = date.getFullYear();
    const last = spans[spans.length - 1];
    if (last && last.month === month && last.year === year) {
      last.endDay = d;
    } else {
      spans.push({ month, year, startDay: d, endDay: d });
    }
  }
  return spans;
}

/**
 * Default Macro project length: four weeks starting at the week that
 * contains `now` (falls back to the first week of `year`).
 */
export function defaultGanttWeekSpan(
  year: number,
  now = new Date(),
): {
  gantt_start_week: number;
  gantt_end_week: number;
  gantt_start_date: string;
  gantt_end_date: string;
} {
  const weeks = weeksForCalendarYear(year);
  if (weeks.length === 0) {
    const d = formatDateISO(startOfDay(new Date(year, 0, 1)));
    return {
      gantt_start_week: 0,
      gantt_end_week: 0,
      gantt_start_date: d,
      gantt_end_date: d,
    };
  }

  const today = startOfDay(now);
  let start = 0;
  if (today.getFullYear() === year) {
    const idx = weeks.findIndex((w) => today >= w.monday && today <= w.sunday);
    if (idx >= 0) start = idx;
  }
  const end = Math.min(start + 3, weeks.length - 1);
  return {
    gantt_start_week: start,
    gantt_end_week: end,
    gantt_start_date: formatDateISO(weeks[start]!.monday),
    gantt_end_date: formatDateISO(weeks[end]!.sunday),
  };
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return startOfDay(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Day offset from the first Monday of the year grid (can be negative / past end). */
export function dayOffsetInYearGrid(weeks: GanttWeekColumn[], date: Date): number {
  if (weeks.length === 0) return 0;
  const d = startOfDay(date);
  const first = weeks[0]!.monday.getTime();
  return Math.round((d.getTime() - first) / DAY_MS);
}

export function dateFromDayOffset(weeks: GanttWeekColumn[], offset: number): Date {
  if (weeks.length === 0) return startOfDay(new Date());
  return addDays(weeks[0]!.monday, offset);
}

export function clampDayOffset(weeks: GanttWeekColumn[], offset: number): number {
  if (weeks.length === 0) return 0;
  const max = weeks.length * 7 - 1;
  return Math.max(0, Math.min(max, offset));
}

export function weekIndexForDayOffset(offset: number, weekCount: number): number {
  if (weekCount <= 0) return 0;
  return Math.max(0, Math.min(weekCount - 1, Math.floor(offset / 7)));
}

/** Resolve a category's inclusive start/end day offsets in the year grid. */
export function resolveGanttDaySpan(
  weeks: GanttWeekColumn[],
  item: {
    gantt_start_week?: number | null;
    gantt_end_week?: number | null;
    gantt_start_date?: string | null;
    gantt_end_date?: string | null;
  },
): { startDay: number; endDay: number } | null {
  if (weeks.length === 0) return null;
  const maxDay = weeks.length * 7 - 1;

  const startParsed = item.gantt_start_date ? parseDateISO(item.gantt_start_date) : null;
  const endParsed = item.gantt_end_date ? parseDateISO(item.gantt_end_date) : null;
  if (startParsed && endParsed) {
    let startDay = clampDayOffset(weeks, dayOffsetInYearGrid(weeks, startParsed));
    let endDay = clampDayOffset(weeks, dayOffsetInYearGrid(weeks, endParsed));
    if (endDay < startDay) {
      const t = startDay;
      startDay = endDay;
      endDay = t;
    }
    return { startDay, endDay };
  }

  if (item.gantt_start_week == null || item.gantt_end_week == null) return null;
  const sw = Math.max(0, Math.min(weeks.length - 1, item.gantt_start_week));
  const ew = Math.max(sw, Math.min(weeks.length - 1, item.gantt_end_week));
  return {
    startDay: sw * 7,
    endDay: Math.min(maxDay, ew * 7 + 6),
  };
}

export function spanFromWeekIndices(
  weeks: GanttWeekColumn[],
  startWeek: number,
  endWeek: number,
): {
  gantt_start_week: number;
  gantt_end_week: number;
  gantt_start_date: string;
  gantt_end_date: string;
} {
  if (weeks.length === 0) {
    const d = formatDateISO(startOfDay(new Date()));
    return {
      gantt_start_week: 0,
      gantt_end_week: 0,
      gantt_start_date: d,
      gantt_end_date: d,
    };
  }
  const sw = Math.max(0, Math.min(weeks.length - 1, startWeek));
  const ew = Math.max(sw, Math.min(weeks.length - 1, endWeek));
  return {
    gantt_start_week: sw,
    gantt_end_week: ew,
    gantt_start_date: formatDateISO(weeks[sw]!.monday),
    gantt_end_date: formatDateISO(weeks[ew]!.sunday),
  };
}

export function spanFromDayOffsets(
  weeks: GanttWeekColumn[],
  startDay: number,
  endDay: number,
): {
  gantt_start_week: number;
  gantt_end_week: number;
  gantt_start_date: string;
  gantt_end_date: string;
} {
  if (weeks.length === 0) {
    const d = formatDateISO(startOfDay(new Date()));
    return {
      gantt_start_week: 0,
      gantt_end_week: 0,
      gantt_start_date: d,
      gantt_end_date: d,
    };
  }
  let s = clampDayOffset(weeks, startDay);
  let e = clampDayOffset(weeks, endDay);
  if (e < s) {
    const t = s;
    s = e;
    e = t;
  }
  return {
    gantt_start_week: weekIndexForDayOffset(s, weeks.length),
    gantt_end_week: weekIndexForDayOffset(e, weeks.length),
    gantt_start_date: formatDateISO(dateFromDayOffset(weeks, s)),
    gantt_end_date: formatDateISO(dateFromDayOffset(weeks, e)),
  };
}

/**
 * Union of phase spans for a project bar. Returns null when no phase has a
 * usable span (project row stays empty until phases exist).
 */
export function unionGanttDaySpan(
  weeks: GanttWeekColumn[],
  phases: Array<{
    hidden?: boolean;
    gantt_start_week?: number | null;
    gantt_end_week?: number | null;
    gantt_start_date?: string | null;
    gantt_end_date?: string | null;
  }>,
): {
  gantt_start_week: number;
  gantt_end_week: number;
  gantt_start_date: string;
  gantt_end_date: string;
} | null {
  let minDay: number | null = null;
  let maxDay: number | null = null;
  for (const phase of phases) {
    if (phase.hidden) continue;
    const span = resolveGanttDaySpan(weeks, phase);
    if (!span) continue;
    minDay = minDay == null ? span.startDay : Math.min(minDay, span.startDay);
    maxDay = maxDay == null ? span.endDay : Math.max(maxDay, span.endDay);
  }
  if (minDay == null || maxDay == null) return null;
  return spanFromDayOffsets(weeks, minDay, maxDay);
}

/**
 * Day offset to place near the left-of-center of the Macro viewport when
 * opening a project’s phase grid:
 * - today inside [first, last] block → today (red line)
 * - not started or finished → start of the first block
 * - no blocks → today (if known)
 */
export function ganttPhaseViewFocusDay(
  weeks: GanttWeekColumn[],
  phases: Array<{
    hidden?: boolean;
    gantt_start_week?: number | null;
    gantt_end_week?: number | null;
    gantt_start_date?: string | null;
    gantt_end_date?: string | null;
  }>,
  todayDayOffset: number | null,
): number | null {
  let minDay: number | null = null;
  let maxDay: number | null = null;
  for (const phase of phases) {
    if (phase.hidden) continue;
    const span = resolveGanttDaySpan(weeks, phase);
    if (!span) continue;
    minDay = minDay == null ? span.startDay : Math.min(minDay, span.startDay);
    maxDay = maxDay == null ? span.endDay : Math.max(maxDay, span.endDay);
  }
  if (minDay == null || maxDay == null) return todayDayOffset;
  if (
    todayDayOffset != null &&
    todayDayOffset >= minDay &&
    todayDayOffset <= maxDay
  ) {
    return todayDayOffset;
  }
  return minDay;
}
