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

import React from "react";
import { createPortal, flushSync } from "react-dom";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Footprints, Bike, Dumbbell, Snowflake, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCalendarTheme } from "./calendarThemePref";
import type { CellData, CellKey, Session, CalendarEvent } from "./yearStore";
import { makeCellId, isMembershipOverlayEvent } from "./yearStore";
import {
  MonthGridType1,
  PopoverEditor,
  splitColor,
  joinColor,
  iconForColor,
  contrastTextOn,
  categoryFromColor,
} from "./MonthGridType1";
import { DEFAULT_SESSION_COLOR, getSessionDefaultColor, sessionTileChrome, sessionWeekDayTileFill } from "@/components/library/CategoryActionsMenu";
import {
  signupResponse,
  teamMemberTilePaint,
  useSyncOwnTeamSessionResponses,
  useTeamSessionResponses,
} from "@/lib/teamSessionResponse";
import { DiaryPopoverEditor, type DiaryPopoverValue } from "./DiaryPopoverEditor";
import { useCalendarPasteContextMenu } from "./CalendarPasteContextMenu";
import { useCalendarSessionContextMenu, sessionTileFromTarget, SESSION_SHIFT_MARK_EVENT } from "./CalendarSessionContextMenu";
import {
  layoutTimedOverlaps,
  NEWCOMER_SORT_INDEX,
  overlapRecency,
  timedOverlapTileBox,
} from "./timedEventOverlapLayout";
import { DayNoteButton } from "./DayNoteButton";
import { SessionHoverMenu } from "./SessionHoverMenu";
import { useHoverLock } from "./hoverLock";
import { useClosePanelsForDeletedEvents } from "./useClosePanelsForDeletedEvents";
import { SessionDetailsContainer } from "./SessionDetailsContainer";
import { MonthNavControl } from "./MonthNavControl";
import type { DateRange } from "./MiniCalendar";
import {
  sameDay,
  setHM,
  addMinutes,
  addDays,
  toISOLocal,
  fromISOLocal,
  diffMinutes,
  isoWeekNumber,
  makeEventId,
  startEndMinsOnStartDay,
  calendarDayDelta,
  shiftIsoRangeByDays,
  startOfDay,
} from "./dateUtils";
import {
  WEEK_PAN_VISIBLE_DAYS,
  WEEK_PAN_WEEKS,
  anchorDateForVisibleDays,
  mondayIndexInBuffer,
  snapScrollLeft,
  visibleDayRange,
  visibleWeekSpan,
  weekMountCovers,
  weekMountWindow,
  weekPanBufferDays,
  weekPanOrigin,
  WEEK_PAN_WHEEL_BURST_MS,
  weekPanWheelDelta,
  weekPanWheelShouldStep,
  weekRenderRange,
  wheelDeltaPixels,
} from "@/lib/weekHorizontalScroll";
import { createWeekEdgePulse, inertWeekEdgePulse, type WeekEdgePulse } from "./weekEdgePulse";
import { clearLiveWeekSpan, setLiveWeekSpan } from "@/lib/liveWeekSpan";
import { getLiveMonthFocus } from "@/lib/liveMonthFocus";
import {
  applyTimedGridEdgeScroll,
  createEdgeScrollGesture,
  engagedEdgeScrollIntent,
  noteEdgeScrollMovement,
  pointerInTimedGridScrollEdge,
} from "./edgeScroll";
import {
  eventCoversDay,
  isoFromMenuClocks,
  bandWidthResizeResult,
  isoRangeOnDates,
  isAllDayBandEvent,
  isMultiDaySession,
  promoteFullDayTimedSpan,
  timedMarkCoversFullDay,
  segmentTimedEventForDay,
  sessionInclusiveEndDay,
  sessionMenuClockRange,
} from "./multiDaySessions";
import { WeekAllDayBand } from "./WeekAllDayBand";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useCalendarSearchSafe } from "./CalendarSearchContext";
import { useSessionTileDesign, useDiarySimpleView } from "@/lib/session-tile-design";
import { useDistanceUnit, kmToUnit, unitLabel } from "@/lib/units";
import { useWeekViewHours } from "@/lib/week-view-hours";
import { useUserCategories } from "@/hooks/useUserCategories";
import { useEntityRoster } from "@/hooks/useEntityRoster";
import { sidebarAllCategories } from "@/lib/calendarCategoryScope";
import {
  expandRepeatingEvents,
  isRepeatPreviewEventId,
  mergeEventsWithRepeatPreview,
  planRepeatSeriesSave,
  sharedRepeatSeriesId,
  shouldMaterializeRepeatOnSave,
  type RepeatLivePreview,
} from "@/lib/sessionRepeat";
import { isEditableTarget } from "@/lib/shortcuts";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  SESSION_SIDE_MENU_ITEM_CLASS,
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";

export type ViewMode = "day" | "week" | "month";
/** Extended view mode that includes "year". Only the chart/stats view uses
 * "year"; the grid renders month for it (coerce at the boundary). */
export type ExtendedViewMode = ViewMode | "year";

const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};


/**
 * HeaderDropdown — trigger matches Today / other header chips; the open
 * list uses the same charcoal shell as session-menu submenus.
 */
