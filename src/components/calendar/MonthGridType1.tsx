/**
 * MonthGridType1 — "Type 1" monthly calendar.
 *
 * Aesthetic: Notion (Inter, hairline borders, generous whitespace, soft tints).
 * Logic: Excel (rigid cells, keyboard-driven focus, optimistic writes,
 * range multi-select, drag-and-drop, "+N more" overflow to keep row heights
 * aligned across the week).
 *
 * Data model:
 *   - We reuse the existing yearStore CellData. Each calendar day is mapped
 *     to a synthetic CellKey with session=0 (day-level container). Multiple
 *     "items" inside a day are stored as newline-separated entries in the
 *     `text` field — the simplest possible mapping that survives the
 *     existing persistence layer without a schema migration. The Notion-
 *     style cards in the UI render one entry per line.
 *
 * Interaction:
 *   - Single-click selects a cell (Excel focus).
 *   - Double-click on empty area opens an inline popover to add a session.
 *   - Arrow keys move focus; Enter opens the popover on the focused day.
 *   - Mouse-drag across cells creates a range selection (light-blue overlay).
 *   - Items can be dragged from one day to another with framer-motion layout
 *     animations smoothing the receiving cell's reflow.
 */

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CellData, CellKey } from "./yearStore";
import { makeCellId } from "./yearStore";

const WEEKDAYS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const MONTHS_FULL = [
  "Januar","Februar","Mars","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Desember",
];

// Convert JS Sunday=0 to Monday=0 (European weeks)
function dowMon0(date: Date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}
function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

export interface MonthGridType1Props {
  calId: string;
  year: number;
  month: number;
  data: Record<string, CellData>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onCommitText: (k: CellKey, text: string) => void;
}

interface DayItem {
  /** index in the `\n`-split list */
  idx: number;
  text: string;
}

function parseItems(text?: string): DayItem[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, idx) => ({ idx, text: t }));
}
function serializeItems(items: DayItem[]): string {
  return items.map((i) => i.text).join("\n");
}

interface CellPos {
  row: number;
  col: number;
}

