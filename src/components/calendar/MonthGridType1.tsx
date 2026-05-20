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
import { Plus, Trash2, PersonStanding, GraduationCap, Briefcase, Sparkles, Clock, Bike, Waves, Dumbbell, Snowflake, Footprints } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CellData, CellKey, CalendarEvent } from "./yearStore";
import { makeCellId } from "./yearStore";
import { sameDay, setHM, addMinutes, toISOLocal, fromISOLocal, isoWeekNumber } from "./dateUtils";
import { GROUP_COLOR_PALETTE } from "../GroupColorPicker";
import { DayNoteButton } from "./DayNoteButton";
import { useUserCategories } from "@/hooks/useUserCategories";
import { useMonthTileDesign } from "@/lib/month-tile-design";
import { useDistanceUnit, kmToUnit, unitLabel } from "@/lib/units";

import { DiaryPopoverEditor, type DiaryPopoverValue } from "./DiaryPopoverEditor";

function activityIconFor(ev: CalendarEvent): LucideIcon {
  const k = (ev.activity || ev.diarySub || "").toLowerCase();
  if (k === "cycling" || k === "bike") return Bike;
  if (k === "swimming" || k === "swim") return Waves;
  if (k === "strength") return Dumbbell;
  if (k === "xcskiing") return Snowflake;
  return Footprints;
}

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
  /** Reorder a sequence of event ids within a day (writes sortIndex values). */
  onReorderEvents?: (ids: string[]) => void;
  /** When the user clicks a week-number cell, zoom into that week. */
  onWeekClick?: (anchorDate: Date) => void;
  /** Externally-controlled selected day (mirrors mini-calendar). */
  selectedDate?: Date | null;
  /** Notify parent when a day cell is clicked. */
  onSelectDate?: (date: Date) => void;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
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
  onReorderEvents,
  onWeekClick,
  selectedDate,
  onSelectDate,
  memberId,
  viewerRole = "owner",
}: MonthGridType1Props) {
  const dim = daysInMonth(year, month);
  const [monthTileDesign] = useMonthTileDesign();
  const [distanceUnit] = useDistanceUnit();
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

  // Anchor the popover to the day cell (so its top edge aligns with the
  // week-row's top edge), regardless of where the triggering chip sits
  // vertically inside the cell. Keeps drag-drop / click / new all consistent.
  const cellAnchorRect = useCallback((anchor: HTMLElement): DOMRect => {
    const cell = anchor.closest('[data-day-anchor]') as HTMLElement | null;
    return (cell ?? anchor).getBoundingClientRect();
  }, []);

  const openItemEditor = useCallback(
    (pos: CellPos, idx: number, raw: string, anchor: HTMLElement) => {
      const { color, text } = splitColor(raw);
      setPopover({
        pos,
        rect: cellAnchorRect(anchor),
        editIdx: idx,
        initialText: text,
        initialColor: color,
      });
    },
    [cellAnchorRect],
  );

  const openEventEditor = useCallback(
    (pos: CellPos, ev: CalendarEvent, anchor: HTMLElement) => {
      setPopover({
        pos,
        rect: cellAnchorRect(anchor),
        editIdx: -1,
        initialText: ev.title,
        initialColor: ev.color,
        eventId: ev.id,
      });
    },
    [cellAnchorRect],
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

  // ───────────────────────── Drag-and-drop sessions ─────────────────────────
  //
  // Pointer-based drag for cross-day session moves. HTML5 native drag
  // is intentionally avoided because it suppresses pointer/mouse events
  // mid-drag, which broke hover-target detection.

  const [dragItem, setDragItem] = useState<
    | { fromKey: CellKey; text: string; source: "legacy" }
    | null
  >(null);
  // Active cross-day session drag (real pointer drag, not HTML5).
  const [dragSession, setDragSession] = useState<{
    eventId: string;
    fromKey: CellKey;
    originalStartISO: string;
    originalEndISO: string;
    event: CalendarEvent;
    targetDayKey: string | null;
    targetDate: Date | null;
    insertIndex: number;
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
    chipWidth: number;
    chipHeight: number;
  } | null>(null);
  const dragSessionRef = useRef(dragSession);
  useEffect(() => {
    dragSessionRef.current = dragSession;
  }, [dragSession]);
  // Mutable tracking ref used by chip onPointerDown to remember the press
  // before deciding if it's a click or a drag (>= 4px movement).
  const dragStartRef = useRef<{
    x: number;
    y: number;
    eventId: string;
    fromKey: CellKey;
    originalStartISO: string;
    originalEndISO: string;
    event: CalendarEvent;
    offsetX: number;
    offsetY: number;
    chipWidth: number;
    chipHeight: number;
  } | null>(null);


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

  // Pointer-based cross-day session drag. We attach window listeners once
  // and consult dragStartRef + the current events list to compute the
  // target day cell + the insertion index for the ghost preview chip.
  useEffect(() => {
    const eventsRef = events;
    const onMove = (e: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const active = dragSessionRef.current;
      if (!active && Math.hypot(dx, dy) < 4) return;

      // Hit-test the cell under the pointer.
      const node = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cell = node?.closest<HTMLElement>("[data-cell-pos]");
      const dayKey = cell?.getAttribute("data-day-key") ?? null;
      const posStr = cell?.getAttribute("data-cell-pos") ?? null;
      let targetDate: Date | null = null;
      let insertIndex = 0;
      if (cell && posStr && dayKey) {
        const [rowS, colS] = posStr.split("-");
        const cellIdx = Number(rowS) * 7 + Number(colS);
        const d = days[cellIdx];
        if (d) {
          targetDate = d.date;
          // Compute insertion index strictly by session start time,
          // ignoring the moved event. Earlier start = earlier slot.
          const movedKey = Date.parse(start.originalStartISO);
          const sorted = eventsRef
            .filter((ev) => ev.id !== start.eventId && sameDay(fromISOLocal(ev.startISO), d.date))
            .slice()
            .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
          insertIndex = sorted.length;
          for (let i = 0; i < sorted.length; i++) {
            const ka = Date.parse(sorted[i].startISO);
            if (movedKey < ka) {
              insertIndex = i;
              break;
            }
          }
        } else {
          targetDate = null;
        }
      }

      if (!active) {
        setDragSession({
          eventId: start.eventId,
          fromKey: start.fromKey,
          originalStartISO: start.originalStartISO,
          originalEndISO: start.originalEndISO,
          event: start.event,
          targetDayKey: targetDate ? dayKey : null,
          targetDate,
          insertIndex,
          pointerX: e.clientX,
          pointerY: e.clientY,
          offsetX: start.offsetX,
          offsetY: start.offsetY,
          chipWidth: start.chipWidth,
          chipHeight: start.chipHeight,
        });
      } else {
        setDragSession((prev) =>
          prev
            ? {
                ...prev,
                targetDayKey: targetDate ? dayKey : null,
                targetDate,
                insertIndex,
                pointerX: e.clientX,
                pointerY: e.clientY,
              }
            : prev,
        );
      }
    };

    const onUp = () => {
      const start = dragStartRef.current;
      const drag = dragSessionRef.current;
      dragStartRef.current = null;
      if (!drag) {
        return;
      }
      setDragSession(null);
      void start;
      const td = drag.targetDate;
      if (!td) return;
      const sameDayDrop =
        drag.fromKey.year === td.getFullYear() &&
        drag.fromKey.month === td.getMonth() &&
        drag.fromKey.day === td.getDate();
      if (sameDayDrop) return;
      const newKey: CellKey = {
        year: td.getFullYear(),
        month: td.getMonth(),
        day: td.getDate(),
        session: 0,
      };
      moveItem(drag.fromKey, newKey, drag.event.title, {
        source: "event",
        eventId: drag.eventId,
      });
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-event-id="${drag.eventId.replace(/"/g, '\\"')}"]`,
        );
        if (!el) return;
        const cell = days.find(
          (d) =>
            d.date.getFullYear() === td.getFullYear() &&
            d.date.getMonth() === td.getMonth() &&
            d.date.getDate() === td.getDate(),
        );
        if (!cell) return;
        // Fetch the freshest event by id; fall back to the dragged copy.
        const fresh = events.find((e) => e.id === drag.eventId) ?? {
          ...drag.event,
        };
        openEventEditor({ row: cell.row, col: cell.col }, fresh, el);
      });

    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [days, events, moveItem]);


  // ───────────────────────── Render ─────────────────────────

  // Standard row-height target so all weeks stay perfectly aligned.
  const rowMinHeight = 168;

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
      className="relative flex h-full min-h-0 w-full flex-col"
      tabIndex={0}
    >
      {/* Weekday strip — mirrors the Week view: 28px week-number gutter + 7
          weekday columns. Today's column gets the dark-grey highlight. */}
      <div
        className="grid flex-none border-b border-hairline bg-card"
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
      <div className="relative flex-1 min-h-0 overflow-y-auto">
        <LayoutGroup>
          <div
            className="grid w-full"
            style={
              {
                gridTemplateColumns: GRID_TEMPLATE,
                gridAutoRows: `${rowMinHeight}px`,
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
              const sortedDayEvents = dayEvents
                .slice()
                .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));

              type UnifiedItem =
                | { kind: "legacy"; idx: number; raw: string }
                | { kind: "event"; event: CalendarEvent };
              const allItems: UnifiedItem[] = [
                ...sortedDayEvents.map<UnifiedItem>((event) => ({ kind: "event", event })),
                ...legacyItems.map<UnifiedItem>((it) => ({
                  kind: "legacy",
                  idx: it.idx,
                  raw: it.text,
                })),
              ];

              // Strict row alignment: limit visible items, show "+N more"
              const MAX_VISIBLE = 5;
              const visible = allItems.slice(0, MAX_VISIBLE);
              const overflow = Math.max(0, allItems.length - MAX_VISIBLE);

              return (
                <div
                  key={d.idx}
                  data-cell-pos={`${d.row}-${d.col}`}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest('[data-role="item"]')) return;
                    setFocus(pos);
                    dragAnchorRef.current = pos;
                    setRange({ a: pos, b: pos });
                    if (d.inMonth) onSelectDate?.(d.date);
                  }}
                  onMouseEnter={() => {
                    if (dragAnchorRef.current) {
                      setRange({ a: dragAnchorRef.current, b: pos });
                    }
                  }}
                  onMouseUp={(e) => {
                    if (dragItem && d.inMonth) {
                      moveItem(dragItem.fromKey, k, dragItem.text, { source: "legacy" });
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
                    // Ignore dblclicks that originate inside an existing item
                    // (target may be a child span/icon without data-role).
                    if ((e.target as HTMLElement).closest('[data-role="item"]')) return;
                    openPopoverAt(pos, e.currentTarget);
                  }}
                  className={[
                    "group/cell group/daynote-anchor relative flex flex-col border-b border-r border-hairline transition-colors",
                    "first:border-l-0", // first column has no left border (parent supplies)
                    isInRange || (focused && d.inMonth)
                      ? "bg-muted-foreground/15"
                      : !d.inMonth
                        ? "bg-muted/40 text-muted-foreground/60"
                        : isWeekend
                          ? "bg-muted/20"
                          : "bg-card",
                    // Suppress per-cell hover tint while dragging a session,
                    // so only the ghost-preview indicates the drop target.
                    dragSession ? "select-none" : "hover:bg-secondary/40",
                  ].join(" ")}
                  data-day-anchor=""
                  data-day-key={id}
                  style={{ cursor: "default" }}

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
                    {(() => {
                      // Decide whether to splice a ghost preview chip into
                      // this day's list during a cross-day drag.
                      const isSourceDay =
                        !!dragSession &&
                        dragSession.fromKey.year === d.date.getFullYear() &&
                        dragSession.fromKey.month === d.date.getMonth() &&
                        dragSession.fromKey.day === d.date.getDate();
                      const isTargetDay =
                        !!dragSession && dragSession.targetDayKey === id && !isSourceDay;

                      // Keep the source event visible during drag — the
                      // ghost preview in the target cell simply indicates
                      // where it will land on release.
                      const baseVisible = visible;


                      type RenderItem =
                        | { kind: "ghost" }
                        | UnifiedItem;
                      const renderList: RenderItem[] = [...baseVisible];
                      if (isTargetDay && dragSession) {
                        const idx = Math.min(
                          Math.max(0, dragSession.insertIndex),
                          renderList.length,
                        );
                        renderList.splice(idx, 0, { kind: "ghost" });
                      }
                      const renderVisible = renderList.slice(0, MAX_VISIBLE);

                      const renderGhost = () => {
                        if (!dragSession) return null;
                        const ev = dragSession.event;
                        const isDiaryEvent = appKind === "diary";
                        const tall =
                          isDiaryEvent &&
                          (monthTileDesign === "split" ||
                            monthTileDesign === "stacked");
                        return (
                          <div
                            key={`${id}-ghost-move`}
                            data-role="ghost-move"
                            className="pointer-events-none rounded-[3px] border-2 border-solid border-primary/70 bg-primary/10"
                            style={{
                              minHeight: tall ? 44 : 22,
                              borderColor: ev.color
                                ? `${ev.color}CC`
                                : undefined,
                              background: ev.color
                                ? `${ev.color}1F`
                                : undefined,
                            }}
                          />
                        );
                      };

                      return (
                        <AnimatePresence initial={false}>
                          {renderVisible.map((it, idx) => {
                            if (it.kind === "ghost") {
                              return (
                                <motion.div
                                  key={`${id}-ghost-${idx}`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.1 }}
                                >
                                  {renderGhost()}
                                </motion.div>
                              );
                            }
                            const raw = it.kind === "legacy" ? it.raw : it.event.title;
                            const itemColor = it.kind === "legacy" ? splitColor(it.raw).color : it.event.color;
                            const displayText = it.kind === "legacy" ? splitColor(it.raw).text : it.event.title;
                            const itemKey = it.kind === "legacy" ? `legacy-${it.idx}` : `event-${it.event.id}`;
                            const isDiaryEvent = appKind === "diary" && it.kind === "event";
                            const tall = isDiaryEvent && (monthTileDesign === "split" || monthTileDesign === "stacked");
                            const isRealEvent =
                              it.kind === "event" && !it.event.id.startsWith("__ghost__:");
                            return (
                          <motion.div
                            key={`${id}-${itemKey}`}
                            initial={false}
                            animate={{
                              opacity:
                                dragSession &&
                                it.kind === "event" &&
                                dragSession.eventId === it.event.id
                                  ? 0
                                  : 1,
                            }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0 }}
                            data-role="item"
                            data-real-event={isRealEvent ? "1" : undefined}
                            data-ghost-event={it.kind === "event" && it.event.id.startsWith("__ghost__:") ? "1" : undefined}
                            data-event-id={isRealEvent ? it.event.id : undefined}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              if (it.kind === "legacy") return;
                              if (it.event.id.startsWith("__ghost__:")) return;
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              // Start tracking a potential drag.
                              dragStartRef.current = {
                                x: e.clientX,
                                y: e.clientY,
                                eventId: it.event.id,
                                fromKey: k,
                                originalStartISO: it.event.startISO,
                                originalEndISO: it.event.endISO,
                                event: it.event,
                                offsetX: e.clientX - rect.left,
                                offsetY: e.clientY - rect.top,
                                chipWidth: rect.width,
                                chipHeight: rect.height,
                              };
                              // Prevent cell-level range selection mousedown.
                              e.stopPropagation();
                            }}
                            onDragStart={(e) => {
                              // Block native HTML5 drag so pointer events keep flowing.
                              e.preventDefault();
                            }}
                            draggable={false}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (dragSessionRef.current) return;
                              if (it.kind === "event" && it.event.id.startsWith("__ghost__:")) {
                                return;
                              }
                              if (it.kind === "legacy") {
                                openItemEditor(pos, it.idx, it.raw, e.currentTarget as HTMLElement);
                              } else {
                                openEventEditor(pos, it.event, e.currentTarget as HTMLElement);
                              }
                            }}
                            className={
                              tall
                                ? [
                                    "relative flex items-stretch overflow-hidden rounded-[3px] text-[11.5px] text-ink",
                                    "transition-all hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(15,23,42,0.10)]",
                                    itemColor ? "" : "bg-secondary/70",
                                  ].join(" ")
                                : [
                                    "flex items-center gap-1.5 truncate rounded-[3px] px-1.5 py-0.5 text-[11.5px] text-ink",
                                    "transition-all hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(15,23,42,0.10)]",
                                    itemColor ? "" : "bg-secondary/70",
                                    itemColor ? "" : "hover:bg-secondary",
                                  ].join(" ")

                            }
                            style={
                              tall
                                ? {
                                    minHeight: 44,
                                    backgroundColor: itemColor ? `${itemColor}1F` : undefined,
                                    boxShadow: itemColor ? `inset 2px 0 0 ${itemColor}` : undefined,
                                  }
                                : itemColor
                                  ? {
                                      backgroundColor: `${itemColor}1F`,
                                      boxShadow: `inset 2px 0 0 ${itemColor}`,
                                    }
                                  : {}
                            }
                            title={displayText}
                          >
                            {isDiaryEvent ? (() => {
                              const ev = it.kind === "event" ? it.event : null;
                              if (!ev) return null;
                              const ActIcon = activityIconFor(ev);
                              const accent = itemColor ?? "currentColor";
                              const km = ev.distanceKm;
                              const distVal = km != null ? kmToUnit(km, distanceUnit) : null;
                              const actKey = (ev.activity || ev.diarySub || "").toLowerCase();
                              const isStrength = actKey === "strength";
                              const startDate = fromISOLocal(ev.startISO);
                              const endDate = fromISOLocal(ev.endISO);
                              const totalMin = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
                              const durH = Math.floor(totalMin / 60);
                              const durM = totalMin % 60;
                              const isNorwegian = typeof navigator !== "undefined" && /^nb|^nn|^no/i.test(navigator.language || "");
                              const hourSuffix = isNorwegian ? "t" : "h";
                              const durStr = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")} – ${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
                              const strengthLabel = durH > 0 ? `${durH}${hourSuffix} ${durM}m` : `${durM}m`;
                              const distLabel = isStrength
                                ? strengthLabel
                                : distVal != null ? `${distVal.toFixed(1)} ${unitLabel(distanceUnit)}` : "—";
                              const iconHalfBg = itemColor
                                ? `color-mix(in srgb, ${itemColor} 40%, white)`
                                : "rgba(0,0,0,0.05)";

                              if (monthTileDesign === "stacked") {
                                return (
                                  <>
                                    <div
                                      className="flex w-1/2 items-center justify-center"
                                      style={{ background: iconHalfBg }}
                                    >
                                      <ActIcon className="h-5 w-5 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
                                    </div>
                                    <div className="flex w-1/2 min-w-0 flex-col justify-center px-2 leading-tight">
                                      <span className="truncate text-[11px] font-semibold">{ev.title}</span>
                                      <span className="mono truncate text-[10px] tabular-nums opacity-70">{durStr}</span>
                                      {!isStrength && (
                                        <span className="mono truncate text-[10px] tabular-nums opacity-70">{distLabel}</span>
                                      )}
                                    </div>
                                  </>
                                );
                              }
                              if (monthTileDesign === "split") {
                                return (
                                  <>
                                    <div
                                      className="flex w-1/2 items-center justify-center"
                                      style={{ background: iconHalfBg }}
                                    >
                                      <ActIcon className="h-6 w-6 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
                                    </div>
                                    <div
                                      className="flex w-1/2 items-center justify-center text-ink"
                                      title={distLabel}
                                    >
                                      {isStrength ? (
                                        <span
                                          className="flex items-baseline gap-1"
                                          style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 18, lineHeight: 1 }}
                                        >
                                          {durH > 0 && (
                                            <>
                                              <span>{durH}</span>
                                              <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{hourSuffix}</span>
                                            </>
                                          )}
                                          <span>{durM}</span>
                                          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>m</span>
                                        </span>
                                      ) : distVal != null ? (
                                        <span
                                          className="flex items-baseline gap-1"
                                          style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 18, lineHeight: 1 }}
                                        >
                                          <span>{distVal.toFixed(1)}</span>
                                          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{unitLabel(distanceUnit)}</span>
                                        </span>
                                      ) : (
                                        "—"
                                      )}
                                    </div>
                                  </>
                                );
                              }
                              // "compact" — current low tile
                              return (
                                <>
                                  <span className="truncate">{displayText}</span>
                                </>
                              );
                            })() : (
                              <>
                                <span className="truncate">{displayText}</span>
                              </>
                            )}
                          </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      );
                    })()}
                    {overflow > 0 && (
                      <button
                        type="button"
                        data-role="item"
                        onClick={(e) => {
                          e.stopPropagation();
                          onWeekClick?.(d.date);
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
                    <DayNoteButton calId={calId} date={d.date} variant="month" memberId={memberId} viewerRole={viewerRole} />
                  )}

                  {/* Focus ring intentionally removed — keep selection subtle */}
                </div>
              );
            })}
          </div>
        </LayoutGroup>

        {/* In-cell reorder + confirmation modal intentionally removed. */}





        {/* Inline popover (per-item create or edit) */}
        {popover && appKind === "diary" && (() => {
          const cell = days.find(
            (d) => d.row === popover.pos.row && d.col === popover.pos.col,
          );
          if (!cell) return null;
          const existingEv = popover.eventId ? events.find((e) => e.id === popover.eventId) ?? null : null;
          const initialTime = (() => {
            if (existingEv && !existingEv.allDay) {
              const s = fromISOLocal(existingEv.startISO);
              const e = fromISOLocal(existingEv.endISO);
              return {
                startMin: s.getHours() * 60 + s.getMinutes(),
                endMin: e.getHours() * 60 + e.getMinutes(),
              };
            }
            return { startMin: 9 * 60, endMin: 10 * 60 };
          })();
          return (
            <DiaryPopoverEditor
              key={popover.eventId ?? `new-${popover.pos.row}-${popover.pos.col}`}
              initialEvent={existingEv ?? { title: popover.initialText }}
              isEdit={!!existingEv}
              anchor={popover.rect}
              initialTime={initialTime}
              date={cell.date}
              onClose={closePopover}
              onCommit={(v: DiaryPopoverValue, opts) => {
                if (opts?.delete && popover.eventId) {
                  onDeleteEvent?.(popover.eventId);
                  closePopover();
                  return;
                }
                const time = v.time ?? initialTime;
                const start = setHM(cell.date, Math.floor(time.startMin / 60), time.startMin % 60);
                const end = setHM(cell.date, Math.floor(time.endMin / 60), time.endMin % 60);
                if (popover.eventId) {
                  if (!v.title) {
                    onDeleteEvent?.(popover.eventId);
                  } else {
                    onUpsertEvent?.({
                      id: popover.eventId,
                      title: v.title,
                      color: v.color,
                      startISO: toISOLocal(start),
                      endISO: toISOLocal(end),
                      allDay: false,
                      diaryType: v.diaryType,
                      diaryGroup: v.diaryGroup,
                      diarySub: v.diarySub,
                      distanceKm: v.distanceKm,
                      paceSecPerKm: v.paceSecPerKm,
                      sessionNote: v.sessionNote,
                      activities: v.activities,
                    });
                  }
                } else if (v.title && onUpsertEvent) {
                  onUpsertEvent({
                    title: v.title,
                    color: v.color,
                    startISO: toISOLocal(start),
                    endISO: toISOLocal(end),
                    allDay: false,
                    diaryType: v.diaryType,
                    diaryGroup: v.diaryGroup,
                    diarySub: v.diarySub,
                    distanceKm: v.distanceKm,
                    paceSecPerKm: v.paceSecPerKm,
                    sessionNote: v.sessionNote,
                    activities: v.activities,
                  });
                }
                closePopover();
              }}
            />
          );
        })()}

        {popover && appKind !== "diary" && (
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
        {dragSession && (() => {
          const ev = dragSession.event;
          const { color } = splitColor(ev.title ? `[${ev.color ?? ""}] ${ev.title}` : ev.title);
          void color;
          return (
            <div
              className="pointer-events-none fixed z-[60] truncate rounded-[3px] px-1.5 py-0.5 text-[11.5px] text-ink shadow-[0_8px_24px_rgba(15,23,42,0.18)] ring-1 ring-ink/10"
              style={{
                left: dragSession.pointerX - dragSession.offsetX,
                top: dragSession.pointerY - dragSession.offsetY,
                width: dragSession.chipWidth,
                height: dragSession.chipHeight,
                background: ev.color ?? "hsl(var(--secondary))",
                opacity: 0.95,
              }}
            >
              {ev.title}
            </div>
          );
        })()}
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
  /**
   * Fires the moment the user commits the inline duration picker (clock icon),
   * BEFORE the whole popover is saved. Lets the parent reflect the change in
   * its marked range immediately so the calendar stays in sync.
   */
  onTimeChange?: (time: { startMin: number; endMin: number } | null) => void;
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
export function MiniDurationColumn({
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
                className={`relative grid h-full select-none ${
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
  onTimeChange,
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
  // Position beside the anchor: right by default, flip left if no room
  // (e.g. Sunday column). Top edge aligns with the anchor's top edge.
  let top = anchor.top;
  let left = anchor.right + margin;
  if (left + POPOVER_W > window.innerWidth) {
    left = Math.max(margin, anchor.left - POPOVER_W - margin);
  }
  if (top + POPOVER_H > window.innerHeight) {
    top = Math.max(margin, window.innerHeight - POPOVER_H - margin);
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
          <CategoryDropdownRow
            seat={seat}
            color={color}
            adminCategory={adminCategory}
            onSetColor={setColor}
          />

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
                onTimeChange?.(t);
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

function CategoryDropdownRow({
  seat,
  color,
  adminCategory,
  onSetColor,
}: {
  seat: CalendarSeat;
  color: string | null;
  adminCategory: AdminCategory;
  onSetColor: (c: string) => void;
}) {
  const { categories } = useUserCategories();

  if (seat === "admin") {
    const sideColor = ADMIN_CATEGORIES.find((c) => c.value === adminCategory)!.color;
    return (
      <div className="relative border-t border-hairline">
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
          style={{ background: sideColor }}
        />
        <select
          value={adminCategory}
          onChange={(e) => {
            const next = e.target.value as AdminCategory;
            const cat = ADMIN_CATEGORIES.find((c) => c.value === next)!;
            onSetColor(cat.color);
          }}
          className="block w-full bg-transparent py-2 pl-4 pr-3 text-[12px] text-ink outline-none"
        >
          {ADMIN_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Individual seat — list user's "Me" categories.
  // Track selection by category id locally so identically-colored categories
  // remain distinguishable after picking.
  const lcColor = (color ?? "").toLowerCase();
  const initialId = useMemo(
    () => categories.find((c) => c.color.toLowerCase() === lcColor)?.id ?? categories[0]?.id ?? "",
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [selectedId, setSelectedId] = useState<string>(initialId);

  // If the list loads after mount and selectedId is still empty, hydrate it.
  useEffect(() => {
    if (!selectedId && categories.length > 0) {
      const fromColor = categories.find((c) => c.color.toLowerCase() === lcColor)?.id;
      setSelectedId(fromColor ?? categories[0].id);
    }
  }, [categories, lcColor, selectedId]);

  const selectedCat = categories.find((c) => c.id === selectedId);
  const sideColor = selectedCat?.color ?? color ?? "transparent";

  return (
    <div className="relative border-t border-hairline">
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
        style={{ background: sideColor }}
      />
      <select
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          setSelectedId(id);
          const cat = categories.find((c) => c.id === id);
          if (cat) onSetColor(cat.color);
        }}
        className="block w-full bg-transparent py-2 pl-4 pr-3 text-[12px] text-ink outline-none"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

