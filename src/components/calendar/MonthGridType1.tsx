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
import { Plus, Trash2, PersonStanding, GraduationCap, Briefcase, Sparkles, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CellData, CellKey, CalendarEvent } from "./yearStore";
import { makeCellId } from "./yearStore";
import { sameDay, setHM, addMinutes, toISOLocal, fromISOLocal, isoWeekNumber } from "./dateUtils";
import { GROUP_COLOR_PALETTE } from "../GroupColorPicker";
import { DayNoteButton } from "./DayNoteButton";

// Individual session categories. Three have fixed colors + icons for
// consistent UX across the platform; "Else" lets the user pick from the 8
// platform colors.
export const CAT_TRAINING_COLOR = "#B8B8FF"; // Periwinkle
export const CAT_SCHOOL_COLOR = "#ADD8E6";   // Light Blue
export const CAT_WORK_COLOR = "#C19A6B";     // Camel Brown

export type IndividualCategory = "training" | "school" | "work" | "else";

export const INDIVIDUAL_CATEGORIES: {
  value: IndividualCategory;
  label: string;
  color: string | null;
  Icon: LucideIcon;
}[] = [
  { value: "training", label: "Trening", color: CAT_TRAINING_COLOR, Icon: PersonStanding },
  { value: "school",   label: "Skole",   color: CAT_SCHOOL_COLOR,   Icon: GraduationCap },
  { value: "work",     label: "Jobb",    color: CAT_WORK_COLOR,     Icon: Briefcase },
  { value: "else",     label: "Annet",   color: null,               Icon: Sparkles },
];

export function categoryFromColor(color: string | null): IndividualCategory {
  const c = (color ?? "").toLowerCase();
  if (c === CAT_TRAINING_COLOR.toLowerCase()) return "training";
  if (c === CAT_SCHOOL_COLOR.toLowerCase()) return "school";
  if (c === CAT_WORK_COLOR.toLowerCase()) return "work";
  return "else";
}

export function iconForColor(color: string | null): LucideIcon | null {
  const cat = categoryFromColor(color);
  return INDIVIDUAL_CATEGORIES.find((c) => c.value === cat)!.Icon;
}

/** Pick black or white text for best contrast against a hex background. */
export function contrastTextOn(hex: string | null | undefined): string {
  if (!hex) return "hsl(var(--ink, 0 0% 10%))";
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "hsl(var(--ink, 0 0% 10%))";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Relative luminance (sRGB)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0b1220" : "#ffffff";
}

