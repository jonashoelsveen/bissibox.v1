/**
 * All-day / multi-day band under week and day weekday headers.
 * One lane is `rowHeight` tall. The band grows to the busiest visible day
 * so overlapping spans stack instead of cutting each other off.
 */
import { getSessionDefaultColor, sessionTileChrome, sessionWeekDayTileFill } from "@/components/library/CategoryActionsMenu";
import { useCalendarTheme } from "./calendarThemePref";
import {
  signupResponse,
  teamMemberTilePaint,
  useSyncOwnTeamSessionResponses,
  useTeamSessionResponses,
} from "@/lib/teamSessionResponse";
import { isMembershipOverlayEvent, isSharedCalendarReadOnly, type CalendarEvent } from "./yearStore";
import { fromISOLocal } from "./dateUtils";
import {
  allDayBandLaneAtCursor,
  allDayBandLaneForRange,
  bandCreateSpan,
  bandDragWantsTimeDrop,
  bandEventColumns,
  isAllDayBandEvent,
  untitledCalendarTitle,
  compactAllDayBandLanes,
  isMultiDaySession,
  layoutAllDayBand,
  resizedBandSpan,
  shiftedBandColumns,
} from "./multiDaySessions";
import { effectiveSortIndex } from "@/lib/duplicatePlacement";
import { isRepeatPreviewEventId } from "@/lib/sessionRepeat";
import { snapScrollLeft } from "@/lib/weekHorizontalScroll";
import { inertWeekEdgePulse, type WeekEdgePulse } from "./weekEdgePulse";
import { ChevronDown, ChevronUp } from "lucide-react";
import { createPortal } from "react-dom";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const TILE_DRAG_THRESHOLD_PX = 12;
const EMPTY_OVERLAP_ORDER = new Map<string, number>();
const BAND_EDGE_PX = 12;
const BAND_DURATION_MIN = 30;
const CHIP_INSET_X = 2;
const CHIP_INSET_Y = 1;

