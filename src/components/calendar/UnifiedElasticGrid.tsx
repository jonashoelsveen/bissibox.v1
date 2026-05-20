/**
 * UnifiedElasticGrid — a single continuous spreadsheet that morphs between
 * Year View and Month View by animating CSS Grid track sizes.
 *
 * Architecture:
 *   - One source of truth: 12 month columns × 31 days × 2 sessions (rows).
 *   - Zoom is achieved by animating `grid-template-columns` and per-row
 *     heights. No unmounting, no shared-element trickery — the same DOM
 *     nodes resize in place. This guarantees zero "popping" of the
 *     selection ring or cell content.
 *   - Session text is always rendered. In Year View it is clipped/faded by
 *     the narrow column width and a CSS opacity bound to the column's
 *     active state. In Month View the focused column expands and the text
 *     fades in cleanly.
 *   - Sticky month headers stay pinned while the user scrolls vertically
 *     through a month's sessions.
 *   - Keyboard: arrow keys move the selection cell-by-cell. Crossing a
 *     month boundary in Month View pans the focused month.
 *
 * Spec compliance:
 *   - FLIP-style smooth transitions via CSS `transition` on grid tracks.
 *   - `will-change: transform, width, height` on cells.
 *   - Easing: cubic-bezier(0.2, 0, 0, 1).
 *   - Crisp 1px borders, desaturation of peripheral columns in Month View.
 */

import type React from "react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Footprints, Bike, Dumbbell, Snowflake, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CellData, CellKey, Session, CalendarEvent } from "./yearStore";
import { makeCellId } from "./yearStore";
import { MonthGridType1, PopoverEditor, splitColor, joinColor, iconForColor, contrastTextOn, categoryFromColor } from "./MonthGridType1";
import { DiaryPopoverEditor, type DiaryPopoverValue } from "./DiaryPopoverEditor";
import { DayNoteButton } from "./DayNoteButton";
import { SessionHoverMenu } from "./SessionHoverMenu";
import { MonthNavControl } from "./MonthNavControl";
import type { DateRange } from "./MiniCalendar";
import { sameDay, setHM, addMinutes, toISOLocal, fromISOLocal, diffMinutes, isoWeekNumber } from "./dateUtils";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useSessionTileDesign, useDiarySimpleView } from "@/lib/session-tile-design";
import { useDistanceUnit, kmToUnit, unitLabel } from "@/lib/units";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ReorderConfirmDialog } from "./ReorderConfirmDialog";

export type ViewMode = "day" | "week" | "month";

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  day: "Dag",
  week: "Uke",
  month: "Måned",
};

/**
 * HeaderDropdown — minimal dropdown styled to match the TopBar profile
 * switcher, but slightly more compact and friendlier (chevron rotates,
 * subtle hover affordance, items show a check on the active row).
 */