const COLOR_PREFIX_RE = /^\[(#[0-9a-fA-F]{6})\]\s*/;
export function splitColor(raw: string): { color: string | null; text: string } {
  const m = raw.match(COLOR_PREFIX_RE);
  if (m) return { color: m[1], text: raw.slice(m[0].length) };
  return { color: null, text: raw };
}
export function joinColor(color: string | null, text: string): string {
  return color ? `[${color}] ${text}` : text;
}

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

export type CalendarSeat = "admin" | "individual";

export interface MonthGridType1Props {
  calId: string;
  year: number;
  month: number;
  data: Record<string, CellData>;
  seat?: CalendarSeat;
  /** "diary" enables the per-day note affordance. */
  appKind?: "calendar" | "diary";
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onCommitText: (k: CellKey, text: string) => void;
  /** Unified event store — events created here will appear in week view too. */
  events?: CalendarEvent[];
  onUpsertEvent?: (
    patch:
      | (Partial<CalendarEvent> & Pick<CalendarEvent, "startISO" | "endISO" | "title">)
      | (Partial<CalendarEvent> & { id: string }),
  ) => CalendarEvent;
  onMoveEvent?: (id: string, patch: Partial<Pick<CalendarEvent, "startISO" | "endISO" | "allDay">>) => void;
  onDeleteEvent?: (id: string) => void;
  /** When the user clicks a week-number cell, zoom into that week. */
  onWeekClick?: (anchorDate: Date) => void;
  /** Externally-controlled selected day (mirrors mini-calendar). */
  selectedDate?: Date | null;
  /** Notify parent when a day cell is clicked. */
  onSelectDate?: (date: Date) => void;
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
  seat = "individual",
  appKind = "calendar",
  onPrevMonth,
  onNextMonth,
  onCommitText,
  events = [],
  onUpsertEvent,
  onMoveEvent,
  onDeleteEvent,
  onWeekClick,
  selectedDate,
  onSelectDate,
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

  // Mirror externally-controlled selected date (e.g. mini-calendar click).
  useEffect(() => {
    if (!selectedDate) return;
    if (selectedDate.getFullYear() !== year || selectedDate.getMonth() !== month) return;
    const match = days.find((d) => d.inMonth && d.date.getDate() === selectedDate.getDate());
    if (match) setFocus({ row: match.row, col: match.col });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, year, month]);

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
    /** -1 = create new; >=0 = edit existing legacy item index */
    editIdx: number;
    initialText: string;
    initialColor: string | null;
    /** When set, this popover is editing a unified CalendarEvent. */
    eventId?: string;
  } | null>(null);

  const openPopoverAt = useCallback(
    (pos: CellPos, anchor: HTMLElement) => {
      const cell = days.find((d) => d.row === pos.row && d.col === pos.col);
      if (!cell || !cell.inMonth) return;
      setPopover({
        pos,
        rect: anchor.getBoundingClientRect(),
        editIdx: -1,
        initialText: "",
        initialColor: null,
      });
    },
    [days],
  );

  const openItemEditor = useCallback(
    (pos: CellPos, idx: number, raw: string, anchor: HTMLElement) => {
      const { color, text } = splitColor(raw);
      setPopover({
        pos,
        rect: anchor.getBoundingClientRect(),
        editIdx: idx,
        initialText: text,
        initialColor: color,
      });
    },
    [],
  );

  const openEventEditor = useCallback(
    (pos: CellPos, ev: CalendarEvent, anchor: HTMLElement) => {
      setPopover({
        pos,
        rect: anchor.getBoundingClientRect(),
        editIdx: -1,
        initialText: ev.title,
        initialColor: ev.color,
        eventId: ev.id,
      });
    },
    [],
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

  const [dragItem, setDragItem] = useState<
    | { fromKey: CellKey; text: string; source: "legacy" }
    | { fromKey: CellKey; text: string; source: "event"; eventId: string }
    | null
  >(null);

  const moveItem = useCallback(
    (
      from: CellKey,
      toKey: CellKey,
      text: string,
      payload?:
        | { source: "legacy" }
        | { source: "event"; eventId: string },
    ) => {
      if (
        from.year === toKey.year &&
        from.month === toKey.month &&
        from.day === toKey.day
      )
        return;

      // ── Unified event drag: keep time-of-day, change date. ──
      if (payload?.source === "event" && onMoveEvent) {
        const ev = events.find((e) => e.id === payload.eventId);
        if (ev) {
          const start = fromISOLocal(ev.startISO);
          const end = fromISOLocal(ev.endISO);
          const durMin = Math.max(30, Math.round((end.getTime() - start.getTime()) / 60000));
          const newStart = setHM(
            new Date(toKey.year, toKey.month, toKey.day),
            start.getHours(),
            start.getMinutes(),
          );
          onMoveEvent(ev.id, {
            startISO: toISOLocal(newStart),
            endISO: toISOLocal(addMinutes(newStart, durMin)),
          });
        }
        return;
      }

      // ── Legacy text-cell drag (preserved for old data). ──
      const fromId = makeCellId(calId, from);
      const toId = makeCellId(calId, toKey);
      const fromItems = parseItems(data[fromId]?.text);
      const toItems = parseItems(data[toId]?.text);
      const next = fromItems.filter((i) => i.text !== text);
      onCommitText(from, serializeItems(next));
      onCommitText(toKey, serializeItems([...toItems, { idx: toItems.length, text }]));
    },
    [calId, data, onCommitText, events, onMoveEvent],
  );

  // ───────────────────────── Render ─────────────────────────

  // Standard row-height target so all weeks stay perfectly aligned.
  const rowMinHeight = 132;

  // 28px leading column for week numbers; remaining 7 day columns share the
  // rest of the width equally. Mirrors Week-view layout exactly so a zoom
  // animation between the two doesn't shift column widths.
  const GRID_TEMPLATE = "28px repeat(7, minmax(0, 1fr))";

  // Date for the first day in each rendered row → ISO week number.
  const weekRows = useMemo(() => {
    const out: { row: number; weekNo: number; firstDate: Date }[] = [];
    for (let r = 0; r < rows; r++) {
      const first = days[r * 7].date;
      out.push({ row: r, weekNo: isoWeekNumber(first), firstDate: first });
    }
    return out;
  }, [days, rows]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col bg-card"
      tabIndex={0}
    >
      {/* Weekday strip — mirrors the Week view: 28px week-number gutter + 7
          weekday columns. Today's column gets the dark-grey highlight. */}
      <div
        className="grid border-b border-hairline bg-card"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <div className="border-r border-hairline" />
        {WEEKDAYS.map((w, idx) => {
          // The first row of `days` represents this week's Mon..Sun, so we
          // can read each column's date from row 0.
          const colDate = days[idx]?.date;
          const isTodayCol = colDate && isToday(colDate);
          return (
            <div
              key={w}
              className={`px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.08em] ${
                isTodayCol ? "bg-secondary text-ink" : "text-muted-foreground"
              }`}
            >
              {w}
            </div>
          );
        })}
      </div>

      {/* The grid */}
      <div className="relative flex-1 overflow-auto" style={{ scrollbarGutter: "stable" }}>
        <LayoutGroup>
          <div
            className="grid h-full w-full"
            style={
              {
                gridTemplateColumns: GRID_TEMPLATE,
                gridAutoRows: `minmax(${rowMinHeight}px, 1fr)`,
              } as CSSProperties
            }
          >
            {weekRows.map((wr) => (
              <button
                key={`wn-${wr.row}`}
                type="button"
                onClick={() => onWeekClick?.(wr.firstDate)}
                title={`Uke ${wr.weekNo} — klikk for å zoome inn`}
                style={{ gridColumn: 1, gridRow: wr.row + 1 }}
                className="flex items-start justify-center border-b border-r border-hairline pt-2 text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              >
                {wr.weekNo}
              </button>
            ))}
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
              const legacyItems = parseItems(data[id]?.text);
              // Events whose start day is this calendar cell.
              const dayEvents = events.filter((e) => sameDay(fromISOLocal(e.startISO), d.date));

              type UnifiedItem =
                | { kind: "legacy"; idx: number; raw: string }
                | { kind: "event"; event: CalendarEvent };
              const allItems: UnifiedItem[] = [
                ...dayEvents
                  .slice()
                  .sort((a, b) => a.startISO.localeCompare(b.startISO))
                  .map<UnifiedItem>((event) => ({ kind: "event", event })),
                ...legacyItems.map<UnifiedItem>((it) => ({
                  kind: "legacy",
                  idx: it.idx,
                  raw: it.text,
                })),
              ];

              // Strict row alignment: limit visible items, show "+N more"
              const MAX_VISIBLE = 3;
              const visible = allItems.slice(0, MAX_VISIBLE);
              const overflow = Math.max(0, allItems.length - MAX_VISIBLE);

              return (
                <div
                  key={d.idx}
                  data-cell-pos={`${d.row}-${d.col}`}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).dataset.role === "item") return;
                    setFocus(pos);
                    dragAnchorRef.current = pos;
                    setRange({ a: pos, b: pos });
                    if (d.inMonth) onSelectDate?.(d.date);
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
                      moveItem(
                        dragItem.fromKey,
                        k,
                        dragItem.text,
                        dragItem.source === "event"
                          ? { source: "event", eventId: dragItem.eventId }
                          : { source: "legacy" },
                      );
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
                    "group/cell group/daynote-anchor relative flex flex-col border-b border-r border-hairline transition-colors",
                    "first:border-l-0", // first column has no left border (parent supplies)
                    isWeekend ? "bg-muted/20" : "bg-card",
                    !d.inMonth ? "bg-muted/40 text-muted-foreground/60" : "",
                    isInRange ? "bg-primary/10" : "",
                    "hover:bg-secondary/40",
                  ].join(" ")}
                  data-day-anchor=""
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
                      {visible.map((it) => {
                        const raw = it.kind === "legacy" ? it.raw : it.event.title;
                        const itemColor = it.kind === "legacy" ? splitColor(it.raw).color : it.event.color;
                        const displayText = it.kind === "legacy" ? splitColor(it.raw).text : it.event.title;
                        const itemKey = it.kind === "legacy" ? `legacy-${it.idx}` : `event-${it.event.id}`;
                        return (
                          <motion.div
                            key={`${id}-${itemKey}`}
                            layout
                            layoutId={it.kind === "event" ? `evt-${it.event.id}` : undefined}
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -2 }}
                            transition={{
                              duration: 0.14,
                              ease: [0.2, 0, 0, 1],
                            }}
                            data-role="item"
                            data-real-event={it.kind === "event" && !it.event.id.startsWith("__ghost__:") ? "1" : undefined}
                            data-ghost-event={it.kind === "event" && it.event.id.startsWith("__ghost__:") ? "1" : undefined}
                            draggable={!(it.kind === "event" && it.event.id.startsWith("__ghost__:"))}
                            onDragStart={(e) => {
                              const dev = e as unknown as DragEvent;
                              if (dev.dataTransfer) {
                                dev.dataTransfer.effectAllowed = "move";
                                dev.dataTransfer.setData("text/plain", raw);
                              }
                              if (it.kind === "legacy") {
                                setDragItem({ fromKey: k, text: it.raw, source: "legacy" });
                              } else {
                                setDragItem({ fromKey: k, text: it.event.title, source: "event", eventId: it.event.id });
                              }
                            }}
                            onDragEnd={() => setDragItem(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (it.kind === "event" && it.event.id.startsWith("__ghost__:")) {
                                // Ghost preview events are not editable.
                                return;
                              }
                              if (it.kind === "legacy") {
                                openItemEditor(pos, it.idx, it.raw, e.currentTarget as HTMLElement);
                              } else {
                                openEventEditor(pos, it.event, e.currentTarget as HTMLElement);
                              }
                            }}
                            className={[
                              "flex items-center gap-1.5 truncate rounded-[3px] px-1.5 py-0.5 text-[11.5px] text-ink transition-all",
                              itemColor ? "" : "bg-secondary/70",
                              "hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(15,23,42,0.10)]",
                              itemColor ? "" : "hover:bg-secondary",
                            ].join(" ")}
                            style={
                              itemColor
                                ? {
                                    backgroundColor: `${itemColor}1F`,
                                    boxShadow: `inset 2px 0 0 ${itemColor}`,
                                  }
                                : undefined
                            }
                            title={displayText}
                          >
                            {(() => {
                              const Icon = iconForColor(itemColor);
                              return Icon ? (
                                <Icon
                                  className="h-3 w-3 shrink-0"
                                  style={{ color: itemColor ?? "currentColor" }}
                                  strokeWidth={2.25}
                                />
                              ) : itemColor ? (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: itemColor }}
                                />
                              ) : null;
                            })()}
                            <span className="truncate">{displayText}</span>
                          </motion.div>
                        );
                      })}
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
                  {d.inMonth && allItems.length === 0 && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/cell:opacity-100">
                      <Plus className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={2.25} />
                    </span>
                  )}

                  {/* Diary: per-day note (bottom-right corner) */}
                  {appKind === "diary" && d.inMonth && (
                    <DayNoteButton calId={calId} date={d.date} variant="month" />
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

        {/* Inline popover (per-item create or edit) */}
        {popover && (
          <PopoverEditor
            seat={seat}
            initialText={popover.initialText}
            initialColor={popover.initialColor}
            isEdit={popover.editIdx >= 0 || !!popover.eventId}
            anchor={popover.rect}
            enableDuration={!!onUpsertEvent}
            initialTime={(() => {
              if (popover.eventId) {
                const ev = events.find((e) => e.id === popover.eventId);
                if (ev) {
                  const s = fromISOLocal(ev.startISO);
                  const e = fromISOLocal(ev.endISO);
                  // Only show as a duration if it isn't an all-day event.
                  if (!ev.allDay) {
                    return {
                      startMin: s.getHours() * 60 + s.getMinutes(),
                      endMin: e.getHours() * 60 + e.getMinutes(),
                    };
                  }
                }
              }
              return null;
            })()}
            onClose={closePopover}
            onCommit={(text, color, time) => {
              const cell = days.find(
                (d) => d.row === popover.pos.row && d.col === popover.pos.col,
              );
              if (!cell) {
                closePopover();
                return;
              }
              const t = text.trim();

              // ── Editing an existing unified event. ──
              if (popover.eventId) {
                if (!t) {
                  onDeleteEvent?.(popover.eventId);
                } else {
                  const patch: Parameters<NonNullable<typeof onUpsertEvent>>[0] = {
                    id: popover.eventId,
                    title: t,
                    color,
                  };
                  if (time) {
                    const start = setHM(
                      cell.date,
                      Math.floor(time.startMin / 60),
                      time.startMin % 60,
                    );
                    const end = setHM(
                      cell.date,
                      Math.floor(time.endMin / 60),
                      time.endMin % 60,
                    );
                    Object.assign(patch, {
                      startISO: toISOLocal(start),
                      endISO: toISOLocal(end),
                      allDay: false,
                    });
                  }
                  onUpsertEvent?.(patch);
                }
                closePopover();
                return;
              }

              // ── Creating a new item from month view. ──
              // Default to the unified event store so it appears in week view too.
              if (popover.editIdx < 0 && onUpsertEvent) {
                if (t) {
                  const startH = time ? Math.floor(time.startMin / 60) : 9;
                  const startM = time ? time.startMin % 60 : 0;
                  const endH = time ? Math.floor(time.endMin / 60) : 10;
                  const endM = time ? time.endMin % 60 : 0;
                  const start = setHM(cell.date, startH, startM);
                  const end = setHM(cell.date, endH, endM);
                  onUpsertEvent({
                    title: t,
                    color,
                    startISO: toISOLocal(start),
                    endISO: toISOLocal(end),
                    // If the user explicitly set a time, treat as a timed
                    // event (so it appears in week view at that slot).
                    allDay: !time,
                    category: categoryFromColor(color),
                  });
                }
                closePopover();
                return;
              }

              // ── Legacy text-cell edit fallback (for pre-existing data). ──
              const cellKey: CellKey = {
                year: cell.date.getFullYear(),
                month: cell.date.getMonth(),
                day: cell.date.getDate(),
                session: 0,
              };
              const id = makeCellId(calId, cellKey);
              const existing = parseItems(data[id]?.text);
              let next: DayItem[];
              if (popover.editIdx >= 0) {
                if (!t) {
                  next = existing.filter((it) => it.idx !== popover.editIdx);
                } else {
                  next = existing.map((it) =>
                    it.idx === popover.editIdx
                      ? { idx: it.idx, text: joinColor(color, t) }
                      : it,
                  );
                }
              } else {
                next = t
                  ? [...existing, { idx: existing.length, text: joinColor(color, t) }]
                  : existing;
              }
              onCommitText(cellKey, serializeItems(next));
              closePopover();
            }}
          />
        )}
      </div>
    </div>
  );
}

