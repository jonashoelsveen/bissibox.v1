/**
 * DayGridType3 — "Type 3" daily calendar.
 *
 * Visual / logic spec:
 *   - Copies Month Type 2's compact "Excel-trust" cell aesthetic and
 *     keyboard-driven focus (cubic-bezier easing, 1px hairline borders).
 *   - One column = the focused day. Column header shows the full date.
 *   - 96 rows = 24 hours × 4 quarter-hour cells. Every 4th row (the top
 *     of each hour) renders the hour number in light grey on the left
 *     side of the cell.
 *   - Excel-style multi-cell range selection: click + drag down/up to
 *     mark a contiguous time range. While a range exists, hovering
 *     anywhere on it surfaces a centered "+" affordance — clicking it
 *     opens the standard SessionPopoverEditor pre-filled with the time
 *     range. Sessions are stored encoded with <HH:MM-HH:MM> prefix
 *     in the day's session=0 cell, sharing storage with other types.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CellData, CellKey } from "./yearStore";
import { makeCellId } from "./yearStore";
import {
  SessionPopoverEditor,
  splitColor,
  splitTime,
  joinColor,
  joinTime,
  fmtMin,
} from "./SessionPopoverEditor";

const WEEKDAYS_FULL = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];
const MONTHS_FULL = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

const SLOTS = 96; // 24 * 4
const SLOT_MIN = 15;
const ROW_H = 22;
const TIME_GUTTER = 56;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const DUR_MS = 180;

interface SessionItem {
  idx: number;
  raw: string;
  text: string;
  color: string | null;
  startMin: number;
  endMin: number;
}

function parseDayItems(raw?: string): SessionItem[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const { time, text: afterTime } = splitTime(line);
      const { color, text } = splitColor(afterTime);
      // Only include items that have a time prefix; without one, anchor
      // them to a default 1-hour slot starting at 08:00 so they stay
      // visible without breaking the timeline grid.
      const startMin = time ? time.startMin : 8 * 60;
      const endMin = time ? time.endMin : startMin + 60;
      return { idx, raw: line, text, color, startMin, endMin };
    });
}

function serializeDayItems(items: SessionItem[]): string {
  return items
    .map((it) =>
      joinTime({ startMin: it.startMin, endMin: it.endMin }, joinColor(it.color, it.text)),
    )
    .join("\n");
}

export interface DayGridType3Props {
  calId: string;
  refDate: Date;
  data: Record<string, CellData>;
  onPrevDay: () => void;
  onNextDay: () => void;
  onCommitText: (k: CellKey, text: string) => void;
}

export function DayGridType3({
  calId,
  refDate,
  data,
  onPrevDay,
  onNextDay,
  onCommitText,
}: DayGridType3Props) {
  const dayKey: CellKey = useMemo(
    () => ({
      year: refDate.getFullYear(),
      month: refDate.getMonth(),
      day: refDate.getDate(),
      session: 0,
    }),
    [refDate],
  );
  const id = makeCellId(calId, dayKey);
  const items = parseDayItems(data[id]?.text);

  const [focusRow, setFocusRow] = useState(8 * 4); // 08:00
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const dragAnchorRef = useRef<number | null>(null);

  const inRange = useCallback(
    (r: number) => {
      if (!range) return false;
      const lo = Math.min(range.a, range.b);
      const hi = Math.max(range.a, range.b);
      return r >= lo && r <= hi;
    },
    [range],
  );

  const [popover, setPopover] = useState<{
    rect: DOMRect;
    editIdx: number;
    initialText: string;
    initialColor: string | null;
    startMin: number;
    endMin: number;
  } | null>(null);

  // End drag on global mouseup
  useEffect(() => {
    const onUp = () => {
      dragAnchorRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Keyboard navigation (arrows up/down) — matches Month Type 2 behaviour.
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (popover) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setRange(null);
        setFocusRow((r) => Math.min(SLOTS - 1, r + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setRange(null);
        setFocusRow((r) => Math.max(0, r - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNextDay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrevDay();
      } else if (e.key === "Escape") {
        setRange(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popover, onPrevDay, onNextDay]);

  const openCreator = useCallback(
    (anchor: HTMLElement, startRow: number, endRow: number) => {
      const lo = Math.min(startRow, endRow);
      const hi = Math.max(startRow, endRow);
      setPopover({
        rect: anchor.getBoundingClientRect(),
        editIdx: -1,
        initialText: "",
        initialColor: null,
        startMin: lo * SLOT_MIN,
        endMin: (hi + 1) * SLOT_MIN,
      });
    },
    [],
  );

  const openEditor = useCallback((it: SessionItem, anchor: HTMLElement) => {
    setPopover({
      rect: anchor.getBoundingClientRect(),
      editIdx: it.idx,
      initialText: it.text,
      initialColor: it.color,
      startMin: it.startMin,
      endMin: it.endMin,
    });
  }, []);

  const closePopover = () => setPopover(null);

  const headerLabel = `${WEEKDAYS_FULL[refDate.getDay()]} ${refDate.getDate()}. ${MONTHS_FULL[refDate.getMonth()]} ${refDate.getFullYear()}`;

  const today = new Date();
  const isToday =
    today.getFullYear() === refDate.getFullYear() &&
    today.getMonth() === refDate.getMonth() &&
    today.getDate() === refDate.getDate();

  // Map items onto absolutely-positioned blocks inside the column.
  const columnHeight = SLOTS * ROW_H;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col bg-card"
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          {headerLabel}
          {isToday && (
            <span className="mono ml-2 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-primary">
              I dag
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevDay}
            aria-label="Forrige dag"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onNextDay}
            aria-label="Neste dag"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Column header strip — single day */}
      <div
        className="grid border-b border-hairline bg-card"
        style={{ gridTemplateColumns: `${TIME_GUTTER}px minmax(0,1fr)` }}
      >
        <div className="border-r border-hairline" />
        <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Økter
        </div>
      </div>

      {/* Scroll area */}
      <div className="relative flex-1 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${TIME_GUTTER}px minmax(0,1fr)`,
            transition: `grid-template-columns ${DUR_MS}ms ${EASE}`,
          }}
        >
          {/* Time gutter: hour labels every 4 rows (every full hour). */}
          <div
            className="relative border-r border-hairline"
            style={{ height: columnHeight }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="absolute left-0 right-0 px-2 text-right text-[10.5px] font-medium tabular-nums text-muted-foreground/70"
                style={{ top: h * 4 * ROW_H, height: 4 * ROW_H, lineHeight: `${ROW_H}px` }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Day column with 96 rows */}
          <DayColumn
            slots={SLOTS}
            rowHeight={ROW_H}
            focusRow={focusRow}
            inRange={inRange}
            range={range}
            items={items}
            onMouseDownRow={(r) => {
              setFocusRow(r);
              dragAnchorRef.current = r;
              setRange({ a: r, b: r });
            }}
            onMouseEnterRow={(r) => {
              if (dragAnchorRef.current !== null) {
                setRange({ a: dragAnchorRef.current, b: r });
              }
            }}
            onMouseUpRow={(r) => {
              // If user clicked single row without dragging, clear the range
              if (
                dragAnchorRef.current !== null &&
                dragAnchorRef.current === r
              ) {
                setRange(null);
              }
            }}
            onPlusClick={(rect, lo, hi) => {
              const anchor = { getBoundingClientRect: () => rect } as HTMLElement;
              openCreator(anchor, lo, hi);
            }}
            onItemClick={openEditor}
          />
        </div>

        {popover && (
          <SessionPopoverEditor
            initialText={popover.initialText}
            initialColor={popover.initialColor}
            isEdit={popover.editIdx >= 0}
            anchor={popover.rect}
            timeLabel={`${fmtMin(popover.startMin)} – ${fmtMin(popover.endMin)}`}
            onClose={closePopover}
            onCommit={(text, color) => {
              const t = text.trim();
              const existing = items;
              let next: SessionItem[];
              if (popover.editIdx >= 0) {
                if (!t) {
                  next = existing.filter((it) => it.idx !== popover.editIdx);
                } else {
                  next = existing.map((it) =>
                    it.idx === popover.editIdx
                      ? {
                          ...it,
                          text: t,
                          color,
                          startMin: popover.startMin,
                          endMin: popover.endMin,
                        }
                      : it,
                  );
                }
              } else {
                next = t
                  ? [
                      ...existing,
                      {
                        idx: existing.length,
                        raw: "",
                        text: t,
                        color,
                        startMin: popover.startMin,
                        endMin: popover.endMin,
                      },
                    ]
                  : existing;
              }
              onCommitText(dayKey, serializeDayItems(next));
              setRange(null);
              setPopover(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface DayColumnProps {
  slots: number;
  rowHeight: number;
  focusRow: number;
  range: { a: number; b: number } | null;
  inRange: (r: number) => boolean;
  items: SessionItem[];
  onMouseDownRow: (r: number) => void;
  onMouseEnterRow: (r: number) => void;
  onMouseUpRow: (r: number) => void;
  onPlusClick: (anchorRect: DOMRect, lo: number, hi: number) => void;
  onItemClick: (it: SessionItem, anchor: HTMLElement) => void;
}

function DayColumn({
  slots,
  rowHeight,
  focusRow,
  range,
  inRange,
  items,
  onMouseDownRow,
  onMouseEnterRow,
  onMouseUpRow,
  onPlusClick,
  onItemClick,
}: DayColumnProps) {
  const colRef = useRef<HTMLDivElement | null>(null);
  const lo = range ? Math.min(range.a, range.b) : -1;
  const hi = range ? Math.max(range.a, range.b) : -1;

  return (
    <div
      ref={colRef}
      className="relative bg-card"
      style={{ height: slots * rowHeight }}
    >
      {/* Slot rows */}
      {Array.from({ length: slots }, (_, r) => {
        const isHourTop = r % 4 === 0;
        const focused = r === focusRow;
        const ranged = inRange(r);
        return (
          <div
            key={r}
            data-slot={r}
            onMouseDown={() => onMouseDownRow(r)}
            onMouseEnter={() => onMouseEnterRow(r)}
            onMouseUp={() => onMouseUpRow(r)}
            className={[
              "relative cursor-cell select-none border-b transition-colors",
              isHourTop ? "border-hairline" : "border-hairline/40",
              ranged ? "bg-primary/10" : "hover:bg-secondary/40",
            ].join(" ")}
            style={{ height: rowHeight }}
          >
            {focused && (
              <span className="pointer-events-none absolute inset-0 z-[2] rounded-[2px] outline outline-2 outline-primary outline-offset-[-2px]" />
            )}
          </div>
        );
      })}

      {/* "+" affordance hovering over the active range */}
      {range && lo >= 0 && hi >= 0 && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-[3] flex items-center justify-center"
          style={{ top: lo * rowHeight, height: (hi - lo + 1) * rowHeight }}
        >
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onPlusClick(rect, lo, hi);
            }}
            className="pointer-events-auto grid h-7 w-7 place-items-center rounded-full border border-primary/30 bg-card text-primary shadow-md transition-all hover:scale-110 hover:bg-primary hover:text-primary-foreground"
            aria-label="Legg til økt"
            title="Legg til økt"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Existing session blocks, absolutely positioned */}
      {items.map((it) => {
        const top = (it.startMin / 15) * rowHeight;
        const height = Math.max(rowHeight, ((it.endMin - it.startMin) / 15) * rowHeight);
        const accent = it.color ?? "var(--primary)";
        return (
          <button
            key={`${it.idx}-${it.startMin}`}
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onItemClick(it, e.currentTarget as HTMLElement);
            }}
            className="absolute left-1 right-1 z-[1] flex flex-col items-start overflow-hidden rounded-[4px] border-l-[3px] bg-secondary/70 px-2 py-1 text-left text-[11.5px] text-ink shadow-sm transition-all hover:-translate-y-px hover:shadow-[0_4px_10px_rgba(15,23,42,0.12)]"
            style={{
              top,
              height,
              borderLeftColor: accent,
              backgroundColor: it.color ? `${it.color}1F` : undefined,
            }}
            title={it.text}
          >
            <span className="mono text-[10px] tabular-nums text-muted-foreground">
              {fmtMin(it.startMin)} – {fmtMin(it.endMin)}
            </span>
            <span className="truncate text-[12px] font-medium text-ink">
              {it.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
