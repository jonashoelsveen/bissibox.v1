/**
 * YearGrid — cloud calendar 12-month year view.
 *
 * Read-only date matrix styled like the left-rail mini calendar: no cell
 * grids, 12px day numbers, selected/today chips. Click a day to select it
 * (mini-cal syncs). Double-click a day → day view. Click a week number to
 * highlight that week (same grey as the mini calendar in week view).
 * Hovering a week number uses the light day-hover grey on the number and
 * the week mark, with a gap between the two. A clicked week keeps the
 * darker mark. Double-click the week
 * number → week view. Click a month header to mark that month;
 * double-click the header → month view. Hovering an unmarked header tints
 * the whole month.
 *
 * Month columns follow the year-grid container width: 1–6, then a jump to
 * 12 (one row) only on very wide grids (~3000px, larger than a 27" 2560
 * window) so 6-wide stays in use on typical large monitors.
 */

import { useMemo, useState } from "react";
import { isoWeekNumber, sameDay, startOfWeekMon } from "./dateUtils";
import type { CalendarEvent } from "./yearStore";
import { useCalendarTheme } from "./calendarThemePref";
import {
  yearBusyDarkShadeForMinutes,
  yearBusyGrade,
  yearBusyMinutesByDay,
  yearBusyShadeForMinutes,
  yearBusyShadeUsesLightText,
  yearDayKey,
} from "./yearDayLoad";

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function dowMon0(date: Date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatBusyMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Inset so a week bar’s ends line up with the 1.75rem today/day chips. */
const WEEK_MARK_INSET = "calc((100% / 7 - 1.75rem) / 2)";

type DayCell = {
  date: Date;
  inMonth: boolean;
};

function buildMonth(year: number, month: number) {
  const dim = daysInMonth(year, month);
  const firstDow = dowMon0(new Date(year, month, 1));
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;
  const days: DayCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - firstDow + 1;
    days.push({
      date: new Date(year, month, dayNumber),
      inMonth: dayNumber >= 1 && dayNumber <= dim,
    });
  }
  const rows = totalCells / 7;
  const weeks = Array.from({ length: rows }, (_, r) => {
    const first = days[r * 7].date;
    return {
      weekNo: isoWeekNumber(first),
      firstDate: first,
      days: days.slice(r * 7, r * 7 + 7),
    };
  });
  return { month, weeks };
}

export interface YearGridProps {
  year: number;
  selectedDate: Date;
  /** When true, tint the ISO week containing selectedDate instead of a day chip. */
  weekHighlight?: boolean;
  onSelectDate: (date: Date) => void;
  onWeekClick: (anchor: Date) => void;
  onWeekDoubleClick: (anchor: Date) => void;
  onDayDoubleClick: (date: Date) => void;
  onMonthClick: (monthIndex: number) => void;
  onMonthDoubleClick: (monthIndex: number) => void;
  /** When true, tint the month containing selectedDate instead of a day chip. */
  monthHighlight?: boolean;
  /** Sessions used to shade each in-month day by timed load. */
  events?: CalendarEvent[];
}