export function MonthGridType1({
  calId,
  year,
  month,
  data,
  onPrevMonth,
  onNextMonth,
  onCommitText,
}: MonthGridType1Props) {
  const dim = daysInMonth(year, month);
  const firstDow = dowMon0(new Date(year, month, 1));
  const totalCells = Math.ceil((firstDow + dim) / 7) * 7;
  const rows = totalCells / 7;

  const days = useMemo(() => {
    return Array.from({ length: totalCells }, (_, i) => {
      const dayNumber = i - firstDow + 1;
      const inMonth = dayNumber >= 1 && dayNumber <= dim;
      let date: Date;
      if (inMonth) date = new Date(year, month, dayNumber);
      else if (dayNumber < 1) date = new Date(year, month, dayNumber); // negative rolls back
      else date = new Date(year, month, dayNumber); // overflow rolls forward
      return {
        idx: i,
        row: Math.floor(i / 7),
        col: i % 7,
        date,
        dayNumber: date.getDate(),
        inMonth,
      };
    });
  }, [year, month, dim, firstDow, totalCells]);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  // ───────────────────────── Focus / selection ─────────────────────────

  const [focus, setFocus] = useState<CellPos>(() => {
    // Default to today if visible, else first in-month cell
    const t = days.find((d) => isToday(d.date) && d.inMonth);
    if (t) return { row: t.row, col: t.col };
    const first = days.find((d) => d.inMonth)!;
    return { row: first.row, col: first.col };
  });

  // Re-focus on month change to the first in-month cell
  useEffect(() => {
    const first = days.find((d) => d.inMonth);
    if (first) setFocus({ row: first.row, col: first.col });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // Drag-selection (mouse range across cells)
  const dragAnchorRef = useRef<CellPos | null>(null);
  const [range, setRange] = useState<{ a: CellPos; b: CellPos } | null>(null);

  const inRange = useCallback(
    (pos: CellPos) => {
      if (!range) return false;
      const r1 = Math.min(range.a.row, range.b.row);
      const r2 = Math.max(range.a.row, range.b.row);
      const c1 = Math.min(range.a.col, range.b.col);
      const c2 = Math.max(range.a.col, range.b.col);
      return pos.row >= r1 && pos.row <= r2 && pos.col >= c1 && pos.col <= c2;
    },
    [range],
  );

  useEffect(() => {
    const onUp = () => {
      dragAnchorRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // ───────────────────────── Popover (add/edit) ─────────────────────────

  const [popover, setPopover] = useState<{
    pos: CellPos;
    rect: DOMRect;
    initial: string;
  } | null>(null);

  const openPopoverAt = useCallback(
    (pos: CellPos, anchor: HTMLElement) => {
      const cell = days.find((d) => d.row === pos.row && d.col === pos.col);
      if (!cell || !cell.inMonth) return;
      const k: CellKey = {
        year: cell.date.getFullYear(),
        month: cell.date.getMonth(),
        day: cell.date.getDate(),
        session: 0,
      };
      const id = makeCellId(calId, k);
      setPopover({
        pos,
        rect: anchor.getBoundingClientRect(),
        initial: data[id]?.text ?? "",
      });
    },
    [calId, data, days],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  // ───────────────────────── Keyboard ─────────────────────────

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

      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setRange(null);
        setFocus((f) => {
          let r = f.row + dr;
          let c = f.col + dc;
          if (c < 0) {
            c = 6;
            r -= 1;
          } else if (c > 6) {
            c = 0;
            r += 1;
          }
          if (r < 0 || r > rows - 1) return f;
          return { row: r, col: c };
        });
      };

      if (e.key === "ArrowDown") move(1, 0);
      else if (e.key === "ArrowUp") move(-1, 0);
      else if (e.key === "ArrowRight") move(0, 1);
      else if (e.key === "ArrowLeft") move(0, -1);
      else if (e.key === "Enter") {
        e.preventDefault();
        const el = containerRef.current?.querySelector<HTMLElement>(
          `[data-cell-pos="${focus.row}-${focus.col}"]`,
        );
        if (el) openPopoverAt(focus, el);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, openPopoverAt, popover, rows]);

  // ───────────────────────── Drag-and-drop items ─────────────────────────

  const [dragItem, setDragItem] = useState<{
    fromKey: CellKey;
    text: string;
  } | null>(null);

  const moveItem = useCallback(
    (from: CellKey, toKey: CellKey, text: string) => {
      if (
        from.year === toKey.year &&
        from.month === toKey.month &&
        from.day === toKey.day
      )
        return;
      const fromId = makeCellId(calId, from);
      const toId = makeCellId(calId, toKey);
      const fromItems = parseItems(data[fromId]?.text);
      const toItems = parseItems(data[toId]?.text);
      const next = fromItems.filter((i) => i.text !== text);
      onCommitText(from, serializeItems(next));
      onCommitText(toKey, serializeItems([...toItems, { idx: toItems.length, text }]));
    },
    [calId, data, onCommitText],
  );

  // ───────────────────────── Render ─────────────────────────

  // Standard row-height target so all weeks stay perfectly aligned.
  const rowMinHeight = 132;

  const headerLabel = `${MONTHS_FULL[month]} ${year}`;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col bg-card"
      tabIndex={0}
    >
      {/* Minimalist month header (Notion-style) */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">
          {headerLabel}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Forrige måned"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Neste måned"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {/* Weekday strip */}
      <div className="grid grid-cols-7 border-b border-hairline bg-card">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
          >
            {w}
          </div>
        ))}
      </div>

      {/* The grid */}
      <div className="relative flex-1 overflow-auto">
        <LayoutGroup>
          <div
            className="grid h-full w-full"
            style={
              {
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gridAutoRows: `minmax(${rowMinHeight}px, 1fr)`,
              } as CSSProperties
            }
          >
            {days.map((d) => {
              const pos: CellPos = { row: d.row, col: d.col };
              const focused = focus.row === d.row && focus.col === d.col;
              const isInRange = inRange(pos);
              const isWeekend = d.col >= 5;
              const todayCell = isToday(d.date) && d.inMonth;

              const k: CellKey = {
                year: d.date.getFullYear(),
                month: d.date.getMonth(),
                day: d.date.getDate(),
                session: 0,
              };
              const id = makeCellId(calId, k);
              const items = parseItems(data[id]?.text);

              // Strict row alignment: limit visible items, show "+N more"
              const MAX_VISIBLE = 3;
              const visible = items.slice(0, MAX_VISIBLE);
              const overflow = Math.max(0, items.length - MAX_VISIBLE);

              return (
                <div
                  key={d.idx}
                  data-cell-pos={`${d.row}-${d.col}`}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).dataset.role === "item") return;
                    setFocus(pos);
                    dragAnchorRef.current = pos;
                    setRange({ a: pos, b: pos });
                  }}
                  onMouseEnter={() => {
                    if (dragAnchorRef.current) {
                      setRange({ a: dragAnchorRef.current, b: pos });
                    }
                    if (dragItem) {
                      // hover preview only — drop logic is in onMouseUp
                    }
                  }}
                  onMouseUp={(e) => {
                    if (dragItem && d.inMonth) {
                      moveItem(dragItem.fromKey, k, dragItem.text);
                      setDragItem(null);
                    }
                    // If user clicked without dragging, collapse range to focus
                    if (
                      dragAnchorRef.current &&
                      dragAnchorRef.current.row === pos.row &&
                      dragAnchorRef.current.col === pos.col
                    ) {
                      setRange(null);
                    }
                    void e;
                  }}
                  onDoubleClick={(e) => {
                    if (!d.inMonth) return;
                    if ((e.target as HTMLElement).dataset.role === "item") return;
                    openPopoverAt(pos, e.currentTarget);
                  }}
                  className={[
                    "group/cell relative flex flex-col border-b border-r border-hairline transition-colors",
                    "first:border-l-0", // first column has no left border (parent supplies)
                    isWeekend ? "bg-muted/20" : "bg-card",
                    !d.inMonth ? "bg-muted/40 text-muted-foreground/60" : "",
                    isInRange ? "bg-primary/10" : "",
                    "hover:bg-secondary/40",
                  ].join(" ")}
                  style={{ cursor: d.inMonth ? "cell" : "default" }}
                >
                  {/* Day number — small, top-right, muted */}
                  <div className="flex items-start justify-between px-2 pt-1.5">
                    <span className="invisible text-[11px]">·</span>
                    <span
                      className={[
                        "grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-medium",
                        todayCell
                          ? "bg-primary text-primary-foreground"
                          : d.inMonth
                            ? "text-ink/70"
                            : "text-muted-foreground/50",
                      ].join(" ")}
                    >
                      {d.dayNumber}
                    </span>
                  </div>

                  {/* Items list */}
                  <div className="flex-1 space-y-0.5 px-1.5 pb-1.5 pt-1">
                    <AnimatePresence initial={false}>
                      {visible.map((it) => (
                        <motion.div
                          key={`${id}-${it.idx}-${it.text}`}
                          layout
                          initial={{ opacity: 0, y: -2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -2 }}
                          transition={{
                            duration: 0.14,
                            ease: [0.2, 0, 0, 1],
                          }}
                          data-role="item"
                          draggable
                          onDragStart={(e) => {
                            // Use HTML5 dragstart only to set ghost; track via state
                            const ev = e as unknown as DragEvent;
                            if (ev.dataTransfer) {
                              ev.dataTransfer.effectAllowed = "move";
                              ev.dataTransfer.setData("text/plain", it.text);
                            }
                            setDragItem({ fromKey: k, text: it.text });
                          }}
                          onDragEnd={() => setDragItem(null)}
                          className="cursor-grab truncate rounded-[3px] bg-secondary/70 px-1.5 py-0.5 text-[11.5px] text-ink hover:bg-secondary active:cursor-grabbing"
                          title={it.text}
                        >
                          {it.text}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {overflow > 0 && (
                      <button
                        type="button"
                        data-role="item"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPopoverAt(pos, e.currentTarget.closest("[data-cell-pos]") as HTMLElement);
                        }}
                        className="mono w-full truncate rounded-[3px] px-1.5 py-0.5 text-left text-[10.5px] tabular-nums text-muted-foreground hover:bg-secondary"
                      >
                        +{overflow} mer
                      </button>
                    )}
                  </div>

                  {/* Hover "+" affordance — visible only when cell is empty + in month */}
                  {d.inMonth && items.length === 0 && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/cell:opacity-100">
                      <Plus className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={2.25} />
                    </span>
                  )}

                  {/* Excel focus ring */}
                  {focused && d.inMonth && (
                    <span className="pointer-events-none absolute inset-0 z-[2] rounded-[2px] outline outline-2 outline-primary outline-offset-[-2px]" />
                  )}
                </div>
              );
            })}
          </div>
        </LayoutGroup>

        {/* Inline popover */}
        {popover && (
          <PopoverEditor
            initial={popover.initial}
            anchor={popover.rect}
            onClose={closePopover}
            onCommit={(text) => {
              const cell = days.find(
                (d) => d.row === popover.pos.row && d.col === popover.pos.col,
              );
              if (cell) {
                onCommitText(
                  {
                    year: cell.date.getFullYear(),
                    month: cell.date.getMonth(),
                    day: cell.date.getDate(),
                    session: 0,
                  },
                  text,
                );
              }
              closePopover();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface PopoverEditorProps {
  initial: string;
  anchor: DOMRect;
  onClose: () => void;
  onCommit: (text: string) => void;
}

/**
 * Notion-style inline popover. Allows the user to add/edit the day's items.
 * Items are stored as newline-separated text lines (one item per line).
 */
function PopoverEditor({ initial, anchor, onClose, onCommit }: PopoverEditorProps) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onCommit(value.trim());
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onCommit(value.trim());
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [value, onCommit, onClose]);

  // Position: prefer below the cell; flip above if not enough room.
  const POPOVER_W = 280;
  const POPOVER_H = 180;
  const margin = 8;
  let top = anchor.bottom + margin;
  let left = anchor.left;
  if (top + POPOVER_H > window.innerHeight) {
    top = Math.max(margin, anchor.top - POPOVER_H - margin);
  }
  if (left + POPOVER_W > window.innerWidth) {
    left = Math.max(margin, window.innerWidth - POPOVER_W - margin);
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
      style={{ top, left, width: POPOVER_W }}
    >
      <div className="border-b border-hairline px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Legg til økt
      </div>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={"Skriv én økt per linje\nf.eks. Intervaller 5×4min"}
        className="block h-[120px] w-full resize-none bg-transparent px-3 py-2 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
        <span className="mono tabular-nums">⌘ + ⏎ for å lagre</span>
        <button
          type="button"
          onClick={() => onCommit(value.trim())}
          className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
        >
          Lagre
        </button>
      </div>
    </div>
  );
}