export function HeaderDropdown<T extends string>({
  value,
  options,
  onChange,
  width = 132,
  ariaLabel,
  openUpward = false,
}: {
  value: T;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  width?: number;
  ariaLabel: string;
  openUpward?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        data-calendar-chrome=""
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
            role="menu"
            className={`absolute right-0 z-40 min-w-full overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS} ${
              openUpward ? "bottom-full mb-1" : "top-full mt-1"
            }`}
            style={{ width, ...SESSION_SIDE_MENU_SHELL_STYLE }}
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  disabled={o.disabled}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`${SESSION_SIDE_MENU_ITEM_CLASS} ${
                    o.disabled ? "cursor-not-allowed text-white/40 hover:bg-transparent hover:text-white/40" : ""
                  }`}
                >
                  <span className="grid h-3.5 w-3.5 shrink-0 place-items-center" aria-hidden>
                    {active ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.25} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && (
                    <span className="mono shrink-0 text-[9px] uppercase tracking-[0.2em] text-white/40">
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
/** English month abbreviations for the week-view corner (opens that month). */
const MONTHS_EN_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

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

/**
 * Live start/end while dragging a tile edge. Crossing the opposite edge
 * flips the range (end dragged above start, or start dragged below end),
 * matching hold-to-create.
 */
function timedGridResizeRange(
  edge: "top" | "bottom",
  originStartMin: number,
  originEndMin: number,
  deltaMin: number,
  minStart: number,
  maxEnd: number,
  minDur: number,
): { startMin: number; endMin: number } {
  const anchor = edge === "top" ? originEndMin : originStartMin;
  const draggedRaw =
    edge === "top" ? originStartMin + deltaMin : originEndMin + deltaMin;
  const dragged = Math.max(minStart, Math.min(maxEnd, draggedRaw));
  let startMin: number;
  let endMin: number;
  if (dragged <= anchor) {
    endMin = Math.min(maxEnd, Math.max(anchor, minStart + minDur));
    startMin = Math.min(dragged, endMin - minDur);
    if (startMin < minStart) {
      startMin = minStart;
      endMin = Math.min(maxEnd, Math.max(endMin, startMin + minDur));
    }
  } else {
    startMin = Math.max(minStart, Math.min(anchor, maxEnd - minDur));
    endMin = Math.max(dragged, startMin + minDur);
    if (endMin > maxEnd) {
      endMin = maxEnd;
      startMin = Math.max(minStart, Math.min(startMin, endMin - minDur));
    }
  }
  if (endMin - startMin < minDur) {
    if (dragged <= anchor) startMin = Math.max(minStart, endMin - minDur);
    else endMin = Math.min(maxEnd, startMin + minDur);
  }
  return { startMin, endMin };
}

/**
 * Pointer Y clamped to the scroller. Off-screen movement is ignored here
 * (scroll already consumes it). Re-entering does not jump: the first inside
 * sample stays on the edge, then motion toward the other end tracks normally.
 */
function createStickyViewportPointer() {
  let wasOutside = false;
  let lastClamped = 0;
  let adjust = 0;
  return (clientY: number, rect: DOMRectReadOnly) => {
    const top = rect.top + 0.5;
    const bot = rect.bottom - 0.5;
    const outside = clientY > bot || clientY < top;
    const clamped = Math.min(bot, Math.max(top, clientY));
    if (wasOutside && !outside) {
      adjust += clamped - lastClamped;
    }
    wasOutside = outside;
    lastClamped = clamped;
    return clamped - adjust;
  };
}

// `sameDay` / `startEndMinsOnStartDay` are imported from ./dateUtils.

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const DUR_MS = 180;

function weekRankToMinutes(rank: number, gridStartHour: number): number {
  return gridStartHour * 60 + (rank - 2) * 30;
}

function weekMinutesToRank(minutes: number, gridStartHour: number, slotRows: number): number {
  const lo = Math.round((minutes - gridStartHour * 60) / 30) + 2;
  return Math.max(2, Math.min(slotRows + 1, lo));
}

function markRangeForColumn(
  mark: { month: number; lo: number; hi: number; endMonth?: number },
  colIdx: number,
  firstRank: number,
  lastRank: number,
): { lo: number; hi: number } | null {
  const startCol = mark.month;
  const endCol = mark.endMonth ?? mark.month;
  if (colIdx < startCol || colIdx > endCol) return null;
  if (startCol === endCol) return { lo: mark.lo, hi: mark.hi };
  if (colIdx === startCol) return { lo: mark.lo, hi: lastRank };
  if (colIdx === endCol) return { lo: firstRank, hi: mark.hi };
  return { lo: firstRank, hi: lastRank };
}

function markRangeMinutes(
  mark: { lo: number; hi: number },
  gridStartHour: number,
): { startMin: number; endMin: number } {
  return {
    startMin: gridStartHour * 60 + (mark.lo - 2) * 30,
    endMin: gridStartHour * 60 + (mark.hi - 2 + 1) * 30,
  };
}

/** Single-column hold-drag that runs from 00:00 through 24:00. */
function markRangeCoversFullDay(
  mark: { month: number; lo: number; hi: number; endMonth?: number },
  gridStartHour: number,
): boolean {
  if ((mark.endMonth ?? mark.month) !== mark.month) return false;
  const { startMin, endMin } = markRangeMinutes(mark, gridStartHour);
  return timedMarkCoversFullDay(startMin, endMin);
}

function markRangeFromPointer(
  origin: { month: number; rank: number },
  col: number,
  rank: number,
): {
  month: number;
  lo: number;
  hi: number;
  endMonth?: number;
} | null {
  if (col === origin.month && rank === origin.rank) return null;
  const startCol = Math.min(origin.month, col);
  const endCol = Math.max(origin.month, col);
  const startRank = origin.month <= col ? origin.rank : rank;
  const endRank = origin.month <= col ? rank : origin.rank;
  return {
    month: startCol,
    lo: startCol === endCol ? Math.min(origin.rank, rank) : startRank,
    hi: startCol === endCol ? Math.max(origin.rank, rank) : endRank,
    endMonth: startCol === endCol ? undefined : endCol,
  };
}

function remapWeekCellKey(
  k: CellKey,
  fromHour: number,
  toHour: number,
  slotRows: number,
): CellKey {
  const nextLo = weekMinutesToRank(
    weekRankToMinutes(k.day * 2 + k.session, fromHour),
    toHour,
    slotRows,
  );
  return { ...k, day: Math.floor(nextLo / 2), session: (nextLo % 2) as Session };
}

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
  onMoveEvent: (
    id: string,
    patch: Partial<Pick<CalendarEvent, "startISO" | "endISO" | "allDay" | "sortIndex">>,
  ) => void;
  onDeleteEvent: (id: string) => void;
  /** Bulk delete — repeat-series scoped deletes from the session panel. */
  onDeleteEvents?: (ids: string[]) => void;
  /** Flip a coach-pending session into the accepted (owner) state. Only
   *  wired when the current user owns this calendar. */
  onAcceptCoachSession?: (id: string) => void;
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
  /** Cloud month-view year-corner control — opens the 12-month year view. */
  onOpenYearView?: () => void;
  /** Calendar day/week: hide hour labels and stack sessions at equal height. */
  hideTimeScale?: boolean;
  /** Hide the multi-day / all-day row on day, week, and month. */
  hideMultiDayRow?: boolean;
  appKind?: "calendar" | "diary";
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  /** When in team/admin mode, the team id whose category list drives
   *  newly-created session defaults. */
  teamId?: string | null;
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
  onDeleteEvents,
  onAcceptCoachSession,
  onReorderEvents,
  currentDate,
  currentRange,
  onCurrentDateChange,
  viewMode: viewModeProp,
  onViewModeChange,
  onOpenYearView,
  hideTimeScale = false,
  hideMultiDayRow = false,
  appKind = "calendar",
  memberId,
  viewerRole = "owner",
  teamId = null,
}: UnifiedElasticGridProps) {
  // viewMode is the only user-facing toggle now. There are no "types".
  //   - "day"   → 7-column rich spreadsheet (one row per 30-min slot)
  //   - "week"  → 7-column compact spreadsheet (hourly time labels)
  //   - "month" → MonthGridType1 (full month grid)
  const [viewModeInternal, setViewModeInternal] = useState<ViewMode>("month");
  const [weekAnchorEpoch, setWeekAnchorEpoch] = useState(0);
  const viewMode = viewModeProp ?? viewModeInternal;
  const isControlled = viewModeProp !== undefined;
  const { onContextMenu: onPasteContextMenu, overlay: pasteOverlay, toastNode: pasteToastNode } =
    useCalendarPasteContextMenu(viewMode, { onPasteCommit: () => onSelect(null) });
  const { user } = useAuth();
  const [editingKey, setEditingKey] = useState<CellKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Week/day columns currently on screen — used to map a clicked cell to a paste date. */
  const pasteWeekDatesRef = useRef<Date[]>([]);

  // Internal grid mode for the elastic spreadsheet (shared by Day & Week
  // views). Both day and week use the compact hourly-label layout
  // (kind: "year"); day-view simply renders a single column.
  const isDayView = viewMode === "day";
  const mode: Mode = { kind: "year" } as Mode;
  const [simpleView] = useDiarySimpleView();
  const isSimple = mode.kind === "year" && appKind === "diary" && simpleView && !isDayView;
  /** Calendar day/week stacked layout (equal-height tiles, no hour labels). */
  const isStackLayout =
    mode.kind === "year" &&
    appKind === "calendar" &&
    hideTimeScale &&
    (viewMode === "day" || viewMode === "week");


  // User-configurable week-view day timeframe. `startHour` is the default
  // viewport (that hour sits at the top on enter). Timed week/day grids
  // always render from 00:00 so sessions before the default hour keep their
  // true start — the user scrolls up to see them, and a slight drag cannot
  // snap them to 06:00.
  const [{ startHour: WEEK_START_HOUR_CFG, endHour: WEEK_END_HOUR_CFG }] =
    useWeekViewHours(appKind);
  const timedHourGrid =
    mode.kind === "year" &&
    !isSimple &&
    !isStackLayout &&
    (viewMode === "week" || viewMode === "day");
  const GRID_START_HOUR = timedHourGrid ? 0 : WEEK_START_HOUR_CFG;
  const WEEK_SPAN_HOURS = Math.max(1, WEEK_END_HOUR_CFG - GRID_START_HOUR);
  const WEEK_SLOT_ROWS = WEEK_SPAN_HOURS * 2;
  const ANCHOR_HOUR = WEEK_START_HOUR_CFG;
  /** Hour the current selected/mark ranks were encoded with. */
  const rankHourRef = useRef(GRID_START_HOUR);
  const paintedGridHourRef = useRef(GRID_START_HOUR);

  // Preload the active category list so a freshly-created week-view tile
  // mounts with the exact color the popover's category dropdown will
  // resolve to. Individual mode uses the user's personal categories;
  // admin mode uses the team's categories (under the entity header-tab).
  // Without this, the tile briefly renders with a hardcoded fallback,
  // then the popover's auto-sync swaps it — a visible flicker.
  const { categories: meCategories, loaded: meCategoriesLoaded } = useUserCategories();
  const adminTeamId = seat === "admin" ? teamId : null;
  const { categories: teamCategoriesRaw, loaded: teamCategoriesLoaded } = useUserCategories({
    teamId: adminTeamId,
  });
  const { groups: teamGroups } = useEntityRoster(adminTeamId);
  const teamCategories = useMemo(
    () =>
      sidebarAllCategories(teamCategoriesRaw, {
        teamId: adminTeamId,
        groupIds: teamGroups.map((g) => g.id),
      }),
    [teamCategoriesRaw, adminTeamId, teamGroups],
  );
  const sidebarCategories = seat === "admin" ? teamCategories : meCategories;
  const sidebarCategoriesLoaded = seat === "admin" ? teamCategoriesLoaded : meCategoriesLoaded;
  const { categories: diaryActivityCategories } = useUserCategories({ kind: "diary_activity" });
  // When a coach is viewing a client's calendar, preload the client's own
  // category list so a freshly-marked draft tile mounts with the same color
  // the saved session will resolve to. Without this, the tile briefly flashes
  // the coach's own top-category color before swapping to the client's.
  const clientOwnerId = useMemo(
    () => (calId.startsWith("client:") ? calId.slice(7) : null),
    [calId],
  );
  const { categories: clientCategories, loaded: clientCategoriesLoaded } = useUserCategories({
    ownerId: clientOwnerId,
  });
  const [clientGrantedCategoryIds, setClientGrantedCategoryIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!clientOwnerId || !user || clientOwnerId === user.id) {
      setClientGrantedCategoryIds(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("calendar_category_coach_access")
      .select("category_id")
      .eq("owner_id", clientOwnerId)
      .eq("coach_user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setClientGrantedCategoryIds(
          new Set((data ?? []).map((row) => row.category_id).filter(Boolean)),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [clientOwnerId, user]);

  const visibleClientCategories = useMemo(() => {
    if (!clientOwnerId || !user || clientOwnerId === user.id || clientGrantedCategoryIds === null) {
      return clientCategories;
    }
    return clientCategories.filter((category) => clientGrantedCategoryIds.has(category.id));
  }, [clientCategories, clientGrantedCategoryIds, clientOwnerId, user]);

  const handleViewModeChange = (v: ViewMode) => {
    if (!isControlled) setViewModeInternal(v);
    onViewModeChange?.(v);
    if (v === "week" || v === "day") setWeekAnchorEpoch((n) => n + 1);
  };

  // Both spreadsheet sub-views are always implemented; "month" routes to
  // MonthGridType1. There are no other combinations to gate on.

  const YEAR_COL = 220;
  const FOCUS_COL = 640;
  const ROW_YEAR = 28;
  const ROW_MONTH = 36;

  const WEEKNUM_GUTTER_PX = 48;
  const DAY_COL_MAX_PX = 600;
  // Stacking sessions hides the hour scale. The week scroller and the
  // multi-day row stay mounted so the visible week and that row do not move.
  const weekPan =
    mode.kind === "year" && !isSimple && !isDayView && viewMode === "week";
  const weekHScrollRef = useRef<HTMLDivElement | null>(null);
  const [weekHScrollGen, setWeekHScrollGen] = useState(0);
  const bodyShiftRef = useRef<HTMLDivElement | null>(null);
  const pendingHScrollRef = useRef<number | null>(null);
  const pendingHScrollAdjustRef = useRef(0);
  const skipHScrollResetRef = useRef(false);
  const skipVerticalAnchorRef = useRef(false);
  const hScrollAlignedKeyRef = useRef<string | null>(null);
  const hScrollLeftDayRef = useRef<number | null>(null);
  const hScrollWidthRef = useRef(0);
  const extendingHScrollRef = useRef(false);
  const hSnapAnimRef = useRef(0);
  const hSnappingRef = useRef(false);
  const weekDragPulseRef = useRef(false);
  const weekPanScrollTopRef = useRef<number | null>(null);
  const weekPanScrollLeftWatchRef = useRef(0);
  const hScrollEndSuppressRef = useRef(0);
  const committedWeekRef = useRef<{ start: number; end: number; anchor: number } | null>(null);
  const [bufferStartMs, setBufferStartMs] = useState(() => weekPanOrigin(new Date()).getTime());
  const [bufferDays, setBufferDays] = useState(() => weekPanBufferDays());
  const bufferStartRef = useRef(bufferStartMs);
  const bufferDaysRef = useRef(bufferDays);
  bufferStartRef.current = bufferStartMs;
  bufferDaysRef.current = bufferDays;
  const [expandHost, setExpandHost] = useState<HTMLDivElement | null>(null);
  const [hScrolling, setHScrolling] = useState(false);
  const [visibleCols, setVisibleCols] = useState(() => ({
    start: WEEK_PAN_WEEKS * WEEK_PAN_VISIBLE_DAYS,
    end: WEEK_PAN_WEEKS * WEEK_PAN_VISIBLE_DAYS + WEEK_PAN_VISIBLE_DAYS - 1,
  }));
  // Days actually on screen. The mount window is wider, and sessions in that
  // extra span must not reserve an all-day row.
  const [bandViewport, setBandViewport] = useState(() => ({
    start: WEEK_PAN_WEEKS * WEEK_PAN_VISIBLE_DAYS,
    end: WEEK_PAN_WEEKS * WEEK_PAN_VISIBLE_DAYS + WEEK_PAN_VISIBLE_DAYS - 1,
  }));
  const [dayColPx, setDayColPx] = useState(DAY_COL_MAX_PX);
  const dayColPxRef = useRef(dayColPx);
  dayColPxRef.current = dayColPx;
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!isDayView && !weekPan) {
      setDayColPx(DAY_COL_MAX_PX);
      return;
    }
    const measure = () => {
      const next = isDayView
        ? Math.min(
            DAY_COL_MAX_PX,
            Math.max(0, Math.floor(el.clientWidth - WEEKNUM_GUTTER_PX)),
          )
        : Math.max(1, (el.clientWidth - WEEKNUM_GUTTER_PX) / WEEK_PAN_VISIBLE_DAYS);
      dayColPxRef.current = next;
      setDayColPx((cur) => (Math.abs(cur - next) < 0.25 ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isDayView, weekPan]);
  const gridTemplateColumns = useMemo(() => {
    if (isDayView) {
      // Day view: single weekday column, capped at ~3× a week column,
      // shrinking so the column + week-number gutter stay fully in view.
      return `${WEEKNUM_GUTTER_PX}px ${dayColPx}px`;
    }
    if (mode.kind === "year") {
      // Week view: 28px week-number gutter + 7 weekday columns. Mirrors the
      // Month view exactly so a zoom animation between the two doesn't
      // shift column widths.
      return `48px repeat(7, minmax(0, 1fr))`;
    }
    // Legacy day-of-month spreadsheet (unused now that day-view is a single column).
    return `repeat(7, ${FOCUS_COL}px)`;
  }, [mode, isDayView, dayColPx]);

  const rowHeight = mode.kind === "year" ? ROW_YEAR : ROW_MONTH;

  const needsSlotRemap =
    appKind === "calendar" &&
    (viewMode === "week" || viewMode === "day") &&
    rankHourRef.current !== GRID_START_HOUR;
  const selectedForGrid =
    selected && needsSlotRemap
      ? remapWeekCellKey(selected, rankHourRef.current, GRID_START_HOUR, WEEK_SLOT_ROWS)
      : selected;
  const editingKeyForGrid =
    editingKey && needsSlotRemap
      ? remapWeekCellKey(editingKey, rankHourRef.current, GRID_START_HOUR, WEEK_SLOT_ROWS)
      : editingKey;
  const selectedId = selectedForGrid ? makeCellId(calId, selectedForGrid) : null;
  const editingId = editingKeyForGrid ? makeCellId(calId, editingKeyForGrid) : null;

  const beginEdit = useCallback(
    (k: CellKey) => {
      const id = makeCellId(calId, k);
      setEditValue(data[id]?.text ?? "");
      setEditingKey(k);
      rankHourRef.current = GRID_START_HOUR;
      onSelect(k);
    },
    [calId, data, onSelect, GRID_START_HOUR],
  );

  const commitEdit = useCallback(() => {
    if (editingKey) onCommitText(editingKey, editValue.trim());
    setEditingKey(null);
  }, [editingKey, editValue, onCommitText]);

  const syncCurrentDateToDay = useCallback(
    (date: Date) => {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      if (sameDay(d, currentDate)) return;
      // Cell clicks, session clicks, and create-drags pin the paste day.
      // That must not pull a horizontally scrolled week back to Monday.
      if (weekPan) skipHScrollResetRef.current = true;
      onCurrentDateChange(d, { start: d, end: d });
    },
    [currentDate, onCurrentDateChange, weekPan],
  );

  // Selection passes straight through — no month-zoom side effect.
  // Week/day: also pin currentDate to the clicked column so Cmd+V pastes there.
  const handleSelect = useCallback(
    (k: CellKey | null) => {
      rankHourRef.current = GRID_START_HOUR;
      onSelect(k);
      if (!k) return;
      if (viewMode !== "week" && viewMode !== "day") return;
      const date = pasteWeekDatesRef.current[k.month];
      if (date) syncCurrentDateToDay(date);
    },
    [onSelect, viewMode, syncCurrentDateToDay, GRID_START_HOUR],
  );

  const moveSelection = useCallback(
    (dx: number, dy: number) => {
      if (!selected) return;
      const { year: y } = selected;
      let { month, day, session } = selected;
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
      rankHourRef.current = GRID_START_HOUR;
      onSelect({ year: y, month, day, session });
    },
    [selected, onSelect, GRID_START_HOUR],
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
  const weekMarkPulseRef = useRef<WeekEdgePulse | null>(null);
  const weekMarkEndRef = useRef<(() => void) | null>(null);
  const weekMarkReleasedRef = useRef(false);
  const [isCreatingMark, setIsCreatingMark] = useState(false);
  const [gridEdgeScrollActive, setGridEdgeScrollActive] = useState(false);
  const [markRange, setMarkRange] = useState<{
    month: number;
    lo: number; // rank = day*2+session
    hi: number;
    /** Chronological last column when create-drag spans days. */
    endMonth?: number;
  } | null>(null);
  // Plus icon only shows after the user has released the mouse.
  const [markReleased, setMarkReleased] = useState(false);
  const [bandDropPreview, setBandDropPreview] = useState<{
    colIdx: number;
    startMin: number;
    title: string;
    color: string | null;
  } | null>(null);

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
    pendingEndDate?: Date;
    pendingTime?: { startMin: number; endMin: number };
    /** Bumped after week/day edge-resize so the open menu can sync times. */
    timeCommitNonce?: number;
    categoryId?: string | null;
    categoryName?: string | null;
    /** Snapshot of entity session description when the editor opened. */
    initialDescription?: string | null;
    /** Snapshot of entity roster group when the editor opened. */
    appGroupId?: string | null;
    /** Override for the input placeholder (e.g. "New session" for fresh mark). */
    placeholder?: string;
  } | null>(null);
  /** Hide the session menu while a week/day tile edge is being resized. */
  const [sessionEdgeResizing, setSessionEdgeResizing] = useState(false);
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
  const [draftEvent, setDraftEvent] = useState<CalendarEvent | null>(null);
  const [repeatLivePreview, setRepeatLivePreview] = useState<RepeatLivePreview | null>(null);
  const draftEventRef = useRef<CalendarEvent | null>(null);
  draftEventRef.current = draftEvent;
  const clearDraftEvent = useCallback((id?: string | null) => {
    setDraftEvent((current) => {
      if (!current) return current;
      if (id && current.id !== id) return current;
      return null;
    });
  }, []);
  const getEventById = useCallback((id?: string | null) => {
    if (!id) return null;
    if (draftEvent?.id === id) return draftEvent;
    if (draftEventRef.current?.id === id) return draftEventRef.current;
    return eventsRef.current.find((e) => e.id === id) ?? null;
  }, [draftEvent]);

  const applyTimesToEventIds = useCallback(
    (ids: string[], t: { startMin: number; endMin: number }) => {
      for (const id of ids) {
        const ev = getEventById(id);
        if (!ev) continue;
        const start = fromISOLocal(ev.startISO);
        const endDay = sessionInclusiveEndDay(start, fromISOLocal(ev.endISO));
        const clocks = isoFromMenuClocks(
          start,
          endDay,
          t.startMin,
          t.endMin,
        );
        const fullDay = promoteFullDayTimedSpan(clocks.startISO, clocks.endISO);
        const startISO = fullDay?.startISO ?? clocks.startISO;
        const endISO = fullDay?.endISO ?? clocks.endISO;
        const allDay = fullDay ? true : false;
        if (draftEventRef.current?.id === ev.id) {
          setDraftEvent({ ...ev, startISO, endISO, allDay });
        } else {
          onMoveEvent(ev.id, { startISO, endISO, allDay });
        }
      }
    },
    [getEventById, onMoveEvent],
  );

  // Calendar drag-to-move: the time/location is applied immediately on
  // release; no extra confirmation step is required.

  // Refs assigned later in render so openPopover can reach the latest
  // week-events lookup without forward-declaration issues.
  const eventAtCellRef = useRef<((k: CellKey) => CalendarEvent | null) | null>(null);

  const openPopover = useCallback(
    (k: CellKey, anchor: HTMLElement) => {
      // Week view: prefer editing the existing event under this cell.
      if (mode.kind === "year" && eventAtCellRef.current) {
        const ev = eventAtCellRef.current(k);
        if (ev) {
          resetSessionSidePanels(ev.id, { signUpEnabled: !!ev.signUpEnabled });
          setPopover({
            key: k,
            rect: anchor.getBoundingClientRect(),
            initialText: ev.title,
            initialColor: ev.color,
            isEdit: true,
            eventId: ev.id,
            categoryId: ev.categoryId ?? null,
            initialDescription: ev.description ?? null,
            appGroupId: ev.appGroupId ?? null,
            placeholder: ev.title ? undefined : "Session title",
          });
          return;
        }
      }
      resetSessionSidePanels(null);
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
    [calId, data, mode, resetSessionSidePanels],
  );

  // If the currently-open popover is bound to an event with an empty title
  // (i.e. a freshly mark-created tile the user never typed into), delete
  // that event. Used when transitioning to another tile (click or drag)
  // so the orphan tile disappears just like it does on outside-click.
  const popoverRef = useRef(popover);
  useEffect(() => {
    popoverRef.current = popover;
  }, [popover]);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    const ids = new Set(events.map((e) => e.id));
    setPopover((p) => {
      if (!p?.eventId || ids.has(p.eventId)) return p;
      // Week/day drafts live only in draftEvent until the user saves a title.
      if (draftEventRef.current?.id === p.eventId) return p;
      return null;
    });
  }, [events]);
  const discardEmptyPopoverEvent = useCallback(() => {
    const p = popoverRef.current;
    if (!p?.eventId) return;
    const ev = getEventById(p.eventId);
    if (ev && !ev.title.trim()) {
      if (draftEventRef.current?.id === p.eventId) clearDraftEvent(p.eventId);
      else onDeleteEvent(p.eventId);
    }
  }, [clearDraftEvent, getEventById, onDeleteEvent]);

  const closePopover = useCallback(
    (opts?: { discardEmpty?: boolean; preserveSidePanels?: boolean }) => {
      // Safety net: if the popover was bound to a freshly-mark-created
      // placeholder event that the user never titled, discard it so closing
      // via Escape (or any path that doesn't go through onCommit's empty-
      // title branch) doesn't leave an orphan untitled tile behind.
      if (opts?.discardEmpty !== false) discardEmptyPopoverEvent();
      if (!opts?.preserveSidePanels) {
        sessionSidePanelsRef.current = {
          ...sessionSidePanelsRef.current,
          participantsPanelOpen: false,
          locationMapOpen: false,
        };
      }
      setRepeatLivePreview(null);
      setPopover(null);
    },
    [discardEmptyPopoverEvent],
  );

  const markedIdsRef = useRef<Set<string>>(new Set());
  const [markedIds, setMarkedIds] = useState<Set<string>>(() => new Set());
  markedIdsRef.current = markedIds;
  const shiftHeldRef = useRef(false);
  const blockNativeShiftSelectRef = useRef(false);
  const clearMarks = useCallback(() => {
    setMarkedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);
  const addMarks = useCallback((ids: string[]) => {
    const nextIds = ids.filter((id) => id && !isRepeatPreviewEventId(id));
    if (nextIds.length === 0) return;
    setMarkedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of nextIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const {
    onSessionContextMenu,
    closeMenu: closeSessionContextMenu,
    overlay: sessionContextOverlay,
    toastNode: sessionContextToastNode,
    activeEventId: sessionContextEventId,
  } = useCalendarSessionContextMenu(viewMode, {
    onOpen: (event) => {
      onSelect(null);
      const p = popoverRef.current;
      if (p?.eventId && p.eventId !== event.id) discardEmptyPopoverEvent();
      closePopover({ discardEmpty: false });
    },
    onDelete: (id) => {
      if (draftEventRef.current?.id === id) clearDraftEvent(id);
      else onDeleteEvent(id);
    },
    shouldDismiss: (event) =>
      draftEventRef.current?.id === event.id && !event.title.trim(),
    onDismiss: (event) => {
      onSelect(null);
      clearDraftEvent(event.id);
      closePopover({ discardEmpty: false });
    },
    getMarkedIds: () => [...markedIdsRef.current],
    onDeleteMany: (ids) => {
      const own = ids.filter((id) => draftEventRef.current?.id !== id);
      if (ids.some((id) => draftEventRef.current?.id === id)) {
        const draftId = draftEventRef.current?.id;
        if (draftId) clearDraftEvent(draftId);
      }
      if (own.length > 0) onDeleteEvents?.(own);
      setMarkedIds(new Set());
    },
    onClearMarks: () => {
      setMarkedIds((prev) => (prev.size === 0 ? prev : new Set()));
    },
  });

  useEffect(() => {
    if (appKind === "diary") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      shiftHeldRef.current = true;
      if (e.repeat) return;
      const targetEl = e.target instanceof Element ? e.target : null;
      const activeEl = document.activeElement instanceof Element ? document.activeElement : null;
      const inSessionUi =
        !!targetEl?.closest("[data-role='popover'], [data-session-tile-menu]") ||
        !!activeEl?.closest("[data-role='popover'], [data-session-tile-menu]");
      if (!inSessionUi && (isEditableTarget(e.target) || isEditableTarget(document.activeElement))) return;
      // An open session menu stays up, so Shift can type a capital letter.
      // Marking still starts when another tile is shift-clicked, and that
      // click does not open a second menu.
      if (popoverRef.current || document.querySelector("[data-role='popover']")) return;
      if (inSessionUi && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const openId = popoverRef.current?.eventId ?? null;
      if (openId) {
        addMarks([openId]);
        closePopover({ discardEmpty: false });
        closeSessionContextMenu();
      }
      window.dispatchEvent(new Event(SESSION_SHIFT_MARK_EVENT));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      shiftHeldRef.current = false;
      if (!blockNativeShiftSelectRef.current) return;
      blockNativeShiftSelectRef.current = false;
      window.getSelection()?.removeAllRanges();
    };
    const onBlur = () => {
      shiftHeldRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [addMarks, appKind, closePopover, closeSessionContextMenu]);

  useEffect(() => {
    if (appKind === "diary") return;
    const onSelectStart = (e: Event) => {
      if (!blockNativeShiftSelectRef.current && !shiftHeldRef.current) return;
      if (!blockNativeShiftSelectRef.current && !sessionTileFromTarget(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener("selectstart", onSelectStart);
    return () => document.removeEventListener("selectstart", onSelectStart);
  }, [appKind]);

  useEffect(() => {
    if (appKind === "diary" || markedIds.size === 0) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      if (sessionTileFromTarget(e.target)) return;
      if (el.closest("[data-session-tile-menu]")) return;
      if (el.closest("[data-role='popover']")) return;
      if (shiftHeldRef.current && el.closest("[data-calendar-view-nav]")) return;
      clearMarks();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [appKind, clearMarks, markedIds.size]);

  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    if (viewModeRef.current === viewMode) return;
    viewModeRef.current = viewMode;
    if (!shiftHeldRef.current) clearMarks();
  }, [clearMarks, viewMode]);

  const onMarkPointerDownCapture = (e: React.PointerEvent) => {
    if (appKind === "diary" || !e.shiftKey || e.button !== 0) return;
    if (!sessionTileFromTarget(e.target)) return;
    e.stopPropagation();
  };
  const onMarkMouseDownCapture = (e: React.MouseEvent) => {
    if (appKind === "diary" || !e.shiftKey || e.button !== 0) return;
    if (!sessionTileFromTarget(e.target)) return;
    // Shift-click otherwise extends the browser's text selection from the
    // last click, which paints the light-blue highlight across other UI.
    blockNativeShiftSelectRef.current = true;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
  };
  const onMarkMouseUpCapture = (e: React.MouseEvent) => {
    if (appKind === "diary" || !e.shiftKey || e.button !== 0) return;
    if (!sessionTileFromTarget(e.target)) return;
    window.getSelection()?.removeAllRanges();
  };
  const onMarkClickCapture = (e: React.MouseEvent) => {
    if (appKind === "diary") return;
    const tile = sessionTileFromTarget(e.target);
    if (!tile) return;
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      window.getSelection()?.removeAllRanges();
      const openId = popoverRef.current?.eventId;
      addMarks(openId ? [openId, tile.id] : [tile.id]);
      closePopover({ discardEmpty: false });
      closeSessionContextMenu();
      window.dispatchEvent(new Event(SESSION_SHIFT_MARK_EVENT));
      return;
    }
    if (markedIdsRef.current.size > 0) clearMarks();
  };

  /** Re-open the session panel beside the tile after a week/day drag drop. */
  const reopenPopoverAtEventTile = useCallback(
    (id: string, ev: CalendarEvent) => {
      const apply = () => {
        const el = document.querySelector<HTMLElement>(
          `[data-event-id="${id.replace(/"/g, '\\"')}"]`,
        );
        const rect = el?.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        // Keep side-panel flags when reopening the same event after drag;
        // clear them if this tile is a different session than the ref tracked.
        if (sessionSidePanelsRef.current.eventId !== id) {
          resetSessionSidePanels(id, { signUpEnabled: !!ev.signUpEnabled });
        }
        const pendingTime = ev.allDay
          ? undefined
          : sessionMenuClockRange(fromISOLocal(ev.startISO), fromISOLocal(ev.endISO));
        setPopover({
          key: { year, month: 0, day: 1, session: 0 },
          rect,
          initialText: ev.title,
          initialColor: ev.color,
          isEdit: true,
          eventId: id,
          categoryId: ev.categoryId ?? null,
          initialDescription: ev.description ?? null,
          appGroupId: ev.appGroupId ?? null,
          placeholder: ev.title ? undefined : "Session title",
          pendingTime,
        });
        return true;
      };
      // Measure after layout: flushSync may move the tile to another column
      // (detaching the drag anchor), and drag transforms must be cleared first.
      requestAnimationFrame(() => {
        if (apply()) return;
        requestAnimationFrame(apply);
      });
    },
    [year, resetSessionSidePanels],
  );

  useEffect(() => {
    const draftId = draftEventRef.current?.id;
    if (!draftId) return;
    clearDraftEvent(draftId);
    setPopover((current) => (current?.eventId === draftId ? null : current));
    setMarkRange(null);
    setMarkReleased(false);
  }, [calId, viewMode, clearDraftEvent]);

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
      weekMarkReleasedRef.current = true;
      const pulse = weekMarkPulseRef.current;
      pulse?.leave();
      const end = () => {
        if (markActiveRef.current) {
          setMarkReleased(true);
        }
        markActiveRef.current = false;
        markStartRef.current = null;
        setIsCreatingMark(false);
      };
      if (pulse?.isPulsing()) {
        weekMarkEndRef.current = end;
        return;
      }
      end();
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Hold-and-drag create: ignore right-click (and ctrl-click) so paste /
  // session menus cannot open mid-gesture.
  useEffect(() => {
    const blockMenu = (e: Event) => {
      if (!markActiveRef.current) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const blockSecondaryDown = (e: MouseEvent | PointerEvent) => {
      if (!markActiveRef.current) return;
      if (e.button === 0) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("contextmenu", blockMenu, true);
    document.addEventListener("auxclick", blockMenu, true);
    document.addEventListener("mousedown", blockSecondaryDown, true);
    document.addEventListener("pointerdown", blockSecondaryDown, true);
    return () => {
      document.removeEventListener("contextmenu", blockMenu, true);
      document.removeEventListener("auxclick", blockMenu, true);
      document.removeEventListener("mousedown", blockSecondaryDown, true);
      document.removeEventListener("pointerdown", blockSecondaryDown, true);
    };
  }, []);

  const materializeMarkSession = useCallback(
    (
      range: { month: number; lo: number; hi: number; endMonth?: number },
      anchor?: HTMLElement | null,
      timeOverride?: { startMin: number; endMin: number },
    ) => {
      if (viewerRole !== "owner") return;
      const multiCol = (range.endMonth ?? range.month) !== range.month;
      if (!multiCol && range.hi < range.lo) return;
      if (calId.startsWith("client:") && (!clientCategoriesLoaded || clientGrantedCategoryIds === null)) return;
      const isCoachOnClient = calId.startsWith("client:");
      const day = Math.floor(range.lo / 2);
      const session = (range.lo % 2) as Session;
      const sel = `[data-cell-key="${range.month}:${day}:${session}"]`;
      const el =
        anchor ?? (document.querySelector(sel) as HTMLElement | null);
      if (!el) return;

      if (mode.kind === "year" && appKind !== "diary") {
        const isDay = viewMode === "day";
        const startMin =
          timeOverride?.startMin ?? GRID_START_HOUR * 60 + (range.lo - 2) * 30;
        const endMin =
          timeOverride?.endMin ?? GRID_START_HOUR * 60 + (range.hi - 2 + 1) * 30;
        const endCol = range.endMonth ?? range.month;
        // Column index is the pan-buffer day, not an offset from this Monday.
        const columnDate = (index: number): Date | null => {
          const raw = pasteWeekDatesRef.current[index];
          if (!raw) return null;
          return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
        };
        const startDate = isDay
          ? new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
          : columnDate(range.month);
        const endDate = isDay ? startDate : columnDate(endCol);
        if (!startDate || !endDate) return;
        const clocks = isoFromMenuClocks(
          startDate,
          endDate,
          startMin,
          endMin,
        );
        // A hold-drag that covers every slot from 00:00 through 24:00 becomes
        // an all-day session when the pointer is released.
        const fillsDay =
          !timeOverride &&
          !multiCol &&
          markRangeCoversFullDay(range, GRID_START_HOUR);
        const fullDay = fillsDay
          ? {
              startISO: toISOLocal(setHM(startDate, 0, 0)),
              endISO: toISOLocal(setHM(startDate, 23, 59)),
              allDay: true as const,
            }
          : promoteFullDayTimedSpan(clocks.startISO, clocks.endISO);
        const startISO = fullDay?.startISO ?? clocks.startISO;
        const endISO = fullDay?.endISO ?? clocks.endISO;
        setMarkRange(null);
        setMarkReleased(false);
        onSelect(null);
        if (!sidebarCategoriesLoaded && !isCoachOnClient) return;
        const meDefaultCategory = meCategories[0] ?? null;
        const adminDefaultCategory = teamCategories[0] ?? null;
        const clientDefaultCategory = visibleClientCategories[0] ?? null;
        const defaultCategoryId = isCoachOnClient
          ? (clientDefaultCategory?.id ?? null)
          : seat === "admin"
            ? (adminDefaultCategory?.id ?? null)
            : (meDefaultCategory?.id ?? null);
        const defaultColor = getSessionDefaultColor();
        const created: CalendarEvent = {
          id: makeEventId(),
          title: "",
          color: defaultColor,
          categoryId: defaultCategoryId,
          startISO,
          endISO,
          allDay: !!fullDay,
          sortIndex: Date.now(),
          coachPending: calId.startsWith("client:"),
        };
        // Stack layout: paint the tile first so the menu can anchor to it
        // (right-of-tile), matching month-view placement instead of the
        // clicked hour-row.
        if (isStackLayout) {
          flushSync(() => {
            setDraftEvent(created);
          });
        } else {
          setDraftEvent(created);
        }
        resetSessionSidePanels(created.id);
        const tile = isStackLayout
          ? document.querySelector<HTMLElement>(
              `[data-event-id="${created.id.replace(/"/g, '\\"')}"]`,
            )
          : null;
        const tileRect = tile?.getBoundingClientRect();
        const rect =
          tileRect && tileRect.width > 0 && tileRect.height > 0
            ? tileRect
            : el.getBoundingClientRect();
        setPopover({
          key: { year, month: range.month, day, session },
          rect,
          initialText: "",
          initialColor: created.color ?? null,
          categoryId: created.categoryId ?? null,
          isEdit: true,
          eventId: created.id,
          placeholder: "Session title",
          pendingTime: { startMin, endMin },
          pendingDate: startDate,
          pendingEndDate: endDate,
        });
        return;
      }

      openPopover({ year, month: range.month, day, session }, el);
      onSelect(null);
    },
    [
      viewerRole,
      calId,
      clientCategoriesLoaded,
      clientGrantedCategoryIds,
      mode.kind,
      appKind,
      viewMode,
      currentDate,
      GRID_START_HOUR,
      onSelect,
      sidebarCategoriesLoaded,
      meCategories,
      teamCategories,
      visibleClientCategories,
      seat,
      year,
      resetSessionSidePanels,
      openPopover,
      isStackLayout,
    ],
  );

  // When a mark range is released:
  //  - Calendar week view: immediately materialize a real session tile
  //    ("Session" by default) covering the marked area, then anchor the
  //    edit popover to it. The tile's top/bottom edge handles become
  //    available right away, just like editing an existing session.
  //  - Other views (diary week, day): fall back to the legacy popover
  //    flow with the marked-range overlay.
  useEffect(() => {
    if (!markReleased || !markRange) return;
    materializeMarkSession(markRange);
  }, [markReleased, markRange, materializeMarkSession]);

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
    (
      k: CellKey,
    ): { in: boolean; isFirst: boolean; isLast: boolean; isPlus: boolean; size: number } => {
      if (!markRange || k.month !== markRange.month)
        return { in: false, isFirst: false, isLast: false, isPlus: false, size: 0 };
      const fromHour = rankHourRef.current;
      const lo =
        fromHour === GRID_START_HOUR
          ? markRange.lo
          : weekMinutesToRank(
              weekRankToMinutes(markRange.lo, fromHour),
              GRID_START_HOUR,
              WEEK_SLOT_ROWS,
            );
      const hi =
        fromHour === GRID_START_HOUR
          ? markRange.hi
          : weekMinutesToRank(
              weekRankToMinutes(markRange.hi, fromHour),
              GRID_START_HOUR,
              WEEK_SLOT_ROWS,
            );
      const r = k.day * 2 + k.session;
      const inR = r >= lo && r <= hi;
      const mid = Math.floor((lo + hi) / 2);
      return {
        in: inR,
        isFirst: r === lo,
        isLast: r === hi,
        isPlus: inR && r === mid,
        size: hi - lo + 1,
      };
    },
    [markRange, GRID_START_HOUR, WEEK_SLOT_ROWS],
  );

  const beginMark = useCallback((k: CellKey) => {
    const r = k.day * 2 + k.session;
    markStartRef.current = { month: k.month, rank: r };
    markActiveRef.current = true;
    rankHourRef.current = GRID_START_HOUR;
    setIsCreatingMark(true);
    setMarkReleased(false);
    setMarkRange(null);
  }, [GRID_START_HOUR]);

  const extendMark = useCallback((k: CellKey) => {
    if (!markActiveRef.current || !markStartRef.current) return;
    if (isDayView && k.month !== markStartRef.current.month) return;
    const origin = markStartRef.current;
    const r = k.day * 2 + k.session;
    setMarkRange(markRangeFromPointer(origin, k.month, r));
  }, [isDayView]);

  // Double-click on a single week/day cell: create the session in this
  // turn. Going through markRange+release would paint a one-frame preview
  // tile, then swap it for the real one (a visible jump).
  // Stack layout (hour scale hidden): ignore the clicked row and use the
  // same 08:00–09:00 default as month-view create.
  const markSingleCell = useCallback((k: CellKey, anchor?: HTMLElement) => {
    const r = k.day * 2 + k.session;
    markActiveRef.current = false;
    markStartRef.current = null;
    setIsCreatingMark(false);
    if (mode.kind === "year" && appKind !== "diary") {
      materializeMarkSession(
        { month: k.month, lo: r, hi: r },
        anchor,
        isStackLayout ? { startMin: 8 * 60, endMin: 9 * 60 } : undefined,
      );
      return;
    }
    markStartRef.current = { month: k.month, rank: r };
    setMarkRange({ month: k.month, lo: r, hi: r });
    setMarkReleased(true);
  }, [appKind, isStackLayout, materializeMarkSession, mode.kind]);

  const beginMarkDrag = useCallback(
    (k: CellKey) => {
      if (!markRange) return;
      const grabRank = k.day * 2 + k.session;
      markDragRef.current = {
        grabRank,
        grabMonth: k.month,
        size: markRange.hi - markRange.lo + 1,
        offset: grabRank - markRange.lo,
      };
      setIsDraggingMark(true);
    },
    [markRange],
  );

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
      // Clamp to slot range. Week-view rows = WEEK_SPAN_HOURS × 2 slots.
      const maxRank = WEEK_SLOT_ROWS - 1;
      if (newLo < 0) {
        newHi -= newLo;
        newLo = 0;
      }
      if (newHi > maxRank) {
        newLo -= newHi - maxRank;
        newHi = maxRank;
      }
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
      const mm = (mode as { kind: "month"; month: number }).month;
      targetMonth = mm;
      lastFocusedMonthRef.current = mm;
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

  const colCount = isDayView ? 1 : weekPan ? bufferDays : 7;

  const months = useMemo(
    () =>
      // Type 2 spreadsheet renders 7 weekday columns (Mon–Sun) instead of
      // the full 12-month axis. Day-view collapses this to a single column.
      // Week horizontal scroll renders a buffer of days, still Monday-aligned.
      Array.from({ length: colCount }, (_, idx) => ({
        idx,
        label: MONTH_LABELS_SHORT[idx % 7] ?? MONTH_LABELS_SHORT[0],
        full: MONTH_LABELS_FULL[idx % 7] ?? MONTH_LABELS_FULL[0],
        dim: daysInMonth(year, idx % 12),
      })),
    [year, colCount],
  );

  const isMonthFocused = (m: number) =>
    mode.kind === "month" && (mode as { kind: "month"; month: number }).month === m;
  const isMonthPeriph = (m: number) =>
    mode.kind === "month" && (mode as { kind: "month"; month: number }).month !== m;

  // Live clock — updated every 15s so the "now" line stays accurate.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Date for each visible weekday column. Week-view = 7 days anchored to
  // the Monday of currentDate. Day-view = a single column for currentDate.
  const weekDates = useMemo(() => {
    if (isDayView) {
      return [new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())];
    }
    if (weekPan) {
      const origin = new Date(bufferStartMs);
      return Array.from({ length: bufferDays }, (_, i) => addDays(origin, i));
    }
    const start = startOfWeekMon(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate, isDayView, weekPan, bufferStartMs, bufferDays]);
  pasteWeekDatesRef.current = weekDates;
  const weekDatesRef = useRef(weekDates);
  weekDatesRef.current = weekDates;
  const weekRender = useMemo(() => {
    if (!weekPan) return null;
    const base = weekRenderRange(visibleCols.start, visibleCols.end, weekDates.length);
    if (!markRange) return base;
    const last = Math.max(0, weekDates.length - 1);
    return {
      start: Math.max(0, Math.min(base.start, markRange.month)),
      end: Math.min(last, Math.max(base.end, markRange.endMonth ?? markRange.month)),
    };
  }, [weekPan, visibleCols, weekDates.length, markRange]);
  const columnMonths = useMemo(() => {
    if (!weekRender) return months;
    return months.filter((m) => m.idx >= weekRender.start && m.idx <= weekRender.end);
  }, [months, weekRender]);
  const paintedColumns = weekPan
    ? `repeat(${weekDates.length}, ${dayColPx}px)`
    : gridTemplateColumns;
  const weekContentWidth = weekPan ? weekDates.length * dayColPx : 0;

  const bindWeekHScroll = useCallback((node: HTMLDivElement | null) => {
    if (weekHScrollRef.current === node) return;
    weekHScrollRef.current = node;
    if (node) setWeekHScrollGen((g) => g + 1);
  }, []);
  const bindExpandHost = useCallback((node: HTMLDivElement | null) => {
    setExpandHost((prev) => (prev === node ? prev : node));
  }, []);

  const syncBodyShift = useCallback(() => {
    // Header days and the hour grid share one scroller, so scrollLeft moves both.
  }, []);

  const syncLiveWeekSpan = useCallback((scrollLeft: number) => {
    const width = dayColPxRef.current;
    const dates = weekDatesRef.current;
    if (width <= 0 || dates.length === 0) return;
    const span = visibleWeekSpan(scrollLeft, width, dates.length);
    const start = dates[span.start];
    const end = dates[span.end];
    if (!start || !end) return;
    setLiveWeekSpan(start, end);
  }, []);

  const publishVisibleDays = useCallback(
    (el: HTMLElement) => {
      const width = dayColPxRef.current;
      if (width <= 0) return;
      const viewW = Math.max(0, el.clientWidth - WEEKNUM_GUTTER_PX);
      const range = visibleDayRange(el.scrollLeft, viewW, width, weekDatesRef.current.length);
      setVisibleCols((prev) =>
        prev.start === range.start && prev.end === range.end ? prev : range,
      );
      setBandViewport((prev) =>
        prev.start === range.start && prev.end === range.end ? prev : range,
      );
      syncLiveWeekSpan(el.scrollLeft);
      const span = visibleWeekSpan(el.scrollLeft, width, weekDatesRef.current.length);
      const startDate = weekDatesRef.current[span.start];
      const endDate = weekDatesRef.current[span.end];
      if (!startDate || !endDate) return;
      const visible = weekDatesRef.current.slice(span.start, span.end + 1);
      const next = anchorDateForVisibleDays(currentDate, visible);
      const nextDay = startOfDay(next);
      const startTime = startOfDay(startDate).getTime();
      const endTime = startOfDay(endDate).getTime();
      const anchorTime = nextDay.getTime();
      const prevCommit = committedWeekRef.current;
      if (
        prevCommit &&
        prevCommit.start === startTime &&
        prevCommit.end === endTime &&
        prevCommit.anchor === anchorTime
      ) {
        return;
      }
      committedWeekRef.current = { start: startTime, end: endTime, anchor: anchorTime };
      if (!sameDay(nextDay, currentDate)) {
        skipHScrollResetRef.current = true;
        skipVerticalAnchorRef.current = true;
      }
      onCurrentDateChange(sameDay(nextDay, currentDate) ? currentDate : nextDay, {
        start: new Date(startTime),
        end: new Date(endTime),
      });
    },
    [currentDate, onCurrentDateChange, syncLiveWeekSpan],
  );
  const publishVisibleDaysRef = useRef(publishVisibleDays);
  publishVisibleDaysRef.current = publishVisibleDays;

  useLayoutEffect(() => {
    if (!weekPan || dayColPx <= 0) {
      if (!weekPan) {
        clearLiveWeekSpan();
        // A skipped realignment belongs to the week that was on screen.
        // Leaving it set would skip the return trip and open another week.
        skipHScrollResetRef.current = false;
      }
      return;
    }
    const el = weekHScrollRef.current;
    // A pan grew the day strip. Remember that before the adjust below clears it.
    const panExtended = extendingHScrollRef.current;
    // Buffer origin is part of the key. Rebuilding the day strip on the way
    // back from day view must realign; a key from the old origin would keep
    // the previous scroll index and open a different week.
    const alignKey = `${currentDate.getTime()}:${weekAnchorEpoch}:${bufferStartMs}:${bufferDays}`;
    if (pendingHScrollRef.current != null && el) {
      el.scrollLeft = pendingHScrollRef.current;
      pendingHScrollRef.current = null;
      syncBodyShift();
    }
    if (pendingHScrollAdjustRef.current && el) {
      el.scrollLeft += pendingHScrollAdjustRef.current;
      pendingHScrollAdjustRef.current = 0;
      extendingHScrollRef.current = false;
      hScrollAlignedKeyRef.current = alignKey;
      if (dayColPx > 0) hScrollLeftDayRef.current = el.scrollLeft / dayColPx;
      syncBodyShift();
      syncLiveWeekSpan(el.scrollLeft);
      return;
    }
    if (panExtended) {
      // More days were added ahead of the pan. Keep scrollLeft where the
      // gesture put it, and allow the next edge to grow the strip again.
      extendingHScrollRef.current = false;
      if (skipHScrollResetRef.current) skipHScrollResetRef.current = false;
      hScrollAlignedKeyRef.current = alignKey;
      if (el) {
        if (dayColPx > 0) hScrollLeftDayRef.current = el.scrollLeft / dayColPx;
        syncLiveWeekSpan(el.scrollLeft);
      }
      return;
    }
    if (skipHScrollResetRef.current) {
      skipHScrollResetRef.current = false;
      hScrollAlignedKeyRef.current = alignKey;
      if (el) syncLiveWeekSpan(el.scrollLeft);
      return;
    }
    if (!el) return;
    if (hScrollAlignedKeyRef.current === alignKey) {
      if (
        hScrollWidthRef.current !== dayColPx &&
        hScrollLeftDayRef.current != null
      ) {
        el.scrollLeft = hScrollLeftDayRef.current * dayColPx;
        hScrollWidthRef.current = dayColPx;
        syncBodyShift();
      }
      syncLiveWeekSpan(el.scrollLeft);
      return;
    }
    // Day view stores a single wide column. The ref already has the week
    // column width (measured earlier this commit); the state value may not.
    const colW = dayColPxRef.current > 0 ? dayColPxRef.current : dayColPx;
    hScrollWidthRef.current = colW;
    const origin = new Date(bufferStartRef.current);
    const count = bufferDaysRef.current;
    const index = mondayIndexInBuffer(origin, currentDate);
    const comfortable =
      index >= WEEK_PAN_VISIBLE_DAYS && index <= count - WEEK_PAN_VISIBLE_DAYS * 2;
    if (!comfortable) {
      const mondayIndex = WEEK_PAN_WEEKS * WEEK_PAN_VISIBLE_DAYS;
      hScrollLeftDayRef.current = mondayIndex;
      pendingHScrollRef.current = mondayIndex * colW;
      hScrollAlignedKeyRef.current = alignKey;
      setBufferStartMs(weekPanOrigin(currentDate).getTime());
      setBufferDays(weekPanBufferDays());
      return;
    }
    el.scrollLeft = index * colW;
    hScrollLeftDayRef.current = index;
    syncBodyShift();
    hScrollAlignedKeyRef.current = alignKey;
    syncLiveWeekSpan(el.scrollLeft);
  }, [weekPan, dayColPx, currentDate, weekAnchorEpoch, bufferStartMs, bufferDays, syncBodyShift, syncLiveWeekSpan, weekHScrollGen]);

  useLayoutEffect(() => {
    if (!weekPan) clearLiveWeekSpan();
    return () => {
      if (weekPan) clearLiveWeekSpan();
    };
  }, [weekPan]);

  useEffect(() => {
    if (!weekPan) return;
    const root = scrollRef.current;
    const scroller = weekHScrollRef.current;
    if (!root || !scroller) return;
    let endTimer = 0;
    let scrollingUi = false;
    let stepToken = 0;
    let notchTimer = 0;
    weekPanScrollTopRef.current = scroller.scrollTop;
    weekPanScrollLeftWatchRef.current = scroller.scrollLeft;
    const cancelSnap = () => {
      hSnappingRef.current = false;
      if (hSnapAnimRef.current) cancelAnimationFrame(hSnapAnimRef.current);
      hSnapAnimRef.current = 0;
    };
    const finishScroll = () => {
      scrollingUi = false;
      hSnappingRef.current = false;
      hSnapAnimRef.current = 0;
      // The snap's own scrollend would otherwise schedule a second settle.
      hScrollEndSuppressRef.current = performance.now() + 80;
      setHScrolling(false);
      publishVisibleDays(scroller);
      // A notch animates with the snap lock on, so the scroll listener does
      // not grow the strip. Grow it once the day has landed, before the next step.
      extendBuffer();
    };
    // Land on a day boundary after the browser finishes the pan. The curve
    // starts and ends at rest so the settle does not kick the columns.
    const animateTo = (target: number) => {
      window.clearTimeout(endTimer);
      cancelSnap();
      const from = scroller.scrollLeft;
      const dist = target - from;
      if (Math.abs(dist) <= 0.5) {
        if (Math.abs(target - from) > 0.05) scroller.scrollLeft = target;
        finishScroll();
        return;
      }
      const t0 = performance.now();
      const dur = Math.min(240, Math.max(110, Math.abs(dist) * 1.05));
      hSnappingRef.current = true;
      const step = (now: number) => {
        if (!hSnappingRef.current) return;
        const t = Math.min(1, (now - t0) / dur);
        const ease = 0.5 - 0.5 * Math.cos(Math.PI * t);
        scroller.scrollLeft = t < 1 ? from + dist * ease : target;
        if (t < 1) hSnapAnimRef.current = requestAnimationFrame(step);
        else finishScroll();
      };
      hSnapAnimRef.current = requestAnimationFrame(step);
    };
    const settle = () => {
      const width = dayColPxRef.current;
      const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      animateTo(snapScrollLeft(scroller.scrollLeft, width, max));
    };
    const markScrolling = () => {
      if (!scrollingUi) {
        scrollingUi = true;
        setHScrolling(true);
      }
      window.clearTimeout(endTimer);
      endTimer = window.setTimeout(settle, 180);
    };
    const extendBuffer = () => {
      if (extendingHScrollRef.current) return;
      const width = dayColPxRef.current;
      if (width <= 0) return;
      const edge = WEEK_PAN_VISIBLE_DAYS * width;
      if (scroller.scrollLeft < edge) {
        extendingHScrollRef.current = true;
        pendingHScrollAdjustRef.current += edge;
        setBufferStartMs((ms) => addDays(new Date(ms), -WEEK_PAN_VISIBLE_DAYS).getTime());
        setBufferDays((n) => n + WEEK_PAN_VISIBLE_DAYS);
        return;
      }
      const max = scroller.scrollWidth - scroller.clientWidth;
      if (max - scroller.scrollLeft < edge) {
        extendingHScrollRef.current = true;
        setBufferDays((n) => n + WEEK_PAN_VISIBLE_DAYS);
      }
    };
    const followMountedDays = (direction: -1 | 0 | 1) => {
      const width = dayColPxRef.current;
      if (width <= 0) return;
      const viewW = Math.max(0, scroller.clientWidth - WEEKNUM_GUTTER_PX);
      const range = visibleDayRange(scroller.scrollLeft, viewW, width, weekDatesRef.current.length);
      const count = weekDatesRef.current.length;
      setVisibleCols((prev) => {
        const mounted = weekRenderRange(prev.start, prev.end, count);
        if (weekMountCovers(range.start, range.end, mounted.start, mounted.end)) return prev;
        const next = weekMountWindow(range.start, range.end, count, direction);
        if (prev.start === next.start && prev.end === next.end) return prev;
        return next;
      });
    };
    let lastLeft = scroller.scrollLeft;
    let lastDay =
      dayColPxRef.current > 0 ? Math.floor(scroller.scrollLeft / dayColPxRef.current) : -1;
    const onScroll = () => {
      const left = scroller.scrollLeft;
      if (Math.abs(left - lastLeft) < 0.5) return;
      const width = dayColPxRef.current;
      const direction: -1 | 0 | 1 = left > lastLeft ? 1 : -1;
      lastLeft = left;
      if (width > 0) hScrollLeftDayRef.current = left / width;
      if (weekDragPulseRef.current) return;
      syncLiveWeekSpan(left);
      // The snap animation writes scrollLeft. Keep that off the React path
      // so the ease stays on the display refresh.
      if (hSnappingRef.current) return;
      if (width > 0) {
        const viewW = Math.max(0, scroller.clientWidth - WEEKNUM_GUTTER_PX);
        const range = visibleDayRange(left, viewW, width, weekDatesRef.current.length);
        setBandViewport((prev) =>
          prev.start === range.start && prev.end === range.end ? prev : range,
        );
      }
      const day = width > 0 ? Math.floor(left / width) : lastDay;
      if (day !== lastDay) {
        lastDay = day;
        extendBuffer();
        followMountedDays(direction);
      }
      markScrolling();
    };
    const onScrollEnd = () => {
      if (weekDragPulseRef.current || hSnappingRef.current || performance.now() < hScrollEndSuppressRef.current) return;
      window.clearTimeout(endTimer);
      endTimer = window.setTimeout(settle, 48);
    };
    // Trackpad pans scroll natively (passive listener, no preventDefault) so
    // the columns track the finger at the display refresh rate. A mouse
    // notch is one isolated step and still advances a day.
    let lastWheelTs = 0;
    const cancelNotch = () => {
      stepToken += 1;
      if (notchTimer) window.clearTimeout(notchTimer);
      notchTimer = 0;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      let dx = 0;
      if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        dx = wheelDeltaPixels(e.deltaY, e.deltaMode);
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        dx = wheelDeltaPixels(e.deltaX, e.deltaMode);
      }
      if (dx === 0) return;
      const now = performance.now();
      const gap = now - lastWheelTs;
      lastWheelTs = now;
      if (gap <= WEEK_PAN_WHEEL_BURST_MS) {
        cancelNotch();
        cancelSnap();
        return;
      }
      cancelSnap();
      if (!weekPanWheelShouldStep(dx, e.deltaMode, gap)) return;
      const origin = scroller.scrollLeft;
      const token = (stepToken += 1);
      // Wait out a trackpad burst. A real notch has no follow-up sample, so
      // the step starts only after the finger's stream would have continued.
      notchTimer = window.setTimeout(() => {
        notchTimer = 0;
        if (token !== stepToken) return;
        const width = dayColPxRef.current;
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        const target = snapScrollLeft(origin + weekPanWheelDelta(dx, width, true), width, max);
        animateTo(target);
      }, WEEK_PAN_WHEEL_BURST_MS);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    scroller.addEventListener("scrollend", onScrollEnd);
    root.addEventListener("wheel", onWheel, { passive: true });
    syncBodyShift();
    publishVisibleDays(scroller);
    return () => {
      window.clearTimeout(endTimer);
      cancelSnap();
      cancelNotch();
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("scrollend", onScrollEnd);
      root.removeEventListener("wheel", onWheel);
    };
  }, [weekPan, weekHScrollGen, publishVisibleDays, syncBodyShift]);

  const beginWeekEdgePulse = (onFrame: (scrollLeft: number) => void, onPulseEnd: () => void): WeekEdgePulse => {
    if (!weekPan) return inertWeekEdgePulse();
    return createWeekEdgePulse({
      scroller: () => weekHScrollRef.current,
      pane: () => {
        const el = weekHScrollRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { left: rect.left + WEEKNUM_GUTTER_PX, right: rect.right };
      },
      dayWidth: () => dayColPxRef.current,
      lock: weekDragPulseRef,
      prepare: (target) => {
        const el = weekHScrollRef.current;
        const width = dayColPxRef.current;
        if (!el || width <= 0) return;
        hSnappingRef.current = false;
        if (hSnapAnimRef.current) cancelAnimationFrame(hSnapAnimRef.current);
        hSnapAnimRef.current = 0;
        const viewW = Math.max(0, el.clientWidth - WEEKNUM_GUTTER_PX);
        const count = weekDatesRef.current.length;
        const from = visibleDayRange(el.scrollLeft, viewW, width, count);
        const dest = visibleDayRange(target, viewW, width, count);
        const cover = weekRenderRange(
          Math.min(from.start, dest.start),
          Math.max(from.end, dest.end),
          count,
        );
        flushSync(() => {
          setVisibleCols((prev) => {
            if (prev.start <= cover.start && prev.end >= cover.end) return prev;
            return {
              start: Math.min(prev.start, cover.start),
              end: Math.max(prev.end, cover.end),
            };
          });
        });
      },
      sync: () => {
        const el = weekHScrollRef.current;
        if (el) publishVisibleDaysRef.current(el);
      },
      onFrame,
      onPulseEnd,
    });
  };
  const beginWeekEdgePulseRef = useRef(beginWeekEdgePulse);
  beginWeekEdgePulseRef.current = beginWeekEdgePulse;

  // Double-click an all-day cell: one all-day session on that day.
  // Click-drag across days: a multi-day session in this row (midnight to
  // midnight). The hour grid does not scroll during that drag.
  const materializeAllDaySession = useCallback(
    (colIdx: number, anchor: HTMLElement, endColIdx?: number) => {
      if (viewerRole !== "owner") return;
      if (appKind !== "calendar") return;
      if (calId.startsWith("client:") && (!clientCategoriesLoaded || clientGrantedCategoryIds === null)) return;
      const lastIdx =
        endColIdx == null
          ? colIdx
          : Math.max(0, Math.min(weekDates.length - 1, endColIdx));
      const startIdx = Math.min(colIdx, lastIdx);
      const endIdx = Math.max(colIdx, lastIdx);
      const date = weekDates[startIdx];
      const endDate = weekDates[endIdx];
      if (!date || !endDate) return;
      const isCoachOnClient = calId.startsWith("client:");
      if (!sidebarCategoriesLoaded && !isCoachOnClient) return;
      closeSessionContextMenu();
      const meDefaultCategory = meCategories[0] ?? null;
      const adminDefaultCategory = teamCategories[0] ?? null;
      const clientDefaultCategory = visibleClientCategories[0] ?? null;
      const defaultCategoryId = isCoachOnClient
        ? (clientDefaultCategory?.id ?? null)
        : seat === "admin"
          ? (adminDefaultCategory?.id ?? null)
          : (meDefaultCategory?.id ?? null);
      const defaultColor = getSessionDefaultColor();
      const multi = startIdx !== endIdx;
      const start = setHM(date, 0, 0);
      const span = multi
        ? isoFromMenuClocks(date, endDate, 0, 24 * 60)
        : {
            startISO: toISOLocal(start),
            endISO: toISOLocal(setHM(date, 23, 59)),
          };
      const created: CalendarEvent = {
        id: makeEventId(),
        title: "",
        color: defaultColor,
        categoryId: defaultCategoryId,
        startISO: span.startISO,
        endISO: span.endISO,
        allDay: !multi,
        sortIndex: Date.now(),
        coachPending: calId.startsWith("client:"),
      };
      setMarkRange(null);
      setMarkReleased(false);
      onSelect(null);
      flushSync(() => {
        setDraftEvent(created);
      });
      resetSessionSidePanels(created.id);
      const tile = document.querySelector<HTMLElement>(
        `[data-event-id="${created.id.replace(/"/g, '\\"')}"]`,
      );
      const tileRect = tile?.getBoundingClientRect();
      const rect =
        tileRect && tileRect.width > 0 && tileRect.height > 0
          ? tileRect
          : anchor.getBoundingClientRect();
      setPopover({
        key: { year, month: startIdx, day: 1, session: 0 },
        rect,
        initialText: "",
        initialColor: created.color ?? null,
        categoryId: created.categoryId ?? null,
        isEdit: true,
        eventId: created.id,
        placeholder: "Session title",
        pendingDate: start,
        pendingEndDate: multi ? endDate : start,
        ...(multi ? { pendingTime: { startMin: 0, endMin: 24 * 60 } } : {}),
      });
    },
    [
      viewerRole,
      appKind,
      calId,
      clientCategoriesLoaded,
      clientGrantedCategoryIds,
      weekDates,
      sidebarCategoriesLoaded,
      closeSessionContextMenu,
      meCategories,
      teamCategories,
      visibleClientCategories,
      seat,
      onSelect,
      resetSessionSidePanels,
      year,
    ],
  );

  // Index of today inside the visible week, -1 if not in view.
  const todayColIdx = useMemo(() => {
    for (let i = 0; i < weekDates.length; i++) if (sameDay(weekDates[i], now)) return i;
    return -1;
  }, [weekDates, now]);

  // Header height + now-line vertical offset for week view.
  const headerRef = useRef<HTMLElement | null>(null);
  const headerRowRef = useRef<HTMLDivElement | null>(null);
  const weekScrollerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(0);
  const [scrollbarThumb, setScrollbarThumb] = useState({ top: 0, height: 40 });
  const [isScrollingWeek, setIsScrollingWeek] = useState(false);
  const scrollHideTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
    };
  }, []);
  useLayoutEffect(() => {
    if (!headerRef.current) return;
    setHeaderH(headerRef.current.offsetHeight);
  }, [viewMode]);

  // Measure the week-view scrollbar gutter so header and body reserve the
  // SAME lane on the right. Diary's correct behavior is a stable gutter even
  // when the scrollbar itself is not currently visible, so we track:
  //   (a) live width the browser already reserved on the real scroller
  //   (b) desired stable width for the layout, using a probe + hard floor
  const MIN_STABLE_SCROLLBAR_GUTTER_W = 14;
  const [liveScrollbarGutterW, setLiveScrollbarGutterW] = useState(0);
  const [reservedScrollbarGutterW, setReservedScrollbarGutterW] = useState(0);
  useLayoutEffect(() => {
    const el = weekScrollerRef.current;
    if (!el) return;
    const measureProbe = (): number => {
      if (typeof document === "undefined") return 0;
      const probe = document.createElement("div");
      probe.className = "mini-dur-scroll";
      probe.style.cssText =
        "position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow-y:scroll;scrollbar-gutter:stable;visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
      const w = probe.offsetWidth - probe.clientWidth;
      document.body.removeChild(probe);
      return w > 0 ? w : 0;
    };
    const measure = () => {
      const live = Math.max(0, el.offsetWidth - el.clientWidth);
      const probe = measureProbe();
      const reserved = Math.max(live, probe, MIN_STABLE_SCROLLBAR_GUTTER_W);
      setLiveScrollbarGutterW((prev) => (prev === live ? prev : live));
      setReservedScrollbarGutterW((prev) => (prev === reserved ? prev : reserved));
    };
    measure();
    const r1 = requestAnimationFrame(() => {
      measure();
      const r2 = requestAnimationFrame(measure);
      (measure as unknown as { _r2?: number })._r2 = r2;
    });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const inner = el.firstElementChild as HTMLElement | null;
    if (inner) ro.observe(inner);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(r1);
      const r2 = (measure as unknown as { _r2?: number })._r2;
      if (r2) cancelAnimationFrame(r2);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [viewMode, mode.kind, isDayView, isSimple, appKind]);

  // Timed week/day: pad the scroller so downward scroll stops with the
  // configured hour (06:00) at the top whenever 24:00 already fits below.
  // If the viewport is shorter than 06:00–end, native max still reveals 24:00.
  const syncWeekScrollerBounds = useCallback(
    (node: HTMLElement) => {
      const hourPx = rowHeight * 2;
      const anchorPx = ANCHOR_HOUR * hourPx;
      const gridH = WEEK_SPAN_HOURS * hourPx;
      if (!timedHourGrid) {
        if (node.style.paddingBottom) node.style.paddingBottom = "";
        return Math.max(0, node.scrollHeight - node.clientHeight);
      }
      const sticky = node.querySelector<HTMLElement>("[data-week-sticky-header]");
      const headerOffset = sticky?.offsetHeight ?? 0;
      const viewH = Math.max(0, node.clientHeight - headerOffset);
      const remaining = gridH - anchorPx;
      const pad = remaining <= viewH ? Math.max(0, viewH - remaining) : 0;
      const nextPad = pad > 0 ? `${pad}px` : "";
      if (node.style.paddingBottom !== nextPad) node.style.paddingBottom = nextPad;
      const maxScroll =
        remaining <= viewH
          ? anchorPx
          : Math.max(0, node.scrollHeight - node.clientHeight);
      if (node.scrollTop > maxScroll) node.scrollTop = maxScroll;
      return maxScroll;
    },
    [timedHourGrid, rowHeight, ANCHOR_HOUR, WEEK_SPAN_HOURS],
  );

  // Pin the configured start hour (default 06:00) at the top of the scroller.
  // Hours from 00:00 stay above the fold so the user can scroll up to them.
  //
  // Week view often mounts one animation frame (or the month-exit wait)
  // after viewMode flips to "week". A one-shot layout effect in that first
  // render sees a null scroller and would leave scrollTop at 00:00. Retry
  // until the node exists, then pin 06:00. Day view typically opens from
  // week (scroller already mounted) so it looked correct already.
  const weekAnchorKeyRef = useRef<string | null>(null);
  const [weekScrollerGen, setWeekScrollerGen] = useState(0);
  const bindWeekScroller = useCallback((node: HTMLDivElement | null) => {
    weekScrollerRef.current = node;
    if (node) setWeekScrollerGen((g) => g + 1);
  }, []);
  const bindWeekPanScroller = useCallback((node: HTMLDivElement | null) => {
    bindWeekScroller(node);
    bindWeekHScroll(node);
  }, [bindWeekScroller, bindWeekHScroll]);
  useLayoutEffect(() => {
    if (!timedHourGrid) {
      weekAnchorKeyRef.current = null;
      const node = weekScrollerRef.current;
      if (node) node.style.paddingBottom = "";
      return;
    }

    const dateKey = isDayView
      ? `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}`
      : String(startOfWeekMon(currentDate).getTime());
    const key = `${viewMode}:${dateKey}:${ANCHOR_HOUR}:${WEEK_SPAN_HOURS}:${rowHeight}:${weekAnchorEpoch}`;
    const target = ANCHOR_HOUR * rowHeight * 2;

    let cancelled = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;

    const applyPadAndClamp = () => {
      const node = weekScrollerRef.current;
      if (!node) return 0;
      return syncWeekScrollerBounds(node);
    };

    const applyAnchorIfNeeded = () => {
      if (cancelled) return;
      applyPadAndClamp();
      if (skipVerticalAnchorRef.current) {
        weekAnchorKeyRef.current = key;
        skipVerticalAnchorRef.current = false;
        return;
      }
      if (weekAnchorKeyRef.current === key) return;
      const node = weekScrollerRef.current;
      if (!node) return;
      if (node.clientHeight < 8) return;
      if (node.scrollHeight <= node.clientHeight + 1) return;
      node.scrollTop = target;
      weekAnchorKeyRef.current = key;
      if (!isDayView && node.scrollHeight > 0) {
        const ratio = node.clientHeight / node.scrollHeight;
        setScrollbarThumb({
          top: (node.scrollTop / node.scrollHeight) * node.clientHeight,
          height: Math.max(32, ratio * node.clientHeight),
        });
      }
    };

    const attach = () => {
      if (cancelled) return;
      const el = weekScrollerRef.current;
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      applyAnchorIfNeeded();
      if (!ro) {
        ro = new ResizeObserver(applyAnchorIfNeeded);
        ro.observe(el);
        const inner = el.firstElementChild as HTMLElement | null;
        if (inner) ro.observe(inner);
      }
      raf = requestAnimationFrame(applyAnchorIfNeeded);
    };

    attach();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [
    timedHourGrid,
    viewMode,
    isDayView,
    currentDate,
    weekAnchorEpoch,
    weekScrollerGen,
    ANCHOR_HOUR,
    WEEK_SPAN_HOURS,
    rowHeight,
    syncWeekScrollerBounds,
  ]);

  // Hold-and-drag to create: the grid scrolls 1:1 with the pointer at the
  // edges, and the marked range tracks the pointer's time slot exactly.
  useEffect(() => {
    if (!isCreatingMark || !timedHourGrid) return;
    weekMarkReleasedRef.current = false;
    const lastPtr = { x: 0, y: 0, has: false };
    let raf = 0;
    let lastTs = 0;
    const stickyY = createStickyViewportPointer();
    const edgeGesture = createEdgeScrollGesture();
    // Once the drag covers more than one day, the preview lives in the
    // all-day row. That session has no hour range, so vertical edge-scroll
    // stops until the pointer is back in a single column. Horizontal
    // paging is a one-week pulse.
    let spansDays = false;
    let paneLeft = 0;
    let liveRange: ReturnType<typeof markRangeFromPointer> = null;
    let liveRank = 0;
    let askedForCreateBar = false;
    let paintedMarkKey = "";

    const cachePane = () => {
      const el = weekScrollerRef.current;
      if (!el) return;
      paneLeft = el.getBoundingClientRect().left + WEEKNUM_GUTTER_PX;
    };

    const paintCreateBar = (startCol: number, endCol: number) => {
      const bar = document.querySelector<HTMLElement>("[data-role='mark-create-preview-band']");
      const width = dayColPxRef.current;
      if (!bar || width <= 0) return;
      const start = Math.min(startCol, endCol);
      const end = Math.max(startCol, endCol);
      bar.style.left = `${start * width + 2}px`;
      bar.style.width = `${Math.max(0, (end - start + 1) * width - 4)}px`;
    };

    const mapPointerToRange = (pulseLeft: number | null) => {
      const el = weekScrollerRef.current;
      const start = markStartRef.current;
      if (!el || !start || !markActiveRef.current || !lastPtr.has) return false;
      if (pulseLeft != null && weekPan) {
        const width = dayColPxRef.current;
        const count = weekDatesRef.current.length;
        let col = start.month;
        if (width > 0 && count > 0) {
          col = Math.max(0, Math.min(count - 1, Math.floor((pulseLeft + lastPtr.x - paneLeft) / width)));
        }
        const next = markRangeFromPointer(start, col, liveRank);
        liveRange = next;
        if (next && (next.endMonth ?? next.month) !== next.month) {
          const key = `${next.month}:${next.endMonth ?? next.month}`;
          if (key !== paintedMarkKey) {
            paintedMarkKey = key;
            const bar = document.querySelector("[data-role='mark-create-preview-band']");
            if (bar) paintCreateBar(next.month, next.endMonth ?? next.month);
            else if (!askedForCreateBar) {
              askedForCreateBar = true;
              setMarkRange(next);
            }
          }
        }
        return !isDayView && col !== start.month;
      }
      const rect = el.getBoundingClientRect();
      cachePane();
      const grid = weekPan ? el.querySelector<HTMLElement>("[data-week-time-grid]") : null;
      const inset = grid
        ? (el.querySelector<HTMLElement>("[data-week-sticky-header]")?.offsetHeight ?? 0)
        : 0;
      let yInContent: number;
      if (grid) {
        const grect = grid.getBoundingClientRect();
        const visibleTop = rect.top + inset;
        const clampedY = Math.max(visibleTop, Math.min(rect.bottom - 0.01, lastPtr.y));
        yInContent = clampedY - grect.top;
      } else {
        const mappedY = stickyY(lastPtr.y, rect);
        yInContent = mappedY - rect.top + el.scrollTop;
      }
      const slot = Math.max(
        0,
        Math.min(WEEK_SLOT_ROWS - 1, Math.floor(yInContent / rowHeight)),
      );
      const day = Math.floor(slot / 2) + 1;
      const session = (slot % 2) as Session;
      const r = day * 2 + session;
      let col = start.month;
      if (!isDayView && weekPan && grid) {
        const width = dayColPxRef.current;
        const count = weekDatesRef.current.length;
        const grect = grid.getBoundingClientRect();
        const paneLeft = rect.left + WEEKNUM_GUTTER_PX;
        if (width > 0 && count > 0) {
          const clampedX = Math.max(paneLeft, Math.min(rect.right - 0.01, lastPtr.x));
          const x = clampedX - grect.left;
          col = Math.max(0, Math.min(count - 1, Math.floor(x / width)));
        }
      } else if (!isDayView) {
        let best = start.month;
        let bestDist = Infinity;
        const colCount = weekDatesRef.current.length;
        for (let i = 0; i < colCount; i++) {
          const hit = el.querySelector(`[data-month-col="${i}"]`) as HTMLElement | null;
          if (!hit) continue;
          const hitRect = hit.getBoundingClientRect();
          if (lastPtr.x >= hitRect.left && lastPtr.x < hitRect.right) {
            best = i;
            bestDist = 0;
            break;
          }
          const cx = (hitRect.left + hitRect.right) / 2;
          const dist = Math.abs(lastPtr.x - cx);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        }
        col = best;
      }
      const next = markRangeFromPointer(start, col, r);
      liveRange = next;
      liveRank = r;
      setMarkRange((prev) => {
        if (!next) return prev == null ? prev : null;
        if (
          prev &&
          prev.month === next.month &&
          prev.lo === next.lo &&
          prev.hi === next.hi &&
          prev.endMonth === next.endMonth
        ) {
          return prev;
        }
        return next;
      });
      return !isDayView && col !== start.month;
    };

    const pulse = beginWeekEdgePulseRef.current(
      (scrollLeft) => {
        mapPointerToRange(scrollLeft);
      },
      () => {
        if (liveRange) setMarkRange(liveRange);
        const end = weekMarkEndRef.current;
        weekMarkEndRef.current = null;
        end?.();
      },
    );
    weekMarkPulseRef.current = pulse;

    const applyScrollFromPointer = (movementY: number, dt: number) => {
      const el = weekScrollerRef.current;
      if (!el || !lastPtr.has) return;
      applyTimedGridEdgeScroll(
        el,
        lastPtr.y,
        movementY,
        dt,
        rowHeight,
        syncWeekScrollerBounds(el),
        engagedEdgeScrollIntent(edgeGesture),
      );
    };

    const applyHorizontalFromPointer = () => {
      if (!weekPan || !lastPtr.has) return;
      pulse.over(lastPtr.x);
    };

    const tick = (ts: number) => {
      raf = 0;
      if (!markActiveRef.current) return;
      const dt = lastTs ? Math.min(32, ts - lastTs) : 16;
      lastTs = ts;
      if (!spansDays) applyScrollFromPointer(0, dt);
      spansDays = mapPointerToRange(pulse.isPulsing() ? (weekScrollerRef.current?.scrollLeft ?? 0) : null);
      const el = weekScrollerRef.current;
      const needY = !spansDays && !!el && pointerInTimedGridScrollEdge(el, lastPtr.y, rowHeight);
      if (needY) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (weekMarkReleasedRef.current) return;
      const first = !lastPtr.has;
      lastPtr.x = e.clientX;
      lastPtr.y = e.clientY;
      lastPtr.has = true;
      if (pulse.isPulsing()) {
        if (!first) applyHorizontalFromPointer();
        mapPointerToRange(weekScrollerRef.current?.scrollLeft ?? 0);
        return;
      }
      spansDays = mapPointerToRange(null);
      const el = weekScrollerRef.current;
      if (el && !first && !spansDays) {
        noteEdgeScrollMovement(edgeGesture, e.movementY, lastPtr.y, el, rowHeight);
      }
      if (!first) {
        if (!spansDays) applyScrollFromPointer(e.movementY, 16);
        applyHorizontalFromPointer();
      }
      if (!el) return;
      const needY = !spansDays && pointerInTimedGridScrollEdge(el, lastPtr.y, rowHeight);
      if (!raf && needY) {
        lastTs = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      pulse.stop();
      weekMarkPulseRef.current = null;
      const h = weekHScrollRef.current;
      if (weekPan && h) {
        const width = dayColPxRef.current;
        const max = Math.max(0, h.scrollWidth - h.clientWidth);
        const snapped = snapScrollLeft(h.scrollLeft, width, max);
        if (Math.abs(snapped - h.scrollLeft) > 0.5) h.scrollLeft = snapped;
      }
    };
  }, [
    isCreatingMark,
    timedHourGrid,
    isDayView,
    weekPan,
    rowHeight,
    WEEK_SLOT_ROWS,
    syncWeekScrollerBounds,
  ]);

  // Week view: no reserved gutter. The thin scrollbar overlays Sunday's right
  // edge so column dividers align perfectly with the header dividers.
  // Day view: keep dynamic live padding so the centered day stays aligned.
  const headerScrollbarGutterW = isDayView ? liveScrollbarGutterW : 0;
  const manualWeekBodyGutterW = 0;
  void reservedScrollbarGutterW;
  void MIN_STABLE_SCROLLBAR_GUTTER_W;


  // Minutes elapsed since the grid's first hour (00:00 in timed week/day).
  // Includes seconds so the indicator advances smoothly between ticks.
  const nowMinutesSinceStart = useMemo(() => {
    if (mode.kind !== "year") return null;
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const sinceStart = minutes - GRID_START_HOUR * 60;
    if (sinceStart < 0 || sinceStart > WEEK_SPAN_HOURS * 60) return null;
    return sinceStart;
  }, [now, mode, GRID_START_HOUR, WEEK_SPAN_HOURS]);

  // ─── Week view ↔ time helpers ────────────────────────────────────────
  // Cell layout: row 1 (day=1) starts at GRID_START_HOUR (00:00 in timed
  // week/day) and each (day, session) pair is one 30-min slot.
  // cellIndex = (day - 1) * 2 + session.
  const WEEK_START_HOUR = GRID_START_HOUR;
  const rankToMinutes = (rank: number) => WEEK_START_HOUR * 60 + rank * 30;

  useLayoutEffect(() => {
    if (!needsSlotRemap) return;
    const fromHour = rankHourRef.current;
    if (selectedForGrid && selected &&
      (selectedForGrid.day !== selected.day || selectedForGrid.session !== selected.session)
    ) {
      onSelect(selectedForGrid);
    }
    if (editingKeyForGrid && editingKey &&
      (editingKeyForGrid.day !== editingKey.day || editingKeyForGrid.session !== editingKey.session)
    ) {
      setEditingKey(editingKeyForGrid);
    }
    setMarkRange((prev) => {
      if (!prev) return prev;
      const lo = weekMinutesToRank(
        weekRankToMinutes(prev.lo, fromHour),
        GRID_START_HOUR,
        WEEK_SLOT_ROWS,
      );
      const hi = weekMinutesToRank(
        weekRankToMinutes(prev.hi, fromHour),
        GRID_START_HOUR,
        WEEK_SLOT_ROWS,
      );
      if (lo === prev.lo && hi === prev.hi) return prev;
      return { ...prev, lo, hi };
    });
    rankHourRef.current = GRID_START_HOUR;
    if (!timedHourGrid) {
      const node = weekScrollerRef.current;
      if (node) node.scrollTop = 0;
    }
  }, [
    needsSlotRemap,
    GRID_START_HOUR,
    WEEK_SLOT_ROWS,
    timedHourGrid,
    selected,
    selectedForGrid,
    editingKey,
    editingKeyForGrid,
    onSelect,
  ]);

  useEffect(() => {
    paintedGridHourRef.current = GRID_START_HOUR;
  }, [GRID_START_HOUR]);
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
    const base = draftEvent ? [...events, draftEvent] : events;
    const source = mergeEventsWithRepeatPreview(base, repeatLivePreview);
    return source.filter((e) => {
      if (!e.title.trim()) return draftEvent?.id === e.id;
      if (!e.startISO || !e.endISO) return false;
      const start = fromISOLocal(e.startISO);
      const end = fromISOLocal(e.endISO);
      return weekDates.some((wd) => eventCoversDay(start, end, wd));
    });
  }, [draftEvent, events, repeatLivePreview, weekDates, mode]);

  // Find an event under a cell click in week view, if any (for editing).
  const eventAtCell = useCallback(
    (k: CellKey): CalendarEvent | null => {
      const at = cellKeyToDate(k);
      if (!at) return null;
      const atMin = at.getHours() * 60 + at.getMinutes();
      const target = weekEvents.find((e) => {
        const s = fromISOLocal(e.startISO);
        const en = fromISOLocal(e.endISO);
        if (
          appKind === "calendar" &&
          (timedHourGrid || isStackLayout) &&
          isAllDayBandEvent(e)
        )
          return false;
        if (e.allDay) return eventCoversDay(s, en, at);
        const seg = segmentTimedEventForDay(s, en, at);
        if (!seg) return false;
        return atMin >= seg.startMin && atMin < seg.endMin;
      });
      return target ?? null;
    },
    [cellKeyToDate, weekEvents, timedHourGrid, isStackLayout, appKind],
  );
  // Expose latest lookup to openPopover via ref (declared above).
  eventAtCellRef.current = eventAtCell;

  const markSpansColumns =
    !!markRange && (markRange.endMonth ?? markRange.month) !== markRange.month;
  // Events off hides saved multi-day rows. A create still shows its
  // placeholder, then the row closes again once that session is saved.
  const creatingHiddenMultiDay =
    hideMultiDayRow &&
    ((!!draftEvent && isAllDayBandEvent(draftEvent)) || markSpansColumns);
  const showAllDayBand =
    appKind === "calendar" &&
    mode.kind === "year" &&
    !isSimple &&
    (viewMode === "week" || viewMode === "day") &&
    (!hideMultiDayRow || creatingHiddenMultiDay);
  const markFillsDay =
    timedHourGrid &&
    appKind === "calendar" &&
    !!markRange &&
    markRangeCoversFullDay(markRange, GRID_START_HOUR);
  // Stay in the hour rows while the pointer is down. The all-day row takes
  // the selection only after release, and only when it covers 00:00–24:00.
  const markFillsDayReleased = markFillsDay && markReleased;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 w-full flex-col"
      onPointerDownCapture={onMarkPointerDownCapture}
      onMouseDownCapture={onMarkMouseDownCapture}
      onMouseUpCapture={onMarkMouseUpCapture}
      onClickCapture={onMarkClickCapture}
    >
      {/* Top-right control cluster: [Mode ▾] [‹ 📅 ›].
          When the parent controls viewMode it also renders these controls
          itself (in the page header), so we hide the in-grid cluster to
          avoid duplication. */}
      {!isControlled && (
        <div className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-2">
          <div data-calendar-view-nav="">
          <HeaderDropdown<ViewMode>
            ariaLabel="View mode"
            value={viewMode}
            onChange={handleViewModeChange}
            width={124}
            options={[
              { value: "day", label: VIEW_MODE_LABEL.day },
              { value: "week", label: VIEW_MODE_LABEL.week },
              { value: "month", label: VIEW_MODE_LABEL.month },
            ]}
          />
          </div>
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
                onDeleteEvents={onDeleteEvents}
                onAcceptCoachSession={onAcceptCoachSession}
                onReorderEvents={onReorderEvents}
                memberId={memberId}
                viewerRole={viewerRole}
                defaultNewColor={DEFAULT_SESSION_COLOR}
                teamId={seat === "admin" ? teamId : null}
                hideMultiDayRow={hideMultiDayRow}
                onPrevMonth={() => {
                  const focus = getLiveMonthFocus();
                  const base = focus
                    ? new Date(focus.year, focus.month, 1)
                    : currentDate;
                  const d = new Date(base.getFullYear(), base.getMonth() - 1, 1);
                  onCurrentDateChange(d, { start: d, end: d });
                }}
                onNextMonth={() => {
                  const focus = getLiveMonthFocus();
                  const base = focus
                    ? new Date(focus.year, focus.month, 1)
                    : currentDate;
                  const d = new Date(base.getFullYear(), base.getMonth() + 1, 1);
                  onCurrentDateChange(d, { start: d, end: d });
                }}
                onCommitFocusedMonth={(d) => {
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
                onOpenYearView={appKind === "calendar" ? onOpenYearView : undefined}
                markedEventIds={markedIds}
                onDeleteMarked={(ids) => {
                  onDeleteEvents?.(ids);
                  clearMarks();
                }}
                onClearMarks={clearMarks}
                onShiftMark={(id) => addMarks([id])}
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
                className={
                  weekPan
                    ? "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden"
                    : "relative flex flex-1 min-h-0 w-full flex-col"
                }
                onClick={(e) => {
                  if (e.target === e.currentTarget) handleSelect(null);
                }}
                tabIndex={0}
              >
                <div
                  ref={weekPan ? bindWeekPanScroller : undefined}
                  className={
                    weekPan
                      ? "min-h-0 flex-1 overflow-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
                      : "contents"
                  }
                  style={
                    weekPan
                      ? ({
                          scrollbarWidth: "none",
                          msOverflowStyle: "none",
                          overscrollBehavior: "contain",
                          overflowAnchor: "none",
                        } as React.CSSProperties)
                      : undefined
                  }
                  onScroll={
                    weekPan
                      ? (e) => {
                          const el = e.currentTarget;
                          const top = el.scrollTop;
                          const left = el.scrollLeft;
                          const prevTop = weekPanScrollTopRef.current;
                          const prevLeft = weekPanScrollLeftWatchRef.current;
                          // Horizontal pans share this scroller. Updating the
                          // vertical thumb re-renders the whole grid every frame.
                          if (prevTop === top) {
                            weekPanScrollLeftWatchRef.current = left;
                            return;
                          }
                          if (
                            prevTop != null &&
                            Math.abs(left - prevLeft) > Math.abs(top - prevTop)
                          ) {
                            weekPanScrollTopRef.current = top;
                            weekPanScrollLeftWatchRef.current = left;
                            return;
                          }
                          weekPanScrollTopRef.current = top;
                          weekPanScrollLeftWatchRef.current = left;
                          syncWeekScrollerBounds(el);
                          if (el.scrollHeight <= 0) return;
                          const ratio = el.clientHeight / el.scrollHeight;
                          setScrollbarThumb({
                            top: (top / el.scrollHeight) * el.clientHeight,
                            height: Math.max(32, ratio * el.clientHeight),
                          });
                          setIsScrollingWeek(true);
                          if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
                          scrollHideTimerRef.current = window.setTimeout(() => setIsScrollingWeek(false), 2000);
                        }
                      : undefined
                  }
                >
                <div
                  className={weekPan ? "relative" : "contents"}
                  style={weekPan ? { width: WEEKNUM_GUTTER_PX + weekContentWidth } : undefined}
                >
                <div
                  className={weekPan ? "sticky top-0 z-30 flex overflow-visible bg-card" : "contents"}
                  data-week-sticky-header={weekPan ? "" : undefined}
                  style={weekPan ? { width: WEEKNUM_GUTTER_PX + weekContentWidth } : undefined}
                >
                {weekPan && (
                  <div
                    className="sticky left-0 z-[80] flex flex-none flex-col self-stretch isolate overflow-visible bg-card [transform:translateZ(0)]"
                    style={{ width: WEEKNUM_GUTTER_PX }}
                  >
                    <button
                      type="button"
                      data-calendar-view-nav=""
                      ref={(el) => {
                        headerRef.current = el;
                      }}
                      onClick={() => handleViewModeChange("month")}
                      title="Klikk for å gå til månedvisning"
                      aria-label={MONTHS_EN_SHORT[currentDate.getMonth()]}
                      className={`flex select-none items-center justify-center border-b border-r border-hairline bg-card px-1 text-[12px] font-semibold tracking-wide text-muted-foreground ${
                        isCreatingMark || gridEdgeScrollActive ? "" : "transition-colors hover:bg-secondary hover:text-ink"
                      }`}
                      style={{ height: 36 }}
                    >
                      {MONTHS_EN_SHORT[currentDate.getMonth()]}
                    </button>
                    <div ref={bindExpandHost} className="relative w-full flex-none" />
                  </div>
                )}
                <div
                  className={weekPan ? "relative z-0 min-w-0 flex-none" : "contents"}
                  style={weekPan ? { width: weekContentWidth } : undefined}
                >
                <div
                  className="flex-none"
                  style={
                    weekPan
                      ? { width: weekContentWidth }
                      : isDayView
                        ? { paddingRight: headerScrollbarGutterW }
                        : undefined
                  }
                >
                  <div className={!isDayView ? "flex w-full" : undefined}>

                    <div
                      ref={headerRowRef}
                      data-grid-header="1"
                      className={`relative z-30 grid bg-card ${!isDayView ? "min-w-0 flex-1" : ""} ${isCreatingMark || gridEdgeScrollActive ? "pointer-events-none" : ""}`}
                      style={{
                        gridTemplateColumns: paintedColumns,
                        transition: weekPan ? undefined : `grid-template-columns ${DUR_MS}ms ${EASE}`,
                        willChange: weekPan ? undefined : "grid-template-columns",
                        ...(weekPan ? { width: weekContentWidth } : null),
                        ...(isDayView
                          ? { width: "fit-content", marginInline: "auto" }
                          : null),
                      }}
                    >


                    {/* Corner gutter. Week view: English month (opens that month).
                        Day view: ISO week number (opens that week). */}
                    {mode.kind === "year" && !weekPan && (
                      <button
                        key="wn-header"
                        type="button"
                        data-calendar-view-nav=""
                        onClick={() => handleViewModeChange(isDayView ? "week" : "month")}
                        title={isDayView ? "Klikk for å gå til ukevisning" : "Klikk for å gå til månedvisning"}
                        aria-label={
                          isDayView
                            ? `Uke ${isoWeekNumber(weekDates[0] ?? currentDate)}`
                            : MONTHS_EN_SHORT[currentDate.getMonth()]
                        }
                        className={`flex select-none items-center justify-center border-b border-r border-hairline bg-card px-1 text-muted-foreground ${
                          isDayView
                            ? "text-[10px] font-medium tabular-nums"
                            : "text-[12px] font-semibold tracking-wide"
                        } ${isCreatingMark || gridEdgeScrollActive ? "" : "transition-colors hover:bg-secondary hover:text-ink"}`}
                        style={{ height: 36 }}
                        ref={(el) => {
                          headerRef.current = el;
                        }}
                      >
                        {isDayView
                          ? isoWeekNumber(weekDates[0] ?? currentDate)
                          : MONTHS_EN_SHORT[currentDate.getMonth()]}
                      </button>
                    )}
                    {columnMonths.map((m) => {
                      const colDate = weekDates[m.idx];
                      const isToday = mode.kind === "year" && colDate && sameDay(colDate, now);
                      const dayLabel =
                        (isDayView || weekPan) && colDate
                          ? MONTH_LABELS_SHORT[(colDate.getDay() + 6) % 7]
                          : m.label;
                      const headerTitle = isDayView
                        ? "Klikk for å gå til ukevisning"
                        : "Klikk for å gå til dagvisning";
                      return (
                        <button
                          type="button"
                          key={`h-${m.idx}`}
                          data-calendar-view-nav=""
                          data-month-col={m.idx}
                          data-day-anchor=""
                          onClick={() => {
                            if (!colDate) return;
                            if (isDayView) {
                              handleViewModeChange("week");
                            } else {
                              onCurrentDateChange(colDate, { start: colDate, end: colDate });
                              handleViewModeChange("day");
                            }
                          }}
                          title={headerTitle}
                          className={`group/daynote-anchor flex select-none items-center justify-center border-b border-r border-hairline px-3 text-[12px] font-semibold uppercase tracking-wide ${
                            isCreatingMark || gridEdgeScrollActive ? "" : "transition-colors hover:bg-secondary hover:text-ink"
                          } ${
                            isToday ? "bg-secondary text-ink" : "bg-card text-muted-foreground"
                          } ${appKind === "diary" ? "relative" : ""}`}
                          style={{
                            height: 36,
                            ...(weekPan ? { gridColumn: m.idx + 1 } : null),
                          }}
                        >
                          {appKind === "diary" && colDate && (
                            <DayNoteButton
                              calId={calId}
                              date={colDate}
                              variant="week"
                              memberId={memberId}
                              viewerRole={viewerRole}
                            />
                          )}
                          <span className="inline-flex items-center gap-1.5">
                            {dayLabel}
                            {mode.kind === "year" && colDate && (
                              isToday ? (
                                <span className="grid h-[22px] w-[22px] place-items-center rounded-sm bg-[#ED5C5C] text-[11px] font-medium tabular-nums text-white">
                                  {colDate.getDate()}
                                </span>
                              ) : (
                                <span className="text-ink">{colDate.getDate()}</span>
                              )
                            )}
                          </span>
                        </button>
                      );
                    })}
                    </div>
                    {!isDayView && headerScrollbarGutterW > 0 && (
                      <div
                        aria-hidden
                        className="flex-none border-b border-hairline bg-card"
                        style={{ width: headerScrollbarGutterW, height: 36 }}
                      />
                    )}
                  </div>
                  {showAllDayBand && (
                    <WeekAllDayBand
                      calId={calId}
                      events={
                        hideMultiDayRow
                          ? weekEvents.filter((e) => e.id === draftEvent?.id)
                          : weekEvents
                      }
                      weekDates={weekDates}
                      rowHeight={rowHeight}
                      gridTemplateColumns={paintedColumns}
                      expandPortalEl={weekPan ? expandHost : null}
                      freezeHeight={weekPan && hScrolling}
                      visibleColStart={weekPan ? bandViewport.start : null}
                      visibleColEnd={weekPan ? bandViewport.end : null}
                      contentWidth={weekPan ? weekContentWidth : null}
                      columnWidth={weekPan ? dayColPx : null}
                      renderColStart={weekRender?.start ?? null}
                      renderColEnd={weekRender?.end ?? null}
                      readPanScrollLeft={weekPan ? () => weekHScrollRef.current?.scrollLeft ?? 0 : undefined}
                      isDayView={isDayView}
                      headerScrollbarGutterW={headerScrollbarGutterW}
                      appKind={appKind}
                      activeEventId={popover?.eventId ?? sessionContextEventId ?? null}
                      markedEventIds={markedIds}
                      viewerRole={viewerRole}
                      scrollerRef={weekScrollerRef}
                      beginWeekEdgePulse={(onFrame, onPulseEnd) =>
                        beginWeekEdgePulseRef.current(onFrame, onPulseEnd)
                      }
                      startHour={WEEK_START_HOUR}
                      spanHours={WEEK_SPAN_HOURS}
                      draftEventId={draftEvent?.id ?? null}
                      createPreview={
                        appKind === "calendar" &&
                        markRange &&
                        (markSpansColumns || markFillsDayReleased)
                          ? {
                              startCol: markRange.month,
                              endCol: markRange.endMonth ?? markRange.month,
                            }
                          : null
                      }
                      onEventClick={(ev, anchor) => {
                        closeSessionContextMenu();
                        onSelect(null);
                        syncCurrentDateToDay(fromISOLocal(ev.startISO));
                        if (popover?.eventId === ev.id) {
                          closePopover();
                          return;
                        }
                        if (popover?.eventId && popover.eventId !== ev.id) {
                          discardEmptyPopoverEvent();
                        }
                        resetSessionSidePanels(ev.id, { signUpEnabled: !!ev.signUpEnabled });
                        setPopover({
                          key: { year, month: 0, day: 1, session: 0 },
                          rect: anchor.getBoundingClientRect(),
                          initialText: ev.title,
                          initialColor: ev.color,
                          isEdit: true,
                          eventId: ev.id,
                          categoryId: ev.categoryId ?? null,
                          initialDescription: ev.description ?? null,
                          appGroupId: ev.appGroupId ?? null,
                          placeholder: ev.title ? undefined : "Session title",
                        });
                      }}
                      onEventContextMenu={
                        appKind === "calendar"
                          ? (e, ev, el) => {
                              if (markActiveRef.current) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              onSessionContextMenu(e, ev, el);
                            }
                          : undefined
                      }
                      onEventDragStart={(id) => {
                        closeSessionContextMenu();
                        if (popover?.eventId && popover.eventId !== id) {
                          discardEmptyPopoverEvent();
                        }
                        closePopover({ discardEmpty: false, preserveSidePanels: true });
                      }}
                      onDropPreviewChange={setBandDropPreview}
                      onEmptyDoubleClick={materializeAllDaySession}
                      onCreateSpan={(startCol, endCol, anchor) =>
                        materializeAllDaySession(startCol, anchor, endCol)
                      }
                      onShiftDays={(id, dayDelta) => {
                        const ev = getEventById(id);
                        if (!ev) return;
                        const shifted =
                          dayDelta === 0
                            ? { startISO: ev.startISO, endISO: ev.endISO }
                            : shiftIsoRangeByDays(ev.startISO, ev.endISO, dayDelta);
                        const patch = {
                          ...shifted,
                          sortIndex: Math.max(Date.now(), overlapRecency(ev.sortIndex) + 1),
                        };
                        const unchanged =
                          ev.startISO === patch.startISO && ev.endISO === patch.endISO;
                        flushSync(() => {
                          if (draftEventRef.current?.id === id) {
                            setDraftEvent({
                              ...ev,
                              ...(unchanged ? { sortIndex: patch.sortIndex } : patch),
                            });
                          } else {
                            onMoveEvent(id, unchanged ? { sortIndex: patch.sortIndex } : patch);
                          }
                        });
                        reopenPopoverAtEventTile(id, getEventById(id) ?? { ...ev, ...patch });
                      }}
                      onResizeSpan={(id, next) => {
                        const ev = getEventById(id);
                        if (!ev) return;
                        const shifted = bandWidthResizeResult(
                          ev.startISO,
                          ev.endISO,
                          !!ev.allDay,
                          next.start,
                          next.end,
                        );
                        const unchanged =
                          ev.startISO === shifted.startISO &&
                          ev.endISO === shifted.endISO &&
                          !!ev.allDay === shifted.allDay;
                        if (unchanged) return;
                        flushSync(() => {
                          if (draftEventRef.current?.id === id) {
                            setDraftEvent({ ...ev, ...shifted });
                          } else {
                            onMoveEvent(id, shifted);
                          }
                        });
                        reopenPopoverAtEventTile(id, getEventById(id) ?? { ...ev, ...shifted });
                      }}
                      onDropToTime={(id, newDate, newStartMin, durationMin) => {
                        const ev = getEventById(id);
                        if (!ev) return;
                        const newStart = setHM(
                          newDate,
                          Math.floor(newStartMin / 60),
                          newStartMin % 60,
                        );
                        const newEnd = addMinutes(newStart, durationMin);
                        const rawStart = toISOLocal(newStart);
                        const rawEnd = toISOLocal(newEnd);
                        const fullDay = promoteFullDayTimedSpan(rawStart, rawEnd);
                        const patch = {
                          startISO: fullDay?.startISO ?? rawStart,
                          endISO: fullDay?.endISO ?? rawEnd,
                          allDay: !!fullDay,
                          sortIndex: Math.max(Date.now(), overlapRecency(ev.sortIndex) + 1),
                        };
                        flushSync(() => {
                          if (draftEventRef.current?.id === id) {
                            setDraftEvent({ ...ev, ...patch });
                          } else {
                            onMoveEvent(id, patch);
                          }
                        });
                        reopenPopoverAtEventTile(id, getEventById(id) ?? { ...ev, ...patch });
                      }}
                    />
                  )}
                </div>
                </div>
                </div>

                <div
                  className={weekPan ? "flex" : "contents"}
                  style={weekPan ? { width: WEEKNUM_GUTTER_PX + weekContentWidth } : undefined}
                >
                {weekPan && (
                  <div
                    className="sticky left-0 z-20 flex-none self-start bg-card"
                    style={{ width: WEEKNUM_GUTTER_PX }}
                  >
                    {Array.from({ length: WEEK_SPAN_HOURS }, (_, i) => {
                      const hh = GRID_START_HOUR + i;
                      return (
                        <div
                          key={`hour-label-${hh}`}
                          className="border-b border-r border-hairline bg-card pl-1.5 pt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
                          style={{ height: rowHeight * 2 }}
                        >
                          {isStackLayout ? "" : `${String(hh).padStart(2, "0")}:00`}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div
                  ref={weekPan ? undefined : bindWeekScroller}
                  className={
                    weekPan
                      ? "relative min-w-0"
                      : "mini-dur-scroll relative flex flex-1 min-h-0 flex-col overflow-y-auto [&::-webkit-scrollbar]:hidden"
                  }
                  style={
                    weekPan
                      ? { width: weekContentWidth }
                      : ({
                          scrollbarWidth: "none",
                          msOverflowStyle: "none",
                          overscrollBehaviorY: "contain",
                        } as React.CSSProperties)
                  }
                  onScroll={
                    weekPan
                      ? undefined
                      : (e) => {
                          const el = e.currentTarget;
                          if (timedHourGrid) syncWeekScrollerBounds(el);
                          if (isDayView) return;
                          if (el.scrollHeight <= 0) return;
                          const ratio = el.clientHeight / el.scrollHeight;
                          setScrollbarThumb({
                            top: (el.scrollTop / el.scrollHeight) * el.clientHeight,
                            height: Math.max(32, ratio * el.clientHeight),
                          });
                          setIsScrollingWeek(true);
                          if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
                          scrollHideTimerRef.current = window.setTimeout(() => setIsScrollingWeek(false), 2000);
                        }
                  }
                >
                  <div
                    ref={weekPan ? bodyShiftRef : undefined}
                    data-week-time-grid={weekPan ? "" : undefined}
                    className={weekPan ? "relative" : undefined}
                    style={weekPan ? { width: weekContentWidth } : undefined}
                  >
                  <div

                    className="grid"
                    style={{
                      gridTemplateColumns: paintedColumns,
                      transition: weekPan ? undefined : `grid-template-columns ${DUR_MS}ms ${EASE}`,
                      willChange: weekPan ? undefined : "grid-template-columns",
                      ...(weekPan ? { width: weekContentWidth } : null),
                      ...(isDayView ? { width: "fit-content", marginInline: "auto" } : null),
                    }}
                  >
                    {isSimple ? (
                      <Fragment key="simple-body">
                        {/* Empty week-number gutter under the header */}
                        <div
                          className="border-r border-hairline bg-card"
                          style={{ height: rowHeight * WEEK_SPAN_HOURS }}
                          aria-hidden
                        />
                        {months.map((m) => {
                          const colDate = weekDates[m.idx];
                          return (
                            <div
                              key={`simple-col-${m.idx}`}
                              data-simple-col={m.idx}
                              className="relative border-r border-hairline transition-colors hover:bg-secondary/60"
                              style={{ height: rowHeight * WEEK_SPAN_HOURS }}
                              onDoubleClick={(e) => {
                                if (!colDate) return;
                                const target = e.target as HTMLElement;
                                // Ignore double-clicks on a session tile
                                if (target.closest('[data-real-event="1"]')) return;
                                const k: CellKey = {
                                  year: colDate.getFullYear(),
                                  month: m.idx,
                                  day: 2,
                                  session: 0,
                                };
                                // Diary: existing sessions are edited via the hover menu (Details).
                                // Double-clicking the column always starts a NEW manual session,
                                // even if other (e.g. Strava) sessions already exist that day.
                                resetSessionSidePanels(null);
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
                        // Week/day timed grid: hour-rows from GRID_START_HOUR
                        // (00:00) through the configured end hour, in 30-min slots.
                        { length: mode.kind === "year" ? WEEK_SPAN_HOURS : 31 },
                        (_, i) => i + 1,
                      ).map((day) => (
                        <Fragment key={mode.kind === "year" ? `h${GRID_START_HOUR + day - 1}` : day}>
                          {mode.kind === "year" && !weekPan &&
                            (() => {
                              const hh = GRID_START_HOUR - 1 + day;
                              const label = isStackLayout
                                ? ""
                                : `${String(hh).padStart(2, "0")}:00`;
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
                            months={columnMonths}
                            pinColumns={weekPan}
                            staticCells={weekPan}
                            year={year}
                            calId={calId}
                            data={data}
                            mode={mode}
                            rowHeight={rowHeight}
                            selected={selectedForGrid}
                            selectedId={selectedId}
                            editingId={editingId}
                            skipCellColorTransition={paintedGridHourRef.current !== GRID_START_HOUR}
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
                              if (!isCreatingMark) extendMark(k);
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
                            onMarkSingleCell={markSingleCell}
                            isDraggingMark={isDraggingMark}
                            onOpenPopover={openPopover}
                            allowMark={mode.kind === "year"}
                            markReleased={markReleased}
                            hideMarkCellFill={appKind === "calendar"}
                            hideHalfHourLine={mode.kind === "year" && !isDayView}
                            weekDates={mode.kind === "year" ? weekDates : undefined}
                            onColumnContextMenu={
                              mode.kind === "year"
                                ? (e, date) => {
                                    if (markActiveRef.current) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      return;
                                    }
                                    const raw = (e.target as HTMLElement)
                                      .closest("[data-cell-key]")
                                      ?.getAttribute("data-cell-key");
                                    let startMin: number | undefined;
                                    if (raw) {
                                      const parts = raw.split(":");
                                      const rank = Number(parts[1]) * 2 + Number(parts[2]);
                                      if (Number.isFinite(rank)) {
                                        startMin = WEEK_START_HOUR * 60 + (rank - 2) * 30;
                                      }
                                    }
                                    onPasteContextMenu(e, date, startMin);
                                  }
                                : undefined
                            }
                          />
                        </Fragment>
                      ))
                    )}
                  </div>
                  {/* Rails overlay — positioned absolutely so explicit grid placement
              does not block auto-flow of cells in the main grid above. */}
                  {mode.kind === "year" && (
                    <div
                      className={`pointer-events-none absolute ${isDayView ? "left-0 right-0" : "inset-x-0"}`}
                      style={{
                        top: 0,
                        ...(manualWeekBodyGutterW > 0 ? { right: manualWeekBodyGutterW } : null),
                        display: "grid",
                        gridTemplateColumns: paintedColumns,
                        gridTemplateRows: isSimple
                          ? `${rowHeight * WEEK_SPAN_HOURS}px`
                          : `repeat(${WEEK_SPAN_HOURS}, ${rowHeight * 2}px)`,
                        ...(weekPan ? { width: weekContentWidth } : null),
                        ...(isDayView ? { width: WEEKNUM_GUTTER_PX + dayColPx, marginInline: "auto" } : null),
                      }}
                    >
                      {!isSimple && (
                        <WeekEventsOverlay
                          gridColumnOffset={weekPan ? 1 : 2}
                          renderColStart={weekRender?.start ?? 0}
                          renderColEnd={weekRender?.end ?? Number.POSITIVE_INFINITY}
                          dayColumnWidth={weekPan ? dayColPx : 0}
                          calId={calId}
                          events={weekEvents}
                          weekDates={weekDates}
                          startHour={WEEK_START_HOUR}
                          spanHours={WEEK_SPAN_HOURS}
                          stackMode={isStackLayout}
                          scrollerRef={weekScrollerRef}
                          syncScrollerBounds={syncWeekScrollerBounds}
                          edgeScrollRowHeight={rowHeight}
                          onEdgeScrollGesture={setGridEdgeScrollActive}
                          beginWeekEdgePulse={(onFrame, onPulseEnd) =>
                            beginWeekEdgePulseRef.current(onFrame, onPulseEnd)
                          }
                          appKind={appKind}
                          activeEventId={popover?.eventId ?? sessionContextEventId ?? null}
                          markedEventIds={markedIds}
                          onClearCellSelection={() => onSelect(null)}
                          onEventContextMenu={
                            appKind === "calendar"
                              ? (e, ev, el) => {
                                  if (markActiveRef.current) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                  }
                                  onSessionContextMenu(e, ev, el);
                                }
                              : undefined
                          }
                          onEventClick={(ev, anchor) => {
                            closeSessionContextMenu();
                            onSelect(null);
                            syncCurrentDateToDay(fromISOLocal(ev.startISO));
                            // Toggle: clicking the open session's tile dismisses
                            // the panel. Untitled drag-created drafts are discarded
                            // (same as clicking outside) so the tile disappears.
                            if (popover?.eventId === ev.id) {
                              closePopover();
                              return;
                            }
                            // If the previous popover was on a freshly-created tile
                            // with no title, discard it so clicking another tile
                            // behaves like clicking outside.
                            if (popover?.eventId && popover.eventId !== ev.id) {
                              discardEmptyPopoverEvent();
                            }
                            resetSessionSidePanels(ev.id, { signUpEnabled: !!ev.signUpEnabled });
                            setPopover({
                              key: { year, month: 0, day: 1, session: 0 },
                              rect: anchor.getBoundingClientRect(),
                              initialText: ev.title,
                              initialColor: ev.color,
                              isEdit: true,
                              eventId: ev.id,
                              categoryId: ev.categoryId ?? null,
                              initialDescription: ev.description ?? null,
                              appGroupId: ev.appGroupId ?? null,
                              placeholder: ev.title ? undefined : "Session title",
                            });
                          }}
                          onEventDragStart={(id) => {
                            closeSessionContextMenu();
                            // Hide the edit popover the instant the user starts
                            // dragging a tile; WeekEventsOverlay re-opens it via
                            // onEventDrop after the drop completes. If the user
                            // grabs a DIFFERENT tile while a fresh untitled tile's
                            // popover is open, discard the orphan.
                            if (popover?.eventId && popover.eventId !== id) {
                              discardEmptyPopoverEvent();
                            }
                            // Do NOT discard the dragged tile itself even if it's
                            // an untitled draft — the user is moving it, not
                            // abandoning it. onEventDrop reopens the popover.
                            // Side-panel flags stay in sessionSidePanelsRef across
                            // this close so they restore on reopen for the same id.
                            closePopover({ discardEmpty: false, preserveSidePanels: true });
                          }}
                          onEventDrop={(id, newDate, newStartMin, _durationMin, anchor, range) => {
                            const ev = getEventById(id);
                            if (!ev) return;
                            const origStart = fromISOLocal(ev.startISO);
                            const origEnd = fromISOLocal(ev.endISO);
                            const fullDur = Math.max(
                              15,
                              Math.round((origEnd.getTime() - origStart.getTime()) / 60000),
                            );
                            const newStart = setHM(
                              newDate,
                              Math.floor(newStartMin / 60),
                              newStartMin % 60,
                            );
                            const newEnd = addMinutes(newStart, fullDur);
                            const droppedStart = range?.startISO ?? toISOLocal(newStart);
                            const droppedEnd = range?.endISO ?? toISOLocal(newEnd);
                            const fullDay = promoteFullDayTimedSpan(droppedStart, droppedEnd);
                            const patch = {
                              startISO: fullDay?.startISO ?? droppedStart,
                              endISO: fullDay?.endISO ?? droppedEnd,
                              ...(fullDay ? { allDay: true as const } : {}),
                              // Always newer than peers so a drop onto the origin
                              // placeholder still lands in the rightmost overlap column.
                              sortIndex: Math.max(Date.now(), overlapRecency(ev.sortIndex) + 1),
                            };
                            const unchanged =
                              ev.startISO === patch.startISO &&
                              ev.endISO === patch.endISO &&
                              !!ev.allDay === !!fullDay;
                            flushSync(() => {
                              if (draftEventRef.current?.id === id) {
                                setDraftEvent({
                                  ...ev,
                                  ...patch,
                                  allDay: !!fullDay,
                                });
                              } else {
                                onMoveEvent(
                                  id,
                                  unchanged ? { sortIndex: patch.sortIndex } : patch,
                                );
                              }
                            });
                            if (anchor?.isConnected) {
                              anchor.style.transform = "";
                              anchor.style.willChange = "";
                            }
                            reopenPopoverAtEventTile(id, getEventById(id) ?? { ...ev, ...patch });
                          }}
                          onLiveResize={(id, t) => {
                            // Push the in-progress duration into the open popover so the
                            // From/To time wheels visibly tick along with the drag.
                            setPopover((p) =>
                              p && p.eventId === id ? { ...p, pendingTime: t } : p,
                            );
                          }}
                          onResizeStart={() => {
                            closeSessionContextMenu();
                            setSessionEdgeResizing(true);
                          }}
                          onResizeEnd={() => setSessionEdgeResizing(false)}
                          onResizeCommit={(id, t) => {
                            applyTimesToEventIds([id], t);
                            setPopover((p) =>
                              p && p.eventId === id
                                ? {
                                    ...p,
                                    pendingTime: t,
                                    timeCommitNonce: (p.timeCommitNonce ?? 0) + 1,
                                  }
                                : p,
                            );
                          }}
                          onDeleteEvent={onDeleteEvent}
                          onSaveSessionNote={(id, note) =>
                            onUpsertEvent({ id, sessionNote: note || undefined })
                          }
                          onUpsertSession={(patch) => {
                            if (draftEventRef.current?.id === patch.id) {
                              setDraftEvent({ ...draftEventRef.current, ...patch });
                            } else {
                              onUpsertEvent(patch);
                            }
                          }}
                          onAcceptCoachSession={onAcceptCoachSession}
                          memberId={memberId}
                          viewerRole={viewerRole}
                          markPreview={
                            appKind === "calendar" &&
                            markRange &&
                            !markFillsDayReleased &&
                            (markReleased ||
                              markRange.hi !== markRange.lo ||
                              markSpansColumns)
                              ? markRange
                              : null
                          }
                          bandDropPreview={bandDropPreview}
                        />
                      )}
                      {isSimple && (
                        <DiarySimpleStack
                          calId={calId}
                          events={weekEvents}
                          weekDates={weekDates}
                          creatingColIdx={
                            popover && !popover.eventId && !popover.isEdit
                              ? popover.key.month
                              : null
                          }
                          onEventClick={(ev, anchor) => {
                            resetSessionSidePanels(ev.id, { signUpEnabled: !!ev.signUpEnabled });
                            setPopover({
                              key: { year, month: 0, day: 1, session: 0 },
                              rect: anchor.getBoundingClientRect(),
                              initialText: ev.title,
                              initialColor: ev.color,
                              isEdit: true,
                              eventId: ev.id,
                              categoryId: ev.categoryId ?? null,
                              initialDescription: ev.description ?? null,
                              appGroupId: ev.appGroupId ?? null,
                            });
                          }}
                          onDeleteEvent={onDeleteEvent}
                          onUpsertSession={(patch) => {
                            if (draftEventRef.current?.id === patch.id) {
                              setDraftEvent({ ...draftEventRef.current, ...patch });
                            } else {
                              onUpsertEvent(patch);
                            }
                          }}
                          onAcceptCoachSession={onAcceptCoachSession}
                          onReorderEvents={onReorderEvents}
                          memberId={memberId}
                          viewerRole={viewerRole}
                        />
                      )}
                      {todayColIdx >= 0 && nowMinutesSinceStart !== null && !isSimple && !isStackLayout && (
                        <NowLine
                          colIdx={todayColIdx}
                          nowMinutesSinceStart={nowMinutesSinceStart}
                          spanHours={WEEK_SPAN_HOURS}
                          gridColumnOffset={weekPan ? 1 : 2}
                        />
                      )}
                    </div>
                  )}
                  </div>
                </div>
                </div>
                </div>
                </div>
                {!isDayView && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute right-0 top-0 bottom-0 z-50 w-[6px]"
                  >
                    <div
                      className="absolute right-[1px] w-[4px] rounded-full bg-muted-foreground/35"
                      style={{
                        opacity: isScrollingWeek ? 1 : 0,
                        top: scrollbarThumb.top,
                        height: scrollbarThumb.height,
                        transition: "opacity 300ms ease, top 80ms linear, height 80ms linear",
                      }}
                  />
                </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>

      {popover &&
        appKind === "diary" &&
        mode.kind === "year" &&
        (() => {
          const existingEv = popover.eventId ? events.find((e) => e.id === popover.eventId) : null;
          const initialTime = (() => {
            if (existingEv && !existingEv.allDay) {
              const s = fromISOLocal(existingEv.startISO);
              const e = fromISOLocal(existingEv.endISO);
              return startEndMinsOnStartDay(s, e);
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
              defaultColor={
                popover.initialColor
                  ?? (popover.isEdit ? existingEv?.color ?? null : DEFAULT_SESSION_COLOR)
              }
              diaryActivityCategories={diaryActivityCategories}
              onColorChange={(c) => {
                setPopover((p) => (p ? { ...p, initialColor: c } : p));
                if (popover.eventId && c) {
                  if (draftEventRef.current?.id === popover.eventId) {
                    setDraftEvent({ ...draftEventRef.current, color: c });
                  } else {
                    onUpsertEvent({ id: popover.eventId, color: c });
                  }
                }
              }}
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
                const startISO = toISOLocal(
                  setHM(date, Math.floor(time.startMin / 60), time.startMin % 60),
                );
                const endISO = toISOLocal(
                  setHM(date, Math.floor(time.endMin / 60), time.endMin % 60),
                );
                if (popover.eventId) {
                  if (!v.title) {
                    onDeleteEvent(popover.eventId);
                  } else {
                    onUpsertEvent({
                      id: popover.eventId,
                      title: v.title,
                      color: v.color,
                      categoryId: v.categoryId ?? null,
                      startISO,
                      endISO,
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
                } else if (v.title) {
                  onUpsertEvent({
                    title: v.title,
                    color: v.color,
                    categoryId: v.categoryId ?? null,
                    startISO,
                    endISO,
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
                setMarkRange(null);
                setMarkReleased(false);
                closePopover();
              }}
            />
          );
        })()}

      {popover && !(appKind === "diary" && mode.kind === "year") && (
        <PopoverEditor
          key={popover.eventId ?? `${popover.key.month}:${popover.key.day}:${popover.key.session}`}
          calId={calId}
          seat={seat}
          teamId={seat === "admin" ? teamId : null}
          hidden={sessionEdgeResizing}
          initialText={popover.initialText}
          initialColor={
            popover.initialColor
              ?? (!popover.eventId && !popover.isEdit ? getSessionDefaultColor() : null)
          }
          initialCategoryId={popover.categoryId ?? null}
          isEdit={popover.isEdit}
          anchor={popover.rect}
          enableDuration={mode.kind === "year"}
          readOnly={viewerRole !== "owner" || isMembershipOverlayEvent(getEventById(popover.eventId), calId)}
          memberTeamMenu={isMembershipOverlayEvent(getEventById(popover.eventId), calId)}
          memberTeamId={getEventById(popover.eventId)?.entityId ?? null}
          placeholder={popover.placeholder}
          categoryOwnerId={
            seat === "individual"
              ? (calId.startsWith("client:") ? clientOwnerId : (memberId ?? null))
              : null
          }
          initialTime={(() => {
            if (mode.kind !== "year") return null;
            if (popover.pendingTime) return popover.pendingTime;
            if (popover.eventId) {
              const ev =
                (draftEvent?.id === popover.eventId ? draftEvent : null) ??
                getEventById(popover.eventId);
              if (ev && !ev.allDay) {
                const s = fromISOLocal(ev.startISO);
                const e = fromISOLocal(ev.endISO);
                return sessionMenuClockRange(s, e);
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
          initialAllDay={!!(popover.eventId && getEventById(popover.eventId)?.allDay)}
          initialDescription={
            popover.eventId
              ? getEventById(popover.eventId)?.description
                  ?? popover.initialDescription
                  ?? null
              : popover.initialDescription ?? null
          }
          initialLocation={
            popover.eventId
              ? getEventById(popover.eventId)?.location ?? null
              : null
          }
          initialLocationUrl={
            popover.eventId
              ? getEventById(popover.eventId)?.locationUrl ?? null
              : null
          }
          initialAppGroupId={
            seat === "admin" && popover.eventId
              ? getEventById(popover.eventId)?.appGroupId
                  ?? popover.appGroupId
                  ?? null
              : popover.appGroupId ?? null
          }
          onAppGroupChange={
            seat === "admin"
              ? (groupId, eventIds) => {
                  setPopover((p) => (p ? { ...p, appGroupId: groupId } : p));
                  const ids =
                    eventIds && eventIds.length > 0
                      ? eventIds
                      : popover.eventId
                        ? [popover.eventId]
                        : [];
                  for (const id of ids) {
                    if (draftEventRef.current?.id === id) {
                      setDraftEvent({
                        ...draftEventRef.current,
                        appGroupId: groupId ?? undefined,
                      });
                    } else {
                      onUpsertEvent({ id, appGroupId: groupId ?? null });
                    }
                  }
                }
              : undefined
          }
          onClose={closePopover}
          initialSignUpEnabled={
            !!popover.eventId &&
            (sessionSidePanelsRef.current.eventId === popover.eventId
              ? sessionSidePanelsRef.current.signUpEnabled
              : !!getEventById(popover.eventId)?.signUpEnabled)
          }
          initialParticipantsPanelOpen={
            !!popover.eventId &&
            sessionSidePanelsRef.current.eventId === popover.eventId &&
            sessionSidePanelsRef.current.participantsPanelOpen
          }
          initialLocationMapOpen={
            !!popover.eventId &&
            sessionSidePanelsRef.current.eventId === popover.eventId &&
            sessionSidePanelsRef.current.locationMapOpen
          }
          onSidePanelsChange={(next) => {
            sessionSidePanelsRef.current = {
              eventId: popover.eventId ?? null,
              ...next,
            };
          }}
          externalTimeCommitNonce={popover.timeCommitNonce ?? 0}
          viewMode={viewMode}
          eventForCopy={
            popover.eventId ? getEventById(popover.eventId) ?? null : null
          }
          sessionDate={(() => {
            if (popover.pendingDate) return popover.pendingDate;
            if (markRange) return weekDates[markRange.month];
            if (popover.eventId) {
              const ev = getEventById(popover.eventId);
              if (ev) return fromISOLocal(ev.startISO);
            }
            return weekDates[popover.key.month];
          })()}
          sessionEndDate={(() => {
            if (popover.pendingEndDate) return popover.pendingEndDate;
            if (markRange) return weekDates[markRange.endMonth ?? markRange.month];
            if (popover.eventId) {
              const ev = getEventById(popover.eventId);
              if (ev) {
                return sessionInclusiveEndDay(
                  fromISOLocal(ev.startISO),
                  fromISOLocal(ev.endISO),
                );
              }
            }
            return undefined;
          })()}
          initialRepeatRule={
            popover.eventId
              ? getEventById(popover.eventId)?.repeatRule ?? null
              : null
          }
          onDateChange={({ start, end }, eventIds) => {
            const ids =
              eventIds && eventIds.length > 0
                ? eventIds
                : popover.eventId
                  ? [popover.eventId]
                  : [];
            const primary = popover.eventId ? getEventById(popover.eventId) : null;
            if (primary?.startISO && primary.endISO && ids.length) {
              const delta = calendarDayDelta(fromISOLocal(primary.startISO), start);
              for (const id of ids) {
                const ev = getEventById(id);
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
                if (draftEventRef.current?.id === id) {
                  setDraftEvent({ ...draftEventRef.current, ...range });
                } else {
                  onMoveEvent(id, range);
                }
              }
            }
            const day = startOfDay(start);
            onCurrentDateChange(day, { start: day, end: day });
            setPopover((p) =>
              p ? { ...p, pendingDate: day, pendingEndDate: startOfDay(end) } : p,
            );
          }}
          onTitleChange={(title) => {
            const draft = draftEventRef.current;
            if (!draft || popover.eventId !== draft.id) return;
            const nextTitle = title.trim();
            if (draft.title === nextTitle) return;
            setDraftEvent({ ...draft, title: nextTitle });
          }}
          onColorChange={(c, eventIds) => {
            setPopover((p) => (p ? { ...p, initialColor: c } : p));
            if (!c) return;
            const ids =
              eventIds && eventIds.length > 0
                ? eventIds
                : popover.eventId
                  ? [popover.eventId]
                  : [];
            for (const id of ids) {
              if (draftEventRef.current?.id === id) {
                setDraftEvent({ ...draftEventRef.current, color: c });
              } else {
                onUpsertEvent({ id, color: c });
              }
            }
          }}
          onTimeChange={(t, eventIds) => {
            if (mode.kind !== "year" || !t) return;
            const ids =
              eventIds && eventIds.length > 0
                ? eventIds
                : popover.eventId
                  ? [popover.eventId]
                  : [];
            if (ids.length) {
              applyTimesToEventIds(ids, t);
              setPopover((p) => (p ? { ...p, pendingTime: t } : p));
              return;
            }
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
          onAllDayChange={(nextAllDay, t, eventIds) => {
            if (mode.kind !== "year") return;
            const ids =
              eventIds && eventIds.length > 0
                ? eventIds
                : popover.eventId
                  ? [popover.eventId]
                  : [];
            if (!ids.length) return;
            const time = t ?? { startMin: 0, endMin: 0 };
            for (const id of ids) {
              const ev = getEventById(id);
              if (!ev) continue;
              if (
                !nextAllDay &&
                isMultiDaySession(fromISOLocal(ev.startISO), fromISOLocal(ev.endISO))
              ) {
                const patch = { allDay: false } as const;
                if (draftEventRef.current?.id === ev.id) {
                  setDraftEvent({ ...draftEventRef.current, ...patch });
                } else {
                  onMoveEvent(ev.id, patch);
                }
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
              const patch = { startISO, endISO, allDay: nextAllDay } as const;
              if (draftEventRef.current?.id === ev.id) {
                setDraftEvent({ ...draftEventRef.current, ...patch });
              } else {
                onMoveEvent(ev.id, patch);
              }
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
              if (draftEventRef.current?.id === id) {
                setDraftEvent({ ...draftEventRef.current, signUpEnabled: enabled });
              } else {
                onUpsertEvent({ id, signUpEnabled: enabled });
              }
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
              if (draftEventRef.current?.id === id) {
                setDraftEvent({
                  ...draftEventRef.current,
                  location: nextLocation,
                  locationUrl: nextLocationUrl,
                });
              } else {
                onUpsertEvent({
                  id,
                  location: nextLocation,
                  locationUrl: nextLocationUrl,
                });
              }
            }
          }}
          onClearRepeat={(ids) => {
            for (const id of ids) {
              if (draftEventRef.current?.id === id) {
                setDraftEvent({
                  ...draftEventRef.current,
                  repeatRule: null,
                  repeatSeriesId: null,
                  repeatDetached: true,
                });
              } else {
                onUpsertEvent({
                  id,
                  repeatRule: null,
                  repeatSeriesId: null,
                  repeatDetached: true,
                });
              }
            }
          }}
          onRepeatPreviewChange={(preview) => setRepeatLivePreview(preview)}
          calendarEvents={events}
          onDeleteSessions={(ids, options) => {
            if (ids.length === 1) {
              const id = ids[0];
              if (draftEventRef.current?.id === id) clearDraftEvent(id);
              else onDeleteEvent(id);
            } else if (ids.length > 1) {
              for (const id of ids) {
                if (draftEventRef.current?.id === id) clearDraftEvent(id);
              }
              if (onDeleteEvents) onDeleteEvents(ids);
              else ids.forEach((id) => onDeleteEvent(id));
            }
            if (options?.close === false) return;
            setMarkRange(null);
            setMarkReleased(false);
            closePopover();
          }}
          onCommit={(text, color, time, accept, allDay, description, appGroupId, repeatRule, categoryId, location, locationUrl, signUpEnabled, eventIds) => {
            const t = text.trim();
            const effectiveColor = color ?? popover.initialColor ?? null;
            const effectiveCategoryId = categoryId ?? popover.categoryId ?? null;
            const effectiveLocation = (location ?? "").trim() || undefined;
            const effectiveLocationUrl = (locationUrl ?? "").trim() || undefined;

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
                const ev = getEventById(popover.eventId);
                date = ev ? fromISOLocal(ev.startISO) : undefined;
              } else {
                date = weekDates[popover.key.month];
              }
              if (date) {
                const lo = markRange ? markRange.lo : popover.key.day * 2 + popover.key.session;
                const hi = markRange ? markRange.hi : lo;
                const rangeStartMin = WEEK_START_HOUR * 60 + (lo - 2) * 30;
                const rangeEndMin = WEEK_START_HOUR * 60 + (hi - 2 + 1) * 30;
                const effTime = allDay ? { startMin: 0, endMin: 0 } : time ?? popover.pendingTime ?? null;
                const startMin = effTime ? effTime.startMin : rangeStartMin;
                const endMin = effTime ? effTime.endMin : rangeEndMin;
                let endDate = date;
                if (popover.pendingEndDate) {
                  endDate = popover.pendingEndDate;
                } else if (markRange) {
                  endDate = weekDates[markRange.endMonth ?? markRange.month];
                } else if (popover.eventId) {
                  const ev = getEventById(popover.eventId);
                  if (ev) {
                    endDate = sessionInclusiveEndDay(
                      fromISOLocal(ev.startISO),
                      fromISOLocal(ev.endISO),
                    );
                  }
                }
                const clocks = isoFromMenuClocks(
                  date,
                  endDate,
                  startMin,
                  endMin,
                );
                const fullDay = timedHourGrid
                  ? promoteFullDayTimedSpan(clocks.startISO, clocks.endISO)
                  : null;
                const startISO = fullDay?.startISO ?? clocks.startISO;
                const endISO = fullDay?.endISO ?? clocks.endISO;
                const spanAllDay = fullDay ? true : !!allDay;
                const spanDays = calendarDayDelta(startOfDay(date), startOfDay(endDate));

                if (popover.eventId) {
                  if (!t) {
                    const deleteIds =
                      eventIds && eventIds.length > 0
                        ? eventIds
                        : [popover.eventId];
                    for (const id of deleteIds) {
                      if (draftEventRef.current?.id === id) clearDraftEvent(id);
                    }
                    if (deleteIds.length > 1 && onDeleteEvents) {
                      onDeleteEvents(deleteIds);
                    } else {
                      deleteIds.forEach((id) => onDeleteEvent(id));
                    }
                  } else {
                    const targetIds =
                      eventIds && eventIds.length > 0
                        ? eventIds
                        : [popover.eventId];
                    const primary = getEventById(popover.eventId);
                    const sharedSeriesId = repeatRule
                      ? primary
                        ? sharedRepeatSeriesId(primary, events)
                        : makeEventId()
                      : null;
                    for (const id of targetIds) {
                      const existing = getEventById(id);
                      if (!existing) continue;
                      const day = fromISOLocal(existing.startISO);
                      const instEndDay = addDays(startOfDay(day), spanDays);
                      const instClocks = isoFromMenuClocks(day, instEndDay, startMin, endMin);
                      const instFullDay = timedHourGrid
                        ? promoteFullDayTimedSpan(instClocks.startISO, instClocks.endISO)
                        : null;
                      const instStartISO = instFullDay?.startISO ?? instClocks.startISO;
                      const instEndISO = instFullDay?.endISO ?? instClocks.endISO;
                      const instAllDay = instFullDay ? true : spanAllDay;
                      const applyTimes =
                        !!allDay ||
                        !!markRange ||
                        !!time ||
                        !!popover.pendingDate ||
                        !!popover.pendingEndDate ||
                        !!popover.pendingTime ||
                        targetIds.length > 1;
                      const patch = {
                        id,
                        title: t,
                        color: effectiveColor,
                        categoryId: effectiveCategoryId ?? undefined,
                        category: categoryFromColor(effectiveColor),
                        location: effectiveLocation,
                        locationUrl: effectiveLocationUrl,
                        ...(applyTimes
                          ? { startISO: instStartISO, endISO: instEndISO }
                          : {}),
                        allDay: instAllDay,
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
                        repeatSeriesId: sharedSeriesId,
                        repeatDetached: !repeatRule,
                      };
                      if (draftEventRef.current?.id === id) {
                        onUpsertEvent({
                          ...draftEventRef.current,
                          ...patch,
                          startISO: instStartISO,
                          endISO: instEndISO,
                        });
                        clearDraftEvent(id);
                      } else {
                        onUpsertEvent(patch);
                      }
                    }
                    const existing = primary;
                    if (
                      repeatRule &&
                      existing &&
                      shouldMaterializeRepeatOnSave(existing, events, repeatRule)
                    ) {
                      const anchorStartISO = startISO;
                      const seriesTemplate = {
                        title: t,
                        color: effectiveColor,
                        categoryId: effectiveCategoryId ?? existing?.categoryId ?? undefined,
                        location: effectiveLocation,
                        locationUrl: effectiveLocationUrl,
                        startISO: anchorStartISO,
                        endISO,
                        allDay: spanAllDay,
                        category: categoryFromColor(effectiveColor),
                        repeatRule,
                        repeatSeriesId: sharedSeriesId,
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
                        existing,
                        events,
                        seriesTemplate,
                        repeatRule,
                        date,
                        sharedSeriesId!,
                        {
                          preserveEventId: popover.eventId,
                          skipStartISO: anchorStartISO,
                        },
                      );
                      if (plan) {
                        for (const inst of plan.upserts) {
                          onUpsertEvent(inst);
                        }
                        if (plan.deleteIds.length > 0) {
                          onDeleteEvents?.(plan.deleteIds);
                        }
                      }
                    }
                    // Explicit Save (Enter / Lagre button) on a coach-pending
                    // session accepts the coach's proposal: clear the stripe
                    // so the tile renders as a normal accepted session.
                    if (accept && onAcceptCoachSession) {
                      const existing = getEventById(popover.eventId);
                      if (existing?.coachPending) onAcceptCoachSession(popover.eventId);
                    }
                  }
                } else if (t) {
                  const template = {
                    title: t,
                    color: effectiveColor,
                    categoryId: effectiveCategoryId ?? undefined,
                    location: effectiveLocation,
                    locationUrl: effectiveLocationUrl,
                    startISO,
                    endISO,
                    allDay: spanAllDay,
                    category: categoryFromColor(effectiveColor),
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
                    for (const inst of expandRepeatingEvents(template, repeatRule, date)) {
                      onUpsertEvent(inst);
                    }
                  } else {
                    onUpsertEvent(template);
                  }
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
      {pasteOverlay}
      {sessionContextOverlay}
      {pasteToastNode}
      {sessionContextToastNode}
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
  markInfo: (k: CellKey) => {
    in: boolean;
    isFirst: boolean;
    isLast: boolean;
    isPlus: boolean;
    size: number;
  };
  onMarkBegin: (k: CellKey) => void;
  onMarkDragBegin: (k: CellKey) => void;
  onMarkSingleCell: (k: CellKey, anchor?: HTMLElement) => void;
  isDraggingMark: boolean;
  onOpenPopover: (k: CellKey, anchor: HTMLElement) => void;
  allowMark: boolean;
  markReleased: boolean;
  hideMarkCellFill?: boolean;
  skipCellColorTransition?: boolean;
  weekDates?: Date[];
  onColumnContextMenu?: (e: React.MouseEvent, date: Date) => void;
  /** Place each day on its buffer column instead of packing mounted days to the left. */
  pinColumns?: boolean;
  /** Hour rows are a fixed height. Skip per-cell transitions and compositor layers. */
  staticCells?: boolean;
  /** Week view draws a line on the hour only. */
  hideHalfHourLine?: boolean;
}

function DayRow(props: DayRowProps) {
  const {
    day,
    year,
    months,
    calId,
    data,
    mode,
    rowHeight,
    selected,
    selectedId,
    editingId,
    editValue,
    setEditValue,
    onSelect,
    onBeginEdit,
    onCommitEdit,
    onCommitDuration,
    onMoveAfterCommit,
    inDragRange,
    onCellMouseEnter,
    onHandleDown,
    isMonthFocused,
    isMonthPeriph,
    markInfo,
    onMarkBegin,
    onMarkDragBegin,
    onMarkSingleCell,
    isDraggingMark,
    onOpenPopover,
    allowMark,
    markReleased,
    hideMarkCellFill = false,
    skipCellColorTransition = false,
    weekDates,
    onColumnContextMenu,
    pinColumns = false,
    staticCells = false,
    hideHalfHourLine = false,
  } = props;

  return (
    <>
      {months.map((m) => {
        const valid = day <= m.dim;
        const focused = isMonthFocused(m.idx);
        const periph = isMonthPeriph(m.idx);

        const placed = pinColumns ? { gridColumn: m.idx + 1, gridRow: day } : null;
        if (!valid) {
          return (
            <div
              key={mode.kind === "year" ? `v-${m.idx}` : `v-${m.idx}-${day}`}
              data-month-col={m.idx}
              className={`border-b border-r border-hairline ${mode.kind === "year" ? "bg-card" : "bg-muted/30"}`}
              style={{
                height: rowHeight * 2,
                transition:
                  staticCells || skipCellColorTransition ? undefined : `height ${DUR_MS}ms ${EASE}`,
                willChange: staticCells || skipCellColorTransition ? undefined : "height",
                opacity: periph ? 0.55 : 1,
                ...placed,
              }}
            />
          );
        }

        const weekend = isWeekend(year, m.idx, day);
        // If the last session of this day shares a color with the first
        // session of the next day in the same column, hide the bottom
        // border so the session block reads as a single continuous fill.
        const lastSessionRaw =
          data[makeCellId(calId, { year, month: m.idx, day, session: 1 })]?.text ?? "";
        const nextDayFirstRaw =
          day < m.dim
            ? (data[makeCellId(calId, { year, month: m.idx, day: day + 1, session: 0 })]?.text ??
              "")
            : "";
        const lastSessionColor = splitColor(lastSessionRaw).color;
        const nextDayFirstColor = splitColor(nextDayFirstRaw).color;
        const lastMarked = markInfo({ year, month: m.idx, day, session: 1 }).in;
        const nextMarked =
          day < m.dim ? markInfo({ year, month: m.idx, day: day + 1, session: 0 }).in : false;
        const mergeBelow =
          (!!lastSessionColor && lastSessionColor === nextDayFirstColor) ||
          (!hideMarkCellFill && lastMarked && nextMarked);
        return (
          <div
            key={mode.kind === "year" ? `c-${m.idx}` : `c-${m.idx}-${day}`}
            data-month-col={m.idx}
            className={`relative border-r border-hairline ${mergeBelow ? "" : "border-b"} ${weekend && mode.kind !== "year" ? "bg-muted/40" : ""}`}
            style={{
              height: rowHeight * 2,
              transition:
                staticCells || skipCellColorTransition ? undefined : `height ${DUR_MS}ms ${EASE}`,
              willChange: staticCells || skipCellColorTransition ? undefined : "height",
              opacity: periph ? 0.55 : 1,
              ...placed,
            }}
            onContextMenu={
              mode.kind === "year" && weekDates && onColumnContextMenu
                ? (e) => {
                    const date = weekDates[m.idx];
                    if (!date) return;
                    onColumnContextMenu(e, date);
                  }
                : undefined
            }
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
              onMarkSingleCell={onMarkSingleCell}
              isDraggingMark={isDraggingMark}
              onOpenPopover={onOpenPopover}
              allowMark={allowMark}
              markReleased={markReleased}
              hideMarkCellFill={hideMarkCellFill}
              hideHalfHourLine={hideHalfHourLine}
              skipCellColorTransition={skipCellColorTransition}
              staticCells={staticCells}
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
  markInfo: (k: CellKey) => {
    in: boolean;
    isFirst: boolean;
    isLast: boolean;
    isPlus: boolean;
    size: number;
  };
  onMarkBegin: (k: CellKey) => void;
  onMarkDragBegin: (k: CellKey) => void;
  onMarkSingleCell: (k: CellKey, anchor?: HTMLElement) => void;
  isDraggingMark: boolean;
  onOpenPopover: (k: CellKey, anchor: HTMLElement) => void;
  allowMark: boolean;
  markReleased: boolean;
  hideMarkCellFill?: boolean;
  hideHalfHourLine?: boolean;
  skipCellColorTransition?: boolean;
  staticCells?: boolean;
}

function DayCellPair(props: DayCellPairProps) {
  const {
    calId,
    year,
    month,
    day,
    weekend,
    data,
    focused,
    periph,
    mode,
    rowHeight,
    selectedId,
    editingId,
    editValue,
    setEditValue,
    onSelect,
    onBeginEdit,
    onCommitEdit,
    onCommitDuration,
    onMoveAfterCommit,
    inDragRange,
    onCellMouseEnter,
    onHandleDown,
    markInfo,
    onMarkBegin,
    onMarkDragBegin,
    onMarkSingleCell,
    isDraggingMark,
    onOpenPopover,
    allowMark,
    markReleased,
    hideMarkCellFill = false,
    hideHalfHourLine = false,
    skipCellColorTransition = false,
    staticCells = false,
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
        // When the cell is the active/clicked one, fill with the accent color
        // and switch the label to white (Notion / iCloud style).
        const isActiveColored = isSelected && !!cellColor;
        const bg = isActiveColored
          ? (cellColor as string)
          : cellColor
            ? `color-mix(in srgb, ${cellColor} 18%, white)`
            : undefined;

        // Merge with neighbouring sessions of the same color so a multi-cell
        // session reads as one continuous block (no inner divider lines).
        const prevRaw = isFirst
          ? day > 1
            ? (data[makeCellId(calId, { year, month, day: day - 1, session: 1 })]?.text ?? "")
            : ""
          : (data[makeCellId(calId, { year, month, day, session: 0 })]?.text ?? "");
        const prevColor = splitColor(prevRaw).color;
        const sameAbove = !!cellColor && cellColor === prevColor;

        // The hour row's bottom border is the full-hour line. Week view
        // does not draw the extra line through the half hour.
        const hideTopDivider =
          hideHalfHourLine || (mk.in && !mk.isFirst && !hideMarkCellFill) || sameAbove;

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
              // Second press of a double-click must not start a mark drag;
              // dblclick materializes the session in one paint.
              if (e.detail >= 2) return;
              onSelect(k);
              if (allowMark && e.button === 0) onMarkBegin(k);
            }}
            onMouseEnter={() => onCellMouseEnter(k)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (allowMark) {
                onMarkSingleCell(k, e.currentTarget);
              } else {
                onBeginEdit(k);
              }
            }}
            className={`relative flex-1 select-none text-[12px] leading-tight ${
              !isFirst && !hideTopDivider ? "border-t border-hairline/60" : ""
            } ${(ranged || isSelected) && !mk.in && !isActiveColored ? "bg-muted-foreground/15" : ""} ${
              staticCells || skipCellColorTransition ? "" : "transition-colors"
            }`}
            style={{
              background: mk.in ? undefined : bg,
              color: isActiveColored ? "#fff" : undefined,
              minHeight: rowHeight,
              transition: staticCells
                ? undefined
                : skipCellColorTransition
                  ? `min-height ${DUR_MS}ms ${EASE}`
                  : `min-height ${DUR_MS}ms ${EASE}, background-color 120ms ease`,
              willChange: staticCells || skipCellColorTransition ? undefined : "min-height",
            }}
          >
            {cellColor && (
              <span
                className="pointer-events-none absolute left-0 top-0 bottom-0 z-[1] w-[3px]"
                style={{ background: cellColor }}
              />
            )}
            {mk.in && !hideMarkCellFill && (
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
                    bottom: mk.isPlus ? "calc(50% + 14px)" : mk.isLast ? 3 : 0,
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

            {/* Selection outline removed — keep marking subtle (gray fill only) */}

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
                <div
                  className={`min-w-0 border-l px-3 text-[13px] ${isActiveColored ? "border-white/30 text-white" : "border-hairline text-ink"}`}
                >
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

            {showCompact &&
              !isEditing &&
              (() => {
                const Icon = iconForColor(cellColor);
                const labelColor = isActiveColored ? "#fff" : "hsl(var(--ink, 220 13% 13%))";
                const iconColor = isActiveColored ? "#fff" : (cellColor ?? labelColor);
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
                      <Icon
                        className="h-3 w-3 shrink-0"
                        strokeWidth={2.25}
                        style={{ color: iconColor }}
                      />
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
  spanHours = 18,
  gridColumnOffset = 2,
}: {
  colIdx: number;
  /** Minutes elapsed since the grid's first hour (00:00 in timed week/day). */
  nowMinutesSinceStart: number;
  spanHours?: number;
  /** First grid column of day 0. 2 when the hour gutter is in the grid. */
  gridColumnOffset?: number;
}) {
  const ROW_HEIGHT = 28;
  const top = (nowMinutesSinceStart / 30) * ROW_HEIGHT;
  const NOW_COLOR = "#FF4F4F";
  return (
    <div
      aria-hidden
      style={{
        gridColumnStart: colIdx + gridColumnOffset,
        gridColumnEnd: colIdx + gridColumnOffset + 1,
        gridRowStart: 1,
        gridRowEnd: spanHours + 1,
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
          className="absolute -left-[1px] top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full"
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
  calId,
  events,
  weekDates,
  startHour,
  spanHours = 18,
  stackMode = false,
  appKind = "calendar",
  activeEventId = null,
  markedEventIds,
  onEventClick,
  onEventDrop,
  onEventDragStart,
  onEventContextMenu,
  onLiveResize,
  onResizeStart,
  onResizeEnd,
  onResizeCommit,
  onClearCellSelection,
  onDeleteEvent,
  onSaveSessionNote,
  onUpsertSession,
  onAcceptCoachSession,
  memberId,
  viewerRole = "owner",
  markPreview = null,
  scrollerRef,
  syncScrollerBounds,
  edgeScrollRowHeight = 28,
  onEdgeScrollGesture,
  beginWeekEdgePulse,
  bandDropPreview = null,
  gridColumnOffset = 2,
  renderColStart = 0,
  renderColEnd = Number.POSITIVE_INFINITY,
  dayColumnWidth = 0,
}: {
  calId: string;
  events: CalendarEvent[];
  weekDates: Date[];
  startHour: number;
  spanHours?: number;
  /** Equal-height stacked tiles (month-like), ignoring time-of-day placement. */
  stackMode?: boolean;
  appKind?: "calendar" | "diary";
  activeEventId?: string | null;
  markedEventIds?: ReadonlySet<string>;
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onEventContextMenu?: (
    e: React.MouseEvent,
    ev: CalendarEvent,
    anchor: HTMLElement,
  ) => void;
  onEventDrop: (
    id: string,
    newDate: Date,
    newStartMin: number,
    durationMin: number,
    anchor?: HTMLElement,
    range?: { startISO: string; endISO: string },
  ) => void;
  /** Fires the moment a drag exceeds the 3px threshold — used to hide the open popover until drop. */
  onEventDragStart?: (id: string) => void;
  /** Fires during a top/bottom edge resize so the open popover's time wheels can tick along. */
  onLiveResize?: (id: string, t: { startMin: number; endMin: number }) => void;
  /** Fires on edge-resize pointerdown so the session menu can hide for the gesture. */
  onResizeStart?: (id: string) => void;
  /** Fires on edge-resize pointerup (changed or not) so the session menu can return. */
  onResizeEnd?: () => void;
  /** Fires on edge-resize release so the session duration is persisted. */
  onResizeCommit?: (id: string, t: { startMin: number; endMin: number }) => void;
  /** Drop the empty-cell highlight so it is not visible behind a moving tile. */
  onClearCellSelection?: () => void;
  onDeleteEvent?: (id: string) => void;
  onSaveSessionNote?: (id: string, note: string) => void;
  onUpsertSession?: (patch: Partial<CalendarEvent> & { id: string }) => void;
  onAcceptCoachSession?: (id: string) => void;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  /** Live hold-and-drag create preview (calendar week/day). */
  markPreview?: { month: number; lo: number; hi: number; endMonth?: number } | null;
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
  syncScrollerBounds?: (node: HTMLElement) => number;
  edgeScrollRowHeight?: number;
  onEdgeScrollGesture?: (active: boolean) => void;
  beginWeekEdgePulse?: (onFrame: (scrollLeft: number) => void, onPulseEnd: () => void) => WeekEdgePulse;
  /** All-day chip dragged into the timed grid (30-min placeholder). */
  bandDropPreview?: {
    colIdx: number;
    startMin: number;
    title: string;
    color: string | null;
  } | null;
  /** First grid column of day 0. 2 when the hour gutter shares this grid. */
  gridColumnOffset?: number;
  /** Inclusive columns to paint. The rest of the pan buffer stays unmounted. */
  renderColStart?: number;
  renderColEnd?: number;
  /** Fixed day width while horizontally panning. 0 measures a column instead. */
  dayColumnWidth?: number;
}) {
  const ROW_HEIGHT = 28;
  const dayColumnWidthRef = useRef(dayColumnWidth);
  dayColumnWidthRef.current = dayColumnWidth;
  /** Fixed chip height in stack mode — fits title + time like a short week tile. */
  const STACK_TILE_H = 40;
  const STACK_TILE_GAP = 2;
  const STACK_PAD = 4;
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
  const [tileDesign] = useSessionTileDesign();
  const [unit] = useDistanceUnit();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [forceEditId, setForceEditId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [detailsEvId, setDetailsEvId] = useState<string | null>(null);
  // For non-owner viewers: track which tile is currently being pressed
  // (drag attempt) so it can show the "clicked" highlight while held,
  // without replacing the previously-opened edit panel.
  const [readOnlyPressedId, setReadOnlyPressedId] = useState<string | null>(null);
  /** Pressed tile in stack (no-time) layout — mirrors timed-layout drag press. */
  const [stackPressedId, setStackPressedId] = useState<string | null>(null);
  /**
   * Month-like cross-day drag for stack (hide-time) week/day layout:
   * floating clone + top-of-column ghost slot; immediate handoff on release.
   */
  const [stackDrag, setStackDrag] = useState<{
    eventId: string;
    event: CalendarEvent;
    originColIdx: number;
    startMin: number;
    durationMin: number;
    targetColIdx: number | null;
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
    chipWidth: number;
    chipHeight: number;
    eventStartISO: string;
    multiDay: boolean;
  } | null>(null);
  const stackDragRef = useRef(stackDrag);
  useEffect(() => {
    stackDragRef.current = stackDrag;
  }, [stackDrag]);
  const stackDragStartRef = useRef<{
    x: number;
    y: number;
    eventId: string;
    event: CalendarEvent;
    originColIdx: number;
    startMin: number;
    durationMin: number;
    offsetX: number;
    offsetY: number;
    chipWidth: number;
    chipHeight: number;
    eventStartISO: string;
    multiDay: boolean;
  } | null>(null);
  const stackGhostElRef = useRef<HTMLDivElement | null>(null);
  const stackLivePointerRef = useRef({ x: 0, y: 0, active: false });
  useLayoutEffect(() => {
    const pointer = stackLivePointerRef.current;
    const start = stackDragStartRef.current;
    const ghost = stackGhostElRef.current;
    if (!pointer.active || !start || !ghost) return;
    ghost.style.left = `${pointer.x - start.offsetX}px`;
    ghost.style.top = `${pointer.y - start.offsetY}px`;
  });
  const stackHitRafRef = useRef<number | null>(null);
  const suppressStackClickRef = useRef(false);
  useEffect(() => {
    if (!readOnlyPressedId && !stackPressedId) return;
    // While an active stack drag is in progress, keep press styling until drop.
    if (stackDrag) return;
    const clear = () => {
      // Defer so the following `click` still sees the pressed/active tile
      // (and captures a stable anchor rect) before press styling clears.
      queueMicrotask(() => {
        setReadOnlyPressedId(null);
        setStackPressedId(null);
      });
    };
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, [readOnlyPressedId, stackPressedId, stackDrag]);
  useEffect(
    () => () => {
      if (stackHitRafRef.current != null) cancelAnimationFrame(stackHitRafRef.current);
    },
    [],
  );
  // A session is "locked" when it has an open edit panel, note panel, or is
  // being created. While locked, hovering other tiles must not open menus.
  const globalLock = useHoverLock();
  const ownLockId = (forceEditId ?? lockedId) != null ? `session-${forceEditId ?? lockedId}` : null;
  const foreignLock = globalLock !== null && globalLock !== ownLockId;
  const hoverLocked = lockedId !== null || forceEditId !== null || foreignLock;
  const safeSetHoverId = useCallback(
    (id: string | null) => {
      if (hoverLocked) {
        const allowed = lockedId ?? forceEditId;
        if (id !== null && id !== allowed) return;
      }
      setHoverId(id);
    },
    [hoverLocked, lockedId, forceEditId],
  );
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
      if (forceEditId) return; // keep menu open while in edit mode
      setHoverId(null);
      setHoverRect(null);
    }, 0);
  }, [cancelClose, forceEditId]);

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

  useClosePanelsForDeletedEvents(events, {
    hoverId,
    setForceEditId,
    setLockedId,
    setDetailsEvId,
    setHoverId,
    setHoverRect,
  });

  const gestureKindRef = useRef<"drag" | "resize" | null>(null);
  /** Tile presses do not reach the window listener, so each press bumps this. */
  const dragEpochRef = useRef(0);

  const [drag, setDrag] = useState<{
    id: string;
    pointerStart: { x: number; y: number };
    originColIdx: number;
    originStartMin: number;
    originEndMin: number;
    durationMin: number;
    moved: boolean;
    delta: { dx: number; dy: number };
    anchor: HTMLElement | null;
    /** Week multi-day: time shift is not limited by the slice filling the day. */
    looseTime: boolean;
    /** Week multi-day: move the whole session by the grabbed day's delta. */
    shiftWholeEvent: boolean;
    eventStartISO: string;
    eventEndISO: string;
    /** Day view: drag changes only this endpoint. Null moves the whole session. */
    endpoint: "start" | "end" | null;
    clockStartMin: number;
    clockEndMin: number;
    previewStartMin: number;
    previewEndMin: number;
  } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const dragElRef = useRef<HTMLElement | null>(null);
  const dragFloatRef = useRef<HTMLElement | null>(null);
  /** Pointer offset inside the tile, locked before any week paging. */
  const dragGrabRef = useRef({ x: 0, y: 0, w: 0, h: 0, locked: false });
  const dragPointerRef = useRef({ x: 0, y: 0, has: false });
  const gestureScrollOriginRef = useRef(0);
  const gestureScrollLeftOriginRef = useRef(0);
  const [dragSnap, setDragSnap] = useState<{
    id: string;
    colIdx: number;
    startMin: number;
    durationMin: number;
  } | null>(null);
  const dragSnapRef = useRef(dragSnap);
  const dragSnapRafRef = useRef<number | null>(null);

  const [resize, setResize] = useState<{
    id: string;
    edge: "top" | "bottom";
    pointerStartY: number;
    originStartMin: number;
    originEndMin: number;
    originColIdx: number;
    date: Date;
    currentStartMin: number;
    currentEndMin: number;
  } | null>(null);
  const resizeRef = useRef<typeof resize>(null);
  const resizeElRef = useRef<HTMLElement | null>(null);
  const resizeLiveRafRef = useRef<number | null>(null);
  /**
   * Swallow the click that follows a tile drag or edge-resize release.
   * Pointer capture is on the tile, so the synthetic click lands on the tile
   * after React has already cleared `drag` — `drag?.moved` is then false.
   * That click would reset map/sign-up flags (or toggle the menu closed).
   * Day view always drops on the same column, so the click always fires;
   * week cross-day drops often do not.
   */
  /** Set on pointerdown when switching from another open session so the trailing click does not toggle the new menu closed. */
  const switchedSessionOnPointerRef = useRef(false);
  const suppressClickAfterTileGestureRef = useRef(false);
  const suppressClickAfterTileGestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const armSuppressClickAfterTileGesture = useCallback(() => {
    suppressClickAfterTileGestureRef.current = true;
    if (suppressClickAfterTileGestureTimerRef.current != null) {
      clearTimeout(suppressClickAfterTileGestureTimerRef.current);
    }
    // Click is dispatched after pointerup as a separate task; microtasks run
    // too early and clear the flag before onClick. Keep it armed briefly.
    suppressClickAfterTileGestureTimerRef.current = setTimeout(() => {
      suppressClickAfterTileGestureRef.current = false;
      suppressClickAfterTileGestureTimerRef.current = null;
    }, 100);
  }, []);

  const commitDragSnap = (snap: NonNullable<typeof dragSnap>) => {
    const prev = dragSnapRef.current;
    if (
      prev &&
      prev.id === snap.id &&
      prev.colIdx === snap.colIdx &&
      prev.startMin === snap.startMin &&
      prev.durationMin === snap.durationMin
    ) {
      return;
    }
    dragSnapRef.current = snap;
    setDragSnap(snap);
  };
  const clearDragSnap = () => {
    dragSnapRef.current = null;
    setDragSnap(null);
  };

  const onEventDropRef = useRef(onEventDrop);
  onEventDropRef.current = onEventDrop;
  const onEventDragStartRef = useRef(onEventDragStart);
  onEventDragStartRef.current = onEventDragStart;
  const onLiveResizeRef = useRef(onLiveResize);
  onLiveResizeRef.current = onLiveResize;
  const onResizeStartRef = useRef(onResizeStart);
  onResizeStartRef.current = onResizeStart;
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;
  const onResizeCommitRef = useRef(onResizeCommit);
  onResizeCommitRef.current = onResizeCommit;
  const onClearCellSelectionRef = useRef(onClearCellSelection);
  onClearCellSelectionRef.current = onClearCellSelection;
  const weekDatesRef = useRef(weekDates);
  weekDatesRef.current = weekDates;

  const RESIZE_EDGE_PX = 12;

  const clearDragVisual = useCallback(() => {
    if (dragSnapRafRef.current != null) {
      cancelAnimationFrame(dragSnapRafRef.current);
      dragSnapRafRef.current = null;
    }
    clearDragSnap();
    const el = dragElRef.current;
    if (el) {
      el.style.transform = "";
      el.style.willChange = "";
      el.style.visibility = "";
      // Do not clear left/right/width. Those are React-managed overlap
      // columns. Blanking them on click (or after drop) leaves the tile
      // left-aligned until a later layout change re-applies the style prop.
      dragElRef.current = null;
    }
    dragFloatRef.current?.remove();
    dragFloatRef.current = null;
  }, []);

  const cancelDragGesture = useCallback(() => {
    clearDragVisual();
    dragRef.current = null;
    setDrag(null);
  }, [clearDragVisual]);

  const beginEdgeResize = useCallback(
    (
      edge: "top" | "bottom",
      ev: CalendarEvent,
      e: React.PointerEvent,
      colIdx: number,
      startMin: number,
      endMin: number,
      tileEl: HTMLElement,
    ) => {
      e.stopPropagation();
      e.preventDefault();
      dragEpochRef.current += 1;
      onClearCellSelectionRef.current?.();
      onResizeStartRef.current?.(ev.id);
      gestureKindRef.current = "resize";
      // Arm before release — capture redirects the trailing click onto the tile.
      armSuppressClickAfterTileGesture();
      cancelDragGesture();
      tileEl.setPointerCapture?.(e.pointerId);
      resizeElRef.current = tileEl;
      gestureScrollOriginRef.current = scrollerRef?.current?.scrollTop ?? 0;
      onEdgeScrollGesture?.(true);
      const initialResize = {
        id: ev.id,
        edge,
        pointerStartY: e.clientY,
        originStartMin: startMin,
        originEndMin: endMin,
        originColIdx: colIdx,
        date: weekDates[colIdx],
        currentStartMin: startMin,
        currentEndMin: endMin,
      };
      resizeRef.current = initialResize;
      setResize(initialResize);
    },
    [armSuppressClickAfterTileGesture, cancelDragGesture, weekDates, scrollerRef, onEdgeScrollGesture],
  );

  // Always-on pointer pipeline for tile move + edge resize. Listeners must
  // exist before pointerup — mounting them in a setState effect loses fast
  // clicks/drags on the bottom edge. Resize state must update on every move
  // so React-driven height/top is not reset to stale values mid-gesture.
  useEffect(() => {
    const PX_PER_MIN = ROW_HEIGHT / 30;
    const RESIZE_SNAP = 5;
    const minStart = startHour * 60;
    const maxEnd = startHour * 60 + spanHours * 60;
    const minDur = 15;

    const TILE_DRAG_THRESHOLD_PX = 12;
    const computeDragSnap = (d: NonNullable<typeof drag>) => {
      const measured = dayColumnWidthRef.current;
      const sample =
        measured > 0 ? null : document.querySelector<HTMLElement>('[data-month-col="0"]');
      const colW = measured > 0 ? measured : (sample?.offsetWidth ?? 1);
      const scrollDeltaX =
        (scrollerRef?.current?.scrollLeft ?? 0) - gestureScrollLeftOriginRef.current;
      const colShift = Math.round((d.delta.dx + scrollDeltaX) / colW);
      const dates = weekDatesRef.current;
      const newCol = Math.max(0, Math.min(dates.length - 1, d.originColIdx + colShift));
      const scrollDelta =
        (scrollerRef?.current?.scrollTop ?? 0) - gestureScrollOriginRef.current;
      const minShift = Math.round((d.delta.dy + scrollDelta) / ROW_HEIGHT) * 30;
      let newStart = d.originStartMin + minShift;
      const maxStart = d.looseTime
        ? startHour * 60 + spanHours * 60 - 30
        : startHour * 60 + spanHours * 60 - d.durationMin;
      newStart = Math.max(minStart, Math.min(maxStart, newStart));
      return {
        id: d.id,
        colIdx: newCol,
        startMin: newStart,
        durationMin: d.durationMin,
      };
    };

    const lastPtr = { x: 0, y: 0, has: false };
    let edgeRaf = 0;
    let lastTs = 0;
    let releasedEpoch = -1;
    let stickyY = createStickyViewportPointer();
    const edgeGesture = createEdgeScrollGesture();

    const weekPulse = (beginWeekEdgePulse ?? (() => inertWeekEdgePulse()))(
      () => {
        applyDragFromLastPtr();
      },
      () => {
        const end = weekTileEndRef.current;
        weekTileEndRef.current = null;
        end?.();
      },
    );
    const weekTileEndRef = { current: null as (() => void) | null };

    const horizontalPan = () => dayColumnWidthRef.current > 0 && !stackMode;
    const applyHorizontalFromLastPtr = () => {
      if (!horizontalPan() || gestureKindRef.current !== "drag") return;
      const d = dragRef.current;
      if (!d?.moved || d.endpoint || !lastPtr.has) return;
      weekPulse.over(lastPtr.x);
    };

    let pulsePane: DOMRect | null = null;
    const mappedPointerY = (clientY: number) => {
      const scroller = scrollerRef?.current;
      if (!scroller) return clientY;
      if (weekPulse.isPulsing()) {
        pulsePane ??= scroller.getBoundingClientRect();
        return stickyY(clientY, pulsePane);
      }
      pulsePane = null;
      return stickyY(clientY, scroller.getBoundingClientRect());
    };

    const applyEdgeFromLastPtr = (movementY: number, dt: number) => {
      const scroller = scrollerRef?.current;
      if (!scroller || !syncScrollerBounds || stackMode || !lastPtr.has) return;
      applyTimedGridEdgeScroll(
        scroller,
        lastPtr.y,
        movementY,
        dt,
        edgeScrollRowHeight,
        syncScrollerBounds(scroller),
        engagedEdgeScrollIntent(edgeGesture),
      );
    };

    const applyResizeFromLastPtr = () => {
      const r = resizeRef.current;
      if (!r || gestureKindRef.current !== "resize") return;
      const scrollDelta =
        (scrollerRef?.current?.scrollTop ?? 0) - gestureScrollOriginRef.current;
      const dy = mappedPointerY(lastPtr.y) - r.pointerStartY + scrollDelta;
      const deltaMin = Math.round(dy / PX_PER_MIN / RESIZE_SNAP) * RESIZE_SNAP;
      const { startMin, endMin } = timedGridResizeRange(
        r.edge,
        r.originStartMin,
        r.originEndMin,
        deltaMin,
        minStart,
        maxEnd,
        minDur,
      );
      if (startMin === r.currentStartMin && endMin === r.currentEndMin) return;
      const next = { ...r, currentStartMin: startMin, currentEndMin: endMin };
      resizeRef.current = next;
      setResize(next);
      if (resizeLiveRafRef.current == null) {
        resizeLiveRafRef.current = requestAnimationFrame(() => {
          resizeLiveRafRef.current = null;
          const live = resizeRef.current;
          if (!live || gestureKindRef.current !== "resize") return;
          onLiveResizeRef.current?.(live.id, {
            startMin: live.currentStartMin,
            endMin: live.currentEndMin,
          });
        });
      }
    };

    const applyEndpointPreview = (d: NonNullable<typeof drag>, dy: number, scrollDelta: number) => {
      if (!d.endpoint) return d;
      const deltaMin = Math.round((dy + scrollDelta) / ROW_HEIGHT) * 30;
      let previewStartMin = d.originStartMin;
      let previewEndMin = d.originEndMin;
      if (d.endpoint === "start") {
        previewStartMin = Math.max(
          minStart,
          Math.min(d.originStartMin + deltaMin, d.originEndMin - minDur),
        );
      } else {
        previewEndMin = Math.min(
          maxEnd,
          Math.max(d.originEndMin + deltaMin, d.originStartMin + minDur),
        );
      }
      return { ...d, previewStartMin, previewEndMin };
    };

    const placeDragTile = (
      d: NonNullable<typeof drag>,
      el: HTMLElement | null,
      dx: number,
      dy: number,
      scrollDeltaX: number,
      scrollDeltaY: number,
    ) => {
      const grab = dragGrabRef.current;
      const scrolling = Math.abs(scrollDeltaX) > 0.5 || weekPulse.isPulsing();
      const live = dragRef.current;
      // Lock once, after the tile has expanded to the column. Subtract the
      // scroll that has already happened so later paging does not shift the grab.
      if (!grab.locked && el && live?.moved) {
        const prevTransform = el.style.transform;
        el.style.transform = "none";
        const rect = el.getBoundingClientRect();
        el.style.transform = prevTransform;
        grab.x = d.pointerStart.x - rect.left - scrollDeltaX;
        grab.y = d.pointerStart.y - rect.top - scrollDeltaY;
        grab.w = rect.width;
        grab.h = rect.height;
        grab.locked = true;
      }
      if (lastPtr.has) {
        dragPointerRef.current = { x: lastPtr.x, y: lastPtr.y, has: true };
      }
      if (!scrolling && !dragFloatRef.current) {
        if (el) {
          el.style.visibility = "";
          el.style.willChange = "transform";
          el.style.transform = `translate3d(${dx + scrollDeltaX}px, ${dy + scrollDeltaY}px, 0)`;
        }
        return;
      }
      let floatEl = dragFloatRef.current;
      if (!floatEl && el) {
        floatEl = el.cloneNode(true) as HTMLElement;
        floatEl.removeAttribute("data-event-id");
        floatEl.removeAttribute("data-real-event");
        floatEl.style.position = "fixed";
        floatEl.style.width = `${el.offsetWidth || grab.w}px`;
        floatEl.style.height = `${el.offsetHeight || grab.h}px`;
        floatEl.style.right = "auto";
        floatEl.style.bottom = "auto";
        floatEl.style.margin = "0";
        floatEl.style.transform = "none";
        floatEl.style.visibility = "visible";
        floatEl.style.pointerEvents = "none";
        floatEl.style.zIndex = "10000";
        document.body.appendChild(floatEl);
        dragFloatRef.current = floatEl;
      }
      if (el) el.style.visibility = "hidden";
      if (floatEl && lastPtr.has) {
        floatEl.style.left = `${lastPtr.x - grab.x}px`;
        floatEl.style.top = `${lastPtr.y - grab.y}px`;
      }
    };

    const applyDragFromLastPtr = () => {
      const d = dragRef.current;
      if (!d || gestureKindRef.current !== "drag") return;
      const pulsing = weekPulse.isPulsing();
      const dx = lastPtr.x - d.pointerStart.x;
      const dy = mappedPointerY(lastPtr.y) - d.pointerStart.y;
      const scrollDelta =
        (scrollerRef?.current?.scrollTop ?? 0) - gestureScrollOriginRef.current;
      if (d.endpoint) {
        if (!d.moved || pulsing) return;
        const next = applyEndpointPreview({ ...d, delta: { dx, dy } }, dy, scrollDelta);
        dragRef.current = next;
        setDrag(next);
        return;
      }
      let el = dragElRef.current;
      if (!el?.isConnected) {
        const rail = document.querySelector<HTMLElement>(
          `[data-week-rail="${d.originColIdx}"]`,
        );
        el =
          rail?.querySelector<HTMLElement>(
            `[data-real-event="1"][data-event-id="${CSS.escape(d.id)}"]`,
          ) ?? null;
        dragElRef.current = el;
      }
      const scrollDeltaX =
        (scrollerRef?.current?.scrollLeft ?? 0) - gestureScrollLeftOriginRef.current;
      placeDragTile(d, el, dx, dy, scrollDeltaX, scrollDelta);
      if (!d.moved) return;
      const next = { ...d, delta: { dx, dy } };
      dragRef.current = next;
      // The week glide does not emit pointer moves. Keep the drop outline on
      // the column under the pointer while that week scrolls past.
      commitDragSnap(computeDragSnap(next));
    };

    const tickEdge = (ts: number) => {
      edgeRaf = 0;
      const kind = gestureKindRef.current;
      if (kind !== "drag" && kind !== "resize") return;
      const dt = lastTs ? Math.min(32, ts - lastTs) : 16;
      lastTs = ts;
      applyEdgeFromLastPtr(0, dt);
      applyHorizontalFromLastPtr();
      if (kind === "resize") applyResizeFromLastPtr();
      else applyDragFromLastPtr();
      const scroller = scrollerRef?.current;
      const needY =
        !!scroller &&
        lastPtr.has &&
        pointerInTimedGridScrollEdge(scroller, lastPtr.y, edgeScrollRowHeight);
      if (needY) edgeRaf = requestAnimationFrame(tickEdge);
    };

    const scheduleDragSnap = () => {
      if (dragSnapRafRef.current != null) return;
      dragSnapRafRef.current = requestAnimationFrame(() => {
        dragSnapRafRef.current = null;
        const current = dragRef.current;
        if (!current?.moved || gestureKindRef.current !== "drag") return;
        commitDragSnap(computeDragSnap(current));
      });
    };

    const onMove = (e: PointerEvent) => {
      if (dragEpochRef.current === releasedEpoch) return;
      const kind = gestureKindRef.current;
      if (kind !== "drag" && kind !== "resize") return;
      const first = !lastPtr.has;
      lastPtr.x = e.clientX;
      lastPtr.y = e.clientY;
      lastPtr.has = true;
      if (first) {
        stickyY = createStickyViewportPointer();
      }
      const scroller = scrollerRef?.current;
      if (scroller && !first) {
        noteEdgeScrollMovement(
          edgeGesture,
          e.movementY,
          lastPtr.y,
          scroller,
          edgeScrollRowHeight,
        );
      }
      if (!first) {
        applyEdgeFromLastPtr(e.movementY, 16);
        applyHorizontalFromLastPtr();
      }
      const needY =
        !!scroller && pointerInTimedGridScrollEdge(scroller, lastPtr.y, edgeScrollRowHeight);
      if (scroller && !edgeRaf && needY) {
        lastTs = 0;
        edgeRaf = requestAnimationFrame(tickEdge);
      }

      if (kind === "resize") {
        applyResizeFromLastPtr();
        return;
      }

      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.pointerStart.x;
      const dy = mappedPointerY(e.clientY) - d.pointerStart.y;
      const moved =
        d.moved || Math.abs(dx) > TILE_DRAG_THRESHOLD_PX || Math.abs(dy) > TILE_DRAG_THRESHOLD_PX;
      if (!moved) return;
      const scrollDelta =
        (scrollerRef?.current?.scrollTop ?? 0) - gestureScrollOriginRef.current;
      if (d.endpoint) {
        if (!d.moved) {
          onEventDragStartRef.current?.(d.id);
          onEdgeScrollGesture?.(true);
        }
        const next = applyEndpointPreview(
          { ...d, moved: true, delta: { dx, dy } },
          dy,
          scrollDelta,
        );
        dragRef.current = next;
        setDrag(next);
        return;
      }
      if (!d.moved) {
        onEventDragStartRef.current?.(d.id);
        onEdgeScrollGesture?.(true);
        const next = { ...d, moved: true, delta: { dx, dy } };
        dragRef.current = next;
        setDrag(next);
        commitDragSnap(computeDragSnap(next));
        // Overlapping tiles are narrow; expand the dragged tile to full
        // column width immediately so the grab matches a solo session.
        const grabEl = dragElRef.current;
        if (grabEl) {
          grabEl.style.left = "2px";
          grabEl.style.right = "2px";
          grabEl.style.width = "auto";
          grabEl.style.zIndex = "9999";
          const rail = grabEl.parentElement;
          if (rail) rail.style.zIndex = "9999";
        }
      } else {
        dragRef.current = { ...d, delta: { dx, dy } };
        scheduleDragSnap();
      }
      const el = dragElRef.current;
      const scrollDeltaX =
        (scrollerRef?.current?.scrollLeft ?? 0) - gestureScrollLeftOriginRef.current;
      placeDragTile(d, el, dx, dy, scrollDeltaX, scrollDelta);
    };

    const onUp = () => {
      if (dragEpochRef.current === releasedEpoch) return;
      releasedEpoch = dragEpochRef.current;
      if (edgeRaf) {
        cancelAnimationFrame(edgeRaf);
        edgeRaf = 0;
      }
      lastPtr.has = false;
      onEdgeScrollGesture?.(false);
      const kind = gestureKindRef.current;

      if (kind === "resize") {
        const r = resizeRef.current;
        const changed =
          !!r &&
          (r.currentStartMin !== r.originStartMin ||
            r.currentEndMin !== r.originEndMin);
        if (changed && r) {
          flushSync(() => {
            onResizeCommitRef.current?.(r.id, {
              startMin: r.currentStartMin,
              endMin: r.currentEndMin,
            });
          });
        }
        // Re-arm on release so the trailing click is still swallowed even if
        // the begin-arm timer already fired on a long drag.
        armSuppressClickAfterTileGesture();
        if (resizeLiveRafRef.current != null) {
          cancelAnimationFrame(resizeLiveRafRef.current);
          resizeLiveRafRef.current = null;
        }
        resizeElRef.current = null;
        resizeRef.current = null;
        setResize(null);
        gestureKindRef.current = null;
        onResizeEndRef.current?.();
        return;
      }

      if (kind === "drag") {
        weekPulse.leave();
        const commitDrag = () => {
        const d = dragRef.current;
        const h = scrollerRef?.current;
        const dayW = dayColumnWidthRef.current;
        if (dayW > 0 && h && d?.moved && !d.endpoint) {
          const max = Math.max(0, h.scrollWidth - h.clientWidth);
          const snapped = snapScrollLeft(h.scrollLeft, dayW, max);
          if (Math.abs(snapped - h.scrollLeft) > 0.5) h.scrollLeft = snapped;
        }
        if (d?.moved && d.endpoint) {
          const delta =
            d.endpoint === "start"
              ? d.previewStartMin - d.originStartMin
              : d.previewEndMin - d.originEndMin;
          const startMin =
            d.endpoint === "start"
              ? Math.max(0, Math.min(24 * 60 - 15, d.clockStartMin + delta))
              : d.clockStartMin;
          const endMin =
            d.endpoint === "end"
              ? Math.max(15, Math.min(24 * 60, d.clockEndMin + delta))
              : d.clockEndMin;
          const evStart = fromISOLocal(d.eventStartISO);
          const evEnd = fromISOLocal(d.eventEndISO);
          const range = isoFromMenuClocks(
            evStart,
            sessionInclusiveEndDay(evStart, evEnd),
            startMin,
            endMin,
          );
          const el = dragElRef.current;
          if (el) {
            el.style.transform = "";
            el.style.willChange = "";
          }
          onEventDropRef.current(
            d.id,
            evStart,
            startMin,
            d.durationMin,
            el ?? d.anchor ?? undefined,
            range,
          );
          armSuppressClickAfterTileGesture();
        } else if (d?.moved) {
          const scrolledX =
            Math.abs((h?.scrollLeft ?? 0) - gestureScrollLeftOriginRef.current) > 0.5;
          const snap = scrolledX
            ? computeDragSnap(d)
            : (dragSnapRef.current ?? computeDragSnap(d));
          const dates = weekDatesRef.current;
          const el = dragElRef.current;
          if (el) {
            el.style.transform = "";
            el.style.willChange = "";
          }
          let dropDate = dates[snap.colIdx];
          let dropStartMin = snap.startMin;
          if (d.shiftWholeEvent) {
            const dayDelta = calendarDayDelta(dates[d.originColIdx], dates[snap.colIdx]);
            const minuteDelta = snap.startMin - d.originStartMin;
            const shifted = addMinutes(
              addDays(fromISOLocal(d.eventStartISO), dayDelta),
              minuteDelta,
            );
            dropDate = shifted;
            dropStartMin = shifted.getHours() * 60 + shifted.getMinutes();
          }
          onEventDropRef.current(
            d.id,
            dropDate,
            dropStartMin,
            snap.durationMin,
            el ?? d.anchor ?? undefined,
          );
          // Day view (one column) always releases on the same tile; the
          // trailing click would reset map/sign-up after reopen.
          armSuppressClickAfterTileGesture();
        }
        clearDragVisual();
        dragRef.current = null;
        setDrag(null);
        gestureKindRef.current = null;
        };
        if (weekPulse.isPulsing()) {
          weekTileEndRef.current = commitDrag;
          return;
        }
        commitDrag();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (edgeRaf) cancelAnimationFrame(edgeRaf);
      weekPulse.stop();
      dragFloatRef.current?.remove();
      dragFloatRef.current = null;
      if (resizeLiveRafRef.current != null) {
        cancelAnimationFrame(resizeLiveRafRef.current);
        resizeLiveRafRef.current = null;
      }
      if (gestureKindRef.current === "resize") {
        gestureKindRef.current = null;
        onResizeEndRef.current?.();
      }
    };
  }, [
    armSuppressClickAfterTileGesture,
    clearDragVisual,
    startHour,
    spanHours,
    stackMode,
    scrollerRef,
    syncScrollerBounds,
    edgeScrollRowHeight,
    onEdgeScrollGesture,
  ]);

  useLayoutEffect(() => {
    const d = dragRef.current;
    if (!d?.moved || d.endpoint) return;
    let el = dragElRef.current;
    if (!el?.isConnected) {
      const rail = document.querySelector<HTMLElement>(
        `[data-week-rail="${d.originColIdx}"]`,
      );
      el =
        rail?.querySelector<HTMLElement>(
          `[data-real-event="1"][data-event-id="${CSS.escape(d.id)}"]`,
        ) ?? null;
      dragElRef.current = el;
    }
    const ptr = dragPointerRef.current;
    const floatEl = dragFloatRef.current;
    if (floatEl && ptr.has) {
      const grab = dragGrabRef.current;
      floatEl.style.left = `${ptr.x - grab.x}px`;
      floatEl.style.top = `${ptr.y - grab.y}px`;
      if (el) el.style.visibility = "hidden";
      return;
    }
    if (!el) return;
    const scrollDeltaX =
      (scrollerRef?.current?.scrollLeft ?? 0) - gestureScrollLeftOriginRef.current;
    const scrollDeltaY =
      (scrollerRef?.current?.scrollTop ?? 0) - gestureScrollOriginRef.current;
    el.style.willChange = "transform";
    el.style.transform = `translate3d(${d.delta.dx + scrollDeltaX}px, ${d.delta.dy + scrollDeltaY}px, 0)`;
  }, [drag, dragSnap, renderColStart, renderColEnd, scrollerRef]);

  // Stack (hide-time) week/day: month-like cross-day drag with floating clone
  // + target ghost slot. Timed layout keeps the existing transform drag above.
  useEffect(() => {
    if (!stackMode || appKind !== "calendar") return;

    const resolveTargetCol = (clientX: number, clientY: number): number | null => {
      const dates = weekDatesRef.current;
      for (let i = 0; i < dates.length; i++) {
        const col = document.querySelector<HTMLElement>(`[data-month-col="${i}"]`);
        if (!col) continue;
        const r = col.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return i;
        }
      }
      // Fallback: nearest column by X when pointer is between columns / below.
      let best: number | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < dates.length; i++) {
        const col = document.querySelector<HTMLElement>(`[data-month-col="${i}"]`);
        if (!col) continue;
        const r = col.getBoundingClientRect();
        const cx = (r.left + r.right) / 2;
        const dist = Math.abs(clientX - cx);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    };

    const stackEndRef = { current: null as (() => void) | null };
    const ptr = { x: 0, y: 0 };
    let dropFrozen = false;
    let frozenCol: number | null = null;
    let publishedCol: number | null = null;
    const publishTarget = (col: number | null) => {
      if (col == null || publishedCol === col) return;
      publishedCol = col;
      const active = stackDragRef.current;
      if (active) active.targetColIdx = col;
      setStackDrag((prev) => (prev && prev.targetColIdx !== col ? { ...prev, targetColIdx: col } : prev));
    };
    const stackPulse = (beginWeekEdgePulse ?? (() => inertWeekEdgePulse()))(
      () => {
        if (dropFrozen) return;
        const active = stackDragRef.current;
        if (!active) return;
        const ghost = stackGhostElRef.current;
        if (ghost) {
          ghost.style.left = `${ptr.x - active.offsetX}px`;
          ghost.style.top = `${ptr.y - active.offsetY}px`;
        }
        publishTarget(resolveTargetCol(ptr.x, ptr.y));
      },
      () => {
        const end = stackEndRef.current;
        stackEndRef.current = null;
        end?.();
      },
    );
    const scheduleTargetUpdate = () => {
      if (stackHitRafRef.current != null) return;
      stackHitRafRef.current = requestAnimationFrame(() => {
        stackHitRafRef.current = null;
        const active = stackDragRef.current;
        const start = stackDragStartRef.current;
        if (!active || !start || dropFrozen) return;
        publishTarget(resolveTargetCol(ptr.x, ptr.y));
      });
    };

    let releasedEpoch = -1;
    const onMove = (e: PointerEvent) => {
      if (dragEpochRef.current === releasedEpoch) return;
      const start = stackDragStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const active = stackDragRef.current;
      if (!active && Math.hypot(dx, dy) < 4) return;

      ptr.x = e.clientX;
      ptr.y = e.clientY;
      stackLivePointerRef.current = { x: e.clientX, y: e.clientY, active: true };
      if (active) {
        active.pointerX = e.clientX;
        active.pointerY = e.clientY;
      }

      suppressStackClickRef.current = true;
      const ghost = stackGhostElRef.current;
      if (ghost) {
        ghost.style.left = `${e.clientX - start.offsetX}px`;
        ghost.style.top = `${e.clientY - start.offsetY}px`;
      }

      if (!active) {
        onEventDragStartRef.current?.(start.eventId);
        const targetColIdx = resolveTargetCol(e.clientX, e.clientY);
        setStackDrag({
          eventId: start.eventId,
          event: start.event,
          originColIdx: start.originColIdx,
          startMin: start.startMin,
          durationMin: start.durationMin,
          targetColIdx,
          pointerX: e.clientX,
          pointerY: e.clientY,
          offsetX: start.offsetX,
          offsetY: start.offsetY,
          chipWidth: start.chipWidth,
          chipHeight: start.chipHeight,
          eventStartISO: start.eventStartISO,
          multiDay: start.multiDay,
        });
        return;
      }

      if (stackPulse.isPulsing()) {
        if (dayColumnWidthRef.current > 0) stackPulse.over(e.clientX);
        return;
      }

      setStackDrag((prev) =>
        prev ? { ...prev, pointerX: e.clientX, pointerY: e.clientY } : prev,
      );
      if (dayColumnWidthRef.current > 0) stackPulse.over(e.clientX);
      scheduleTargetUpdate();
    };

    const onUp = () => {
      if (dragEpochRef.current === releasedEpoch) return;
      releasedEpoch = dragEpochRef.current;
      const active = stackDragRef.current;
      frozenCol = active ? resolveTargetCol(ptr.x, ptr.y) : null;
      if (active && frozenCol != null) {
        active.targetColIdx = frozenCol;
        setStackDrag((prev) => (prev ? { ...prev, targetColIdx: frozenCol } : prev));
      }
      dropFrozen = true;
      stackPulse.leave();
      const finish = () => {
      const h = scrollerRef?.current;
      const dayW = dayColumnWidthRef.current;
      if (dayW > 0 && h && stackDragRef.current) {
        const max = Math.max(0, h.scrollWidth - h.clientWidth);
        const snapped = snapScrollLeft(h.scrollLeft, dayW, max);
        if (Math.abs(snapped - h.scrollLeft) > 0.5) h.scrollLeft = snapped;
      }
      const drag = stackDragRef.current;
      stackDragStartRef.current = null;
      stackLivePointerRef.current.active = false;
      if (stackHitRafRef.current != null) {
        cancelAnimationFrame(stackHitRafRef.current);
        stackHitRafRef.current = null;
      }
      stackGhostElRef.current = null;
      if (!drag) {
        setStackPressedId(null);
        return;
      }

      const dates = weekDatesRef.current;
      const resolved =
        frozenCol != null && frozenCol >= 0 && frozenCol < dates.length
          ? frozenCol
          : drag.targetColIdx != null &&
              drag.targetColIdx >= 0 &&
              drag.targetColIdx < dates.length
            ? drag.targetColIdx
            : drag.originColIdx;
      const targetCol = resolved;
      // Always notify drop — including same-day (day view is one column).
      // onEventDrop skips the time patch when nothing changed, then reopens
      // the editor so map/sign-up restore from sessionSidePanelsRef.
      flushSync(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-event-id="${drag.eventId.replace(/"/g, '\\"')}"]`,
        );
        let dropDate = dates[targetCol];
        let dropStartMin = drag.startMin;
        if (drag.multiDay) {
          const dayDelta = calendarDayDelta(dates[drag.originColIdx], dates[targetCol]);
          const shifted = addDays(fromISOLocal(drag.eventStartISO), dayDelta);
          dropDate = shifted;
          dropStartMin = shifted.getHours() * 60 + shifted.getMinutes();
        }
        onEventDropRef.current(
          drag.eventId,
          dropDate,
          dropStartMin,
          drag.durationMin,
          el ?? undefined,
        );
        setStackDrag(null);
        setStackPressedId(null);
      });
      armSuppressClickAfterTileGesture();
      };
      if (stackPulse.isPulsing()) {
        stackEndRef.current = finish;
        return;
      }
      finish();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stackPulse.stop();
    };
  }, [stackMode, appKind, armSuppressClickAfterTileGesture, scrollerRef]);

  // Group events by day column. Timed layout includes any session that
  // overlaps the visible hour window (a 00:00–24:00 session still paints
  // from 06:00). All-day and multi-day sessions stay in the band above.
  const windowStart = startHour * 60;
  const windowEnd = windowStart + spanHours * 60;
  const byCol = useMemo(() => {
    const arr: Array<
      Array<{
        ev: CalendarEvent;
        startMin: number;
        endMin: number;
        segmentKind: "start" | "middle" | "last" | "single" | "allDay";
      }>
    > = Array.from(
      { length: weekDates.length },
      () => [],
    );
    for (const ev of events) {
      if (appKind !== "diary" && isAllDayBandEvent(ev)) continue;
      const start = fromISOLocal(ev.startISO);
      const end = fromISOLocal(ev.endISO);
      for (let idx = 0; idx < weekDates.length; idx++) {
        const d = weekDates[idx];
        if (ev.allDay) {
          if (!eventCoversDay(start, end, d)) continue;
          arr[idx].push({
            ev,
            startMin: windowStart,
            endMin: windowEnd,
            segmentKind: "allDay" as const,
          });
          continue;
        }
        const seg = segmentTimedEventForDay(start, end, d);
        if (!seg) continue;
        if (!stackMode) {
          if (seg.endMin <= windowStart || seg.startMin >= windowEnd) continue;
        }
        arr[idx].push({
          ev,
          startMin: seg.startMin,
          endMin: seg.endMin,
          segmentKind: seg.kind,
        });
      }
    }
    if (stackMode) {
      for (const list of arr) {
        list.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
      }
    }
    return arr;
  }, [events, weekDates, windowStart, windowEnd, stackMode, appKind]);

  return (
    <>
          {byCol.map((list, colIdx) => {
        if (
          (colIdx < renderColStart || colIdx > renderColEnd) &&
          drag?.originColIdx !== colIdx
        ) {
          return null;
        }
        const liveList = list.map(({ ev, startMin, endMin }) => {
          const resizing = !stackMode && resize?.id === ev.id;
          return {
            ev,
            startMin: resizing ? resize!.currentStartMin : startMin,
            endMin: resizing ? resize!.currentEndMin : endMin,
          };
        });
        const firstRank = 2;
        const lastRank = spanHours * 2 + 1;
        const colMark =
          !stackMode &&
          markPreview &&
          (markPreview.endMonth ?? markPreview.month) === markPreview.month
            ? markRangeForColumn(markPreview, colIdx, firstRank, lastRank)
            : null;
        const markPreviewStartMin =
          colMark != null ? startHour * 60 + (colMark.lo - 2) * 30 : null;
        const markPreviewEndMin =
          colMark != null ? startHour * 60 + (colMark.hi - 2 + 1) * 30 : null;
        const draggingId = !stackMode && drag?.moved ? drag.id : null;
        const baseLayoutEvents = liveList
          .filter(({ ev }) => ev.id !== draggingId)
          .map(({ ev, startMin, endMin }) => ({
            id: ev.id,
            startMin,
            endMin,
            sortIndex: overlapRecency(ev.sortIndex),
          }));
        const dragSnapInCol =
          !stackMode && dragSnap && drag?.moved && dragSnap.colIdx === colIdx ? dragSnap : null;
        const newcomerEvents = [
          ...(markPreviewStartMin != null && markPreviewEndMin != null
            ? [
                {
                  id: "__mark-preview__",
                  startMin: markPreviewStartMin,
                  endMin: markPreviewEndMin,
                  sortIndex: NEWCOMER_SORT_INDEX,
                },
              ]
            : []),
          ...(dragSnapInCol
            ? [
                {
                  id: "__drag-snap__",
                  startMin: dragSnapInCol.startMin,
                  endMin: dragSnapInCol.startMin + dragSnapInCol.durationMin,
                  sortIndex: NEWCOMER_SORT_INDEX,
                },
              ]
            : []),
          ...(!stackMode &&
          bandDropPreview &&
          bandDropPreview.colIdx === colIdx
            ? [
                {
                  id: "__band-drop__",
                  startMin: bandDropPreview.startMin,
                  endMin: bandDropPreview.startMin + 30,
                  sortIndex: NEWCOMER_SORT_INDEX,
                },
              ]
            : []),
        ];
        const overlapLayout = !stackMode
          ? layoutTimedOverlaps([...baseLayoutEvents, ...newcomerEvents])
          : null;
        const markPreviewPlace = overlapLayout?.get("__mark-preview__");
        return (
        <div
          key={`week-rail-${colIdx}`}
          data-week-rail={colIdx}
          data-day-anchor={stackMode ? "" : undefined}
          style={{
            gridColumnStart: colIdx + gridColumnOffset,
            gridColumnEnd: colIdx + gridColumnOffset + 1,
            gridRowStart: 1,
            gridRowEnd: spanHours + 1,
            position: "relative",
            pointerEvents: "none",
            // Raise the origin column while dragging. The moving tile stays in
            // this stacking context; lifting the snap target instead puts that
            // day's sessions on top of an older dragged tile.
            zIndex:
              drag?.moved && drag.originColIdx === colIdx
                ? 9999
                : !stackMode && bandDropPreview?.colIdx === colIdx
                  ? 30
                  : 8,
          }}
        >
          {!stackMode &&
            appKind === "calendar" &&
            bandDropPreview?.colIdx === colIdx &&
            (() => {
              const top = ((bandDropPreview.startMin - startHour * 60) / 30) * ROW_HEIGHT;
              const place = overlapLayout?.get("__band-drop__");
              const box = place
                ? timedOverlapTileBox(place)
                : { left: 2, right: 2, width: "auto" as const };
              const chrome = sessionTileChrome(bandDropPreview.color, false);
              const placeholderBg = bandDropPreview.color
                ? sessionWeekDayTileFill(bandDropPreview.color, false, darkTiles)
                : "hsl(var(--primary) / 0.15)";
              return (
                <>
                  <div
                    aria-hidden
                    data-role="band-drop-placeholder"
                    className="absolute select-none overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] ring-1 ring-black/5"
                    style={{
                      ...box,
                      top,
                      height: ROW_HEIGHT,
                      background: placeholderBg,
                      color: chrome.fg,
                      opacity: 0.4,
                      pointerEvents: "none",
                      zIndex: 1,
                    }}
                  >
                    <span
                      className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                      style={{ background: chrome.bar }}
                    />
                    <div className="flex h-full flex-col justify-start pl-1 pt-0.5 leading-tight">
                      <span className="truncate text-[12px] font-semibold">
                        {bandDropPreview.title || "New session"}
                      </span>
                    </div>
                  </div>
                  <div
                    aria-hidden
                    data-role="band-drop-preview"
                    className="absolute rounded-[3px] border-2 border-solid border-black/40"
                    style={{
                      ...box,
                      top,
                      height: ROW_HEIGHT,
                      background: "transparent",
                      borderColor: bandDropPreview.color ? `${bandDropPreview.color}CC` : undefined,
                      pointerEvents: "none",
                      zIndex: 30,
                    }}
                  />
                </>
              );
            })()}
          {stackDrag &&
            stackDrag.targetColIdx === colIdx &&
            stackDrag.targetColIdx !== stackDrag.originColIdx && (
              <div
                aria-hidden
                data-role="ghost-move"
                className="pointer-events-none absolute rounded-[3px] border-2 border-solid border-black/40"
                style={{
                  left: 2,
                  right: 2,
                  top: STACK_PAD,
                  height: STACK_TILE_H,
                  background: "transparent",
                  borderColor: stackDrag.event.color ? `${stackDrag.event.color}CC` : undefined,
                  zIndex: 1,
                }}
              />
            )}
          {colMark &&
            appKind === "calendar" &&
            (() => {
              const startMin = startHour * 60 + (colMark.lo - 2) * 30;
              const endMin = startHour * 60 + (colMark.hi - 2 + 1) * 30;
              const since = startMin - startHour * 60;
              const dur = Math.max(30, endMin - startMin);
              const top = (since / 30) * ROW_HEIGHT;
              const height = (dur / 30) * ROW_HEIGHT;
              const chrome = sessionTileChrome(getSessionDefaultColor());
              const markFill = sessionWeekDayTileFill(getSessionDefaultColor(), false, darkTiles);
              const pad = (m: number) =>
                `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
              return (
                <div
                  aria-hidden
                  data-role="mark-create-preview"
                  className="absolute select-none overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] ring-1 ring-black/5 shadow-[0_1px_2px_0_rgba(0,0,0,0.08),0_-1px_2px_0_rgba(0,0,0,0.08)]"
                  style={{
                    ...(markPreviewPlace
                      ? timedOverlapTileBox(markPreviewPlace)
                      : { left: 2, right: 2, width: "auto" }),
                    top,
                    height,
                    background: markFill,
                    color: chrome.fg,
                    pointerEvents: "none",
                    zIndex: 20,
                  }}
                >
                  <span
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                    style={{ background: chrome.bar }}
                  />
                  <div className="flex h-full flex-col justify-start pl-1 pt-0.5 leading-tight">
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-[12px] font-semibold">New session</span>
                    </div>
                    {dur > 45 && (
                      <span
                        className="truncate text-[10.5px] font-medium tabular-nums opacity-70"
                        style={{
                          fontFamily:
                            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        }}
                      >
                        {`${pad(startMin)} – ${pad(endMin)}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          {list.map(({ ev, startMin, endMin, segmentKind }, stackIdx) => {
            const isResizing = !stackMode && resize?.id === ev.id;
            const endpointDrag =
              !stackMode && drag?.id === ev.id && drag.moved && drag.endpoint ? drag : null;
            const liveStart = endpointDrag
              ? endpointDrag.previewStartMin
              : isResizing
                ? resize!.currentStartMin
                : startMin;
            const liveEnd = endpointDrag
              ? endpointDrag.previewEndMin
              : isResizing
                ? resize!.currentEndMin
                : endMin;
            const visStart = stackMode ? liveStart : Math.max(liveStart, windowStart);
            const visEnd = stackMode ? liveEnd : Math.min(liveEnd, windowEnd);
            const since = visStart - startHour * 60;
            const dur = Math.max(15, liveEnd - liveStart);
            const visDur = Math.max(15, visEnd - visStart);
            const startsBeforeWindow = !stackMode && liveStart < windowStart;
            const endsAfterWindow = !stackMode && liveEnd > windowEnd;
            // Month calendar: drop preview stays pinned at the top of the day.
            const showStackGhost =
              !!stackDrag &&
              stackDrag.targetColIdx === colIdx &&
              stackDrag.targetColIdx !== stackDrag.originColIdx;
            const stackSlotOffset = showStackGhost ? 1 : 0;
            const top = stackMode
              ? STACK_PAD + (stackIdx + stackSlotOffset) * (STACK_TILE_H + STACK_TILE_GAP)
              : (since / 30) * ROW_HEIGHT;
            const height = stackMode ? STACK_TILE_H : (visDur / 30) * ROW_HEIGHT;
            const isDragging = !stackMode && drag?.id === ev.id && drag.moved && !drag.endpoint;
            const isStackDragging = !!stackDrag && stackDrag.eventId === ev.id;
            const accent = ev.color ?? "hsl(var(--primary))";
            const isEditing =
              (lockedId ?? forceEditId) === ev.id ||
              activeEventId === ev.id ||
              isDragging ||
              isResizing ||
              !!endpointDrag;
            const isSearchHighlight = searchSelectedId === ev.id && !isEditing;
            const isActive = isEditing || isSearchHighlight || !!markedEventIds?.has(ev.id);
            const canResize =
              !stackMode &&
              appKind !== "diary" &&
              viewerRole === "owner" &&
              isEditing &&
              !isMembershipOverlayEvent(ev, calId) &&
              sameDay(fromISOLocal(ev.startISO), weekDates[colIdx]) &&
              !isMultiDaySession(
                fromISOLocal(ev.startISO),
                fromISOLocal(ev.endISO),
              );
            const isRepeatPreview = isRepeatPreviewEventId(ev.id);
            const place = overlapLayout?.get(ev.id);
            const chrome = sessionTileChrome(ev.color, isActive);
            const teamSession = isMembershipOverlayEvent(ev, calId);
            const teamPaint = teamSession
              ? teamMemberTilePaint(
                  ev.color,
                  isActive,
                  signupResponse(ev.signUpEnabled, teamResponses, ev.id),
                  darkTiles,
                )
              : null;
            const bg = teamPaint
              ? teamPaint.fill
              : ev.color
                ? sessionWeekDayTileFill(ev.color, isActive, darkTiles)
                : "hsl(var(--primary) / 0.15)";
            const fg = teamPaint
              ? teamPaint.fg
              : ev.color
                ? chrome.fg
                : "hsl(var(--ink, 220 13% 13%))";
            const bar = teamPaint ? teamPaint.bar : chrome.bar;
            const Icon = iconForColor(ev.color);
            const placeholderFill = ev.color
              ? sessionWeekDayTileFill(ev.color, false, darkTiles)
              : "hsl(var(--primary) / 0.15)";
            const placeholderBg = teamSession
              ? teamMemberTilePaint(
                  ev.color,
                  false,
                  signupResponse(ev.signUpEnabled, teamResponses, ev.id),
                  darkTiles,
                ).fill
              : placeholderFill;
            const originGhost = (() => {
              if (isDragging && drag && drag.originColIdx === colIdx) {
                return {
                  startMin: drag.originStartMin,
                  durationMin: drag.durationMin,
                };
              }
              if (isResizing && resize && resize.originColIdx === colIdx) {
                return {
                  startMin: resize.originStartMin,
                  durationMin: Math.max(
                    15,
                    resize.originEndMin - resize.originStartMin,
                  ),
                };
              }
              return null;
            })();
            const originTop = originGhost
              ? ((originGhost.startMin - startHour * 60) / 30) * ROW_HEIGHT
              : 0;
            const originHeight = originGhost
              ? (originGhost.durationMin / 30) * ROW_HEIGHT
              : 0;
            const originEndMin = originGhost
              ? originGhost.startMin + originGhost.durationMin
              : 0;
            const originTimeStr = originGhost
              ? `${String(Math.floor(originGhost.startMin / 60)).padStart(2, "0")}:${String(originGhost.startMin % 60).padStart(2, "0")} – ${String(Math.floor(originEndMin / 60)).padStart(2, "0")}:${String(originEndMin % 60).padStart(2, "0")}`
              : "";
            return (
              <React.Fragment key={ev.id}>
              {originGhost && (
                <div
                  aria-hidden
                  className="absolute select-none overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] ring-1 ring-black/5"
                  style={{
                    left: 2,
                    right: 2,
                    top: originTop,
                    height: originHeight,
                    background: placeholderBg,
                    color: "#fff",
                    opacity: 0.4,
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                >
                  <span
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                    style={{ background: chrome.bar }}
                  />
                  <div className="flex h-full flex-col justify-start pl-1 pt-0.5 leading-tight">
                    <span className="truncate text-[12px] font-semibold">
                      {ev.title || "New session"}
                    </span>
                    {originGhost.durationMin > 45 && (
                      <span
                        className="truncate text-[10.5px] font-medium tabular-nums opacity-70"
                        style={{
                          fontFamily:
                            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        }}
                      >
                        {originTimeStr}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div
                key={ev.id}
                data-mark-cell="1"
                data-event-id={ev.id}
                data-real-event="1"
                data-coach-pending={ev.coachPending ? "1" : undefined}
                onMouseEnter={(e) => {
                  if (appKind !== "diary") return;
                  if (hoverLocked && (lockedId ?? forceEditId) !== ev.id) return;
                  cancelClose();
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  safeSetHoverId(ev.id);
                  setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                }}
                onMouseLeave={(e) => {
                  if (appKind !== "diary") return;
                  const related = e.relatedTarget as Node | null;
                  const goingIntoMenu =
                    related instanceof HTMLElement &&
                    related.closest('[data-session-hover-menu="1"]');
                  if (goingIntoMenu) return;
                  scheduleClose();
                }}
                onMouseDown={(e) => {
                  // Prevent the mousedown from bubbling to the underlying
                  // cell, which would fire beginMark and start a competing
                  // mark gesture that wipes out the draft tile mid-drag.
                  // pointerdown's stopPropagation doesn't cover the native
                  // mousedown — both must be stopped for the drag (and the
                  // popover's outside-click skip) to work on a draft tile.
                  if (appKind === "diary") return;
                  e.stopPropagation();
                }}
                onContextMenu={(e) => {
                  if (!onEventContextMenu) return;
                  if (isRepeatPreview) return;
                  onEventContextMenu(e, ev, e.currentTarget as HTMLElement);
                }}
                onPointerDown={(e) => {
                  if (appKind === "diary") return;
                  if (e.button !== 0) return;
                  if (isRepeatPreview) return;
                  if (stackMode) {
                    e.stopPropagation();
                    // Another session's menu is open: switch to this tile
                    // immediately so it is marked and can be dragged.
                    if (activeEventId && activeEventId !== ev.id) {
                      onEventClick(ev, e.currentTarget as HTMLElement);
                      switchedSessionOnPointerRef.current = true;
                    }
                    if (viewerRole !== "owner" || isMembershipOverlayEvent(ev, calId)) {
                      e.preventDefault();
                      setReadOnlyPressedId(ev.id);
                      return;
                    }
                    if (
                      weekDates.length === 1 &&
                      (segmentKind === "start" ||
                        segmentKind === "middle" ||
                        segmentKind === "last")
                    ) {
                      return;
                    }
                    onClearCellSelectionRef.current?.();
                    dragEpochRef.current += 1;
                    const tileEl = e.currentTarget as HTMLElement;
                    const rect = tileEl.getBoundingClientRect();
                    setStackPressedId(ev.id);
                    suppressStackClickRef.current = false;
                    const realStart = fromISOLocal(ev.startISO);
                    const realEnd = fromISOLocal(ev.endISO);
                    const realStartMin = ev.allDay
                      ? realStart.getHours() * 60 + realStart.getMinutes()
                      : liveStart;
                    const realDur = ev.allDay
                      ? Math.max(
                          30,
                          Math.round((realEnd.getTime() - realStart.getTime()) / 60000),
                        )
                      : dur;
                    stackDragStartRef.current = {
                      x: e.clientX,
                      y: e.clientY,
                      eventId: ev.id,
                      event: ev,
                      originColIdx: colIdx,
                      startMin: realStartMin,
                      durationMin: realDur,
                      offsetX: e.clientX - rect.left,
                      offsetY: e.clientY - rect.top,
                      chipWidth: rect.width,
                      chipHeight: rect.height,
                      eventStartISO: ev.startISO,
                      multiDay:
                        segmentKind === "start" ||
                        segmentKind === "middle" ||
                        segmentKind === "last",
                    };
                    return;
                  }
                  if (
                    e.target instanceof HTMLElement &&
                    e.target.closest("[data-resize-handle]")
                  ) {
                    return;
                  }
                  // Another session's menu is open: switch to this tile
                  // immediately so it is marked and can be dragged.
                  if (activeEventId && activeEventId !== ev.id) {
                    onEventClick(ev, e.currentTarget as HTMLElement);
                    switchedSessionOnPointerRef.current = true;
                  }
                  // Only the owner can drag sessions in calendar week view.
                  // Coaches / group leaders viewing someone else cannot move.
                  if (viewerRole !== "owner" || isMembershipOverlayEvent(ev, calId)) {
                    // Stop the mousedown from bubbling to the window-level
                    // outside-click listener of any open session edit panel,
                    // so the previously-clicked session's panel stays open
                    // when a coach pointer-presses or tries to drag another
                    // tile. Mirrors month-view behavior.
                    e.stopPropagation();
                    e.preventDefault();
                    setReadOnlyPressedId(ev.id);
                    return;
                  }
                  e.stopPropagation();
                  const tileEl = e.currentTarget as HTMLElement;
                  if (weekDates.length === 1 && segmentKind === "middle") return;

                  // Top/bottom edge resize must win over tile-move drag. The
                  // visible handles are thin; this wider hit zone prevents
                  // bottom-edge grabs from starting a move (which snaps the
                  // tile to the column top while duration stays unchanged).
                  if (canResize) {
                    const rect = tileEl.getBoundingClientRect();
                    const y = e.clientY;
                    if (y <= rect.top + RESIZE_EDGE_PX) {
                      beginEdgeResize("top", ev, e, colIdx, liveStart, liveEnd, tileEl);
                      return;
                    }
                    if (y >= rect.bottom - RESIZE_EDGE_PX) {
                      beginEdgeResize("bottom", ev, e, colIdx, liveStart, liveEnd, tileEl);
                      return;
                    }
                  }

                  onClearCellSelectionRef.current?.();
                  dragEpochRef.current += 1;
                  gestureKindRef.current = "drag";
                  dragElRef.current = tileEl;
                  const grabBox = tileEl.getBoundingClientRect();
                  dragGrabRef.current = {
                    x: e.clientX - grabBox.left,
                    y: e.clientY - grabBox.top,
                    w: grabBox.width,
                    h: grabBox.height,
                    locked: false,
                  };
                  dragPointerRef.current = { x: e.clientX, y: e.clientY, has: true };
                  gestureScrollOriginRef.current = scrollerRef?.current?.scrollTop ?? 0;
                  gestureScrollLeftOriginRef.current = scrollerRef?.current?.scrollLeft ?? 0;
                  tileEl.setPointerCapture?.(e.pointerId);
                  const multiSlice =
                    segmentKind === "start" ||
                    segmentKind === "middle" ||
                    segmentKind === "last";
                  const dayEndpoint: "start" | "end" | null =
                    weekDates.length === 1 && segmentKind === "start"
                      ? "start"
                      : weekDates.length === 1 && segmentKind === "last"
                        ? "end"
                        : null;
                  const clocks = dayEndpoint
                    ? sessionMenuClockRange(fromISOLocal(ev.startISO), fromISOLocal(ev.endISO))
                    : null;
                  const fillsWindow = liveEnd - liveStart >= spanHours * 60 - 1;
                  const initialDrag = {
                    id: ev.id,
                    pointerStart: { x: e.clientX, y: e.clientY },
                    originColIdx: colIdx,
                    originStartMin: liveStart,
                    originEndMin: liveEnd,
                    durationMin: visDur,
                    moved: false,
                    delta: { dx: 0, dy: 0 },
                    anchor: tileEl,
                    looseTime: multiSlice && !ev.allDay && !dayEndpoint && !fillsWindow,
                    shiftWholeEvent: multiSlice && !dayEndpoint,
                    eventStartISO: ev.startISO,
                    eventEndISO: ev.endISO,
                    endpoint: dayEndpoint,
                    clockStartMin: clocks?.startMin ?? liveStart,
                    clockEndMin: clocks?.endMin ?? liveEnd,
                    previewStartMin: liveStart,
                    previewEndMin: liveEnd,
                  };
                  dragRef.current = initialDrag;
                  setDrag(initialDrag);
                }}
                onClick={(e) => {
                  if (isRepeatPreview) return;
                  if (appKind === "diary") {
                    e.stopPropagation();
                    if (drag?.moved) return;
                    if (viewerRole === "owner") {
                      cancelClose();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setHoverId(ev.id);
                      setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                      setForceEditId(ev.id);
                    } else {
                      setDetailsEvId(ev.id);
                      setHoverId(null);
                      setHoverRect(null);
                    }
                    return;
                  }
                  if (drag?.moved) return;
                  const switchedOnPress = switchedSessionOnPointerRef.current;
                  switchedSessionOnPointerRef.current = false;
                  if (switchedOnPress) {
                    e.stopPropagation();
                    return;
                  }
                  if (suppressClickAfterTileGestureRef.current) {
                    e.stopPropagation();
                    e.preventDefault();
                    suppressClickAfterTileGestureRef.current = false;
                    if (suppressClickAfterTileGestureTimerRef.current != null) {
                      clearTimeout(suppressClickAfterTileGestureTimerRef.current);
                      suppressClickAfterTileGestureTimerRef.current = null;
                    }
                    return;
                  }
                  if (suppressStackClickRef.current) {
                    suppressStackClickRef.current = false;
                    return;
                  }
                  if (stackDrag) return;
                  e.stopPropagation();
                  onEventClick(ev, e.currentTarget as HTMLElement);
                }}
                className={`absolute select-none overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] ${
                  isSearchHighlight
                    ? ""
                    : "ring-1 ring-black/5 shadow-[0_1px_2px_0_rgba(0,0,0,0.08),0_-1px_2px_0_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.12),0_-2px_4px_0_rgba(0,0,0,0.12)]"
                }`}
                data-session-active={isActive ? "1" : undefined}
                data-search-highlight={isSearchHighlight ? "1" : undefined}
                style={{
                  ...(stackMode || !place || isDragging
                    ? { left: 2, right: 2, width: "auto" }
                    : timedOverlapTileBox(place)),
                  top,
                  height,
                  background: bg,
                  color: fg,
                  // Month calendar: keep the source chip faintly visible while
                  // the floating clone follows the pointer (no empty hole).
                  opacity: isRepeatPreview
                    ? 0.72
                    : isStackDragging
                      ? 0.35
                      : isDragging || isResizing
                        ? 0.85
                        : 1,
                  zIndex: isDragging || isResizing ? 9999 : isActive ? 40 : (place?.col ?? 0) + 1,
                  pointerEvents: isRepeatPreview || isStackDragging ? "none" : "auto",
                }}
                title={ev.title || "New session"}
              >
                <span
                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                  style={{ background: bar }}
                />
                {canResize && (
                  <>
                    {!startsBeforeWindow && (
                    <div
                      role="separator"
                      aria-label="Juster starttid"
                      data-resize-handle="top"
                      onPointerDown={(e) => {
                        beginEdgeResize(
                          "top",
                          ev,
                          e,
                          colIdx,
                          liveStart,
                          liveEnd,
                          (e.currentTarget as HTMLElement).closest<HTMLElement>(
                            "[data-event-id]",
                          )!,
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 right-0 top-0 z-[3] h-3 cursor-ns-resize touch-none"
                    />
                    )}
                    {!endsAfterWindow && (
                    <div
                      role="separator"
                      aria-label="Juster sluttid"
                      data-resize-handle="bottom"
                      onPointerDown={(e) => {
                        beginEdgeResize(
                          "bottom",
                          ev,
                          e,
                          colIdx,
                          liveStart,
                          liveEnd,
                          (e.currentTarget as HTMLElement).closest<HTMLElement>(
                            "[data-event-id]",
                          )!,
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 right-0 bottom-0 z-[3] h-3 cursor-ns-resize touch-none"
                    />
                    )}
                  </>
                )}
                {appKind === "diary" ? (
                  (() => {
                    const actKey = (ev.activity || ev.diarySub || "").toLowerCase();
                    const ActIcon: LucideIcon =
                      actKey === "cycling" || actKey === "bike"
                        ? Bike
                        : actKey === "swimming" || actKey === "swim"
                          ? Waves
                          : actKey === "strength"
                            ? Dumbbell
                            : actKey === "xcskiing"
                              ? Snowflake
                              : Footprints;
                    const durStr = ev.allDay ? "All day" : `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")} – ${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
                    const km = ev.distanceKm;
                    const distVal = km != null ? kmToUnit(km, unit) : null;
                    const isStrength = actKey === "strength";
                    const isNorwegian =
                      typeof navigator !== "undefined" &&
                      /^nb|^nn|^no/i.test(navigator.language || "");
                    const hourSuffix = isNorwegian ? "t" : "h";
                    const totalMin = Math.max(0, endMin - startMin);
                    const durH = Math.floor(totalMin / 60);
                    const durM = totalMin % 60;
                    const strengthLabel = durH > 0 ? `${durH}${hourSuffix} ${durM}m` : `${durM}m`;
                    const distLabel = isStrength
                      ? strengthLabel
                      : distVal != null
                        ? `${distVal.toFixed(1)} ${unitLabel(unit)}`
                        : "—";
                    const iconHalfBg = ev.color
                      ? `color-mix(in srgb, ${ev.color} 40%, white)`
                      : "rgba(0,0,0,0.05)";

                    if (tileDesign === "icon") {
                      return (
                        <div className="flex h-full w-full items-center justify-center pl-1">
                          <ActIcon
                            className="h-5 w-5 shrink-0"
                            strokeWidth={2.25}
                            style={{ color: isActive ? "#fff" : accent }}
                          />
                        </div>
                      );
                    }
                    if (tileDesign === "stacked") {
                      return (
                        <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-[3px]">
                          <div
                            className="flex w-1/2 items-center justify-center"
                            style={{ background: iconHalfBg }}
                          >
                            <ActIcon
                              className="h-5 w-5 shrink-0"
                              strokeWidth={2.25}
                              style={{ color: accent }}
                            />
                          </div>
                          <div
                            className="flex w-1/2 min-w-0 flex-col justify-center px-2 leading-tight"
                            style={{ color: isActive ? "#fff" : undefined }}
                          >
                            <span className="truncate text-[12px] font-semibold">{ev.title}</span>
                            <span className="truncate text-[10.5px] font-medium tabular-nums opacity-70" style={{ fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                              {durStr}
                            </span>
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
                      <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-[3px]">
                        <div
                          className="flex w-1/2 items-center justify-center"
                          style={{ background: iconHalfBg }}
                        >
                          <ActIcon
                            className="h-7 w-7 shrink-0"
                            strokeWidth={2.25}
                            style={{ color: accent }}
                          />
                        </div>
                        <div
                          className={`flex w-1/2 select-none items-center justify-center ${isActive ? "" : "text-ink"}`}
                          title={distLabel}
                          style={{ color: isActive ? "#fff" : undefined }}
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
                                  <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>
                                    {hourSuffix}
                                  </span>
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
                  <div
                    className={`flex h-full min-w-0 pl-1 leading-tight ${
                      stackMode ? "flex-col justify-center" : "flex-col justify-start pt-0.5"
                    }`}
                  >
                    <span className="min-w-0 whitespace-normal break-words text-[12px] font-semibold leading-tight">
                      {ev.title || "New session"}
                    </span>
                    {(stackMode || visDur > 45) && (
                      <span
                        className="min-w-0 whitespace-normal break-words text-[10.5px] font-medium leading-tight tabular-nums opacity-70"
                        style={{
                          fontFamily:
                            'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                        }}
                      >
                        {ev.allDay
                          ? "All day"
                          : `${String(Math.floor(visStart / 60)).padStart(2, "0")}:${String(visStart % 60).padStart(2, "0")} – ${String(Math.floor(visEnd / 60)).padStart(2, "0")}:${String(visEnd % 60).padStart(2, "0")}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
              </React.Fragment>
            );
          })}
        </div>
        );
      })}
      {dragSnap && drag?.moved && !stackMode && appKind === "calendar" && (() => {
        const top = ((dragSnap.startMin - startHour * 60) / 30) * ROW_HEIGHT;
        const height = (dragSnap.durationMin / 30) * ROW_HEIGHT;
        const dragColor = events.find((ev) => ev.id === dragSnap.id)?.color;
        const list = byCol[dragSnap.colIdx] ?? [];
        const others = list
          .filter(({ ev }) => ev.id !== dragSnap.id)
          .map(({ ev, startMin, endMin }) => {
            const resizing = resize?.id === ev.id;
            return {
              id: ev.id,
              startMin: resizing ? resize!.currentStartMin : startMin,
              endMin: resizing ? resize!.currentEndMin : endMin,
              sortIndex: overlapRecency(ev.sortIndex),
            };
          });
        const place = layoutTimedOverlaps([
          ...others,
          {
            id: "__drag-snap__",
            startMin: dragSnap.startMin,
            endMin: dragSnap.startMin + dragSnap.durationMin,
            sortIndex: NEWCOMER_SORT_INDEX,
          },
        ]).get("__drag-snap__");
        return (
          <div
            style={{
              gridColumnStart: dragSnap.colIdx + gridColumnOffset,
              gridColumnEnd: dragSnap.colIdx + gridColumnOffset + 1,
              gridRowStart: 1,
              gridRowEnd: spanHours + 1,
              position: "relative",
              pointerEvents: "none",
              zIndex: 7,
            }}
          >
            <div
              aria-hidden
              className="absolute rounded-[3px] border-2 border-solid border-black/40"
              style={{
                ...(place ? timedOverlapTileBox(place) : { left: 2, right: 2, width: "auto" }),
                top,
                height,
                background: "transparent",
                borderColor: dragColor ? `${dragColor}CC` : undefined,
                pointerEvents: "none",
              }}
            />
          </div>
        );
      })()}
      {stackMode &&
        stackDrag &&
        typeof document !== "undefined" &&
        createPortal(
          (() => {
            const left = stackDrag.pointerX - stackDrag.offsetX;
            const top = stackDrag.pointerY - stackDrag.offsetY;
            const ev = stackDrag.event;
            const chrome = isMembershipOverlayEvent(ev, calId)
              ? teamMemberTilePaint(
                  ev.color,
                  true,
                  signupResponse(ev.signUpEnabled, teamResponses, ev.id),
                  darkTiles,
                )
              : {
                  ...sessionTileChrome(ev.color, true),
                  fill: sessionWeekDayTileFill(ev.color, true, darkTiles),
                };
            return (
              <div
                ref={stackGhostElRef}
                className="pointer-events-none fixed z-[10000]"
                style={{
                  left,
                  top,
                  width: stackDrag.chipWidth,
                  height: stackDrag.chipHeight,
                  willChange: "left, top",
                }}
              >
                <div
                  className="relative flex h-full w-full select-none overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] ring-1 ring-black/5 shadow-lg"
                  style={{
                    background: chrome.fill,
                    color: chrome.fg,
                  }}
                  data-coach-pending={ev.coachPending ? "1" : undefined}
                >
                  <span
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                    style={{ background: chrome.bar }}
                  />
                  <div className="flex h-full flex-col justify-center pl-1 leading-tight">
                    <span className="truncate text-[12px] font-semibold">
                      {ev.title || "New session"}
                    </span>
                    <span className="truncate text-[10.5px] font-medium tabular-nums opacity-70">
                      {ev.allDay
                        ? "All day"
                        : `${String(Math.floor(stackDrag.startMin / 60)).padStart(2, "0")}:${String(stackDrag.startMin % 60).padStart(2, "0")} – ${String(Math.floor((stackDrag.startMin + stackDrag.durationMin) / 60)).padStart(2, "0")}:${String((stackDrag.startMin + stackDrag.durationMin) % 60).padStart(2, "0")}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body,
        )}
      {appKind === "diary" &&
        hoverId &&
        hoverRect &&
        (() => {
          const ev = events.find((e) => e.id === hoverId);
          if (!ev) return null;
          return (
            <SessionHoverMenu
              ev={ev}
              blockRect={hoverRect}
              rowHeight={ROW_HEIGHT}
              visible={hoverId === ev.id}
              defaultEditMode={forceEditId === ev.id}
              memberId={memberId}
              viewerRole={viewerRole}
              onMenuEnter={cancelClose}
              onMenuLeave={scheduleClose}
              onActiveChange={(active) => setLockedId(active ? ev.id : null)}
              onOpenDetails={() => {
                cancelClose();
                setDetailsEvId(ev.id);
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
              }}
              onForceClose={(closingEventId) => {
                cancelClose();
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
                cancelClose();
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
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
      {appKind === "diary" &&
        detailsEvId &&
        (() => {
          const ev = events.find((e) => e.id === detailsEvId);
          if (!ev) return null;
          return (
            <SessionDetailsContainer
              ev={ev}
              memberId={memberId}
              viewerRole={viewerRole}
              onClose={() => setDetailsEvId(null)}
              onUpsert={(patch) => onUpsertSession?.(patch)}
              onDelete={onDeleteEvent ? () => onDeleteEvent(ev.id) : undefined}
              onAccept={onAcceptCoachSession ? () => onAcceptCoachSession(ev.id) : undefined}
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
  calId,
  events,
  weekDates,
  creatingColIdx = null,
  onEventClick,
  onDeleteEvent,
  onUpsertSession,
  onAcceptCoachSession,
  onReorderEvents,
  memberId,
  viewerRole = "owner",
}: {
  calId: string;
  events: CalendarEvent[];
  weekDates: Date[];
  creatingColIdx?: number | null;
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onDeleteEvent?: (id: string) => void;
  onUpsertSession?: (patch: Partial<CalendarEvent> & { id: string }) => void;
  onAcceptCoachSession?: (id: string) => void;
  onReorderEvents?: (ids: string[]) => void;
  memberId?: string;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
}) {
  const [tileDesign] = useSessionTileDesign();
  const [unit] = useDistanceUnit();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverRect, setHoverRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [forceEditId, setForceEditId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [detailsEvId, setDetailsEvId] = useState<string | null>(null);
  const globalLock = useHoverLock();
  const ownLockId = (forceEditId ?? lockedId) != null ? `session-${forceEditId ?? lockedId}` : null;
  const foreignLock = globalLock !== null && globalLock !== ownLockId;
  const hoverLocked = lockedId !== null || forceEditId !== null || foreignLock;
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
      if (forceEditId) return; // keep menu open while in edit mode
      setHoverId(null);
      setHoverRect(null);
    }, 0);
  }, [cancelClose, forceEditId]);

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

  useClosePanelsForDeletedEvents(events, {
    hoverId,
    setForceEditId,
    setLockedId,
    setDetailsEvId,
    setHoverId,
    setHoverRect,
  });

  // Group events by column, sorted by sortIndex (fallback startISO).
  // Local order overrides while a reorder is pending.
  const [pendingOrder, setPendingOrder] = useState<{ colIdx: number; ids: string[] } | null>(null);
  const [stravaBlocked, setStravaBlocked] = useState(false);
  // Delay the confirm/strava dialog ~300ms so the dnd-kit snap-in finishes
  // first; the modal then slides up on top of the already-reordered list.
  const [modalReady, setModalReady] = useState(false);
  const modalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    },
    [],
  );
  const scheduleModalOpen = () => {
    if (modalTimerRef.current) clearTimeout(modalTimerRef.current);
    modalTimerRef.current = setTimeout(() => setModalReady(true), 300);
  };
  const byCol = useMemo(() => {
    const arr: CalendarEvent[][] = Array.from({ length: weekDates.length }, () => []);
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
            creating={creatingColIdx === colIdx}
            tileDesign={tileDesign}
            unit={unit}
            viewerRole={viewerRole}
            activeSessionId={lockedId ?? forceEditId}
            onEventClick={(ev, anchor) => {
              cancelClose();
              if (viewerRole === "owner" && !isMembershipOverlayEvent(ev, calId)) {
                // Owner click extends the hover menu into edit mode in-place.
                const r = anchor.getBoundingClientRect();
                setHoverId(ev.id);
                setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                setForceEditId(ev.id);
              } else {
                setDetailsEvId(ev.id);
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
              }
              void onEventClick;
            }}
            onHoverChange={(id, rect) => {
              if (hoverLocked && id !== (lockedId ?? forceEditId)) return;
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
                scheduleModalOpen();
                return;
              }
              setPendingOrder({ colIdx, ids });
              scheduleModalOpen();
            }}
          />
        </div>
      ))}
      <ReorderConfirmDialog
        open={(!!pendingOrder || stravaBlocked) && modalReady}
        mode={stravaBlocked ? "stravaBlocked" : "confirm"}
        onCancel={() => {
          if (modalTimerRef.current) {
            clearTimeout(modalTimerRef.current);
            modalTimerRef.current = null;
          }
          setPendingOrder(null);
          setStravaBlocked(false);
          setModalReady(false);
        }}
        onConfirm={() => {
          if (modalTimerRef.current) {
            clearTimeout(modalTimerRef.current);
            modalTimerRef.current = null;
          }
          if (pendingOrder) onReorderEvents?.(pendingOrder.ids);
          setPendingOrder(null);
          setStravaBlocked(false);
          setModalReady(false);
        }}
      />
      {hoverId &&
        hoverRect &&
        (() => {
          const ev = events.find((e) => e.id === hoverId);
          if (!ev) return null;
          return (
            <SessionHoverMenu
              ev={ev}
              blockRect={hoverRect}
              rowHeight={28}
              visible={hoverId === ev.id}
              defaultEditMode={forceEditId === ev.id}
              memberId={memberId}
              viewerRole={viewerRole}
              onMenuEnter={cancelClose}
              onMenuLeave={scheduleClose}
              onActiveChange={(active) => setLockedId(active ? ev.id : null)}
              onOpenDetails={() => {
                cancelClose();
                setDetailsEvId(ev.id);
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
              }}
              onForceClose={(closingEventId) => {
                cancelClose();
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
                cancelClose();
                setHoverId(null);
                setHoverRect(null);
                setForceEditId(null);
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
      {detailsEvId &&
        (() => {
          const ev = events.find((e) => e.id === detailsEvId);
          if (!ev) return null;
          return (
            <SessionDetailsContainer
              ev={ev}
              memberId={memberId}
              viewerRole={viewerRole}
              onClose={() => setDetailsEvId(null)}
              onUpsert={(patch) => onUpsertSession?.(patch)}
              onDelete={onDeleteEvent ? () => onDeleteEvent(ev.id) : undefined}
              onAccept={onAcceptCoachSession ? () => onAcceptCoachSession(ev.id) : undefined}
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
  creating = false,
  tileDesign,
  unit,
  activeSessionId,
  viewerRole = "owner",
  onEventClick,
  onHoverChange,
  onHoverEnd,
  onReorder,
}: {
  colIdx: number;
  list: CalendarEvent[];
  creating?: boolean;
  tileDesign: "split" | "stacked" | "icon";
  unit: ReturnType<typeof useDistanceUnit>[0];
  activeSessionId?: string | null;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onHoverChange: (
    id: string,
    rect: { left: number; top: number; width: number; height: number },
  ) => void;
  onHoverEnd: () => void;
  onReorder: (ids: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  const ids = list.map((e) => e.id);
  const canReorder = viewerRole === "owner";

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

  const activeEvent = activeId ? (list.find((e) => e.id === activeId) ?? null) : null;

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
                disabled={list.length < 2 || !canReorder}
                isActive={activeSessionId === ev.id}
                onEventClick={onEventClick}
                onHoverChange={onHoverChange}
                onHoverEnd={onHoverEnd}
              />
            ))}
            {creating && (
              <div
                aria-hidden
                className="pointer-events-none rounded-[3px] border-2 border-solid border-primary/60 bg-primary/10"
                style={{ height: SIMPLE_TILE_H }}
              />
            )}
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
  isActive,
  onEventClick,
  onHoverChange,
  onHoverEnd,
}: {
  ev: CalendarEvent;
  tileDesign: "split" | "stacked" | "icon";
  unit: ReturnType<typeof useDistanceUnit>[0];
  disabled?: boolean;
  isActive?: boolean;
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onHoverChange: (
    id: string,
    rect: { left: number; top: number; width: number; height: number },
  ) => void;
  onHoverEnd: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ev.id,
    disabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    position: "relative",
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-real-event="1"
      data-coach-pending={ev.coachPending ? "1" : undefined}
      onMouseEnter={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onHoverChange(ev.id, { left: r.left, top: r.top, width: r.width, height: r.height });
      }}
      onMouseLeave={(e) => {
        const related = e.relatedTarget as Node | null;
        const goingIntoMenu =
          related instanceof HTMLElement && related.closest('[data-session-hover-menu="1"]');
        if (goingIntoMenu) return;
        onHoverEnd();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isDragging) return;
        onEventClick(ev, e.currentTarget as HTMLElement);
      }}
    >
      <SimpleTileBody ev={ev} tileDesign={tileDesign} unit={unit} isActive={isActive} />
    </div>
  );
}

function SimpleTileBody({
  ev,
  tileDesign,
  unit,
  dragging = false,
  isActive = false,
}: {
  ev: CalendarEvent;
  tileDesign: "split" | "stacked" | "icon";
  unit: ReturnType<typeof useDistanceUnit>[0];
  dragging?: boolean;
  isActive?: boolean;
}) {
  const chrome = sessionTileChrome(ev.color, isActive);
  const bg = ev.color ? chrome.fill : "hsl(var(--primary) / 0.15)";
  const fg = ev.color ? chrome.fg : "hsl(var(--ink, 220 13% 13%))";
  const start = fromISOLocal(ev.startISO);
  const end = fromISOLocal(ev.endISO);
  const { startMin, endMin } = startEndMinsOnStartDay(start, end);
  const actKey = (ev.activity || ev.diarySub || "").toLowerCase();
  const ActIcon =
    actKey === "cycling" || actKey === "bike"
      ? Bike
      : actKey === "swimming" || actKey === "swim"
        ? Waves
        : actKey === "strength"
          ? Dumbbell
          : actKey === "xcskiing"
            ? Snowflake
            : Footprints;
  const km = ev.distanceKm;
  const distVal = km != null ? kmToUnit(km, unit) : null;
  const isStrength = actKey === "strength";
  const isNorwegian =
    typeof navigator !== "undefined" && /^nb|^nn|^no/i.test(navigator.language || "");
  const hourSuffix = isNorwegian ? "t" : "h";
  const totalMin = Math.max(0, endMin - startMin);
  const durH = Math.floor(totalMin / 60);
  const durM = totalMin % 60;
  const strengthLabel = durH > 0 ? `${durH}${hourSuffix} ${durM}m` : `${durM}m`;
  const distLabel = isStrength
    ? strengthLabel
    : distVal != null
      ? `${distVal.toFixed(1)} ${unitLabel(unit)}`
      : "—";
  const iconHalfBg = ev.color ? `color-mix(in srgb, ${ev.color} 40%, white)` : "rgba(0,0,0,0.05)";
  const durStr = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")} – ${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

  return (
    <div
      className={[
        "relative select-none overflow-hidden rounded-[3px] pl-2 pr-1.5 py-0.5 text-[12px] shadow-sm transition-shadow hover:shadow-md",
        isActive ? "" : "ring-1 ring-black/5",
        dragging ? "shadow-lg" : "",
      ].join(" ")}
      style={{
        height: SIMPLE_TILE_H,
        background: bg,
        color: fg,
      }}
      title={ev.title}
    >
      <span
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
        style={{ background: chrome.bar }}
      />
      {tileDesign === "icon" ? (
        <div className="flex h-full w-full items-center justify-center pl-1">
          <ActIcon
            className="h-5 w-5 shrink-0"
            strokeWidth={2.25}
            style={{ color: chrome.fg }}
          />
        </div>
      ) : tileDesign === "stacked" ? (
        <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-[3px]">
          <div
            className="flex w-1/2 items-center justify-center"
            style={{ background: iconHalfBg }}
          >
            <ActIcon className="h-5 w-5 shrink-0" strokeWidth={2.25} style={{ color: chrome.fg }} />
          </div>
          <div className="flex w-1/2 min-w-0 flex-col justify-center px-2 leading-tight">
            <span className="truncate text-[12px] font-semibold">{ev.title}</span>
            <span className="truncate text-[10.5px] font-medium tabular-nums opacity-70" style={{ fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>{durStr}</span>
            {!isStrength && (
              <span className="mono truncate text-[10.5px] tabular-nums opacity-70">
                {distLabel}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-stretch overflow-hidden rounded-[3px]">
          <div
            className="flex w-1/2 items-center justify-center"
            style={{ background: iconHalfBg }}
          >
            <ActIcon className="h-7 w-7 shrink-0" strokeWidth={2.25} style={{ color: chrome.fg }} />
          </div>
          <div
            className="flex w-1/2 select-none items-center justify-center"
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
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>
                      {hourSuffix}
                    </span>
                  </>
                )}
                <span>{durM}</span>
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>m</span>
              </span>
            ) : distVal != null ? (
              <span className="flex items-baseline gap-1" style={{ lineHeight: 1 }}>
                <span>{distVal.toFixed(1)}</span>
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>
                  {unitLabel(unit)}
                </span>
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
