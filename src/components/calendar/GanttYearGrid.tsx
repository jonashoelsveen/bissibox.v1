/**
 * GanttYearGrid — Macro year shell: week columns across the year.
 *
 * Geometry:
 *   - One column per calendar week (Mon–Sun) that intersects the year
 *   - Weeks share one width; default fits the viewport
 *   - Drag month-header dividers no longer resizes; use −/+ or Ctrl+scroll
 *   - Month header and dividers align to the 1st of each calendar month
 *     (day geometry), independent of week-column starts
 *   - Every second week column is light-grey filled
 *   - Week header height is fixed; when weekW is large enough, 7 day letters
 *     appear under the week number (no header expand)
 *
 * Interaction:
 *   - Ctrl/⌘+scroll (or trackpad pinch) zooms week column width (CSS-var, rAF)
 *   - Header −/+ control zooms the same scale
 *   - Empty cells: click/hold + horizontal mark-create (Micro-style)
 *   - Colored blocks: drag horizontally to move (duration preserved), or click to open
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { UserCategory } from "@/hooks/useUserCategories";
import { GANTT_PROJECT_ROW_HEIGHT } from "./MeCategorySection";
import {
  weeksForCalendarYear,
  resolveGanttDaySpan,
  spanFromDayOffsets,
  spanFromWeekIndices,
  dayOffsetInYearGrid,
  clampDayOffset,
  ganttPhaseViewFocusDay,
  monthDaySpansForGrid,
  type GanttWeekColumn,
} from "./ganttWeeks";
import { startOfDay } from "./dateUtils";
import {
  clampGanttWeekW,
  GANTT_WEEK_W_MIN,
  GANTT_WEEK_W_VAR,
  publishGanttWeekW,
  readStoredGanttWeekW,
  registerGanttZoomController,
  writeStoredGanttWeekW,
} from "./ganttMacroZoom";

export const GANTT_MONTH_HEADER_H = 36;
/** Fixed week-header height (week-only and week+day modes share this). */
export const GANTT_WEEK_HEADER_H = 30;
const HEADER_STACK_H = GANTT_MONTH_HEADER_H + GANTT_WEEK_HEADER_H;
/** Day-letter strip inside the week header when day LOD is on. */
const GANTT_DAY_LETTER_H = 13;

/** Matches Micro `NowLine` accent. */
const NOW_COLOR = "#FF4F4F";
/** Place today line at 25% into the viewport (between left edge and center). */
const TODAY_SCROLL_VIEW_FRAC = 0.25;

/** Alternating week-column fill (every second week). */
const WEEK_ZEBRA_BG = "rgb(245, 245, 247)";

/**
 * Minimum px per day before showing the 7 weekday letters.
 * Below this, letters crowd and fail visual quality standards.
 */
const MIN_DAY_COL_PX = 12;
/** Trackpad/mouse Ctrl+wheel sensitivity (exponential zoom). */
const WHEEL_ZOOM_SENSITIVITY = 0.0032;
const BLOCK_DRAG_THRESHOLD_PX = 3;
/** Hit zone from left/right edge for resize (matches Micro session tiles). */
const RESIZE_EDGE_PX = 12;
/** Minimum block length in days. */
const MIN_BLOCK_DAYS = 1;

/** Norwegian single-letter weekdays, Mon–Sun (matches MiniCalendar). */
const WEEKDAY_LETTERS_NB = ["M", "T", "O", "T", "F", "L", "S"] as const;

