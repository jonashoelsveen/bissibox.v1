/**
 * MiniCalendar — compact Notion-style month navigator.
 *
 * Specs:
 *  - 7-column grid, single-letter weekday headers (M T W T F S S).
 *  - 12px sans-serif; padded prev/next-month days at lower contrast.
 *  - Today: subtle highlight (light gray circle); selected day:
 *    high-contrast circular background (primary color).
 *  - Hover: subtle rounded ghost background.
 *  - Click-and-drag range selection.
 *  - Header: "Month Year" with chevron prev/next.
 *  - No borders between cells.
 *
 *  Calls onSelectRange whenever selection changes (single click → 1-day range).
 *  When `selectedRange` changes from outside, the active month auto-advances.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCalendarTheme } from "./calendarThemePref";

const MONTHS_FULL = [
  "Januar","Februar","Mars","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Desember",
];
const WEEKDAY_LETTERS = ["M", "T", "O", "T", "F", "L", "S"]; // Norwegian single letters

function dowMon0(date: Date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function startOfWeekMon(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - dowMon0(x));
  return x;
}
function ymdNum(d: Date) {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Inset so a week bar’s ends line up with the 1.75rem today/day chips. */
const WEEK_MARK_INSET = "calc((100% / 7 - 1.75rem) / 2)";

export interface DateRange {
  start: Date;
  end: Date;
}

export type MiniCalendarViewMode = "day" | "week" | "month" | "monthMark";

/** Week tint in week view, and in year view after a week-number click.
 *  Day view marks one day. Month view, and year view otherwise, mark none. */
export function miniCalendarViewMode(
  viewMode: "day" | "week" | "month" | "year",
  yearWeekHighlight = false,
  _yearMonthHighlight = false,
): MiniCalendarViewMode {
  if (viewMode === "week" || (viewMode === "year" && yearWeekHighlight)) return "week";
  if (viewMode === "day") return "day";
  return "month";
}

export interface MiniCalendarProps {
  /** The day that drives the displayed month + selection. */
  selectedRange: DateRange;
  /** Called continuously during drag, and on click. */
  onSelectRange: (range: DateRange) => void;
  /** When "week", the whole week-row containing the selected day is highlighted. */
  viewMode?: MiniCalendarViewMode;
  /** Dark charcoal shell used inside session-menu submenus. */
  tone?: "light" | "dark";
  /**
   * Single-day pick. Closes drag-range behaviour and reports the clicked day
   * (including days that belong to the previous or next month).
   */
  onPickDay?: (date: Date) => void;
  /** Month to show when it differs from `selectedRange.start`. */
  viewAnchor?: Date;
  /**
   * When the selected range spans more than one day, draw a continuous week-bar
   * (same geometry as year-view week marks) instead of per-day chips.
   */
  rangeBar?: boolean;
}

