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
 *   - Hold and drag across days creates a multi-day session. The pressed
 *     cell keeps its click colour, and the spanned days are marked in the
 *     default session colour. The session tile appears once a title is typed.
 *   - Items can be dragged from one day to another with framer-motion layout
 *     animations smoothing the receiving cell's reflow.
 */

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { PersonStanding, GraduationCap, Briefcase, Sparkles, Bike, Waves, Dumbbell, Snowflake, Footprints, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CellData, CellKey, CalendarEvent } from "./yearStore";
import { makeCellId, isMembershipOverlayEvent, useTeamName } from "./yearStore";
import { useUserGroups } from "@/hooks/useUserGroups";
import { useAuth } from "@/lib/auth";
import { sessionAudienceMembers, signupTabForRosterMember } from "@/lib/sessionSignupAudience";
import {
  setTeamSessionResponse,
  signupResponse,
  teamMemberMonthChip,
  useSessionAudienceResponses,
  useSyncOwnTeamSessionResponses,
  useTeamSessionResponses,
  type TeamSessionResponse,
} from "@/lib/teamSessionResponse";
import { computePopoverPosition, weekDaySessionMenuMinTop } from "./popoverPosition";
import { sameDay, setHM, addMinutes, addDays, toISOLocal, fromISOLocal, isoWeekNumber, startOfDay, startOfWeekMon, makeEventId, startEndMinsOnStartDay, calendarDayDelta, shiftIsoRangeByDays } from "./dateUtils";
import { clearLiveMonthFocus, setLiveMonthFocus, useLiveMonthFocus } from "@/lib/liveMonthFocus";
import {
  CALENDAR_MONTH_ROW_HEIGHT,
  MONTH_PAN_EDGE_WEEKS,
  MONTH_PAN_GROW,
  MONTH_ROW_HEIGHT,
  buildMonthPan,
  focusedMonthAtMidpoint,
  monthBufferExtension,
  monthFromIndex,
  monthCoastScrollTop,
  monthCreatePulseDuration,
  monthCreatePulseScroll,
  monthPredictiveBrake,
  monthReleasePlan,
  monthCreateEdgeZone,
  MONTH_CREATE_PULSE_HOLD_MS,
  MONTH_CREATE_PULSE_INTERVAL_MS,
  MONTH_RENDER_OVERSCAN,
  nextMonthOriginScroll,
  monthWheelDecaying,
  monthIndex,
  monthMountCovers,
  monthPanSpanAround,
  monthRenderRange,
  scrollTopForMonthWeek,
  snapScrollTop,
  visibleWeekRows,
  weeksBetweenMonthStarts,
} from "@/lib/monthVerticalScroll";
import {
  bandWidthResizeResult,
  eventCoversDay,
  isAllDayBandEvent,
  isMultiDayDateRange,
  isMultiDaySession,
  isoFromMenuClocks,
  isoRangeOnDates,
  continuousDragStartCol,
  contiguousColumnsWhere,
  layoutMonthWeekSpans,
  monthCellTileBudget,
  monthCreatePlaceholderLane,
  monthDragWeekPieces,
  orderedDates,
  previewSpanForGrabbedDay,
  sessionDayCount,
  sessionInclusiveEndDay,
  sessionMenuClockRange,
} from "./multiDaySessions";
import { GROUP_COLOR_PALETTE } from "../GroupColorPicker";
import { DayNoteButton } from "./DayNoteButton";
import { useCalendarTheme } from "./calendarThemePref";
import { useEntityRoster, isPlaceholderGroupName } from "@/hooks/useEntityRoster";
import {
  ColorsPanel,
  DEFAULT_SESSION_COLOR,
  getSessionDefaultColor,
  STANDARD_COLORS_NAMED,
  isSessionWhiteColor,
  sessionMonthChipChrome,
  sessionTileChrome,
  teamSessionMenuBackground,
  standardColorLabel,
} from "@/components/library/CategoryActionsMenu";
import { useMonthTileDesign } from "@/lib/month-tile-design";
import { useDistanceUnit, kmToUnit, unitLabel } from "@/lib/units";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

import { DiaryPopoverEditor, type DiaryPopoverValue } from "./DiaryPopoverEditor";
import { IOSSwitch } from "./DiaryEditFields";
import { SessionLocationField } from "./SessionLocationField";
import { SessionPopoverHeader } from "./SessionPopoverHeader";
import {
  SessionPanelDockGuides,
  SessionPanelHeaderRow,
} from "./SessionPanelDock";
import {
  SessionSignupCountBadge,
  SessionSignupParticipantsPanel,
} from "./SessionSignupParticipantsPanel";
import {
  SessionLocationMapPanel,
  type SessionLocationMapPanelHandle,
  type SessionLocationMapSearchHandoff,
} from "./SessionLocationMapPanel";
import {
  SESSION_CARD_WIDTH_PX,
  clampSessionPanelPosition,
  computeDockedPanelLeft,
  getSessionPanelDocked,
  SESSION_PANEL_DOCK_TRANSITION,
  SESSION_PANEL_GAP_PX,
  SESSION_PANEL_SHELL_CLASS,
  SESSION_PANEL_SHELL_STYLE,
  setSessionPanelDocked,
  subscribeSessionPanelDocked,
  type SessionPanelFloatPosition,
} from "./sessionPanelDockUtils";
import { useSessionMapPanelFits } from "./useSessionMapPanelFits";
import { useSessionAdjacentMenuFits } from "./useSessionAdjacentMenuFits";
import { SessionDateField } from "./SessionDateField";
import { sessionPopoverFieldClass } from "./sessionPopoverField";
import { SessionRepeatRow } from "./SessionRepeatRow";
import {
  estimateSessionSideMenuHeight,
  SESSION_SIDE_MENU_ITEM_CLASS,
  SessionSideListbox,
} from "./SessionSideListbox";
import { CalendarInfoToast } from "./CalendarInfoToast";
import { useCalendarSearchSafe } from "./CalendarSearchContext";
import { useCalendarViewActions } from "./CalendarViewActionsContext";
import { useCalendarPasteContextMenu } from "./CalendarPasteContextMenu";
import { useCalendarSessionContextMenu, SESSION_SHIFT_MARK_EVENT } from "./CalendarSessionContextMenu";
import { useCalendarWeekContextMenu } from "./CalendarWeekContextMenu";
import { SessionHoverMenu } from "./SessionHoverMenu";
import { useHoverLock } from "./hoverLock";
import { SessionDetailsContainer } from "./SessionDetailsContainer";
import { useClosePanelsForDeletedEvents } from "./useClosePanelsForDeletedEvents";
import { SessionTimeField } from "./SessionTimeField";
import { ReorderConfirmDialog } from "./ReorderConfirmDialog";
import type { ViewMode } from "./UnifiedElasticGrid";
import { copySessionSuccessMessage, duplicateSessionSuccessMessage } from "@/lib/calendarClipboard";
import {
  isEditableTarget,
  matchesShortcut,
  SHORTCUTS,
} from "@/lib/shortcuts";
import {
  SESSION_REPEAT_DEFAULT,
  buildRepeatPreviewEvents,
  buildRepeatSeriesLivePreview,
  eventIdsForDeleteScope,
  expandRepeatingEvents,
  isPersistedRepeatSeries,
  isRepeatPreviewEventId,
  sessionIsRepeatSeries,
  sharedRepeatSeriesId,
  mergeEventsWithRepeatPreview,
  resolveSessionRepeatState,
  shouldMaterializeRepeatOnSave,
  planRepeatSeriesSave,
  type RepeatLivePreview,
  type SessionDeleteScope,
  type SessionRepeatRule,
} from "@/lib/sessionRepeat";
import { eventTargetElement } from "./SessionScopeMenu";
import { SessionSeriesScopeTabs } from "./SessionSeriesScopeTabs";

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
  /** Month view settled on this month. The scroll position stays where it is. */
  onCommitFocusedMonth?: (date: Date) => void;
  onCommitText: (k: CellKey, text: string) => void;
  /** Unified event store — events created here will appear in week view too. */
  events?: CalendarEvent[];
  onUpsertEvent?: (
    patch:
      | (Partial<CalendarEvent> & Pick<CalendarEvent, "startISO" | "endISO" | "title">)
      | (Partial<CalendarEvent> & { id: string }),
  ) => CalendarEvent;
  onMoveEvent?: (id: string, patch: Partial<Pick<CalendarEvent, "startISO" | "endISO" | "allDay" | "sortIndex">>) => void;
  onDeleteEvent?: (id: string) => void;
  /** Bulk delete — used for repeat-series scoped deletes from the session panel. */
  onDeleteEvents?: (ids: string[]) => void;
  /** Flip a coach-pending session into the accepted (owner) state. */
  onAcceptCoachSession?: (id: string) => void;
  /** Reorder a sequence of event ids within a day (writes sortIndex values). */
  onReorderEvents?: (ids: string[]) => void;
  /** When the user clicks a week-number cell, zoom into that week. */
  onWeekClick?: (anchorDate: Date) => void;
  /** Cloud month-view: stacked year in the weekday-strip gutter opens year view. */
  onOpenYearView?: () => void;
  /** Externally-controlled selected day (mirrors mini-calendar). */
  selectedDate?: Date | null;
  /** Notify parent when a day cell is clicked. */
  onSelectDate?: (date: Date) => void;
  /** Sessions shift-marked across month, week, and day. */
  markedEventIds?: ReadonlySet<string>;
  onDeleteMarked?: (ids: string[]) => void;
  onClearMarks?: () => void;
  onShiftMark?: (id: string) => void;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  /** Default color for newly-created sessions (no initial color). Blue. */
  defaultNewColor?: string | null;
  /** Active team id (admin seat only). Scopes the category dropdown list. */
  teamId?: string | null;
  /** Hide spanning multi-day bars. Single-day chips stay in the cells. */
  hideMultiDayRow?: boolean;
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
  isActive = false,
}: {
  ev: CalendarEvent;
  tileDesign: string;
  unit: ReturnType<typeof useDistanceUnit>[0];
  height: number | string;
  dragging?: boolean;
  isActive?: boolean;
}) {
  const chrome = sessionTileChrome(ev.color, isActive);
  const bg = ev.color ? chrome.fill : "hsl(var(--primary) / 0.15)";
  const accent = chrome.bar;
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
        "relative overflow-hidden rounded-[3px] text-[12px] shadow-sm transition-shadow",
        isActive ? "" : "text-ink ring-1 ring-black/5",
        dragging ? "shadow-lg" : "hover:shadow-md",
      ].join(" ")}
      style={{ height, background: bg, color: chrome.fg }}
      title={ev.title}
      data-coach-pending={ev.coachPending ? "1" : undefined}
    >
      <span className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: accent }} />
      {tileDesign === "stacked" ? (
        <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-[3px]">
          <div className="flex w-1/2 items-center justify-center" style={{ background: iconHalfBg }}>
            <ActIcon className="h-5 w-5 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
          </div>
          <div
            className="flex w-1/2 min-w-0 flex-col justify-center px-2 leading-tight"
            style={{ color: isActive ? "#fff" : undefined }}
          >
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
            style={{
              fontFamily: "Helvetica, Arial, sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: isActive ? "#fff" : undefined,
            }}
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

/**
 * SortableDiaryMonthChip — single diary event chip inside a month-view day
 * cell. Wraps DiaryMonthReorderTile with dnd-kit `useSortable` so neighbors
 * smoothly slide during drag (matches week-view SortableSimpleTile feel).
 */
function SortableDiaryMonthChip({
  ev,
  tileDesign,
  unit,
  height,
  disabled,
  isActive,
  hoverLocked,
  lockedActiveId,
  cancelHoverClose,
  scheduleHoverClose,
  setHoverId,
  setHoverRect,
  setForceEditId,
}: {
  ev: CalendarEvent;
  tileDesign: string;
  unit: ReturnType<typeof useDistanceUnit>[0];
  height: number;
  disabled: boolean;
  isActive: boolean;
  hoverLocked: boolean;
  lockedActiveId: string | null;
  cancelHoverClose: () => void;
  scheduleHoverClose: () => void;
  setHoverId: (id: string | null) => void;
  setHoverRect: (r: { left: number; top: number; width: number; height: number } | null) => void;
  setForceEditId: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ev.id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: "default",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-role="item"
      data-real-event="1"
      data-event-id={ev.id}
      onMouseEnter={(e) => {
        if (hoverLocked && ev.id !== lockedActiveId) return;
        cancelHoverClose();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setHoverId(ev.id);
        setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
      }}
      onMouseLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        const goingIntoMenu = related instanceof HTMLElement && related.closest('[data-session-hover-menu="1"]');
        if (goingIntoMenu) return;
        scheduleHoverClose();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isDragging) return;
        cancelHoverClose();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setHoverId(ev.id);
        setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
        setForceEditId(ev.id);
      }}
    >
      <DiaryMonthReorderTile ev={ev} tileDesign={tileDesign} unit={unit} height={height} isActive={isActive} />
    </div>
  );
}

/**
 * DiaryMonthDndCell — wraps a diary day cell's chip list in a per-cell
 * `<DndContext>` + `<SortableContext>` so same-day reorder uses dnd-kit
 * (same setup as week-view's SimpleColumn). `<DragOverlay>` provides the
 * smooth snap-in on release. A "creating" placeholder added during session
 * logging gets the same flex+sortable slide animation as week-view.
 */
function DiaryMonthDndCell({
  sortedEvents,
  creating,
  tall,
  monthTileDesign,
  distanceUnit,
  viewerRole,
  lockedActiveId,
  hoverLocked,
  cancelHoverClose,
  scheduleHoverClose,
  setHoverId,
  setHoverRect,
  setForceEditId,
  onReorder,
}: {
  sortedEvents: CalendarEvent[];
  creating: boolean;
  tall: boolean;
  monthTileDesign: string;
  distanceUnit: ReturnType<typeof useDistanceUnit>[0];
  viewerRole: import("@/hooks/useViewerRole").ViewerRole;
  lockedActiveId: string | null;
  hoverLocked: boolean;
  cancelHoverClose: () => void;
  scheduleHoverClose: () => void;
  setHoverId: (id: string | null) => void;
  setHoverRect: (r: { left: number; top: number; width: number; height: number } | null) => void;
  setForceEditId: (id: string | null) => void;
  onReorder: (newIds: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const realIds = sortedEvents.map((e) => e.id);
  const canReorder = viewerRole === "owner" && sortedEvents.length >= 2;
  const height = tall ? 44 : 22;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = realIds.indexOf(String(active.id));
    const newI = realIds.indexOf(String(over.id));
    if (oldI < 0 || newI < 0) return;
    onReorder(arrayMove(realIds, oldI, newI));
  };
  const activeEv = activeId ? sortedEvents.find((e) => e.id === activeId) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={realIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col" style={{ gap: 2 }}>
          {sortedEvents.map((ev) => (
            <SortableDiaryMonthChip
              key={ev.id}
              ev={ev}
              tileDesign={monthTileDesign}
              unit={distanceUnit}
              height={height}
              disabled={!canReorder}
              isActive={lockedActiveId === ev.id}
              hoverLocked={hoverLocked}
              lockedActiveId={lockedActiveId}
              cancelHoverClose={cancelHoverClose}
              scheduleHoverClose={scheduleHoverClose}
              setHoverId={setHoverId}
              setHoverRect={setHoverRect}
              setForceEditId={setForceEditId}
            />
          ))}
          {creating && (
            <div
              aria-hidden
              className="pointer-events-none rounded-[3px] border-2 border-solid border-primary/60 bg-primary/10"
              style={{ height }}
            />
          )}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeEv ? (
          <DiaryMonthReorderTile ev={activeEv} tileDesign={monthTileDesign} unit={distanceUnit} height={height} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}


interface CellPos {
  row: number;
  col: number;
}

function paintMonthFocus(root: HTMLElement, year: number, month: number) {
  const cells = root.querySelectorAll<HTMLElement>("[data-month-cell]");
  for (const cell of cells) {
    const focused =
      Number(cell.dataset.calYear) === year && Number(cell.dataset.calMonth) === month;
    const selected = cell.dataset.selected === "1";
    const weekend = cell.dataset.weekend === "1";
    if (!selected) {
      cell.classList.toggle("bg-muted/40", !focused);
      cell.classList.toggle("text-muted-foreground/60", !focused);
      cell.classList.toggle("bg-muted/20", focused && weekend);
      cell.classList.toggle("bg-card", focused && !weekend);
    }
    const label = cell.querySelector<HTMLElement>("[data-month-label]");
    if (label) {
      label.classList.toggle("text-ink/70", focused);
      label.classList.toggle("text-muted-foreground/50", !focused);
    }
    const num = cell.querySelector<HTMLElement>("[data-month-num]");
    if (!num) continue;
    const showToday = num.dataset.today === "1" && focused;
    num.classList.toggle("bg-[#ED5C5C]", showToday);
    num.classList.toggle("text-white", showToday);
    num.classList.toggle("text-ink/70", !showToday && focused);
    num.classList.toggle("text-muted-foreground/50", !showToday && !focused);
  }
  const today = new Date();
  const todayFocused = today.getFullYear() === year && today.getMonth() === month;
  const todayDow = dowMon0(today);
  const columns = root.querySelectorAll<HTMLElement>("[data-dow]");
  for (const column of columns) {
    const on = todayFocused && Number(column.dataset.dow) === todayDow;
    column.classList.toggle("bg-secondary", on);
    column.classList.toggle("text-ink", on);
    column.classList.toggle("text-muted-foreground", !on);
    column.style.boxShadow = on ? "-1px 0 0 0 var(--secondary)" : "";
  }
  const yearHi = root.querySelector<HTMLElement>("[data-month-year-hi]");
  const yearLo = root.querySelector<HTMLElement>("[data-month-year-lo]");
  if (yearHi) yearHi.textContent = String(year).slice(0, 2);
  if (yearLo) yearLo.textContent = String(year).slice(2);
}

function MonthFocusPaint({ rootRef }: { rootRef: { current: HTMLElement | null } }) {
  const live = useLiveMonthFocus();
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !live) return;
    paintMonthFocus(root, live.year, live.month);
  });
  return null;
}