const MONTHS_SHORT_NB = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export interface GanttYearGridProps {
  year: number;
  projects: UserCategory[];
  /** Commit a week span onto an existing project/phase row (move / mark). */
  onCommitSpan?: (
    projectId: string,
    span: {
      gantt_start_week: number;
      gantt_end_week: number;
      gantt_start_date: string;
      gantt_end_date: string;
    },
  ) => void;
  /** Drag-create on an empty track. */
  onCreateSpan?: (
    span: {
      gantt_start_week: number;
      gantt_end_week: number;
      gantt_start_date: string;
      gantt_end_date: string;
    },
  ) => void;
  /** Click a block (no drag) — open the edit panel. */
  onOpenItem?: (projectId: string, rect: DOMRect) => void;
  /** Called when a block move starts (close open panel). Not used for edge resize. */
  onBlockDragStart?: () => void;
  /** Live edge-resize updates so the open panel dates tick along. */
  onLiveResize?: (
    projectId: string,
    span: {
      gantt_start_week: number;
      gantt_end_week: number;
      gantt_start_date: string;
      gantt_end_date: string;
    },
  ) => void;
  /**
   * Block ids whose bars are derived (e.g. project union of phases).
   * Display + click only — no move/resize/mark-commit on the block.
   */
  lockedBlockIds?: ReadonlySet<string>;
  /**
   * When this changes, re-run initial horizontal scroll placement.
   * Use open project id (or a list sentinel) so drill-in repositions the view.
   */
  scrollResetKey?: string;
  /**
   * When true, scroll uses phase-span rules (first block vs today-in-range).
   * When false, scroll anchors on today only.
   */
  scrollFocusPhases?: boolean;
}

type MarkRange = { rowKey: string; lo: number; hi: number };

type BlockDragState = {
  id: string;
  /** Inclusive day length. */
  durationDays: number;
  originStartDay: number;
  previewStartDay: number;
  /** Grab offset in whole weeks (move snaps to weeks). */
  grabOffsetWeeks: number;
  moved: boolean;
  startClientX: number;
};

type BlockResizeState = {
  id: string;
  edge: "start" | "end";
  originStartDay: number;
  originEndDay: number;
  previewStartDay: number;
  previewEndDay: number;
  startClientX: number;
  moved: boolean;
};

export type GanttSpanPatch = {
  gantt_start_week: number;
  gantt_end_week: number;
  gantt_start_date: string;
  gantt_end_date: string;
};

function clampWeek(i: number, max: number) {
  return Math.max(0, Math.min(max, i));
}

function weekColumnBg(index: number, isCurrent: boolean): string | undefined {
  if (isCurrent) return undefined;
  return index % 2 === 1 ? WEEK_ZEBRA_BG : "#ffffff";
}

function showDayColumns(weekW: number): boolean {
  return weekW / 7 >= MIN_DAY_COL_PX;
}

function gridColsStyle(weekCount: number): string {
  return weekCount > 0
    ? `repeat(${weekCount}, var(${GANTT_WEEK_W_VAR}))`
    : "none";
}

function dayLeftCss(dayOffset: number): string {
  return `calc(${dayOffset} * var(${GANTT_WEEK_W_VAR}) / 7)`;
}

function dayWidthCss(dayCount: number, gutterPx = 0): string {
  if (gutterPx === 0) {
    return `calc(${dayCount} * var(${GANTT_WEEK_W_VAR}) / 7)`;
  }
  return `calc(${dayCount} * var(${GANTT_WEEK_W_VAR}) / 7 - ${gutterPx}px)`;
}