export function MiniCalendar({
  selectedRange,
  onSelectRange,
  viewMode = "month",
  tone = "light",
  onPickDay,
  viewAnchor,
  rangeBar = false,
}: MiniCalendarProps) {
  const dark = tone === "dark" || useCalendarTheme() === "dark";
  const follow = viewAnchor ?? selectedRange.start;
  const anchorKey = follow.getFullYear() * 12 + follow.getMonth();
  // Local browsing stays until the anchor month changes. The anchor itself
  // is applied in this render, so a fast scroll does not paint the previous
  // month for a frame and then replace it.
  const [browsing, setBrowsing] = useState<{
    fromKey: number;
    year: number;
    month: number;
  } | null>(null);
  const view =
    browsing && browsing.fromKey === anchorKey
      ? browsing
      : { year: follow.getFullYear(), month: follow.getMonth() };
  const showMonth = (year: number, month: number) => {
    setBrowsing({ fromKey: anchorKey, year, month });
  };

  const dim = daysInMonth(view.year, view.month);
  const firstDow = dowMon0(new Date(view.year, view.month, 1));
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;

  const days = useMemo(() => {
    const arr: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - firstDow + 1;
      const date = new Date(view.year, view.month, dayNumber);
      arr.push({ date, inMonth: dayNumber >= 1 && dayNumber <= dim });
    }
    return arr;
  }, [view.year, view.month, dim, firstDow, totalCells]);

  const today = new Date();
  const dragStartRef = useRef<Date | null>(null);

  const inSelectedRange = (d: Date) => {
    const t = d.getTime();
    const lo = Math.min(selectedRange.start.getTime(), selectedRange.end.getTime());
    const hi = Math.max(selectedRange.start.getTime(), selectedRange.end.getTime());
    // Only compare by Y-M-D
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const sLo = new Date(
      new Date(lo).getFullYear(),
      new Date(lo).getMonth(),
      new Date(lo).getDate(),
    ).getTime();
    const sHi = new Date(
      new Date(hi).getFullYear(),
      new Date(hi).getMonth(),
      new Date(hi).getDate(),
    ).getTime();
    return day >= sLo && day <= sHi;
    void t;
  };

  useEffect(() => {
    const onUp = () => {
      dragStartRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const prevMonth = () => {
    if (view.month === 0) showMonth(view.year - 1, 11);
    else showMonth(view.year, view.month - 1);
  };
  const nextMonth = () => {
    if (view.month === 11) showMonth(view.year + 1, 0);
    else showMonth(view.year, view.month + 1);
  };

  return (
    <div
      className="select-none rounded-md bg-transparent p-1 text-[12px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between px-1">
        <span className={["text-[12px] font-medium", dark ? "text-white/90" : "text-ink"].join(" ")}>
          {MONTHS_FULL[view.month]} {view.year}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Forrige måned"
            className={[
              "grid h-5 w-5 place-items-center rounded",
              dark
                ? "text-white/55 hover:bg-white/[0.08] hover:text-white"
                : "text-muted-foreground hover:bg-secondary hover:text-ink",
            ].join(" ")}
          >
            <ChevronLeft className="h-3 w-3" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Neste måned"
            className={[
              "grid h-5 w-5 place-items-center rounded",
              dark
                ? "text-white/55 hover:bg-white/[0.08] hover:text-white"
                : "text-muted-foreground hover:bg-secondary hover:text-ink",
            ].join(" ")}
          >
            <ChevronRight className="h-3 w-3" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Weekday letters */}
      <div className="mb-1 grid grid-cols-7 gap-y-1">
        {WEEKDAY_LETTERS.map((w, i) => (
          <div
            key={i}
            className={[
              "grid h-6 place-items-center text-[10.5px] font-normal",
              dark ? "text-white/40" : "text-muted-foreground/70",
            ].join(" ")}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="flex flex-col gap-y-0.5">
        {Array.from({ length: days.length / 7 }, (_, wi) => {
          const weekDays = days.slice(wi * 7, wi * 7 + 7);
          const exactWeekSpan =
            viewMode === "week" &&
            ymdNum(selectedRange.start) !== ymdNum(selectedRange.end);
          const inSelectedWeek =
            viewMode === "week" &&
            !exactWeekSpan &&
            ymdNum(startOfWeekMon(weekDays[0].date)) ===
              ymdNum(startOfWeekMon(selectedRange.start));
          const spanRange =
            rangeBar &&
            ymdNum(selectedRange.start) !== ymdNum(selectedRange.end);
          let spanFirst = -1;
          let spanLast = -1;
          if (exactWeekSpan) {
            weekDays.forEach(({ date }, i) => {
              if (!inSelectedRange(date)) return;
              if (spanFirst < 0) spanFirst = i;
              spanLast = i;
            });
          }
          const hasSpanBar = spanFirst >= 0;
          let rangeFirst = -1;
          let rangeLast = -1;
          if (spanRange) {
            weekDays.forEach(({ date }, i) => {
              if (!inSelectedRange(date)) return;
              if (rangeFirst < 0) rangeFirst = i;
              rangeLast = i;
            });
          }
          const hasRangeBar = rangeFirst >= 0;
          return (
            <div key={wi} className="relative grid grid-cols-7">
              {inSelectedWeek || hasRangeBar || hasSpanBar ? (
                <span
                  aria-hidden
                  className={[
                    "pointer-events-none absolute inset-y-0 rounded-sm",
                    hasRangeBar
                      ? dark
                        ? "bg-white"
                        : "bg-primary"
                      : dark
                        ? "bg-white/[0.08]"
                        : "bg-primary/15",
                  ].join(" ")}
                  style={
                    hasRangeBar
                      ? {
                          left: `calc(${rangeFirst} * 100% / 7 + ${WEEK_MARK_INSET})`,
                          right: `calc(${6 - rangeLast} * 100% / 7 + ${WEEK_MARK_INSET})`,
                        }
                      : hasSpanBar
                        ? {
                            left: `calc(${spanFirst} * 100% / 7 + ${WEEK_MARK_INSET})`,
                            right: `calc(${6 - spanLast} * 100% / 7 + ${WEEK_MARK_INSET})`,
                          }
                        : { left: WEEK_MARK_INSET, right: WEEK_MARK_INSET }
                  }
                />
              ) : null}
              {weekDays.map(({ date, inMonth }) => {
                const isToday = sameDay(date, today);
                const inBar = hasRangeBar && inSelectedRange(date);
                const inSpan = hasSpanBar && inSelectedRange(date);
                const isSelected =
                  viewMode === "day" &&
                  !spanRange &&
                  inSelectedRange(date);
                const weekBg = (inSelectedWeek || inBar || inSpan) && !isSelected;
                return (
                  <button
                    type="button"
                    key={dateKey(date)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onPickDay) {
                        onPickDay(date);
                        return;
                      }
                      if (!inMonth) {
                        showMonth(date.getFullYear(), date.getMonth());
                        onSelectRange({ start: date, end: date });
                        return;
                      }
                      dragStartRef.current = date;
                      onSelectRange({ start: date, end: date });
                    }}
                    onMouseEnter={() => {
                      if (dragStartRef.current) {
                        onSelectRange({ start: dragStartRef.current, end: date });
                      }
                    }}
                    className="relative z-10 grid h-7 w-full place-items-center text-[12px] tabular-nums transition-colors"
                  >
                    <span
                      className={[
                        "grid h-7 w-7 place-items-center rounded-sm",
                        isSelected
                          ? dark
                            ? "bg-white text-black"
                            : "bg-primary text-primary-foreground"
                          : isToday
                            ? "bg-[#ED5C5C] text-white"
                            : weekBg
                              ? dark
                                ? hasRangeBar
                                  ? "text-black"
                                  : "text-white/90"
                                : hasRangeBar
                                  ? "text-primary-foreground"
                                  : "text-ink"
                              : inMonth
                                ? dark
                                  ? "text-white/90 hover:bg-white/[0.08]"
                                  : "text-ink hover:bg-secondary"
                                : dark
                                  ? "text-white/35 hover:bg-white/[0.08]"
                                  : "text-muted-foreground/40 hover:bg-secondary/60",
                      ].join(" ")}
                    >
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
