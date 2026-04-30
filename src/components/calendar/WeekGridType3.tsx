/**
 * WeekGridType3 — "Type 3" weekly calendar.
 *
 * Visual / logic spec:
 *   - Copies the Year Type 2 spreadsheet aesthetic (rigid columns, hairline
 *     borders, hour labels in the left gutter, cubic-bezier easing).
 *   - 7 day columns (Mon–Sun) with the column header showing the day.
 *   - 96 rows = 24 hours × 4 quarter-hour cells. Hour numbers render on
 *     the left gutter every 4 rows (every full hour) in muted grey.
 *   - Excel-style multi-cell range selection within a single day column:
 *     drag to mark the time range. While selected, hovering shows a
 *     centered "+" affordance — clicking it opens the SessionPopoverEditor
 *     pre-filled with the selected day + time range.
 *   - Existing sessions render as colored blocks with start/end labels.
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

const WEEKDAYS_SHORT = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

const SLOTS = 96;
const SLOT_MIN = 15;
const ROW_H = 22;
const TIME_GUTTER = 56;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const DUR_MS = 180;

interface SessionItem {
  idx: number;
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
      const startMin = time ? time.startMin : 8 * 60;
      const endMin = time ? time.endMin : startMin + 60;
      return { idx, text, color, startMin, endMin };
    });
}

function serializeDayItems(items: SessionItem[]): string {
  return items
    .map((it) =>
      joinTime({ startMin: it.startMin, endMin: it.endMin }, joinColor(it.color, it.text)),
    )
    .join("\n");
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoWeekNumber(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
}

export interface WeekGridType3Props {
  calId: string;
  refDate: Date;
  data: Record<string, CellData>;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onCommitText: (k: CellKey, text: string) => void;
}

export function WeekGridType3({
  calId,
  refDate,
  data,
  onPrevWeek,
  onNextWeek,
  onCommitText,
}: WeekGridType3Props) {
  const weekStart = useMemo(() => startOfWeekMonday(refDate), [refDate]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const dayKeys: CellKey[] = days.map((d) => ({
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    session: 0,
  }));

  // Active selection range (per-column).
  const [focus, setFocus] = useState<{ col: number; row: number }>({ col: 0, row: 8 * 4 });
  const [range, setRange] = useState<{ col: number; a: number; b: number } | null>(null);
  const dragAnchorRef = useRef<{ col: number; row: number } | null>(null);

  useEffect(() => {
    const onUp = () => {
      dragAnchorRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const inRange = useCallback(
    (col: number, row: number) => {
      if (!range || range.col !== col) return false;
      const lo = Math.min(range.a, range.b);
      const hi = Math.max(range.a, range.b);
      return row >= lo && row <= hi;
    },
    [range],
  );

  const [popover, setPopover] = useState<{
    rect: DOMRect;
    col: number;
    editIdx: number;
    initialText: string;
    initialColor: string | null;
    startMin: number;
    endMin: number;
  } | null>(null);

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
        setFocus((f) => ({ col: f.col, row: Math.min(SLOTS - 1, f.row + 1) }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setRange(null);
        setFocus((f) => ({ col: f.col, row: Math.max(0, f.row - 1) }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setRange(null);
        setFocus((f) => {
          if (f.col >= 6) {
            onNextWeek();
            return { col: 0, row: f.row };
          }
          return { col: f.col + 1, row: f.row };
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setRange(null);
        setFocus((f) => {
          if (f.col <= 0) {
            onPrevWeek();
            return { col: 6, row: f.row };
          }
          return { col: f.col - 1, row: f.row };
        });
      } else if (e.key === "Escape") {
        setRange(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popover, onPrevWeek, onNextWeek]);

  const openCreator = useCallback(
    (anchorRect: DOMRect, col: number, lo: number, hi: number) => {
      setPopover({
        rect: anchorRect,
        col,
        editIdx: -1,
        initialText: "",
        initialColor: null,
        startMin: lo * SLOT_MIN,
        endMin: (hi + 1) * SLOT_MIN,
      });
    },
    [],
  );

  const openEditor = useCallback((col: number, it: SessionItem, anchor: HTMLElement) => {
    setPopover({
      rect: anchor.getBoundingClientRect(),
      col,
      editIdx: it.idx,
      initialText: it.text,
      initialColor: it.color,
      startMin: it.startMin,
      endMin: it.endMin,
    });
  }, []);

  const closePopover = () => setPopover(null);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const weekNum = isoWeekNumber(weekStart);
  const headerLabel = `Uke ${weekNum} · ${weekStart.getFullYear()}`;
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
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevWeek}
            aria-label="Forrige uke"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onNextWeek}
            aria-label="Neste uke"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Day column headers */}
      <div
        className="grid border-b border-hairline bg-card"
        style={{ gridTemplateColumns: `${TIME_GUTTER}px repeat(7, minmax(0,1fr))` }}
      >
        <div className="border-r border-hairline" />
        {days.map((d, i) => {
          const todayCol = isToday(d);
          return (
            <div
              key={i}
              className={[
                "border-r border-hairline px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em]",
                todayCol ? "text-primary" : "text-muted-foreground",
              ].join(" ")}
            >
              <span className="mr-1">{WEEKDAYS_SHORT[i]}</span>
              <span className="mono tabular-nums text-ink/80">{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div className="relative flex-1 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${TIME_GUTTER}px repeat(7, minmax(0,1fr))`,
            transition: `grid-template-columns ${DUR_MS}ms ${EASE}`,
          }}
        >
          {/* Hour labels in gutter */}
          <div className="relative border-r border-hairline" style={{ height: columnHeight }}>
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

          {/* Day columns */}
          {days.map((d, col) => {
            const id = makeCellId(calId, dayKeys[col]);
            const items = parseDayItems(data[id]?.text);
            const colRange = range && range.col === col ? range : null;
            return (
              <DayColumn
                key={col}
                col={col}
                slots={SLOTS}
                rowHeight={ROW_H}
                focus={focus.col === col ? focus.row : -1}
                range={colRange ? { a: colRange.a, b: colRange.b } : null}
                inRange={(r) => inRange(col, r)}
                items={items}
                onMouseDownRow={(r) => {
                  setFocus({ col, row: r });
                  dragAnchorRef.current = { col, row: r };
                  setRange({ col, a: r, b: r });
                }}
                onMouseEnterRow={(r) => {
                  const a = dragAnchorRef.current;
                  if (a && a.col === col) {
                    setRange({ col, a: a.row, b: r });
                  }
                }}
                onMouseUpRow={(r) => {
                  const a = dragAnchorRef.current;
                  if (a && a.col === col && a.row === r) {
                    setRange(null);
                  }
                }}
                onPlusClick={(rect, lo, hi) => openCreator(rect, col, lo, hi)}
                onItemClick={(it, anchor) => openEditor(col, it, anchor)}
              />
            );
          })}
        </div>

        {popover && (
          <SessionPopoverEditor
            initialText={popover.initialText}
            initialColor={popover.initialColor}
            isEdit={popover.editIdx >= 0}
            anchor={popover.rect}
            timeLabel={`${WEEKDAYS_SHORT[popover.col]} ${days[popover.col].getDate()}. · ${fmtMin(popover.startMin)} – ${fmtMin(popover.endMin)}`}
            onClose={closePopover}
            onCommit={(text, color) => {
              const t = text.trim();
              const dayKey = dayKeys[popover.col];
              const id = makeCellId(calId, dayKey);
              const existing = parseDayItems(data[id]?.text);
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
  col: number;
  slots: number;
  rowHeight: number;
  focus: number;
  range: { a: number; b: number } | null;
  inRange: (r: number) => boolean;
  items: SessionItem[];
  onMouseDownRow: (r: number) => void;
  onMouseEnterRow: (r: number) => void;
  onMouseUpRow: (r: number) => void;
  onPlusClick: (rect: DOMRect, lo: number, hi: number) => void;
  onItemClick: (it: SessionItem, anchor: HTMLElement) => void;
}

function DayColumn({
  slots,
  rowHeight,
  focus,
  range,
  inRange,
  items,
  onMouseDownRow,
  onMouseEnterRow,
  onMouseUpRow,
  onPlusClick,
  onItemClick,
}: DayColumnProps) {
  const lo = range ? Math.min(range.a, range.b) : -1;
  const hi = range ? Math.max(range.a, range.b) : -1;

  return (
    <div className="relative border-r border-hairline bg-card" style={{ height: slots * rowHeight }}>
      {Array.from({ length: slots }, (_, r) => {
        const isHourTop = r % 4 === 0;
        const focused = r === focus;
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

      {range && lo >= 0 && (
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
            className="absolute left-1 right-1 z-[1] flex flex-col items-start overflow-hidden rounded-[4px] border-l-[3px] bg-secondary/70 px-2 py-1 text-left text-[11px] text-ink shadow-sm transition-all hover:-translate-y-px hover:shadow-[0_4px_10px_rgba(15,23,42,0.12)]"
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
            <span className="truncate text-[11.5px] font-medium text-ink">
              {it.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
