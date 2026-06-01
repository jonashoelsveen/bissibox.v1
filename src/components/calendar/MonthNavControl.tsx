/**
 * MonthNavControl — two chevron arrows + mini-calendar icon.
 *
 * Used at the top-right of the calendar grid. The chevrons step the
 * `currentDate` by one day/week/month depending on the active view. Clicking
 * the calendar icon opens a Notion-style mini-calendar popover that supports
 * click-and-drag range selection — drag updates `currentDate` (and an
 * optional `currentRange`) in real time.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MiniCalendar, type DateRange } from "./MiniCalendar";

export type CalUnit = "day" | "week" | "month" | "year";

export interface MonthNavControlProps {
  unit: CalUnit;
  currentDate: Date;
  onChange: (date: Date, range?: DateRange) => void;
  selectedRange?: DateRange;
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function addYears(d: Date, n: number) {
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
}


export function MonthNavControl({
  unit,
  currentDate,
  onChange,
  selectedRange,
}: MonthNavControlProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const step = (dir: 1 | -1) => {
    let next: Date;
    if (unit === "day") next = addDays(currentDate, dir);
    else if (unit === "week") next = addDays(currentDate, dir * 7);
    else if (unit === "year") next = addYears(currentDate, dir);
    else next = addMonths(currentDate, dir);
    onChange(next, { start: next, end: next });
  };


  return (
    <div ref={wrapRef} className="relative flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Forrige"
        onClick={() => step(-1)}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        aria-label="Neste"
        onClick={() => step(1)}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
        >
          <MiniCalendar
            selectedRange={selectedRange ?? { start: currentDate, end: currentDate }}
            onSelectRange={(r) => onChange(r.start, r)}
          />
        </div>
      )}
    </div>
  );
}
