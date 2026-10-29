import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Check, Clock } from "lucide-react";
import { sessionPopoverFieldClass } from "./sessionPopoverField";
import {
  estimateSessionSideMenuHeight,
  SESSION_SIDE_MENU_ITEM_CLASS,
  SESSION_SIDE_MENU_ROW_PX,
  SessionSideListbox,
} from "./SessionSideListbox";
import { useSessionAdjacentMenuFits } from "./useSessionAdjacentMenuFits";
import { IOSSwitch } from "./DiaryEditFields";

const DAY_MINUTES = 24 * 60;
const STEP_MIN = 15;
const TIME_MENU_VISIBLE_ROWS = 8;

export type SessionTimeRange = { startMin: number; endMin: number };

function formatClock(min: number): string {
  if (min >= DAY_MINUTES) return "24:00";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeSlots(includeMidnightEnd: boolean): number[] {
  const out: number[] = [];
  for (let m = 0; m < DAY_MINUTES; m += STEP_MIN) out.push(m);
  if (includeMidnightEnd) out.push(DAY_MINUTES);
  return out;
}

function nearestSlot(min: number, includeMidnightEnd: boolean): number {
  const clamped = Math.max(0, Math.min(includeMidnightEnd ? DAY_MINUTES : DAY_MINUTES - STEP_MIN, min));
  return Math.round(clamped / STEP_MIN) * STEP_MIN;
}

function commitTime(
  which: "start" | "end",
  nextMin: number,
  startMin: number,
  endMin: number,
  independent: boolean,
): SessionTimeRange {
  if (which === "start") {
    const start = Math.max(0, Math.min(DAY_MINUTES - STEP_MIN, nextMin));
    if (independent) return { startMin: start, endMin };
    if (start >= endMin) {
      const duration = Math.max(STEP_MIN, endMin - startMin);
      return { startMin: start, endMin: Math.min(DAY_MINUTES, start + duration) };
    }
    return { startMin: start, endMin };
  }
  const end = Math.max(0, Math.min(DAY_MINUTES, nextMin));
  if (independent) return { startMin, endMin: end };
  if (end <= startMin) {
    const duration = Math.max(STEP_MIN, endMin - startMin);
    return { startMin: Math.max(0, end - duration), endMin: end };
  }
  return { startMin, endMin: end };
}

/** Scrolls only the clock list so the current time sits on the vertical center when the submenu opens. */
function CenterTimeOnOpen({ which, minute }: { which: "start" | "end"; minute: number }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const minuteRef = useRef(minute);
  minuteRef.current = minute;
  useLayoutEffect(() => {
    const list = anchorRef.current?.parentElement;
    if (!(list instanceof HTMLElement)) return;
    const el = list.querySelector<HTMLElement>(`[data-time-min="${minuteRef.current}"]`);
    if (!el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = elRect.top + elRect.height / 2 - (listRect.top + listRect.height / 2);
    if (delta !== 0) list.scrollTop += delta;
  }, [which]);
  return (
    <span ref={anchorRef} className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden />
  );
}

export function SessionTimeField({
  value,
  onChange,
  readOnly = false,
  muted = false,
  independentClocks = false,
  showAllDay = false,
  allDay = false,
  onAllDayChange,
  sessionCardRef,
  clusterRef,
  rightOccupied = false,
}: {
  value: SessionTimeRange;
  onChange: (next: SessionTimeRange) => void;
  readOnly?: boolean;
  muted?: boolean;
  independentClocks?: boolean;
  showAllDay?: boolean;
  allDay?: boolean;
  onAllDayChange?: (next: boolean) => void;
  sessionCardRef: RefObject<HTMLDivElement | null>;
  clusterRef: RefObject<HTMLDivElement | null>;
  rightOccupied?: boolean;
}) {
  const [open, setOpen] = useState<"start" | "end" | null>(null);
  const pairRef = useRef<HTMLDivElement | null>(null);
  const menuFits = useSessionAdjacentMenuFits(sessionCardRef, clusterRef, undefined, false);
  const slots = useMemo(() => timeSlots(open === "end"), [open]);
  const selectedMin =
    open === "end"
      ? nearestSlot(value.endMin, true)
      : nearestSlot(value.startMin, false);

  const fieldClass = (active: boolean) =>
    [
      "relative flex min-h-[40px] min-w-0 flex-1 items-center",
      sessionPopoverFieldClass(active && !readOnly && !muted),
    ].join(" ");

  const labelClass = [
    "min-w-0 flex-1 truncate py-2.5 pl-[30px] pr-3 text-left text-[13px] tabular-nums",
    muted ? "text-muted-foreground/60" : "text-ink",
  ].join(" ");

  const renderField = (which: "start" | "end", label: string, ariaLabel: string) =>
    readOnly ? (
      <div className={fieldClass(false)}>
        <Clock
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
        <span className={labelClass}>{label}</span>
      </div>
    ) : (
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open === which}
        aria-label={ariaLabel}
        disabled={muted}
        onClick={(e) => {
          e.stopPropagation();
          if (muted) return;
          if (!menuFits) return;
          setOpen((v) => (v === which ? null : which));
        }}
        className={[
          fieldClass(open === which),
          "cursor-default bg-transparent outline-none disabled:cursor-default",
        ].join(" ")}
      >
        <Clock
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
        <span className={labelClass}>{label}</span>
      </button>
    );

  return (
    <>
      <div ref={pairRef} className="flex min-w-0 w-full items-stretch gap-1">
        <div className="flex min-w-0 flex-1 items-stretch gap-1">
          {renderField("start", formatClock(value.startMin), "From time")}
          {renderField("end", formatClock(value.endMin), "To time")}
        </div>
        {showAllDay && !readOnly ? (
          <label className="mr-2.5 flex shrink-0 cursor-default select-none items-center gap-1.5">
            <span className="text-[11px] text-ink/80">All day</span>
            <IOSSwitch
              checked={allDay}
              onChange={(next) => onAllDayChange?.(next)}
              uncheckedClassName="bg-muted/70"
            />
          </label>
        ) : null}
      </div>
      <SessionSideListbox
        open={open != null && !readOnly && !muted && menuFits}
        onClose={() => setOpen(null)}
        fieldRef={pairRef}
        sessionCardRef={sessionCardRef}
        clusterRef={clusterRef}
        rightOccupied={rightOccupied}
        preferRight={false}
        estimatedHeight={estimateSessionSideMenuHeight(TIME_MENU_VISIBLE_ROWS)}
      >
        <div
          role="listbox"
          className="session-side-menu-scroll relative flex max-h-[252px] flex-col gap-1 overflow-y-auto"
          style={{ maxHeight: TIME_MENU_VISIBLE_ROWS * SESSION_SIDE_MENU_ROW_PX + 28 }}
        >
          {open ? <CenterTimeOnOpen which={open} minute={selectedMin} /> : null}
          {slots.map((min) => {
            const active = min === selectedMin;
            return (
              <button
                key={min}
                type="button"
                role="option"
                data-time-min={min}
                aria-selected={active}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!open) return;
                  onChange(commitTime(open, min, value.startMin, value.endMin, independentClocks));
                }}
                className={[
                  "shrink-0",
                  SESSION_SIDE_MENU_ITEM_CLASS,
                  active ? "bg-white/[0.10] text-white" : "",
                ].join(" ")}
              >
                <span className="min-w-0 flex-1 truncate tabular-nums">{formatClock(min)}</span>
                {active ? <Check className="h-3.5 w-3.5 shrink-0 text-white" /> : null}
              </button>
            );
          })}
        </div>
      </SessionSideListbox>
    </>
  );
}
