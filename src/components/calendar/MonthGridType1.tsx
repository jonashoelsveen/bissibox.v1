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
import { Trash2, PersonStanding, GraduationCap, Briefcase, Sparkles, Clock, Bike, Waves, Dumbbell, Snowflake, Footprints } from "lucide-react";
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
import { SessionHoverMenu } from "./SessionHoverMenu";
import { useHoverLock } from "./hoverLock";
import { SessionDetailsContainer } from "./SessionDetailsContainer";
import { TimeWheelPicker } from "./TimeWheelPicker";
import { ReorderConfirmDialog } from "./ReorderConfirmDialog";

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

function DiaryMonthReorderTile({
  ev,
  tileDesign,
  unit,
  height,
  dragging = false,
}: {
  ev: CalendarEvent;
  tileDesign: string;
  unit: ReturnType<typeof useDistanceUnit>[0];
  height: number | string;
  dragging?: boolean;
}) {
  const accent = ev.color ?? "hsl(var(--primary))";
  const bg = ev.color
    ? `color-mix(in srgb, ${ev.color} 18%, white)`
    : "hsl(var(--primary) / 0.15)";
  const startDate = fromISOLocal(ev.startISO);
  const endDate = fromISOLocal(ev.endISO);
  const totalMin = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  const durH = Math.floor(totalMin / 60);
  const durM = totalMin % 60;
  const isNorwegian = typeof navigator !== "undefined" && /^nb|^nn|^no/i.test(navigator.language || "");
  const hourSuffix = isNorwegian ? "t" : "h";
  const durStr = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")} – ${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
  const ActIcon = activityIconFor(ev);
  const km = ev.distanceKm;
  const distVal = km != null ? kmToUnit(km, unit) : null;
  const actKey = (ev.activity || ev.diarySub || "").toLowerCase();
  const isStrength = actKey === "strength";
  const strengthLabel = durH > 0 ? `${durH}${hourSuffix} ${durM}m` : `${durM}m`;
  const distLabel = isStrength
    ? strengthLabel
    : distVal != null ? `${distVal.toFixed(1)} ${unitLabel(unit)}` : "—";
  const iconHalfBg = ev.color
    ? `color-mix(in srgb, ${ev.color} 40%, white)`
    : "rgba(0,0,0,0.05)";

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[3px] text-[12px] text-ink shadow-sm ring-1 ring-black/5 transition-shadow",
        dragging ? "shadow-lg" : "hover:shadow-md",
      ].join(" ")}
      style={{ height, background: bg }}
      title={ev.title}
    >
      <span className="pointer-events-none absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      {tileDesign === "stacked" ? (
        <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-[3px]">
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
      ) : tileDesign === "split" ? (
        <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-[3px]">
          <div className="flex w-1/2 items-center justify-center" style={{ background: iconHalfBg }}>
            <ActIcon className="h-7 w-7 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
          </div>
          <div
            className="flex w-1/2 items-center justify-center"
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
      ) : (
        <div className="flex h-full items-center truncate pl-2 pr-1.5 py-0.5">
          <span className="truncate">{ev.title}</span>
        </div>
      )}
    </div>
  );
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

  // ───────────────────── Diary hover menu (mirrors week view) ──────────────
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [forceEditId, setForceEditId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [detailsEvId, setDetailsEvId] = useState<string | null>(null);
  const globalLock = useHoverLock();
  const ownSessionLockId = (forceEditId ?? lockedId) != null ? `session-${forceEditId ?? lockedId}` : null;
  const foreignLock = globalLock !== null && globalLock !== ownSessionLockId;
  const hoverLocked = lockedId !== null || forceEditId !== null || foreignLock;
  const hoverCloseTimerRef = useRef<number | null>(null);
  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimerRef.current != null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);
  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      if (forceEditId) return;
      setHoverId(null);
      setHoverRect(null);
    }, 0);
  }, [cancelHoverClose, forceEditId]);

  // When another component (e.g. a day-note button) claims the global hover
  // lock, close any open session edit panel so the new panel can take over.
  useEffect(() => {
    if (foreignLock) {
      setForceEditId(null);
      setLockedId(null);
      setHoverId(null);
      setHoverRect(null);
    }
  }, [foreignLock]);


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
    // Set on pointerup for diary same-day reorder. While set, the floating
    // clone CSS-transitions toward { left, top } and the source chip is
    // re-included in baseVisible (sorted by pendingOrder) so the real chip
    // and the clone land at the same pixel — no jump.
    landing?: { left: number; top: number } | null;
  } | null>(null);
  const dragSessionRef = useRef(dragSession);
  useEffect(() => {
    dragSessionRef.current = dragSession;
  }, [dragSession]);
  const suppressClickAfterDragRef = useRef(false);
  // Tracks the event id currently pressed (pointer down) before drag threshold.
  // Used so the chip keeps its "active" styling from mousedown through drag,
  // without a flash back to the idle color.
  const [pressedEventId, setPressedEventId] = useState<string | null>(null);
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
    // Diary-only: frozen geometry of the source cell captured at drag start.
    // Used to compute insertIndex arithmetically (slot index based on pointer Y),
    // avoiding feedback from the framer-motion layout animation that would
    // otherwise make the index oscillate as chips slide to fill the gap.
    diarySlotTop?: number;
    diarySlotHeight?: number;
    diaryOtherCount?: number;
    diaryChipLeft?: number;
    diaryMaxTop?: number;
  } | null>(null);

  // Diary reorder confirmation state.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [stravaBlocked, setStravaBlocked] = useState(false);
  // Delays the confirm/strava dialog by ~300ms after pointerup so the
  // landing snap-in animation can finish first.
  const [modalReady, setModalReady] = useState(false);
  const modalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
  }, []);




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
      suppressClickAfterDragRef.current = true;

      let targetDate: Date | null = null;
      let dayKey: string | null = null;
      let insertIndex = 0;
      let diaryGhostTop: number | null = null;

      if (appKind === "diary") {
        // Diary: lock the target to the source day cell. Movement is vertical
        // only — no cross-day drops. Insertion index is computed arithmetically
        // from the pointer Y against geometry frozen at drag start, so the
        // layout animation that slides chips into the gap cannot feed back
        // into the index calculation (which is what caused the "jump").
        const fk = start.fromKey;
        const sourceDate = new Date(fk.year, fk.month, fk.day);
        targetDate = sourceDate;
        dayKey = makeCellId(calId, { ...fk, session: 0 });
        const count = start.diaryOtherCount ?? 0;
        const slotTop = start.diarySlotTop;
        const slotH = start.diarySlotHeight;
        const maxTop = start.diaryMaxTop;
        let clampedTop = e.clientY - start.offsetY;
        if (slotTop != null && slotH != null && slotH > 0) {
          // Use the dragged tile's visual midpoint rather than the raw cursor
          // position. This matches week-view sortable feel no matter where
          // inside the tile the user grabbed it, so neighbors do not switch
          // places too early when the pointer is near the tile's top edge.
          clampedTop = Math.min(Math.max(clampedTop, slotTop), maxTop ?? slotTop);
          const dragMid = clampedTop + start.chipHeight / 2;
          const rel = dragMid - slotTop;
          // Use floor (not round) so the dragged tile only switches places
          // once its midpoint actually crosses a neighbor's midpoint. Round
          // makes the switch trigger ~1px past the slot edge which felt
          // far too eager compared to the week-view dnd-kit behavior.
          insertIndex = Math.max(0, Math.min(count, Math.floor(rel / slotH)));
          diaryGhostTop = clampedTop;
        } else {
          insertIndex = count;
        }
      } else {
        // Hit-test the cell under the pointer.
        const node = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const cell = node?.closest<HTMLElement>("[data-cell-pos]");
        dayKey = cell?.getAttribute("data-day-key") ?? null;
        const posStr = cell?.getAttribute("data-cell-pos") ?? null;
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
      }

      // For diary, keep the ghost chip strictly vertical by pinning X to the
      // initial pointer X.
      const ghostX = appKind === "diary" ? start.x : e.clientX;
      const ghostY = appKind === "diary"
        ? (diaryGhostTop != null ? diaryGhostTop + start.offsetY : e.clientY)
        : e.clientY;

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
          pointerX: ghostX,
          pointerY: ghostY,
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
                pointerX: ghostX,
                pointerY: ghostY,
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
        setPressedEventId(null);
        return;
      }
      const td = drag.targetDate;
      const sameDayDrop = !!td &&
        drag.fromKey.year === td.getFullYear() &&
        drag.fromKey.month === td.getMonth() &&
        drag.fromKey.day === td.getDate();

      // ── Diary: same-day reorder only. Cross-day drops are blocked. ──
      if (appKind === "diary") {
        if (!td || !sameDayDrop) {
          setDragSession(null);
          setPressedEventId(null);
          return;
        }
        // Build the new ordered id list for that day.
        const dayEvents = events
          .filter((ev) => sameDay(fromISOLocal(ev.startISO), td))
          .slice()
          .sort((a, b) => {
            const ka = a.sortIndex ?? Date.parse(a.startISO);
            const kb = b.sortIndex ?? Date.parse(b.startISO);
            return ka - kb;
          });
        const oldIds = dayEvents.map((e) => e.id);
        const without = oldIds.filter((id) => id !== drag.eventId);
        const insertAt = Math.max(0, Math.min(without.length, drag.insertIndex));
        const newIds = [...without.slice(0, insertAt), drag.eventId, ...without.slice(insertAt)];
        // No-op: order unchanged → just unmount the clone, no dialog.
        const unchanged = newIds.length === oldIds.length && newIds.every((id, i) => id === oldIds[i]);
        if (unchanged) {
          setDragSession(null);
          setPressedEventId(null);
          return;
        }

        // Compute landing pixel for the floating clone. We snap the clone
        // to the final slot using frozen geometry, so when dragSession
        // clears the real chip is already at the exact same spot — no
        // perceived jump on release.
        const landingNode = document.querySelector<HTMLElement>(
          `[data-event-id="${drag.eventId.replace(/"/g, '\\"')}"]`,
        );
        const landingRect = landingNode?.getBoundingClientRect() ?? null;
        const slotTop = start?.diarySlotTop;
        const slotH = start?.diarySlotHeight;
        const chipLeft = start?.diaryChipLeft;
        const landing = landingRect
          ? { left: landingRect.left, top: landingRect.top }
          : (slotTop != null && slotH != null && chipLeft != null)
              ? { left: chipLeft, top: slotTop + insertAt * slotH }
              : null;

        // Block reorder when any moved session is Strava-synced.
        const movedStrava = newIds.some(
          (id, i) => id !== oldIds[i] && dayEvents.find((e) => e.id === id)?.stravaActivityId != null,
        );

        // Begin the snap-in animation. Keep dragSession alive briefly so
        // the floating clone CSS-transitions to the landing slot. When
        // landing is set, the source chip is re-included in baseVisible
        // (sorted by pendingOrder for non-strava case, or unchanged for
        // strava), so the real chip mounts at the exact landing pixel.
        if (!movedStrava) {
          setPendingOrder(newIds);
        }
        setDragSession((prev) => (prev ? { ...prev, landing } : prev));
        setPressedEventId(null);

        if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
        landingTimerRef.current = setTimeout(() => {
          setDragSession(null);
        }, landingRect ? 180 : 200);

        if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
        modalTimerRef.current = setTimeout(() => {
          if (movedStrava) setStravaBlocked(true);
          setModalReady(true);
        }, 300);
        return;
      }

      // Cross-day (calendar mode): unmount clone immediately.
      setDragSession(null);
      setPressedEventId(null);
      void start;
      if (!td) return;

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
  }, [days, events, moveItem, appKind]);


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
        data-grid-header="1"
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
              const pendingOrderIndex = pendingOrder && pendingOrder.length === dayEvents.length
                ? new Map(pendingOrder.map((eventId, index) => [eventId, index]))
                : null;
              const shouldUsePendingOrder = !!pendingOrderIndex && dayEvents.every((event) => pendingOrderIndex.has(event.id));
              const sortedDayEvents = dayEvents
                .slice()
                .sort((a, b) => {
                  if (shouldUsePendingOrder) {
                    return pendingOrderIndex!.get(a.id)! - pendingOrderIndex!.get(b.id)!;
                  }
                  const ka = a.sortIndex ?? Date.parse(a.startISO);
                  const kb = b.sortIndex ?? Date.parse(b.startISO);
                  return ka - kb;
                });

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

              // Strict row alignment: at most 5 rows total in a day cell.
              // If everything fits in 5, show all 5 chips. Otherwise show 4
              // chips and reserve the 5th row for the "+N more" button.
              const MAX_ROWS = 5;
              const willOverflow = allItems.length > MAX_ROWS;
              const MAX_VISIBLE = willOverflow ? MAX_ROWS - 1 : MAX_ROWS;
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
                      // this day's list during a drag.
                      const isSourceDay =
                        !!dragSession &&
                        dragSession.fromKey.year === d.date.getFullYear() &&
                        dragSession.fromKey.month === d.date.getMonth() &&
                        dragSession.fromKey.day === d.date.getDate();
                      // In diary mode drags are locked to the source day, so
                      // the target day is always the source day.
                      const isTargetDay = appKind === "diary"
                        ? isSourceDay
                        : !!dragSession && dragSession.targetDayKey === id && !isSourceDay;

                      // For diary same-day reorder, fully remove the dragged
                      // source chip from the flow and re-insert a ghost at the
                      // computed insertion index. Combined with framer-motion
                      // `layout`, the other chips smoothly slide to make room
                      // (snap-in), matching the week-view sortable behavior.
                      // Once `landing` is set (pointer released), the source
                      // chip is re-included so it mounts at the final slot
                      // (sorted by pendingOrder) while the floating clone
                      // CSS-transitions to the same pixel — no jump.
                      const hideSource = appKind === "diary"
                        && isSourceDay
                        && dragSession
                        && !dragSession.landing;
                      const baseVisible = hideSource
                        ? visible.filter((it) => !(it.kind === "event" && it.event.id === dragSession!.eventId))
                        : visible;


                      type RenderItem =
                        | { kind: "ghost" }
                        | { kind: "creating" }
                        | UnifiedItem;
                      const renderList: RenderItem[] = [...baseVisible];
                      if (isTargetDay && dragSession && !dragSession.landing) {
                        const insertAt = appKind === "diary"
                          ? Math.max(0, Math.min(baseVisible.length, dragSession.insertIndex))
                          : 0;
                        renderList.splice(insertAt, 0, { kind: "ghost" });
                      }
                      const isCreatingHere =
                        !!popover &&
                        !popover.eventId &&
                        popover.editIdx < 0 &&
                        popover.pos.row === pos.row &&
                        popover.pos.col === pos.col;
                      if (isCreatingHere) {
                        renderList.push({ kind: "creating" });
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
                        // In diary mode mirror the week-view style: the source
                        // slot simply becomes empty space (no border, no fill).
                        // The floating drag clone follows the cursor and the
                        // surrounding chips smoothly slide via `layout`.
                        if (isDiaryEvent) {
                          return (
                            <div
                              key={`${id}-ghost-move`}
                              data-role="ghost-move"
                              aria-hidden
                              className="pointer-events-none"
                              style={{ minHeight: tall ? 44 : 22 }}
                            />
                          );
                        }
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
                                  key={`${id}-ghost-slot`}
                                  initial={false}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0 }}
                                >
                                  {renderGhost()}
                                </motion.div>
                              );
                            }
                            if (it.kind === "creating") {
                              const tallCreate =
                                appKind === "diary" &&
                                (monthTileDesign === "split" || monthTileDesign === "stacked");
                              return (
                                <motion.div
                                  key={`${id}-creating-${idx}`}
                                  initial={false}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0 }}
                                  className="pointer-events-none rounded-[3px] border-2 border-solid border-primary/60 bg-primary/10"
                                  style={{ minHeight: tallCreate ? 44 : 22 }}
                                />
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
                            onMouseEnter={(e) => {
                              if (appKind !== "diary" || !isRealEvent) return;
                              const evId = it.kind === "event" ? it.event.id : null;
                              if (hoverLocked && evId !== (lockedId ?? forceEditId)) return;
                              cancelHoverClose();
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setHoverId(evId);
                              setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                            }}
                            onMouseLeave={(e) => {
                              if (appKind !== "diary" || !isRealEvent) return;
                              const related = e.relatedTarget as Node | null;
                              const goingIntoMenu = related instanceof HTMLElement && related.closest('[data-session-hover-menu="1"]');
                              if (goingIntoMenu) return;
                              scheduleHoverClose();
                            }}
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              if (it.kind === "legacy") return;
                              if (it.event.id.startsWith("__ghost__:")) return;
                              // Only the owner can drag sessions. Coaches /
                              // group leaders viewing someone else's calendar
                              // or diary cannot move anything.
                              if (viewerRole !== "owner") return;
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              // Start tracking a potential drag.
                              suppressClickAfterDragRef.current = false;
                              // For diary, freeze the source-cell row geometry NOW so the
                              // pointermove handler can compute the slot index by arithmetic
                              // (no live DOM hit-testing while chips animate into the gap).
                              let diarySlotTop: number | undefined;
                              let diarySlotHeight: number | undefined;
                              let diaryOtherCount: number | undefined;
                              let diaryMaxTop: number | undefined;
                              if (appKind === "diary") {
                                const cellEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-day-key]");
                                const chips = cellEl
                                  ? Array.from(
                                      cellEl.querySelectorAll<HTMLElement>(
                                        '[data-real-event="1"][data-event-id]',
                                      ),
                                    )
                                  : [];
                                const others = chips.filter(
                                  (el) => el.getAttribute("data-event-id") !== it.event.id,
                                );
                                diaryOtherCount = others.length;
                                // Slot height = chip height + vertical gap between chips.
                                // Container uses Tailwind `space-y-0.5` (2px gap).
                                const gap = 2;
                                diarySlotHeight = rect.height + gap;
                                // Slot top = top of the first row in the chip list, after the
                                // dragged chip is conceptually removed and the rest collapse.
                                if (chips.length > 0) {
                                  const firstTop = chips[0].getBoundingClientRect().top;
                                  // If the dragged chip is the first one, the "new first row"
                                  // starts where it currently does (the next chip slides up).
                                  diarySlotTop = firstTop;
                                  const maxIndex = others.length;
                                  diaryMaxTop = firstTop + maxIndex * diarySlotHeight;
                                }
                              }
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
                                diarySlotTop,
                                diarySlotHeight,
                                diaryOtherCount,
                                diaryChipLeft: appKind === "diary" ? rect.left : undefined,
                                diaryMaxTop,
                              };
                              if (appKind !== "diary") {
                                setPressedEventId(it.event.id);
                              }
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
                              if (suppressClickAfterDragRef.current) {
                                suppressClickAfterDragRef.current = false;
                                return;
                              }
                              if (dragSessionRef.current) return;
                              if (it.kind === "event" && it.event.id.startsWith("__ghost__:")) {
                                return;
                              }
                              if (it.kind === "legacy") {
                                openItemEditor(pos, it.idx, it.raw, e.currentTarget as HTMLElement);
                              } else if (appKind === "diary" && viewerRole === "owner") {
                                cancelHoverClose();
                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setHoverId(it.event.id);
                                setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                                setForceEditId(it.event.id);
                              } else {
                                openEventEditor(pos, it.event, e.currentTarget as HTMLElement);
                              }
                            }}
                            className={isDiaryEvent
                              ? "relative"
                              : tall
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
                                  ].join(" ")}
                            style={(() => {
                              if (isDiaryEvent) return undefined;
                              const evId = it.kind === "event" ? it.event.id : null;
                              const isActive = isRealEvent && evId !== null && ((lockedId ?? forceEditId) === evId || popover?.eventId === evId || (appKind !== "diary" && (dragSession?.eventId === evId || pressedEventId === evId)));
                              if (isActive && itemColor) {
                                return tall
                                  ? {
                                      minHeight: 44,
                                      backgroundColor: itemColor,
                                      boxShadow: `inset 2px 0 0 ${itemColor}`,
                                      color: "#fff",
                                    }
                                  : {
                                      backgroundColor: itemColor,
                                      boxShadow: `inset 2px 0 0 ${itemColor}`,
                                      color: "#fff",
                                    };
                              }
                              return tall
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
                                  : {};
                            })()}
                            title={isDiaryEvent ? undefined : displayText}
                          >
                            {isDiaryEvent ? (() => {
                              const ev = it.kind === "event" ? it.event : null;
                              if (!ev) return null;
                              return (
                                <DiaryMonthReorderTile
                                  ev={ev}
                                  tileDesign={monthTileDesign}
                                  unit={distanceUnit}
                                  height={tall ? 44 : 22}
                                />
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
          const landing = dragSession.landing;
          const left = landing ? landing.left : dragSession.pointerX - dragSession.offsetX;
          const top = landing ? landing.top : dragSession.pointerY - dragSession.offsetY;
          return (
            <div
              className="pointer-events-none fixed z-[60]"
              style={{
                left,
                top,
                width: dragSession.chipWidth,
                height: dragSession.chipHeight,
                // Smoothly snap the floating clone into the destination slot
                // on release. The real chip is already mounted at the same
                // landing pixel (via baseVisible re-include + pendingOrder
                // sort), so when the clone unmounts there is no visible
                // jump — it simply hands off to the real chip.
                transition: landing
                  ? "left 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1)"
                  : undefined,
              }}
            >
              <DiaryMonthReorderTile
                ev={ev}
                tileDesign={monthTileDesign}
                unit={distanceUnit}
                height="100%"
                dragging
              />
            </div>
          );
        })()}
        {appKind === "diary" && !popover && hoverId && hoverRect && (() => {
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
              defaultEditMode={forceEditId === ev.id}
              onMenuEnter={cancelHoverClose}
              onMenuLeave={scheduleHoverClose}
              onActiveChange={(active) => setLockedId(active ? ev.id : null)}
              onOpenDetails={() => {
                cancelHoverClose();
                setDetailsEvId(ev.id);
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
              }}
              onForceClose={() => {
                cancelHoverClose();
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
              }}
              onDelete={() => {
                cancelHoverClose();
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
                onDeleteEvent?.(ev.id);
              }}
              onSaveNote={(note) =>
                onUpsertEvent?.({
                  ...ev,
                  sessionNote: note || undefined,
                  sessionNoteUpdatedAt: new Date().toISOString(),
                })
              }
              onUpsert={(patch) => { onUpsertEvent?.(patch); }}
            />
          );
        })()}
        {appKind === "diary" && detailsEvId && (() => {
          const ev = events.find((e) => e.id === detailsEvId);
          if (!ev) return null;
          return (
            <SessionDetailsContainer
              ev={ev}
              onClose={() => setDetailsEvId(null)}
              onUpsert={(patch) => { onUpsertEvent?.(patch); }}
              onDelete={onDeleteEvent ? () => onDeleteEvent(ev.id) : undefined}
            />
          );
        })()}
        <ReorderConfirmDialog
          open={(!!pendingOrder || stravaBlocked) && modalReady}
          mode={stravaBlocked ? "stravaBlocked" : "confirm"}
          onCancel={() => {
            if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
            setPendingOrder(null);
            setStravaBlocked(false);
            setModalReady(false);
          }}
          onConfirm={() => {
            if (modalTimerRef.current) { clearTimeout(modalTimerRef.current); modalTimerRef.current = null; }
            if (pendingOrder) onReorderEvents?.(pendingOrder);
            setPendingOrder(null);
            setStravaBlocked(false);
            setModalReady(false);
          }}
        />
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
        // Defer so React flushes any pending state updates from the
        // currently-focused TimeWheelPicker cell (which also handles Enter
        // and commits its value via setState) before we read the refs.
        // Without this, timeRef holds the stale time and the chip order
        // doesn't update until the user clicks outside.
        setTimeout(() => {
          onCommit(valueRef.current.trim(), colorRef.current, timeRef.current);
        }, 0);
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

  const adminCategory = adminCategoryFromColor(color);

  // Default range used the first time the user opens the wheels with no
  // existing time set on the session.
  const effectiveTime = time ?? { startMin: 8 * 60, endMin: 9 * 60 };

  return (
    <div
      ref={ref}
      data-role="popover"
      className="fixed z-50"
      style={{ top, left, width: POPOVER_W }}
    >
      <div className="relative flex items-start gap-2">
        <div className="flex-1 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg">
          {/* Session name — header */}
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="f.eks. Intervaller 5×4min"
            className="block w-full border-b border-hairline bg-transparent px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60"
          />

          {/* Time row */}
          <div className="flex items-center gap-2 px-3 py-2">
            {enableDuration && (
              <Clock
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                strokeWidth={2}
                aria-hidden
              />
            )}
            {enableDuration ? (
              <div className="flex-1 min-w-0">
                <TimeWheelPicker
                  value={effectiveTime}
                  onChange={(t) => {
                    setTime(t);
                    onTimeChange?.(t);
                  }}
                />
              </div>
            ) : (
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {isEdit ? "Rediger økt" : "Legg til økt"}
              </span>
            )}
          </div>

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
  // Also push the resolved category's color up so the autosave / Enter-commit
  // writes the actual selected category color (not the hardcoded fallback).
  useEffect(() => {
    if (!selectedId && categories.length > 0) {
      const fromColor = categories.find((c) => c.color.toLowerCase() === lcColor)?.id;
      const id = fromColor ?? categories[0].id;
      setSelectedId(id);
      const cat = categories.find((c) => c.id === id);
      if (cat && cat.color.toLowerCase() !== lcColor) onSetColor(cat.color);
    }
  }, [categories, lcColor, selectedId, onSetColor]);

  // Sync color whenever the resolved category color differs from the current
  // popover color (e.g. initial render where initialColor was a default that
  // doesn't match the top user category).
  const selectedCat = categories.find((c) => c.id === selectedId);
  useEffect(() => {
    if (selectedCat && selectedCat.color.toLowerCase() !== lcColor) {
      onSetColor(selectedCat.color);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCat?.id]);
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