export interface PopoverEditorProps {
  seat: CalendarSeat;
  initialText: string;
  initialColor: string | null;
  isEdit: boolean;
  anchor: DOMRect;
  /** Optional initial time range, in minutes from midnight. */
  initialTime?: { startMin: number; endMin: number } | null;
  /** When true, show the clock affordance for picking a duration. */
  enableDuration?: boolean;
  onClose: () => void;
  onCommit: (
    text: string,
    color: string | null,
    time?: { startMin: number; endMin: number } | null,
  ) => void;
}

// Category defaults — color is the source of truth.
const CAT_MEETING = "#E63337"; // red
const CAT_EVENT = "#F09B0A"; // orange
const CAT_RACE = "#26B270"; // green
const CAT_TRAINING = "#17A4E0"; // light blue (entity training, locked)

type AdminCategory = "meeting" | "event" | "race";
const ADMIN_CATEGORIES: { value: AdminCategory; label: string; color: string }[] = [
  { value: "meeting", label: "Møte", color: CAT_MEETING },
  { value: "event", label: "Event", color: CAT_EVENT },
  { value: "race", label: "Løp", color: CAT_RACE },
];


function adminCategoryFromColor(color: string | null): AdminCategory {
  const c = (color ?? "").toLowerCase();
  if (c === CAT_EVENT.toLowerCase()) return "event";
  if (c === CAT_RACE.toLowerCase()) return "race";
  return "meeting";
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * MiniDurationColumn — a tiny version of the week-view column for picking
 * a session duration inside the month-view popover. Drag from one slot
 * down/up to another; the marked range becomes the session's time. Press
 * Enter (or click "Lagre tid") to commit.
 */
function MiniDurationColumn({
  startHour,
  rows,
  rowHeight,
  initial,
  onCommit,
  onClose,
}: {
  startHour: number;
  rows: number;
  rowHeight: number;
  initial: { startMin: number; endMin: number } | null;
  onCommit: (range: { startMin: number; endMin: number }) => void;
  onClose: () => void;
  color?: string | null;
}) {
  // Convert initial time → slot ranks (lo/hi inclusive).
  const initRange = (() => {
    if (!initial) return null;
    const lo = Math.max(0, Math.min(rows - 1, (initial.startMin - startHour * 60) / 30));
    const hi = Math.max(lo, Math.min(rows - 1, (initial.endMin - startHour * 60) / 30 - 1));
    return { lo: Math.round(lo), hi: Math.round(hi) };
  })();

  const [range, setRange] = useState<{ lo: number; hi: number } | null>(initRange);
  const dragRef = useRef<{ anchor: number } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const rankFromClientY = (clientY: number): number | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + el.scrollTop;
    const r = Math.floor(y / rowHeight);
    if (r < 0 || r >= rows) return Math.max(0, Math.min(rows - 1, r));
    return r;
  };

  const beginAt = (rank: number) => {
    dragRef.current = { anchor: rank };
    setRange({ lo: rank, hi: rank });
  };
  const extendTo = (rank: number) => {
    if (!dragRef.current) return;
    const a = dragRef.current.anchor;
    setRange({ lo: Math.min(a, rank), hi: Math.max(a, rank) });
  };

  // Auto-scroll while dragging near the edges (Excel-style).
  const autoScrollRef = useRef<{ raf: number | null; dy: number; clientY: number }>({
    raf: null,
    dy: 0,
    clientY: 0,
  });
  const stopAutoScroll = () => {
    if (autoScrollRef.current.raf != null) {
      cancelAnimationFrame(autoScrollRef.current.raf);
      autoScrollRef.current.raf = null;
    }
    autoScrollRef.current.dy = 0;
  };
  const tickAutoScroll = () => {
    const el = gridRef.current;
    if (!el || !dragRef.current) {
      stopAutoScroll();
      return;
    }
    const { dy, clientY } = autoScrollRef.current;
    if (dy !== 0) {
      el.scrollTop = Math.max(
        0,
        Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + dy),
      );
      const r = rankFromClientY(clientY);
      if (r != null) extendTo(r);
    }
    autoScrollRef.current.raf = requestAnimationFrame(tickAutoScroll);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const r = rankFromClientY(e.clientY);
      if (r != null) extendTo(r);
      // Edge auto-scroll.
      const el = gridRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const edge = 24;
        let dy = 0;
        if (e.clientY < rect.top + edge) {
          dy = -Math.max(4, Math.ceil((rect.top + edge - e.clientY) / 2));
        } else if (e.clientY > rect.bottom - edge) {
          dy = Math.max(4, Math.ceil((e.clientY - (rect.bottom - edge)) / 2));
        }
        autoScrollRef.current.dy = dy;
        autoScrollRef.current.clientY = e.clientY;
        if (dy !== 0 && autoScrollRef.current.raf == null) {
          autoScrollRef.current.raf = requestAnimationFrame(tickAutoScroll);
        } else if (dy === 0) {
          stopAutoScroll();
        }
      }
    };
    const onUp = () => {
      dragRef.current = null;
      stopAutoScroll();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && range) {
        e.preventDefault();
        e.stopPropagation();
        const startMin = startHour * 60 + range.lo * 30;
        const endMin = startHour * 60 + (range.hi + 1) * 30;
        onCommit({ startMin, endMin });
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey, true);
      stopAutoScroll();
    };
  }, [range, onCommit, onClose, startHour, rows, rowHeight]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header — centered duration time, no label. */}
      <div className="flex items-center justify-center border-b border-hairline px-3 py-2">
        <span className="mono text-[12px] tabular-nums text-ink/80">
          {range
            ? `${fmtMin(startHour * 60 + range.lo * 30)} – ${fmtMin(startHour * 60 + (range.hi + 1) * 30)}`
            : "—"}
        </span>
      </div>
      {/* Slot column — replica of the week-view day column. */}
      <div ref={gridRef} className="relative flex-1 overflow-y-auto mini-dur-scroll">
        <div className="relative" style={{ height: rows * rowHeight }}>
          {Array.from({ length: rows }, (_, i) => {
            const minutes = startHour * 60 + i * 30;
            const isHour = minutes % 60 === 0;
            const inRange = !!range && i >= range.lo && i <= range.hi;
            const isFirstInRange = !!range && i === range.lo;
            const isLastInRange = !!range && i === range.hi;
            const hourLabel = isHour
              ? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`
              : "";
            return (
              <div
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  beginAt(i);
                }}
                onMouseEnter={() => extendTo(i)}
                className={`relative grid h-full cursor-cell select-none ${
                  i > 0 ? "border-t border-hairline/60" : ""
                }`}
                style={{
                  height: rowHeight,
                  gridTemplateColumns: "44px minmax(0,1fr)",
                }}
              >
                {/* Mark overlay — neutral grey just like the week view. */}
                {inRange && (
                  <span
                    className="pointer-events-none absolute inset-x-0 z-[1] bg-muted-foreground/15"
                    style={{
                      top: isFirstInRange ? 0 : -1,
                      bottom: isLastInRange ? 0 : -1,
                    }}
                  />
                )}
                {/* Hour gutter — same font/size as the week column. */}
                <div className="px-2 text-[12px] font-medium tabular-nums text-muted-foreground">
                  {hourLabel}
                </div>
                {/* Body cell — matches week column body (left hairline). */}
                <div className="min-w-0 border-l border-hairline" />
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t border-hairline p-2">
        <button
          type="button"
          disabled={!range}
          onClick={() => {
            if (!range) return;
            const startMin = startHour * 60 + range.lo * 30;
            const endMin = startHour * 60 + (range.hi + 1) * 30;
            onCommit({ startMin, endMin });
          }}
          className="w-full rounded-md bg-primary px-2.5 py-1.5 text-[11.5px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Sett tid
        </button>
      </div>
    </div>
  );
}

/**
 * Notion-style inline popover for adding/editing a single session item.
 * Category dropdown + (individual only) 7-color row.
 */
export function PopoverEditor({
  seat,
  initialText,
  initialColor,
  isEdit,
  anchor,
  initialTime = null,
  enableDuration = false,
  onClose,
  onCommit,
}: PopoverEditorProps) {
  const [value, setValue] = useState(initialText);
  // Resolve initial color according to seat
  const resolvedInitial =
    seat === "admin"
      ? initialColor && [CAT_MEETING, CAT_EVENT, CAT_RACE]
          .map((c) => c.toLowerCase())
          .includes(initialColor.toLowerCase())
        ? initialColor
        : CAT_MEETING
      : initialColor ?? CAT_TRAINING_COLOR;
  const [color, setColor] = useState<string | null>(resolvedInitial);
  const [time, setTime] = useState<{ startMin: number; endMin: number } | null>(initialTime);
  const [showDuration, setShowDuration] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Keep latest values for the unmount-time autosave to avoid stale captures.
  const valueRef = useRef(value);
  const colorRef = useRef(color);
  const timeRef = useRef(time);
  useEffect(() => {
    valueRef.current = value;
    colorRef.current = color;
    timeRef.current = time;
  }, [value, color, time]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onCommit(valueRef.current.trim(), colorRef.current, timeRef.current);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        // The mini duration column captures Enter at capture-phase before
        // this handler runs, so when its panel is open we never commit
        // the whole popover from Enter.
        e.preventDefault();
        onCommit(valueRef.current.trim(), colorRef.current, timeRef.current);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onCommit, onClose]);

  const POPOVER_W = 280;
  const POPOVER_H = seat === "individual" ? 220 : 190;
  const margin = 8;
  let top = anchor.bottom + margin;
  let left = anchor.left;
  if (top + POPOVER_H > window.innerHeight) {
    top = Math.max(margin, anchor.top - POPOVER_H - margin);
  }
  if (left + POPOVER_W > window.innerWidth) {
    left = Math.max(margin, window.innerWidth - POPOVER_W - margin);
  }

  // Mini duration column geometry.
  const DUR_W = 220;
  const DUR_GAP = 8;
  const DUR_ROW_H = 36; // matches week-view ROW_MONTH
  const DUR_START_HOUR = 6;
  const DUR_ROWS = 36; // 06:00 → 24:00 in 30-min slots
  const DUR_H = 360;

  const adminCategory = adminCategoryFromColor(color);

  return (
    <div
      ref={ref}
      data-role="popover"
      className="fixed z-50"
      style={{ top, left, width: POPOVER_W }}
    >
      <div className="relative flex items-start gap-2">
        <div className="flex-1 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {isEdit ? "Rediger økt" : "Legg til økt"}
            </span>
            {enableDuration && (
              <div className="flex items-center gap-1.5">
                {time && (
                  <span className="mono text-[10.5px] tabular-nums text-ink/70">
                    {fmtMin(time.startMin)}–{fmtMin(time.endMin)}
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Sett varighet"
                  title="Sett varighet"
                  onClick={() => setShowDuration((v) => !v)}
                  className={[
                    "rounded-md p-1 transition-colors",
                    showDuration
                      ? "bg-secondary text-ink"
                      : "text-muted-foreground hover:bg-secondary hover:text-ink",
                  ].join(" ")}
                >
                  <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>

          {/* Session name */}
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="f.eks. Intervaller 5×4min"
            className="block w-full bg-transparent px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60"
          />

          {/* Category dropdown — full-width with vertical color bar at left */}
          {(() => {
            const indCat = categoryFromColor(color);
            const indEntry = INDIVIDUAL_CATEGORIES.find((c) => c.value === indCat)!;
            const sideColor =
              seat === "admin"
                ? ADMIN_CATEGORIES.find((c) => c.value === adminCategory)!.color
                : indEntry.color ?? color ?? "transparent";
            return (
              <div className="relative border-t border-hairline">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
                  style={{ background: sideColor }}
                />
                {seat === "admin" ? (
                  <select
                    value={adminCategory}
                    onChange={(e) => {
                      const next = e.target.value as AdminCategory;
                      const cat = ADMIN_CATEGORIES.find((c) => c.value === next)!;
                      setColor(cat.color);
                    }}
                    className="block w-full bg-transparent py-2 pl-4 pr-3 text-[12px] text-ink outline-none"
                  >
                    {ADMIN_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2 pl-4 pr-2 py-1.5">
                    <indEntry.Icon className="h-4 w-4 shrink-0" style={{ color: indEntry.color ?? "currentColor" }} />
                    <select
                      value={indCat}
                      onChange={(e) => {
                        const next = e.target.value as IndividualCategory;
                        const cat = INDIVIDUAL_CATEGORIES.find((c) => c.value === next)!;
                        if (next === "else") {
                          // Default to first palette color if none chosen yet,
                          // otherwise keep the existing custom color if it's not
                          // one of the fixed category colors.
                          const fixed = [CAT_TRAINING_COLOR, CAT_SCHOOL_COLOR, CAT_WORK_COLOR]
                            .map((c) => c.toLowerCase());
                          if (!color || fixed.includes(color.toLowerCase())) {
                            setColor(GROUP_COLOR_PALETTE[0].value);
                          }
                        } else {
                          setColor(cat.color);
                        }
                      }}
                      className="block flex-1 bg-transparent py-1 pr-3 text-[12px] text-ink outline-none"
                    >
                      {INDIVIDUAL_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Individual + "Else" only: 8-color picker */}
          {seat === "individual" && categoryFromColor(color) === "else" && (
            <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-3">
              {GROUP_COLOR_PALETTE.map((c) => {
                const selected = color?.toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={selected}
                    onClick={() => setColor(c.value)}
                    className={[
                      "h-3.5 w-3.5 rounded-full border transition-transform hover:scale-125",
                      selected
                        ? "border-ink/70 ring-2 ring-ink/30 ring-offset-1 ring-offset-card"
                        : "border-black/15",
                    ].join(" ")}
                    style={{ background: c.value }}
                  />
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
            {isEdit ? (
              <button
                type="button"
                aria-label="Slett"
                title="Slett"
                onClick={() => onCommit("", color, time)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="mono tabular-nums">⏎ for å lagre</span>
            )}
            <button
              type="button"
              onClick={() => onCommit(value.trim(), color, time)}
              className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              {isEdit ? "Lagre" : "Legg til"}
            </button>
          </div>
        </div>

        {/* Mini duration column — appears next to the editor when toggled. */}
        {enableDuration && showDuration && (
          <div
            className="absolute left-full top-0"
            style={{ width: DUR_W, height: DUR_H, marginLeft: DUR_GAP }}
          >
            <MiniDurationColumn
              startHour={DUR_START_HOUR}
              rows={DUR_ROWS}
              rowHeight={DUR_ROW_H}
              initial={time}
              color={color}
              onCommit={(t) => {
                setTime(t);
                setShowDuration(false);
              }}
              onClose={() => setShowDuration(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