export function WeekAllDayBand({
  calId,
  events,
  overlapOrder,
  weekDates,
  rowHeight,
  gridTemplateColumns,
  isDayView,
  headerScrollbarGutterW,
  appKind = "calendar",
  activeEventId = null,
  markedEventIds,
  viewerRole = "owner",
  scrollerRef,
  startHour,
  spanHours,
  createPreview = null,
  /** Unsaved session. Shown as the create placeholder even while the row is collapsed. */
  draftEventId = null,
  onEventClick,
  onEventContextMenu,
  onEventDragStart,
  onDropToTime,
  onDropPreviewChange,
  onShiftDays,
  onResizeSpan,
  onResizeStart,
  onResizeEnd,
  onEmptyDoubleClick,
  onCreateSpan,
  expandPortalEl = null,
  freezeHeight = false,
  visibleColStart = null,
  visibleColEnd = null,
  contentWidth = null,
  columnWidth = null,
  renderColStart = null,
  renderColEnd = null,
  readPanScrollLeft,
  beginWeekEdgePulse,
}: {
  calId: string;
  events: CalendarEvent[];
  /** Order of sessions with no stored sort index. Shared with duplicate placement. */
  overlapOrder?: Map<string, number>;
  weekDates: Date[];
  rowHeight: number;
  gridTemplateColumns: string;
  isDayView: boolean;
  headerScrollbarGutterW: number;
  appKind?: "calendar" | "diary";
  activeEventId?: string | null;
  markedEventIds?: ReadonlySet<string>;
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  startHour: number;
  spanHours: number;
  createPreview?: { startCol: number; endCol: number } | null;
  draftEventId?: string | null;
  onEventClick: (ev: CalendarEvent, anchor: HTMLElement) => void;
  onEventContextMenu?: (
    e: React.MouseEvent,
    ev: CalendarEvent,
    anchor: HTMLElement,
  ) => void;
  onEventDragStart?: (id: string) => void;
  onDropToTime: (id: string, date: Date, startMin: number, durationMin: number) => void;
  onDropPreviewChange?: (
    preview: { colIdx: number; startMin: number; title: string; color: string | null } | null,
  ) => void;
  /** Move the whole session by whole days. Week view only. */
  onShiftDays?: (id: string, dayDelta: number) => void;
  /** Drag the left or right edge to change how many days the session covers. */
  onResizeSpan?: (id: string, next: { start: Date; end: Date }) => void;
  /** Hide the session menu while an edge is dragged, without unmounting it. */
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  /** Double-click an empty all-day cell — same create path as a timed cell. */
  onEmptyDoubleClick?: (colIdx: number, anchor: HTMLElement) => void;
  /**
   * Click-hold-drag across empty all-day cells. `startCol`/`endCol` are
   * ordered. Vertical pointer travel must not scroll the hour grid.
   */
  onCreateSpan?: (startCol: number, endCol: number, anchor: HTMLElement) => void;
  /** Week horizontal scroll: the expand cell is drawn in the frozen left column. */
  expandPortalEl?: HTMLElement | null;
  /** Keep the row height from when a horizontal scroll started. */
  freezeHeight?: boolean;
  /** Inclusive column range that decides the row height. Null uses every day. */
  visibleColStart?: number | null;
  visibleColEnd?: number | null;
  contentWidth?: number | null;
  /** Uniform day width. Chips are placed from the index instead of measuring. */
  columnWidth?: number | null;
  /** Inclusive columns to mount. Null mounts every day. */
  renderColStart?: number | null;
  renderColEnd?: number | null;
  beginWeekEdgePulse?: (onFrame: (scrollLeft: number) => void, onPulseEnd: () => void) => WeekEdgePulse;
  /** Horizontal pan offset of the hour grid, used when dropping into a time column. */
  readPanScrollLeft?: () => number;
}) {
  const teamResponses = useTeamSessionResponses();
  const darkTiles = useCalendarTheme() === "dark";
  const [bandOpen, setBandOpen] = useState(true);
  const signupSessionIds = useMemo(
    () =>
      events
        .filter((ev) => isMembershipOverlayEvent(ev, calId) && ev.signUpEnabled)
        .map((ev) => ev.id),
    [events, calId],
  );
  useSyncOwnTeamSessionResponses(signupSessionIds);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const colElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [colBoxes, setColBoxes] = useState<Array<{ left: number; width: number }>>([]);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    id: string;
    event: CalendarEvent;
    originCol: number;
    grabCol: number;
    spanStart: number;
    spanEnd: number;
    canDragOut: boolean;
    canShift: boolean;
    dayDelta: number;
    pointerStart: { x: number; y: number };
    offsetX: number;
    offsetY: number;
    pointerX: number;
    pointerY: number;
    chipWidth: number;
    moved: boolean;
  } | null>(null);
  const dragListenersRef = useRef<(() => void) | null>(null);
  const [ghost, setGhost] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  useLayoutEffect(() => {
    const d = dragRef.current;
    if (!d?.moved) return;
    const ghostEl = document.querySelector<HTMLElement>("[data-role='band-drag-ghost']");
    if (!ghostEl) return;
    ghostEl.style.left = `${d.pointerX - d.offsetX}px`;
    ghostEl.style.top = `${d.pointerY - d.offsetY}px`;
  });
  const [shiftPreview, setShiftPreview] = useState<{ startCol: number; endCol: number } | null>(
    null,
  );
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    id: string;
    startCol: number;
    endCol: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    edge: "start" | "end";
    event: CalendarEvent;
    visibleStart: number;
    visibleEnd: number;
    pointerStartX: number;
    moved: boolean;
  } | null>(null);
  const createDragRef = useRef<{
    originCol: number;
    pointerId: number;
    span: { startCol: number; endCol: number } | null;
    cursorFrac: number;
  } | null>(null);
  const createListenersRef = useRef<(() => void) | null>(null);
  const [createDragPreview, setCreateDragPreview] = useState<{
    startCol: number;
    endCol: number;
    cursorFrac: number;
  } | null>(null);
  /** Pointer Y from the create gesture, read once when the placeholder is born. */
  const pendingCursorFracRef = useRef<number | null>(null);
  const pinnedLaneRef = useRef<Map<string, number>>(new Map());
  const bandSpansRef = useRef<Array<{ id: string; startCol: number; endCol: number; lane: number }>>([]);
  const bandLaneCountRef = useRef(1);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  const columnWidthRef = useRef(columnWidth ?? 0);
  columnWidthRef.current = columnWidth ?? 0;
  const beginWeekEdgePulseRef = useRef(beginWeekEdgePulse);
  beginWeekEdgePulseRef.current = beginWeekEdgePulse;
  const readPanScrollLeftRef = useRef(readPanScrollLeft);
  readPanScrollLeftRef.current = readPanScrollLeft;

  const measure = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const origin = overlay.getBoundingClientRect();
    const next: Array<{ left: number; width: number }> = [];
    for (let i = 0; i < weekDates.length; i++) {
      const el = colElsRef.current[i];
      if (!el) {
        next.push({ left: 0, width: 0 });
        continue;
      }
      const r = el.getBoundingClientRect();
      next.push({ left: r.left - origin.left, width: r.width });
    }
    setColBoxes((prev) => {
      if (
        prev.length === next.length &&
        prev.every((p, i) => p.left === next[i].left && p.width === next[i].width)
      ) {
        return prev;
      }
      return next;
    });
  }, [weekDates.length]);

  useLayoutEffect(() => {
    if (columnWidth != null && columnWidth > 0) return;
    measure();
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ro = new ResizeObserver(measure);
    ro.observe(overlay);
    for (const el of colElsRef.current) {
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [measure, weekDates.length, columnWidth]);

  const bandItems = useMemo(() => {
    const items: Array<{
      ev: CalendarEvent;
      startCol: number;
      endCol: number;
    }> = [];
    for (const ev of events) {
      if (!isAllDayBandEvent(ev)) continue;
      const start = fromISOLocal(ev.startISO);
      const end = fromISOLocal(ev.endISO);
      const cols = bandEventColumns(start, end, weekDates);
      if (!cols) continue;
      items.push({ ev, startCol: cols.startCol, endCol: cols.endCol });
    }
    return items;
  }, [events, weekDates]);

  const bandLayout = useMemo(() => {
    const limitToView = visibleColStart != null && visibleColEnd != null;
    const viewStart = visibleColStart ?? 0;
    const viewEnd = visibleColEnd ?? Number.POSITIVE_INFINITY;
    const inView = (startCol: number, endCol: number) =>
      !limitToView || (endCol >= viewStart && startCol <= viewEnd);
    const mapped = bandItems.map(({ ev, startCol, endCol }) => {
      const live =
        resizePreview?.id === ev.id
          ? { startCol: resizePreview.startCol, endCol: resizePreview.endCol }
          : null;
      return {
        id: ev.id,
        startCol: live?.startCol ?? startCol,
        endCol: live?.endCol ?? endCol,
        sortIndex: effectiveSortIndex(ev, overlapOrder ?? EMPTY_OVERLAP_ORDER),
        fresh: !ev.title.trim(),
      };
    });
    // Placeholders keep the lane the pointer chose. Saving the name must not
    // pack them back to the top. Everyone else stays in creation order.
    // Sessions that do not cross the days on screen take no row.
    const heldIds = new Set(
      mapped
        .filter((item) => item.fresh || pinnedLaneRef.current.has(item.id))
        .map((item) => item.id),
    );
    const settled = mapped
      .filter((item) => !heldIds.has(item.id) && inView(item.startCol, item.endCol))
      .map(({ fresh: _fresh, ...item }) => item);
    const base = layoutAllDayBand(settled);
    const spans = base.spans.slice();
    const held = mapped
      .filter((item) => heldIds.has(item.id) && inView(item.startCol, item.endCol))
      .sort((a, b) => a.sortIndex - b.sortIndex || a.id.localeCompare(b.id));
    for (const item of held) {
      let prefer = pinnedLaneRef.current.get(item.id);
      if (prefer == null) {
        prefer = allDayBandLaneAtCursor(
          spans,
          item.startCol,
          item.endCol,
          pendingCursorFracRef.current,
        );
        pinnedLaneRef.current.set(item.id, prefer);
        pendingCursorFracRef.current = null;
      }
      const lane = allDayBandLaneAtCursor(
        spans,
        item.startCol,
        item.endCol,
        null,
        prefer,
      );
      spans.push({ id: item.id, startCol: item.startCol, endCol: item.endCol, lane });
    }
    if (!limitToView) {
      const laneCount = spans.reduce((count, span) => Math.max(count, span.lane + 1), 0);
      return { spans, laneCount };
    }
    return compactAllDayBandLanes(spans);
  }, [bandItems, overlapOrder, resizePreview, visibleColStart, visibleColEnd]);
  bandSpansRef.current = bandLayout.spans;
  const laneById = useMemo(() => {
    const lanes = new Map<string, number>();
    for (const span of bandLayout.spans) lanes.set(span.id, span.lane);
    return lanes;
  }, [bandLayout]);
  const shownCreatePreview = createDragPreview ?? createPreview;
  const placeholderCols = useMemo(() => {
    if (bandOpen) return null;
    const cols = new Set<number>();
    const cover = (startCol: number, endCol: number) => {
      const from = Math.min(startCol, endCol);
      const to = Math.max(startCol, endCol);
      for (let col = from; col <= to; col++) cols.add(col);
    };
    if (shownCreatePreview) cover(shownCreatePreview.startCol, shownCreatePreview.endCol);
    if (draftEventId) {
      const draft = bandItems.find((item) => item.ev.id === draftEventId);
      if (draft) cover(draft.startCol, draft.endCol);
    }
    return cols;
  }, [bandOpen, shownCreatePreview, draftEventId, bandItems]);
  const previewLane =
    shownCreatePreview == null
      ? null
      : allDayBandLaneAtCursor(
          bandLayout.spans,
          Math.min(shownCreatePreview.startCol, shownCreatePreview.endCol),
          Math.max(shownCreatePreview.startCol, shownCreatePreview.endCol),
          createDragPreview?.cursorFrac ?? null,
        );
  bandLaneCountRef.current = Math.max(1, bandLayout.laneCount);
  const shiftLane =
    shiftPreview == null
      ? null
      : allDayBandLaneForRange(
          bandLayout.spans.filter((span) => span.id !== draggingId),
          shiftPreview.startCol,
          shiftPreview.endCol,
        );
  const visibleStart = visibleColStart ?? 0;
  const visibleEnd = visibleColEnd ?? Math.max(0, weekDates.length - 1);
  let visibleLanes = 1;
  for (const span of bandLayout.spans) {
    if (span.endCol < visibleStart || span.startCol > visibleEnd) continue;
    visibleLanes = Math.max(visibleLanes, span.lane + 1);
  }
  if (
    previewLane != null &&
    shownCreatePreview &&
    Math.max(shownCreatePreview.startCol, shownCreatePreview.endCol) >= visibleStart &&
    Math.min(shownCreatePreview.startCol, shownCreatePreview.endCol) <= visibleEnd
  ) {
    visibleLanes = Math.max(visibleLanes, previewLane + 1);
  }
  if (
    shiftLane != null &&
    shiftPreview &&
    shiftPreview.endCol >= visibleStart &&
    shiftPreview.startCol <= visibleEnd
  ) {
    visibleLanes = Math.max(visibleLanes, shiftLane + 1);
  }
  const heightLanesRef = useRef(visibleLanes);
  if (!freezeHeight) heightLanesRef.current = visibleLanes;
  const heightLanes = freezeHeight ? heightLanesRef.current : visibleLanes;
  const bandHeight = (bandOpen ? heightLanes : 1) * rowHeight;
  const columnEventCounts = useMemo(() => {
    const counts = Array.from({ length: weekDates.length }, () => 0);
    for (const item of bandItems) {
      // The unsaved placeholder is not part of the collapsed count until save.
      if (item.ev.id === draftEventId) continue;
      for (let col = item.startCol; col <= item.endCol; col++) {
        if (col >= 0 && col < counts.length) counts[col] += 1;
      }
    }
    return counts;
  }, [bandItems, weekDates.length, draftEventId]);
  const chipHeight = Math.max(1, rowHeight - CHIP_INSET_Y * 2);

  const snapFromPointer = useCallback(
    (clientX: number, clientY: number): { colIdx: number; startMin: number } | null => {
      const scroller = scrollerRef.current;
      if (!scroller) return null;
      const grid = scroller.querySelector<HTMLElement>("[data-week-time-grid]");
      const rect = (grid ?? scroller).getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const header = scroller.querySelector<HTMLElement>("[data-week-sticky-header]");
      const visibleTop = Math.max(rect.top, scrollerRect.top + (header?.offsetHeight ?? 0));
      if (clientY < visibleTop) return null;
      const yInContent = grid ? clientY - rect.top : clientY - rect.top + scroller.scrollTop;
      const slots = spanHours * 2;
      const slot = Math.max(0, Math.min(slots - 1, Math.floor(yInContent / rowHeight)));
      const startMin = startHour * 60 + slot * 30;
      const width = columnWidthRef.current;
      let colIdx = 0;
      if (width > 0) {
        const x = grid
          ? clientX - rect.left
          : clientX - rect.left + (readPanScrollLeftRef.current?.() ?? 0);
        colIdx = Math.max(0, Math.min(weekDates.length - 1, Math.floor(x / width)));
      } else {
        let bestDist = Infinity;
        for (let i = 0; i < weekDates.length; i++) {
          const hit = scroller.querySelector(`[data-month-col="${i}"]`) as HTMLElement | null;
          if (!hit) continue;
          const hitRect = hit.getBoundingClientRect();
          if (clientX >= hitRect.left && clientX < hitRect.right) {
            colIdx = i;
            bestDist = 0;
            break;
          }
          const cx = (hitRect.left + hitRect.right) / 2;
          const dist = Math.abs(clientX - cx);
          if (dist < bestDist) {
            bestDist = dist;
            colIdx = i;
          }
        }
      }
      return { colIdx, startMin };
    },
    [scrollerRef, spanHours, rowHeight, startHour, weekDates.length],
  );

  const onDropPreviewChangeRef = useRef(onDropPreviewChange);
  onDropPreviewChangeRef.current = onDropPreviewChange;
  const onDropToTimeRef = useRef(onDropToTime);
  onDropToTimeRef.current = onDropToTime;
  const onShiftDaysRef = useRef(onShiftDays);
  onShiftDaysRef.current = onShiftDays;
  const onResizeSpanRef = useRef(onResizeSpan);
  onResizeSpanRef.current = onResizeSpan;
  const onResizeStartRef = useRef(onResizeStart);
  onResizeStartRef.current = onResizeStart;
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;
  const onCreateSpanRef = useRef(onCreateSpan);
  onCreateSpanRef.current = onCreateSpan;
  const onEventDragStartRef = useRef(onEventDragStart);
  onEventDragStartRef.current = onEventDragStart;
  const snapFromPointerRef = useRef(snapFromPointer);
  snapFromPointerRef.current = snapFromPointer;
  const weekDatesRef = useRef(weekDates);
  weekDatesRef.current = weekDates;

  const detachDragListeners = useCallback(() => {
    dragListenersRef.current?.();
    dragListenersRef.current = null;
  }, []);

  const endDrag = useCallback(() => {
    detachDragListeners();
    dragRef.current = null;
    resizeRef.current = null;
    if (document.body.style.cursor === "ew-resize") document.body.style.cursor = "";
    setGhost(null);
    setDraggingId(null);
    setResizingId(null);
    setShiftPreview(null);
    setResizePreview(null);
    onDropPreviewChangeRef.current?.(null);
  }, [detachDragListeners]);

  useEffect(
    () => () => {
      detachDragListeners();
      createListenersRef.current?.();
      createListenersRef.current = null;
      if (document.body.style.cursor === "ew-resize") document.body.style.cursor = "";
    },
    [detachDragListeners],
  );

  const detachCreateListeners = () => {
    createListenersRef.current?.();
    createListenersRef.current = null;
  };

  const cursorFracAt = (clientY: number): number => {
    const overlay = overlayRef.current;
    const lanes = Math.max(1, bandLaneCountRef.current);
    const height = Math.max(1, lanes * rowHeightRef.current);
    if (!overlay) return 0.5 / lanes;
    const top = overlay.getBoundingClientRect().top;
    const raw = Math.min(1, Math.max(0, (clientY - top) / height));
    const lane = Math.min(lanes - 1, Math.floor(raw * lanes));
    return (lane + 0.5) / lanes;
  };

  const beginCreateDrag = (e: React.PointerEvent<HTMLDivElement>, colIdx: number) => {
    if (!onCreateSpanRef.current || isDayView) return;
    if (appKind === "diary" || viewerRole !== "owner") return;
    if (e.button !== 0 || e.detail >= 2) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-real-event='1']")) return;
    e.stopPropagation();
    detachCreateListeners();
    const pointerId = e.pointerId;
    createDragRef.current = {
      originCol: colIdx,
      pointerId,
      span: null,
      cursorFrac: cursorFracAt(e.clientY),
    };
    const captureEl = e.currentTarget;
    captureEl.setPointerCapture?.(pointerId);
    // The hour grid edge-scrolls during a timed create. A multi-day bar has
    // no hour range, so pin vertical scroll and pan horizontally when the
    // pointer is held against either side — same as a drag that starts in
    // a timed row and jumps up into this band.
    const lockedScrollTop = scrollerRef.current?.scrollTop ?? 0;
    if (scrollerRef.current) scrollerRef.current.scrollTop = lockedScrollTop;
    let pointerX = e.clientX;
    let gridOrigin = 0;
    const cacheGridOrigin = () => {
      const node = scrollerRef.current;
      const grid = overlayRef.current?.parentElement;
      if (!node || !grid) return;
      gridOrigin = grid.getBoundingClientRect().left + node.scrollLeft;
    };
    cacheGridOrigin();
    const columnAtScroll = (clientX: number, scrollLeft: number): number => {
      const width = columnWidthRef.current;
      const count = weekDatesRef.current.length;
      if (width <= 0 || count <= 0) return 0;
      return Math.max(0, Math.min(count - 1, Math.floor((clientX - gridOrigin + scrollLeft) / width)));
    };
    const paintCreateBar = (startCol: number, endCol: number) => {
      const bar = overlayRef.current?.querySelector<HTMLElement>("[data-role='mark-create-preview-band']");
      const width = columnWidthRef.current;
      if (!bar || width <= 0) return;
      const start = Math.min(startCol, endCol);
      const end = Math.max(startCol, endCol);
      bar.style.left = `${start * width + CHIP_INSET_X}px`;
      bar.style.width = `${Math.max(0, (end - start + 1) * width - CHIP_INSET_X * 2)}px`;
    };
    let paintedKey = "";
    const publishSpan = (clientX: number, scrollLeft: number | null) => {
      const d = createDragRef.current;
      if (!d) return;
      const col =
        scrollLeft == null ? columnAtClientX(clientX) : columnAtScroll(clientX, scrollLeft);
      const span = bandCreateSpan(d.originCol, col);
      d.span = span;
      if (span) suppressClickRef.current = true;
      if (scrollLeft != null && span) {
        const key = `${span.startCol}:${span.endCol}`;
        if (key === paintedKey) return;
        paintedKey = key;
        paintCreateBar(span.startCol, span.endCol);
        return;
      }
      paintedKey = "";
      const cursorFrac = d.cursorFrac;
      setCreateDragPreview((prev) => {
        if (!span) return prev == null ? prev : null;
        if (
          prev &&
          prev.startCol === span.startCol &&
          prev.endCol === span.endCol &&
          prev.cursorFrac === cursorFrac
        ) {
          return prev;
        }
        return { ...span, cursorFrac };
      });
    };
    const endAfterPulse = { current: null as (() => void) | null };
    const pulse = (beginWeekEdgePulseRef.current ?? (() => inertWeekEdgePulse()))(
      (scrollLeft) => {
        publishSpan(pointerX, scrollLeft);
      },
      () => {
        const end = endAfterPulse.current;
        endAfterPulse.current = null;
        end?.();
      },
    );

    const onMove = (ev: PointerEvent) => {
      const d = createDragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      if (ev.cancelable) ev.preventDefault();
      pointerX = ev.clientX;
      const node = scrollerRef.current;
      pulse.over(ev.clientX);
      if (pulse.isPulsing()) {
        publishSpan(pointerX, node?.scrollLeft ?? 0);
        return;
      }
      if (node && node.scrollTop !== lockedScrollTop) node.scrollTop = lockedScrollTop;
      cacheGridOrigin();
      const span = bandCreateSpan(d.originCol, columnAtClientX(ev.clientX));
      d.span = span;
      d.cursorFrac = cursorFracAt(ev.clientY);
      if (span) suppressClickRef.current = true;
      const cursorFrac = d.cursorFrac;
      setCreateDragPreview((prev) => {
        if (!span) return prev == null ? prev : null;
        if (
          prev &&
          prev.startCol === span.startCol &&
          prev.endCol === span.endCol &&
          prev.cursorFrac === cursorFrac
        ) {
          return prev;
        }
        return { ...span, cursorFrac };
      });
    };
    const finish = (ev: PointerEvent) => {
      const d = createDragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      pulse.leave();
      const commit = () => {
        const current = createDragRef.current ?? d;
        const scroller = scrollerRef.current;
        const width = columnWidthRef.current;
        if (scroller && width > 0) {
          const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
          scroller.scrollLeft = snapScrollLeft(scroller.scrollLeft, width, max);
        }
        const span = ev.type === "pointercancel" ? null : current.span;
        createDragRef.current = null;
        setCreateDragPreview(null);
        detachCreateListeners();
        try {
          captureEl.releasePointerCapture?.(pointerId);
        } catch {
          /* capture may already be gone */
        }
        if (span) {
          pendingCursorFracRef.current = current.cursorFrac;
          const anchor = colElsRef.current[span.startCol] ?? captureEl;
          onCreateSpanRef.current?.(span.startCol, span.endCol, anchor);
        }
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 100);
      };
      if (pulse.isPulsing()) {
        endAfterPulse.current = commit;
        return;
      }
      commit();
    };
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    createListenersRef.current = () => {
      pulse.stop();
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
  };

  const columnBox = (col: number): { left: number; width: number } | undefined => {
    const width = columnWidthRef.current;
    if (width > 0) return { left: col * width, width };
    return colBoxes[col];
  };

  const columnAtClientX = (clientX: number): number => {
    const width = columnWidthRef.current;
    if (width > 0) {
      const grid = overlayRef.current?.parentElement;
      if (grid) {
        const rect = grid.getBoundingClientRect();
        const count = weekDatesRef.current.length;
        return Math.max(0, Math.min(count - 1, Math.floor((clientX - rect.left) / width)));
      }
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < weekDatesRef.current.length; i++) {
      const el = colElsRef.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) return i;
      const dist = Math.abs(clientX - (rect.left + rect.right) / 2);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  };

  const horizontalShift = (
    d: NonNullable<(typeof dragRef)["current"]>,
    clientX: number,
  ): { dayDelta: number; preview: { startCol: number; endCol: number } | null } => {
    const targetCol = columnAtClientX(clientX);
    const dayDelta = targetCol - d.grabCol;
    return {
      dayDelta,
      preview: shiftedBandColumns(
        d.spanStart,
        d.spanEnd,
        dayDelta,
        weekDatesRef.current.length,
      ),
    };
  };

  const wantsTimeDrop = (
    d: NonNullable<(typeof dragRef)["current"]>,
    clientY: number,
    dx: number,
    dy: number,
  ): boolean => {
    const scrollerTop =
      scrollerRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    return bandDragWantsTimeDrop({
      canDragOut: d.canDragOut,
      canShift: d.canShift,
      dx,
      dy,
      pointerY: clientY,
      scrollerTop,
      thresholdPx: TILE_DRAG_THRESHOLD_PX,
    });
  };

  const beginSpanResize = (
    edge: "start" | "end",
    e: React.PointerEvent<HTMLElement>,
    ev: CalendarEvent,
    spanStart: number,
    spanEnd: number,
  ) => {
    e.stopPropagation();
    detachDragListeners();
    dragRef.current = null;
    setGhost(null);
    setShiftPreview(null);
    document.body.style.cursor = "ew-resize";
    setResizingId(ev.id);
    setResizePreview({ id: ev.id, startCol: spanStart, endCol: spanEnd });
    resizeRef.current = {
      id: ev.id,
      edge,
      event: ev,
      visibleStart: spanStart,
      visibleEnd: spanEnd,
      pointerStartX: e.clientX,
      moved: false,
    };
    const spanAt = (clientX: number) => {
      const d = resizeRef.current;
      if (!d) return null;
      return resizedBandSpan({
        edge: d.edge,
        start: fromISOLocal(d.event.startISO),
        end: fromISOLocal(d.event.endISO),
        weekDates: weekDatesRef.current,
        visibleStart: d.visibleStart,
        visibleEnd: d.visibleEnd,
        targetCol: columnAtClientX(clientX),
      });
    };
    const onMove = (evMove: PointerEvent) => {
      const d = resizeRef.current;
      if (!d) return;
      const dx = evMove.clientX - d.pointerStartX;
      if (!d.moved && Math.abs(dx) <= TILE_DRAG_THRESHOLD_PX) return;
      if (evMove.cancelable) evMove.preventDefault();
      if (!d.moved) {
        d.moved = true;
        suppressClickRef.current = true;
        onResizeStartRef.current?.();
      }
      const span = spanAt(evMove.clientX);
      if (!span) return;
      setResizePreview({ id: d.id, startCol: span.startCol, endCol: span.endCol });
    };
    const finish = (evUp: PointerEvent) => {
      const d = resizeRef.current;
      if (d?.moved && evUp.type !== "pointercancel") {
        const span = spanAt(evUp.clientX);
        if (span) onResizeSpanRef.current?.(d.id, { start: span.start, end: span.end });
        onResizeEndRef.current?.();
      }
      endDrag();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 100);
    };
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    dragListenersRef.current = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
  };

  const onChipPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    ev: CalendarEvent,
    spanStart: number,
    spanEnd: number,
  ) => {
    if (appKind === "diary") return;
    if (e.button !== 0) return;
    if (isRepeatPreviewEventId(ev.id)) return;
    const start = fromISOLocal(ev.startISO);
    const end = fromISOLocal(ev.endISO);
    const owned =
      viewerRole === "owner" && !isMembershipOverlayEvent(ev, calId) && !isSharedCalendarReadOnly(ev.userCalendarId);
    const canDragOut = owned && !!ev.allDay && !isMultiDaySession(start, end);
    const canShift = owned && !isDayView;
    e.stopPropagation();
    if (!canDragOut && !canShift) return;
    const tileEl = e.currentTarget;
    const rect = tileEl.getBoundingClientRect();
    const edgePx = Math.min(BAND_EDGE_PX, rect.width / 3);
    if (!isDayView && owned && edgePx >= 4) {
      if (e.clientX <= rect.left + edgePx) {
        beginSpanResize("start", e, ev, spanStart, spanEnd);
        return;
      }
      if (e.clientX >= rect.right - edgePx) {
        beginSpanResize("end", e, ev, spanStart, spanEnd);
        return;
      }
    }
    detachDragListeners();
    const grabCol = columnAtClientX(e.clientX);
    let pointerX = e.clientX;
    let pointerY = e.clientY;
    const WEEK_GUTTER_PX = 48;
    const dayPane = () => {
      const node = scrollerRef.current;
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { node, left: rect.left + WEEK_GUTTER_PX, right: rect.right };
    };
    const clampedX = (clientX: number) => {
      const view = dayPane();
      if (!view) return clientX;
      return Math.max(view.left, Math.min(view.right - 0.01, clientX));
    };
    let gridOrigin = 0;
    const cacheGridOrigin = () => {
      const node = scrollerRef.current;
      const grid = overlayRef.current?.parentElement;
      if (!node || !grid) return;
      gridOrigin = grid.getBoundingClientRect().left + node.scrollLeft;
    };
    cacheGridOrigin();
    const columnAtScroll = (clientX: number, scrollLeft: number): number => {
      const width = columnWidthRef.current;
      const count = weekDatesRef.current.length;
      if (width <= 0 || count <= 0) return 0;
      return Math.max(0, Math.min(count - 1, Math.floor((clientX - gridOrigin + scrollLeft) / width)));
    };
    const paintShiftBar = (startCol: number, endCol: number) => {
      const bar = overlayRef.current?.querySelector<HTMLElement>("[data-role='band-shift-preview']");
      const width = columnWidthRef.current;
      if (!bar || width <= 0) return;
      const start = Math.min(startCol, endCol);
      const end = Math.max(startCol, endCol);
      bar.style.left = `${start * width + CHIP_INSET_X}px`;
      bar.style.width = `${Math.max(0, (end - start + 1) * width - CHIP_INSET_X * 2)}px`;
    };
    const refreshShift = (scrollLeft: number | null = null) => {
      const d = dragRef.current;
      if (!d?.moved || !d.canShift) return;
      if (scrollLeft != null) {
        const dayDelta = columnAtScroll(pointerX, scrollLeft) - d.grabCol;
        if (dayDelta === d.dayDelta) return;
        d.dayDelta = dayDelta;
        const preview = shiftedBandColumns(
          d.spanStart,
          d.spanEnd,
          dayDelta,
          weekDatesRef.current.length,
        );
        if (preview) paintShiftBar(preview.startCol, preview.endCol);
        setShiftPreview(preview);
        setGhost((prev) =>
          prev
            ? { ...prev, x: pointerX - d.offsetX, y: pointerY - d.offsetY }
            : prev,
        );
        return;
      }
      if (wantsTimeDrop(d, pointerY, pointerX - d.pointerStart.x, pointerY - d.pointerStart.y)) {
        const timeSnap = snapFromPointerRef.current(pointerX, pointerY);
        if (!timeSnap) return;
        d.dayDelta = 0;
        setShiftPreview(null);
        onDropPreviewChangeRef.current?.({
          colIdx: timeSnap.colIdx,
          startMin: timeSnap.startMin,
          title: d.event.title,
          color: d.event.color ?? null,
        });
        return;
      }
      const shift = horizontalShift(d, clampedX(pointerX));
      d.dayDelta = shift.dayDelta;
      setShiftPreview(shift.preview);
      onDropPreviewChangeRef.current?.(null);
    };
    const endAfterPulse = { current: null as (() => void) | null };
    const pulse = (beginWeekEdgePulseRef.current ?? (() => inertWeekEdgePulse()))(
      (scrollLeft) => {
        const d = dragRef.current;
        const ghostEl = document.querySelector<HTMLElement>("[data-role='band-drag-ghost']");
        if (ghostEl && d) {
          ghostEl.style.left = `${pointerX - d.offsetX}px`;
          ghostEl.style.top = `${pointerY - d.offsetY}px`;
        }
        refreshShift(scrollLeft);
      },
      () => {
        const end = endAfterPulse.current;
        endAfterPulse.current = null;
        end?.();
      },
    );
    dragRef.current = {
      id: ev.id,
      event: ev,
      originCol: spanStart,
      grabCol,
      spanStart,
      spanEnd,
      canDragOut,
      canShift,
      dayDelta: 0,
      pointerStart: { x: e.clientX, y: e.clientY },
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      pointerX: e.clientX,
      pointerY: e.clientY,
      chipWidth: rect.width,
      moved: false,
    };

    const onMove = (evMove: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = evMove.clientX - d.pointerStart.x;
      const dy = evMove.clientY - d.pointerStart.y;
      const moved =
        d.moved ||
        Math.abs(dx) > TILE_DRAG_THRESHOLD_PX ||
        Math.abs(dy) > TILE_DRAG_THRESHOLD_PX;
      if (!moved) return;
      if (evMove.cancelable) evMove.preventDefault();
      if (!d.moved) {
        d.moved = true;
        suppressClickRef.current = true;
        onEventDragStartRef.current?.(d.id);
        setDraggingId(d.id);
      }
      pointerX = evMove.clientX;
      pointerY = evMove.clientY;
      d.pointerX = pointerX;
      d.pointerY = pointerY;
      if (d.canShift) {
        pulse.over(evMove.clientX, {
          left: evMove.clientX - d.offsetX,
          right: evMove.clientX - d.offsetX + d.chipWidth,
        });
      }
      if (pulse.isPulsing()) {
        const ghostEl = document.querySelector<HTMLElement>("[data-role='band-drag-ghost']");
        if (ghostEl) {
          ghostEl.style.left = `${evMove.clientX - d.offsetX}px`;
          ghostEl.style.top = `${evMove.clientY - d.offsetY}px`;
        }
        refreshShift(scrollerRef.current?.scrollLeft ?? 0);
        return;
      }
      cacheGridOrigin();
      const timeSnap = wantsTimeDrop(d, evMove.clientY, dx, dy)
        ? snapFromPointerRef.current(evMove.clientX, evMove.clientY)
        : null;
      if (timeSnap) {
        d.dayDelta = 0;
        setShiftPreview(null);
        onDropPreviewChangeRef.current?.({
          colIdx: timeSnap.colIdx,
          startMin: timeSnap.startMin,
          title: d.event.title,
          color: d.event.color ?? null,
        });
      } else if (d.canShift) {
        const shift = horizontalShift(d, clampedX(evMove.clientX));
        d.dayDelta = shift.dayDelta;
        setShiftPreview(shift.preview);
        onDropPreviewChangeRef.current?.(null);
      } else {
        onDropPreviewChangeRef.current?.(null);
      }
      setGhost({
        event: d.event,
        x: evMove.clientX - d.offsetX,
        y: evMove.clientY - d.offsetY,
        width: d.chipWidth,
        height: chipHeight,
      });
    };

    const finish = (evUp: PointerEvent) => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      pulse.leave();
      const commit = () => {
      const d = dragRef.current;
      const scroller = scrollerRef.current;
      const width = columnWidthRef.current;
      if (scroller && width > 0 && d?.moved && d.canShift) {
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        const snapped = snapScrollLeft(scroller.scrollLeft, width, max);
        if (Math.abs(snapped - scroller.scrollLeft) > 0.5) scroller.scrollLeft = snapped;
      }
      const cancelled = evUp.type === "pointercancel";
      if (d?.moved && !cancelled) {
        const dx = evUp.clientX - d.pointerStart.x;
        const dy = evUp.clientY - d.pointerStart.y;
        const timeSnap = wantsTimeDrop(d, evUp.clientY, dx, dy)
          ? snapFromPointerRef.current(evUp.clientX, evUp.clientY)
          : null;
        onDropPreviewChangeRef.current?.(null);
        if (timeSnap) {
          const dates = weekDatesRef.current;
          const date = dates[timeSnap.colIdx] ?? dates[d.originCol];
          if (date) onDropToTimeRef.current(d.id, date, timeSnap.startMin, BAND_DURATION_MIN);
        } else if (d.canShift) {
          const shift = horizontalShift(d, clampedX(evUp.clientX));
          if (shift.preview && shift.dayDelta !== 0) {
            // Keep the row the drag outline used: the highest free lane.
            // A new row opens only when every lane is already taken.
            const lane = allDayBandLaneForRange(
              bandSpansRef.current.filter((span) => span.id !== d.id),
              shift.preview.startCol,
              shift.preview.endCol,
            );
            pinnedLaneRef.current.set(d.id, lane);
          }
          onShiftDaysRef.current?.(d.id, shift.dayDelta);
        }
      }
      endDrag();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 100);
      };
      if (pulse.isPulsing()) {
        endAfterPulse.current = commit;
        return;
      }
      commit();
    };

    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    dragListenersRef.current = () => {
      pulse.stop();
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
    };
  };

  const previewChrome = sessionTileChrome(getSessionDefaultColor(), false);
  const previewFill = sessionWeekDayTileFill(getSessionDefaultColor(), false, darkTiles);
  const expandButton = (
    <button
      type="button"
      aria-expanded={bandOpen}
      aria-label={bandOpen ? "Collapse all-day events" : "Expand all-day events"}
      onClick={() => setBandOpen((open) => !open)}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex w-full cursor-default select-none flex-col items-center justify-between border-b border-r border-hairline bg-card py-px text-muted-foreground transition-colors hover:bg-secondary hover:text-ink"
      style={{ height: bandHeight }}
    >
      {bandOpen ? (
        <>
          <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2.25} />
          <ChevronUp className="h-3 w-3 shrink-0" strokeWidth={2.25} />
        </>
      ) : (
        <>
          <ChevronUp className="h-3 w-3 shrink-0" strokeWidth={2.25} />
          <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2.25} />
        </>
      )}
    </button>
  );

  return (
    <div className={!isDayView ? "flex w-full" : undefined}>
      {expandPortalEl
        ? createPortal(expandButton, expandPortalEl)
        : null}
      <div
        className={`relative z-0 grid overflow-hidden bg-card ${!isDayView ? "min-w-0 flex-1" : ""}`}
        style={{
          gridTemplateColumns,
          height: bandHeight,
          ...(contentWidth != null ? { width: contentWidth } : null),
          ...(isDayView ? { width: "fit-content", marginInline: "auto" } : null),
        }}
      >
        {expandPortalEl ? null : expandButton}
        {weekDates.map((_, idx) => {
          if (renderColStart != null && renderColEnd != null && (idx < renderColStart || idx > renderColEnd)) {
            return null;
          }
          const eventCount = columnEventCounts[idx] ?? 0;
          return (
          <div
            key={`allday-col-${idx}`}
            ref={(el) => {
              colElsRef.current[idx] = el;
            }}
            data-allday-col={idx}
            className="select-none touch-none border-b border-r border-hairline bg-card"
            style={{
              height: bandHeight,
              ...(renderColStart != null ? { gridColumn: idx + 1 } : null),
            }}
            onPointerDown={(e) => beginCreateDrag(e, idx)}
            onDoubleClick={(e) => {
              if (!onEmptyDoubleClick) return;
              if (appKind === "diary" || viewerRole !== "owner") return;
              const target = e.target as HTMLElement;
              if (target.closest('[data-real-event="1"]')) return;
              e.preventDefault();
              e.stopPropagation();
              pendingCursorFracRef.current = cursorFracAt(e.clientY);
              onEmptyDoubleClick(idx, e.currentTarget);
            }}
          >
            {!bandOpen && eventCount > 0 && !placeholderCols?.has(idx) ? (
              <div className="pointer-events-none flex h-full min-w-0 items-center px-2 text-[12px] font-normal text-ink">
                <span className="truncate">
                  {eventCount === 1 ? "1 event" : `${eventCount} events`}
                </span>
              </div>
            ) : null}
          </div>
          );
        })}
        <div ref={overlayRef} className="pointer-events-none absolute inset-0">
          {bandItems.map(({ ev, startCol, endCol }) => {
            if (!bandOpen && ev.id !== draftEventId) return null;
            const resized = resizePreview?.id === ev.id ? resizePreview : null;
            const drawStart = resized?.startCol ?? startCol;
            const drawEnd = resized?.endCol ?? endCol;
            const boxStart = columnBox(drawStart);
            const boxEnd = columnBox(drawEnd);
            if (!boxStart || !boxEnd || boxStart.width <= 0) return null;
            const spanLeft = boxStart.left;
            const spanW = boxEnd.left + boxEnd.width - boxStart.left;
            const lane = bandOpen ? (laneById.get(ev.id) ?? 0) : 0;
            const isActive =
              activeEventId === ev.id ||
              draggingId === ev.id ||
              resizingId === ev.id ||
              !!markedEventIds?.has(ev.id);
            const chrome = isMembershipOverlayEvent(ev, calId)
              ? teamMemberTilePaint(
                  ev.color,
                  isActive,
                  signupResponse(ev.signUpEnabled, teamResponses, ev.id),
                  darkTiles,
                )
              : {
                  ...sessionTileChrome(ev.color, isActive),
                  fill: sessionWeekDayTileFill(ev.color, isActive, darkTiles),
                };
            const owned =
              appKind !== "diary" &&
              viewerRole === "owner" &&
              !isMembershipOverlayEvent(ev, calId) &&
              !isSharedCalendarReadOnly(ev.userCalendarId) &&
              !isRepeatPreviewEventId(ev.id);
            const canResizeEdge = owned && !isDayView;
            const chipWidth = Math.max(0, spanW - CHIP_INSET_X * 2);
            const edgePx = Math.min(BAND_EDGE_PX, Math.max(8, chipWidth / 3));
            return (
              <div
                key={ev.id}
                data-event-id={ev.id}
                className="pointer-events-none absolute select-none overflow-hidden rounded-[3px] text-[12px]"
                style={{
                  left: spanLeft + CHIP_INSET_X,
                  width: chipWidth,
                  top: lane * rowHeight + CHIP_INSET_Y,
                  height: chipHeight,
                  opacity: draggingId === ev.id ? 0.4 : 1,
                  zIndex: isActive ? 4 : 2,
                }}
              >
                <div
                  data-real-event="1"
                  data-event-id={ev.id}
                  data-session-active={isActive ? "1" : undefined}
                  className="pointer-events-auto absolute inset-0 cursor-default overflow-hidden rounded-[3px] py-0.5 pl-2 pr-1.5 ring-1 ring-black/5"
                  style={{
                    background: ev.color || isMembershipOverlayEvent(ev, calId)
                      ? chrome.fill
                      : "hsl(var(--primary) / 0.15)",
                    color: ev.color || isMembershipOverlayEvent(ev, calId)
                      ? chrome.fg
                      : "hsl(var(--ink, 220 13% 13%))",
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClickRef.current) return;
                    onEventClick(ev, e.currentTarget);
                  }}
                  onContextMenu={(e) => {
                    if (!onEventContextMenu) return;
                    if (isRepeatPreviewEventId(ev.id)) return;
                    onEventContextMenu(e, ev, e.currentTarget);
                  }}
                  onPointerDown={(e) => onChipPointerDown(e, ev, startCol, endCol)}
                >
                  <span
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                    style={{ background: chrome.bar }}
                  />
                  <div className="pointer-events-none flex h-full min-w-0 flex-col justify-start pl-1 pt-0.5 leading-tight">
                    <span className="truncate text-[12px] font-semibold leading-tight">
                      {ev.title.trim() || untitledCalendarTitle(true)}
                    </span>
                  </div>
                  {canResizeEdge && (
                    <>
                      <div
                        role="separator"
                        aria-label="Juster startdag"
                        data-resize-handle="start"
                        className="absolute bottom-0 left-0 top-0 z-[3] cursor-ew-resize touch-none"
                        style={{ width: edgePx }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          beginSpanResize("start", e, ev, startCol, endCol);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div
                        role="separator"
                        aria-label="Juster sluttdag"
                        data-resize-handle="end"
                        className="absolute bottom-0 right-0 top-0 z-[3] cursor-ew-resize touch-none"
                        style={{ width: edgePx }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          beginSpanResize("end", e, ev, startCol, endCol);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {bandOpen && shiftPreview &&
            shiftLane != null &&
            columnBox(shiftPreview.startCol) &&
            columnBox(shiftPreview.endCol) &&
            (columnBox(shiftPreview.startCol)?.width ?? 0) > 0 && (
              <div
                aria-hidden
                data-role="band-shift-preview"
                className="absolute rounded-[3px] border-2 border-solid border-black/40"
                style={{
                  borderColor: ghost?.event.color ? `${ghost.event.color}CC` : undefined,
                  left: (columnBox(shiftPreview.startCol)?.left ?? 0) + CHIP_INSET_X,
                  width: Math.max(
                    0,
                    (columnBox(shiftPreview.endCol)?.left ?? 0) +
                      (columnBox(shiftPreview.endCol)?.width ?? 0) -
                      (columnBox(shiftPreview.startCol)?.left ?? 0) -
                      CHIP_INSET_X * 2,
                  ),
                  top: shiftLane * rowHeight + CHIP_INSET_Y,
                  height: chipHeight,
                  pointerEvents: "none",
                  zIndex: 6,
                }}
              />
            )}
          {shownCreatePreview &&
            columnBox(shownCreatePreview.startCol) &&
            columnBox(shownCreatePreview.endCol) &&
            (columnBox(shownCreatePreview.startCol)?.width ?? 0) > 0 && (
              <div
                aria-hidden
                data-role="mark-create-preview-band"
                className="absolute select-none overflow-hidden rounded-[3px] py-0.5 pl-2 pr-1.5 text-[12px] ring-1 ring-black/5"
                style={{
                  left: (columnBox(shownCreatePreview.startCol)?.left ?? 0) + CHIP_INSET_X,
                  width: Math.max(
                    0,
                    (columnBox(shownCreatePreview.endCol)?.left ?? 0) +
                      (columnBox(shownCreatePreview.endCol)?.width ?? 0) -
                      (columnBox(shownCreatePreview.startCol)?.left ?? 0) -
                      CHIP_INSET_X * 2,
                  ),
                  top: (bandOpen ? (previewLane ?? 0) : 0) * rowHeight + CHIP_INSET_Y,
                  height: chipHeight,
                  background: previewFill,
                  color: previewChrome.fg,
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                <span
                  className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
                  style={{ background: previewChrome.bar }}
                />
                <div className="flex h-full min-w-0 flex-col justify-start pl-1 pt-0.5 leading-tight">
                  <span className="truncate text-[12px] font-semibold leading-tight">{untitledCalendarTitle(true)}</span>
                </div>
              </div>
            )}
          {expandPortalEl ? null : (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-full z-10 h-2.5"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0))",
            }}
          />
          )}
        </div>
      </div>
      {!isDayView && headerScrollbarGutterW > 0 && (
        <div
          aria-hidden
          className="flex-none border-b border-hairline bg-card"
          style={{ width: headerScrollbarGutterW, height: bandHeight }}
        />
      )}
      {ghost &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-role="band-drag-ghost"
            className="pointer-events-none fixed z-[10000] overflow-hidden rounded-[3px] py-0.5 pl-2 pr-1.5 text-[12px] ring-1 ring-black/5 shadow-lg"
            style={{
              left: ghost.x,
              top: ghost.y,
              width: ghost.width,
              height: ghost.height,
              background: (isMembershipOverlayEvent(ghost.event, calId)
                ? teamMemberTilePaint(
                    ghost.event.color,
                    true,
                    signupResponse(ghost.event.signUpEnabled, teamResponses, ghost.event.id),
                    darkTiles,
                  )
                : {
                    ...sessionTileChrome(ghost.event.color, true),
                    fill: sessionWeekDayTileFill(ghost.event.color, true, darkTiles),
                  }
              ).fill,
              color: (isMembershipOverlayEvent(ghost.event, calId)
                ? teamMemberTilePaint(
                    ghost.event.color,
                    true,
                    signupResponse(ghost.event.signUpEnabled, teamResponses, ghost.event.id),
                    darkTiles,
                  )
                : sessionTileChrome(ghost.event.color, true)
              ).fg,
              opacity: 0.85,
            }}
          >
            <span
              className="pointer-events-none absolute left-0 top-0 bottom-0 w-[4px]"
              style={{
                background: (isMembershipOverlayEvent(ghost.event, calId)
                  ? teamMemberTilePaint(
                      ghost.event.color,
                      true,
                      signupResponse(ghost.event.signUpEnabled, teamResponses, ghost.event.id),
                      darkTiles,
                    )
                  : sessionTileChrome(ghost.event.color, true)
                ).bar,
              }}
            />
            <div className="flex h-full min-w-0 flex-col justify-start pl-1 pt-0.5 leading-tight">
              <span className="truncate text-[12px] font-semibold leading-tight">
                {ghost.event.title.trim() || untitledCalendarTitle(true)}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
