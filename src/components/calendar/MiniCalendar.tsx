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
 *  After a year-view month click, stay on that month with no day/week mark. */
export function miniCalendarViewMode(
  viewMode: "day" | "week" | "month" | "year",
  yearWeekHighlight = false,
  yearMonthHighlight = false,
): MiniCalendarViewMode {
  if (viewMode === "week" || (viewMode === "year" && yearWeekHighlight)) return "week";
  if (viewMode === "year" && yearMonthHighlight) return "monthMark";
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
}

export function MiniCalendar({
  selectedRange,
  onSelectRange,
  viewMode = "month",
  tone = "light",
  onPickDay,
}: MiniCalendarProps) {
  const dark = tone === "dark";
  // Displayed month (independent from selection so user can browse)
  const [view, setView] = useState(() => ({
    year: selectedRange.start.getFullYear(),
    month: selectedRange.start.getMonth(),
  }));

  // When external selection jumps to a different month, follow it.
  useEffect(() => {
    setView({
      year: selectedRange.start.getFullYear(),
      month: selectedRange.start.getMonth(),
    });
  }, [selectedRange.start.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const prevMonth = () =>
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 },
    );
  const nextMonth = () =>
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 },
    );

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
          const inSelectedWeek =
            viewMode === "week" &&
            ymdNum(startOfWeekMon(weekDays[0].date)) ===
              ymdNum(startOfWeekMon(selectedRange.start));
          return (
            <div key={wi} className="relative grid grid-cols-7">
              {inSelectedWeek ? (
                <span
                  aria-hidden
                  className={[
                    "pointer-events-none absolute inset-y-0 rounded-sm",
                    dark ? "bg-white/[0.08]" : "bg-primary/15",
                  ].join(" ")}
                  style={{ left: WEEK_MARK_INSET, right: WEEK_MARK_INSET }}
                />
              ) : null}
              {weekDays.map(({ date, inMonth }) => {
                const isToday = sameDay(date, today);
                const isSelected =
                  viewMode !== "week" &&
                  viewMode !== "monthMark" &&
                  inSelectedRange(date);
                const weekBg = inSelectedWeek && !isSelected;
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
                        setView({ year: date.getFullYear(), month: date.getMonth() });
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
                                ? "text-white/90"
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