export function YearGrid({
  year,
  selectedDate,
  weekHighlight = false,
  onSelectDate,
  onWeekClick,
  onWeekDoubleClick,
  onDayDoubleClick,
  onMonthClick,
  onMonthDoubleClick,
  monthHighlight = false,
  events = [],
}: YearGridProps) {
  const today = new Date();
  const dark = useCalendarTheme() === "dark";
  // The same date is drawn twice where months overlap. The mark follows the
  // cell that was clicked, not the other copy. A day that belongs to the
  // previous or next year stays a mark in this year; it does not open that year.
  const [pickedCell, setPickedCell] = useState<{ hostMonth: number; key: string } | null>(
    null,
  );
  const selectedKey = dateKey(selectedDate);
  const [pickedAgainst, setPickedAgainst] = useState(selectedKey);
  if (selectedKey !== pickedAgainst) {
    setPickedAgainst(selectedKey);
    if (pickedCell && pickedCell.key !== selectedKey) setPickedCell(null);
  }
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, m) => buildMonth(year, m)),
    [year],
  );
  const busyMinutes = useMemo(() => yearBusyMinutesByDay(events), [events]);

  return (
    <div
      className="mini-dur-scroll @container relative min-h-0 flex-1 overflow-y-auto"
      style={{ scrollbarGutter: "stable" }}
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-7 p-4 @min-[520px]:grid-cols-2 @min-[780px]:grid-cols-3 @min-[1040px]:grid-cols-4 @min-[1300px]:grid-cols-5 @min-[1560px]:grid-cols-6 @min-[3000px]:grid-cols-12 md:p-5">
        {months.map(({ month, weeks }) => {
          const monthSelected =
            monthHighlight &&
            selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month;
          return (
          <section
            key={month}
            className={[
              "min-w-0 rounded-sm p-1.5 -mx-1.5 text-[12px] transition-colors",
              monthSelected
                ? "bg-muted-foreground/15"
                : "has-[.year-month-title:hover]:bg-secondary/40",
            ].join(" ")}
          >
            <button
              type="button"
              aria-pressed={monthSelected}
              onClick={() => onMonthClick(month)}
              onDoubleClick={() => onMonthDoubleClick(month)}
              className="year-month-title mb-1.5 flex h-7 w-full items-center px-1 text-left text-[12px] font-medium text-ink outline-none transition-colors hover:text-ink"
            >
              {MONTHS_EN[month]}
            </button>
            <div
              className="mb-1 grid"
              style={{ gridTemplateColumns: "28px repeat(7, minmax(0, 1fr))" }}
            >
              <div aria-hidden className="h-6" />
              {WEEKDAY_LETTERS.map((w, i) => (
                <div
                  key={`${month}-wd-${i}`}
                  className="grid h-6 place-items-center text-[10.5px] font-normal uppercase text-muted-foreground/70"
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-y-0.5">
              {weeks.map((week) => {
                const inSelectedWeek =
                  weekHighlight &&
                  sameDay(startOfWeekMon(week.firstDate), startOfWeekMon(selectedDate));
                return (
                  <div
                    key={`${month}-w-${week.weekNo}-${week.firstDate.getTime()}`}
                    className={[
                      "grid",
                      inSelectedWeek
                        ? ""
                        : "has-[.year-week-number:hover]:[&_.year-week-mark]:visible",
                    ].join(" ")}
                    style={{ gridTemplateColumns: "28px minmax(0, 1fr)" }}
                  >
                    <button
                      type="button"
                      aria-pressed={inSelectedWeek}
                      onClick={() => onWeekClick(week.firstDate)}
                      onDoubleClick={() => onWeekDoubleClick(week.firstDate)}
                      className={[
                        "year-week-number grid h-7 w-full place-items-center rounded-sm text-[12px] font-extrabold tabular-nums text-ink",
                        inSelectedWeek ? "bg-muted-foreground/15" : "hover:bg-secondary/40",
                      ].join(" ")}
                    >
                      {week.weekNo}
                    </button>
                    <div className="relative grid grid-cols-7">
                      <span
                        aria-hidden
                        className={[
                          "year-week-mark pointer-events-none absolute inset-y-0 z-[1] rounded-sm",
                          inSelectedWeek
                            ? "bg-muted-foreground/15"
                            : "invisible bg-secondary/40",
                        ].join(" ")}
                        style={{ left: WEEK_MARK_INSET, right: WEEK_MARK_INSET }}
                      />
                      {week.days.map((d) => {
                        const isToday = d.inMonth && sameDay(d.date, today);
                        const isSelected =
                          !weekHighlight &&
                          !monthHighlight &&
                          (pickedCell
                            ? pickedCell.hostMonth === month &&
                              pickedCell.key === dateKey(d.date)
                            : d.inMonth && sameDay(d.date, selectedDate));
                        const minutes = busyMinutes.get(yearDayKey(d.date)) ?? 0;
                        const grade = yearBusyGrade(minutes);
                        const shade = dark
                          ? yearBusyDarkShadeForMinutes(minutes)
                          : yearBusyShadeForMinutes(minutes);
                        const showShade = shade != null && !isSelected && !isToday;
                        const lightText = yearBusyShadeUsesLightText(grade);
                        const shadeText = !showShade
                          ? null
                          : dark
                            ? lightText
                              ? d.inMonth
                                ? "text-[#141414]"
                                : "text-[#141414]/70"
                              : d.inMonth
                                ? "text-[#f2f2f2]"
                                : "text-[#f2f2f2]/55"
                            : lightText
                              ? d.inMonth
                                ? "text-white"
                                : "text-white/75"
                              : d.inMonth
                                ? "text-ink"
                                : "text-muted-foreground";
                        return (
                          <button
                            key={dateKey(d.date)}
                            type="button"
                            title={
                              minutes <= 0 ? "No timed sessions" : formatBusyMinutes(minutes)
                            }
                            onClick={() => {
                              setPickedCell({ hostMonth: month, key: dateKey(d.date) });
                              if (d.date.getFullYear() !== year) return;
                              onSelectDate(d.date);
                            }}
                            onDoubleClick={() => onDayDoubleClick(d.date)}
                            className="group relative grid h-7 w-full place-items-center text-[12px] tabular-nums"
                          >
                            {showShade && (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 z-0 m-auto h-7 w-7 max-w-full rounded-sm transition-[filter] group-hover:brightness-95"
                                style={{ backgroundColor: shade }}
                              />
                            )}
                            <span
                              className={[
                                "relative z-10 grid h-7 w-7 max-w-full place-items-center rounded-sm",
                                isSelected
                                  ? dark
                                    ? "text-[#141414]"
                                    : "bg-primary text-primary-foreground"
                                  : isToday
                                    ? "bg-[#ED5C5C] text-white"
                                    : !showShade
                                      ? d.inMonth
                                        ? "text-ink hover:bg-secondary"
                                        : "text-muted-foreground/40 hover:bg-secondary/60"
                                      : shadeText,
                              ].join(" ")}
                              style={
                                isSelected && dark
                                  ? { backgroundColor: "#ffffff", color: "#141414" }
                                  : undefined
                              }
                            >
                              {d.date.getDate()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          );
        })}
      </div>
    </div>
  );
}