export function HeaderDropdown<T extends string>({
  value,
  options,
  onChange,
  width = 132,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  width?: number;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="group flex h-8 items-center justify-between gap-1.5 rounded-md border border-hairline bg-background/90 px-2.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition-colors hover:bg-secondary"
        style={{ width }}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.25}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
            style={{ width }}
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 border-b border-hairline/60 px-2.5 py-2 text-left text-xs transition last:border-b-0 ${
                    o.disabled
                      ? "cursor-not-allowed text-muted-foreground/60"
                      : active
                        ? "bg-secondary/60 text-ink"
                        : "text-ink hover:bg-secondary"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      {o.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Type 2 spreadsheet column headers — weekday names cycling across the
// 12 underlying month columns. The user requested the headers be relabelled
// from month names to weekday names (Monday → Sunday). The data model still
// has 12 column slots, so weekdays repeat after Sunday.
const MONTH_LABELS_FULL = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
];
const MONTH_LABELS_SHORT = [
  "Man",
  "Tir",
  "Ons",
  "Tor",
  "Fre",
  "Lør",
  "Søn",
  "Man",
  "Tir",
  "Ons",
  "Tor",
  "Fre",
];
const WEEKDAYS_NB = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function isWeekend(year: number, month: number, day: number) {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

// Monday-anchored start-of-week for a given date.
function startOfWeekMon(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + delta);
  return x;
}

// `sameDay` is imported from ./dateUtils.

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const DUR_MS = 180;

export interface UnifiedElasticGridProps {
  calId: string;
  year: number;
  data: Record<string, CellData>;
  selected: CellKey | null;
  onSelect: (k: CellKey | null) => void;
  onCommitText: (k: CellKey, text: string) => void;
  onCommitTexts?: (updates: Array<{ key: CellKey; text: string }>) => void;
  onCommitDuration?: (k: CellKey, duration: string) => void;
  onFill: (source: CellKey, targets: CellKey[]) => void;
  seat?: "admin" | "individual";
  /** Unified event store — single source of truth for both views. */
  events: CalendarEvent[];
  onUpsertEvent: (
    patch:
      | (Partial<CalendarEvent> & Pick<CalendarEvent, "startISO" | "endISO" | "title">)
      | (Partial<CalendarEvent> & { id: string }),
  ) => CalendarEvent;
  onMoveEvent: (id: string, patch: Partial<Pick<CalendarEvent, "startISO" | "endISO" | "allDay">>) => void;
  onDeleteEvent: (id: string) => void;
  /** Reorder a sequence of event ids by writing sortIndex values. */
  onReorderEvents?: (ids: string[]) => void;
  /** Shared "what is the calendar showing?" anchor date. */
  currentDate: Date;
  /** Optional drag-selected range from the mini-calendar. */
  currentRange: DateRange;
  /** Notify parent so the mini-cal & main view stay in sync. */
  onCurrentDateChange: (date: Date, range?: DateRange) => void;
  /** Optional controlled view mode — when provided, the grid reads from
   *  the parent. The internal dropdown is hidden in that case so the parent
   *  can render its own controls in the header strip. */
  viewMode?: ViewMode;
  onViewModeChange?: (v: ViewMode) => void;
  appKind?: "calendar" | "diary";
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
}

type Mode = { kind: "year" } | { kind: "month"; month: number };

export function UnifiedElasticGrid({
  calId,
  year,
  data,
  selected,
  onSelect,
  onCommitText,
  onCommitTexts,
  onCommitDuration,
  onFill,
  seat = "individual",
  events,
  onUpsertEvent,
  onMoveEvent,
  onDeleteEvent,
  onReorderEvents,
  currentDate,
  currentRange,
  onCurrentDateChange,
  viewMode: viewModeProp,
  onViewModeChange,
  appKind = "calendar",
  memberId,
  viewerRole = "owner",
}: UnifiedElasticGridProps) {
  // viewMode is the only user-facing toggle now. There are no "types".
  //   - "day"   → 7-column rich spreadsheet (one row per 30-min slot)
  //   - "week"  → 7-column compact spreadsheet (hourly time labels)
  //   - "month" → MonthGridType1 (full month grid)
  const [viewModeInternal, setViewModeInternal] = useState<ViewMode>("month");
  const viewMode = viewModeProp ?? viewModeInternal;
  const isControlled = viewModeProp !== undefined;
  const [editingKey, setEditingKey] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Internal grid mode for the elastic spreadsheet (shared by Day & Week
  // views). Day view uses the "rich" per-row layout (kind: "month"); Week
  // view uses the "compact" hourly-label layout (kind: "year").
  const mode: Mode = viewMode === "day" ? { kind: "month", month: 0 } : { kind: "year" };
  const [simpleView] = useDiarySimpleView();
  const isSimple = mode.kind === "year" && appKind === "diary" && simpleView;

  const handleViewModeChange = (v: ViewMode) => {
    if (!isControlled) setViewModeInternal(v);
    onViewModeChange?.(v);
  };

  // Both spreadsheet sub-views are always implemented; "month" routes to
  // MonthGridType1. There are no other combinations to gate on.

  const YEAR_COL = 220;
  const FOCUS_COL = 640;
  const ROW_YEAR = 28;
  const ROW_MONTH = 36;

  const gridTemplateColumns = useMemo(() => {
    if (mode.kind === "year") {
      // Week view: 28px week-number gutter + 7 weekday columns. Mirrors the
      // Month view exactly so a zoom animation between the two doesn't
      // shift column widths.
      return `48px repeat(7, minmax(0, 1fr))`;
    }
    // Day view: render the focused day at full FOCUS_COL width across the
    // 7-column envelope so the active column is centered horizontally.
    return `repeat(7, ${FOCUS_COL}px)`;
  }, [mode]);

  const rowHeight = mode.kind === "year" ? ROW_YEAR : ROW_MONTH;

  const selectedId = selected ? makeCellId(calId, selected) : null;
  const editingId = editingKey ? makeCellId(calId, editingKey) : null;

  const beginEdit = useCallback(
    (k: CellKey) => {
      const id = makeCellId(calId, k);
      setEditValue(data[id]?.text ?? "");
      setEditingKey(k);
      onSelect(k);
    },
    [calId, data, onSelect],
  );

  const commitEdit = useCallback(() => {
    if (editingKey) onCommitText(editingKey, editValue.trim());
    setEditingKey(null);
  }, [editingKey, editValue, onCommitText]);

  // Selection passes straight through — no month-zoom side effect.
  const handleSelect = useCallback(
    (k: CellKey | null) => {
      onSelect(k);
    },
    [onSelect],
  );

  const moveSelection = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      let { year: y, month, day, session } = selected;
      if (dy !== 0) {
        let rank = day * 2 + session + dy;
        const dim = daysInMonth(y, month);
        const minRank = 1 * 2 + 0;
        const maxRank = dim * 2 + 1;
        if (rank > maxRank) rank = maxRank;
        else if (rank < minRank) rank = minRank;
        day = Math.floor(rank / 2);
        session = (rank % 2) as Session;
      }
      if (dx !== 0) {
        const m = Math.max(0, Math.min(11, month + dx));
        month = m;
        const nDim = daysInMonth(y, month);
        if (day > nDim) day = nDim;
      }
      onSelect({ year: y, month, day, session });
    },
    [selected, onSelect],
  );

  const dragStartRef = useRef<CellKey | null>(null);
  const [dragRange, setDragRange] = useState<{
    month: number;
    toDay: number;
    toSession: Session;
  } | null>(null);

  // Week-view "Excel-like" vertical mark range (a contiguous selection of
  // 30-min slots within a single day column). Distinct from the fill-handle
  // drag above.
  const markStartRef = useRef<{ month: number; rank: number } | null>(null);
  const markActiveRef = useRef(false);
  const [markRange, setMarkRange] = useState<{
    month: number;
    lo: number; // rank = day*2+session
    hi: number;
  } | null>(null);
  // Plus icon only shows after the user has released the mouse.
  const [markReleased, setMarkReleased] = useState(false);

  // Drag-to-move the existing marked range. Active while the user holds
  // a pointer down on the mark overlay (not the plus, not the edge band).
  const markDragRef = useRef<{
    grabRank: number; // rank of the cell where the user grabbed
    grabMonth: number; // column of the grabbed cell
    size: number;
    offset: number; // grabRank - origLo
  } | null>(null);
  const [isDraggingMark, setIsDraggingMark] = useState(false);

  // Inline editor popover (shared with month view)
  const [popover, setPopover] = useState<{
    key: CellKey;
    rect: DOMRect;
    initialText: string;
    initialColor: string | null;
    isEdit: boolean;
    /** When set, the commit/delete will mutate this CalendarEvent. */
    eventId?: string;
    /** Pending unsaved drag — date/time to apply on Save. */
    pendingDate?: Date;
    pendingTime?: { startMin: number; endMin: number };
  } | null>(null);

  // Refs assigned later in render so openPopover can reach the latest
  // week-events lookup without forward-declaration issues.
  const eventAtCellRef = useRef<((k: CellKey) => CalendarEvent | null) | null>(null);

  const openPopover = useCallback(
    (k: CellKey, anchor: HTMLElement) => {
      // Week view: prefer editing the existing event under this cell.
      if (mode.kind === "year" && eventAtCellRef.current) {
        const ev = eventAtCellRef.current(k);
        if (ev) {
          setPopover({
            key: k,
            rect: anchor.getBoundingClientRect(),
            initialText: ev.title,
            initialColor: ev.color,
            isEdit: true,
            eventId: ev.id,
          });
          return;
        }
      }
      const id = makeCellId(calId, k);
      const raw = data[id]?.text ?? "";
      const { color, text } = splitColor(raw);
      setPopover({
        key: k,
        rect: anchor.getBoundingClientRect(),
        initialText: text,
        initialColor: color,
        isEdit: !!raw.trim(),
      });
    },
    [calId, data, mode],
  );

  const closePopover = useCallback(() => setPopover(null), []);

  // Clear the mark-range when mousing down anywhere that is not a marked
  // cell, not the plus button, and not the popover itself.
  useEffect(() => {
    if (!markRange) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-mark-cell='1']")) return;
      if (t.closest("[data-role='mark-plus']")) return;
      if (t.closest("[data-role='popover']")) return;
      setMarkRange(null);
      setMarkReleased(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [markRange]);

  useEffect(() => {
    if (!dragRange || !dragStartRef.current) return;
    const onUp = () => {
      const src = dragStartRef.current!;
      const r = dragRange;
      const targets: CellKey[] = [];
      const dim = daysInMonth(year, r.month);
      const srcRank = src.day * 2 + src.session;
      const endRank = r.toDay * 2 + r.toSession;
      const lo = Math.min(srcRank, endRank);
      const hi = Math.max(srcRank, endRank);
      for (let rk = lo; rk <= hi; rk++) {
        const day = Math.floor(rk / 2);
        const session = (rk % 2) as Session;
        if (day < 1 || day > dim) continue;
        if (day === src.day && session === src.session) continue;
        targets.push({ year, month: r.month, day, session });
      }
      if (targets.length > 0) onFill(src, targets);
      setDragRange(null);
      dragStartRef.current = null;
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragRange, year, onFill]);

  // Global mouseup ends the mark drag (range stays visible).
  useEffect(() => {
    const onUp = () => {
      if (markActiveRef.current) {
        setMarkReleased(true);
      }
      markActiveRef.current = false;
      markStartRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const inDragRange = useCallback(
    (k: CellKey) => {
      if (!dragRange || !dragStartRef.current) return false;
      if (k.month !== dragRange.month) return false;
      const src = dragStartRef.current;
      const a = src.day * 2 + src.session;
      const b = dragRange.toDay * 2 + dragRange.toSession;
      const r = k.day * 2 + k.session;
      return r >= Math.min(a, b) && r <= Math.max(a, b);
    },
    [dragRange],
  );

  const markInfo = useCallback(
    (k: CellKey): { in: boolean; isFirst: boolean; isLast: boolean; isPlus: boolean; size: number } => {
      if (!markRange || k.month !== markRange.month)
        return { in: false, isFirst: false, isLast: false, isPlus: false, size: 0 };
      const r = k.day * 2 + k.session;
      const inR = r >= markRange.lo && r <= markRange.hi;
      const mid = Math.floor((markRange.lo + markRange.hi) / 2);
      return {
        in: inR,
        isFirst: r === markRange.lo,
        isLast: r === markRange.hi,
        isPlus: inR && r === mid,
        size: markRange.hi - markRange.lo + 1,
      };
    },
    [markRange],
  );

  const beginMark = useCallback((k: CellKey) => {
    const r = k.day * 2 + k.session;
    markStartRef.current = { month: k.month, rank: r };
    markActiveRef.current = true;
    setMarkReleased(false);
    setMarkRange(null);
  }, []);

  const extendMark = useCallback((k: CellKey) => {
    if (!markActiveRef.current || !markStartRef.current) return;
    if (k.month !== markStartRef.current.month) return;
    const r = k.day * 2 + k.session;
    const a = markStartRef.current.rank;
    if (r === a) return; // single cell — don't show mark yet
    setMarkRange({ month: k.month, lo: Math.min(a, r), hi: Math.max(a, r) });
  }, []);

  const beginMarkDrag = useCallback((k: CellKey) => {
    if (!markRange) return;
    const grabRank = k.day * 2 + k.session;
    markDragRef.current = {
      grabRank,
      grabMonth: k.month,
      size: markRange.hi - markRange.lo + 1,
      offset: grabRank - markRange.lo,
    };
    setIsDraggingMark(true);
  }, [markRange]);

  // While dragging the marked range, hover-over cells determine the new
  // column + rank position. Reuses the existing mark-cell hover via a global
  // mousemove + elementFromPoint lookup so we cover quick pointer movement.
  useEffect(() => {
    if (!isDraggingMark) return;
    const onMove = (e: MouseEvent) => {
      const drag = markDragRef.current;
      if (!drag) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cellEl = el?.closest("[data-cell-key]") as HTMLElement | null;
      if (!cellEl) return;
      const raw = cellEl.dataset.cellKey;
      if (!raw) return;
      const [mStr, dStr, sStr] = raw.split(":");
      const newMonth = Number(mStr);
      const newDay = Number(dStr);
      const newSession = Number(sStr);
      const hoverRank = newDay * 2 + newSession;
      let newLo = hoverRank - drag.offset;
      let newHi = newLo + drag.size - 1;
      // Clamp to slot range. In week view rows = 18 days × 2 sessions = 36.
      const maxRank = 18 * 2 - 1;
      if (newLo < 0) { newHi -= newLo; newLo = 0; }
      if (newHi > maxRank) { newLo -= (newHi - maxRank); newHi = maxRank; }
      setMarkRange({ month: newMonth, lo: newLo, hi: newHi });
    };
    const onUp = () => {
      markDragRef.current = null;
      setIsDraggingMark(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDraggingMark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!selected) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(0, 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(0, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection(1, 0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection(-1, 0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        moveSelection(0, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, moveSelection]);

  // Remember the last focused month so that zooming back to Year View can
  // keep that month centered in the viewport — the user's spatial context
  // is preserved through the transition in both directions.
  const lastFocusedMonthRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const c = scrollRef.current;
    if (!c) return;

    // Determine which month to center: focused month in Month View, or the
    // last focused month when zooming out to Year View.
    let targetMonth: number | null = null;
    if (mode.kind === "month") {
      targetMonth = mode.month;
      lastFocusedMonthRef.current = mode.month;
    } else if (lastFocusedMonthRef.current !== null) {
      targetMonth = lastFocusedMonthRef.current;
    }
    if (targetMonth === null) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const focused = c.querySelector<HTMLElement>(`[data-month-col="${targetMonth}"]`);
      if (focused) {
        const width = focused.offsetWidth;
        const left = focused.offsetLeft;
        const target = Math.max(0, left - (c.clientWidth - width) / 2);
        // Drive scroll synchronously with the grid track animation for an
        // Excel-like snap — no smooth-scroll, no lag.
        c.scrollLeft = target;
      }
      if (now - start < DUR_MS + 40) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const months = useMemo(
    () =>
      // Type 2 spreadsheet renders 7 weekday columns (Mon–Sun) instead of
      // the full 12-month axis. The underlying data model still keys on
      // month index 0–6, but only 7 of the 12 slots are rendered.
      Array.from({ length: 7 }, (_, idx) => ({
        idx,
        label: MONTH_LABELS_SHORT[idx],
        full: MONTH_LABELS_FULL[idx],
        dim: daysInMonth(year, idx),
      })),
    [year],
  );

  const isMonthFocused = (m: number) => mode.kind === "month" && mode.month === m;
  const isMonthPeriph = (m: number) => mode.kind === "month" && mode.month !== m;

  // Live clock — updated every 15s so the "now" line stays accurate.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Date for each of the 7 visible weekday columns, anchored to the week
  // containing currentDate (Monday-first).
  const weekDates = useMemo(() => {
    const start = startOfWeekMon(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Index of today inside the visible week, -1 if not in view.
  const todayColIdx = useMemo(() => {
    for (let i = 0; i < 7; i++) if (sameDay(weekDates[i], now)) return i;
    return -1;
  }, [weekDates, now]);

  // Header height + now-line vertical offset for week view.
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerH, setHeaderH] = useState(0);
  useLayoutEffect(() => {
    if (!headerRef.current) return;
    setHeaderH(headerRef.current.offsetHeight);
  }, [viewMode]);

  // Minutes elapsed since the week-view start (06:00). Includes seconds for
  // sub-minute precision so the indicator advances smoothly between ticks.
  const nowMinutesSinceStart = useMemo(() => {
    if (mode.kind !== "year") return null;
    const minutes =
      now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const since6 = minutes - 6 * 60;
    if (since6 < 0 || since6 > 18 * 60) return null;
    return since6;
  }, [now, mode]);

  // ─── Week view ↔ time helpers ────────────────────────────────────────
  // Cell layout: row 1 (day=1) starts at 06:00 and each (day, session)
  // pair is one 30-min slot. cellIndex = (day - 1) * 2 + session.
  const WEEK_START_HOUR = 6;
  const rankToMinutes = (rank: number) => WEEK_START_HOUR * 60 + rank * 30;
  const cellKeyToDate = useCallback(
    (k: CellKey): Date | null => {
      if (mode.kind !== "year") return null;
      const date = weekDates[k.month];
      if (!date) return null;
      const cellIndex = (k.day - 1) * 2 + k.session;
      const minutes = rankToMinutes(cellIndex);
      return setHM(date, Math.floor(minutes / 60), minutes % 60);
    },
    [mode, weekDates],
  );

  // Events visible in the current week (week view) or month (month view).
  const weekEvents = useMemo(() => {
    if (mode.kind !== "year") return [];
    return events.filter((e) => {
      const d = fromISOLocal(e.startISO);
      return weekDates.some((wd) => sameDay(wd, d));
    });
  }, [events, weekDates, mode]);

  // Find an event under a cell click in week view, if any (for editing).
  const eventAtCell = useCallback(
    (k: CellKey): CalendarEvent | null => {
      const at = cellKeyToDate(k);
      if (!at) return null;
      const atMin = at.getHours() * 60 + at.getMinutes();
      const target = weekEvents.find((e) => {
        const s = fromISOLocal(e.startISO);
        const en = fromISOLocal(e.endISO);
        if (!sameDay(s, at)) return false;
        const sMin = s.getHours() * 60 + s.getMinutes();
        const eMin = en.getHours() * 60 + en.getMinutes();
        return atMin >= sMin && atMin < eMin;
      });
      return target ?? null;
    },
    [cellKeyToDate, weekEvents],
  );
  // Expose latest lookup to openPopover via ref (declared above).
  eventAtCellRef.current = eventAtCell;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 w-full flex-col"
    >
      {/* Top-right control cluster: [Mode ▾] [‹ 📅 ›].
          When the parent controls viewMode it also renders these controls
          itself (in the page header), so we hide the in-grid cluster to
          avoid duplication. */}
      {!isControlled && (
        <div className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-2">
          <HeaderDropdown<ViewMode>
            ariaLabel="Visningsmodus"
            value={viewMode}
            onChange={handleViewModeChange}
            width={124}
            options={[
              { value: "day", label: "Dag" },
              { value: "week", label: "Uke" },
              { value: "month", label: "Måned" },
            ]}
          />
          <MonthNavControl
            unit={viewMode}
            currentDate={currentDate}
            selectedRange={currentRange}
            onChange={onCurrentDateChange}
          />
        </div>
      )}

      <LayoutGroup id="cal-zoom">
      <AnimatePresence mode="wait" initial={false}>
      {viewMode === "month" ? (
        <motion.div
          key="month"
          className="flex flex-1 min-h-0 w-full flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        >
        <MonthGridType1
          calId={calId}
          year={currentDate.getFullYear()}
          month={currentDate.getMonth()}
          data={data}
          seat={seat}
          appKind={appKind}
          events={events}
          onUpsertEvent={onUpsertEvent}
          onMoveEvent={onMoveEvent}
          onDeleteEvent={onDeleteEvent}
          onReorderEvents={onReorderEvents}
          memberId={memberId}
          viewerRole={viewerRole}
          onPrevMonth={() => {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
            onCurrentDateChange(d, { start: d, end: d });
          }}
          onNextMonth={() => {
            const d = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            onCurrentDateChange(d, { start: d, end: d });
          }}
          onCommitText={(k, text) => onCommitText(k, text)}
          onWeekClick={(anchor) => {
            // Update the anchor date so Week view lands on the clicked week,
            // then morph the visible mode.
            onCurrentDateChange(anchor, { start: anchor, end: anchor });
            handleViewModeChange("week");
          }}
          selectedDate={currentDate}
          onSelectDate={(d) => onCurrentDateChange(d, { start: d, end: d })}
        />
        </motion.div>
      ) : (
        <motion.div
          key="week"
          className="flex flex-1 min-h-0 w-full flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        >
        <div
          ref={scrollRef}
          className="relative flex flex-1 min-h-0 w-full flex-col"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleSelect(null);
          }}
          tabIndex={0}
        >
          <div
            className="grid flex-none"
            style={{
              gridTemplateColumns,
              transition: `grid-template-columns ${DUR_MS}ms ${EASE}`,
              willChange: "grid-template-columns",
            }}
          >
            {/* Week-number gutter header (clickable to zoom OUT to month). */}
            {mode.kind === "year" && (
              <button
                key="wn-header"
                type="button"
                onClick={() => handleViewModeChange("month")}
                title={`Uke ${isoWeekNumber(weekDates[0] ?? new Date())} — klikk for å zoome ut`}
                className="sticky top-0 z-20 flex select-none items-center justify-center border-b border-r border-hairline bg-card px-1 text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
                style={{ height: 36 }}
                ref={(el) => {
                  headerRef.current = el;
                }}
              >
                {isoWeekNumber(weekDates[0] ?? new Date())}
              </button>
            )}
            {months.map((m) => {
              const colDate = weekDates[m.idx];
              const isToday = mode.kind === "year" && colDate && sameDay(colDate, now);
              return (
                <div
                  key={`h-${m.idx}`}
                  data-month-col={m.idx}
                  data-day-anchor=""
                  className={`group/daynote-anchor sticky top-0 z-20 flex select-none items-center justify-center border-b border-r border-hairline px-3 text-[12px] font-semibold uppercase tracking-wide ${
                    isToday ? "bg-secondary text-ink" : "bg-card text-muted-foreground"
                  } ${appKind === "diary" ? "relative" : ""}`}
                  style={{ height: 36 }}
                >
                  {appKind === "diary" && colDate && (
                    <DayNoteButton calId={calId} date={colDate} variant="week" memberId={memberId} viewerRole={viewerRole} />
                  )}
                  <span>
                    {m.label}
                    {mode.kind === "year" && colDate && (
                      <span className="ml-1.5 text-ink">{colDate.getDate()}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="relative flex flex-1 min-h-0 flex-col overflow-y-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns,
              transition: `grid-template-columns ${DUR_MS}ms ${EASE}`,
              willChange: "grid-template-columns",
            }}
          >
            {isSimple ? (
              <Fragment key="simple-body">
                {/* Empty week-number gutter under the header */}
                <div
                  className="border-r border-hairline bg-card"
                  style={{ height: rowHeight * 18 }}
                  aria-hidden
                />
                {months.map((m) => {
                  const colDate = weekDates[m.idx];
                  return (
                    <div
                      key={`simple-col-${m.idx}`}
                      data-simple-col={m.idx}
                      className="relative border-r border-hairline transition-colors hover:bg-secondary/60"
                      style={{ height: rowHeight * 18 }}
                      onDoubleClick={(e) => {
                        if (!colDate) return;
                        const target = e.target as HTMLElement;
                        // Ignore double-clicks on a session tile
                        if (target.closest('[data-real-event="1"]')) return;
                        const k: CellKey = { year: colDate.getFullYear(), month: m.idx, day: 2, session: 0 };
                        // Diary: existing sessions are edited via the hover menu (Details).
                        // Double-clicking the column always starts a NEW manual session,
                        // even if other (e.g. Strava) sessions already exist that day.
                        setPopover({
                          key: k,
                          rect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
                          initialText: "",
                          initialColor: null,
                          isEdit: false,
                        });
                      }}
                    />
                  );
                })}
              </Fragment>
            ) : (
            Array.from(
              // Week view (compact / kind:"year") renders hour-rows of a
              // single weekday: 06:00 → 24:00 in 30-min slots = 36 rows
              // = 18 "days" × 2 sessions. Day view keeps the original
              // 31-day envelope.
              { length: mode.kind === "year" ? 18 : 31 },
              (_, i) => i + 1,
            ).map((day) => (
              <Fragment key={day}>
                {mode.kind === "year" && (() => {
                  const hh = 5 + day;
                  const label = `${String(hh).padStart(2, "0")}:00`;
                  return (
                    <div
                      className="border-b border-r border-hairline bg-card pl-1.5 pt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                      style={{ height: rowHeight * 2 }}
                      aria-hidden
                    >
                      {label}
                    </div>
                  );
                })()}
                <DayRow
                  day={day}
                  months={months}
                  year={year}
                  calId={calId}
                  data={data}
                  mode={mode}
                  rowHeight={rowHeight}
                  selected={selected}
                  selectedId={selectedId}
                  editingId={editingId}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  onSelect={handleSelect}
                  onBeginEdit={beginEdit}
                  onCommitEdit={commitEdit}
                  onCommitDuration={onCommitDuration}
                  onMoveAfterCommit={moveSelection}
                  inDragRange={inDragRange}
                  onCellMouseEnter={(k) => {
                    if (dragStartRef.current && k.month === dragStartRef.current.month) {
                      setDragRange({
                        month: dragStartRef.current.month,
                        toDay: k.day,
                        toSession: k.session,
                      });
                    }
                    extendMark(k);
                  }}
                  onHandleDown={(k) => {
                    dragStartRef.current = k;
                    setDragRange({ month: k.month, toDay: k.day, toSession: k.session });
                  }}
                  isMonthFocused={isMonthFocused}
                  isMonthPeriph={isMonthPeriph}
                  markInfo={markInfo}
                  onMarkBegin={beginMark}
                  onMarkDragBegin={beginMarkDrag}
                  isDraggingMark={isDraggingMark}
                  onOpenPopover={openPopover}
                  allowMark={mode.kind === "year"}
                  markReleased={markReleased}
                />
              </Fragment>
            )))}
          </div>
          {/* Rails overlay — positioned absolutely so explicit grid placement
              does not block auto-flow of cells in the main grid above. */}
          {mode.kind === "year" && (
            <div
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: 36,
                display: "grid",
                gridTemplateColumns,
                gridTemplateRows: isSimple
                  ? `${rowHeight * 18}px`
                  : `repeat(18, ${rowHeight * 2}px)`,
              }}
            >
              {!isSimple && (
                <WeekEventsOverlay
                  events={weekEvents}
                  weekDates={weekDates}
                  startHour={WEEK_START_HOUR}
                  appKind={appKind}
                  onEventClick={(ev, anchor) => {
                    setPopover({
                      key: { year, month: 0, day: 1, session: 0 },
                      rect: anchor.getBoundingClientRect(),
                      initialText: ev.title,
                      initialColor: ev.color,
                      isEdit: true,
                      eventId: ev.id,
                    });
                  }}
                  onEventDrop={(id, newDate, newStartMin, durationMin, anchor) => {
                    const ev = events.find((e) => e.id === id);
                    if (!ev) return;
                    setPopover({
                      key: { year, month: 0, day: 1, session: 0 },
                      rect: (anchor ?? document.body).getBoundingClientRect(),
                      initialText: ev.title,
                      initialColor: ev.color,
                      isEdit: true,
                      eventId: id,
                      pendingDate: newDate,
                      pendingTime: { startMin: newStartMin, endMin: newStartMin + durationMin },
                    });
                  }}
                  onDeleteEvent={onDeleteEvent}
                  onSaveSessionNote={(id, note) =>
                    onUpsertEvent({ id, sessionNote: note || undefined })
                  }
                  onUpsertSession={(patch) => onUpsertEvent(patch)}
                  memberId={memberId}
                  viewerRole={viewerRole}
                />
              )}
              {isSimple && (
                <DiarySimpleStack
                  events={weekEvents}
                  weekDates={weekDates}
                  onEventClick={(ev, anchor) => {
                    setPopover({
                      key: { year, month: 0, day: 1, session: 0 },
                      rect: anchor.getBoundingClientRect(),
                      initialText: ev.title,
                      initialColor: ev.color,
                      isEdit: true,
                      eventId: ev.id,
                    });
                  }}
                  onDeleteEvent={onDeleteEvent}
                  onUpsertSession={(patch) => onUpsertEvent(patch)}
                  onReorderEvents={onReorderEvents}
                  memberId={memberId}
                  viewerRole={viewerRole}
                />
              )}
              {todayColIdx >= 0 && nowMinutesSinceStart !== null && !isSimple && (
                <NowLine
                  colIdx={todayColIdx}
                  nowMinutesSinceStart={nowMinutesSinceStart}
                />
              )}
            </div>
          )}
        </div>

        </motion.div>
      )}
      </AnimatePresence>
      </LayoutGroup>

      {popover && appKind === "diary" && mode.kind === "year" && (() => {
        const existingEv = popover.eventId ? events.find((e) => e.id === popover.eventId) : null;
        const initialTime = (() => {
          if (existingEv && !existingEv.allDay) {
            const s = fromISOLocal(existingEv.startISO);
            const e = fromISOLocal(existingEv.endISO);
            return { startMin: s.getHours() * 60 + s.getMinutes(), endMin: e.getHours() * 60 + e.getMinutes() };
          }
          if (markRange) {
            return {
              startMin: WEEK_START_HOUR * 60 + (markRange.lo - 2) * 30,
              endMin: WEEK_START_HOUR * 60 + (markRange.hi - 2 + 1) * 30,
            };
          }
          const lo = popover.key.day * 2 + popover.key.session;
          const startMin = WEEK_START_HOUR * 60 + (lo - 2) * 30;
          return { startMin, endMin: startMin + 30 };
        })();
        return (
          <DiaryPopoverEditor
            initialEvent={existingEv ?? { title: popover.initialText }}
            isEdit={popover.isEdit}
            anchor={popover.rect}
            initialTime={initialTime}
            date={
              existingEv
                ? fromISOLocal(existingEv.startISO)
                : markRange
                  ? weekDates[markRange.month]
                  : weekDates[popover.key.month]
            }
            onClose={closePopover}
            onCommit={(v: DiaryPopoverValue, opts) => {
              const date = markRange
                ? weekDates[markRange.month]
                : existingEv
                  ? fromISOLocal(existingEv.startISO)
                  : weekDates[popover.key.month];
              if (!date) {
                closePopover();
                return;
              }
              if (opts?.delete && popover.eventId) {
                onDeleteEvent(popover.eventId);
                setMarkRange(null);
                setMarkReleased(false);
                closePopover();
                return;
              }
              const time = v.time ?? initialTime;
              const startISO = toISOLocal(setHM(date, Math.floor(time.startMin / 60), time.startMin % 60));
              const endISO = toISOLocal(setHM(date, Math.floor(time.endMin / 60), time.endMin % 60));
              if (popover.eventId) {
                if (!v.title) {
                  onDeleteEvent(popover.eventId);
                } else {
                  onUpsertEvent({
                    id: popover.eventId,
                    title: v.title,
                    color: v.color,
                    startISO,
                    endISO,
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
              } else if (v.title) {
                onUpsertEvent({
                  title: v.title,
                  color: v.color,
                  startISO,
                  endISO,
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
              setMarkRange(null);
              setMarkReleased(false);
              closePopover();
            }}
          />
        );
      })()}

      {popover && !(appKind === "diary" && mode.kind === "year") && (
        <PopoverEditor
          seat={seat}
          initialText={popover.initialText}
          initialColor={popover.initialColor}
          isEdit={popover.isEdit}
          anchor={popover.rect}
          enableDuration={mode.kind === "year"}
          initialTime={(() => {
            if (mode.kind !== "year") return null;
            if (popover.pendingTime) return popover.pendingTime;
            if (popover.eventId) {
              const ev = events.find((e) => e.id === popover.eventId);
              if (ev && !ev.allDay) {
                const s = fromISOLocal(ev.startISO);
                const e = fromISOLocal(ev.endISO);
                return {
                  startMin: s.getHours() * 60 + s.getMinutes(),
                  endMin: e.getHours() * 60 + e.getMinutes(),
                };
              }
              return null;
            }
            if (markRange) {
              const startMin = WEEK_START_HOUR * 60 + (markRange.lo - 2) * 30;
              const endMin = WEEK_START_HOUR * 60 + (markRange.hi - 2 + 1) * 30;
              return { startMin, endMin };
            }
            const lo = popover.key.day * 2 + popover.key.session;
            const startMin = WEEK_START_HOUR * 60 + (lo - 2) * 30;
            return { startMin, endMin: startMin + 30 };
          })()}
          onClose={closePopover}
          onTimeChange={(t) => {
            if (mode.kind !== "year" || !t) return;
            const monthCol = markRange?.month ?? popover.key.month;
            const newLo = Math.max(2, Math.round((t.startMin - WEEK_START_HOUR * 60) / 30) + 2);
            const newHi = Math.max(newLo, Math.round((t.endMin - WEEK_START_HOUR * 60) / 30) + 1);
            // Reflect the new duration in the highlighted (marked) area
            // immediately, so the calendar visually matches the duration the
            // user just chose — without moving the popover itself.
            setMarkRange({ month: monthCol, lo: newLo, hi: newHi });
            setMarkReleased(true);
            setPopover((p) => (p ? { ...p, pendingTime: t } : p));
            // Scroll the calendar (not the popover) so the updated range
            // sits inside the viewport.
            requestAnimationFrame(() => {
              const target = containerRef.current?.querySelector(
                `[data-mark-cell='1']`,
              ) as HTMLElement | null;
              target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
          }}
          onCommit={(text, color, time) => {
            const t = text.trim();

            // ── Week view: write/edit a CalendarEvent (real datetime). ──
            if (mode.kind === "year") {
              // For edits without a fresh marked range, anchor to the EVENT's
              // current day so saving doesn't jump the event to Monday
              // (popover.key is a synthetic placeholder for event edits).
              let date: Date | undefined;
              if (popover.pendingDate) {
                date = popover.pendingDate;
              } else if (markRange) {
                date = weekDates[markRange.month];
              } else if (popover.eventId) {
                const ev = events.find((e) => e.id === popover.eventId);
                date = ev ? fromISOLocal(ev.startISO) : undefined;
              } else {
                date = weekDates[popover.key.month];
              }
              if (date) {
                const lo = markRange ? markRange.lo : popover.key.day * 2 + popover.key.session;
                const hi = markRange ? markRange.hi : lo;
                const rangeStartMin = WEEK_START_HOUR * 60 + (lo - 2) * 30;
                const rangeEndMin = WEEK_START_HOUR * 60 + (hi - 2 + 1) * 30;
                const effTime = time ?? popover.pendingTime ?? null;
                const startMin = effTime ? effTime.startMin : rangeStartMin;
                const endMin = effTime ? effTime.endMin : rangeEndMin;
                const startISO = toISOLocal(setHM(date, Math.floor(startMin / 60), startMin % 60));
                const endISO = toISOLocal(setHM(date, Math.floor(endMin / 60), endMin % 60));

                if (popover.eventId) {
                  if (!t) {
                    onDeleteEvent(popover.eventId);
                  } else {
                    onUpsertEvent({
                      id: popover.eventId,
                      title: t,
                      color,
                      ...(markRange || time || popover.pendingDate || popover.pendingTime ? { startISO, endISO } : {}),
                      allDay: false,
                    });
                  }
                } else if (t) {
                  onUpsertEvent({
                    title: t,
                    color,
                    startISO,
                    endISO,
                    allDay: false,
                    category: categoryFromColor(color),
                  });
                }
              }
              setMarkRange(null);
              setMarkReleased(false);
              closePopover();
              return;
            }

            // ── Day view fallback: legacy per-cell text storage. ──
            const next = t ? joinColor(color, t) : "";
            if (markRange) {
              const updates: Array<{ key: CellKey; text: string }> = [];
              for (let r = markRange.lo; r <= markRange.hi; r++) {
                const day = Math.floor(r / 2);
                const session = (r % 2) as Session;
                updates.push({ key: { year, month: markRange.month, day, session }, text: next });
              }
              if (onCommitTexts) onCommitTexts(updates);
              else for (const update of updates) onCommitText(update.key, update.text);
            } else {
              onCommitText(popover.key, next);
            }
            setMarkRange(null);
            setMarkReleased(false);
            closePopover();
          }}
        />
      )}
    </div>
  );
}

interface DayRowProps {
  day: number;
  year: number;
  months: { idx: number; label: string; full: string; dim: number }[];
  calId: string;
  data: Record<string, CellData>;
  mode: Mode;
  rowHeight: number;
  selected: CellKey | null;
  selectedId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onSelect: (k: CellKey | null) => void;
  onBeginEdit: (k: CellKey) => void;
  onCommitEdit: () => void;
  onCommitDuration?: (k: CellKey, duration: string) => void;
  onMoveAfterCommit: (dx: number, dy: number) => void;
  inDragRange: (k: CellKey) => boolean;
  onCellMouseEnter: (k: CellKey) => void;
  onHandleDown: (k: CellKey) => void;
  isMonthFocused: (m: number) => boolean;
  isMonthPeriph: (m: number) => boolean;
  markInfo: (k: CellKey) => { in: boolean; isFirst: boolean; isLast: boolean; isPlus: boolean; size: number };
  onMarkBegin: (k: CellKey) => void;
  onMarkDragBegin: (k: CellKey) => void;
  isDraggingMark: boolean;
  onOpenPopover: (k: CellKey, anchor: HTMLElement) => void;
  allowMark: boolean;
  markReleased: boolean;
}

function DayRow(props: DayRowProps) {
  const {
    day, year, months, calId, data, mode, rowHeight,
    selected, selectedId, editingId, editValue, setEditValue,
    onSelect, onBeginEdit, onCommitEdit, onCommitDuration, onMoveAfterCommit,
    inDragRange, onCellMouseEnter, onHandleDown, isMonthFocused, isMonthPeriph,
    markInfo, onMarkBegin, onMarkDragBegin, isDraggingMark, onOpenPopover, allowMark, markReleased,
  } = props;

  return (
    <>
      {months.map((m) => {
        const valid = day <= m.dim;
        const focused = isMonthFocused(m.idx);
        const periph = isMonthPeriph(m.idx);

        if (!valid) {
          return (
            <div
              key={`v-${m.idx}-${day}`}
              data-month-col={m.idx}
              className={`border-b border-r border-hairline ${mode.kind === "year" ? "bg-card" : "bg-muted/30"}`}
              style={{
                height: rowHeight * 2,
                transition: `height ${DUR_MS}ms ${EASE}`,
                willChange: "height",
                opacity: periph ? 0.55 : 1,
              }}
            />
          );
        }

        const weekend = isWeekend(year, m.idx, day);
        // If the last session of this day shares a color with the first
        // session of the next day in the same column, hide the bottom
        // border so the session block reads as a single continuous fill.
        const lastSessionRaw = data[makeCellId(calId, { year, month: m.idx, day, session: 1 })]?.text ?? "";
        const nextDayFirstRaw = day < m.dim
          ? data[makeCellId(calId, { year, month: m.idx, day: day + 1, session: 0 })]?.text ?? ""
          : "";
        const lastSessionColor = splitColor(lastSessionRaw).color;
        const nextDayFirstColor = splitColor(nextDayFirstRaw).color;
        const lastMarked = markInfo({ year, month: m.idx, day, session: 1 }).in;
        const nextMarked = day < m.dim ? markInfo({ year, month: m.idx, day: day + 1, session: 0 }).in : false;
        const mergeBelow = (!!lastSessionColor && lastSessionColor === nextDayFirstColor) || (lastMarked && nextMarked);
        return (
          <div
            key={`c-${m.idx}-${day}`}
            data-month-col={m.idx}
            className={`relative border-r border-hairline ${mergeBelow ? "" : "border-b"} ${weekend && mode.kind !== "year" ? "bg-muted/40" : ""}`}
            style={{
              height: rowHeight * 2,
              transition: `height ${DUR_MS}ms ${EASE}`,
              willChange: "height",
              opacity: periph ? 0.55 : 1,
            }}
          >
            <DayCellPair
              calId={calId}
              year={year}
              month={m.idx}
              day={day}
              weekend={weekend && mode.kind !== "year"}
              data={data}
              focused={focused}
              periph={periph}
              mode={mode}
              rowHeight={rowHeight}
              selectedId={selectedId}
              selected={selected}
              editingId={editingId}
              editValue={editValue}
              setEditValue={setEditValue}
              onSelect={onSelect}
              onBeginEdit={onBeginEdit}
              onCommitEdit={onCommitEdit}
              onCommitDuration={onCommitDuration}
              onMoveAfterCommit={onMoveAfterCommit}
              inDragRange={inDragRange}
              onCellMouseEnter={onCellMouseEnter}
              onHandleDown={onHandleDown}
              markInfo={markInfo}
              onMarkBegin={onMarkBegin}
              onMarkDragBegin={onMarkDragBegin}
              isDraggingMark={isDraggingMark}
              onOpenPopover={onOpenPopover}
              allowMark={allowMark}
              markReleased={markReleased}
            />
          </div>
        );
      })}
    </>
  );
}

interface DayCellPairProps {
  calId: string;
  year: number;
  month: number;
  day: number;
  weekend: boolean;
  data: Record<string, CellData>;
  focused: boolean;
  periph: boolean;
  mode: Mode;
  rowHeight: number;
  selectedId: string | null;
  selected: CellKey | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onSelect: (k: CellKey | null) => void;
  onBeginEdit: (k: CellKey) => void;
  onCommitEdit: () => void;
  onCommitDuration?: (k: CellKey, duration: string) => void;
  onMoveAfterCommit: (dx: number, dy: number) => void;
  inDragRange: (k: CellKey) => boolean;
  onCellMouseEnter: (k: CellKey) => void;
  onHandleDown: (k: CellKey) => void;
  markInfo: (k: CellKey) => { in: boolean; isFirst: boolean; isLast: boolean; isPlus: boolean; size: number };
  onMarkBegin: (k: CellKey) => void;
  onMarkDragBegin: (k: CellKey) => void;
  isDraggingMark: boolean;
  onOpenPopover: (k: CellKey, anchor: HTMLElement) => void;
  allowMark: boolean;
  markReleased: boolean;
}

function DayCellPair(props: DayCellPairProps) {
  const {
    calId, year, month, day, weekend, data,
    focused, periph, mode, rowHeight, selectedId,
    editingId, editValue, setEditValue,
    onSelect, onBeginEdit, onCommitEdit, onCommitDuration, onMoveAfterCommit,
    inDragRange, onCellMouseEnter, onHandleDown,
    markInfo, onMarkBegin, onMarkDragBegin, isDraggingMark, onOpenPopover, allowMark, markReleased,
  } = props;

  const sessions: Session[] = [0, 1];
  const dow = new Date(year, month, day).getDay();
  const weekdayLabel = WEEKDAYS_NB[dow];

  const showRich = mode.kind === "month";
  const showCompact = mode.kind === "year";

  return (
    <div className="flex h-full w-full flex-col">
      {sessions.map((session) => {
        const k: CellKey = { year, month, day, session };
        const id = makeCellId(calId, k);
        const cell = data[id];
        const isSelected = selectedId === id;
        const isEditing = editingId === id;
        const isFirst = session === 0;
        const ranged = inDragRange(k);
        const mk = markInfo(k);

        // Parse `[#hex] text` storage format used by the popover editor.
        const parsed = splitColor(cell?.text ?? "");
        const cellColor = parsed.color ?? cell?.color ?? null;
        const cellLabel = parsed.text;

        // Outlook/Motion style: soft tinted body, bright left edge accent.
        const bg = cellColor
          ? `color-mix(in srgb, ${cellColor} 18%, white)`
          : undefined;

        // Merge with neighbouring sessions of the same color so a multi-cell
        // session reads as one continuous block (no inner divider lines).
        const prevRaw = isFirst
          ? (day > 1 ? data[makeCellId(calId, { year, month, day: day - 1, session: 1 })]?.text ?? "" : "")
          : data[makeCellId(calId, { year, month, day, session: 0 })]?.text ?? "";
        const prevColor = splitColor(prevRaw).color;
        const sameAbove = !!cellColor && cellColor === prevColor;

        // Hide the top divider when this cell continues a mark range OR
        // continues a same-color session block.
        const hideTopDivider = (mk.in && !mk.isFirst) || sameAbove;

        return (
          <div
            key={session}
            data-mark-cell={mk.in ? "1" : undefined}
            data-cell-key={allowMark ? `${month}:${day}:${session}` : undefined}
            onMouseDown={(e) => {
              const t = e.target as HTMLElement;
              if (t.dataset.role === "fill-handle") return;
              if (t.dataset.role === "mark-plus") return;
              if (t.dataset.role === "mark-drag") return;
              onSelect(k);
              if (allowMark) onMarkBegin(k);
            }}
            onMouseEnter={() => onCellMouseEnter(k)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (allowMark) {
                onOpenPopover(k, e.currentTarget as HTMLElement);
              } else {
                onBeginEdit(k);
              }
            }}
            className={`relative flex-1 select-none text-[12px] leading-tight ${
              !isFirst && !hideTopDivider ? "border-t border-hairline/60" : ""
            } ${(ranged || isSelected) && !mk.in ? "bg-muted-foreground/15" : ""} transition-colors`}
            style={{
              background: mk.in ? undefined : bg,
              minHeight: rowHeight,
              transition: `min-height ${DUR_MS}ms ${EASE}`,
              willChange: "min-height",
            }}
          >
            {cellColor && (
              <span
                className="pointer-events-none absolute left-0 top-0 bottom-0 z-[1] w-[3px]"
                style={{ background: cellColor }}
              />
            )}
            {mk.in && (
              <span
                className="pointer-events-none absolute inset-x-0 z-[1] bg-muted-foreground/15"
                style={{
                  top: mk.isFirst ? 0 : -1,
                  bottom: mk.isLast ? 0 : -1,
                }}
              />
            )}

            {/* Drag handle: covers the marked cell so the user can grab and
                move the whole selection. Excludes a thin band at the very
                top of the first cell and the very bottom of the last cell
                (so resize-style edges feel intentional), and leaves the
                center plus icon untouched via a CSS cutout (two stacked
                regions). markReleased gates this so we never hijack the
                initial drag-to-mark gesture. */}
            {mk.in && markReleased && mk.size > 1 && (
              <>
                <div
                  data-role="mark-drag"
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    onMarkDragBegin(k);
                  }}
                  className="absolute inset-x-0 z-[3]"
                  style={{
                    top: mk.isFirst ? 3 : 0,
                    // If this is the plus cell, leave a 28px gap in the
                    // middle for the icon — render only the upper band.
                    bottom: mk.isPlus ? "calc(50% + 14px)" : (mk.isLast ? 3 : 0),
                    cursor: isDraggingMark ? "grabbing" : "grab",
                  }}
                />
                {mk.isPlus && (
                  <div
                    data-role="mark-drag"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onMarkDragBegin(k);
                    }}
                    className="absolute inset-x-0 z-[3]"
                    style={{
                      top: "calc(50% + 14px)",
                      bottom: mk.isLast ? 3 : 0,
                      cursor: isDraggingMark ? "grabbing" : "grab",
                    }}
                  />
                )}
              </>
            )}

            {mk.isPlus && markReleased && mk.size > 1 && !isDraggingMark && (
              <button
                type="button"
                data-role="mark-plus"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // Anchor the popover to the full marked range by using
                  // the cell that was clicked.
                  onOpenPopover(k, e.currentTarget.parentElement as HTMLElement);
                }}
                className="pointer-events-auto absolute left-1/2 top-1/2 z-[5] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-transparent text-muted-foreground/80 hover:text-ink"
                style={{ padding: 0, lineHeight: 0, border: "none" }}
                aria-label="Legg til økt"
              >
                <Plus className="h-5 w-5" strokeWidth={2} />
              </button>
            )}
            {/* Selection outline removed — keep marking subtle (gray fill only) */}

            {false && showCompact && null}

            {showRich && (
              <div
                className="grid h-full w-full items-center"
                style={{
                  gridTemplateColumns: "72px minmax(0,1fr) 96px",
                  transition: `opacity ${DUR_MS}ms ${EASE}`,
                  opacity: 1,
                }}
              >
                {/* Time gutter — every row is 30 minutes, starting at 06:00.
                    Only every second row (full hours) is labelled. */}
                <div className="px-3 text-[12px] font-medium tabular-nums text-muted-foreground">
                  {(() => {
                    const cellIndex = (day - 1) * 2 + session;
                    const totalMin = 6 * 60 + cellIndex * 30;
                    if (totalMin > 23 * 60 + 30) return "";
                    if (totalMin % 60 !== 0) return "";
                    const hh = Math.floor(totalMin / 60);
                    return `${String(hh).padStart(2, "0")}:00`;
                  })()}
                </div>
                <div className="min-w-0 border-l border-hairline px-3 text-[13px] text-ink">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={onCommitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onCommitEdit();
                          onMoveAfterCommit(0, 1);
                        } else if (e.key === "Tab") {
                          e.preventDefault();
                          onCommitEdit();
                          onMoveAfterCommit(e.shiftKey ? -1 : 1, 0);
                        } else if (e.key === "Escape") {
                          onCommitEdit();
                        }
                      }}
                      className="w-full bg-transparent text-[13px] text-ink outline-none"
                    />
                  ) : (
                    <span
                      className={`block truncate ${
                        cell?.bold ? "font-semibold" : ""
                      } ${cell?.italic ? "italic" : ""} ${cell?.underline ? "underline" : ""}`}
                    >
                      {sameAbove ? "" : cellLabel}
                    </span>
                  )}
                </div>
                <div className="border-l border-hairline">
                  <DurationCell
                    initial={cell?.duration ?? ""}
                    onCommit={(v) => onCommitDuration?.(k, v)}
                  />
                </div>
              </div>
            )}

            {showCompact && !isEditing && (() => {
              const Icon = iconForColor(cellColor);
              const labelColor = "hsl(var(--ink, 220 13% 13%))";
              const iconColor = cellColor ?? labelColor;
              return (
                <span
                  className={`pointer-events-none absolute left-14 right-1.5 top-0.5 flex items-center gap-1 truncate text-[12px] ${
                    cell?.bold ? "font-semibold" : ""
                  } ${cell?.italic ? "italic" : ""} ${cell?.underline ? "underline" : ""}`}
                  style={{
                    opacity: focused ? 0 : 1,
                    transition: `opacity ${DUR_MS}ms ${EASE}`,
                    color: labelColor,
                  }}
                >
                  {!sameAbove && Icon && cellColor && (
                    <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} style={{ color: iconColor }} />
                  )}
                  <span className="truncate">{sameAbove ? "" : cellLabel}</span>
                </span>
              );
            })()}

            {showCompact && isEditing && (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCommitEdit();
                    onMoveAfterCommit(0, 1);
                  } else if (e.key === "Tab") {
                    e.preventDefault();
                    onCommitEdit();
                    onMoveAfterCommit(e.shiftKey ? -1 : 1, 0);
                  } else if (e.key === "Escape") {
                    onCommitEdit();
                  }
                }}
                className="absolute inset-y-0 left-7 right-1.5 bg-transparent text-[12px] text-ink caret-ink outline-none"
              />
            )}

            {/* Fill-handle (excel-style tip) removed per design */}

            {weekend && !cellColor && (
              <span className="pointer-events-none absolute inset-0 bg-muted/20" />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DurationCellProps {
  initial: string;
  onCommit: (v: string) => void;
}

function DurationCell({ initial, onCommit }: DurationCellProps) {
  const [v, setV] = useState(initial);
  const [editing, setEditing] = useState(false);

  // Re-sync when the underlying cell changes from outside.
  useEffect(() => {
    if (!editing) setV(initial);
  }, [initial, editing]);

  const commit = () => {
    setEditing(false);
    const t = v.trim();
    if (t !== initial) onCommit(t);
  };

  return (
    <div
      className="px-3 text-[12px] text-muted-foreground"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setV(initial);
              setEditing(false);
            }
          }}
          placeholder="1t 30min"
          className="w-full bg-transparent text-[12px] text-ink caret-ink outline-none"
        />
      ) : (
        <span className="block truncate">
          {v || <span className="text-muted-foreground/50">—</span>}
        </span>
      )}
    </div>
  );
}

/**
 * NowLine — current-time indicator. Rendered as a grid item rail at today's
 * column. Vertical position is computed from minute math (no measurement),
 * so it stays glued to the underlying cells through any scroll/animation.
 */
function NowLine({
  colIdx,
  nowMinutesSinceStart,
}: {
  colIdx: number;
  /** Minutes elapsed since the grid's start hour (e.g. 06:00). */
  nowMinutesSinceStart: number;
}) {
  const ROW_HEIGHT = 28;
  const top = (nowMinutesSinceStart / 30) * ROW_HEIGHT;
  const NOW_COLOR = "#FF4F4F";
  return (
    <div
      aria-hidden
      style={{
        gridColumnStart: colIdx + 2,
        gridColumnEnd: colIdx + 3,
        gridRowStart: 1,
        gridRowEnd: 19,
        position: "relative",
        pointerEvents: "none",
        zIndex: 14,
      }}
    >
      {top > 0 && (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0"
          style={{ height: top, background: "rgba(15, 23, 42, 0.04)" }}
          aria-hidden
        />
      )}
      <div
        className="pointer-events-none absolute left-0 right-0"
        style={{ top, height: 0, zIndex: 15 }}
        aria-hidden
      >
        <div
          className="absolute -left-[3px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_rgba(255,79,79,0.18)]"
          style={{ background: NOW_COLOR }}
        />
        <div
          className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
          style={{ background: NOW_COLOR }}
        />
      </div>
    </div>
  );
}


/**
 * WeekEventsOverlay — projects unified `CalendarEvent`s onto the week-view
 * column grid as absolutely-positioned blocks. Reads column boxes from the
 * existing `[data-month-col]` cells so it stays perfectly aligned through
 * grid track animations and resizes.
 *
 * Drag (pointer down + move) shifts an event in time and across days:
 *   • horizontal → snap to the nearest day column
 *   • vertical   → snap to the nearest 30-min slot
 * Click without dragging opens the inline editor.
 */
function WeekEventsOverlay({
  events,
  weekDates,
  startHour,
  appKind = "calendar",
  onEventClick,
  onEventDrop,
  onDeleteEvent,
  onSaveSessionNote,
  onUpsertSession,
  memberId,
  viewerRole = "owner",
}: {
  events: CalendarEvent[];
  weekDates: Date[];
  startHour: number;
  appKind?: "calendar" | "diary";
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onEventDrop: (id: string, newDate: Date, newStartMin: number, durationMin: number, anchor?: HTMLElement) => void;
  onDeleteEvent?: (id: string) => void;
  onSaveSessionNote?: (id: string, note: string) => void;
  onUpsertSession?: (patch: Partial<CalendarEvent> & { id: string }) => void;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
}) {
  const ROW_HEIGHT = 28;
  const [tileDesign] = useSessionTileDesign();
  const [unit] = useDistanceUnit();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  // Mark prop as used to silence ts noUnused warnings; behavior unchanged.
  void onSaveSessionNote;
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setHoverId(null);
      setHoverRect(null);
    }, 180);
  }, [cancelClose]);

  const [drag, setDrag] = useState<{
    id: string;
    pointerStart: { x: number; y: number };
    originColIdx: number;
    originStartMin: number;
    durationMin: number;
    moved: boolean;
    delta: { dx: number; dy: number };
    anchor: HTMLElement | null;
  } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.pointerStart.x;
      const dy = e.clientY - drag.pointerStart.y;
      const moved = drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
      setDrag({ ...drag, delta: { dx, dy }, moved });
    };
    const onUp = () => {
      if (drag.moved) {
        // Read column width once at drop time — no measurement-driven state.
        const sample = document.querySelector<HTMLElement>('[data-month-col="0"]');
        const colW = sample?.offsetWidth ?? 1;
        const colShift = Math.round(drag.delta.dx / colW);
        const newCol = Math.max(0, Math.min(6, drag.originColIdx + colShift));
        const minShift = Math.round(drag.delta.dy / ROW_HEIGHT) * 30;
        let newStart = drag.originStartMin + minShift;
        const minStart = startHour * 60;
        const maxStart = startHour * 60 + 18 * 60 - drag.durationMin;
        newStart = Math.max(minStart, Math.min(maxStart, newStart));
        onEventDrop(drag.id, weekDates[newCol], newStart, drag.durationMin, drag.anchor ?? undefined);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, startHour, weekDates, onEventDrop]);

  // Group events by day column (clamped to the visible 06:00–24:00 window).
  const byCol = useMemo(() => {
    const arr: Array<Array<{ ev: CalendarEvent; startMin: number; endMin: number }>> = Array.from(
      { length: 7 },
      () => [],
    );
    for (const ev of events) {
      const start = fromISOLocal(ev.startISO);
      const end = fromISOLocal(ev.endISO);
      const idx = weekDates.findIndex((d) => sameDay(d, start));
      if (idx < 0) continue;
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();
      const since = startMin - startHour * 60;
      if (since < 0 || since >= 18 * 60) continue;
      arr[idx].push({ ev, startMin, endMin });
    }
    return arr;
  }, [events, weekDates, startHour]);

  return (
    <>
      {byCol.map((list, colIdx) => (
        <div
          key={`week-rail-${colIdx}`}
          style={{
            gridColumnStart: colIdx + 2,
            gridColumnEnd: colIdx + 3,
            gridRowStart: 1,
            gridRowEnd: 19,
            position: "relative",
            pointerEvents: "none",
            zIndex: 8,
          }}
        >
          {list.map(({ ev, startMin, endMin }) => {
            const since = startMin - startHour * 60;
            const dur = Math.max(30, endMin - startMin);
            const top = (since / 30) * ROW_HEIGHT;
            const height = (dur / 30) * ROW_HEIGHT;
            const isDragging = drag?.id === ev.id && drag.moved;
            const dragDx = isDragging ? drag.delta.dx : 0;
            const dragDy = isDragging ? drag.delta.dy : 0;
            const accent = ev.color ?? "hsl(var(--primary))";
            const bg = ev.color
              ? `color-mix(in srgb, ${ev.color} 18%, white)`
              : "hsl(var(--primary) / 0.15)";
            const fg = "hsl(var(--ink, 220 13% 13%))";
            const Icon = iconForColor(ev.color);
            const isGhost = ev.id.startsWith("__ghost__:");
            return (
              <div
                key={ev.id}
                data-mark-cell="1"
                data-real-event={isGhost ? undefined : "1"}
                data-ghost-event={isGhost ? "1" : undefined}
                onMouseEnter={(e) => {
                  if (isGhost || appKind !== "diary") return;
                  cancelClose();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setHoverId(ev.id);
                  setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                }}
                onMouseLeave={(e) => {
                  if (isGhost || appKind !== "diary") return;
                  const related = e.relatedTarget as Node | null;
                  const goingIntoMenu = related instanceof HTMLElement && related.closest('[data-session-hover-menu="1"]');
                  if (goingIntoMenu) return;
                  scheduleClose();
                }}
                onPointerDown={(e) => {
                  if (isGhost) return;
                  if (appKind === "diary") return;
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                  setDrag({
                    id: ev.id,
                    pointerStart: { x: e.clientX, y: e.clientY },
                    originColIdx: colIdx,
                    originStartMin: startMin,
                    durationMin: dur,
                    moved: false,
                    delta: { dx: 0, dy: 0 },
                    anchor: e.currentTarget as HTMLElement,
                  });
                }}
                onClick={(e) => {
                  if (isGhost) return;
                  if (appKind === "diary") {
                    e.stopPropagation();
                    return;
                  }
                  if (drag?.moved) return;
                  e.stopPropagation();
                  onEventClick(ev, e.currentTarget as HTMLElement);
                }}
                className={`absolute cursor-pointer overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md`}
                style={{
                  left: 2,
                  right: 2,
                  top,
                  height,
                  transform: isDragging ? `translate(${dragDx}px, ${dragDy}px)` : undefined,
                  background: bg,
                  color: fg,
                  opacity: isDragging ? 0.85 : 1,
                  pointerEvents: "auto",
                }}
                title={ev.title}
              >
                <span
                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{ background: accent }}
                />
                {appKind === "diary" ? (
                  (() => {
                    const actKey = (ev.activity || ev.diarySub || "").toLowerCase();
                    const ActIcon: LucideIcon =
                      actKey === "cycling" || actKey === "bike" ? Bike :
                      actKey === "swimming" || actKey === "swim" ? Waves :
                      actKey === "strength" ? Dumbbell :
                      actKey === "xcskiing" ? Snowflake :
                      Footprints;
                    const durStr = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")} – ${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
                    const km = ev.distanceKm;
                    const distVal = km != null ? kmToUnit(km, unit) : null;
                    const isStrength = actKey === "strength";
                    const isNorwegian = typeof navigator !== "undefined" && /^nb|^nn|^no/i.test(navigator.language || "");
                    const hourSuffix = isNorwegian ? "t" : "h";
                    const totalMin = Math.max(0, endMin - startMin);
                    const durH = Math.floor(totalMin / 60);
                    const durM = totalMin % 60;
                    const strengthLabel = durH > 0 ? `${durH}${hourSuffix} ${durM}m` : `${durM}m`;
                    const distLabel = isStrength
                      ? strengthLabel
                      : distVal != null ? `${distVal.toFixed(1)} ${unitLabel(unit)}` : "—";
                    const iconHalfBg = ev.color
                      ? `color-mix(in srgb, ${ev.color} 40%, white)`
                      : "rgba(0,0,0,0.05)";

                    if (tileDesign === "icon") {
                      return (
                        <div className="flex h-full w-full items-center justify-center pl-1">
                          <ActIcon className="h-5 w-5 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
                        </div>
                      );
                    }
                    if (tileDesign === "stacked") {
                      return (
                        <div className="-mx-2 -my-0.5 flex h-full items-stretch">
                          <div
                            className="flex w-1/2 items-center justify-center"
                            style={{ background: iconHalfBg }}
                          >
                            <ActIcon className="h-5 w-5 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
                          </div>
                          <div className="flex w-1/2 min-w-0 flex-col justify-center px-2 leading-tight">
                            <span className="truncate text-[12px] font-semibold">{ev.title}</span>
                            <span className="mono truncate text-[10.5px] tabular-nums opacity-70">{durStr}</span>
                            {!isStrength && (
                              <span className="mono truncate text-[10.5px] tabular-nums opacity-70">
                                {distLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="-mx-2 -my-0.5 flex h-full items-stretch">
                        <div
                          className="flex w-1/2 items-center justify-center"
                          style={{ background: iconHalfBg }}
                        >
                          <ActIcon className="h-7 w-7 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
                        </div>
                        <div
                          className="flex w-1/2 items-center justify-center text-ink"
                          title={distLabel}
                        >
                          {isStrength ? (
                            <span
                              className="flex items-baseline gap-1"
                              style={{
                                fontFamily: "Helvetica, Arial, sans-serif",
                                fontWeight: 700,
                                fontSize: 22,
                                lineHeight: 1,
                              }}
                            >
                              {durH > 0 && (
                                <>
                                  <span>{durH}</span>
                                  <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{hourSuffix}</span>
                                </>
                              )}
                              <span>{durM}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>m</span>
                            </span>
                          ) : distVal != null ? (
                            <span
                              className="flex items-baseline gap-1"
                              style={{
                                fontFamily: "Helvetica, Arial, sans-serif",
                                fontWeight: 700,
                                fontSize: 22,
                                lineHeight: 1,
                              }}
                            >
                              <span>{distVal.toFixed(1)}</span>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  opacity: 0.7,
                                }}
                              >
                                {unitLabel(unit)}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex items-center gap-1">
                    {Icon && <Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} style={{ color: accent }} />}
                    <span className="truncate font-medium">{ev.title}</span>
                    <span className="ml-auto shrink-0 pl-1 mono text-[10.5px] tabular-nums opacity-70">
                      {`${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")} – ${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {appKind === "diary" && hoverId && hoverRect && (() => {
        const ev = events.find((e) => e.id === hoverId);
        if (!ev) return null;
        return (
          <SessionHoverMenu
            ev={ev}
            blockRect={hoverRect}
            rowHeight={ROW_HEIGHT}
            visible={hoverId === ev.id}
            memberId={memberId}
            viewerRole={viewerRole}
            onMenuEnter={cancelClose}
            onMenuLeave={scheduleClose}
            onForceClose={() => {
              cancelClose();
              setHoverId(null);
              setHoverRect(null);
            }}
            onDelete={() => {
              cancelClose();
              setHoverId(null);
              setHoverRect(null);
              onDeleteEvent?.(ev.id);
            }}
            onSaveNote={(note) =>
              onUpsertSession?.({
                ...ev,
                sessionNote: note || undefined,
                sessionNoteUpdatedAt: new Date().toISOString(),
              })
            }
            onUpsert={(patch) => onUpsertSession?.(patch)}
          />
        );
      })()}
    </>
  );
}


/**
 * DiarySimpleStack — stacks each day's sessions vertically in fixed-height
 * tiles, ignoring time of day. Supports drag-to-reorder within a column
 * (vertical only) with a confirmation modal on release.
 */
function DiarySimpleStack({
  events,
  weekDates,
  onEventClick,
  onDeleteEvent,
  onUpsertSession,
  onReorderEvents,
  memberId,
  viewerRole = "owner",
}: {
  events: CalendarEvent[];
  weekDates: Date[];
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onDeleteEvent?: (id: string) => void;
  onUpsertSession?: (patch: Partial<CalendarEvent> & { id: string }) => void;
  onReorderEvents?: (ids: string[]) => void;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
}) {
  const [tileDesign] = useSessionTileDesign();
  const [unit] = useDistanceUnit();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setHoverId(null);
      setHoverRect(null);
    }, 180);
  }, [cancelClose]);

  // Group events by column, sorted by sortIndex (fallback startISO).
  // Local order overrides while a reorder is pending.
  const [pendingOrder, setPendingOrder] = useState<{ colIdx: number; ids: string[] } | null>(null);
  const [stravaBlocked, setStravaBlocked] = useState(false);
  const byCol = useMemo(() => {
    const arr: CalendarEvent[][] = Array.from({ length: 7 }, () => []);
    for (const ev of events) {
      const start = fromISOLocal(ev.startISO);
      const idx = weekDates.findIndex((d) => sameDay(d, start));
      if (idx < 0) continue;
      arr[idx].push(ev);
    }
    for (const list of arr) {
      list.sort((a, b) => {
        const ka = a.sortIndex ?? fromISOLocal(a.startISO).getTime();
        const kb = b.sortIndex ?? fromISOLocal(b.startISO).getTime();
        return ka - kb;
      });
    }
    if (pendingOrder) {
      const list = arr[pendingOrder.colIdx];
      const map = new Map(list.map((e) => [e.id, e]));
      arr[pendingOrder.colIdx] = pendingOrder.ids
        .map((id) => map.get(id))
        .filter((e): e is CalendarEvent => !!e);
    }
    return arr;
  }, [events, weekDates, pendingOrder]);

  return (
    <>
      {byCol.map((list, colIdx) => (
        <div
          key={`simple-rail-${colIdx}`}
          style={{
            gridColumnStart: colIdx + 2,
            gridColumnEnd: colIdx + 3,
            gridRowStart: 1,
            gridRowEnd: 2,
            position: "relative",
            pointerEvents: "none",
            zIndex: 8,
          }}
        >
          <SimpleColumn
            colIdx={colIdx}
            list={list}
            tileDesign={tileDesign}
            unit={unit}
            onEventClick={onEventClick}
            onHoverChange={(id, rect) => {
              cancelClose();
              setHoverId(id);
              setHoverRect(rect);
            }}
            onHoverEnd={scheduleClose}
            onReorder={(ids) => {
              const oldIds = list.map((e) => e.id);
              const byId = new Map(list.map((e) => [e.id, e]));
              const movedStrava = ids.some(
                (id, i) => id !== oldIds[i] && byId.get(id)?.stravaActivityId != null,
              );
              if (movedStrava) {
                setStravaBlocked(true);
                return;
              }
              setPendingOrder({ colIdx, ids });
            }}
          />
        </div>
      ))}
      <ReorderConfirmDialog
        open={!!pendingOrder || stravaBlocked}
        mode={stravaBlocked ? "stravaBlocked" : "confirm"}
        onCancel={() => {
          setPendingOrder(null);
          setStravaBlocked(false);
        }}
        onConfirm={() => {
          if (pendingOrder) onReorderEvents?.(pendingOrder.ids);
          setPendingOrder(null);
          setStravaBlocked(false);
        }}
      />
      {hoverId && hoverRect && (() => {
        const ev = events.find((e) => e.id === hoverId);
        if (!ev) return null;
        return (
          <SessionHoverMenu
            ev={ev}
            blockRect={hoverRect}
            rowHeight={28}
            visible={hoverId === ev.id}
            memberId={memberId}
            viewerRole={viewerRole}
            onMenuEnter={cancelClose}
            onMenuLeave={scheduleClose}
            onForceClose={() => {
              cancelClose();
              setHoverId(null);
              setHoverRect(null);
            }}
            onDelete={() => {
              cancelClose();
              setHoverId(null);
              setHoverRect(null);
              onDeleteEvent?.(ev.id);
            }}
            onSaveNote={(note) =>
              onUpsertSession?.({
                ...ev,
                sessionNote: note || undefined,
                sessionNoteUpdatedAt: new Date().toISOString(),
              })
            }
            onUpsert={(patch) => onUpsertSession?.(patch)}
          />
        );
      })()}
    </>
  );
}


const SIMPLE_TILE_H = 56;
const SIMPLE_TILE_GAP = 4;
const SIMPLE_PAD = 6;

function SimpleColumn({
  colIdx,
  list,
  tileDesign,
  unit,
  onEventClick,
  onHoverChange,
  onHoverEnd,
  onReorder,
}: {
  colIdx: number;
  list: CalendarEvent[];
  tileDesign: "split" | "stacked" | "icon";
  unit: ReturnType<typeof useDistanceUnit>[0];
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onHoverChange: (id: string, rect: { left: number; top: number; width: number; height: number }) => void;
  onHoverEnd: () => void;
  onReorder: (ids: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const ids = list.map((e) => e.id);

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    onReorder(next);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const activeEvent = activeId ? list.find((e) => e.id === activeId) ?? null : null;

  return (
    <div
      data-simple-col-overlay={colIdx}
      className="absolute left-0 right-0 top-0"
      style={{
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: SIMPLE_PAD,
        pointerEvents: "auto",
      }}
    >

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col" style={{ gap: SIMPLE_TILE_GAP }}>
            {list.map((ev) => (
              <SortableSimpleTile
                key={ev.id}
                ev={ev}
                tileDesign={tileDesign}
                unit={unit}
                disabled={list.length < 2}
                onEventClick={onEventClick}
                onHoverChange={onHoverChange}
                onHoverEnd={onHoverEnd}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {activeEvent ? (
            <SimpleTileBody ev={activeEvent} tileDesign={tileDesign} unit={unit} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SortableSimpleTile({
  ev,
  tileDesign,
  unit,
  disabled,
  onEventClick,
  onHoverChange,
  onHoverEnd,
}: {
  ev: CalendarEvent;
  tileDesign: "split" | "stacked" | "icon";
  unit: ReturnType<typeof useDistanceUnit>[0];
  disabled?: boolean;
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onHoverChange: (id: string, rect: { left: number; top: number; width: number; height: number }) => void;
  onHoverEnd: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ev.id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-real-event="1"
      onMouseEnter={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onHoverChange(ev.id, { left: r.left, top: r.top, width: r.width, height: r.height });
      }}
      onMouseLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        const goingIntoMenu = related instanceof HTMLElement && related.closest('[data-session-hover-menu="1"]');
        if (goingIntoMenu) return;
        onHoverEnd();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isDragging) return;
        onEventClick(ev, e.currentTarget as HTMLElement);
      }}
    >
      <SimpleTileBody ev={ev} tileDesign={tileDesign} unit={unit} />
    </div>
  );
}

function SimpleTileBody({
  ev,
  tileDesign,
  unit,
  dragging = false,
}: {
  ev: CalendarEvent;
  tileDesign: "split" | "stacked" | "icon";
  unit: ReturnType<typeof useDistanceUnit>[0];
  dragging?: boolean;
}) {
  const accent = ev.color ?? "hsl(var(--primary))";
  const bg = ev.color ? `color-mix(in srgb, ${ev.color} 18%, white)` : "hsl(var(--primary) / 0.15)";
  const fg = "hsl(var(--ink, 220 13% 13%))";
  const start = fromISOLocal(ev.startISO);
  const end = fromISOLocal(ev.endISO);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const actKey = (ev.activity || ev.diarySub || "").toLowerCase();
  const ActIcon =
    actKey === "cycling" || actKey === "bike" ? Bike :
    actKey === "swimming" || actKey === "swim" ? Waves :
    actKey === "strength" ? Dumbbell :
    actKey === "xcskiing" ? Snowflake :
    Footprints;
  const km = ev.distanceKm;
  const distVal = km != null ? kmToUnit(km, unit) : null;
  const isStrength = actKey === "strength";
  const isNorwegian = typeof navigator !== "undefined" && /^nb|^nn|^no/i.test(navigator.language || "");
  const hourSuffix = isNorwegian ? "t" : "h";
  const totalMin = Math.max(0, endMin - startMin);
  const durH = Math.floor(totalMin / 60);
  const durM = totalMin % 60;
  const strengthLabel = durH > 0 ? `${durH}${hourSuffix} ${durM}m` : `${durM}m`;
  const distLabel = isStrength
    ? strengthLabel
    : distVal != null ? `${distVal.toFixed(1)} ${unitLabel(unit)}` : "—";
  const iconHalfBg = ev.color ? `color-mix(in srgb, ${ev.color} 40%, white)` : "rgba(0,0,0,0.05)";
  const durStr = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")} – ${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md",
        dragging ? "shadow-lg" : "",
      ].join(" ")}
      style={{
        height: SIMPLE_TILE_H,
        background: bg,
        color: fg,
      }}
      title={ev.title}
    >
      <span className="pointer-events-none absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      {tileDesign === "icon" ? (
        <div className="flex h-full w-full items-center justify-center pl-1">
          <ActIcon className="h-5 w-5 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
        </div>
      ) : tileDesign === "stacked" ? (
        <div className="-mx-2 -my-0.5 flex h-full items-stretch">
          <div className="flex w-1/2 items-center justify-center" style={{ background: iconHalfBg }}>
            <ActIcon className="h-5 w-5 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
          </div>
          <div className="flex w-1/2 min-w-0 flex-col justify-center px-2 leading-tight">
            <span className="truncate text-[12px] font-semibold">{ev.title}</span>
            <span className="mono truncate text-[10.5px] tabular-nums opacity-70">{durStr}</span>
            {!isStrength && (
              <span className="mono truncate text-[10.5px] tabular-nums opacity-70">{distLabel}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="-mx-2 -my-0.5 flex h-full items-stretch">
          <div className="flex w-1/2 items-center justify-center" style={{ background: iconHalfBg }}>
            <ActIcon className="h-7 w-7 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
          </div>
          <div
            className="flex w-1/2 items-center justify-center text-ink"
            title={distLabel}
            style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 18 }}
          >
            {isStrength ? (
              <span className="flex items-baseline gap-1" style={{ lineHeight: 1 }}>
                {durH > 0 && (
                  <>
                    <span>{durH}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{hourSuffix}</span>
                  </>
                )}
                <span>{durM}</span>
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>m</span>
              </span>
            ) : distVal != null ? (
              <span className="flex items-baseline gap-1" style={{ lineHeight: 1 }}>
                <span>{distVal.toFixed(1)}</span>
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{unitLabel(unit)}</span>
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
      )}
    </div>
  );
}