export function MonthGridType1({
  calId,
  year,
  month,
  data,
  seat = "individual",
  appKind = "calendar",
  onCommitFocusedMonth,
  onCommitText,
  events = [],
  onUpsertEvent,
  onMoveEvent,
  onDeleteEvent,
  onDeleteEvents,
  onAcceptCoachSession,
  onReorderEvents,
  onWeekClick,
  onOpenYearView,
  selectedDate,
  onSelectDate,
  markedEventIds,
  onDeleteMarked,
  onClearMarks,
  onShiftMark,
  memberId,
  viewerRole = "owner",
  defaultNewColor = DEFAULT_SESSION_COLOR,
  teamId = null,
  hideMultiDayRow = false,
}: MonthGridType1Props) {
  const searchSelectedId = useCalendarSearchSafe()?.selectedId ?? null;
  const darkTiles = useCalendarTheme() === "dark";
  const teamResponses = useTeamSessionResponses();
  const signupSessionIds = useMemo(
    () =>
      events
        .filter((ev) => isMembershipOverlayEvent(ev, calId) && ev.signUpEnabled)
        .map((ev) => ev.id),
    [events, calId],
  );
  useSyncOwnTeamSessionResponses(signupSessionIds);
  const { setPasteAnchorDate } = useCalendarViewActions();
  const { onContextMenu: onPasteContextMenu, overlay: pasteOverlay, toastNode: pasteToastNode } =
    useCalendarPasteContextMenu("month");
  const { onContextMenu: onWeekContextMenu, overlay: weekOverlay, toastNode: weekToastNode } =
    useCalendarWeekContextMenu("month");
  const [monthTileDesign] = useMonthTileDesign();
  const [distanceUnit] = useDistanceUnit();
  const focusYear = year;
  const focusMonth = month;
  const anchorIndex = monthIndex(year, month);
  const [span, setSpan] = useState(() => monthPanSpanAround(anchorIndex));
  const pan = useMemo(
    () => buildMonthPan(span.first, span.last),
    [span.first, span.last],
  );
  const rows = pan.weekCount;
  const days = useMemo(() => {
    const total = pan.weekCount * 7;
    return Array.from({ length: total }, (_, i) => {
      const date = addDays(pan.start, i);
      return {
        idx: i,
        row: Math.floor(i / 7),
        col: i % 7,
        date,
        dayNumber: date.getDate(),
        inMonth: true,
      };
    });
  }, [pan]);
  const [mount, setMount] = useState(() => {
    const week = pan.monthStarts.find((item) => item.index === anchorIndex)?.week ?? 0;
    return monthRenderRange(week, Math.min(pan.weekCount - 1, week + 5), pan.weekCount, 0);
  });
  const spanRef = useRef(span);
  spanRef.current = span;
  const panRef = useRef(pan);
  panRef.current = pan;
  const daysRef = useRef(days);
  daysRef.current = days;
  const mountRef = useRef(mount);
  mountRef.current = mount;
  const focusedKeyRef = useRef(anchorIndex);
  const dateInLiveMonth = (date: Date) => {
    const focused = monthFromIndex(focusedKeyRef.current);
    return date.getFullYear() === focused.year && date.getMonth() === focused.month;
  };
  const pendingPrependWeeksRef = useRef(0);
  const aligningRef = useRef(false);
  const cancelSnapRef = useRef<() => void>(() => {});
  const resumeSettleRef = useRef<() => void>(() => {});
  /** True while a month multi-day create drag owns the scroller, so week-snap stays out of the gesture. */
  const monthCreateDragActiveRef = useRef(false);
  /** True during a month pulse, so scroll events do not rebuild the grid mid-glide. */
  const monthPulseLockRef = useRef(false);
  const suppressChipLayoutRef = useRef(false);
  const syncMonthScrollRef = useRef<() => void>(() => {});
  const monthRowHeightRef = useRef(CALENDAR_MONTH_ROW_HEIGHT);
  const detachMonthSpanDragRef = useRef<(() => void) | null>(null);
  const animateMonthJumpRef = useRef<(week: number, index: number) => void>(() => {});
  const pendingMonthJumpRef = useRef<number | null>(null);
  const extendingRef = useRef(false);
  const alignedRef = useRef(false);
  const panTokenRef = useRef(0);
  const prevPropsKeyRef = useRef(`${year}-${month}`);
  const skipFocusResetRef = useRef(false);
  const skipScrollRef = useRef(false);
  const suppressMonthScrollRef = useRef(false);
  const prevSelectedTimeRef = useRef(selectedDate?.getTime() ?? 0);
  const appliedNavRef = useRef("");
  const lastScrollTopRef = useRef(0);
  const yearRef = useRef(year);
  yearRef.current = year;
  const monthRef = useRef(month);
  monthRef.current = month;
  const onCommitFocusedMonthRef = useRef(onCommitFocusedMonth);
  onCommitFocusedMonthRef.current = onCommitFocusedMonth;

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  // ───────────────────────── Focus / selection ─────────────────────────

  const [focus, setFocus] = useState<CellPos>(() => {
    const inView = (d: (typeof days)[number]) =>
      d.date.getFullYear() === year && d.date.getMonth() === month;
    const t = days.find((d) => isToday(d.date) && inView(d));
    if (t) return { row: t.row, col: t.col };
    const first = days.find((d) => inView(d) && d.date.getDate() === 1) ?? days[0]!;
    return { row: first.row, col: first.col };
  });

  // Arrow and mini-calendar jumps land on the 1st. A scroll commit keeps the cell the user is on.
  useEffect(() => {
    const navKey = `${year}-${month}`;
    if (skipFocusResetRef.current) {
      skipFocusResetRef.current = false;
      appliedNavRef.current = navKey;
      return;
    }
    if (appliedNavRef.current === navKey) return;
    const first = days.find(
      (d) => d.date.getFullYear() === year && d.date.getMonth() === month && d.date.getDate() === 1,
    );
    if (!first) return;
    appliedNavRef.current = navKey;
    setFocus({ row: first.row, col: first.col });
  }, [year, month, days]);

  // Mirror externally-controlled selected date (e.g. mini-calendar click).
  useEffect(() => {
    if (!selectedDate) return;
    const match = days.find((d) => sameDay(d.date, selectedDate));
    if (match) setFocus({ row: match.row, col: match.col });
    // Buffer growth rebuilds `days` and would pull focus back to this date mid-pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, year, month]);

  // Cmd+V uses this date. Overflow (grey) days must be included — they do
  // not update `currentDate`, so the parent would otherwise paste on the
  // previously selected in-month day.
  useEffect(() => {
    const cell = days.find((d) => d.row === focus.row && d.col === focus.col);
    if (cell) setPasteAnchorDate(cell.date);
  }, [days, focus, setPasteAnchorDate]);

  // Drag-selection (mouse range across cells)
  const dragAnchorRef = useRef<CellPos | null>(null);
  const [range, setRange] = useState<{ a: CellPos; b: CellPos } | null>(null);
  /** Live span while the pointer is dragging across a second day. The open create menu takes over after release. */
  const [spanPreview, setSpanPreview] = useState<{ start: Date; end: Date } | null>(null);
  const [spanDragActive, setSpanDragActive] = useState(false);

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

  useEffect(() => () => detachMonthSpanDragRef.current?.(), []);

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
    categoryId?: string | null;
    /** When set, this popover is editing a unified CalendarEvent. */
    eventId?: string;
    /** Snapshot of entity session description when the editor opened. */
    initialDescription?: string | null;
    /** Snapshot of entity roster group when the editor opened. */
    appGroupId?: string | null;
    pendingStart?: Date;
    pendingEnd?: Date;
  } | null>(null);
  /** Survives PopoverEditor unmount so side panels can restore after drag-drop reopen. */
  const sessionSidePanelsRef = useRef<{
    eventId: string | null;
    signUpEnabled: boolean;
    participantsPanelOpen: boolean;
    locationMapOpen: boolean;
  }>({
    eventId: null,
    signUpEnabled: false,
    participantsPanelOpen: false,
    locationMapOpen: false,
  });
  const closeSessionContextMenuRef = useRef<() => void>(() => {});
  const resetSessionSidePanels = useCallback((
    eventId: string | null = null,
    seed?: { signUpEnabled?: boolean },
  ) => {
    sessionSidePanelsRef.current = {
      eventId,
      signUpEnabled: !!seed?.signUpEnabled,
      participantsPanelOpen: false,
      locationMapOpen: false,
    };
  }, []);
  const [createPreviewTime, setCreatePreviewTime] = useState<{ startMin: number; endMin: number } | null>(null);
  const pendingMenuDateRef = useRef<Date | null>(null);
  const [repeatLivePreview, setRepeatLivePreview] = useState<RepeatLivePreview | null>(null);
  const displayEvents = useMemo(
    () => mergeEventsWithRepeatPreview(events, repeatLivePreview),
    [events, repeatLivePreview],
  );
  const openPopoverAt = useCallback(
    (pos: CellPos, anchor: HTMLElement) => {
      const cell = days.find((d) => d.row === pos.row && d.col === pos.col);
      if (!cell) return;
      resetSessionSidePanels(null);
      closeSessionContextMenuRef.current();
      setCreatePreviewTime({ startMin: 9 * 60, endMin: 10 * 60 });
      setPopover({
        pos,
        rect: anchor.getBoundingClientRect(),
        editIdx: -1,
        initialText: "",
        initialColor: appKind === "diary" ? DEFAULT_SESSION_COLOR : getSessionDefaultColor(),
        categoryId: null,
      });
    },
    [appKind, days, resetSessionSidePanels],
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
      resetSessionSidePanels(null);
      setCreatePreviewTime(null);
      setPopover({
        pos,
        rect: cellAnchorRect(anchor),
        editIdx: idx,
        initialText: text,
        initialColor: color,
        categoryId: null,
      });
    },
    [cellAnchorRect, resetSessionSidePanels],
  );

  const openEventEditor = useCallback(
    (
      pos: CellPos,
      ev: CalendarEvent,
      anchor: HTMLElement,
      opts?: { restoreSidePanels?: boolean },
    ) => {
      if (!opts?.restoreSidePanels || sessionSidePanelsRef.current.eventId !== ev.id) {
        resetSessionSidePanels(ev.id, { signUpEnabled: !!ev.signUpEnabled });
      }
      closeSessionContextMenuRef.current();
      setCreatePreviewTime(null);
      setPopover({
        pos,
        rect: cellAnchorRect(anchor),
        editIdx: -1,
        initialText: ev.title,
        initialColor: ev.color,
        categoryId: ev.categoryId ?? null,
        eventId: ev.id,
        initialDescription: ev.description ?? null,
        appGroupId: ev.appGroupId ?? null,
      });
    },
    [cellAnchorRect, resetSessionSidePanels],
  );

  const reanchorPopoverToDate = useCallback((date: Date) => {
    const cell = days.find((d) => d.inMonth && sameDay(d.date, date));
    if (!cell) {
      pendingMenuDateRef.current = date;
      onSelectDate?.(date);
      return;
    }
    const el = containerRef.current?.querySelector<HTMLElement>(
      monthDayCellSelector({ row: cell.row, col: cell.col }),
    );
    if (!el) {
      pendingMenuDateRef.current = date;
      suppressMonthScrollRef.current = true;
      onSelectDate?.(date);
      return;
    }
    const rect = el.getBoundingClientRect();
    pendingMenuDateRef.current = null;
    setPopover((prev) =>
      prev ? { ...prev, pos: { row: cell.row, col: cell.col }, rect } : prev,
    );
    suppressMonthScrollRef.current = true;
    onSelectDate?.(date);
  }, [days, onSelectDate]);

  useEffect(() => {
    const target = pendingMenuDateRef.current;
    if (!target) return;
    const cell = days.find((d) => d.inMonth && sameDay(d.date, target));
    if (!cell) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      monthDayCellSelector({ row: cell.row, col: cell.col }),
    );
    if (!el) return;
    pendingMenuDateRef.current = null;
    const rect = el.getBoundingClientRect();
    setPopover((prev) =>
      prev ? { ...prev, pos: { row: cell.row, col: cell.col }, rect } : prev,
    );
  }, [days, year, month]);

  const closePopover = useCallback(() => {
    sessionSidePanelsRef.current = {
      ...sessionSidePanelsRef.current,
      participantsPanelOpen: false,
      locationMapOpen: false,
    };
    setCreatePreviewTime(null);
    setRepeatLivePreview(null);
    setPopover(null);
  }, []);

  const {
    onSessionContextMenu,
    closeMenu: closeSessionContextMenu,
    overlay: sessionContextOverlay,
    toastNode: sessionContextToastNode,
    activeEventId: sessionContextEventId,
  } = useCalendarSessionContextMenu("month", {
    onOpen: () => {
      closePopover();
    },
    onDelete: (id) => onDeleteEvent?.(id),
    getMarkedIds: () => [...(markedEventIds ?? [])],
    onDeleteMany: (ids) => onDeleteMarked?.(ids),
    onClearMarks: () => onClearMarks?.(),
  });
  closeSessionContextMenuRef.current = closeSessionContextMenu;

  useEffect(() => {
    if (appKind === "diary") return;
    const onShift = () => {
      const id = popover?.eventId ?? sessionContextEventId ?? null;
      if (id && !isRepeatPreviewEventId(id)) onShiftMark?.(id);
      if (popover) closePopover();
      closeSessionContextMenu();
    };
    window.addEventListener(SESSION_SHIFT_MARK_EVENT, onShift);
    return () => window.removeEventListener(SESSION_SHIFT_MARK_EVENT, onShift);
  }, [appKind, closePopover, closeSessionContextMenu, onShiftMark, popover, sessionContextEventId]);

  // Guarded close — only nulls the popover if it still points at the
  // same target (eventId for edits, or row/col for new-cell drafts).
  // Lets a deferred commit from the previous tile's editor land safely
  // without closing the popover the user just opened on another tile.
  const closePopoverIfMatching = useCallback(
    (eventId: string | undefined, pos: CellPos) => {
      setPopover((current) => {
        if (!current) return null;
        const closing = eventId
          ? current.eventId === eventId
          : !current.eventId && current.pos.row === pos.row && current.pos.col === pos.col;
        if (!closing) return current;
        sessionSidePanelsRef.current = {
          ...sessionSidePanelsRef.current,
          participantsPanelOpen: false,
          locationMapOpen: false,
        };
        setCreatePreviewTime(null);
        setRepeatLivePreview(null);
        return null;
      });
    },
    [],
  );

  useClosePanelsForDeletedEvents(events, {
    hoverId,
    setForceEditId,
    setLockedId,
    setDetailsEvId,
    setHoverId,
    setHoverRect,
    setPopover,
  });

  // ───────────────────────── Keyboard ─────────────────────────

  const containerRef = useRef<HTMLDivElement | null>(null);
  const monthHeaderRef = useRef<HTMLDivElement | null>(null);
  const monthScrollerRef = useRef<HTMLDivElement | null>(null);

  // Reserve scrollbar gutter on the weekday header row so its column dividers
  // line up exactly with the body grid's dividers when a vertical scrollbar
  // is present.
  useLayoutEffect(() => {
    const scroller = monthScrollerRef.current;
    const header = monthHeaderRef.current;
    if (!scroller || !header) return;
    const apply = () => {
      const w = scroller.offsetWidth - scroller.clientWidth;
      header.style.paddingRight = `${Math.max(0, w)}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);

  // Calendar days fit four tiles. Diary keeps the taller row for its tiles.
  const monthRowHeight = appKind === "diary" ? MONTH_ROW_HEIGHT : CALENDAR_MONTH_ROW_HEIGHT;
  monthRowHeightRef.current = monthRowHeight;

  useLayoutEffect(() => {
    const el = monthScrollerRef.current;
    if (!el) return;
    extendingRef.current = false;
    const startPendingMonthJump = () => {
      const jump = pendingMonthJumpRef.current;
      if (jump == null) return false;
      const week = pan.monthStarts.find((item) => item.index === jump)?.week;
      if (week == null) return false;
      pendingMonthJumpRef.current = null;
      animateMonthJumpRef.current(week, jump);
      return true;
    };

    if (pendingPrependWeeksRef.current) {
      const added = pendingPrependWeeksRef.current;
      pendingPrependWeeksRef.current = 0;
      cancelSnapRef.current();
      aligningRef.current = true;
      el.scrollTop += added * monthRowHeight;
      aligningRef.current = false;
      lastScrollTopRef.current = el.scrollTop;
      const shifted = {
        start: mountRef.current.start + added,
        end: mountRef.current.end + added,
      };
      mountRef.current = shifted;
      setMount(shifted);
      setFocus((f) => ({ row: f.row + added, col: f.col }));
      if (!startPendingMonthJump()) resumeSettleRef.current();
      return;
    }

    if (startPendingMonthJump()) return;

    const target = monthIndex(year, month);
    if (target < span.first || target > span.last) {
      const next = monthPanSpanAround(target);
      spanRef.current = next;
      setSpan(next);
      return;
    }

    const propsKey = `${year}-${month}`;
    const propsChanged = prevPropsKeyRef.current !== propsKey;
    const selectedTime = selectedDate?.getTime() ?? 0;
    const selectedChanged = prevSelectedTimeRef.current !== selectedTime;
    if (skipScrollRef.current || suppressMonthScrollRef.current) {
      skipScrollRef.current = false;
      suppressMonthScrollRef.current = false;
      prevPropsKeyRef.current = propsKey;
      prevSelectedTimeRef.current = selectedTime;
      return;
    }
    if (alignedRef.current && !propsChanged && !selectedChanged) return;

    const week = pan.monthStarts.find((item) => item.index === target)?.week ?? 0;
    panTokenRef.current += 1;
    cancelSnapRef.current();
    aligningRef.current = true;
    el.scrollTop = scrollTopForMonthWeek(week, monthRowHeight);
    aligningRef.current = false;
    resumeSettleRef.current();
    lastScrollTopRef.current = el.scrollTop;
    focusedKeyRef.current = target;
    alignedRef.current = true;
    prevPropsKeyRef.current = propsKey;
    prevSelectedTimeRef.current = selectedTime;
    const nextMonth = monthFromIndex(target);
    setLiveMonthFocus(nextMonth.year, nextMonth.month);
    const vis = visibleWeekRows(el.scrollTop, el.clientHeight, monthRowHeight, pan.weekCount);
    const nextMount = monthRenderRange(vis.start, vis.end, pan.weekCount, 0);
    if (nextMount.start !== mountRef.current.start || nextMount.end !== mountRef.current.end) {
      mountRef.current = nextMount;
      setMount(nextMount);
    }
  }, [year, month, selectedDate, span.first, span.last, pan, monthRowHeight]);

  useEffect(() => {
    const el = monthScrollerRef.current;
    if (!el) return;
    const commit = () => {
      const settled = monthFromIndex(focusedKeyRef.current);
      if (settled.year === yearRef.current && settled.month === monthRef.current) return;
      skipFocusResetRef.current = true;
      skipScrollRef.current = true;
      onCommitFocusedMonthRef.current?.(new Date(settled.year, settled.month, 1));
    };
    let watchRaf = 0;
    let snapRaf = 0;
    let releaseTimer = 0;
    let brakeRaf = 0;
    let watching = false;
    let snapping = false;
    let written = -1;
    let authoritative = false;
    let lockFocus: number | null = null;
    const stopMotion = () => {
      watching = false;
      snapping = false;
      brakeActive = false;
      authoritative = false;
      lockFocus = null;
      written = -1;
      if (watchRaf) cancelAnimationFrame(watchRaf);
      if (snapRaf) cancelAnimationFrame(snapRaf);
      if (releaseTimer) window.clearTimeout(releaseTimer);
      if (brakeRaf) cancelAnimationFrame(brakeRaf);
      watchRaf = 0;
      snapRaf = 0;
      releaseTimer = 0;
      brakeRaf = 0;
    };
    cancelSnapRef.current = stopMotion;
    const publishFocus = (scrollTop: number, viewH: number) => {
      const focused = focusedMonthAtMidpoint(
        scrollTop,
        viewH,
        monthRowHeight,
        panRef.current.monthStarts,
      );
      if (focused === focusedKeyRef.current) return;
      focusedKeyRef.current = focused;
      const next = monthFromIndex(focused);
      setLiveMonthFocus(next.year, next.month);
    };
    const finishSnap = () => {
      snapping = false;
      brakeActive = false;
      authoritative = false;
      written = -1;
      snapRaf = 0;
      suppressUntil = performance.now() + 80;
      if (lockFocus != null) {
        const index = lockFocus;
        lockFocus = null;
        focusedKeyRef.current = index;
        const landed = monthFromIndex(index);
        setLiveMonthFocus(landed.year, landed.month);
      } else {
        publishFocus(el.scrollTop, el.clientHeight);
      }
      commit();
    };
    // The trackpad pans natively until the finger lifts. At that moment the
    // release speed picks the week line, and one slowdown glides onto it.
    let endTimer = 0;
    let suppressUntil = 0;
    let rowPx = monthRowHeight;
    let velocity = 0;
    let lastSampleTs = 0;
    let lastWheelTs = 0;
    let wheelCount = 0;
    let releaseTop = 0;
    let releaseVelocity = 0;
    let coastLockUntil = 0;
    let brakeActive = false;
    let brakePeak = 0;
    let brakeDir: -1 | 1 = 1;
    let decaying = false;
    const wheelDeltas: number[] = [];
    const readRowHeight = () => {
      const probe = el.querySelector<HTMLElement>("[data-month-week]");
      const measured = probe?.getBoundingClientRect().height ?? 0;
      if (measured > 40) rowPx = measured;
      return rowPx;
    };
    const animateTo = (target: number, glide: "row" | "month", durationMs?: number) => {
      window.clearTimeout(endTimer);
      if (snapRaf) cancelAnimationFrame(snapRaf);
      const from = el.scrollTop;
      const dist = target - from;
      if (Math.abs(dist) <= 0.5) {
        if (Math.abs(dist) > 0.05) el.scrollTop = target;
        finishSnap();
        return;
      }
      const t0 = performance.now();
      // Week view: min(240, max(110, distance * 1.05)). The row snap is a
      // little shorter so it lands sooner. The pan itself is untouched.
      const dur =
        durationMs ??
        (glide === "month"
          ? Math.min(420, Math.max(160, Math.abs(dist) * 0.42))
          : Math.min(210, Math.max(96, Math.abs(dist) * 0.9)));
      snapping = true;
      written = from;
      const step = (now: number) => {
        if (!snapping) return;
        if (!authoritative && written >= 0 && Math.abs(el.scrollTop - written) > 1.5) {
          snapping = false;
          brakeActive = false;
          written = -1;
          snapRaf = 0;
          window.clearTimeout(endTimer);
          endTimer = window.setTimeout(settle, 180);
          return;
        }
        const t = Math.min(1, (now - t0) / dur);
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);
        const next = t < 1 ? from + dist * ease : target;
        written = next;
        el.scrollTop = next;
        if (lockFocus == null) publishFocus(next, el.clientHeight);
        if (t < 1) snapRaf = requestAnimationFrame(step);
        else finishSnap();
      };
      snapRaf = requestAnimationFrame(step);
    };
    const animateCoast = (plan: { target: number; durationMs: number }) => {
      window.clearTimeout(endTimer);
      if (snapRaf) cancelAnimationFrame(snapRaf);
      const from = el.scrollTop;
      const dist = plan.target - from;
      if (plan.durationMs <= 0 || Math.abs(dist) <= 0.5) {
        if (Math.abs(dist) > 0.05) el.scrollTop = plan.target;
        finishSnap();
        return;
      }
      const t0 = performance.now();
      const dur = plan.durationMs;
      snapping = true;
      written = from;
      const step = (now: number) => {
        if (!snapping) return;
        if (
          !authoritative &&
          now > coastLockUntil &&
          written >= 0 &&
          Math.abs(el.scrollTop - written) > 1.5
        ) {
          snapping = false;
          brakeActive = false;
          written = -1;
          snapRaf = 0;
          window.clearTimeout(endTimer);
          endTimer = window.setTimeout(settle, 180);
          return;
        }
        const elapsed = now - t0;
        const next = monthCoastScrollTop(from, plan.target, elapsed, dur);
        written = next;
        el.scrollTop = next;
        if (lockFocus == null) publishFocus(next, el.clientHeight);
        if (elapsed >= dur) finishSnap();
        else snapRaf = requestAnimationFrame(step);
      };
      snapRaf = requestAnimationFrame(step);
    };
    const travelDir = (): -1 | 1 => (scrollDir < 0 ? -1 : 1);
    const releasePlan = (from: number, sampledVelocity: number) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      return monthReleasePlan(from, sampledVelocity, from, readRowHeight(), max, travelDir());
    };
    const playPlan = (
      plan: { target: number; durationMs: number; velocity: number; curve?: "coast" | "ease" } | null,
    ) => {
      if (!plan || plan.durationMs <= 0) return;
      if (plan.curve === "ease") {
        animateTo(plan.target, "row", plan.durationMs);
        return;
      }
      coastLockUntil = performance.now() + 100;
      animateCoast(plan);
    };
    const beginRelease = (count: number) => {
      if (aligningRef.current || brakeActive || (snapping && authoritative)) return;
      if (snapping) {
        snapping = false;
        brakeActive = false;
        written = -1;
        if (snapRaf) cancelAnimationFrame(snapRaf);
        snapRaf = 0;
      }
      const from = el.scrollTop;
      const plan = count >= 2
        ? monthReleasePlan(releaseTop, releaseVelocity, from, readRowHeight(), Math.max(0, el.scrollHeight - el.clientHeight), travelDir())
        : releasePlan(from, 0);
      playPlan(plan);
    };
    const settle = () => {
      if (snapping || aligningRef.current || brakeActive) return;
      const sampled = performance.now() - lastSampleTs < 80 ? velocity : 0;
      playPlan(releasePlan(el.scrollTop, sampled));
    };
    const markScrolling = () => {
      window.clearTimeout(endTimer);
      endTimer = window.setTimeout(settle, 180);
    };
    resumeSettleRef.current = markScrolling;
    const jumpToWeek = (week: number, index: number) => {
      stopMotion();
      authoritative = true;
      lockFocus = index;
      focusedKeyRef.current = index;
      const landed = monthFromIndex(index);
      setLiveMonthFocus(landed.year, landed.month);
      const targetTop = scrollTopForMonthWeek(week, monthRowHeight);
      const built = panRef.current;
      const vis = visibleWeekRows(el.scrollTop, el.clientHeight, monthRowHeight, built.weekCount);
      const dest = visibleWeekRows(targetTop, el.clientHeight, monthRowHeight, built.weekCount);
      const cover = {
        start: Math.max(0, Math.min(vis.start, dest.start) - 2),
        end: Math.min(built.weekCount - 1, Math.max(vis.end, dest.end) + 2),
      };
      if (cover.start !== mountRef.current.start || cover.end !== mountRef.current.end) {
        mountRef.current = cover;
        setMount(cover);
      }
      animateTo(targetTop, "month");
    };
    animateMonthJumpRef.current = jumpToWeek;
    let syncRaf = 0;
    let scrollDir: -1 | 0 | 1 = 0;
    const syncFromScroll = () => {
      if (aligningRef.current || snapping) return;
      const scrollTop = el.scrollTop;
      const viewH = el.clientHeight;
      publishFocus(scrollTop, viewH);
      const built = panRef.current;
      const vis = visibleWeekRows(scrollTop, viewH, monthRowHeight, built.weekCount);
      const current = mountRef.current;
      if (!monthMountCovers(vis.start, vis.end, current.start, current.end)) {
        const nextMount = monthRenderRange(vis.start, vis.end, built.weekCount, scrollDir);
        if (nextMount.start !== current.start || nextMount.end !== current.end) {
          mountRef.current = nextMount;
          setMount(nextMount);
        }
      }
      const ext = monthBufferExtension(
        scrollTop,
        viewH,
        built.weekCount,
        monthRowHeight,
        MONTH_PAN_EDGE_WEEKS,
      );
      if (!extendingRef.current && (ext.prepend || ext.append)) {
        extendingRef.current = true;
        const cur = spanRef.current;
        const nextSpan = {
          first: cur.first - (ext.prepend ? MONTH_PAN_GROW : 0),
          last: cur.last + (ext.append ? MONTH_PAN_GROW : 0),
        };
        if (ext.prepend) {
          pendingPrependWeeksRef.current += weeksBetweenMonthStarts(
            monthFromIndex(nextSpan.first),
            monthFromIndex(cur.first),
          );
        }
        spanRef.current = nextSpan;
        setSpan(nextSpan);
      }
      lastScrollTopRef.current = scrollTop;
    };
    syncMonthScrollRef.current = () => {
      if (monthPulseLockRef.current) return;
      syncFromScroll();
    };
    const onScroll = () => {
      if (aligningRef.current) return;
      const scrollTop = el.scrollTop;
      // The title and the side calendar follow the month under the viewport,
      // including while a glide is running. Publishing the glide's destination
      // early makes them jump ahead and then flash back.
      if (monthCreateDragActiveRef.current && monthPulseLockRef.current) return;
      publishFocus(scrollTop, el.clientHeight);
      if (monthCreateDragActiveRef.current) {
        if (Math.abs(scrollTop - lastScrollTopRef.current) >= 0.5) {
          scrollDir =
            scrollTop > lastScrollTopRef.current
              ? 1
              : scrollTop < lastScrollTopRef.current
                ? -1
                : scrollDir;
          lastScrollTopRef.current = scrollTop;
          if (!syncRaf) {
            syncRaf = requestAnimationFrame(() => {
              syncRaf = 0;
              syncFromScroll();
            });
          }
        }
        return;
      }
      if (snapping) {
        scrollDir = scrollTop > lastScrollTopRef.current ? 1 : scrollTop < lastScrollTopRef.current ? -1 : scrollDir;
        lastScrollTopRef.current = scrollTop;
        return;
      }
      if (Math.abs(scrollTop - lastScrollTopRef.current) < 0.5) return;
      const now = performance.now();
      const dt = now - lastSampleTs;
      const instant = (scrollTop - lastScrollTopRef.current) / (dt > 0 && dt < 80 ? dt : 16);
      velocity = lastSampleTs === 0 || dt >= 80 ? instant : velocity * 0.4 + instant * 0.6;
      lastSampleTs = now;
      if (wheelCount > 0 && now - lastWheelTs < 24) {
        releaseTop = scrollTop;
        releaseVelocity = velocity;
      }
      scrollDir = scrollTop > lastScrollTopRef.current ? 1 : scrollTop < lastScrollTopRef.current ? -1 : scrollDir;
      lastScrollTopRef.current = scrollTop;
      markScrolling();
      if (decaying && wheelCount >= 1) tryBrakeBeforeUpper();
      if (syncRaf) return;
      syncRaf = requestAnimationFrame(() => {
        syncRaf = 0;
        syncFromScroll();
      });
    };
    // While a coast is slowing, and its rest would fall in the upper part of
    // a row, glide onto the line before that part. The line is still ahead,
    // so the glide only decelerates — it does not turn around.
    const startPredictiveBrake = (plan: { target: number; durationMs: number }) => {
      const latest = wheelDeltas[wheelDeltas.length - 1] ?? 1;
      brakePeak = Math.max(1, Math.abs(latest));
      brakeDir = plan.target >= el.scrollTop ? 1 : -1;
      brakeActive = true;
      window.clearTimeout(endTimer);
      if (releaseTimer) window.clearTimeout(releaseTimer);
      releaseTimer = 0;
      if (brakeRaf) cancelAnimationFrame(brakeRaf);
      brakeRaf = 0;
      wheelCount = 0;
      coastLockUntil = performance.now() + 180;
      animateCoast(plan);
    };
    const tryBrakeBeforeUpper = () => {
      if (snapping || aligningRef.current || !decaying || Math.abs(velocity) < 0.05) return false;
      const plan = monthPredictiveBrake(
        el.scrollTop,
        velocity,
        readRowHeight(),
        Math.max(0, el.scrollHeight - el.clientHeight),
      );
      if (!plan) return false;
      startPredictiveBrake(plan);
      return true;
    };
    const armBrakeWatch = () => {
      if (brakeRaf) cancelAnimationFrame(brakeRaf);
      const tick = () => {
        brakeRaf = 0;
        if (snapping || wheelCount < 1) return;
        const since = performance.now() - lastWheelTs;
        if (since < 16) {
          brakeRaf = requestAnimationFrame(tick);
          return;
        }
        if (!tryBrakeBeforeUpper() && since < 140) brakeRaf = requestAnimationFrame(tick);
      };
      brakeRaf = requestAnimationFrame(tick);
    };
    const onScrollEnd = () => {
      if (snapping || releaseTimer || aligningRef.current || performance.now() < suppressUntil) return;
      window.clearTimeout(endTimer);
      endTimer = window.setTimeout(settle, 48);
    };
    // A new finger gesture drops the snap so the browser can track it.
    // Inertia left over from a brake is swallowed, so the glide can finish
    // on the week line without the trackpad pushing past it and back.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const node = e.target;
      if (!(node instanceof Node) || !el.contains(node)) return;
      if (node instanceof Element && node.closest("textarea, input, [contenteditable='true']")) return;
      if (e.deltaY === 0) return;
      const now = performance.now();
      if (brakeActive && snapping) {
        const sameDir = e.deltaY * brakeDir > 0;
        if (sameDir && Math.abs(e.deltaY) < brakePeak * 0.75) {
          if (e.cancelable) e.preventDefault();
          return;
        }
        brakeActive = false;
        snapping = false;
        authoritative = false;
        lockFocus = null;
        written = -1;
        if (snapRaf) cancelAnimationFrame(snapRaf);
        snapRaf = 0;
      } else if (snapping) {
        snapping = false;
        brakeActive = false;
        authoritative = false;
        lockFocus = null;
        written = -1;
        if (snapRaf) cancelAnimationFrame(snapRaf);
        snapRaf = 0;
      }
      if (wheelCount === 0 || now - lastWheelTs > 220) {
        wheelCount = 0;
        wheelDeltas.length = 0;
      }
      wheelCount += 1;
      wheelDeltas.push(e.deltaY);
      if (wheelDeltas.length > 14) wheelDeltas.shift();
      decaying = monthWheelDecaying(wheelDeltas);
      lastWheelTs = now;
      releaseTop = el.scrollTop;
      releaseVelocity = velocity;
      if (decaying && !aligningRef.current && !snapping) {
        const plan = monthPredictiveBrake(
          el.scrollTop,
          velocity,
          readRowHeight(),
          Math.max(0, el.scrollHeight - el.clientHeight),
        );
        if (plan && e.cancelable) {
          e.preventDefault();
          startPredictiveBrake(plan);
          return;
        }
      }
      if (releaseTimer) window.clearTimeout(releaseTimer);
      armBrakeWatch();
      releaseTimer = window.setTimeout(() => {
        releaseTimer = 0;
        const count = wheelCount;
        wheelCount = 0;
        beginRelease(count);
      }, 40);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScrollEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(() => {
      const next = readRowHeight();
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      if (!snapping && Math.abs(el.scrollTop - snapScrollTop(el.scrollTop, next, max)) > 0.5) {
        animateTo(snapScrollTop(el.scrollTop, next, max), "row");
        return;
      }
      onScroll();
    });
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
      window.clearTimeout(endTimer);
      if (syncRaf) cancelAnimationFrame(syncRaf);
      stopMotion();
      cancelSnapRef.current = () => {};
      resumeSettleRef.current = () => {};
      animateMonthJumpRef.current = () => {};
      syncMonthScrollRef.current = () => {};
      monthPulseLockRef.current = false;
      clearLiveMonthFocus();
    };
  }, []);

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
        let r = focus.row + dr;
        let c = focus.col + dc;
        if (c < 0) {
          c = 6;
          r -= 1;
        } else if (c > 6) {
          c = 0;
          r += 1;
        }
        if (r < 0 || r > rows - 1) return;
        const next = { row: r, col: c };
        setFocus(next);
        const day = days.find((cell) => cell.row === next.row && cell.col === next.col);
        if (day) setPasteAnchorDate(day.date);
        const focused = monthFromIndex(focusedKeyRef.current);
        if (
          day &&
          day.date.getFullYear() === focused.year &&
          day.date.getMonth() === focused.month
        ) {
          suppressMonthScrollRef.current = true;
          onSelectDate?.(day.date);
        }
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
  }, [days, focus, onSelectDate, openPopoverAt, popover, rows, setPasteAnchorDate]);

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
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const dragPointerRef = useRef({ x: 0, y: 0 });
  const dragHitRafRef = useRef<number | null>(null);
  const sessionEdgePulseRef = useRef<MonthEdgePulse | null>(null);
  const sessionPulseFrameRef = useRef<(hit: { row: number; col: number } | null) => void>(() => {});
  const sessionPulseEndRef = useRef<() => void>(() => {});
  const sessionDropPendingRef = useRef<(() => void) | null>(null);
  const sessionEdgePulse = () => {
    if (!sessionEdgePulseRef.current) {
      sessionEdgePulseRef.current = createMonthEdgePulse({
        scroller: () => monthScrollerRef.current,
        rowHeight: () => monthRowHeightRef.current,
        weekCount: () => panRef.current.weekCount,
        monthStarts: () => panRef.current.monthStarts,
        getMount: () => mountRef.current,
        setMount: (next) => {
          mountRef.current = next;
          suppressChipLayoutRef.current = true;
          flushSync(() => setMount(next));
          suppressChipLayoutRef.current = false;
        },
        lock: monthPulseLockRef,
        sync: () => syncMonthScrollRef.current(),
        onFrame: (hit) => sessionPulseFrameRef.current(hit),
        onPulseEnd: () => sessionPulseEndRef.current(),
      });
    }
    return sessionEdgePulseRef.current;
  };
  useEffect(() => () => sessionEdgePulseRef.current?.stop(), []);
  const suppressClickAfterDragRef = useRef(false);
  /** Set on pointerdown when switching from another open session so the trailing click does not toggle the new menu closed. */
  const switchedSessionOnPointerRef = useRef(false);
  const popoverEventIdRef = useRef<string | null>(null);
  popoverEventIdRef.current = popover?.eventId ?? null;
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

  // Pointer-drag for the "creating" placeholder chip — lets the user drag
  // an in-progress new session to a different day before committing, mirroring
  // week/day view. Mirrors existing-chip drag, but on drop it only moves the
  // popover anchor (no event exists yet).
  const creatingDragStartRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    chipWidth: number;
    chipHeight: number;
    fromPos: CellPos;
  } | null>(null);
  const [creatingDrag, setCreatingDrag] = useState<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
    chipWidth: number;
    chipHeight: number;
    color: string | null;
    title: string;
    tall: boolean;
    targetPos: CellPos | null;
    moved: boolean;
  } | null>(null);
  const creatingDragRef = useRef(creatingDrag);
  useEffect(() => {
    creatingDragRef.current = creatingDrag;
  }, [creatingDrag]);
  const creatingGhostRef = useRef<HTMLDivElement | null>(null);
  const creatingPointerRef = useRef({ x: 0, y: 0 });
  const creatingHitRafRef = useRef<number | null>(null);

  // Diary reorder confirmation state.
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [stravaBlocked, setStravaBlocked] = useState(false);
  // Delays the confirm/strava dialog ~300ms after drop so the dnd-kit
  // dropAnimation snap-in finishes first; the modal then slides up on top
  // of the already-reordered list (matches week-view UX).
  const [modalReady, setModalReady] = useState(false);
  const modalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Calendar (non-diary) cross-day drop: holds the deferred unmount of the
  // floating clone so the CSS snap-in (`landing` transition) can play.
  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
  }, []);
  const scheduleModalOpen = useCallback(() => {
    if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    modalTimerRef.current = setTimeout(() => setModalReady(true), 300);
  }, []);

  // Diary-only: triggered by dnd-kit onDragEnd inside DiaryMonthDndCell.
  // Mirrors the week-view (SimpleColumn) flow: arrayMove → check Strava →
  // set pendingOrder + schedule modal.
  const handleDiaryReorder = useCallback(
    (dayEvents: CalendarEvent[], newIds: string[]) => {
      const oldIds = dayEvents.map((e) => e.id);
      const unchanged = newIds.length === oldIds.length && newIds.every((id, i) => id === oldIds[i]);
      if (unchanged) return;
      const movedStrava = newIds.some(
        (id, i) => id !== oldIds[i] && dayEvents.find((e) => e.id === id)?.stravaActivityId != null,
      );
      if (movedStrava) {
        setStravaBlocked(true);
      } else {
        setPendingOrder(newIds);
      }
      scheduleModalOpen();
    },
    [scheduleModalOpen],
  );





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
          if (isMultiDaySession(start, end)) {
            const fromDate = new Date(from.year, from.month, from.day);
            const toDate = new Date(toKey.year, toKey.month, toKey.day);
            const delta = calendarDayDelta(fromDate, toDate);
            if (delta === 0) return;
            onMoveEvent(ev.id, shiftIsoRangeByDays(ev.startISO, ev.endISO, delta));
            return;
          }
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

    const resolveDropTarget = (clientX: number, clientY: number, eventId: string, originalStartISO: string) => {
      let targetDate: Date | null = null;
      let dayKey: string | null = null;
      let insertIndex = 0;
      const cell = monthCellFromPoint(clientX, clientY);
      dayKey = cell?.getAttribute("data-day-key") ?? null;
      const posStr = cell?.getAttribute("data-cell-pos") ?? null;
      // Past Sunday, or left of Monday, still belongs to this week row:
      // the next columns are the following Monday, the previous column is Sunday.
      const overflowDate = (() => {
        if (cell) return null;
        const grid = containerRef.current?.querySelector<HTMLElement>("[data-month-grid]");
        const probe = grid?.querySelector<HTMLElement>('[data-cell-pos="0-0"]');
        if (!grid || !probe) return null;
        const gridRect = grid.getBoundingClientRect();
        const cellRect = probe.getBoundingClientRect();
        if (clientY < gridRect.top || clientY >= gridRect.bottom) return null;
        if (cellRect.width <= 0 || cellRect.height <= 0) return null;
        const row = Math.floor((clientY - gridRect.top) / cellRect.height);
        const monday = days[row * 7]?.date;
        if (!monday) return null;
        const col = Math.floor((clientX - cellRect.left) / cellRect.width);
        if (col >= 0 && col <= 6) return null;
        if (col < -7 || col > 13) return null;
        return addDays(startOfDay(monday), col);
      })();
      if (cell && posStr) {
        const [rowS, colS] = posStr.split("-");
        const r = Number(rowS);
        const c = Number(colS);
        const d = days.find((day) => day.row === r && day.col === c);
        if (d) {
          targetDate = d.date;
          if (!dayKey) {
            dayKey = makeCellId(calId, {
              year: d.date.getFullYear(),
              month: d.date.getMonth(),
              day: d.date.getDate(),
              session: 0,
            });
          }
          const movedKey = Date.parse(originalStartISO);
          const sorted = eventsRef
            .filter((ev) => ev.id !== eventId && sameDay(fromISOLocal(ev.startISO), d.date))
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
      } else if (overflowDate) {
        targetDate = overflowDate;
        dayKey = makeCellId(calId, {
          year: overflowDate.getFullYear(),
          month: overflowDate.getMonth(),
          day: overflowDate.getDate(),
          session: 0,
        });
      }
      return { targetDate, dayKey, insertIndex };
    };

    const scheduleDropTargetUpdate = () => {
      if (dragHitRafRef.current != null) return;
      dragHitRafRef.current = requestAnimationFrame(() => {
        dragHitRafRef.current = null;
        const start = dragStartRef.current;
        const active = dragSessionRef.current;
        if (!start || !active) return;
        if (appKind === "diary") return;
        const { x, y } = dragPointerRef.current;
        const { targetDate, dayKey, insertIndex } = resolveDropTarget(
          x,
          y,
          start.eventId,
          start.originalStartISO,
        );
        if (
          active.targetDayKey === (targetDate ? dayKey : null) &&
          active.insertIndex === insertIndex
        ) {
          return;
        }
        setDragSession((prev) =>
          prev
            ? {
                ...prev,
                targetDayKey: targetDate ? dayKey : null,
                targetDate,
                insertIndex,
              }
            : prev,
        );
      });
    };

    sessionPulseFrameRef.current = (hit) => {
      if (!hit) return;
      const dragged = dragStartRef.current;
      const active = dragSessionRef.current;
      if (!dragged || !active) return;
      const day = daysRef.current[hit.row * 7 + hit.col];
      if (!day) return;
      const targetDate = day.date;
      const dayKey = makeCellId(calId, {
        year: targetDate.getFullYear(),
        month: targetDate.getMonth(),
        day: targetDate.getDate(),
        session: 0,
      });
      const movedKey = Date.parse(dragged.originalStartISO);
      const sorted = eventsRef
        .filter((ev) => ev.id !== dragged.eventId && sameDay(fromISOLocal(ev.startISO), targetDate))
        .slice()
        .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
      let insertIndex = sorted.length;
      for (let i = 0; i < sorted.length; i++) {
        if (movedKey < Date.parse(sorted[i]!.startISO)) {
          insertIndex = i;
          break;
        }
      }
      if (active.targetDayKey === dayKey && active.insertIndex === insertIndex) return;
      dragSessionRef.current = { ...active, targetDayKey: dayKey, targetDate, insertIndex };
    };
    sessionPulseEndRef.current = () => {
      const pending = sessionDropPendingRef.current;
      sessionDropPendingRef.current = null;
      if (pending) {
        pending();
        return;
      }
      const active = dragSessionRef.current;
      if (active) setDragSession(active);
    };

    const onMove = (e: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const active = dragSessionRef.current;
      if (!active && Math.hypot(dx, dy) < 4) return;

      // Diary mode uses dnd-kit per-cell SortableContext for same-day reorder;
      // this pointer flow handles only cross-day calendar drag. Bail BEFORE
      // flagging the click as drag-suppressed — otherwise a tiny pointer
      // jitter (≥4px) between mousedown and click would swallow the click
      // and the session menu would never open.
      if (appKind === "diary") {
        return;
      }
      suppressClickAfterDragRef.current = true;

      dragPointerRef.current = { x: e.clientX, y: e.clientY };
      const ghost = ghostElRef.current;
      if (ghost) {
        ghost.style.left = `${e.clientX - start.offsetX}px`;
        ghost.style.top = `${e.clientY - start.offsetY}px`;
      }

      if (!active) {
        const { targetDate, dayKey, insertIndex } = resolveDropTarget(
          e.clientX,
          e.clientY,
          start.eventId,
          start.originalStartISO,
        );
        // Keep the bound session editor mounted while this tile is dragged.
        // Unmounting it (week/day's close+reopen) loses map state in month
        // view because the trailing drop click remounts the editor without
        // the side-panel flags. Hide via `hidden` instead. Close only if
        // the user grabbed a different session than the open editor.
        if (popoverEventIdRef.current && popoverEventIdRef.current !== start.eventId) {
          closePopover();
        }
        monthCreateDragActiveRef.current = true;
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
        sessionEdgePulse().over(e.clientX, e.clientY);
        return;
      }

      sessionEdgePulse().over(e.clientX, e.clientY);
      if (!sessionEdgePulse().isPulsing()) scheduleDropTargetUpdate();
    };

    const onUp = () => {
      const sessionOwned = dragStartRef.current != null || dragSessionRef.current != null;
      const pulseCtrl = sessionOwned ? sessionEdgePulseRef.current : null;
      pulseCtrl?.leave();
      const finishDrop = () => {
      if (sessionOwned) monthCreateDragActiveRef.current = false;
      const drag = dragSessionRef.current;
      dragStartRef.current = null;
      if (dragHitRafRef.current != null) {
        cancelAnimationFrame(dragHitRafRef.current);
        dragHitRafRef.current = null;
      }
      ghostElRef.current = null;
      if (!drag) {
        setPressedEventId(null);
        return;
      }
      const td = drag.targetDate;
      const sameDayDrop = !!td &&
        drag.fromKey.year === td.getFullYear() &&
        drag.fromKey.month === td.getMonth() &&
        drag.fromKey.day === td.getDate();
      const menuWasOpen = popoverEventIdRef.current === drag.eventId;

      const destDayCell = (date: Date) => {
        const cell = days.find(
          (d) =>
            d.date.getFullYear() === date.getFullYear() &&
            d.date.getMonth() === date.getMonth() &&
            d.date.getDate() === date.getDate(),
        );
        if (!cell) return null;
        const el = containerRef.current?.querySelector<HTMLElement>(
          monthDayCellSelector({ row: cell.row, col: cell.col }),
        );
        if (!el) return null;
        return { cell, el };
      };

      // Pin the session menu to the destination day cell, not a leftover
      // source chip. Always open on drop, same as week/day.
      const showMenuAtDest = (date: Date) => {
        const found = destDayCell(date);
        if (!found) return;
        found.el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const anchorEl = found.el;
        if (menuWasOpen) {
          const rect = cellAnchorRect(anchorEl);
          setPopover((prev) =>
            prev && prev.eventId === drag.eventId
              ? { ...prev, pos: { row: found.cell.row, col: found.cell.col }, rect }
              : prev,
          );
          return;
        }
        const fresh = events.find((e) => e.id === drag.eventId) ?? drag.event;
        openEventEditor(
          { row: found.cell.row, col: found.cell.col },
          fresh,
          anchorEl,
          { restoreSidePanels: true },
        );
      };

      // Defer unmount of the floating clone so the CSS `landing` transition
      // (left/top easing, see line ~1911) plays as a snap-in to the
      // destination chip. The real chip is opacity:0 until `landing` is set,
      // then becomes visible at the same pixel — no jump.
      const SNAP_MS = 200;
      const scheduleUnmount = (after?: () => void) => {
        if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
        landingTimerRef.current = setTimeout(() => {
          setDragSession(null);
          setPressedEventId(null);
          after?.();
        }, SNAP_MS);
      };
      const snapToChip = (after?: () => void) => {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-event-id="${drag.eventId.replace(/"/g, '\\"')}"]`,
          );
          if (!el) {
            setDragSession(null);
            setPressedEventId(null);
            after?.();
            return;
          }
          const r = el.getBoundingClientRect();
          setDragSession((prev) =>
            prev ? { ...prev, landing: { left: r.left, top: r.top } } : prev,
          );
          scheduleUnmount(after);
        });
      };

      // Non-diary calendar: no in-flow ghost slot is rendered during drag
      // and no `layout` mismatch exists between drop time and final chip
      // position, so we can hand off immediately. The real chip already
      // lives at its correct index (source on same-day, or freshly moved
      // to the target day) — instant unmount of the floating clone shows
      // no jump.
      if (appKind !== "diary") {
        const destDate =
          td ??
          new Date(drag.fromKey.year, drag.fromKey.month, drag.fromKey.day);
        // Re-anchor (or open) while still hidden, then unmount the clone so
        // the menu never flashes at the pre-drag cell.
        flushSync(() => {
          if (td && !sameDayDrop) {
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
          }
          showMenuAtDest(destDate);
          setDragSession(null);
        });
        setPressedEventId(null);
        requestAnimationFrame(() => {
          showMenuAtDest(destDate);
          requestAnimationFrame(() => showMenuAtDest(destDate));
        });
        // Swallow the trailing click from this pointer sequence so it cannot
        // toggle the menu we just opened (click on the same tile closes it).
        window.setTimeout(() => {
          suppressClickAfterDragRef.current = false;
        }, 0);
        return;
      }

      if (!td) {
        // Dropped outside any cell — snap back to the source chip.
        snapToChip();
        return;
      }
      if (sameDayDrop) {
        snapToChip();
        return;
      }
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
      snapToChip(() => {
        if (!menuWasOpen) return;
        const found = destDayCell(td);
        if (!found) return;
        found.el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const tile = found.el.querySelector<HTMLElement>(
          `[data-event-id="${drag.eventId.replace(/"/g, '\\"')}"]`,
        );
        const anchorEl = tile && tile.getBoundingClientRect().height > 0 ? tile : found.el;
        const fresh = events.find((e) => e.id === drag.eventId) ?? {
          ...drag.event,
        };
        openEventEditor({ row: found.cell.row, col: found.cell.col }, fresh, anchorEl, {
          restoreSidePanels: true,
        });
      });
      };

      if (pulseCtrl?.isPulsing()) {
        sessionDropPendingRef.current = finishDrop;
        return;
      }
      finishDrop();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [calId, days, events, moveItem, appKind, openEventEditor, closePopover, cellAnchorRect]);

  // Pointer listeners for the "creating" placeholder drag. Independent of the
  // existing-chip drag flow above so it can move the popover anchor on drop
  // without coupling to event-move logic.
  useEffect(() => {
    const scheduleCreatingTargetUpdate = () => {
      if (creatingHitRafRef.current != null) return;
      creatingHitRafRef.current = requestAnimationFrame(() => {
        creatingHitRafRef.current = null;
        const start = creatingDragStartRef.current;
        const active = creatingDragRef.current;
        if (!start || !active?.moved) return;
        const { x, y } = creatingPointerRef.current;
        const cell = monthCellFromPoint(x, y);
        const posStr = cell?.getAttribute("data-cell-pos") ?? null;
        let targetPos: CellPos | null = null;
        if (posStr) {
          const [rowS, colS] = posStr.split("-");
          const r = Number(rowS);
          const c = Number(colS);
          const d = days.find((day) => day.row === r && day.col === c);
          if (d) targetPos = { row: r, col: c };
        }
        const sameTarget =
          active.targetPos?.row === targetPos?.row &&
          active.targetPos?.col === targetPos?.col;
        if (sameTarget) return;
        setCreatingDrag((prev) => (prev ? { ...prev, targetPos } : prev));
      });
    };

    const onMove = (e: PointerEvent) => {
      const start = creatingDragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const active = creatingDragRef.current;
      const passedThreshold = Math.hypot(dx, dy) >= 4;
      if (!active?.moved && !passedThreshold) return;

      // Prevent native text selection while dragging.
      e.preventDefault();

      creatingPointerRef.current = { x: e.clientX, y: e.clientY };
      const ghost = creatingGhostRef.current;
      if (ghost) {
        ghost.style.left = `${e.clientX - start.offsetX}px`;
        ghost.style.top = `${e.clientY - start.offsetY}px`;
      }

      if (!active?.moved) {
        const cell = monthCellFromPoint(e.clientX, e.clientY);
        const posStr = cell?.getAttribute("data-cell-pos") ?? null;
        let targetPos: CellPos | null = null;
        if (posStr) {
          const [rowS, colS] = posStr.split("-");
          const r = Number(rowS);
          const c = Number(colS);
          const d = days.find((day) => day.row === r && day.col === c);
          if (d) targetPos = { row: r, col: c };
        }
        setCreatingDrag((prev) =>
          prev
            ? {
                ...prev,
                pointerX: e.clientX,
                pointerY: e.clientY,
                targetPos,
                moved: true,
              }
            : prev,
        );
        return;
      }

      scheduleCreatingTargetUpdate();
    };
    const onUp = () => {
      const start = creatingDragStartRef.current;
      const drag = creatingDragRef.current;
      creatingDragStartRef.current = null;
      if (creatingHitRafRef.current != null) {
        cancelAnimationFrame(creatingHitRafRef.current);
        creatingHitRafRef.current = null;
      }
      creatingGhostRef.current = null;
      if (!drag) {
        setCreatingDrag(null);
        return;
      }
      if (
        drag.targetPos &&
        start &&
        (drag.targetPos.row !== start.fromPos.row ||
          drag.targetPos.col !== start.fromPos.col)
      ) {
        const el = containerRef.current?.querySelector<HTMLElement>(
          monthDayCellSelector(drag.targetPos),
        );
        if (el) {
          const rect = el.getBoundingClientRect();
          const newPos = drag.targetPos;
          setPopover((prev) => (prev ? { ...prev, pos: newPos, rect } : prev));
        }
      }
      setCreatingDrag(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [days]);





  // ───────────────────────── Render ─────────────────────────

  // Layout animation is only for in-cell drag (ghost insert / reorder).
  // Leaving it on for every chip makes the whole month morph when the
  // visible month changes (search pick, title arrows) or a tile is clicked.
  const chipLayoutActive = (!!dragSession || !!creatingDrag) && !suppressChipLayoutRef.current;

  // Standard row-height target so all weeks stay perfectly aligned.
  const rowMinHeight = monthRowHeight;

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

  const MONTH_CHIP_H = 22;
  const MONTH_CHIP_GAP = 2;
  const MONTH_SPAN_TOP = 32;

  const monthSpanEvents = useMemo(() => {
    if (appKind === "diary" || hideMultiDayRow) return [];
    const out: Array<{ id: string; start: Date; end: Date; event: CalendarEvent }> = [];
    for (const e of displayEvents) {
      const start = fromISOLocal(e.startISO);
      const end = fromISOLocal(e.endISO);
      if (!isMultiDaySession(start, end)) continue;
      out.push({ id: e.id, start, end, event: e });
    }
    return out;
  }, [appKind, displayEvents, hideMultiDayRow]);

  const weekSpanLayouts = useMemo(() => {
    return weekRows.map((wr) => {
      const { spans, laneCount } = layoutMonthWeekSpans(
        monthSpanEvents.map(({ id, start, end, event }) => ({
          id,
          start,
          end,
          sortIndex: event.sortIndex,
        })),
        wr.firstDate,
      );
      return { row: wr.row, spans, laneCount };
    });
  }, [weekRows, monthSpanEvents]);

  const monthSpanById = useMemo(
    () => new Map(monthSpanEvents.map((e) => [e.id, e.event])),
    [monthSpanEvents],
  );

  // Drop outline for a multi-day drag. Inside one week it is one continuous
  // bar. When the span crosses Sunday into Monday, each week keeps its own
  // piece so that drop is possible.
  const multiDragGhost = useMemo(() => {
    if (appKind === "diary" || !dragSession || dragSession.landing || !dragSession.targetDate) {
      return null;
    }
    const start = fromISOLocal(dragSession.originalStartISO);
    const end = fromISOLocal(dragSession.originalEndISO);
    if (!isMultiDaySession(start, end)) return null;
    const grabDate = new Date(
      dragSession.fromKey.year,
      dragSession.fromKey.month,
      dragSession.fromKey.day,
    );
    const range = previewSpanForGrabbedDay(start, end, grabDate, dragSession.targetDate);
    const color = dragSession.event.color ?? null;
    const crossesWeek =
      startOfWeekMon(range.start).getTime() !== startOfWeekMon(range.end).getTime();
    if (crossesWeek) {
      const previewEvent = {
        id: "drag-preview",
        start: setHM(range.start, 12, 0),
        end: setHM(range.end, 18, 0),
      };
      const spans: Array<{
        row: number;
        startCol: number;
        endCol: number;
        lane: number;
      }> = [];
      for (const wr of weekRows) {
        const existing = weekSpanLayouts.find((layout) => layout.row === wr.row);
        const { spans: previewSpans } = layoutMonthWeekSpans([previewEvent], wr.firstDate);
        for (const span of previewSpans) {
          let lane = 0;
          for (const other of existing?.spans ?? []) {
            if (other.id === dragSession.eventId) continue;
            if (other.endCol < span.startCol || other.startCol > span.endCol) continue;
            lane = Math.max(lane, other.lane + 1);
          }
          spans.push({
            row: wr.row,
            startCol: span.startCol,
            endCol: span.endCol,
            lane,
          });
        }
      }
      if (spans.length === 0) return null;
      return { color, wrap: true as const, spans };
    }
    const target = days.find((d) => sameDay(d.date, dragSession.targetDate!));
    if (!target) return null;
    const dayCount = sessionDayCount(start, end);
    const grabIndex = calendarDayDelta(startOfDay(start), grabDate);
    const startCol = continuousDragStartCol(target.col, grabIndex, dayCount);
    const endCol = startCol + dayCount - 1;
    if (startCol < 0 || endCol > 6) return null;
    const columnWidth = (dragSession.chipWidth + 12) / dayCount;
    const existing = weekSpanLayouts.find((layout) => layout.row === target.row);
    let lane = 0;
    for (const other of existing?.spans ?? []) {
      if (other.id === dragSession.eventId) continue;
      if (other.endCol < startCol || other.startCol > endCol) continue;
      lane = Math.max(lane, other.lane + 1);
    }
    return {
      color,
      wrap: false as const,
      row: target.row,
      startCol,
      endCol,
      lane,
      left: 28 + startCol * columnWidth + 6,
      width: Math.max(8, dayCount * columnWidth - 12),
    };
  }, [appKind, dragSession, days, weekRows, weekSpanLayouts]);

  const createSpanRange = useMemo(() => {
    if (appKind === "diary") return null;
    if (spanPreview) return spanPreview;
    if (
      popover &&
      !popover.eventId &&
      popover.editIdx < 0 &&
      popover.pendingStart &&
      popover.pendingEnd &&
      !sameDay(startOfDay(popover.pendingStart), startOfDay(popover.pendingEnd))
    ) {
      return {
        start: startOfDay(popover.pendingStart),
        end: startOfDay(popover.pendingEnd),
      };
    }
    return null;
  }, [appKind, spanPreview, popover]);

  const createSpanPieces = useMemo(() => {
    if (!createSpanRange) return [];
    // The drag stores calendar days at midnight. Midnight on a later day is
    // 24:00 of the day before, so the bar would stop one cell short of the pointer.
    const pieces = monthDragWeekPieces(
      createSpanRange.start,
      setHM(createSpanRange.end, 12, 0),
    );
    const out: Array<{ row: number; startCol: number; endCol: number; lane: number }> = [];
    for (const piece of pieces) {
      const monday = startOfWeekMon(piece.start);
      const row = weekRows.find((wr) => sameDay(startOfWeekMon(wr.firstDate), monday));
      if (!row) continue;
      const startCol = piece.startCol;
      const endCol = piece.startCol + piece.days - 1;
      let occupied = 0;
      for (let col = startCol; col <= endCol; col++) {
        const day = days[row.row * 7 + col];
        if (!day) continue;
        const spans = (weekSpanLayouts[row.row]?.spans ?? []).filter(
          (span) => span.startCol <= col && col <= span.endCol,
        );
        const spanDepth =
          spans.length === 0 ? 0 : Math.max(...spans.map((span) => span.lane)) + 1;
        occupied = Math.max(occupied, spanDepth);
      }
      out.push({
        row: row.row,
        startCol,
        endCol,
        lane: monthCreatePlaceholderLane(occupied, appKind === "diary" ? 5 : 4),
      });
    }
    return out;
  }, [appKind, createSpanRange, days, weekRows, weekSpanLayouts]);

  const createSpanOverlaps = (
    row: number,
    startCol: number,
    endCol: number,
  ) =>
    createSpanPieces.some(
      (piece) =>
        piece.row === row && !(endCol < piece.startCol || startCol > piece.endCol),
    );

  const beginMonthSpanCreate = (
    e: React.PointerEvent<HTMLDivElement>,
    pos: CellPos,
    date: Date,
  ) => {
    if (appKind === "diary" || viewerRole !== "owner") return;
    if (e.button !== 0 || e.detail >= 2) return;
    if ((e.target as HTMLElement).closest('[data-role="item"]')) return;
    e.stopPropagation();

    setFocus(pos);
    setPasteAnchorDate(date);
    if (dateInLiveMonth(date)) {
      suppressMonthScrollRef.current = true;
      onSelectDate?.(date);
    }

    detachMonthSpanDragRef.current?.();
    setSpanPreview(null);
    setSpanDragActive(false);
    cancelSnapRef.current();
    monthCreateDragActiveRef.current = true;
    const anchorDate = startOfDay(date);
    const drag = {
      spanning: false,
      start: anchorDate,
      end: anchorDate,
    };
    const hadPopover = !!popover;
    const prevUserSelect = document.body.style.userSelect;
    const prevWebkitUserSelect = document.body.style.getPropertyValue("-webkit-user-select");
    document.body.style.setProperty("user-select", "none");
    document.body.style.setProperty("-webkit-user-select", "none");
    containerRef.current?.classList.add("select-none");
    const blockSelect = (ev: Event) => {
      ev.preventDefault();
    };
    document.addEventListener("selectstart", blockSelect);
    window.getSelection()?.removeAllRanges();

    let pointerX = e.clientX;
    let pointerY = e.clientY;
    let raf = 0;
    let holdTimer = 0;
    let intervalTimer = 0;
    let removed = false;
    /** -1 top edge, 1 bottom edge, 0 outside the band. */
    let edge: -1 | 0 | 1 = 0;
    let openAfterPulse = false;
    let abortCreate = false;
    /** True after the first pulse is armed, so the next month needs the tighter rim. */
    let paging = false;
    let finishMenu: (() => void) | null = null;
    let paintedStart = -2;
    let paintedEnd = -2;
    let committedStart = anchorDate.getTime();
    let committedEnd = anchorDate.getTime();
    let pulse: { from: number; target: number; t0: number; dur: number } | null = null;
    let pulseGrid: HTMLElement | null = null;
    let viewTop = 0;
    let viewBottom = 0;
    let pulseGeom: {
      viewTop: number;
      viewBottom: number;
      gridLeft: number;
      gridWidth: number;
      gridTopAt0: number;
    } | null = null;

    const cellAt = (clientX: number, clientY: number) => {
      const scroller = monthScrollerRef.current;
      const grid = scroller?.querySelector<HTMLElement>("[data-month-grid]");
      if (!scroller || !grid) return null;
      const view = scroller.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const y = Math.max(view.top, Math.min(view.bottom - 0.01, clientY));
      const x = Math.max(gridRect.left + 28, Math.min(gridRect.right - 0.01, clientX));
      const rowHeight = monthRowHeightRef.current;
      const row = Math.floor((y - gridRect.top) / rowHeight);
      const colWidth = (gridRect.width - 28) / 7;
      if (colWidth <= 0) return null;
      const col = Math.floor((x - (gridRect.left + 28)) / colWidth);
      if (row < 0 || col < 0 || col > 6) return null;
      const day = daysRef.current[row * 7 + col];
      if (!day) return null;
      return day;
    };

    const paintDragMarks = (scrollTop: number) => {
      const grid = pulseGrid;
      if (!grid || !pulseGeom) return;
      const rowHeight = monthRowHeightRef.current;
      const y = Math.max(pulseGeom.viewTop, Math.min(pulseGeom.viewBottom - 0.01, pointerY));
      const x = Math.max(
        pulseGeom.gridLeft,
        Math.min(pulseGeom.gridLeft + pulseGeom.gridWidth - 0.01, pointerX),
      );
      const row = Math.floor((y - (pulseGeom.gridTopAt0 - scrollTop)) / rowHeight);
      const colWidth = pulseGeom.gridWidth / 7;
      const col = colWidth > 0 ? Math.floor((x - pulseGeom.gridLeft) / colWidth) : -1;
      const day = col >= 0 && col <= 6 ? daysRef.current[row * 7 + col] : undefined;
      if (day) {
        const pointed = startOfDay(day.date);
        if (pointed.getTime() === anchorDate.getTime()) {
          if (drag.spanning) {
            drag.spanning = false;
            drag.start = anchorDate;
            drag.end = anchorDate;
          }
        } else {
          const next = orderedDates(anchorDate, pointed);
          drag.spanning = true;
          drag.start = next.start;
          drag.end = next.end;
        }
      }
      const startMs = drag.spanning ? drag.start.getTime() : -1;
      const endMs = drag.spanning ? drag.end.getTime() : -1;
      if (startMs === paintedStart && endMs === paintedEnd) return;
      paintedStart = startMs;
      paintedEnd = endMs;
      const cells = grid.querySelectorAll<HTMLElement>("[data-month-cell]");
      for (const cell of cells) {
        const ms = Number(cell.dataset.calMs);
        if (drag.spanning && ms >= startMs && ms <= endMs) cell.setAttribute("data-create-mark", "1");
        else cell.removeAttribute("data-create-mark");
      }
    };

    const publish = (clientX: number, clientY: number) => {
      const day = cellAt(clientX, clientY);
      if (!day) return;
      const pointed = startOfDay(day.date);
      if (pointed.getTime() === anchorDate.getTime()) {
        drag.spanning = false;
        drag.start = anchorDate;
        drag.end = anchorDate;
        if (committedStart === anchorDate.getTime() && committedEnd === anchorDate.getTime()) return;
        committedStart = anchorDate.getTime();
        committedEnd = anchorDate.getTime();
        setSpanDragActive(false);
        setSpanPreview(null);
        return;
      }
      const next = orderedDates(anchorDate, pointed);
      if (!drag.spanning) {
        drag.spanning = true;
        setSpanDragActive(true);
        setRange(null);
        dragAnchorRef.current = null;
        if (hadPopover) closePopover();
      }
      drag.start = next.start;
      drag.end = next.end;
      if (committedStart === next.start.getTime() && committedEnd === next.end.getTime()) return;
      committedStart = next.start.getTime();
      committedEnd = next.end.getTime();
      setSpanPreview(next);
    };

    const edgeAt = (el: HTMLElement, clientY: number): -1 | 0 | 1 => {
      if (!pulse) {
        const rect = el.getBoundingClientRect();
        viewTop = rect.top;
        viewBottom = rect.bottom;
      }
      return monthCreateEdgeZone(clientY, viewTop, viewBottom, paging);
    };

    const stillAtRim = (repeat: boolean): boolean => {
      const el = monthScrollerRef.current;
      if (!el) return false;
      if (!pulse) {
        const rect = el.getBoundingClientRect();
        viewTop = rect.top;
        viewBottom = rect.bottom;
      }
      const zone = monthCreateEdgeZone(pointerY, viewTop, viewBottom, repeat);
      edge = zone;
      return zone !== 0;
    };

    const clearPulseTimers = () => {
      if (holdTimer) window.clearTimeout(holdTimer);
      if (intervalTimer) window.clearTimeout(intervalTimer);
      holdTimer = 0;
      intervalTimer = 0;
    };

    const coverPulseWeeks = (el: HTMLElement, target: number) => {
      const row = monthRowHeightRef.current;
      const built = panRef.current;
      const from = visibleWeekRows(el.scrollTop, el.clientHeight, row, built.weekCount);
      const dest = visibleWeekRows(target, el.clientHeight, row, built.weekCount);
      const next = {
        start: Math.max(0, Math.min(from.start, dest.start) - MONTH_RENDER_OVERSCAN),
        end: Math.min(built.weekCount - 1, Math.max(from.end, dest.end) + MONTH_RENDER_OVERSCAN),
      };
      const current = mountRef.current;
      if (next.start === current.start && next.end === current.end) return;
      mountRef.current = next;
      suppressChipLayoutRef.current = true;
      flushSync(() => setMount(next));
      suppressChipLayoutRef.current = false;
    };

    const finishPulse = () => {
      const el = monthScrollerRef.current;
      if (el) el.style.willChange = "";
      monthPulseLockRef.current = false;
      pulse = null;
      pulseGrid = null;
      pulseGeom = null;
      if (!abortCreate) publish(pointerX, pointerY);
      syncMonthScrollRef.current();
      if (openAfterPulse || removed) {
        finishMenu?.();
        return;
      }
      if (edge === 0) return;
      const wait = Math.max(0, MONTH_CREATE_PULSE_INTERVAL_MS - monthCreatePulseDuration());
      intervalTimer = window.setTimeout(() => {
        intervalTimer = 0;
        if (removed || !stillAtRim(true)) return;
        runPulse();
      }, wait);
    };

    const tick = (ts: number) => {
      raf = 0;
      if (removed || !pulse) return;
      const el = monthScrollerRef.current;
      if (!el) {
        finishPulse();
        return;
      }
      if (pulse.t0 === 0) pulse.t0 = ts;
      const elapsed = ts - pulse.t0;
      el.scrollTop = monthCreatePulseScroll(pulse.from, pulse.target, elapsed, pulse.dur);
      paintDragMarks(el.scrollTop);
      if (elapsed < pulse.dur) {
        raf = requestAnimationFrame(tick);
        return;
      }
      el.scrollTop = pulse.target;
      finishPulse();
    };

    const runPulse = () => {
      if (pulse || edge === 0 || removed) return;
      const el = monthScrollerRef.current;
      if (!el) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const target = nextMonthOriginScroll(
        el.scrollTop,
        edge,
        monthRowHeightRef.current,
        panRef.current.monthStarts,
        max,
      );
      if (target == null || Math.abs(target - el.scrollTop) < 0.5) return;
      coverPulseWeeks(el, target);
      const view = el.getBoundingClientRect();
      const grid = el.querySelector<HTMLElement>("[data-month-grid]");
      const gridRect = grid?.getBoundingClientRect();
      if (gridRect) {
        pulseGrid = grid;
        pulseGeom = {
          viewTop: view.top,
          viewBottom: view.bottom,
          gridLeft: gridRect.left + 28,
          gridWidth: gridRect.width - 28,
          gridTopAt0: gridRect.top + el.scrollTop,
        };
      }
      viewTop = view.top;
      viewBottom = view.bottom;
      el.style.willChange = "scroll-position";
      monthPulseLockRef.current = true;
      pulse = {
        from: el.scrollTop,
        target,
        t0: 0,
        dur: monthCreatePulseDuration(),
      };
      raf = requestAnimationFrame(tick);
    };

    const onDragLeaveEdge = () => {
      edge = 0;
      clearPulseTimers();
    };

    const onDragOverEdge = (clientY: number) => {
      const el = monthScrollerRef.current;
      if (!el) return;
      const next = edgeAt(el, clientY);
      if (next === edge) return;
      edge = next;
      clearPulseTimers();
      if (next === 0 || pulse) return;
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        if (removed || !stillAtRim(paging)) return;
        paging = true;
        runPulse();
      }, MONTH_CREATE_PULSE_HOLD_MS);
    };

    const onMove = (ev: PointerEvent) => {
      if (!monthCreateDragActiveRef.current) return;
      if (ev.cancelable) ev.preventDefault();
      window.getSelection()?.removeAllRanges();
      pointerX = ev.clientX;
      pointerY = ev.clientY;
      onDragOverEdge(ev.clientY);
      if (!pulse) publish(pointerX, pointerY);
    };

    let listenersStopped = false;
    const stopListeners = () => {
      if (listenersStopped) return;
      listenersStopped = true;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      document.removeEventListener("selectstart", blockSelect);
      if (prevUserSelect) document.body.style.setProperty("user-select", prevUserSelect);
      else document.body.style.removeProperty("user-select");
      if (prevWebkitUserSelect) {
        document.body.style.setProperty("-webkit-user-select", prevWebkitUserSelect);
      } else {
        document.body.style.removeProperty("-webkit-user-select");
      }
      containerRef.current?.classList.remove("select-none");
      window.getSelection()?.removeAllRanges();
    };
    const detach = () => {
      if (removed) return;
      removed = true;
      onDragLeaveEdge();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      const scroller = monthScrollerRef.current;
      if (scroller) scroller.style.willChange = "";
      monthPulseLockRef.current = false;
      stopListeners();
      monthCreateDragActiveRef.current = false;
      if (detachMonthSpanDragRef.current === detach) detachMonthSpanDragRef.current = null;
    };

    const finish = (ev: PointerEvent) => {
      if (removed) return;
      abortCreate = ev.type === "pointercancel";
      if (abortCreate) drag.spanning = false;
      onDragLeaveEdge();
      stopListeners();

      const openMenu = () => {
        if (removed) return;
        removed = true;
        monthCreateDragActiveRef.current = false;
        if (detachMonthSpanDragRef.current === detach) detachMonthSpanDragRef.current = null;
        setSpanDragActive(false);
        setRange(null);
        dragAnchorRef.current = null;
        if (abortCreate || !drag.spanning) {
          setSpanPreview(null);
          return;
        }
        const start = drag.start;
        const end = drag.end;
        const endCell = daysRef.current.find((d) => sameDay(d.date, end));
        if (endCell) {
          const mounted = mountRef.current;
          if (endCell.row < mounted.start || endCell.row > mounted.end) {
            const nextMount = {
              start: Math.min(mounted.start, endCell.row),
              end: Math.max(mounted.end, endCell.row),
            };
            mountRef.current = nextMount;
            flushSync(() => setMount(nextMount));
          }
        }
        const anchorEl = endCell
          ? containerRef.current?.querySelector(
              monthDayCellSelector({ row: endCell.row, col: endCell.col }),
            )
          : null;
        const rect =
          anchorEl instanceof HTMLElement
            ? anchorEl.getBoundingClientRect()
            : new DOMRect(ev.clientX, ev.clientY, 0, 0);
        if (endCell) {
          setFocus({ row: endCell.row, col: endCell.col });
          setPasteAnchorDate(endCell.date);
        }
        setSpanPreview(null);
        resetSessionSidePanels(null);
        closeSessionContextMenuRef.current();
        setCreatePreviewTime({ startMin: 9 * 60, endMin: 10 * 60 });
        setPopover({
          pos: endCell ? { row: endCell.row, col: endCell.col } : pos,
          rect,
          editIdx: -1,
          initialText: "",
          initialColor: getSessionDefaultColor(),
          categoryId: null,
          pendingStart: start,
          pendingEnd: end,
        });
      };

      finishMenu = openMenu;
      if (pulse) {
        openAfterPulse = true;
        return;
      }
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      monthPulseLockRef.current = false;
      openMenu();
    };

    detachMonthSpanDragRef.current = detach;
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
  };

  const createSpanMenu =
    !spanPreview && popover && !popover.eventId && popover.editIdx < 0 ? popover : null;
  const createSpanTitleText = createSpanMenu?.initialText?.trim() ?? "";
  const showCreateSpanTile = createSpanTitleText.length > 0;
  const createSpanTitle = createSpanTitleText || "New session";
  const createMarkColor = createSpanMenu?.initialColor ?? getSessionDefaultColor();
  const showCreateDayMarks = !!createSpanRange && !showCreateSpanTile;
  const createSpanChrome = sessionMonthChipChrome(
    createSpanMenu?.initialColor ?? getSessionDefaultColor(),
    true,
  );

  const renderStart = Math.min(mount.start, focus.row);
  const renderEnd = Math.max(mount.end, focus.row);
  const mountedWeekRows = weekRows.filter((wr) => wr.row >= renderStart && wr.row <= renderEnd);
  const mountedDays = days.filter((d) => d.row >= renderStart && d.row <= renderEnd);
  const todayDate = new Date();
  const todayInFocused =
    todayDate.getFullYear() === focusYear && todayDate.getMonth() === focusMonth;
  const todayCol = dowMon0(todayDate);
  const spanLaneLimitByCell = new Map<string, number>();

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 w-full flex-col outline-none focus:outline-none focus-visible:outline-none"
      tabIndex={0}
    >
      {/* Weekday strip — mirrors the Week view: 28px week-number gutter + 7
          weekday columns. Today's column gets the dark-grey highlight. */}
      <div
        ref={monthHeaderRef}
        data-grid-header="1"
        className="grid flex-none border-b border-hairline bg-card"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        {onOpenYearView ? (
          <button
            type="button"
            data-calendar-view-nav=""
            aria-label={`Open year ${focusYear}`}
            onClick={() => onOpenYearView()}
            className="flex h-full flex-col items-center justify-center border-r border-hairline text-[9px] font-semibold leading-[1.05] tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
          >
            <span data-month-year-hi="">{String(focusYear).slice(0, 2)}</span>
            <span data-month-year-lo="">{String(focusYear).slice(2)}</span>
          </button>
        ) : (
          <div className="border-r border-hairline" />
        )}
        {WEEKDAYS.map((w, idx) => {
          const isTodayCol = todayInFocused && idx === todayCol;
          return (
            <div
              key={w}
              data-dow={idx}
              className={`px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.08em] ${
                isTodayCol ? "bg-secondary text-ink" : "text-muted-foreground"
              }`}
              style={
                isTodayCol
                  ? { boxShadow: "-1px 0 0 0 var(--secondary)" }
                  : undefined
              }
            >
              {w}
            </div>
          );
        })}
      </div>

      {/* The grid */}
      <div
        ref={monthScrollerRef}
        className="mini-dur-scroll relative flex-1 min-h-0 overflow-y-auto"
        style={{ scrollbarGutter: "stable", overflowAnchor: "none" }}
      >
        <MonthFocusPaint rootRef={containerRef} />
        <LayoutGroup key="month-pan">
          <div
            data-month-grid=""
            className="relative grid w-full"
            style={
              {
                gridTemplateColumns: GRID_TEMPLATE,
                gridTemplateRows: `repeat(${rows}, ${rowMinHeight}px)`,
                ["--month-create-mark" as string]: createMarkColor,
              } as CSSProperties
            }
          >
            {mountedWeekRows.map((wr) => (
              <button
                key={`wn-${wr.firstDate.getTime()}`}
                type="button"
                data-calendar-view-nav=""
                data-month-week=""
                onClick={() => onWeekClick?.(wr.firstDate)}
                onContextMenu={(e) => {
                  if (viewerRole !== "owner") return;
                  onWeekContextMenu(e, wr.firstDate);
                }}
                title={`Uke ${wr.weekNo} — klikk for å zoome inn`}
                style={{ gridColumn: 1, gridRow: wr.row + 1 }}
                className="flex items-start justify-center overflow-hidden border-b border-r border-hairline pt-2 text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
              >
                {wr.weekNo}
              </button>
            ))}
            {mountedDays.map((d) => {
              const pos: CellPos = { row: d.row, col: d.col };
              const focused = focus.row === d.row && focus.col === d.col;
              const isInRange = inRange(pos);
              const isWeekend = d.col >= 5;
              const inFocused =
                d.date.getFullYear() === focusYear && d.date.getMonth() === focusMonth;
              const todayCell = isToday(d.date) && inFocused;

              const k: CellKey = {
                year: d.date.getFullYear(),
                month: d.date.getMonth(),
                day: d.date.getDate(),
                session: 0,
              };
              const id = makeCellId(calId, k);
              const legacyItems = parseItems(data[id]?.text);
              // Events whose start day is this calendar cell.
              const dayEvents = displayEvents.filter((e) => {
                const start = fromISOLocal(e.startISO);
                if (appKind !== "diary" && isMultiDaySession(start, fromISOLocal(e.endISO))) {
                  return false;
                }
                return sameDay(start, d.date);
              });
              const pendingOrderIndex = pendingOrder && pendingOrder.length === dayEvents.length
                ? new Map(pendingOrder.map((eventId, index) => [eventId, index]))
                : null;
              const shouldUsePendingOrder = !!pendingOrderIndex && dayEvents.every((event) => pendingOrderIndex.has(event.id));
              const sortedDayEvents = dayEvents
                .slice()
                .sort((a, b) => {
                  // Calendar mode: always order strictly by session start
                  // time so the chips read top→bottom in chronological
                  // order. Only diary mode honors manual reorder via
                  // pendingOrder / sortIndex.
                  if (appKind !== "diary") {
                    return Date.parse(a.startISO) - Date.parse(b.startISO);
                  }
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

              // Strict row alignment. Calendar days hold four rows: four
              // tiles, or three tiles and the "+N more" line. Diary keeps
              // five rows in its taller cells. Drop-preview ghosts occupy a
              // row too, so they count toward overflow — the last row
              // becomes / stays "+N more" instead of pushing another chip
              // below the cell.
              const MAX_ROWS = appKind === "diary" ? 5 : 4;
              const isSourceDay =
                !!dragSession &&
                dragSession.fromKey.year === d.date.getFullYear() &&
                dragSession.fromKey.month === d.date.getMonth() &&
                dragSession.fromKey.day === d.date.getDate();
              const isTargetDay =
                appKind === "diary"
                  ? isSourceDay
                  : !!dragSession && dragSession.targetDayKey === id && !isSourceDay;
              const hasRepeatPreviewOnDay = repeatLivePreview?.events.some((e) =>
                eventCoversDay(
                  fromISOLocal(e.startISO),
                  fromISOLocal(e.endISO),
                  d.date,
                ),
              );
              const isCreatingHere =
                !!popover &&
                !popover.eventId &&
                popover.editIdx < 0 &&
                popover.pos.row === pos.row &&
                popover.pos.col === pos.col &&
                (appKind === "diary" || !hasRepeatPreviewOnDay) &&
                !createSpanOverlaps(pos.row, pos.col, pos.col);
              const isCreatingDragTarget =
                !!creatingDrag &&
                !!creatingDrag.targetPos &&
                creatingDrag.targetPos.row === pos.row &&
                creatingDrag.targetPos.col === pos.col &&
                !isCreatingHere;
              const draggingMulti =
                !!dragSession &&
                isMultiDaySession(
                  fromISOLocal(dragSession.originalStartISO),
                  fromISOLocal(dragSession.originalEndISO),
                );
              const showMoveGhost =
                isTargetDay && !!dragSession && !dragSession.landing && !draggingMulti;
              const previewSlots =
                appKind === "diary"
                  ? 0
                  : (showMoveGhost ? 1 : 0) +
                    (isCreatingHere ? 1 : 0) +
                    (isCreatingDragTarget ? 1 : 0);
              const spansHere =
                appKind === "diary"
                  ? []
                  : (weekSpanLayouts[d.row]?.spans ?? []).filter(
                      (span) => span.startCol <= d.col && d.col <= span.endCol,
                    );
              const ghostSpan = multiDragGhost?.wrap
                ? multiDragGhost.spans.find(
                    (span) =>
                      span.row === d.row && span.startCol <= d.col && d.col <= span.endCol,
                  )
                : multiDragGhost &&
                    multiDragGhost.row === d.row &&
                    d.col >= multiDragGhost.startCol &&
                    d.col <= multiDragGhost.endCol
                  ? multiDragGhost
                  : null;
              const previewPiece = createSpanPieces.find(
                (piece) =>
                  piece.row === d.row && piece.startCol <= d.col && d.col <= piece.endCol,
              );
              const spanLanes = spansHere.map((span) => span.lane);
              if (ghostSpan) spanLanes.push(ghostSpan.lane);
              const tileBudget = monthCellTileBudget({
                maxRows: MAX_ROWS,
                spanLanes,
                itemCount: allItems.length,
                previewSlots,
                placeholderLane: showCreateSpanTile ? (previewPiece?.lane ?? null) : null,
              });
              spanLaneLimitByCell.set(`${d.row}-${d.col}`, tileBudget.spanLaneLimit);
              const spanLaneCount = tileBudget.visibleSpanLanes;
              const MAX_VISIBLE = tileBudget.maxChips;
              const visible = allItems.slice(0, MAX_VISIBLE);
              const overflow = tileBudget.overflow;

              return (
                <div
                  key={`${d.date.getFullYear()}-${d.date.getMonth()}-${d.date.getDate()}`}
                  data-cell-pos={`${d.row}-${d.col}`}
                  onPointerDown={(e) => beginMonthSpanCreate(e, pos, d.date)}
                  onMouseDown={(e) => {
                    if (monthCreateDragActiveRef.current) return;
                    setFocus(pos);
                    setPasteAnchorDate(d.date);
                    if (dateInLiveMonth(d.date)) {
                      suppressMonthScrollRef.current = true;
                      onSelectDate?.(d.date);
                    }
                    if ((e.target as HTMLElement).closest('[data-role="item"]')) return;
                    if (e.button !== 0) return;
                    dragAnchorRef.current = pos;
                    setRange({ a: pos, b: pos });
                  }}
                  onMouseEnter={() => {
                    if (monthCreateDragActiveRef.current) return;
                    if (dragAnchorRef.current) {
                      setRange({ a: dragAnchorRef.current, b: pos });
                    }
                  }}
                  onMouseUp={(e) => {
                    if (dragItem) {
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
                    if (viewerRole !== "owner") return;
                    if ((e.target as HTMLElement).closest('[data-role="item"]')) return;
                    openPopoverAt(pos, e.currentTarget);
                  }}
                  onContextMenu={(e) => {
                    if (viewerRole !== "owner") return;
                    setFocus(pos);
                    setPasteAnchorDate(d.date);
                    onPasteContextMenu(e, d.date);
                  }}
                  className={[
                    "group/cell group/daynote-anchor relative isolate flex flex-col border-b border-r border-hairline",
                    "first:border-l-0", // first column has no left border (parent supplies)
                    isInRange || focused
                      ? "bg-muted-foreground/15"
                      : !inFocused
                        ? "bg-muted/40 text-muted-foreground/60"
                        : isWeekend
                          ? "bg-muted/20"
                          : "bg-card",
                    // Suppress per-cell hover tint while dragging a session,
                    // so only the ghost-preview indicates the drop target.
                    // Keep the clicked/ranged fill even while the pointer is
                    // over that cell; hover only applies to unselected days.
                    dragSession || spanDragActive
                      ? "select-none"
                      : isInRange || focused
                        ? ""
                        : "hover:bg-secondary/40",
                  ].join(" ")}
                  data-month-cell=""
                  data-cal-year={d.date.getFullYear()}
                  data-cal-month={d.date.getMonth()}
                  data-cal-ms={d.date.getTime()}
                  data-create-mark={
                    showCreateDayMarks &&
                    createSpanRange &&
                    d.date.getTime() >= createSpanRange.start.getTime() &&
                    d.date.getTime() <= createSpanRange.end.getTime()
                      ? "1"
                      : undefined
                  }
                  data-weekend={isWeekend ? "1" : "0"}
                  data-selected={isInRange || focused ? "1" : "0"}
                  data-day-anchor=""
                  data-day-key={id}
                  style={{ cursor: "default", gridColumn: d.col + 2, gridRow: d.row + 1 }}

                >
                  {/* Day number — top-right. The 1st carries the month name. */}
                  <div className="flex items-start justify-end px-2 pt-1.5">
                    <span className="inline-flex max-w-full items-center justify-end gap-1">
                      {d.date.getDate() === 1 && (
                        <span
                          data-month-label=""
                          className={[
                            "truncate text-[11px] font-medium",
                            inFocused ? "text-ink/70" : "text-muted-foreground/50",
                          ].join(" ")}
                        >
                          {MONTHS_FULL[d.date.getMonth()]}
                        </span>
                      )}
                      <span
                        data-month-num=""
                        data-today={isToday(d.date) ? "1" : "0"}
                        className={[
                          "grid h-[22px] min-w-[22px] place-items-center rounded-sm text-[11px] font-medium tabular-nums",
                          todayCell
                            ? "bg-[#ED5C5C] text-white"
                            : inFocused
                              ? "text-ink/70"
                              : "text-muted-foreground/50",
                        ].join(" ")}
                      >
                        {d.dayNumber}
                      </span>
                    </span>
                  </div>

                  {/* Items list */}
                  <div
                    className="relative z-0 flex-1 space-y-0.5 px-1.5 pb-1.5"
                    style={{
                      paddingTop: 4 + spanLaneCount * (MONTH_CHIP_H + MONTH_CHIP_GAP),
                    }}
                  >
                    {(appKind as string) === "diary" ? (() => {
                      const realEvents = sortedDayEvents;
                      const tall = monthTileDesign === "split" || monthTileDesign === "stacked";
                      const maxEvents = Math.max(0, MAX_VISIBLE - (isCreatingHere ? 1 : 0));
                      const visibleReal = realEvents.slice(0, maxEvents);
                      return (
                        <DiaryMonthDndCell
                          sortedEvents={visibleReal}
                          creating={isCreatingHere}
                          tall={tall}
                          monthTileDesign={monthTileDesign}
                          distanceUnit={distanceUnit}
                          viewerRole={viewerRole}
                          lockedActiveId={lockedId ?? forceEditId}
                          hoverLocked={hoverLocked}
                          cancelHoverClose={cancelHoverClose}
                          scheduleHoverClose={scheduleHoverClose}
                          setHoverId={setHoverId}
                          setHoverRect={setHoverRect}
                          setForceEditId={setForceEditId}
                          onReorder={(newIds) => handleDiaryReorder(realEvents, newIds)}
                        />
                      );
                    })() : (() => {

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
                        | { kind: "creating-ghost" }
                        | UnifiedItem;

                      const renderList: RenderItem[] = [...baseVisible];
                      if (showMoveGhost) {
                        // Calendar mode: keep the drop-preview chip pinned
                        // at the top of the target day while dragging.
                        // It only snaps into its start-time-sorted slot
                        // when the user releases (drop).
                        const insertAt = appKind === "diary"
                          ? Math.max(0, Math.min(baseVisible.length, dragSession!.insertIndex))
                          : 0;
                        renderList.splice(insertAt, 0, { kind: "ghost" });
                      }
                      if (isCreatingHere) {
                        // Keep the placeholder pinned at the top of the cell
                        // while the user is filling out the popover — don't
                        // reshuffle existing sessions as the time wheel
                        // changes. The new session will snap into its
                        // correctly sorted slot once the user commits
                        // (clicks "add" / hits Enter).
                        const createInsertAt = appKind === "diary"
                          ? renderList.length
                          : 0;
                        renderList.splice(createInsertAt, 0, { kind: "creating" });
                      }
                      if (isCreatingDragTarget) {
                        renderList.splice(0, 0, { kind: "creating-ghost" });
                      }
                      // `visible` already reserved rows for preview chips and
                      // the "+N more" slot, so this list fits in MAX_ROWS.
                      const renderVisible = renderList;


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
                              style={{ height: tall ? 44 : 22 }}
                            />
                          );
                        }
                        return (
                          <div
                            key={`${id}-ghost-move`}
                            data-role="ghost-move"
                            className="pointer-events-none rounded-[3px] border-2 border-solid border-primary/70 bg-primary/10"
                            style={{
                              height: tall ? 44 : 22,
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
                        <AnimatePresence initial={false} mode="popLayout">
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
                              const createColor = popover?.initialColor ?? (appKind === "diary" ? defaultNewColor : getSessionDefaultColor());
                              const createTitle = popover?.initialText?.trim() || "New session";
                              const heightCreate = tallCreate ? 44 : 22;
                              const isDragging =
                                !!creatingDrag &&
                                creatingDragStartRef.current?.fromPos.row === pos.row &&
                                creatingDragStartRef.current?.fromPos.col === pos.col;
                              return (
                                <motion.div
                                  key={`${id}-creating-${idx}`}
                                  layout={chipLayoutActive}
                                  initial={false}
                                  animate={{ opacity: isDragging ? 0.35 : 1 }}
                                  exit={chipLayoutActive ? { opacity: 0 } : undefined}
                                  transition={{ duration: 0.12 }}
                                  onPointerDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const target = e.currentTarget as HTMLElement;
                                    const rect = target.getBoundingClientRect();
                                    creatingDragStartRef.current = {
                                      x: e.clientX,
                                      y: e.clientY,
                                      offsetX: e.clientX - rect.left,
                                      offsetY: e.clientY - rect.top,
                                      chipWidth: rect.width,
                                      chipHeight: rect.height,
                                      fromPos: pos,
                                    };
                                    setCreatingDrag({
                                      pointerX: e.clientX,
                                      pointerY: e.clientY,
                                      offsetX: e.clientX - rect.left,
                                      offsetY: e.clientY - rect.top,
                                      chipWidth: rect.width,
                                      chipHeight: rect.height,
                                      color: createColor,
                                      title: createTitle,
                                      tall: tallCreate,
                                      targetPos: pos,
                                      moved: false,
                                    });
                                  }}
                                  onContextMenu={(e) => {
                                    if (appKind === "diary") return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    creatingDragStartRef.current = null;
                                    setCreatingDrag(null);
                                    closeSessionContextMenu();
                                    closePopover();
                                  }}
                                  className="flex items-center overflow-hidden rounded-[3px] px-1.5 text-[11.5px] leading-none select-none"
                                  style={{
                                    height: heightCreate,
                                    ...(createColor
                                      ? sessionMonthChipChrome(createColor, true)
                                      : { backgroundColor: "hsl(var(--secondary))" }),
                                    cursor: "default",
                                    userSelect: "none",
                                    WebkitUserSelect: "none",
                                  }}
                                  data-session-active="1"
                                >


                                  <span className="truncate">{createTitle}</span>
                                </motion.div>
                              );
                            }
                            if (it.kind === "creating-ghost") {
                              const tallCreate =
                                appKind === "diary" &&
                                (monthTileDesign === "split" || monthTileDesign === "stacked");
                              const c = creatingDrag?.color ?? null;
                              return (
                                <motion.div
                                  key={`${id}-creating-ghost-${idx}`}
                                  initial={false}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0 }}
                                  className="pointer-events-none rounded-[3px] border-2 border-solid border-primary/70 bg-primary/10"
                                  style={{
                                    height: tallCreate ? 44 : 22,
                                    borderColor: c ? `${c}CC` : undefined,
                                    background: c ? `${c}1F` : undefined,
                                  }}
                                />
                              );
                            }


                            const raw = it.kind === "legacy" ? it.raw : it.event.title;
                            const itemColor = it.kind === "legacy" ? splitColor(it.raw).color : it.event.color;
                            const displayText = it.kind === "legacy" ? splitColor(it.raw).text : it.event.title;
                            const itemKey = it.kind === "legacy" ? `legacy-${it.idx}` : `event-${it.event.id}`;
                            const isDiaryEvent = appKind === "diary" && it.kind === "event";
                            const tall = isDiaryEvent && (monthTileDesign === "split" || monthTileDesign === "stacked");
                            const isRealEvent = it.kind === "event";
                            const isRepeatPreview =
                              isRealEvent && isRepeatPreviewEventId(it.event.id);
                            const evId = isRealEvent ? it.event.id : null;
                            const isCoachPending = isRealEvent && it.event.coachPending;
                            const isActive =
                              !isCoachPending &&
                              isRealEvent &&
                              evId !== null &&
                              ((lockedId ?? forceEditId) === evId ||
                                popover?.eventId === evId ||
                                sessionContextEventId === evId ||
                                pressedEventId === evId ||
                                searchSelectedId === evId ||
                                (evId != null && !!markedEventIds?.has(evId)));
                            return (
                          <motion.div
                            key={`${id}-${itemKey}`}
                            layout={chipLayoutActive}
                            initial={false}
                            animate={{
                              opacity:
                                dragSession &&
                                !dragSession.landing &&
                                it.kind === "event" &&
                                dragSession.eventId === it.event.id
                                  ? 0.35
                                  : isRepeatPreview
                                    ? 0.72
                                    : 1,
                            }}
                            exit={chipLayoutActive ? { opacity: 0 } : undefined}
                            transition={{ duration: 0.12, layout: { duration: 0.18, ease: [0.2, 0, 0, 1] } }}
                            data-role="item"
                            data-real-event={isRealEvent ? "1" : undefined}
                            data-event-id={isRealEvent ? it.event.id : undefined}
                            data-session-active={isActive ? "1" : undefined}
                            data-coach-pending={!isDiaryEvent && it.kind === "event" && it.event.coachPending ? "1" : undefined}
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
                              setFocus(pos);
                              setPasteAnchorDate(d.date);
                              if (dateInLiveMonth(d.date)) {
                                suppressMonthScrollRef.current = true;
                                onSelectDate?.(d.date);
                              }
                              if (it.kind === "legacy") return;
                              if (isRepeatPreview) return;
                              // Another session's menu is open (or a new untitled
                              // session): switch to this tile immediately so it is
                              // marked and can be dragged without an extra click.
                              if (
                                appKind !== "diary" &&
                                it.kind === "event" &&
                                popover &&
                                popover.eventId !== it.event.id
                              ) {
                                openEventEditor(
                                  pos,
                                  it.event,
                                  e.currentTarget as HTMLElement,
                                );
                                switchedSessionOnPointerRef.current = true;
                              }
                              // Immediate press feedback for calendar mode
                              // (matches week-view click-down speed). Coaches
                              // also get the pressed state so click feels
                              // instant; they just can't initiate a drag.
                              if (appKind !== "diary") {
                                setPressedEventId(it.event.id);
                              }
                              // Only the owner can drag sessions. Coaches /
                              // group leaders viewing someone else's calendar
                              // or diary cannot move anything — but the
                              // pressed state above stays until pointerup
                              // (cleared by the window pointerup listener).
                              if (viewerRole !== "owner" || isMembershipOverlayEvent(it.event, calId)) {
                                // Prevent cell-level range selection from
                                // starting, which would otherwise re-render
                                // and steal the active chip styling when the
                                // coach drags the pointer out of the tile.
                                e.stopPropagation();
                                e.preventDefault();
                                return;
                              }
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
                              // Keep the title caret when this tile's editor is
                              // already open — same as the creating-chip drag.
                              // Without preventDefault the pointerdown blurs the
                              // input before `hidden` is set, so drop cannot
                              // restore focus (week/day remount instead).
                              if (appKind !== "diary" && popover?.eventId === it.event.id) {
                                e.preventDefault();
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
                              const switchedOnPress = switchedSessionOnPointerRef.current;
                              switchedSessionOnPointerRef.current = false;
                              if (suppressClickAfterDragRef.current) {
                                suppressClickAfterDragRef.current = false;
                                return;
                              }
                              if (switchedOnPress) return;
                              if (dragSessionRef.current) return;
                              if (isRepeatPreview) return;
                              if (it.kind === "legacy") {
                                openItemEditor(pos, it.idx, it.raw, e.currentTarget as HTMLElement);
                              } else if (appKind === "diary" && viewerRole === "owner") {
                                cancelHoverClose();
                                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setHoverId(it.event.id);
                                setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                                setForceEditId(it.event.id);
                              } else if (
                                it.kind === "event" &&
                                popover?.eventId === it.event.id
                              ) {
                                // Toggle: clicking the open session's tile
                                // dismisses the panel (same as outside click).
                                closePopover();
                              } else {
                                openEventEditor(pos, it.event, e.currentTarget as HTMLElement);
                              }
                            }}
                            onContextMenu={(e) => {
                              if (appKind === "diary") return;
                              if (!isRealEvent || it.kind !== "event") return;
                              if (isRepeatPreview) return;
                              const tile = e.currentTarget as HTMLElement;
                              const cell = tile.closest("[data-day-anchor]") as HTMLElement | null;
                              onSessionContextMenu(e, it.event, cell ?? tile);
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
                                    "relative z-0 flex items-center gap-1.5 truncate rounded-[3px] px-1.5 py-0.5 text-[11.5px] text-ink",
                                    "transition-all hover:-translate-y-px hover:shadow-[0_2px_6px_rgba(15,23,42,0.10)]",
                                    itemColor ? "" : "bg-secondary/70",
                                    itemColor ? "" : "hover:bg-secondary",
                                  ].join(" ")}
                            style={(() => {
                              if (isDiaryEvent) return undefined;
                              const teamSession =
                                it.kind === "event" &&
                                isMembershipOverlayEvent(it.event, calId);
                              if (teamSession && it.kind === "event") {
                                const chip = teamMemberMonthChip(
                                  it.event.color,
                                  isActive,
                                  signupResponse(it.event.signUpEnabled, teamResponses, it.event.id),
                                  darkTiles,
                                );
                                return tall ? { height: 44, ...chip } : { height: 22, ...chip };
                              }
                              const isDragOrigin =
                                !!dragSession &&
                                !dragSession.landing &&
                                it.kind === "event" &&
                                dragSession.eventId === it.event.id;
                              // Coach-pending tiles keep the light striped look
                              // even while pressed/dragging — never flip to the
                              // solid active fill, so the pending state is
                              // preserved consistently with week/day views.
                              if (isActive && itemColor) {
                                const chip = sessionMonthChipChrome(itemColor, true);
                                return tall ? { height: 44, ...chip } : chip;
                              }
                              const chip = itemColor
                                ? sessionMonthChipChrome(itemColor, false)
                                : null;
                              return tall
                                ? {
                                    height: 44,
                                    backgroundColor: chip?.backgroundColor,
                                    boxShadow: chip?.boxShadow,
                                    color: isDragOrigin ? chip?.color : (chip?.color ?? undefined),
                                  }
                                : it.kind === "event"
                                  ? itemColor && chip
                                    ? {
                                        height: 22,
                                        ...chip,
                                        color: isDragOrigin ? chip.color : chip.color,
                                      }
                                    : {
                                        height: 22,
                                        color: isDragOrigin ? "#fff" : undefined,
                                      }
                                  : {};
                            })()}
                            title={isDiaryEvent ? undefined : displayText}
                          >
                            {isDiaryEvent ? (() => {
                              const ev = it.kind === "event" ? it.event : null;
                              if (!ev) return null;
                              const evId = ev.id;
                              const tileActive =
                                (lockedId ?? forceEditId) === evId ||
                                popover?.eventId === evId ||
                                pressedEventId === evId ||
                                searchSelectedId === evId;
                              return (
                                <DiaryMonthReorderTile
                                  ev={ev}
                                  tileDesign={monthTileDesign}
                                  unit={distanceUnit}
                                  height={tall ? 44 : 22}
                                  isActive={tileActive}
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
                        data-calendar-view-nav=""
                        data-role="item"
                        onClick={(e) => {
                          e.stopPropagation();
                          onWeekClick?.(d.date);
                        }}
                        className="mono w-full truncate rounded-[3px] px-1.5 py-0.5 text-left text-[10.5px] tabular-nums text-muted-foreground hover:bg-secondary"
                      >
                        +{overflow} more
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
            {appKind !== "diary" &&
              weekSpanLayouts
                .filter((layout) => layout.row >= renderStart && layout.row <= renderEnd)
                .flatMap((layout) =>
                layout.spans.flatMap((span) => {
                  const ev = monthSpanById.get(span.id);
                  if (!ev) return [];
                  const isRepeatPreview = isRepeatPreviewEventId(ev.id);
                  const isCoachPending = !!ev.coachPending;
                  const isDraggingBar =
                    !!dragSession &&
                    !dragSession.landing &&
                    dragSession.eventId === ev.id;
                  const isActive =
                    !isCoachPending &&
                    ((lockedId ?? forceEditId) === ev.id ||
                      popover?.eventId === ev.id ||
                      sessionContextEventId === ev.id ||
                      pressedEventId === ev.id ||
                      searchSelectedId === ev.id ||
                      !!markedEventIds?.has(ev.id));
                  const chip = sessionMonthChipChrome(ev.color, isActive);
                  const lane = span.lane;
                  const runs = contiguousColumnsWhere(span.startCol, span.endCol, (col) => {
                    const limit = spanLaneLimitByCell.get(`${layout.row}-${col}`);
                    return lane < (limit ?? 4);
                  });
                  if (runs.length === 0) return [];
                  const teamChip = isMembershipOverlayEvent(ev, calId)
                    ? teamMemberMonthChip(
                        ev.color,
                        isActive,
                        signupResponse(ev.signUpEnabled, teamResponses, ev.id),
                        darkTiles,
                      )
                    : null;
                  const anchorFor = (clientX: number, clientY: number) => {
                    const cell = monthCellFromPoint(clientX, clientY);
                    const pos =
                      monthCellPos(cell) ?? { row: layout.row, col: span.startCol };
                    return { cell, pos, day: days[pos.row * 7 + pos.col] };
                  };
                  return runs.map((run) => (
                    <button
                      key={`span-${layout.row}-${span.id}-${run.startCol}`}
                      type="button"
                      data-role="item"
                      data-event-id={ev.id}
                      data-session-active={isActive ? "1" : undefined}
                      data-coach-pending={isCoachPending ? "1" : undefined}
                      draggable={false}
                      className="z-30 flex min-w-0 items-center overflow-hidden rounded-[3px] px-1.5 text-left text-[11.5px] leading-none select-none"
                      style={{
                        gridColumn: `${run.startCol + 2} / ${run.endCol + 3}`,
                        gridRow: layout.row + 1,
                        position: "absolute",
                        top:
                          MONTH_SPAN_TOP +
                          lane * (MONTH_CHIP_H + MONTH_CHIP_GAP),
                        height: MONTH_CHIP_H,
                        // Same cell inset as a session that starts or ends on this day,
                        // including the Sunday and Monday pieces of a week-wrapping span.
                        left: 6,
                        right: 6,
                        minWidth: 0,
                        // Opaque card under the tint so day borders sit behind the bar.
                        backgroundColor: "var(--card)",
                        backgroundImage: teamChip?.background
                          ? teamChip.background
                          : `linear-gradient(${teamChip?.backgroundColor ?? chip.backgroundColor}, ${teamChip?.backgroundColor ?? chip.backgroundColor})`,
                        color: teamChip?.color ?? chip.color,
                        boxShadow: teamChip?.boxShadow ?? chip.boxShadow,
                        opacity: isRepeatPreview ? 0.72 : isDraggingBar ? 0.35 : 1,
                        pointerEvents: isDraggingBar ? "none" : "auto",
                      }}
                      title={ev.title}
                      onDragStart={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        const { cell, pos, day } = anchorFor(e.clientX, e.clientY);
                        if (day) {
                          setFocus(pos);
                          setPasteAnchorDate(day.date);
                          if (dateInLiveMonth(day.date)) {
                            suppressMonthScrollRef.current = true;
                            onSelectDate?.(day.date);
                          }
                        }
                        if (isRepeatPreview) return;
                        const anchor = cell ?? (e.currentTarget as HTMLElement);
                        if (popover && popover.eventId !== ev.id) {
                          openEventEditor(pos, ev, anchor);
                          switchedSessionOnPointerRef.current = true;
                        }
                        setPressedEventId(ev.id);
                        if (viewerRole !== "owner" || isMembershipOverlayEvent(ev, calId)) {
                          e.stopPropagation();
                          e.preventDefault();
                          return;
                        }
                        if (!day) return;
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        suppressClickAfterDragRef.current = false;
                        const sessionStart = startOfDay(fromISOLocal(ev.startISO));
                        const grabDay = startOfDay(day.date);
                        const pieces = monthDragWeekPieces(sessionStart, fromISOLocal(ev.endISO));
                        const grabbedPiece = pieces.find((piece) => {
                          const pieceEnd = addDays(piece.start, piece.days - 1);
                          return (
                            grabDay.getTime() >= piece.start.getTime() &&
                            grabDay.getTime() <= pieceEnd.getTime()
                          );
                        });
                        const dayCount = sessionDayCount(sessionStart, fromISOLocal(ev.endISO));
                        let offsetX = e.clientX - rect.left;
                        let chipWidth = rect.width;
                        if (
                          grabbedPiece &&
                          grabbedPiece.days > 0 &&
                          dayCount > grabbedPiece.days
                        ) {
                          const columnWidth = (rect.width + 12) / grabbedPiece.days;
                          const pieceStartIndex = calendarDayDelta(sessionStart, grabbedPiece.start);
                          offsetX += pieceStartIndex * columnWidth;
                          chipWidth = dayCount * columnWidth - 12;
                        }
                        dragStartRef.current = {
                          x: e.clientX,
                          y: e.clientY,
                          eventId: ev.id,
                          fromKey: {
                            year: day.date.getFullYear(),
                            month: day.date.getMonth(),
                            day: day.date.getDate(),
                            session: 0,
                          },
                          originalStartISO: ev.startISO,
                          originalEndISO: ev.endISO,
                          event: ev,
                          offsetX,
                          offsetY: e.clientY - rect.top,
                          chipWidth,
                          chipHeight: rect.height,
                        };
                        if (popover?.eventId === ev.id) e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const switchedOnPress = switchedSessionOnPointerRef.current;
                        switchedSessionOnPointerRef.current = false;
                        if (suppressClickAfterDragRef.current) {
                          suppressClickAfterDragRef.current = false;
                          return;
                        }
                        if (switchedOnPress) return;
                        if (dragSessionRef.current) return;
                        if (isRepeatPreview) return;
                        const { cell, pos } = anchorFor(e.clientX, e.clientY);
                        const anchor = cell ?? (e.currentTarget as HTMLElement);
                        if (popover?.eventId === ev.id) {
                          closePopover();
                          return;
                        }
                        openEventEditor(pos, ev, anchor);
                      }}
                      onContextMenu={(e) => {
                        if (isRepeatPreview) return;
                        const { cell } = anchorFor(e.clientX, e.clientY);
                        onSessionContextMenu(e, ev, cell ?? (e.currentTarget as HTMLElement));
                      }}
                    >
                      <span className="truncate">{ev.title}</span>
                    </button>
                  ));
                }),
              )}
            {showCreateSpanTile
              ? createSpanPieces
              .filter((piece) => piece.row >= renderStart && piece.row <= renderEnd)
              .map((piece) => (
                <div
                  key={`create-span-${piece.row}-${piece.startCol}`}
                  data-role="mark-create-preview"
                  aria-hidden
                  className="pointer-events-none z-40 flex min-w-0 items-center overflow-hidden rounded-[3px] px-1.5 text-left text-[11.5px] leading-none select-none"
                  style={{
                    gridColumn: `${piece.startCol + 2} / ${piece.endCol + 3}`,
                    gridRow: piece.row + 1,
                    position: "absolute",
                    top: MONTH_SPAN_TOP + piece.lane * (MONTH_CHIP_H + MONTH_CHIP_GAP),
                    height: MONTH_CHIP_H,
                    left: 6,
                    right: 6,
                    minWidth: 0,
                    backgroundColor: "var(--card)",
                    backgroundImage: `linear-gradient(${createSpanChrome.backgroundColor}, ${createSpanChrome.backgroundColor})`,
                    color: createSpanChrome.color,
                    boxShadow: createSpanChrome.boxShadow,
                  }}
                >
                  <span className="truncate">{createSpanTitle}</span>
                </div>
              ))
              : null}
            {multiDragGhost?.wrap
              ? multiDragGhost.spans.flatMap((span) => {
                  const runs = contiguousColumnsWhere(span.startCol, span.endCol, (col) => {
                    const limit = spanLaneLimitByCell.get(`${span.row}-${col}`);
                    return span.lane < (limit ?? 4);
                  });
                  return runs.map((run) => (
                  <div
                    key={`drag-ghost-${span.row}-${run.startCol}`}
                    data-role="ghost-move"
                    aria-hidden
                    className="pointer-events-none z-40 rounded-[3px] border-2 border-solid border-primary/70 bg-primary/10"
                    style={{
                      gridColumn: `${run.startCol + 2} / ${run.endCol + 3}`,
                      gridRow: span.row + 1,
                      position: "absolute",
                      top: MONTH_SPAN_TOP + span.lane * (MONTH_CHIP_H + MONTH_CHIP_GAP),
                      height: MONTH_CHIP_H,
                      left: 6,
                      right: 6,
                      borderColor: multiDragGhost.color
                        ? `${multiDragGhost.color}CC`
                        : undefined,
                      backgroundColor: multiDragGhost.color ? "var(--card)" : undefined,
                      backgroundImage: multiDragGhost.color
                        ? `linear-gradient(${multiDragGhost.color}1F, ${multiDragGhost.color}1F)`
                        : undefined,
                      }}
                    />
                  ));
                })
              : multiDragGhost
                ? (
                    <div
                      className="pointer-events-none z-40"
                      style={{
                        gridColumn: "1 / -1",
                        gridRow: "1 / -1",
                        position: "absolute",
                        inset: 0,
                      }}
                    >
                      <div
                        data-role="ghost-move"
                        aria-hidden
                        className="pointer-events-none absolute rounded-[3px] border-2 border-solid border-primary/70 bg-primary/10"
                        style={{
                          left: multiDragGhost.left,
                          top:
                            multiDragGhost.row * rowMinHeight +
                            MONTH_SPAN_TOP +
                            multiDragGhost.lane * (MONTH_CHIP_H + MONTH_CHIP_GAP),
                          width: multiDragGhost.width,
                          height: MONTH_CHIP_H,
                          borderColor: multiDragGhost.color
                            ? `${multiDragGhost.color}CC`
                            : undefined,
                          backgroundColor: multiDragGhost.color ? "var(--card)" : undefined,
                          backgroundImage: multiDragGhost.color
                            ? `linear-gradient(${multiDragGhost.color}1F, ${multiDragGhost.color}1F)`
                            : undefined,
                        }}
                      />
                    </div>
                  )
                : null}
          </div>
        </LayoutGroup>

        {/* In-cell reorder + confirmation modal intentionally removed. */}





        {/* Inline popover (per-item create or edit) */}
        {popover && appKind === "diary" && !creatingDrag?.moved && (() => {
          const cell = days.find(
            (d) => d.row === popover.pos.row && d.col === popover.pos.col,
          );
          if (!cell) return null;
          const existingEv = popover.eventId ? events.find((e) => e.id === popover.eventId) ?? null : null;
          const initialTime = (() => {
            if (existingEv && !existingEv.allDay) {
              const s = fromISOLocal(existingEv.startISO);
              const e = fromISOLocal(existingEv.endISO);
              return startEndMinsOnStartDay(s, e);
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
              defaultColor={
                popover.initialColor
                  ?? (existingEv ? existingEv.color : DEFAULT_SESSION_COLOR)
                  ?? DEFAULT_SESSION_COLOR
              }
              onColorChange={(c) => {
                setPopover((prev) => (prev ? { ...prev, initialColor: c } : prev));
                if (popover.eventId && c) {
                  onUpsertEvent?.({ id: popover.eventId, color: c });
                }
              }}
              onClose={() => closePopoverIfMatching(popover.eventId, popover.pos)}
              onCommit={(v: DiaryPopoverValue, opts) => {
                const committingEventId = popover.eventId;
                const committingPos = popover.pos;
                if (opts?.delete && committingEventId) {
                  onDeleteEvent?.(committingEventId);
                  closePopoverIfMatching(committingEventId, committingPos);
                  return;
                }
                const time = v.time ?? initialTime;
                const start = setHM(cell.date, Math.floor(time.startMin / 60), time.startMin % 60);
                const end = setHM(cell.date, Math.floor(time.endMin / 60), time.endMin % 60);
                if (committingEventId) {
                  if (!v.title) {
                    onDeleteEvent?.(committingEventId);
                  } else {
                    onUpsertEvent?.({
                      id: committingEventId,
                      title: v.title,
                      color: v.color,
                      startISO: toISOLocal(start),
                      endISO: toISOLocal(end),
                      allDay: !!v.allDay,
                      diaryType: v.diaryType,
                      diaryGroup: v.diaryGroup,
                      diarySub: v.diarySub,
                      distanceKm: v.distanceKm,
                      paceSecPerKm: v.paceSecPerKm,
                      sessionNote: v.sessionNote,
                      location: v.location,
                      locationUrl: v.locationUrl,
                      activities: v.activities,
                    });
                  }
                } else if (v.title && onUpsertEvent) {
                  onUpsertEvent({
                    title: v.title,
                    color: v.color,
                    startISO: toISOLocal(start),
                    endISO: toISOLocal(end),
                    allDay: !!v.allDay,
                    diaryType: v.diaryType,
                    diaryGroup: v.diaryGroup,
                    diarySub: v.diarySub,
                    distanceKm: v.distanceKm,
                    paceSecPerKm: v.paceSecPerKm,
                    sessionNote: v.sessionNote,
                    location: v.location,
                    locationUrl: v.locationUrl,
                    activities: v.activities,
                  });
                }
                closePopoverIfMatching(committingEventId, committingPos);
              }}
            />
          );
        })()}

        {popover && appKind !== "diary" && (
          <PopoverEditor
            key={
              popover.eventId
                ?? (popover.editIdx >= 0
                  ? `legacy:${popover.pos.row}:${popover.pos.col}:${popover.editIdx}`
                  : "month-creating")
            }
            // Keep the editor mounted during create-chip drag, same as existing
            // sessions. Unmounting remounts without an eventId, so the map
            // panel would come back closed after drop.
            hidden={!!dragSession || !!creatingDrag?.moved}
            calId={calId}
            seat={seat}
            teamId={seat === "admin" ? teamId : null}
            initialText={popover.initialText}
            initialColor={
              popover.initialColor
                ?? (popover.editIdx < 0 && !popover.eventId
                  ? getSessionDefaultColor()
                  : null)
            }
            initialCategoryId={
              popover.categoryId
                ?? (popover.eventId
                  ? events.find((e) => e.id === popover.eventId)?.categoryId
                  : null)
                ?? null
            }
            isEdit={popover.editIdx >= 0 || !!popover.eventId}
            anchor={popover.rect}
            enableDuration={!!onUpsertEvent}
            readOnly={viewerRole !== "owner" || isMembershipOverlayEvent(events.find((e) => e.id === popover.eventId), calId)}
            memberTeamMenu={isMembershipOverlayEvent(events.find((e) => e.id === popover.eventId), calId)}
            memberTeamId={events.find((e) => e.id === popover.eventId)?.entityId ?? null}
            categoryOwnerId={seat === "individual" ? memberId ?? null : null}
            onTitleChange={(title) => {
              setPopover((prev) =>
                prev && !prev.eventId && prev.editIdx < 0
                  ? { ...prev, initialText: title }
                  : prev,
              );
            }}
            onColorChange={(c, eventIds) => {
              setPopover((prev) => (prev ? { ...prev, initialColor: c } : prev));
              if (!c) return;
              const ids =
                eventIds && eventIds.length > 0
                  ? eventIds
                  : popover.eventId
                    ? [popover.eventId]
                    : [];
              for (const id of ids) {
                onUpsertEvent?.({ id, color: c });
              }
            }}
            initialAppGroupId={
              seat === "admin" && popover.eventId
                ? events.find((e) => e.id === popover.eventId)?.appGroupId
                    ?? popover.appGroupId
                    ?? null
                : popover.appGroupId ?? null
            }
            onAppGroupChange={
              seat === "admin"
                ? (groupId, eventIds) => {
                    setPopover((prev) => (prev ? { ...prev, appGroupId: groupId } : prev));
                    const ids =
                      eventIds && eventIds.length > 0
                        ? eventIds
                        : popover.eventId
                          ? [popover.eventId]
                          : [];
                    for (const id of ids) {
                      onUpsertEvent?.({ id, appGroupId: groupId });
                    }
                  }
                : undefined
            }
            initialTime={(() => {
              if (popover.eventId) {
                const ev = events.find((e) => e.id === popover.eventId);
                if (ev) {
                  const s = fromISOLocal(ev.startISO);
                  const e = fromISOLocal(ev.endISO);
                  // Only show as a duration if it isn't an all-day event.
                  if (!ev.allDay) {
                    return sessionMenuClockRange(s, e);
                  }
                }
              }
              return null;
            })()}
            initialAllDay={!!(popover.eventId && events.find((e) => e.id === popover.eventId)?.allDay)}
            initialDescription={
              popover.eventId
                ? events.find((e) => e.id === popover.eventId)?.description
                    ?? popover.initialDescription
                    ?? null
                : popover.initialDescription ?? null
            }
            initialLocation={
              popover.eventId
                ? events.find((e) => e.id === popover.eventId)?.location ?? null
                : null
            }
            initialLocationUrl={
              popover.eventId
                ? events.find((e) => e.id === popover.eventId)?.locationUrl ?? null
                : null
            }
            onClose={closePopover}
            initialSignUpEnabled={
              sessionSidePanelsRef.current.eventId === (popover.eventId ?? null)
                ? sessionSidePanelsRef.current.signUpEnabled
                : !!popover.eventId &&
                  !!events.find((e) => e.id === popover.eventId)?.signUpEnabled
            }
            initialParticipantsPanelOpen={
              sessionSidePanelsRef.current.eventId === (popover.eventId ?? null) &&
              sessionSidePanelsRef.current.participantsPanelOpen
            }
            initialLocationMapOpen={
              sessionSidePanelsRef.current.eventId === (popover.eventId ?? null) &&
              sessionSidePanelsRef.current.locationMapOpen
            }
            onSidePanelsChange={(next) => {
              sessionSidePanelsRef.current = {
                eventId: popover.eventId ?? null,
                ...next,
              };
            }}
            viewMode="month"
            anchorCellPos={popover.pos}
            eventForCopy={
              popover.eventId
                ? events.find((e) => e.id === popover.eventId) ?? null
                : null
            }
            sessionDate={
              popover.pendingStart
              ?? days.find((d) => d.row === popover.pos.row && d.col === popover.pos.col)?.date
            }
            sessionEndDate={
              popover.pendingEnd
              ?? (popover.eventId
                ? (() => {
                    const ev = events.find((e) => e.id === popover.eventId);
                    if (!ev) return undefined;
                    return sessionInclusiveEndDay(
                      fromISOLocal(ev.startISO),
                      fromISOLocal(ev.endISO),
                    );
                  })()
                : undefined)
            }
            initialRepeatRule={
              popover.eventId
                ? events.find((e) => e.id === popover.eventId)?.repeatRule ?? null
                : null
            }
            onDateChange={({ start, end }, eventIds) => {
              const ids =
                eventIds && eventIds.length > 0
                  ? eventIds
                  : popover.eventId
                    ? [popover.eventId]
                    : [];
              const primary = popover.eventId
                ? events.find((e) => e.id === popover.eventId)
                : undefined;
              if (primary && onMoveEvent && ids.length) {
                const delta = calendarDayDelta(fromISOLocal(primary.startISO), start);
                for (const id of ids) {
                  const ev = events.find((e) => e.id === id);
                  if (!ev?.startISO || !ev.endISO) continue;
                  const range =
                    ids.length > 1 && id !== primary.id
                      ? shiftIsoRangeByDays(ev.startISO, ev.endISO, delta)
                      : isAllDayBandEvent(ev)
                        ? bandWidthResizeResult(
                            ev.startISO,
                            ev.endISO,
                            !!ev.allDay,
                            start,
                            end,
                          )
                        : isoRangeOnDates(ev.startISO, ev.endISO, start, end);
                  onMoveEvent(id, range);
                }
              }
              setPopover((prev) =>
                prev ? { ...prev, pendingStart: start, pendingEnd: end } : prev,
              );
              reanchorPopoverToDate(start);
            }}
            onTimeChange={(time, eventIds) => {
              if (!popover.eventId && popover.editIdx < 0) {
                setCreatePreviewTime(time ?? { startMin: 9 * 60, endMin: 10 * 60 });
                return;
              }
              if (!time || !onMoveEvent) return;
              const ids =
                eventIds && eventIds.length > 0
                  ? eventIds
                  : popover.eventId
                    ? [popover.eventId]
                    : [];
              for (const id of ids) {
                const ev = events.find((e) => e.id === id);
                if (!ev || ev.allDay) continue;
                const start = fromISOLocal(ev.startISO);
                const endDay = sessionInclusiveEndDay(start, fromISOLocal(ev.endISO));
                onMoveEvent(id, isoFromMenuClocks(start, endDay, time.startMin, time.endMin));
              }
            }}
            onAllDayChange={(nextAllDay, t, eventIds) => {
              const ids =
                eventIds && eventIds.length > 0
                  ? eventIds
                  : popover.eventId
                    ? [popover.eventId]
                    : [];
              if (!ids.length || !onMoveEvent) return;
              const time = t ?? { startMin: 0, endMin: 0 };
              for (const id of ids) {
                const ev = events.find((e) => e.id === id);
                if (!ev) continue;
                if (
                  !nextAllDay &&
                  isMultiDaySession(fromISOLocal(ev.startISO), fromISOLocal(ev.endISO))
                ) {
                  onMoveEvent(id, { allDay: false });
                  continue;
                }
                if (t == null) continue;
                const date = fromISOLocal(ev.startISO);
                const startISO = toISOLocal(
                  setHM(date, Math.floor(time.startMin / 60), time.startMin % 60),
                );
                const endISO = toISOLocal(
                  nextAllDay
                    ? setHM(date, 23, 59)
                    : setHM(date, Math.floor(time.endMin / 60), time.endMin % 60),
                );
                onMoveEvent(id, { startISO, endISO, allDay: nextAllDay });
              }
            }}
            onSignUpEnabledChange={(enabled, eventIds) => {
              if (seat !== "admin") return;
              const ids =
                eventIds && eventIds.length > 0
                  ? eventIds
                  : popover.eventId
                    ? [popover.eventId]
                    : [];
              for (const id of ids) {
                onUpsertEvent?.({ id, signUpEnabled: enabled });
              }
            }}
            onLocationChange={(location, locationUrl, eventIds) => {
              const ids =
                eventIds && eventIds.length > 0
                  ? eventIds
                  : popover.eventId
                    ? [popover.eventId]
                    : [];
              const nextLocation = (location ?? "").trim() || undefined;
              const nextLocationUrl = (locationUrl ?? "").trim() || undefined;
              for (const id of ids) {
                onUpsertEvent?.({
                  id,
                  location: nextLocation,
                  locationUrl: nextLocationUrl,
                });
              }
            }}
            onClearRepeat={(ids) => {
              for (const id of ids) {
                onUpsertEvent?.({
                  id,
                  repeatRule: null,
                  repeatSeriesId: null,
                  repeatDetached: true,
                });
              }
            }}
            onRepeatPreviewChange={(preview) => setRepeatLivePreview(preview)}
            calendarEvents={events}
            onDeleteSessions={(ids, options) => {
              if (ids.length === 1) onDeleteEvent?.(ids[0]);
              else if (ids.length > 1) {
                if (onDeleteEvents) onDeleteEvents(ids);
                else ids.forEach((id) => onDeleteEvent?.(id));
              }
              if (options?.close !== false) closePopover();
            }}
            onCommit={(text, color, time, accept, allDay, description, appGroupId, repeatRule, categoryId, location, locationUrl, signUpEnabled, eventIds) => {
              const cell = days.find(
                (d) => d.row === popover.pos.row && d.col === popover.pos.col,
              );
              if (!cell) {
                closePopover();
                return;
              }
              const t = text.trim();
              const effectiveColor = color ?? popover.initialColor ?? null;
              const effectiveCategoryId = categoryId ?? popover.categoryId ?? null;
              const effectiveLocation = (location ?? "").trim() || undefined;
              const effectiveLocationUrl = (locationUrl ?? "").trim() || undefined;

              // ── Editing an existing unified event. ──
              if (popover.eventId) {
                if (!t) {
                  const deleteIds =
                    eventIds && eventIds.length > 0
                      ? eventIds
                      : [popover.eventId];
                  if (deleteIds.length > 1 && onDeleteEvents) {
                    onDeleteEvents(deleteIds);
                  } else {
                    deleteIds.forEach((id) => onDeleteEvent?.(id));
                  }
                } else {
                  const targetIds =
                    eventIds && eventIds.length > 0
                      ? eventIds
                      : [popover.eventId];
                  const primaryEv = events.find((e) => e.id === popover.eventId);
                  const sharedSeriesId = repeatRule
                    ? primaryEv
                      ? sharedRepeatSeriesId(primaryEv, events)
                      : makeEventId()
                    : null;
                  let materializeFrom: CalendarEvent | undefined;
                  for (const id of targetIds) {
                    const existingEv = events.find((e) => e.id === id);
                    if (!existingEv) continue;
                    const repeatSeriesId = sharedSeriesId;
                    const patch: Parameters<NonNullable<typeof onUpsertEvent>>[0] = {
                      id,
                      title: t,
                      color: effectiveColor,
                      categoryId: effectiveCategoryId ?? existingEv.categoryId,
                      location: effectiveLocation,
                      locationUrl: effectiveLocationUrl,
                      ...(description !== undefined
                        ? { description: description ?? undefined }
                        : {}),
                      ...(seat === "admin" && appGroupId !== undefined
                        ? { appGroupId: appGroupId ?? null }
                        : {}),
                      ...(seat === "admin" && signUpEnabled !== undefined
                        ? { signUpEnabled: !!signUpEnabled }
                        : {}),
                      repeatRule: repeatRule ?? null,
                      repeatSeriesId,
                      repeatDetached: !repeatRule,
                    };
                    if (time) {
                      const startDay =
                        id === popover.eventId && popover.pendingStart
                          ? popover.pendingStart
                          : fromISOLocal(existingEv.startISO);
                      const endDay =
                        id === popover.eventId && popover.pendingEnd
                          ? popover.pendingEnd
                          : sessionInclusiveEndDay(
                              fromISOLocal(existingEv.startISO),
                              fromISOLocal(existingEv.endISO),
                            );
                      Object.assign(patch, {
                        ...isoFromMenuClocks(
                          startDay,
                          endDay,
                          time.startMin,
                          time.endMin,
                        ),
                        allDay: !!allDay,
                      });
                    } else if (allDay !== undefined) {
                      Object.assign(patch, { allDay: !!allDay });
                    }
                    if (accept && id === popover.eventId && existingEv.coachPending) {
                      (patch as Partial<CalendarEvent>).coachPending = false;
                      onUpsertEvent?.(patch);
                      onAcceptCoachSession?.(id);
                    } else {
                      onUpsertEvent?.(patch);
                    }
                    if (id === popover.eventId) materializeFrom = existingEv;
                  }
                  if (
                    repeatRule &&
                    materializeFrom &&
                    shouldMaterializeRepeatOnSave(
                      materializeFrom,
                      events,
                      repeatRule,
                    )
                  ) {
                    const existingEv = materializeFrom;
                    const repeatSeriesId =
                      sharedSeriesId ??
                      existingEv.repeatSeriesId ??
                      makeEventId();
                    const anchorStartISO =
                      time
                        ? toISOLocal(
                            setHM(
                              fromISOLocal(existingEv.startISO),
                              Math.floor(time.startMin / 60),
                              time.startMin % 60,
                            ),
                          )
                        : existingEv.startISO;
                    const anchorEndISO =
                      time
                        ? toISOLocal(
                            setHM(
                              fromISOLocal(existingEv.startISO),
                              Math.floor(time.endMin / 60),
                              time.endMin % 60,
                            ),
                          )
                        : existingEv.endISO;
                    const seriesTemplate = {
                      title: t,
                      color: effectiveColor,
                      categoryId:
                        effectiveCategoryId ?? existingEv.categoryId ?? undefined,
                      location: effectiveLocation,
                      locationUrl: effectiveLocationUrl,
                      startISO: anchorStartISO,
                      endISO: anchorEndISO,
                      allDay: !!allDay,
                      category: categoryFromColor(effectiveColor),
                      repeatRule,
                      repeatSeriesId,
                      ...(description !== undefined
                        ? { description: description ?? undefined }
                        : {}),
                      ...(seat === "admin" && appGroupId !== undefined
                        ? { appGroupId: appGroupId ?? null }
                        : {}),
                      ...(seat === "admin" && signUpEnabled !== undefined
                        ? { signUpEnabled: !!signUpEnabled }
                        : {}),
                    };
                    const plan = planRepeatSeriesSave(
                      existingEv,
                      events,
                      seriesTemplate,
                      repeatRule,
                      cell.date,
                      repeatSeriesId,
                      {
                        preserveEventId: popover.eventId,
                        skipStartISO: anchorStartISO,
                      },
                    );
                    if (plan) {
                      for (const inst of plan.upserts) {
                        onUpsertEvent?.(inst);
                      }
                      if (plan.deleteIds.length > 0) {
                        onDeleteEvents?.(plan.deleteIds);
                      }
                    }
                  }
                }
                closePopover();
                return;
              }

              // ── Creating a new item from month view. ──
              // Default to the unified event store so it appears in week view too.
              if (popover.editIdx < 0 && onUpsertEvent) {
                if (t) {
                  const effectiveTime = time ?? { startMin: 8 * 60, endMin: 9 * 60 };
                  const startDay = popover.pendingStart ?? cell.date;
                  const endDay = popover.pendingEnd ?? startDay;
                  const { startISO, endISO } = isoFromMenuClocks(
                    startDay,
                    endDay,
                    effectiveTime.startMin,
                    effectiveTime.endMin,
                  );
                  const createdAt = Date.now();
                  const template = {
                    title: t,
                    color: effectiveColor,
                    categoryId: effectiveCategoryId ?? undefined,
                    location: effectiveLocation,
                    locationUrl: effectiveLocationUrl,
                    startISO,
                    endISO,
                    allDay: !!allDay,
                    category: categoryFromColor(effectiveColor),
                    sortIndex: createdAt,
                    ...(description !== undefined
                      ? { description: description ?? undefined }
                      : {}),
                    ...(seat === "admin" && appGroupId !== undefined
                      ? { appGroupId: appGroupId ?? null }
                      : {}),
                    ...(seat === "admin" && signUpEnabled !== undefined
                      ? { signUpEnabled: !!signUpEnabled }
                      : {}),
                    repeatRule: repeatRule ?? null,
                    repeatDetached: !repeatRule,
                  };
                  if (repeatRule) {
                    for (const inst of expandRepeatingEvents(template, repeatRule, cell.date)) {
                      onUpsertEvent({ ...inst, sortIndex: createdAt });
                    }
                  } else {
                    onUpsertEvent(template);
                  }
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
          const tileStyle = (() => {
            const base = ev.coachPending
              ? ev.color
                ? sessionMonthChipChrome(ev.color, false)
                : {
                    backgroundColor: "hsl(var(--secondary))",
                    color: "hsl(var(--ink))",
                  }
              : ev.color
                ? sessionMonthChipChrome(ev.color, true)
                : {
                    backgroundColor: "hsl(var(--secondary))",
                    color: "#fff",
                  };
            if (!isMembershipOverlayEvent(ev, calId)) return base;
            const teamChip = teamMemberMonthChip(
              ev.color,
              true,
              signupResponse(ev.signUpEnabled, teamResponses, ev.id),
              darkTiles,
            );
            return {
              background: teamChip.background,
              backgroundColor: teamChip.backgroundColor,
              color: teamChip.color,
              boxShadow: teamChip.boxShadow,
            };
          })();
          return (
            <div
              ref={ghostElRef}
              className="pointer-events-none fixed z-[60]"
              style={{
                left,
                top,
                width: dragSession.chipWidth,
                height: dragSession.chipHeight,
                overflow: "visible",
                willChange: landing ? undefined : "left, top",
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
              {appKind === "diary" ? (
                <DiaryMonthReorderTile
                  ev={ev}
                  tileDesign={monthTileDesign}
                  unit={distanceUnit}
                  height="100%"
                  dragging
                />
              ) : (
                <div
                  className="relative flex h-full w-full items-center gap-1.5 truncate rounded-[3px] px-1.5 py-0.5 text-[11.5px]"
                  style={tileStyle}
                  data-coach-pending={ev.coachPending ? "1" : undefined}
                  title={ev.title}
                >
                  <span className="truncate">{ev.title}</span>
                </div>
              )}
            </div>
          );
        })()}
        {creatingDrag && (() => {
          const left = creatingDrag.pointerX - creatingDrag.offsetX;
          const top = creatingDrag.pointerY - creatingDrag.offsetY;
          const c = creatingDrag.color;
          return (
            <div
              ref={creatingGhostRef}
              className="pointer-events-none fixed z-[60]"
              style={{
                left,
                top,
                width: creatingDrag.chipWidth,
                height: creatingDrag.chipHeight,
                willChange: "left, top",
              }}
            >
              <div
                className="flex h-full w-full items-center overflow-hidden rounded-[3px] px-1.5 text-[11.5px] leading-none shadow-lg"
                style={
                  c
                    ? sessionMonthChipChrome(c, true)
                    : { backgroundColor: "hsl(var(--secondary))" }
                }
              >
                <span className="truncate">{creatingDrag.title}</span>
              </div>
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
              onForceClose={(closingEventId) => {
                cancelHoverClose();
                if (ev.coachPending && onAcceptCoachSession) {
                  onAcceptCoachSession(ev.id);
                }
                // Guard: a deferred close from a previously-active tile
                // must not nuke the editor the user just opened on a
                // different tile. Only clear if the hover still points
                // at the closing event.
                let stillMine = true;
                setHoverId((cur) => {
                  stillMine = !closingEventId || cur === closingEventId;
                  return stillMine ? null : cur;
                });
                if (stillMine) {
                  setHoverRect(null);
                  setForceEditId(null);
                }
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
              onUpsert={(patch) => {
                // Match week/day-view: any explicit edit (title, duration,
                // activity, color) committed via the inline editor on a
                // coach-pending session implicitly accepts the proposal.
                // commitEdit / TitleInput / "Lagre" / Enter all flow through
                // here, so folding the accept into the same patch guarantees
                // a single write with coach_pending=false instead of relying
                // on the outside-click path.
                if (ev.coachPending && onAcceptCoachSession) {
                  onUpsertEvent?.({ ...patch, coachPending: false });
                  onAcceptCoachSession(ev.id);
                } else {
                  onUpsertEvent?.(patch);
                }
              }}
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
              onAccept={onAcceptCoachSession ? () => onAcceptCoachSession(ev.id) : undefined}
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
        {pasteOverlay}
        {weekOverlay}
        {sessionContextOverlay}
        {pasteToastNode}
        {weekToastNode}
        {sessionContextToastNode}
      </div>
    </div>
  );
}

export interface PopoverEditorProps {
  seat: CalendarSeat;
  initialText: string;
  initialColor: string | null;
  initialCategoryId?: string | null;
  isEdit: boolean;
  anchor: DOMRect;
  /** Optional initial time range, in minutes from midnight. */
  initialTime?: { startMin: number; endMin: number } | null;
  initialAllDay?: boolean;
  /** When true, show the clock affordance for picking a duration. */
  enableDuration?: boolean;
  onClose: () => void;
  onCommit: (
    text: string,
    color: string | null,
    time?: { startMin: number; endMin: number } | null,
    /**
     * True when the commit came from an explicit save gesture (Enter key or
     * the "Lagre" button). False/undefined for outside-click autosave and
     * unmount-time autosave. The owner of a coach-pending session uses this
     * to know when to flip `coach_pending` off (accepting the proposal).
     */
    accept?: boolean,
    allDay?: boolean,
    /** Session description shown in the menu and synced to the store. */
    description?: string | null,
    /** Entity mode only — roster group id (`null` = entity-wide). */
    appGroupId?: string | null,
    /** Recurrence rule when repeat is enabled (`null` = one-off). */
    repeatRule?: SessionRepeatRule | null,
    /** Active activity/category id at commit time. */
    categoryId?: string | null,
    /** Free-text location / room. */
    location?: string | null,
    /** MazeMap (or other) deep link for the location. */
    locationUrl?: string | null,
    /** Entity mode only — whether participant signup is enabled. */
    signUpEnabled?: boolean,
    /**
     * When set (this / all-in-series scope after editing a repeating session),
     * apply the full commit patch to these event ids.
     */
    eventIds?: string[],
  ) => void;
  /** Entity mode only — initial roster group id. */
  initialAppGroupId?: string | null;
  /**
   * Entity mode only — fires when the user picks a different group so the
   * parent can persist without waiting for an explicit save.
   */
  onAppGroupChange?: (appGroupId: string | null, eventIds?: string[]) => void;
  /** Initial session description. */
  initialDescription?: string | null;
  /** Initial location / room text. */
  initialLocation?: string | null;
  /** Initial MazeMap (or other) deep link for the location. */
  initialLocationUrl?: string | null;
  /**
   * Fires the moment the user commits the inline duration picker (clock icon),
   * BEFORE the whole popover is saved. Lets the parent reflect the change in
   * its marked range immediately so the calendar stays in sync.
   */
  onTimeChange?: (
    time: { startMin: number; endMin: number } | null,
    /** When set (repeat series scope), patch these event ids. */
    eventIds?: string[],
  ) => void;
  /**
   * Fires the moment the user toggles the "All day" switch in the popover,
   * before the whole popover is saved. Lets the parent flip the bound
   * session tile's all-day flag in real time so the calendar reflects the
   * change immediately (mirrors `onTimeChange`).
   */
  onAllDayChange?: (
    allDay: boolean,
    time: { startMin: number; endMin: number } | null,
    /** When set (repeat series scope), patch these event ids. */
    eventIds?: string[],
  ) => void;
  /**
   * Fires when the user toggles "Enable sign up" (entity mode), including
   * after choosing this / all in series. Mirrors `onAllDayChange`.
   */
  onSignUpEnabledChange?: (enabled: boolean, eventIds?: string[]) => void;
  /**
   * Fires when the user confirms or clears a map/place location, including
   * after choosing this / all in series. Persists without closing the menu.
   */
  onLocationChange?: (
    location: string | null,
    locationUrl: string | null,
    /** When set (repeat series scope), patch these event ids. */
    eventIds?: string[],
  ) => void;
  /**
   * Clear repeat metadata (`repeatRule` / `repeatSeriesId`) on the given
   * session ids — used when turning Repeat off for this / all in series.
   */
  onClearRepeat?: (eventIds: string[]) => void;
  /**
   * Fires the moment the user picks a colour in the dropdown. Lets the parent
   * push the new color to the bound CalendarEvent so the session tile
   * reflects the selection in real time.
   */
  onColorChange?: (color: string | null, eventIds?: string[]) => void;
  /**
   * Fires on each title keystroke so a session that is still being created
   * can show the text on its tile immediately.
   */
  onTitleChange?: (title: string) => void;
  /**
   * Fires when the user picks a from/to range in the date calendar. The menu
   * stays open; the parent moves the session onto those days.
   */
  onDateChange?: (range: { start: Date; end: Date }, eventIds?: string[]) => void;
  onCategoryChange?: (selection: CategorySelection) => void;
  /**
   * When true, the popover renders as a view-only panel: the title input is
   * not focusable/editable, and the colour dropdown and time wheel are
   * non-interactive. Used when a coach / group leader views a client's
   * session — they can see the details but cannot change them.
   */
  readOnly?: boolean;
  /**
   * Team session opened from a member's own calendar. Timed sessions show
   * only the from-date. Repeat and description stay out of this menu.
   */
  memberTeamMenu?: boolean;
  /** Entity that owns this session, when the menu is the member view. */
  memberTeamId?: string | null;
  /** Optional override for the title input's placeholder. */
  placeholder?: string;
  /** Active team id (admin seat only). Scopes the category dropdown list. */
  teamId?: string | null;
  /** Calendar id (`user:…`, `team:…`, `client:…`) — scopes category list. */
  calId?: string;
  /** Optional personal-category owner when viewing/editing another user's calendar. */
  categoryOwnerId?: string | null;
  /** Clipboard source view for copy/paste (entity session panel). */
  viewMode?: ViewMode;
  /** Existing event snapshot — enables copy session in the header menu. */
  eventForCopy?: CalendarEvent | null;
  /** Wall-clock date the session is anchored on (repeat + weekday/weekend options). */
  sessionDate?: Date;
  /** Inclusive last calendar day when the session spans more than one day. */
  sessionEndDate?: Date;
  /**
   * Month-view day cell the panel is bound to (`data-cell-pos`). Live
   * re-anchor uses this cell instead of the first matching tile in the DOM.
   */
  anchorCellPos?: { row: number; col: number } | null;
  /** Initial recurrence rule when editing an existing repeating session. */
  initialRepeatRule?: SessionRepeatRule | null;
  /** Live repeat chips on the calendar while the panel is open. */
  onRepeatPreviewChange?: (preview: RepeatLivePreview | null) => void;
  /** All calendar events — used to resolve repeat-series delete scopes. */
  calendarEvents?: CalendarEvent[];
  /** Delete one or more sessions without going through onCommit(""). */
  onDeleteSessions?: (ids: string[], options?: { close?: boolean }) => void;
  /**
   * Restore side-panel open state when the editor remounts (e.g. after a
   * week/day drag-drop that closed then reopened the popover). Only applied
   * on mount — unrelated prop updates must not reset the panels.
   */
  initialSignUpEnabled?: boolean;
  initialParticipantsPanelOpen?: boolean;
  initialLocationMapOpen?: boolean;
  /** Notifies the parent whenever side-panel open flags change so they can survive close/reopen. */
  onSidePanelsChange?: (next: {
    signUpEnabled: boolean;
    participantsPanelOpen: boolean;
    locationMapOpen: boolean;
  }) => void;
  /**
   * Hide the portaled cluster without unmounting. Month drag and week/day
   * edge-resize use this so side-panel React state survives the gesture.
   */
  hidden?: boolean;
  /**
   * Incremented by week/day tile edge-resize after the new times are written.
   * Opens the this/all series scope menu when the bound session is repeating.
   */
  externalTimeCommitNonce?: number;
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
 * Colour dropdown uses the same palette as the three-dot category menus.
 */
const POPOVER_ACTIVITY_TEXT = "text-[12px] text-ink";
const POPOVER_CONTENT_GAP = "gap-2.5";
const POPOVER_FIELD_PY = "py-3";
const POPOVER_ROW_INDENT = "pl-3";
const SESSION_DESCRIPTION_MAX_LENGTH = 500;
/** Fixed well — similar to Notion Calendar’s description box; not user-resizable. */
const SESSION_DESCRIPTION_FIELD_H = 88;

function fitTextToFixedTextarea(
  el: HTMLTextAreaElement | null,
  next: string,
  previous: string,
): string {
  const clipped = next.slice(0, SESSION_DESCRIPTION_MAX_LENGTH);
  if (!el || el.clientHeight < 8) return clipped;
  el.value = clipped;
  if (el.scrollHeight <= el.clientHeight + 1) return clipped;
  let lo = 0;
  let hi = clipped.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    el.value = clipped.slice(0, mid);
    if (el.scrollHeight <= el.clientHeight + 1) lo = mid;
    else hi = mid - 1;
  }
  const fitted = clipped.slice(0, lo);
  el.value = fitted || previous;
  return fitted || previous;
}

function escapeAttrSelector(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

function monthDayCellSelector(pos: { row: number; col: number }): string {
  return `[data-cell-pos="${pos.row}-${pos.col}"][data-day-anchor]`;
}

/** Day cell under the pointer, including cells covered by a spanning session bar. */
type MonthEdgePulse = {
  over: (clientX: number, clientY: number) => void;
  leave: () => void;
  stop: () => void;
  isPulsing: () => boolean;
};

/**
 * One-month edge pulse shared by multi-day create and moving an existing tile.
 * The first month arms in the outer band. After that, the pointer has to stay
 * on the rim or the next month is cancelled.
 */
function createMonthEdgePulse(host: {
  scroller: () => HTMLElement | null;
  rowHeight: () => number;
  weekCount: () => number;
  monthStarts: () => { week: number }[];
  getMount: () => { start: number; end: number };
  setMount: (next: { start: number; end: number }) => void;
  lock: { current: boolean };
  sync: () => void;
  onFrame: (hit: { row: number; col: number } | null) => void;
  onPulseEnd: () => void;
}): MonthEdgePulse {
  let raf = 0;
  let holdTimer = 0;
  let intervalTimer = 0;
  let removed = false;
  let edge: -1 | 0 | 1 = 0;
  let paging = false;
  let pointerX = 0;
  let pointerY = 0;
  let viewTop = 0;
  let viewBottom = 0;
  let pulse: { from: number; target: number; t0: number; dur: number } | null = null;
  let geom: {
    viewTop: number;
    viewBottom: number;
    gridLeft: number;
    gridWidth: number;
    gridTopAt0: number;
  } | null = null;

  const clearPulseTimers = () => {
    if (holdTimer) window.clearTimeout(holdTimer);
    if (intervalTimer) window.clearTimeout(intervalTimer);
    holdTimer = 0;
    intervalTimer = 0;
  };

  const edgeAt = (el: HTMLElement, clientY: number): -1 | 0 | 1 => {
    if (!pulse) {
      const rect = el.getBoundingClientRect();
      viewTop = rect.top;
      viewBottom = rect.bottom;
    }
    return monthCreateEdgeZone(clientY, viewTop, viewBottom, paging);
  };

  const stillAtRim = (repeat: boolean): boolean => {
    const el = host.scroller();
    if (!el) return false;
    if (!pulse) {
      const rect = el.getBoundingClientRect();
      viewTop = rect.top;
      viewBottom = rect.bottom;
    }
    const zone = monthCreateEdgeZone(pointerY, viewTop, viewBottom, repeat);
    edge = zone;
    return zone !== 0;
  };

  const hitAt = (scrollTop: number): { row: number; col: number } | null => {
    if (!geom) return null;
    const rowHeight = host.rowHeight();
    if (rowHeight <= 0) return null;
    const y = Math.max(geom.viewTop, Math.min(geom.viewBottom - 0.01, pointerY));
    const x = Math.max(geom.gridLeft, Math.min(geom.gridLeft + geom.gridWidth - 0.01, pointerX));
    const row = Math.floor((y - (geom.gridTopAt0 - scrollTop)) / rowHeight);
    const colWidth = geom.gridWidth / 7;
    if (colWidth <= 0) return null;
    const col = Math.floor((x - geom.gridLeft) / colWidth);
    if (row < 0 || col < 0 || col > 6) return null;
    return { row, col };
  };

  const coverPulseWeeks = (el: HTMLElement, target: number) => {
    const row = host.rowHeight();
    const weekCount = host.weekCount();
    const from = visibleWeekRows(el.scrollTop, el.clientHeight, row, weekCount);
    const dest = visibleWeekRows(target, el.clientHeight, row, weekCount);
    const next = {
      start: Math.max(0, Math.min(from.start, dest.start) - MONTH_RENDER_OVERSCAN),
      end: Math.min(weekCount - 1, Math.max(from.end, dest.end) + MONTH_RENDER_OVERSCAN),
    };
    const current = host.getMount();
    if (next.start === current.start && next.end === current.end) return;
    host.setMount(next);
  };

  const finishPulse = () => {
    const el = host.scroller();
    if (el) el.style.willChange = "";
    host.lock.current = false;
    pulse = null;
    geom = null;
    host.sync();
    host.onPulseEnd();
    if (removed || edge === 0) return;
    const wait = Math.max(0, MONTH_CREATE_PULSE_INTERVAL_MS - monthCreatePulseDuration());
    intervalTimer = window.setTimeout(() => {
      intervalTimer = 0;
      if (removed || !stillAtRim(true)) return;
      runPulse();
    }, wait);
  };

  const tick = (ts: number) => {
    raf = 0;
    if (removed || !pulse) return;
    const el = host.scroller();
    if (!el) {
      finishPulse();
      return;
    }
    if (pulse.t0 === 0) pulse.t0 = ts;
    const elapsed = ts - pulse.t0;
    el.scrollTop = monthCreatePulseScroll(pulse.from, pulse.target, elapsed, pulse.dur);
    host.onFrame(hitAt(el.scrollTop));
    if (elapsed < pulse.dur) {
      raf = requestAnimationFrame(tick);
      return;
    }
    el.scrollTop = pulse.target;
    host.onFrame(hitAt(el.scrollTop));
    finishPulse();
  };

  const runPulse = () => {
    if (pulse || edge === 0 || removed) return;
    const el = host.scroller();
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const target = nextMonthOriginScroll(
      el.scrollTop,
      edge,
      host.rowHeight(),
      host.monthStarts(),
      max,
    );
    if (target == null || Math.abs(target - el.scrollTop) < 0.5) return;
    coverPulseWeeks(el, target);
    const view = el.getBoundingClientRect();
    const grid = el.querySelector<HTMLElement>("[data-month-grid]");
    const gridRect = grid?.getBoundingClientRect();
    if (gridRect) {
      geom = {
        viewTop: view.top,
        viewBottom: view.bottom,
        gridLeft: gridRect.left + 28,
        gridWidth: gridRect.width - 28,
        gridTopAt0: gridRect.top + el.scrollTop,
      };
    }
    viewTop = view.top;
    viewBottom = view.bottom;
    el.style.willChange = "scroll-position";
    host.lock.current = true;
    pulse = {
      from: el.scrollTop,
      target,
      t0: 0,
      dur: monthCreatePulseDuration(),
    };
    raf = requestAnimationFrame(tick);
  };

  return {
    over(clientX: number, clientY: number) {
      pointerX = clientX;
      pointerY = clientY;
      if (removed) return;
      const el = host.scroller();
      if (!el) return;
      const next = edgeAt(el, clientY);
      if (next === edge) return;
      edge = next;
      clearPulseTimers();
      if (next === 0 || pulse) return;
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        if (removed || !stillAtRim(paging)) return;
        paging = true;
        runPulse();
      }, MONTH_CREATE_PULSE_HOLD_MS);
    },
    leave() {
      edge = 0;
      paging = false;
      clearPulseTimers();
    },
    stop() {
      removed = true;
      edge = 0;
      paging = false;
      clearPulseTimers();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pulse = null;
      geom = null;
      const el = host.scroller();
      if (el) el.style.willChange = "";
      host.lock.current = false;
    },
    isPulsing: () => pulse != null,
  };
}

function monthCellFromPoint(x: number, y: number): HTMLElement | null {
  for (const node of document.elementsFromPoint(x, y)) {
    if (!(node instanceof Element)) continue;
    const cell = node.closest<HTMLElement>("[data-cell-pos][data-day-anchor]");
    if (cell) return cell;
  }
  return null;
}

function monthCellPos(cell: HTMLElement | null): { row: number; col: number } | null {
  const posStr = cell?.getAttribute("data-cell-pos");
  if (!posStr) return null;
  const [rowS, colS] = posStr.split("-");
  const row = Number(rowS);
  const col = Number(colS);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return { row, col };
}

function isLaidOut(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Live re-anchor for the session panel (resize / drop).
 *
 * Month view follows the bound day cell (`cellPos`). A document-order
 * `querySelector([data-event-id])` is biased left-to-right / top-to-bottom:
 * leftover source chips win when dragging right or down, so the menu
 * measures the wrong cell. Week/day overlay tiles are not inside a month
 * day-cell, so fall back to the tile itself (right-of-tile placement).
 */
function findLiveSessionAnchorEl(args: {
  eventId?: string | null;
  preferDayCell: boolean;
  cellPos?: { row: number; col: number } | null;
}): HTMLElement | null {
  if (args.preferDayCell && args.cellPos) {
    const cell = document.querySelector<HTMLElement>(monthDayCellSelector(args.cellPos));
    if (cell && isLaidOut(cell)) return cell;
  }

  const tiles: HTMLElement[] = [];
  if (args.eventId) {
    tiles.push(
      ...document.querySelectorAll<HTMLElement>(
        `[data-event-id="${escapeAttrSelector(args.eventId)}"]`,
      ),
    );
  }
  if (tiles.length === 0) {
    tiles.push(...document.querySelectorAll<HTMLElement>('[data-session-active="1"]'));
  }

  const inCells = tiles
    .map((tile) => ({
      tile,
      cell: tile.closest<HTMLElement>("[data-day-anchor]"),
    }))
    .filter((x): x is { tile: HTMLElement; cell: HTMLElement } => {
      if (!x.cell) return false;
      return isLaidOut(x.tile) || isLaidOut(x.cell);
    });
  const active = inCells.find((x) => x.tile.getAttribute("data-session-active") === "1");
  const picked = active ?? inCells[0];
  if (picked) {
    if (args.preferDayCell) return picked.cell;
    return isLaidOut(picked.tile) ? picked.tile : picked.cell;
  }

  const laidOutTiles = tiles.filter(isLaidOut);
  const pool = laidOutTiles.length > 0 ? laidOutTiles : tiles;
  const activeTile = pool.find((tile) => tile.getAttribute("data-session-active") === "1");
  return activeTile ?? pool[0] ?? null;
}

function readLiveSessionAnchorRect(args: {
  eventId?: string | null;
  fallback: DOMRect;
  preferDayCell: boolean;
  cellPos?: { row: number; col: number } | null;
}): DOMRect {
  const source = findLiveSessionAnchorEl(args);
  if (!source) return args.fallback;
  const r = source.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return args.fallback;
  return r;
}

function MemberTeamResponseButtons({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const responses = useTeamSessionResponses();
  const current = responses[eventId] ?? null;
  const choose = (next: TeamSessionResponse) => {
    if (!user?.id) return;
    setTeamSessionResponse(user.id, eventId, current === next ? null : next);
  };
  const button = (
    kind: TeamSessionResponse,
    label: string,
    color: string,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={current === kind}
      title={label}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        choose(kind);
      }}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-secondary/60"
      style={{
        color,
        backgroundColor: current === kind ? `${color}22` : undefined,
      }}
    >
      {icon}
    </button>
  );
  return (
    <span className="flex items-center gap-0.5">
      {button("accepted", "Accept session", "#34c759", <Check className="h-4 w-4" strokeWidth={2.25} />)}
      {button("declined", "Cancel session", "#ff3b30", <X className="h-4 w-4" strokeWidth={2.25} />)}
    </span>
  );
}

function MemberTeamNameField({ name }: { name: string }) {
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  return (
    <div className="flex min-h-[40px] min-w-0 items-center px-3 py-3 text-[13px] text-ink">
      <span
        ref={textRef}
        title={name}
        className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap"
        style={
          overflows
            ? {
                WebkitMaskImage:
                  "linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent)",
                maskImage:
                  "linear-gradient(to right, #000 0, #000 calc(100% - 28px), transparent)",
              }
            : undefined
        }
      >
        {name}
      </span>
    </div>
  );
}

export function PopoverEditor({
  seat,
  initialText,
  initialColor,
  initialCategoryId = null,
  isEdit,
  anchor,
  initialTime = null,
  initialAllDay = false,
  enableDuration = false,
  onClose,
  memberTeamMenu = false,
  memberTeamId = null,
  onCommit,
  onTimeChange,
  onAllDayChange,
  onSignUpEnabledChange,
  onLocationChange,
  onClearRepeat,
  onColorChange,
  onTitleChange,
  onDateChange,
  readOnly = false,
  placeholder = "Session title",
  teamId = null,
  initialDescription = null,
  initialLocation = null,
  initialLocationUrl = null,
  initialAppGroupId = null,
  onAppGroupChange,
  viewMode = "month",
  eventForCopy = null,
  sessionDate,
  sessionEndDate,
  anchorCellPos = null,
  initialRepeatRule = null,
  onRepeatPreviewChange,
  calendarEvents = [],
  onDeleteSessions,
  initialSignUpEnabled = false,
  initialParticipantsPanelOpen = false,
  initialLocationMapOpen = false,
  onSidePanelsChange,
  hidden = false,
  externalTimeCommitNonce: _externalTimeCommitNonce = 0,
}: PopoverEditorProps) {
  const darkMenu = useCalendarTheme() === "dark";
  const isEntity = seat === "admin";
  const rememberedTeamName = useTeamName(memberTeamMenu ? memberTeamId : null);
  const { groups: ownedTeams } = useUserGroups();
  const ownedTeamName = memberTeamId
    ? ownedTeams.find((team) => team.id === memberTeamId)?.name?.trim() ?? ""
    : "";
  const memberTeamName = (rememberedTeamName || ownedTeamName).trim();
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const resolvedSessionDate = useMemo(() => {
    if (sessionDate) return startOfDay(sessionDate);
    if (eventForCopy?.startISO) return startOfDay(fromISOLocal(eventForCopy.startISO));
    return startOfDay(new Date());
  }, [sessionDate, eventForCopy?.startISO]);
  const resolvedEndDate = useMemo(() => {
    if (sessionEndDate) return startOfDay(sessionEndDate);
    if (eventForCopy?.startISO && eventForCopy.endISO) {
      return sessionInclusiveEndDay(
        fromISOLocal(eventForCopy.startISO),
        fromISOLocal(eventForCopy.endISO),
      );
    }
    return resolvedSessionDate;
  }, [sessionEndDate, eventForCopy?.startISO, eventForCopy?.endISO, resolvedSessionDate]);
  const { copyEventsToClipboard, duplicateEvent } = useCalendarViewActions();
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const resolvedRepeat = useMemo(() => {
    const target =
      eventForCopy?.id != null
        ? calendarEvents.find((e) => e.id === eventForCopy.id) ?? eventForCopy
        : eventForCopy;
    const resolved = resolveSessionRepeatState(target, calendarEvents);
    if (resolved.enabled) return resolved;
    if (initialRepeatRule) return { enabled: true, rule: initialRepeatRule };
    return resolved;
  }, [eventForCopy, calendarEvents, initialRepeatRule]);
  const repeatUserTouchedRef = useRef(false);
  const [repeatConfigDirty, setRepeatConfigDirty] = useState(false);
  const [value, setValue] = useState(initialText);
  // Existing sessions keep their saved colour. New sessions use the user's
  // default colour so the tile and the colour dropdown agree from the first paint.
  const [color, setColorState] = useState<string | null>(
    initialColor ?? (isEdit ? null : getSessionDefaultColor()),
  );
  useEffect(() => {
    if (initialColor == null) return;
    setColorState((cur) => (cur === initialColor ? cur : initialColor));
  }, [initialColor]);
  const [liveCategoryId, setLiveCategoryId] = useState(initialCategoryId ?? null);
  useEffect(() => {
    setLiveCategoryId(initialCategoryId ?? null);
  }, [initialCategoryId]);
  const defaultTimedRange = { startMin: 8 * 60, endMin: 9 * 60 };
  const [time, setTime] = useState<{ startMin: number; endMin: number } | null>(
    initialTime ?? (enableDuration && !isEdit ? defaultTimedRange : null),
  );
  const [allDay, setAllDay] = useState<boolean>(!!initialAllDay);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [signUpEnabled, setSignUpEnabled] = useState(!!initialSignUpEnabled);
  const [participantsPanelOpen, setParticipantsPanelOpen] = useState(
    !!initialParticipantsPanelOpen,
  );
  const [locationMapOpen, setLocationMapOpen] = useState(!!initialLocationMapOpen);
  const locationMapPanelRef = useRef<SessionLocationMapPanelHandle | null>(null);
  const sessionCardRef = useRef<HTMLDivElement | null>(null);
  const [locationSearchHandoff, setLocationSearchHandoff] =
    useState<SessionLocationMapSearchHandoff | null>(null);
  const [location, setLocation] = useState(initialLocation ?? "");
  const [locationUrl, setLocationUrl] = useState(initialLocationUrl ?? "");
  const locationRef = useRef(location);
  const locationUrlRef = useRef(locationUrl);
  locationRef.current = location;
  locationUrlRef.current = locationUrl;
  const captureMapSearchHandoff = useCallback(() => {
    const handoff = locationMapPanelRef.current?.getSearchHandoff();
    if (!handoff) return;
    const q = handoff.query.trim();
    const hasResults = handoff.suggestions.length > 0;
    const midSearch = q.length >= 2 && q !== locationRef.current.trim();
    if (hasResults || midSearch) {
      setLocationSearchHandoff({
        query: handoff.query,
        suggestions: handoff.suggestions,
      });
    }
  }, []);
  const mapPanelFits = useSessionMapPanelFits(
    SESSION_CARD_WIDTH_PX,
    sessionCardRef,
    locationMapOpen,
    captureMapSearchHandoff,
  );
  const onSidePanelsChangeRef = useRef(onSidePanelsChange);
  onSidePanelsChangeRef.current = onSidePanelsChange;
  // Layout so the parent ref is current before the next pointer event
  // (drag-start close) can unmount this editor.
  useLayoutEffect(() => {
    onSidePanelsChangeRef.current?.({
      signUpEnabled,
      participantsPanelOpen,
      locationMapOpen,
    });
  }, [signUpEnabled, participantsPanelOpen, locationMapOpen]);
  useLayoutEffect(() => {
    if (mapPanelFits || !locationMapOpen) return;
    setLocationMapOpen(false);
  }, [mapPanelFits, locationMapOpen]);
  const [repeatEnabled, setRepeatEnabled] = useState(() => resolvedRepeat.enabled);
  const [repeatRule, setRepeatRule] = useState<SessionRepeatRule>(() => resolvedRepeat.rule);
  const [appGroupId, setAppGroupId] = useState<string | null>(initialAppGroupId ?? null);
  const { members: rosterMembers, loading: rosterLoading } = useEntityRoster(
    isEntity ? teamId : null,
  );
  const audienceResponses = useSessionAudienceResponses(
    isEntity && signUpEnabled ? eventForCopy?.id ?? null : null,
  );
  const signedUpCount = useMemo(() => {
    if (!isEntity || !signUpEnabled) return 0;
    return sessionAudienceMembers(rosterMembers, appGroupId).filter(
      (member) =>
        signupTabForRosterMember(
          member,
          audienceResponses.byMember,
          audienceResponses.byUser,
        ) === "accepted",
    ).length;
  }, [isEntity, signUpEnabled, rosterMembers, appGroupId, audienceResponses]);
  type LocationScopeValue = { location: string; locationUrl: string };
  const [seriesEditScope, setSeriesEditScope] = useState<"this" | "allInSeries">("this");
  const seriesEditScopeRef = useRef<"this" | "allInSeries">("this");
  seriesEditScopeRef.current = seriesEditScope;
  /** Series member ids at open, so All still works if This detaches this row. */
  const seriesMemberIdsRef = useRef<string[] | null>(null);
  const eventForCopyRef = useRef(eventForCopy);
  const calendarEventsRef = useRef(calendarEvents);
  eventForCopyRef.current = eventForCopy;
  calendarEventsRef.current = calendarEvents;
  const allDaySwitchRef = useRef<HTMLLabelElement | null>(null);
  const signUpSwitchRef = useRef<HTMLLabelElement | null>(null);
  const repeatRowRef = useRef<HTMLDivElement | null>(null);
  const durationRowRef = useRef<HTMLDivElement | null>(null);
  const locationFieldRef = useRef<HTMLDivElement | null>(null);
  const locationMapWrapRef = useRef<HTMLDivElement | null>(null);
  const colorRowRef = useRef<HTMLDivElement | null>(null);
  const headerActionsRef = useRef<HTMLDivElement | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionDirtyRef = useRef(false);
  const lastDescriptionWriteRef = useRef<string | null>(
    (initialDescription ?? "").trim() || null,
  );
  const previousTimedRangeRef = useRef<{ startMin: number; endMin: number }>(
    initialTime ?? defaultTimedRange,
  );

  const savedDescriptionText = (initialDescription ?? "").trim();

  useEffect(() => {
    repeatUserTouchedRef.current = false;
    setRepeatConfigDirty(false);
    seriesEditScopeRef.current = "this";
    setSeriesEditScope("this");
    seriesMemberIdsRef.current = null;
  }, [eventForCopy?.id]);

  useEffect(() => {
    if (repeatUserTouchedRef.current) return;
    setRepeatEnabled(resolvedRepeat.enabled);
    setRepeatRule(resolvedRepeat.rule);
  }, [resolvedRepeat.enabled, resolvedRepeat.rule, eventForCopy?.id]);

  useEffect(() => {
    if (!isEntity) return;
    setAppGroupId(initialAppGroupId ?? null);
  }, [isEntity, initialAppGroupId]);

  useLayoutEffect(() => {
    if (descriptionDirtyRef.current) return;
    if (savedDescriptionText) {
      setDescription(initialDescription ?? "");
    }
  }, [initialDescription, savedDescriptionText]);

  useEffect(() => {
    const normalized = savedDescriptionText || null;
    if (descriptionDirtyRef.current) return;
    if (normalized === lastDescriptionWriteRef.current) return;
    lastDescriptionWriteRef.current = normalized;
    setDescription(initialDescription ?? "");
  }, [initialDescription, savedDescriptionText]);

  const handleDescriptionInput = (text: string) => {
    descriptionDirtyRef.current = true;
    setDescription(
      fitTextToFixedTextarea(descriptionInputRef.current, text, descriptionRef.current),
    );
  };

  const commitDescription = (): string | null => {
    const desc = (descriptionRef.current ?? "").trim() || null;
    lastDescriptionWriteRef.current = desc;
    descriptionDirtyRef.current = false;
    return desc;
  };
  const commitAppGroupId = (): string | null | undefined => {
    if (!isEntity) return undefined;
    return appGroupIdRef.current ?? null;
  };
  const commitRepeatRule = (): SessionRepeatRule | null => {
    if (repeatEnabledRef.current) return repeatRuleRef.current;
    // Opening a series member can lag behind stored metadata. Never strip
    // an existing series unless the user chose Don't repeat.
    if (!repeatUserTouchedRef.current) {
      const resolved = resolveSessionRepeatState(
        eventForCopyRef.current,
        calendarEventsRef.current,
      );
      if (resolved.enabled) return resolved.rule;
    }
    return null;
  };
  const commitCategoryId = (): string | null => liveCategoryIdRef.current ?? null;
  const commitLocation = (): string | null => {
    const next = (locationRef.current ?? "").trim();
    return next || null;
  };
  const commitLocationUrl = (): string | null => {
    const next = (locationUrlRef.current ?? "").trim();
    return next || null;
  };
  const commitSignUpEnabled = (): boolean | undefined => {
    if (!isEntity) return undefined;
    return !!signUpEnabledRef.current;
  };

  const isRepeatSeriesSession = (): boolean => {
    if (!eventForCopy) return false;
    return sessionIsRepeatSeries(eventForCopy, calendarEvents) || resolvedRepeat.enabled;
  };

  const showSeriesScopeTabs =
    !readOnly && isEdit && !!eventForCopy && isRepeatSeriesSession();

  useEffect(() => {
    if (!eventForCopy || !isPersistedRepeatSeries(eventForCopy, calendarEvents)) {
      return;
    }
    seriesMemberIdsRef.current = eventIdsForDeleteScope(
      "allInSeries",
      calendarEvents,
      eventForCopy,
    );
  }, [eventForCopy, calendarEvents]);

  const seriesEventIdsIfAny = (): string[] | undefined => {
    if (!eventForCopy) return undefined;
    if (!showSeriesScopeTabs && !seriesMemberIdsRef.current) return undefined;
    if (seriesEditScopeRef.current === "this") return [eventForCopy.id];
    const live = eventIdsForDeleteScope(
      "allInSeries",
      calendarEvents,
      eventForCopy,
    );
    const snap = seriesMemberIdsRef.current ?? [];
    return [...new Set([...snap, ...live, eventForCopy.id])];
  };

  const applyWithSeriesScope = (fn: (ids: string[] | undefined) => void) => {
    fn(seriesEventIdsIfAny());
  };

  const applyAllDayChange = useCallback(
    (next: boolean, eventIds?: string[]) => {
      if (next) {
        if (time && time.endMin > time.startMin) previousTimedRangeRef.current = time;
        setAllDay(true);
        onAllDayChange?.(true, { startMin: 0, endMin: 0 }, eventIds);
      } else {
        const nextTime = defaultTimedRange;
        setAllDay(false);
        setTime(nextTime);
        onTimeChange?.(nextTime, eventIds);
        onAllDayChange?.(false, nextTime, eventIds);
      }
    },
    [onAllDayChange, onTimeChange, time],
  );

  const applySignUpChange = useCallback(
    (next: boolean, eventIds?: string[]) => {
      setSignUpEnabled(next);
      if (!next) setParticipantsPanelOpen(false);
      onSignUpEnabledChange?.(next, eventIds);
    },
    [onSignUpEnabledChange],
  );

  const applyLocationChange = useCallback(
    (next: LocationScopeValue, eventIds?: string[]) => {
      setLocation(next.location);
      setLocationUrl(next.locationUrl);
      locationRef.current = next.location;
      locationUrlRef.current = next.locationUrl;
      initialSnapshotRef.current = {
        ...initialSnapshotRef.current,
        location: next.location.trim() || null,
        locationUrl: next.locationUrl.trim() || null,
      };
      onLocationChange?.(
        next.location.trim() || null,
        next.locationUrl.trim() || null,
        eventIds,
      );
    },
    [onLocationChange],
  );

  /** Turn Repeat off: keep this instance; all-in-series also removes the rest. */
  const applyRepeatOff = useCallback(
    (scope: SessionDeleteScope) => {
      repeatUserTouchedRef.current = true;
      setRepeatConfigDirty(true);
      setRepeatEnabled(false);
      if (!eventForCopy) return;
      onClearRepeat?.([eventForCopy.id]);
      if (scope !== "allInSeries") return;
      const removeIds = eventIdsForDeleteScope(
        "allInSeries",
        calendarEvents,
        eventForCopy,
      ).filter((id) => id !== eventForCopy.id);
      if (removeIds.length > 0) {
        onDeleteSessions?.(removeIds, { close: false });
      }
    },
    [calendarEvents, eventForCopy, onClearRepeat, onDeleteSessions],
  );

  /** Split this occurrence out of the series immediately (This session). */
  const detachThisSessionFromSeries = useCallback(() => {
    repeatUserTouchedRef.current = true;
    setRepeatConfigDirty(true);
    setRepeatEnabled(false);
    if (!eventForCopy) return;
    onClearRepeat?.([eventForCopy.id]);
  }, [eventForCopy, onClearRepeat]);

  /** Filled after commit helpers / snapshot exist — used by series save scope. */
  const flushCommitRef = useRef<
    (accept?: boolean, eventIds?: string[]) => void
  >(() => {});

  const handleColorPick = (c: string | null) => {
    if (readOnly) return;
    setColorState(c);
    applyWithSeriesScope((ids) => onColorChange?.(c, ids));
  };

  const handleGroupPick = (nextGroupId: string | null) => {
    if (readOnly) return;
    setAppGroupId(nextGroupId);
    applyWithSeriesScope((ids) => onAppGroupChange?.(nextGroupId, ids));
  };

  const handleAllDaySwitch = (next: boolean) => {
    if (readOnly) return;
    applyWithSeriesScope((ids) => applyAllDayChange(next, ids));
  };

  const handleSignUpSwitch = (next: boolean) => {
    if (readOnly) return;
    applyWithSeriesScope((ids) => applySignUpChange(next, ids));
  };

  const handleRepeatToggle = (next: boolean) => {
    if (readOnly) return;
    if (next) {
      repeatUserTouchedRef.current = true;
      setRepeatConfigDirty(true);
      setRepeatEnabled(true);
      setRepeatRule(resolvedRepeat.rule ?? SESSION_REPEAT_DEFAULT);
      return;
    }
    applyRepeatOff(seriesEditScopeRef.current);
  };

  const handleRepeatRuleChange = (next: SessionRepeatRule) => {
    if (readOnly) return;
    if (seriesEditScopeRef.current === "this" && isRepeatSeriesSession()) {
      detachThisSessionFromSeries();
    }
    repeatUserTouchedRef.current = true;
    setRepeatConfigDirty(true);
    setRepeatEnabled(true);
    setRepeatRule(next);
  };

  const handleTimeChange = (t: { startMin: number; endMin: number }) => {
    if (readOnly) return;
    applyWithSeriesScope((ids) => {
      if (allDay) {
        setAllDay(false);
        onAllDayChange?.(false, t, ids);
      }
      setTime(t);
      previousTimedRangeRef.current = t;
      onTimeChange?.(t, ids);
    });
  };

  const handleLocationChange = (next: LocationScopeValue) => {
    if (readOnly) return;
    const same =
      (locationRef.current.trim() || "") === (next.location.trim() || "") &&
      (locationUrlRef.current.trim() || "") === (next.locationUrl.trim() || "");
    setLocation(next.location);
    setLocationUrl(next.locationUrl);
    locationRef.current = next.location;
    locationUrlRef.current = next.locationUrl;
    if (same) return;
    applyWithSeriesScope((ids) => applyLocationChange(next, ids));
  };

  const [menuDate, setMenuDate] = useState<Date | null>(null);
  const [menuEndDate, setMenuEndDate] = useState<Date | null>(null);
  useEffect(() => {
    setMenuDate(null);
    setMenuEndDate(null);
  }, [resolvedSessionDate.getTime(), resolvedEndDate.getTime()]);
  const displayStartDate = menuDate ?? resolvedSessionDate;
  const displayEndDate = menuEndDate ?? resolvedEndDate;
  const multiDay = isMultiDayDateRange(displayStartDate, displayEndDate);

  const displayAllDay = allDay && !multiDay;
  const displaySignUpEnabled = signUpEnabled;
  const displayRepeatEnabled = repeatEnabled;
  const displayRepeatRule = repeatRule;
  // Sync the wheel when the parent pushes a new initialTime (e.g. while the
  // user is dragging a tile's top/bottom edge to resize it in the week-view).
  useEffect(() => {
    if (!initialAllDay || multiDay) return;
    setAllDay(true);
  }, [initialAllDay, multiDay]);

  useEffect(() => {
    if (!initialTime) return;
    previousTimedRangeRef.current = initialTime;
    setTime((cur) =>
      cur && cur.startMin === initialTime.startMin && cur.endMin === initialTime.endMin
        ? cur
        : initialTime,
    );
  }, [initialTime?.startMin, initialTime?.endMin]);

  const ref = useRef<HTMLDivElement | null>(null);
  const dateMenuFits = useSessionAdjacentMenuFits(sessionCardRef, ref);

  useEffect(() => {
    if (!multiDay || !allDay) return;
    // The all-day switch is hidden for a multi-day span. Clear the flag only.
    // applyAllDayChange(false) would rewrite both ends onto the start day and
    // drop a widened top-row session into the hour grid.
    setAllDay(false);
    onAllDayChange?.(false, null);
  }, [multiDay, allDay, onAllDayChange]);

  // Keep latest values for the unmount-time autosave to avoid stale captures.
  const valueRef = useRef(value);
  const colorRef = useRef(color);
  const timeRef = useRef(time);
  const allDayRef = useRef(allDay);
  const descriptionRef = useRef(description);
  const repeatEnabledRef = useRef(repeatEnabled);
  const repeatRuleRef = useRef(repeatRule);
  const liveCategoryIdRef = useRef(liveCategoryId);
  const appGroupIdRef = useRef(appGroupId);
  const signUpEnabledRef = useRef(signUpEnabled);
  useEffect(() => {
    valueRef.current = value;
    colorRef.current = color;
    timeRef.current = time;
    allDayRef.current = allDay;
    descriptionRef.current = description;
    locationRef.current = location;
    locationUrlRef.current = locationUrl;
    repeatEnabledRef.current = repeatEnabled;
    repeatRuleRef.current = repeatRule;
    liveCategoryIdRef.current = liveCategoryId;
    appGroupIdRef.current = appGroupId;
    signUpEnabledRef.current = signUpEnabled;
  }, [value, color, time, allDay, description, location, locationUrl, repeatEnabled, repeatRule, liveCategoryId, appGroupId, signUpEnabled]);

  // Live repeat chips on the calendar while repeat is configured (create flow
  // or after the user changes repeat settings — not when merely viewing an
  // existing repeat-series instance).
  useEffect(() => {
    if (!onRepeatPreviewChange || readOnly) return;
    const allowPreview =
      repeatEnabled &&
      (!(isEdit && eventForCopy) || repeatConfigDirty);
    if (!allowPreview) {
      onRepeatPreviewChange(null);
      return;
    }
    const title = (value ?? "").trim() || "New session";
    const effectiveTime = allDay ? { startMin: 0, endMin: 0 } : (time ?? { startMin: 8 * 60, endMin: 9 * 60 });
    const range = isoFromMenuClocks(
      displayStartDate,
      displayEndDate,
      effectiveTime.startMin,
      effectiveTime.endMin,
    );
    const nextDescription = (description ?? "").trim() || undefined;
    const template = {
      title,
      color,
      categoryId: liveCategoryId ?? null,
      category: categoryFromColor(color),
      startISO: range.startISO,
      endISO: allDay ? toISOLocal(setHM(displayStartDate, 23, 59)) : range.endISO,
      allDay,
      location: (location ?? "").trim() || undefined,
      locationUrl: (locationUrl ?? "").trim() || undefined,
      repeatRule,
      ...(nextDescription !== undefined ? { description: nextDescription } : {}),
      ...(isEntity ? { appGroupId: appGroupId ?? null } : {}),
      ...(isEntity ? { signUpEnabled } : {}),
    };

    if (isEdit && eventForCopy && repeatConfigDirty) {
      const repeatSeriesId = eventForCopy.repeatSeriesId ?? eventForCopy.id;
      onRepeatPreviewChange(
        buildRepeatSeriesLivePreview(
          eventForCopy,
          calendarEvents,
          template,
          repeatRule,
          repeatSeriesId,
          eventForCopy.id,
        ),
      );
      return;
    }

    onRepeatPreviewChange({
      events: buildRepeatPreviewEvents(template, repeatRule, resolvedSessionDate, {
        excludeStartISO: eventForCopy?.startISO ?? null,
      }),
      hideEventIds: [],
    });
  }, [
    onRepeatPreviewChange,
    readOnly,
    repeatEnabled,
    repeatConfigDirty,
    isEdit,
    eventForCopy,
    calendarEvents,
    repeatRule,
    value,
    color,
    time,
    allDay,
    description,
    liveCategoryId,
    appGroupId,
    signUpEnabled,
    isEntity,
    resolvedSessionDate,
    eventForCopy?.startISO,
  ]);

  useEffect(
    () => () => {
      onRepeatPreviewChange?.(null);
    },
    [onRepeatPreviewChange],
  );

  // Marked true once commit/close fires explicitly, so the unmount autosave
  // below doesn't double-write or resurrect a discarded event.
  const settledRef = useRef(false);

  const buildCopySnapshot = useCallback((): CalendarEvent | null => {
    if (!eventForCopy) return null;
    const timed = timeRef.current;
    const allDayNow = allDayRef.current;
    let startISO = eventForCopy.startISO;
    let endISO = eventForCopy.endISO;
    if (timed) {
      const range = isoFromMenuClocks(
        displayStartDate,
        displayEndDate,
        timed.startMin,
        timed.endMin,
      );
      startISO = range.startISO;
      endISO = allDayNow
        ? toISOLocal(setHM(displayStartDate, 23, 59))
        : range.endISO;
    }
    return {
      ...eventForCopy,
      title: (valueRef.current ?? "").trim() || eventForCopy.title,
      color: colorRef.current,
      allDay: allDayNow,
      startISO,
      endISO,
      description: (descriptionRef.current ?? "").trim() || undefined,
      location: (locationRef.current ?? "").trim() || undefined,
      locationUrl: (locationUrlRef.current ?? "").trim() || undefined,
      appGroupId: isEntity ? appGroupIdRef.current ?? null : eventForCopy.appGroupId,
      signUpEnabled: isEntity ? !!signUpEnabledRef.current : eventForCopy.signUpEnabled,
    };
  }, [eventForCopy, isEntity, displayStartDate, displayEndDate]);

  const isExistingSession =
    !!eventForCopy && calendarEvents.some((e) => e.id === eventForCopy.id);

  const handleCopySession = useCallback(() => {
    const snapshot = buildCopySnapshot();
    if (!snapshot) return;
    copyEventsToClipboard([snapshot], viewMode);
    setCopyToast(copySessionSuccessMessage(snapshot.title));
  }, [buildCopySnapshot, copyEventsToClipboard, viewMode]);

  const handleDuplicateSession = useCallback(() => {
    const snapshot = buildCopySnapshot();
    if (!snapshot) return;
    const created = duplicateEvent(snapshot);
    if (created) setCopyToast(duplicateSessionSuccessMessage(created.title));
  }, [buildCopySnapshot, duplicateEvent]);

  const handleDeleteSession = useCallback(() => {
    if (readOnly || !isEdit || !eventForCopy) return;
    settledRef.current = true;
    onClose();
    const scoped = seriesEventIdsIfAny();
    const deleteIds =
      scoped && scoped.length > 0 ? scoped : [eventForCopy.id];
    if (onDeleteSessions) {
      onDeleteSessions(deleteIds);
      return;
    }
    onCommit(
      "",
      color,
      allDay ? { startMin: 0, endMin: 0 } : time,
      undefined,
      allDay,
      commitDescription(),
      commitAppGroupId(),
      commitRepeatRule(),
      commitCategoryId(),
      commitLocation(),
      commitLocationUrl(),
      commitSignUpEnabled(),
      deleteIds,
    );
  }, [
    allDay,
    color,
    eventForCopy,
    isEdit,
    onClose,
    onCommit,
    onDeleteSessions,
    readOnly,
    time,
  ]);

  useEffect(() => {
    if (hidden || !eventForCopy) return;
    const onKey = (e: KeyboardEvent) => {
      const inPopoverField = () => {
        if (!isEditableTarget(e.target)) return false;
        const el = e.target instanceof Element ? e.target : null;
        return !!el?.closest('[data-role="popover"]');
      };
      if (matchesShortcut(e, SHORTCUTS.copySession)) {
        if (isEditableTarget(e.target) && !inPopoverField()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCopySession();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.duplicateSession)) {
        if (readOnly) return;
        if (isEditableTarget(e.target) && !inPopoverField()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDuplicateSession();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.deleteSession)) {
        if (readOnly || !isEdit) return;
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDeleteSession();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [
    hidden,
    eventForCopy,
    handleCopySession,
    handleDuplicateSession,
    handleDeleteSession,
    isEdit,
    readOnly,
  ]);

  const handleHeaderClose = useCallback(() => {
    settledRef.current = true;
    onClose();
  }, [onClose]);

  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);
  // Snapshot the values the popover opened with so we can decide on unmount
  // whether anything actually changed.
  const initialSnapshotRef = useRef({
    text: initialText,
    color: initialColor ?? null,
    time: initialTime,
    allDay: !!initialAllDay,
    description: (initialDescription ?? "").trim() || null,
    location: (initialLocation ?? "").trim() || null,
    locationUrl: (initialLocationUrl ?? "").trim() || null,
    repeatRule: resolvedRepeat.enabled ? resolvedRepeat.rule : null,
    appGroupId: initialAppGroupId ?? null,
    signUpEnabled: !!initialSignUpEnabled,
    categoryId: initialCategoryId ?? null,
  });

  const initialTimeRef = useRef(initialTime);
  initialTimeRef.current = initialTime;

  const isFormDirty = useCallback(() => {
    const v = (valueRef.current ?? "").trim();
    const init = initialSnapshotRef.current;
    const initT = (init.text ?? "").trim();
    if (v !== initT) return true;
    if (colorRef.current !== init.color) return true;
    if (allDayRef.current !== init.allDay) return true;
    if (!(init.allDay && allDayRef.current)) {
      if (
        (timeRef.current?.startMin ?? null) !== (init.time?.startMin ?? null) ||
        (timeRef.current?.endMin ?? null) !== (init.time?.endMin ?? null)
      ) {
        return true;
      }
    }
    const nextDescription = (descriptionRef.current ?? "").trim() || null;
    if (nextDescription !== init.description) return true;
    if (isEntity) {
      if ((appGroupIdRef.current ?? null) !== init.appGroupId) return true;
      if (!!signUpEnabledRef.current !== !!init.signUpEnabled) return true;
    }
    if (
      (repeatEnabledRef.current ? repeatRuleRef.current : null) !== init.repeatRule
    ) {
      return true;
    }
    if (((locationRef.current ?? "").trim() || null) !== init.location) return true;
    if (((locationUrlRef.current ?? "").trim() || null) !== init.locationUrl) {
      return true;
    }
    if ((liveCategoryIdRef.current ?? null) !== (init.categoryId ?? null)) {
      return true;
    }
    return false;
  }, [isEntity]);

  flushCommitRef.current = (accept, eventIds) => {
    settledRef.current = true;
    onCommit(
      valueRef.current.trim(),
      colorRef.current,
      allDayRef.current ? { startMin: 0, endMin: 0 } : timeRef.current,
      accept,
      allDayRef.current,
      commitDescription(),
      commitAppGroupId(),
      commitRepeatRule(),
      commitCategoryId(),
      commitLocation(),
      commitLocationUrl(),
      commitSignUpEnabled(),
      eventIds,
    );
  };

  const requestCommit = useCallback(
    (accept?: boolean) => {
      // Clicking the tile or outside after a drop must not rewrite times
      // (that snapped the session elsewhere in the day column).
      if (isEdit && !isFormDirty()) {
        settledRef.current = true;
        if (accept && eventForCopy?.coachPending) {
          flushCommitRef.current(true);
          return;
        }
        onClose();
        return;
      }
      if (isEdit && eventForCopy && isFormDirty()) {
        if (seriesEditScopeRef.current === "this" && isRepeatSeriesSession()) {
          detachThisSessionFromSeries();
          // Same-tick flush reads this ref; setState would not have committed yet.
          repeatEnabledRef.current = false;
        }
        flushCommitRef.current(accept, seriesEventIdsIfAny());
        return;
      }
      flushCommitRef.current(accept);
    },
    [eventForCopy, isEdit, isFormDirty, onClose],
  );

  // Unmount-time autosave. If the popover is torn down without an explicit
  // commit (parent closed it because a drag started on the bound tile, or
  // any other path that bypasses onCommit), persist whatever the user typed
  // so the edit isn't lost. Skipped on read-only, when nothing changed, or
  // when the title is empty (empty would mean delete — only explicit paths
  // should trigger that).
  // Series scope follows the This / All island (default This).
  useEffect(() => {
    return () => {
      if (settledRef.current) return;
      if (hiddenRef.current) return;
      if (readOnly) return;
      const v = (valueRef.current ?? "").trim();
      if (!v) return;
      const init = initialSnapshotRef.current;
      const initT = (init.text ?? "").trim();
      const sameTitle = v === initT;
      const sameColor = colorRef.current === init.color;
      // All-day sessions intentionally keep a hidden default timed range in
      // local state so toggling All day off can restore 08:00–09:00. That
      // hidden range is not a real edit while the session remains all-day;
      // otherwise React's development remount/cleanup can falsely autosave and
      // close the editor immediately after opening an all-day month tile.
      const sameTime =
        init.allDay && allDayRef.current
          ? true
          : (timeRef.current?.startMin ?? null) === (init.time?.startMin ?? null) &&
            (timeRef.current?.endMin ?? null) === (init.time?.endMin ?? null);
      const sameAllDay = allDayRef.current === init.allDay;
      const nextDescription = (descriptionRef.current ?? "").trim() || null;
      const sameDescription = nextDescription === init.description;
      const sameAppGroup =
        !isEntity || (appGroupIdRef.current ?? null) === init.appGroupId;
      const sameSignUp =
        !isEntity || !!signUpEnabledRef.current === !!init.signUpEnabled;
      const sameRepeat =
        (repeatEnabledRef.current ? repeatRuleRef.current : null) === init.repeatRule;
      const sameLocation =
        ((locationRef.current ?? "").trim() || null) === init.location;
      const sameLocationUrl =
        ((locationUrlRef.current ?? "").trim() || null) === init.locationUrl;
      if (sameTitle && sameColor && sameTime && sameAllDay && sameDescription && sameRepeat && sameAppGroup && sameSignUp && sameLocation && sameLocationUrl) return;
      const ev = eventForCopyRef.current;
      const events = calendarEventsRef.current;
      const scope = seriesEditScopeRef.current;
      const snap = seriesMemberIdsRef.current;
      let seriesIds: string[] | undefined;
      if (ev && (snap?.length || isPersistedRepeatSeries(ev, events))) {
        if (scope === "this") {
          seriesIds = [ev.id];
        } else {
          const live = eventIdsForDeleteScope("allInSeries", events, ev);
          seriesIds = [...new Set([...(snap ?? []), ...live, ev.id])];
        }
      }
      const repeatArg =
        scope === "this" && ev && isPersistedRepeatSeries(ev, events)
          ? null
          : commitRepeatRule();
      let commitTime = allDayRef.current
        ? { startMin: 0, endMin: 0 }
        : timeRef.current;
      if (!allDayRef.current && ev && !ev.allDay && ev.startISO && ev.endISO) {
        const actual = sessionMenuClockRange(
          fromISOLocal(ev.startISO),
          fromISOLocal(ev.endISO),
        );
        const editorTime = timeRef.current;
        const editorIsDefault =
          !!editorTime &&
          editorTime.startMin === defaultTimedRange.startMin &&
          editorTime.endMin === defaultTimedRange.endMin;
        const actualIsDefault =
          actual.startMin === defaultTimedRange.startMin &&
          actual.endMin === defaultTimedRange.endMin;
        // Unmount (e.g. week/day drag) must not persist the 08:00–09:00
        // editor fallback over the session's real times.
        if (sameTime || (editorIsDefault && !actualIsDefault)) {
          commitTime = actual;
        }
      }
      // Treat unmount-time autosave as implicit acceptance for coach-pending
      // sessions — matches the click-outside UX so the stripe clears the
      // moment the user moves on, and subsequent edits autosave normally.
      onCommitRef.current(
        v,
        colorRef.current,
        commitTime,
        true,
        allDayRef.current,
        commitDescription(),
        commitAppGroupId(),
        repeatArg,
        commitCategoryId(),
        commitLocation(),
        commitLocationUrl(),
        commitSignUpEnabled(),
        seriesIds,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (hiddenRef.current) return;
      if (!ref.current) return;
      // Menu is portaled; clicks on item labels are often text nodes.
      if (eventTargetElement(e.target)?.closest("[data-session-delete-menu]")) {
        return;
      }
      if (eventTargetElement(e.target)?.closest("[data-session-side-menu]")) {
        return;
      }
      if (!ref.current.contains(e.target as Node)) {
        // Ignore mousedowns on the active session tile so drag/resize can
        // start without a commit/close race. Dismiss on that tile is handled
        // by the tile click handler (toggle). Other session tiles stop
        // propagation and switch/dismiss via their own click handlers.
        if (
          e.target instanceof Element &&
          (e.target.closest('[data-session-active="1"]') ||
            e.target.closest("[data-resize-handle]"))
        ) {
          return;
        }
        if (readOnly) {
          settledRef.current = true;
          onClose();
        } else {
          // Click-outside on a coach-pending session implicitly accepts the
          // proposal (same end state as Enter / Save): the stripe clears and
          // later edits behave like any other owner-created session.
          requestCommit(true);
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settledRef.current = true;
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (
          e.target instanceof Element &&
          (e.target.closest("[data-session-location-map]") ||
            e.target.closest("[data-session-location-field]"))
        ) {
          return;
        }
        if (readOnly) {
          e.preventDefault();
          settledRef.current = true;
          onClose();
          return;
        }
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
          requestCommit(true);
        }, 0);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, readOnly, requestCommit]);

  const POPOVER_W = 280;
  const showParticipantsSide = isEntity && signUpEnabled && participantsPanelOpen;
  const memberTeamLocation =
    location.trim().length > 0 || locationUrl.trim().length > 0;
  const showLocationMapSide =
    locationMapOpen && mapPanelFits && (!memberTeamMenu || memberTeamLocation);
  const sidePanelCount =
    (showLocationMapSide ? 1 : 0) + (showParticipantsSide ? 1 : 0);
  const panelClusterWidth =
    POPOVER_W + sidePanelCount * (POPOVER_W + SESSION_PANEL_GAP_PX);
  const VIEWPORT_MARGIN = 8;
  /** Stable height for initial anchor placement only — actual height is measured in layout. */
  const BASE_POPOVER_H = seat === "individual" ? 380 : 400;

  const clampPanelTop = useCallback((top: number, height: number) => {
    const vh = window.innerHeight;
    const minTop = weekDaySessionMenuMinTop(viewMode) ?? VIEWPORT_MARGIN;
    let next = top;
    if (next + height > vh - VIEWPORT_MARGIN) {
      next = Math.max(minTop, vh - VIEWPORT_MARGIN - height);
    }
    if (next < minTop) {
      next = minTop;
    }
    return next;
  }, [viewMode]);

  const initialPos = useMemo(
    () =>
      computePopoverPosition(
        anchor,
        POPOVER_W,
        BASE_POPOVER_H,
        VIEWPORT_MARGIN,
        weekDaySessionMenuMinTop(viewMode),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze to the open-time anchor snapshot
    [anchor.top, anchor.bottom, anchor.left, anchor.right, anchor.width, anchor.height, viewMode],
  );

  const panelDocked = useSyncExternalStore(
    subscribeSessionPanelDocked,
    getSessionPanelDocked,
    () => false,
  );
  const [dockIconHover, setDockIconHover] = useState(false);
  const [dockLeft, setDockLeft] = useState(() => computeDockedPanelLeft(POPOVER_W));
  const [panelHeight, setPanelHeight] = useState(BASE_POPOVER_H);
  const [panelTop, setPanelTop] = useState(initialPos.top);
  const [panelLeft, setPanelLeft] = useState(initialPos.left);
  /** Hide until the first measured place runs — prevents the open-frame snap. */
  const [panelReady, setPanelReady] = useState(false);
  /** Dock/undock slide only — never animate the open/measure correction. */
  const [allowPosTransition, setAllowPosTransition] = useState(false);
  const [floatPos, setFloatPos] = useState<SessionPanelFloatPosition>(() => ({
    left: initialPos.left,
    top: initialPos.top,
  }));
  const floatingPosRef = useRef<SessionPanelFloatPosition>(floatPos);
  const anchorKey = `${anchor.top}|${anchor.bottom}|${anchor.left}|${anchor.right}`;
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  /** Caret in the title field — kept across drag-hide so month drop can restore it. */
  const titleCaretRef = useRef<{ start: number; end: number } | null>(null);
  const [titleFocused, setTitleFocused] = useState(!readOnly);
  const [descriptionFocused, setDescriptionFocused] = useState(false);

  const rememberTitleCaret = () => {
    const el = titleInputRef.current;
    if (!el) return;
    titleCaretRef.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  };

  const placePanel = useCallback(
    (el: HTMLDivElement, opts?: { reveal?: boolean; enableTransitionAfter?: boolean }) => {
      const height = Math.max(el.offsetHeight, 1);
      setPanelHeight((prev) => (prev === height ? prev : height));

      const liveAnchor = readLiveSessionAnchorRect({
        eventId: eventForCopy?.id ?? null,
        fallback: anchor,
        preferDayCell: viewMode === "month",
        cellPos: viewMode === "month" ? anchorCellPos : null,
      });
      const minTop = weekDaySessionMenuMinTop(viewMode);
      const raw = panelDocked
        ? {
            top: clampPanelTop(liveAnchor.top, height),
            left: computeDockedPanelLeft(panelClusterWidth),
          }
        : computePopoverPosition(
            liveAnchor,
            panelClusterWidth,
            height,
            VIEWPORT_MARGIN,
            minTop,
          );
      const pos = clampSessionPanelPosition({
        left: raw.left,
        top: raw.top,
        width: panelClusterWidth,
        height,
        minTop,
      });
      setPanelTop((prev) => (prev === pos.top ? prev : pos.top));
      setPanelLeft((prev) => (prev === pos.left ? prev : pos.left));
      if (panelDocked) {
        setDockLeft((prev) => (prev === pos.left ? prev : pos.left));
      }

      if (opts?.reveal) setPanelReady(true);
      if (opts?.enableTransitionAfter) {
        requestAnimationFrame(() => setAllowPosTransition(true));
      }
    },
    [anchor, anchorCellPos, clampPanelTop, eventForCopy?.id, panelClusterWidth, panelDocked, viewMode],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    setAllowPosTransition(false);
    placePanel(el, { reveal: true, enableTransitionAfter: true });
  }, [anchorKey, panelClusterWidth, panelDocked, placePanel, showLocationMapSide, showParticipantsSide]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Content settled (category row, etc.) — correct instantly, don't animate.
      setAllowPosTransition(false);
      placePanel(el, { enableTransitionAfter: true });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [placePanel]);

  useLayoutEffect(() => {
    if (readOnly || !panelReady) return;
    titleInputRef.current?.focus({ preventScroll: true });
    rememberTitleCaret();
  }, [readOnly, panelReady]);

  const wasHiddenRef = useRef(hidden);
  useLayoutEffect(() => {
    const wasHidden = wasHiddenRef.current;
    wasHiddenRef.current = hidden;
    if (hidden || !wasHidden) return;
    const node = ref.current;
    if (node) placePanel(node);
    if (readOnly) return;
    const caret = titleCaretRef.current;
    const restore = () => {
      if (hiddenRef.current) return;
      const el = titleInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (!caret) return;
      try {
        el.setSelectionRange(caret.start, caret.end);
      } catch {
        /* ignore */
      }
    };
    restore();
    const raf = window.requestAnimationFrame(restore);
    const t = window.setTimeout(restore, 0);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [hidden, readOnly, placePanel]);

  useEffect(() => {
    const next = {
      left: panelDocked ? dockLeft : panelLeft,
      top: panelTop,
    };
    floatingPosRef.current = next;
    setFloatPos(next);
  }, [panelDocked, panelLeft, panelTop, dockLeft]);

  const panelLayoutRef = useRef({
    docked: panelDocked,
    left: panelLeft,
    top: panelTop,
    dockLeft,
    width: panelClusterWidth,
    eventId: eventForCopy?.id ?? null,
    preferDayCell: viewMode === "month",
    cellPos: viewMode === "month" ? anchorCellPos : null,
    fallbackAnchor: anchor,
  });
  panelLayoutRef.current = {
    docked: panelDocked,
    left: panelLeft,
    top: panelTop,
    dockLeft,
    width: panelClusterWidth,
    eventId: eventForCopy?.id ?? null,
    preferDayCell: viewMode === "month",
    cellPos: viewMode === "month" ? anchorCellPos : null,
    fallbackAnchor: anchor,
  };

  useLayoutEffect(() => {
    const keepFullyVisible = () => {
      const node = ref.current;
      if (!node) return;
      const layout = panelLayoutRef.current;
      const height = Math.max(node.offsetHeight, 1);
      const width = layout.width;
      const liveAnchor = readLiveSessionAnchorRect({
        eventId: layout.eventId,
        fallback: layout.fallbackAnchor,
        preferDayCell: layout.preferDayCell,
        cellPos: layout.cellPos,
      });
      const minTop = weekDaySessionMenuMinTop(viewMode);
      const raw = layout.docked
        ? {
            left: computeDockedPanelLeft(width),
            top: clampPanelTop(liveAnchor.top, height),
          }
        : computePopoverPosition(
            liveAnchor,
            width,
            height,
            VIEWPORT_MARGIN,
            minTop,
          );
      const next = clampSessionPanelPosition({
        left: raw.left,
        top: raw.top,
        width,
        height,
        minTop,
      });
      const leftChanged = layout.docked
        ? next.left !== layout.dockLeft
        : next.left !== layout.left;
      const topChanged = next.top !== layout.top;
      if (!leftChanged && !topChanged) return;
      setAllowPosTransition(false);
      flushSync(() => {
        setPanelHeight((prev) => (prev === height ? prev : height));
        setPanelTop((prev) => (prev === next.top ? prev : next.top));
        setPanelLeft((prev) => (prev === next.left ? prev : next.left));
        if (layout.docked) {
          setDockLeft((prev) => (prev === next.left ? prev : next.left));
        }
      });
    };

    const tileRo = new ResizeObserver(() => keepFullyVisible());
    const observeLiveAnchor = () => {
      tileRo.disconnect();
      const layout = panelLayoutRef.current;
      const el = findLiveSessionAnchorEl({
        eventId: layout.eventId,
        preferDayCell: layout.preferDayCell,
        cellPos: layout.cellPos,
      });
      if (!el) return;
      tileRo.observe(el);
      const parent = el.parentElement;
      if (parent) tileRo.observe(parent);
    };

    const onViewportChange = () => {
      keepFullyVisible();
      observeLiveAnchor();
      requestAnimationFrame(() => {
        keepFullyVisible();
        observeLiveAnchor();
      });
    };

    observeLiveAnchor();
    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    const root = document.documentElement;
    const mo = new MutationObserver(onViewportChange);
    mo.observe(root, { attributes: true, attributeFilter: ["style"] });
    return () => {
      tileRo.disconnect();
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      mo.disconnect();
    };
  }, [anchorCellPos, clampPanelTop, eventForCopy?.id, viewMode]);

  const effectiveLeft = panelDocked ? dockLeft : panelLeft;

  const togglePanelDock = useCallback(() => {
    if (panelDocked) {
      setSessionPanelDocked(false);
      setAllowPosTransition(true);
      setPanelTop(floatPos.top);
      setPanelLeft(floatPos.left);
      return;
    }
    const next = { left: panelLeft, top: panelTop };
    floatingPosRef.current = next;
    setFloatPos(next);
    const left = computeDockedPanelLeft(panelClusterWidth);
    setDockLeft(left);
    setAllowPosTransition(true);
    setSessionPanelDocked(true);
  }, [panelClusterWidth, panelDocked, panelLeft, panelTop, floatPos.top, floatPos.left]);

  const dockGuideRect = {
    left: dockLeft,
    top: panelTop,
    width: panelClusterWidth,
    height: panelHeight,
  };
  const placeholderGuideRect = {
    left: floatPos.left,
    top: floatPos.top,
    width: panelClusterWidth,
    height: panelHeight,
  };


  // Default range used the first time the user opens the wheels with no
  // existing time set on the session.
  const effectiveTime = displayAllDay ? { startMin: 0, endMin: 0 } : time ?? defaultTimedRange;

  const durationRow = enableDuration ? (
    <SessionTimeField
      value={effectiveTime}
      muted={displayAllDay}
      readOnly={readOnly}
      independentClocks={multiDay}
      showAllDay={!multiDay}
      allDay={displayAllDay}
      onAllDayChange={handleAllDaySwitch}
      sessionCardRef={sessionCardRef}
      clusterRef={ref}
      rightOccupied={showLocationMapSide || showParticipantsSide}
      onChange={(t) => {
        if (readOnly) return;
        handleTimeChange(t);
      }}
    />
  ) : (
    <div
      ref={durationRowRef}
      className={[
        "relative flex min-h-[40px] items-center",
        sessionPopoverFieldClass(false),
      ].join(" ")}
    >
      <span className="pl-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {isEdit ? "Rediger økt" : "Legg til økt"}
      </span>
    </div>
  );

  const visibleDescription = readOnly
    ? (initialDescription ?? "").trim()
      ? (initialDescription ?? "")
      : description
    : description;

  const descriptionSection = (
    <div className="relative min-h-0 flex-1" style={{ minHeight: SESSION_DESCRIPTION_FIELD_H }}>
      {readOnly ? (
        <div
          className={[
            "h-full cursor-text overflow-y-auto px-3 py-2 whitespace-pre-wrap select-text",
            POPOVER_ACTIVITY_TEXT,
            sessionPopoverFieldClass(false),
            visibleDescription.trim() ? "" : "text-muted-foreground/60",
          ].join(" ")}
          style={{ minHeight: SESSION_DESCRIPTION_FIELD_H }}
        >
          {visibleDescription.trim() || "Description"}
        </div>
      ) : (
        <>
          <textarea
            ref={descriptionInputRef}
            value={description}
            onChange={(e) => handleDescriptionInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves the session (window handler). Shift+Enter inserts a line.
              if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
            }}
            onFocus={() => setDescriptionFocused(true)}
            onBlur={() => {
              if (hiddenRef.current) return;
              setDescriptionFocused(false);
            }}
            maxLength={SESSION_DESCRIPTION_MAX_LENGTH}
            rows={4}
            className={[
              "block h-full w-full !cursor-text resize-none overflow-hidden px-3 py-2 outline-none",
              sessionPopoverFieldClass(descriptionFocused),
              POPOVER_ACTIVITY_TEXT,
            ].join(" ")}
            style={{ minHeight: SESSION_DESCRIPTION_FIELD_H }}
          />
          {!description ? (
            <span
              className={[
                "pointer-events-none absolute left-3 top-2",
                POPOVER_ACTIVITY_TEXT,
                "text-muted-foreground/60",
              ].join(" ")}
            >
              Description
            </span>
          ) : null}
        </>
      )}
    </div>
  );

  const signUpSection = isEntity ? (
    <div className="flex items-center gap-2 py-0.5">
      <span className={[POPOVER_ACTIVITY_TEXT, POPOVER_ROW_INDENT, "min-w-0 flex-1"].join(" ")}>
        Enable sign up
      </span>
      {!readOnly ? (
        <label
          ref={signUpSwitchRef}
          className="ml-auto flex shrink-0 cursor-default select-none items-center gap-1.5 pr-0.5"
        >
          <IOSSwitch checked={displaySignUpEnabled} onChange={handleSignUpSwitch} />
        </label>
      ) : (
        <span className="pr-0.5 text-[11px] text-muted-foreground">
          {signUpEnabled ? "On" : "Off"}
        </span>
      )}
    </div>
  ) : null;

  return createPortal(
  <>
      <SessionPanelDockGuides
        showDockSlot={!hidden && dockIconHover && !panelDocked}
        showPlaceholder={!hidden && dockIconHover && panelDocked}
        dockSlot={dockGuideRect}
        placeholder={placeholderGuideRect}
      />
    <div
      ref={ref}
      data-role="popover"
      className="fixed z-50"
      style={{
        top: panelTop,
        left: effectiveLeft,
        width: panelClusterWidth,
        visibility: panelReady && !hidden ? "visible" : "hidden",
        pointerEvents: panelReady && !hidden ? "auto" : "none",
        transition: allowPosTransition ? SESSION_PANEL_DOCK_TRANSITION : undefined,
      }}
    >
      <div
        className="relative z-20 flex items-stretch"
        style={{ gap: SESSION_PANEL_GAP_PX }}
      >
        <div
          ref={sessionCardRef}
          className={[
            "flex min-h-0 shrink-0 flex-col cursor-default",
            "[&_button]:cursor-default [&_label]:cursor-default [&_input]:cursor-default [&_textarea]:cursor-default",
            SESSION_PANEL_SHELL_CLASS,
          ].join(" ")}
          style={{
            ...(memberTeamMenu
              ? { background: teamSessionMenuBackground(darkMenu) }
              : SESSION_PANEL_SHELL_STYLE),
            width: POPOVER_W,
          }}
        >
          <div className="px-3 pt-2">
            <SessionPanelHeaderRow
              docked={panelDocked}
              onDockHoverChange={setDockIconHover}
              onDockToggle={togglePanelDock}
              afterDock={
                memberTeamMenu && eventForCopy?.id && eventForCopy.signUpEnabled ? (
                  <MemberTeamResponseButtons eventId={eventForCopy.id} />
                ) : isEntity && signUpEnabled ? (
                  <SessionSignupCountBadge
                    count={signedUpCount}
                    active={participantsPanelOpen}
                    onClick={() => setParticipantsPanelOpen((v) => !v)}
                  />
                ) : undefined
              }
              actions={
                <div ref={headerActionsRef} className="flex items-center">
                <SessionPopoverHeader
                  isEdit={isExistingSession}
                  onClose={handleHeaderClose}
                  onCopySession={isExistingSession ? handleCopySession : undefined}
                  onDuplicateSession={
                    isExistingSession && !readOnly ? handleDuplicateSession : undefined
                  }
                  onDeleteSession={
                    isExistingSession && !readOnly ? handleDeleteSession : undefined
                  }
                />
                </div>
              }
            />
          </div>
          <div className={`flex min-h-0 flex-1 flex-col ${POPOVER_CONTENT_GAP} px-3 pb-3 pt-1.5`}>
            {showSeriesScopeTabs ? (
              <SessionSeriesScopeTabs
                value={seriesEditScope === "allInSeries" ? "allInSeries" : "this"}
                onChange={(scope) =>
                  setSeriesEditScope(scope === "allInSeries" ? "allInSeries" : "this")
                }
              />
            ) : null}
            {memberTeamMenu && memberTeamName ? (
              <MemberTeamNameField name={memberTeamName} />
            ) : null}
            <input
              ref={titleInputRef}
              value={value}
              onChange={(e) => {
                const next = e.target.value;
                setValue(next);
                onTitleChange?.(next);
              }}
              placeholder={placeholder}
              readOnly={readOnly}
              tabIndex={readOnly ? -1 : 0}
              onFocus={() => {
                rememberTitleCaret();
                if (!readOnly) setTitleFocused(true);
              }}
              onSelect={rememberTitleCaret}
              onKeyUp={rememberTitleCaret}
              onClick={rememberTitleCaret}
              onBlur={(e) => {
                setTitleFocused(false);
                if (hiddenRef.current) return;
                const next = e.relatedTarget;
                if (
                  next instanceof Element &&
                  (next.closest("[data-session-active]") ||
                    next.closest("[data-event-id]") ||
                    next.closest('[data-role="item"]'))
                ) {
                  return;
                }
                titleCaretRef.current = null;
              }}
              onMouseDown={readOnly ? (e) => e.preventDefault() : undefined}
              className={[
                `block w-full px-3 ${POPOVER_FIELD_PY} text-[13px] text-ink outline-none placeholder:text-muted-foreground/60`,
                sessionPopoverFieldClass(titleFocused && !readOnly),
                readOnly ? "cursor-default select-text caret-transparent" : "!cursor-text",
              ].join(" ")}
            />

            <SessionDateField
              date={displayStartDate}
              endDate={displayEndDate}
              readOnly={readOnly}
              hideEndDate={memberTeamMenu && !displayAllDay && !multiDay}
              visible={seriesEditScope !== "allInSeries" && dateMenuFits}
              sessionCardRef={sessionCardRef}
              clusterRef={ref}
              rightOccupied={showLocationMapSide || showParticipantsSide}
              onPickRange={(start, end) => {
                setMenuDate(start);
                setMenuEndDate(end);
                applyWithSeriesScope((ids) => onDateChange?.({ start, end }, ids));
              }}
            />

            {durationRow}

            {memberTeamMenu && !memberTeamLocation ? null : (
            <div ref={locationFieldRef} data-session-location-field="">
            <SessionLocationField
              value={location}
              onChange={(next) => {
                if (!next.trim() && (locationRef.current.trim() || locationUrlRef.current.trim())) {
                  handleLocationChange({ location: "", locationUrl: "" });
                  return;
                }
                setLocation(next);
                locationRef.current = next;
              }}
              readOnly={readOnly}
              size="calendar"
              locationUrl={locationUrl || null}
              onLocationUrlClear={() => {
                setLocationUrl("");
                locationUrlRef.current = "";
              }}
              onPlaceSelect={(place) => {
                handleLocationChange({
                  location: place.name,
                  locationUrl: place.locationUrl,
                });
              }}
              mapOpen={locationMapOpen}
              onMapToggle={() => {
                if (!mapPanelFits) return;
                setLocationMapOpen((v) => !v);
              }}
              showMapButton={mapPanelFits}
              searchHandoff={locationSearchHandoff}
              onSearchHandoffConsumed={() => setLocationSearchHandoff(null)}
            />
            </div>
            )}

            {memberTeamMenu ? null : (
            <div ref={repeatRowRef}>
              <SessionRepeatRow
                sessionDate={resolvedSessionDate}
                enabled={displayRepeatEnabled}
                rule={displayRepeatRule}
                readOnly={readOnly}
                onToggle={handleRepeatToggle}
                onRuleChange={handleRepeatRuleChange}
                sessionCardRef={sessionCardRef}
                clusterRef={ref}
                rightOccupied={showLocationMapSide || showParticipantsSide}
              />
            </div>
            )}

            {isEntity && teamId ? (
              <div className={readOnly ? "pointer-events-none" : undefined}>
                <GroupDropdownRow
                  teamId={teamId}
                  initialAppGroupId={initialAppGroupId}
                  selectedAppGroupId={appGroupId}
                  onSelectionChange={handleGroupPick}
                  readOnly={readOnly}
                  sessionCardRef={sessionCardRef}
                  clusterRef={ref}
                  rightOccupied={showLocationMapSide || showParticipantsSide}
                />
              </div>
            ) : null}

            <div className={readOnly ? "pointer-events-none" : undefined} ref={colorRowRef}>
              <ColorDropdownRow
                color={color}
                onSetColor={handleColorPick}
                readOnly={readOnly}
                sessionCardRef={sessionCardRef}
                clusterRef={ref}
                rightOccupied={showLocationMapSide || showParticipantsSide}
              />
            </div>

            {signUpSection}
            {memberTeamMenu ? null : descriptionSection}
          </div>
        </div>

        {showLocationMapSide ? (
          <div
            ref={locationMapWrapRef}
            className="min-h-0 shrink-0 self-stretch"
            style={{ width: POPOVER_W }}
            data-session-location-map=""
          >
            <SessionLocationMapPanel
              ref={locationMapPanelRef}
              locationName={location}
              locationUrl={locationUrl || null}
              onConfirm={(next) => {
                handleLocationChange({
                  location: next.name,
                  locationUrl: next.locationUrl,
                });
              }}
              onClear={() => {
                handleLocationChange({ location: "", locationUrl: "" });
              }}
              onClose={() => setLocationMapOpen(false)}
            />
          </div>
        ) : null}

        {showParticipantsSide ? (
          <div className="min-h-0 shrink-0 self-stretch" style={{ width: POPOVER_W }}>
            <SessionSignupParticipantsPanel
              members={rosterMembers}
              loading={rosterLoading}
              responsesByMember={audienceResponses.byMember}
              responsesByUser={audienceResponses.byUser}
              appGroupId={appGroupId}
              onClose={() => setParticipantsPanelOpen(false)}
            />
          </div>
        ) : null}
      </div>
      {copyToast ? (
        <CalendarInfoToast message={copyToast} onDismiss={() => setCopyToast(null)} />
      ) : null}
    </div>
  </>,
  document.body,
  );
}

export type CategorySelection = {
  id: string | null;
  color: string | null;
  name: string | null;
};

function GroupDropdownRow({
  teamId,
  selectedAppGroupId = null,
  onSelectionChange,
  readOnly = false,
  sessionCardRef,
  clusterRef,
  rightOccupied = false,
}: {
  teamId: string;
  initialAppGroupId?: string | null;
  selectedAppGroupId?: string | null;
  onSelectionChange?: (appGroupId: string | null) => void;
  readOnly?: boolean;
  sessionCardRef: RefObject<HTMLDivElement | null>;
  clusterRef: RefObject<HTMLDivElement | null>;
  rightOccupied?: boolean;
}) {
  const { groups, loading } = useEntityRoster(teamId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<"left" | "right" | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const Chevron = menuOpen && menuSide === "left" ? ChevronLeft : ChevronRight;

  const options = useMemo(() => {
    const rosterGroups = groups.filter(
      (g) => g.name.trim().length > 0 && !isPlaceholderGroupName(g.name),
    );
    return [
      { id: null as string | null, label: "All" },
      ...rosterGroups.map((g) => ({ id: g.id as string | null, label: g.name })),
    ];
  }, [groups]);

  const resolvedValue = selectedAppGroupId ?? "";
  const selectedLabel =
    options.find((o) => (o.id ?? "") === resolvedValue)?.label ?? "All";

  const groupFieldShell = (content: ReactNode) => (
    <div ref={fieldRef} className="relative">
      <div className={["relative", sessionPopoverFieldClass(menuOpen && !readOnly)].join(" ")}>
        {content}
        {!readOnly && options.length > 0 ? (
          <Chevron
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );

  if (loading) {
    return groupFieldShell(
      <div className={["block w-full py-2.5 px-3 pr-8", POPOVER_ACTIVITY_TEXT, "text-muted-foreground"].join(" ")}>
        …
      </div>,
    );
  }

  if (readOnly) {
    return groupFieldShell(
      <div className={["block w-full py-2.5 px-3 pr-3", POPOVER_ACTIVITY_TEXT].join(" ")}>
        {selectedLabel}
      </div>,
    );
  }

  return (
    <>
      {groupFieldShell(
        <div className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className={[
              "flex w-full cursor-default items-center bg-transparent px-3 py-2.5 pr-8 text-left outline-none",
              POPOVER_ACTIVITY_TEXT,
            ].join(" ")}
          >
            <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          </button>
        </div>,
      )}
      <SessionSideListbox
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        fieldRef={fieldRef}
        sessionCardRef={sessionCardRef}
        clusterRef={clusterRef}
        rightOccupied={rightOccupied}
        estimatedHeight={estimateSessionSideMenuHeight(options.length)}
        onSideChange={setMenuSide}
      >
        {options.map((option) => {
          const active = (option.id ?? "") === resolvedValue;
          return (
            <button
              key={option.id ?? "__entity__"}
              type="button"
              role="option"
              aria-selected={active}
              onClick={(e) => {
                e.stopPropagation();
                onSelectionChange?.(option.id);
                setMenuOpen(false);
              }}
              className={SESSION_SIDE_MENU_ITEM_CLASS}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {active ? <Check className="h-3.5 w-3.5 shrink-0 text-white" /> : null}
            </button>
          );
        })}
      </SessionSideListbox>
    </>
  );
}

function ColorDropdownRow({
  color,
  onSetColor,
  readOnly = false,
  sessionCardRef,
  clusterRef,
  rightOccupied = false,
}: {
  color: string | null;
  onSetColor: (c: string | null) => void;
  readOnly?: boolean;
  sessionCardRef: RefObject<HTMLDivElement | null>;
  clusterRef: RefObject<HTMLDivElement | null>;
  rightOccupied?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<"left" | "right" | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const hex = color ?? DEFAULT_SESSION_COLOR;
  const label = standardColorLabel(hex);
  const Chevron = menuOpen && menuSide === "left" ? ChevronLeft : ChevronRight;

  const fieldShell = (content: ReactNode) => (
    <div ref={fieldRef} className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 z-[1] h-2 w-2 -translate-y-1/2 rounded-full"
        style={{
          background: hex,
          boxShadow: isSessionWhiteColor(hex) ? "inset 0 0 0 1px rgba(0,0,0,0.18)" : undefined,
        }}
      />
      <div className={["relative min-h-[40px]", sessionPopoverFieldClass(menuOpen && !readOnly)].join(" ")}>
        {content}
        {!readOnly ? (
          <Chevron
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );

  if (readOnly) {
    return fieldShell(
      <div className={["flex w-full items-center py-2.5 pl-7 pr-3", POPOVER_ACTIVITY_TEXT].join(" ")}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </div>,
    );
  }

  return (
    <>
      {fieldShell(
        <div className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className={[
              "flex w-full cursor-default items-center bg-transparent py-2.5 pl-7 pr-8 text-left outline-none",
              POPOVER_ACTIVITY_TEXT,
            ].join(" ")}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
        </div>,
      )}
      <SessionSideListbox
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        fieldRef={fieldRef}
        sessionCardRef={sessionCardRef}
        clusterRef={clusterRef}
        rightOccupied={rightOccupied}
        estimatedHeight={estimateSessionSideMenuHeight(STANDARD_COLORS_NAMED.length)}
        onSideChange={setMenuSide}
      >
        <ColorsPanel
          currentColor={hex}
          onPick={(next) => {
            onSetColor(next);
            setMenuOpen(false);
          }}
          tone="dark"
          showMakeDefault
        />
      </SessionSideListbox>
    </>
  );
}