function GanttTrackRow({
  rowKey,
  project,
  weeks,
  showDays,
  currentWeekIndex,
  markRange,
  blockDrag,
  blockResize,
  blockLocked,
  onMarkBegin,
  onMarkExtend,
  onBlockPointerDown,
  onBlockResizePointerDown,
}: {
  rowKey: string;
  project?: UserCategory;
  weeks: GanttWeekColumn[];
  showDays: boolean;
  currentWeekIndex: number;
  markRange: MarkRange | null;
  blockDrag: BlockDragState | null;
  blockResize: BlockResizeState | null;
  /** Derived / read-only bar (click opens; no drag/resize). */
  blockLocked?: boolean;
  onMarkBegin: (rowKey: string, week: number) => void;
  onMarkExtend: (rowKey: string, week: number) => void;
  onBlockPointerDown: (
    e: ReactPointerEvent,
    project: UserCategory,
    startDay: number,
    endDay: number,
  ) => void;
  onBlockResizePointerDown: (
    e: ReactPointerEvent,
    project: UserCategory,
    edge: "start" | "end",
    startDay: number,
    endDay: number,
  ) => void;
}) {
  const daySpan =
    project && !project.hidden ? resolveGanttDaySpan(weeks, project) : null;
  const startDay = daySpan?.startDay ?? null;
  const endDay = daySpan?.endDay ?? null;
  const hasBlock = startDay != null && endDay != null;
  const draggingThis =
    !!blockDrag && !!project && blockDrag.id === project.id;
  const resizingThis =
    !!blockResize && !!project && blockResize.id === project.id;
  const displayStartDay = resizingThis
    ? blockResize.previewStartDay
    : draggingThis
      ? blockDrag.previewStartDay
      : startDay;
  const displayEndDay = resizingThis
    ? blockResize.previewEndDay
    : draggingThis && displayStartDay != null
      ? displayStartDay + blockDrag.durationDays - 1
      : endDay;
  const interacting = draggingThis || resizingThis;
  const gridTemplateColumns = gridColsStyle(weeks.length);

  return (
    <div
      className="relative grid"
      style={{
        gridTemplateColumns,
        height: GANTT_PROJECT_ROW_HEIGHT,
        minHeight: GANTT_PROJECT_ROW_HEIGHT,
      }}
      data-gantt-project-id={project?.id}
      data-gantt-row-key={rowKey}
    >
      {weeks.map((w) => {
        const i = w.index;
        const isCurrent = i === currentWeekIndex;
        const inMark =
          markRange != null &&
          markRange.rowKey === rowKey &&
          i >= markRange.lo &&
          i <= markRange.hi;
        const isFirst = inMark && i === markRange!.lo;
        const isLast = inMark && i === markRange!.hi;

        return (
          <div
            key={`${rowKey}-${i}`}
            data-gantt-cell={`${rowKey}:${i}`}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onMarkBegin(rowKey, i);
            }}
            onMouseEnter={() => onMarkExtend(rowKey, i)}
            className={`relative select-none border-b border-hairline ${
              isCurrent ? "bg-secondary/40" : ""
            }`}
            style={{
              height: GANTT_PROJECT_ROW_HEIGHT,
              background: isCurrent ? undefined : weekColumnBg(i, isCurrent),
            }}
          >
            {showDays
              ? WEEKDAY_LETTERS_NB.map((_, dayIdx) =>
                  dayIdx === 0 ? null : (
                    <span
                      key={`day-tick-${dayIdx}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 z-0 w-px bg-hairline/70"
                      style={{ left: `${(dayIdx / 7) * 100}%` }}
                    />
                  ),
                )
              : null}
            {inMark && (
              <span
                className="pointer-events-none absolute inset-y-0 z-[1] bg-muted-foreground/15"
                style={{
                  left: isFirst ? 0 : -1,
                  right: isLast ? 0 : -1,
                }}
              />
            )}
          </div>
        );
      })}

      {hasBlock &&
        displayStartDay != null &&
        displayEndDay != null && (
          <div
            role="button"
            tabIndex={0}
            data-gantt-block={project!.id}
            className={`absolute inset-y-[3px] cursor-default select-none rounded-sm shadow-[0_1px_2px_0_rgba(0,0,0,0.08),0_-1px_2px_0_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition-[filter,box-shadow,opacity] hover:z-[4] hover:brightness-[0.97] hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.12),0_-2px_4px_0_rgba(0,0,0,0.12)] hover:opacity-100 ${
              interacting ? "z-[5] opacity-95 shadow-sm" : "z-[2] opacity-[0.85]"
            }`}
            style={{
              left: `calc(${dayLeftCss(displayStartDay)} + 1px)`,
              width: dayWidthCss(
                displayEndDay - displayStartDay + 1,
                2,
              ),
              background: project!.color,
            }}
            onPointerDown={(e) => {
              if (!project || startDay == null || endDay == null) return;
              if (blockLocked) {
                // Click-only: open panel / drill without move or resize.
                e.preventDefault();
                e.stopPropagation();
                onBlockPointerDown(e, project, startDay, endDay);
                return;
              }
              if ((e.target as HTMLElement).closest("[data-resize-handle]")) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const x = e.clientX - rect.left;
              if (x <= RESIZE_EDGE_PX) {
                onBlockResizePointerDown(e, project, "start", startDay, endDay);
                return;
              }
              if (x >= rect.width - RESIZE_EDGE_PX) {
                onBlockResizePointerDown(e, project, "end", startDay, endDay);
                return;
              }
              onBlockPointerDown(e, project, startDay, endDay);
            }}
          >
            {!blockLocked ? (
              <>
                <div
                  role="separator"
                  aria-label="Adjust start date"
                  data-resize-handle="start"
                  onPointerDown={(e) => {
                    if (!project || startDay == null || endDay == null) return;
                    onBlockResizePointerDown(e, project, "start", startDay, endDay);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-y-0 left-0 z-[3] w-3 cursor-ew-resize touch-none"
                />
                <div
                  role="separator"
                  aria-label="Adjust end date"
                  data-resize-handle="end"
                  onPointerDown={(e) => {
                    if (!project || startDay == null || endDay == null) return;
                    onBlockResizePointerDown(e, project, "end", startDay, endDay);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-y-0 right-0 z-[3] w-3 cursor-ew-resize touch-none"
                />
              </>
            ) : null}
          </div>
        )}
    </div>
  );
}

export function GanttYearGrid({
  year,
  projects,
  onCommitSpan,
  onCreateSpan,
  onOpenItem,
  onBlockDragStart,
  onLiveResize,
  lockedBlockIds,
  scrollResetKey = "list",
  scrollFocusPhases = false,
}: GanttYearGridProps) {
  const weeks = useMemo(() => weeksForCalendarYear(year), [year]);
  const weekCount = weeks.length;

  const shellRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [viewportW, setViewportW] = useState(0);
  const [bodyH, setBodyH] = useState(0);

  const [weekWUser, setWeekWUser] = useState<number | null>(() =>
    readStoredGanttWeekW(),
  );

  const markStartRef = useRef<{ rowKey: string; week: number } | null>(null);
  const markActiveRef = useRef(false);
  const [markRange, setMarkRange] = useState<MarkRange | null>(null);
  const [markReleased, setMarkReleased] = useState(false);

  const blockDragRef = useRef<BlockDragState | null>(null);
  const [blockDrag, setBlockDrag] = useState<BlockDragState | null>(null);
  const blockResizeRef = useRef<BlockResizeState | null>(null);
  const [blockResize, setBlockResize] = useState<BlockResizeState | null>(null);
  const suppressClickAfterResizeRef = useRef(false);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      setViewportW(el.clientWidth);
      setBodyH(Math.max(0, el.clientHeight - HEADER_STACK_H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onUp = () => {
      if (markActiveRef.current) setMarkReleased(true);
      markActiveRef.current = false;
      markStartRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  useEffect(() => {
    if (!markReleased || !markRange) return;
    if (markRange.hi < markRange.lo) return;

    const lo = clampWeek(markRange.lo, weekCount - 1);
    const hi = clampWeek(markRange.hi, weekCount - 1);
    const project = projects.find((p) => p.id === markRange.rowKey);

    setMarkRange(null);
    setMarkReleased(false);

    const span = spanFromWeekIndices(weeks, lo, hi);
    if (project) {
      if (lockedBlockIds?.has(project.id)) return;
      onCommitSpan?.(project.id, span);
    } else if (markRange.rowKey.startsWith("empty-")) {
      onCreateSpan?.(span);
    }
  }, [markReleased, markRange, projects, onCommitSpan, onCreateSpan, weekCount, weeks, lockedBlockIds]);

  const beginMark = useCallback((rowKey: string, week: number) => {
    if (blockDragRef.current || blockResizeRef.current) return;
    markStartRef.current = { rowKey, week };
    markActiveRef.current = true;
    setMarkReleased(false);
    setMarkRange(null);
  }, []);

  const extendMark = useCallback((rowKey: string, week: number) => {
    if (!markActiveRef.current || !markStartRef.current) return;
    if (rowKey !== markStartRef.current.rowKey) return;
    const a = markStartRef.current.week;
    setMarkRange({
      rowKey,
      lo: Math.min(a, week),
      hi: Math.max(a, week),
    });
  }, []);

  const fitWeekW =
    viewportW > 0 && weekCount > 0 ? viewportW / weekCount : 0;
  const weekW = clampGanttWeekW(weekWUser ?? (fitWeekW || GANTT_WEEK_W_MIN));
  const showDays = showDayColumns(weekW);
  const weekWRef = useRef(weekW);
  const showDaysRef = useRef(showDays);

  const zoomRafRef = useRef(0);
  const persistTimerRef = useRef(0);
  const pendingWeekWRef = useRef(weekW);

  const applyWeekW = useCallback(
    (nextRaw: number, opts?: { anchorLocalX?: number; syncReact?: boolean }) => {
      const prev = weekWRef.current;
      const next = clampGanttWeekW(nextRaw);
      if (next === prev) return;

      weekWRef.current = next;
      pendingWeekWRef.current = next;

      const content = contentRef.current;
      if (content) {
        content.style.setProperty(GANTT_WEEK_W_VAR, `${next}px`);
      }

      const scrollEl = scrollRef.current;
      if (scrollEl && prev > 0) {
        const localX = opts?.anchorLocalX ?? scrollEl.clientWidth / 2;
        const dayOffset = ((scrollEl.scrollLeft + localX) * 7) / prev;
        scrollEl.scrollLeft = (dayOffset * next) / 7 - localX;
      }

      publishGanttWeekW(next);

      const crossedLod =
        showDayColumns(next) !== showDaysRef.current;
      if (opts?.syncReact || crossedLod) {
        showDaysRef.current = showDayColumns(next);
        setWeekWUser(next);
      } else if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = 0;
          setWeekWUser(pendingWeekWRef.current);
        });
      }

      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = 0;
        writeStoredGanttWeekW(pendingWeekWRef.current);
      }, 120);
    },
    [],
  );

  useEffect(() => {
    registerGanttZoomController({
      getWeekW: () => weekWRef.current,
      setWeekW: (next, opts) =>
        applyWeekW(next, { anchorLocalX: opts?.anchorLocalX, syncReact: true }),
    });
    publishGanttWeekW(weekWRef.current);
    return () => {
      registerGanttZoomController(null);
      if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current);
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [applyWeekW]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms via CSS var — no React per-event.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();

      const prev = weekWRef.current;
      if (prev <= 0) return;

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= el.clientHeight;

      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      applyWeekW(prev * Math.exp(-dy * WHEEL_ZOOM_SENSITIVITY), {
        anchorLocalX: localX,
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyWeekW]);

  // Keep CSS var in sync when fit-width or React state changes (not only via wheel).
  useLayoutEffect(() => {
    contentRef.current?.style.setProperty(GANTT_WEEK_W_VAR, `${weekW}px`);
    weekWRef.current = weekW;
    pendingWeekWRef.current = weekW;
    publishGanttWeekW(weekW);
  }, [weekW]);

  const now = new Date();
  const today = startOfDay(now);
  const todayInYear = now.getFullYear() === year;
  const todayDayOffset = todayInYear
    ? clampDayOffset(weeks, dayOffsetInYearGrid(weeks, today))
    : null;

  const focusDayOffset = scrollFocusPhases
    ? ganttPhaseViewFocusDay(weeks, projects, todayDayOffset)
    : todayDayOffset;
  const focusLeftPx =
    focusDayOffset != null && weekW > 0
      ? focusDayOffset * (weekW / 7)
      : null;

  const didInitialScrollRef = useRef<string | null>(null);
  useEffect(() => {
    didInitialScrollRef.current = null;
  }, [year, scrollResetKey]);

  useEffect(() => {
    const session = `${year}:${scrollResetKey}`;
    if (didInitialScrollRef.current === session) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl || focusLeftPx == null || viewportW <= 0 || weekW <= 0) return;
    const maxScroll = Math.max(0, weekCount * weekW - viewportW);
    const target = focusLeftPx - viewportW * TODAY_SCROLL_VIEW_FRAC;
    scrollEl.scrollLeft = Math.max(0, Math.min(maxScroll, target));
    didInitialScrollRef.current = session;
  }, [focusLeftPx, viewportW, weekW, weekCount, year, scrollResetKey]);

  const currentWeekIndex =
    todayInYear
      ? weeks.findIndex((w) => today >= w.monday && today <= w.sunday)
      : -1;

  const onBlockPointerDown = useCallback(
    (e: ReactPointerEvent, project: UserCategory, startDay: number, endDay: number) => {
      if (e.button !== 0) return;
      if (suppressClickAfterResizeRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      markActiveRef.current = false;
      markStartRef.current = null;
      setMarkRange(null);
      setMarkReleased(false);

      // Derived project bars: click opens only (no move).
      if (lockedBlockIds?.has(project.id)) {
        const startX = e.clientX;
        const startY = e.clientY;
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener("pointerup", onUp);
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > BLOCK_DRAG_THRESHOLD_PX) {
            return;
          }
          const el = document.querySelector(
            `[data-gantt-block="${project.id}"]`,
          ) as HTMLElement | null;
          const rect =
            el?.getBoundingClientRect() ?? new DOMRect(ev.clientX, ev.clientY, 0, 0);
          onOpenItem?.(project.id, rect);
        };
        window.addEventListener("pointerup", onUp);
        return;
      }

      const scrollEl = scrollRef.current;
      const scrollLeft = scrollEl?.scrollLeft ?? 0;
      const shellLeft = shellRef.current?.getBoundingClientRect().left ?? 0;
      const xInGrid = e.clientX - shellLeft + scrollLeft;
      const originStartWeek = Math.floor(startDay / 7);
      const liveWeekW = weekWRef.current;
      const weekUnderPointer =
        liveWeekW > 0 ? Math.floor(xInGrid / liveWeekW) : originStartWeek;
      const grabOffsetWeeks = weekUnderPointer - originStartWeek;
      const durationDays = endDay - startDay + 1;

      const drag: BlockDragState = {
        id: project.id,
        durationDays,
        originStartDay: startDay,
        previewStartDay: startDay,
        grabOffsetWeeks,
        moved: false,
        startClientX: e.clientX,
      };
      blockDragRef.current = drag;
      setBlockDrag(drag);
      onBlockDragStart?.();

      const onMove = (ev: PointerEvent) => {
        const cur = blockDragRef.current;
        if (!cur) return;
        const dx = ev.clientX - cur.startClientX;
        if (!cur.moved && Math.abs(dx) < BLOCK_DRAG_THRESHOLD_PX) return;

        const w = weekWRef.current;
        const sl = scrollRef.current?.scrollLeft ?? 0;
        const left = shellRef.current?.getBoundingClientRect().left ?? 0;
        const x = ev.clientX - left + sl;
        const weekAt =
          w > 0 ? Math.floor(x / w) : Math.floor(cur.originStartDay / 7);
        const durationWeeks = Math.ceil(cur.durationDays / 7);
        const maxStartWeek = Math.max(0, weekCount - durationWeeks);
        const nextStartWeek = clampWeek(weekAt - cur.grabOffsetWeeks, maxStartWeek);
        const deltaWeeks = nextStartWeek - Math.floor(cur.originStartDay / 7);
        const maxStartDay = Math.max(0, weekCount * 7 - cur.durationDays);
        const nextStartDay = Math.max(
          0,
          Math.min(maxStartDay, cur.originStartDay + deltaWeeks * 7),
        );
        blockDragRef.current = {
          ...cur,
          moved: true,
          previewStartDay: nextStartDay,
        };
        setBlockDrag(blockDragRef.current);
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const cur = blockDragRef.current;
        blockDragRef.current = null;
        setBlockDrag(null);
        if (!cur) return;

        if (cur.moved) {
          const end = cur.previewStartDay + cur.durationDays - 1;
          if (cur.previewStartDay !== cur.originStartDay) {
            onCommitSpan?.(cur.id, spanFromDayOffsets(weeks, cur.previewStartDay, end));
          }
          return;
        }

        const el = document.querySelector(
          `[data-gantt-block="${cur.id}"]`,
        ) as HTMLElement | null;
        const rect = el?.getBoundingClientRect() ?? new DOMRect(ev.clientX, ev.clientY, 0, 0);
        onOpenItem?.(cur.id, rect);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [weekCount, weeks, onCommitSpan, onOpenItem, onBlockDragStart, lockedBlockIds],
  );

  const onBlockResizePointerDown = useCallback(
    (
      e: ReactPointerEvent,
      project: UserCategory,
      edge: "start" | "end",
      startDay: number,
      endDay: number,
    ) => {
      if (e.button !== 0) return;
      if (lockedBlockIds?.has(project.id)) return;
      e.preventDefault();
      e.stopPropagation();

      markActiveRef.current = false;
      markStartRef.current = null;
      setMarkRange(null);
      setMarkReleased(false);
      blockDragRef.current = null;
      setBlockDrag(null);
      // Keep the project panel open while resizing (like session tiles).

      const resize: BlockResizeState = {
        id: project.id,
        edge,
        originStartDay: startDay,
        originEndDay: endDay,
        previewStartDay: startDay,
        previewEndDay: endDay,
        startClientX: e.clientX,
        moved: false,
      };
      blockResizeRef.current = resize;
      setBlockResize(resize);

      const maxDay = weekCount * 7 - 1;

      const onMove = (ev: PointerEvent) => {
        const cur = blockResizeRef.current;
        const pxPerDay = weekWRef.current / 7;
        if (!cur || pxPerDay <= 0) return;
        const dx = ev.clientX - cur.startClientX;
        if (!cur.moved && Math.abs(dx) < BLOCK_DRAG_THRESHOLD_PX) return;
        const deltaDays = Math.round(dx / pxPerDay);
        let nextStart = cur.originStartDay;
        let nextEnd = cur.originEndDay;
        if (cur.edge === "start") {
          nextStart = Math.max(
            0,
            Math.min(cur.originEndDay - (MIN_BLOCK_DAYS - 1), cur.originStartDay + deltaDays),
          );
        } else {
          nextEnd = Math.min(
            maxDay,
            Math.max(cur.originStartDay + (MIN_BLOCK_DAYS - 1), cur.originEndDay + deltaDays),
          );
        }
        const next = {
          ...cur,
          moved: true,
          previewStartDay: nextStart,
          previewEndDay: nextEnd,
        };
        blockResizeRef.current = next;
        setBlockResize(next);
        onLiveResize?.(project.id, spanFromDayOffsets(weeks, nextStart, nextEnd));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const cur = blockResizeRef.current;
        blockResizeRef.current = null;
        setBlockResize(null);
        if (!cur) return;
        if (
          cur.moved &&
          (cur.previewStartDay !== cur.originStartDay ||
            cur.previewEndDay !== cur.originEndDay)
        ) {
          suppressClickAfterResizeRef.current = true;
          window.setTimeout(() => {
            suppressClickAfterResizeRef.current = false;
          }, 100);
          onCommitSpan?.(
            cur.id,
            spanFromDayOffsets(weeks, cur.previewStartDay, cur.previewEndDay),
          );
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [weekCount, weeks, onCommitSpan, onLiveResize, lockedBlockIds],
  );

  const gridTemplateColumns = gridColsStyle(weekCount);
  const monthSpans = useMemo(() => monthDaySpansForGrid(weeks), [weeks]);
  const contentWidthCss =
    weekCount > 0 ? `calc(${weekCount} * var(${GANTT_WEEK_W_VAR}))` : undefined;

  const minTrackCount =
    bodyH > 0 ? Math.ceil(bodyH / GANTT_PROJECT_ROW_HEIGHT) : 0;
  const emptyTrackCount = Math.max(0, minTrackCount - projects.length);

  return (
    <div
      ref={shellRef}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
    >
      <div
        ref={scrollRef}
        className="mini-dur-scroll relative min-h-0 flex-1 overflow-auto [&::-webkit-scrollbar]:hidden"
      >
        <div
          ref={contentRef}
          className="relative"
          style={{ width: contentWidthCss } as CSSProperties}
        >
          {todayDayOffset != null ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[25]"
              style={{ left: dayLeftCss(todayDayOffset), width: 0 }}
            >
              <div
                className="absolute top-0 bottom-0 w-[2px] -translate-x-1/2 rounded-full"
                style={{ background: NOW_COLOR }}
              />
            </div>
          ) : null}
          <div
            data-grid-header="months"
            className="sticky top-0 z-30 bg-card"
            style={{
              height: GANTT_MONTH_HEADER_H,
              width: contentWidthCss,
            }}
          >
            {monthSpans.map((span, spanIdx) => {
              const isCurrentMonth =
                now.getFullYear() === span.year &&
                now.getMonth() === span.month;
              const isLast = spanIdx === monthSpans.length - 1;
              return (
                <div
                  key={`m-${span.year}-${span.month}-${span.startDay}`}
                  className={`absolute top-0 flex select-none items-center justify-center border-b border-hairline px-1 text-[11px] font-semibold uppercase tracking-wide ${
                    isLast ? "" : "border-r border-hairline"
                  } ${
                    isCurrentMonth
                      ? "bg-secondary text-ink"
                      : "bg-card text-muted-foreground"
                  }`}
                  style={{
                    height: GANTT_MONTH_HEADER_H,
                    left: dayLeftCss(span.startDay),
                    width: dayWidthCss(span.endDay - span.startDay + 1),
                  }}
                >
                  {MONTHS_SHORT_NB[span.month]}
                </div>
              );
            })}
          </div>

          <div
            data-grid-header="weeks"
            className="sticky z-30 grid bg-card"
            style={{
              gridTemplateColumns,
              height: GANTT_WEEK_HEADER_H,
              top: GANTT_MONTH_HEADER_H,
            }}
          >
            {weeks.map((w) => {
              const isCurrent = w.index === currentWeekIndex;
              return (
                <div
                  key={`wk-${w.index}`}
                  className={`flex select-none flex-col border-b border-hairline text-[9px] tabular-nums ${
                    isCurrent
                      ? "bg-secondary font-semibold text-ink"
                      : "text-muted-foreground"
                  }`}
                  style={{
                    height: GANTT_WEEK_HEADER_H,
                    background: isCurrent
                      ? undefined
                      : weekColumnBg(w.index, isCurrent),
                  }}
                  title={`Uke ${w.isoWeek}`}
                >
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    {w.isoWeek}
                  </div>
                  {showDays ? (
                    <div
                      className="grid shrink-0 grid-cols-7 border-t border-hairline/70"
                      style={{ height: GANTT_DAY_LETTER_H }}
                    >
                      {WEEKDAY_LETTERS_NB.map((letter, dayIdx) => (
                        <span
                          key={`${w.index}-${dayIdx}`}
                          className={`flex items-center justify-center text-[8px] font-medium leading-none ${
                            isCurrent
                              ? "text-ink/70"
                              : "text-muted-foreground/80"
                          } ${
                            dayIdx > 0 ? "border-l border-hairline/60" : ""
                          }`}
                        >
                          {letter}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {projects.map((p) => (
            <GanttTrackRow
              key={p.id}
              rowKey={p.id}
              project={p}
              weeks={weeks}
              showDays={showDays}
              currentWeekIndex={currentWeekIndex}
              markRange={markRange}
              blockDrag={blockDrag}
              blockResize={blockResize}
              blockLocked={lockedBlockIds?.has(p.id)}
              onMarkBegin={beginMark}
              onMarkExtend={extendMark}
              onBlockPointerDown={onBlockPointerDown}
              onBlockResizePointerDown={onBlockResizePointerDown}
            />
          ))}
          {Array.from({ length: emptyTrackCount }, (_, i) => (
            <GanttTrackRow
              key={`empty-${i}`}
              rowKey={`empty-${i}`}
              weeks={weeks}
              showDays={showDays}
              currentWeekIndex={currentWeekIndex}
              markRange={markRange}
              blockDrag={blockDrag}
              blockResize={blockResize}
              onMarkBegin={beginMark}
              onMarkExtend={extendMark}
              onBlockPointerDown={onBlockPointerDown}
              onBlockResizePointerDown={onBlockResizePointerDown}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
