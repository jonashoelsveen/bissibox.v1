import { useEffect, useRef, useState, type RefObject } from "react";
import { Calendar } from "lucide-react";
import { MiniCalendar } from "./MiniCalendar";
import { sessionPopoverFieldClass } from "./sessionPopoverField";
import { SessionSideListbox } from "./SessionSideListbox";
import { startOfDay } from "./dateUtils";

function formatSessionMenuDate(date: Date): string {
  return date.toLocaleDateString("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

type DateFieldWhich = "start" | "end";

function commitEndpoint(
  which: DateFieldWhich,
  picked: Date,
  startDay: Date,
  endDay: Date,
): { start: Date; end: Date } {
  const day = startOfDay(picked);
  if (which === "start") {
    const start = day;
    const end = start.getTime() > endDay.getTime() ? start : endDay;
    return { start, end };
  }
  const end = day;
  const start = end.getTime() < startDay.getTime() ? end : startDay;
  return { start, end };
}

export function SessionDateField({
  date,
  endDate,
  readOnly = false,
  hideEndDate = false,
  visible,
  sessionCardRef,
  clusterRef,
  rightOccupied = false,
  onPickRange,
}: {
  date: Date;
  endDate?: Date;
  readOnly?: boolean;
  /** Member view of a timed team session: keep From, omit To. */
  hideEndDate?: boolean;
  visible: boolean;
  sessionCardRef: RefObject<HTMLDivElement | null>;
  clusterRef: RefObject<HTMLDivElement | null>;
  rightOccupied?: boolean;
  onPickRange: (start: Date, end: Date) => void;
}) {
  const [open, setOpen] = useState<DateFieldWhich | null>(null);
  const pairRef = useRef<HTMLDivElement | null>(null);
  const startDay = startOfDay(date);
  const endDay = startOfDay(endDate ?? date);
  const sameDay = startDay.getTime() === endDay.getTime();
  const fromLabel = formatSessionMenuDate(startDay);
  const toLabel = formatSessionMenuDate(endDay);

  useEffect(() => {
    if (!visible) setOpen(null);
  }, [visible]);

  if (!visible) return null;

  const fieldClass = (active: boolean) =>
    [
      "relative flex min-h-[40px] min-w-0 flex-1 items-center",
      sessionPopoverFieldClass(active && !readOnly),
    ].join(" ");

  const labelClass = (muted: boolean) =>
    [
      "min-w-0 flex-1 truncate py-2.5 pl-[30px] pr-3 text-left text-[13px]",
      muted ? "text-muted-foreground/60" : "text-ink",
    ].join(" ");

  const renderField = (
    which: DateFieldWhich,
    label: string,
    ariaLabel: string,
    muted: boolean,
  ) =>
    readOnly ? (
      <div className={fieldClass(false)}>
        <Calendar
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
        <span className={labelClass(muted)}>{label}</span>
      </div>
    ) : (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open === which}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => (v === which ? null : which));
        }}
        className={[
          fieldClass(open === which),
          "cursor-default bg-transparent outline-none",
        ].join(" ")}
      >
        <Calendar
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
        <span className={labelClass(muted)}>{label}</span>
      </button>
    );

  return (
    <>
      <div ref={pairRef} className="flex min-w-0 items-stretch gap-1">
        {renderField("start", fromLabel, "From date", false)}
        {hideEndDate ? null : renderField("end", toLabel, "To date", sameDay)}
      </div>
      <SessionSideListbox
        open={open != null && !readOnly}
        onClose={() => setOpen(null)}
        fieldRef={pairRef}
        sessionCardRef={sessionCardRef}
        clusterRef={clusterRef}
        rightOccupied={rightOccupied}
        preferRight={false}
        estimatedHeight={292}
      >
        <MiniCalendar
          tone="dark"
          viewMode="day"
          rangeBar
          selectedRange={{ start: startDay, end: endDay }}
          viewAnchor={open === "end" ? endDay : startDay}
          onPickDay={(picked) => {
            if (!open) return;
            const next = commitEndpoint(open, picked, startDay, endDay);
            onPickRange(next.start, next.end);
          }}
          onSelectRange={() => {}}
        />
      </SessionSideListbox>
    </>
  );
}
