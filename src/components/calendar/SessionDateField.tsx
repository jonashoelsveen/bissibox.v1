import { useEffect, useRef, useState, type RefObject } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
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

export function SessionDateField({
  date,
  readOnly = false,
  visible,
  sessionCardRef,
  clusterRef,
  rightOccupied = false,
  onPick,
}: {
  date: Date;
  readOnly?: boolean;
  visible: boolean;
  sessionCardRef: RefObject<HTMLDivElement | null>;
  clusterRef: RefObject<HTMLDivElement | null>;
  rightOccupied?: boolean;
  onPick: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<"left" | "right" | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const day = startOfDay(date);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  if (!visible) return null;

  const Chevron = open && menuSide === "right" ? ChevronRight : ChevronLeft;

  return (
    <>
      <div ref={fieldRef} className="relative">
        <div
          className={[
            "relative flex min-h-[40px] items-center",
            sessionPopoverFieldClass(open && !readOnly),
          ].join(" ")}
        >
          <Calendar
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
          {readOnly ? (
            <span className="block w-full truncate py-2.5 pl-[30px] pr-3 text-left text-[13px] text-ink">
              {formatSessionMenuDate(day)}
            </span>
          ) : (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label="Session date"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              className="flex w-full cursor-default items-center bg-transparent py-2.5 pl-[30px] pr-8 text-left text-[13px] text-ink outline-none"
            >
              <span className="min-w-0 flex-1 truncate">{formatSessionMenuDate(day)}</span>
            </button>
          )}
          {!readOnly ? (
            <Chevron
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
              aria-hidden
            />
          ) : null}
        </div>
      </div>
      <SessionSideListbox
        open={open && !readOnly}
        onClose={() => setOpen(false)}
        fieldRef={fieldRef}
        sessionCardRef={sessionCardRef}
        clusterRef={clusterRef}
        rightOccupied={rightOccupied}
        preferRight={false}
        estimatedHeight={292}
        onSideChange={setMenuSide}
      >
        <MiniCalendar
          tone="dark"
          viewMode="day"
          selectedRange={{ start: day, end: day }}
          onSelectRange={() => undefined}
          onPickDay={(picked) => {
            setOpen(false);
            onPick(startOfDay(picked));
          }}
        />
      </SessionSideListbox>
    </>
  );
}
