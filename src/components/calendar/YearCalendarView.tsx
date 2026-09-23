/**
 * YearCalendarView — full year view orchestrator.
 *
 * Wraps the editable title (H1, double-click to rename), a settings gear,
 * and the unified elastic grid. The right-side overview panel was removed —
 * the grid now expands fully to the right edge of the page.
 *
 * Owns the shared `currentDate` (and `currentRange`) state so the mini
 * calendar in the grid header and the main view stay in lockstep.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarChart3, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  StatsChartView,
  allowedBucketsForTimeframe,
  type TimeframeKey,
  type XBucket,
} from "./StatsChartView";
import { useDiaryVisibilitySafe } from "./DiaryVisibilityContext";

import { useYearStore, type CellKey, type CalendarEvent } from "./yearStore";
import { UnifiedElasticGrid, HeaderDropdown, type ViewMode, type ExtendedViewMode } from "./UnifiedElasticGrid";
import { MonthNavControl } from "./MonthNavControl";
import { YearGrid } from "./YearGrid";
import { miniCalendarViewMode, type DateRange } from "./MiniCalendar";
import { addDays, isoWeekNumber, startOfWeekMon } from "./dateUtils";
import { useCalendarViewActions, useCalendarViewActionsOptional, CalendarViewActionsProvider } from "./CalendarViewActionsContext";
import { CalendarInfoToast } from "./CalendarInfoToast";
import { useShortcut } from "@/hooks/useShortcut";
import { categoryKeyFromColor, type CategoryKey } from "./CalendarSideNav";
// Strava integration removed; diary/strava activity sync is no longer available.
import { useUserCategories } from "@/hooks/useUserCategories";
import { useCalendarSearchSafe } from "./CalendarSearchContext";
import { useMacroProjectNavSafe } from "./MacroProjectNavContext";
import type { CalendarScale } from "./CalendarSearch";
import { GanttYearGrid } from "./GanttYearGrid";
import { GanttMacroZoomControl } from "./GanttMacroZoomControl";
import { GanttItemPanel } from "./GanttItemPanel";
import {
  HEADER_CLUSTER_GAP_PX,
  HEADER_CLUSTER_SHOW_SLACK_PX,
  nextHeaderClusterHiding,
} from "./headerClusterVisibility";
import { unionGanttDaySpan, weeksForCalendarYear } from "./ganttWeeks";
import { useMembershipCalendarSafe } from "./MembershipCalendarContext";
import { useEntityGroupVisibilitySafe } from "./EntityGroupVisibilityContext";

/** Keep a newly saved titled session visible this long when its activity tab is hidden,
 *  so it doesn't share the instant fade of an untitled cancelled draft. */
const HIDDEN_NEW_SESSION_LINGER_MS = 1000;


const MONTHS_NB = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

/** Cmd+V target: month-cell focus, highlighted week column, or the nav date. */
function dateForSessionPaste(
  viewMode: ViewMode,
  currentDate: Date,
  selected: CellKey | null,
  monthAnchor: Date | null,
): Date {
  if (viewMode === "month" && monthAnchor) return monthAnchor;
  if (viewMode === "week" && selected != null) {
    const col = selected.month;
    if (col >= 0 && col <= 6) {
      const monday = startOfWeekMon(currentDate);
      return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + col);
    }
  }
  return currentDate;
}

function ViewTitle({ viewMode, currentDate }: { viewMode: ExtendedViewMode; currentDate: Date }) {
  const month = MONTHS_NB[currentDate.getMonth()];
  const year = currentDate.getFullYear();
  const fontStyle = { fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' };
  const widestMonth = "September";
  let ghost: ReactNode;
  let content: ReactNode;
  if (viewMode === "week") {
    const wk = isoWeekNumber(currentDate);
    ghost = (
      <>
        <span className="font-semibold">Uke 53 {widestMonth}</span>{" "}
        <span className="font-normal">{year}</span>
      </>
    );
    content = (
      <>
        <span className="font-semibold">Uke {wk} {month}</span>{" "}
        <span className="font-normal">{year}</span>
      </>
    );
  } else if (viewMode === "day") {
    ghost = (
      <>
        <span className="font-semibold">30. {widestMonth}</span>{" "}
        <span className="font-normal">{year}</span>
      </>
    );
    content = (
      <>
        <span className="font-semibold">{currentDate.getDate()}. {month}</span>{" "}
        <span className="font-normal">{year}</span>
      </>
    );
  } else if (viewMode === "year") {
    ghost = <span className="font-semibold tabular-nums">8888</span>;
    content = <span className="font-semibold tabular-nums">{year}</span>;
  } else {
    ghost = (
      <>
        <span className="font-semibold">{widestMonth}</span>{" "}
        <span className="font-normal">{year}</span>
      </>
    );
    content = (
      <>
        <span className="font-semibold">{month}</span>{" "}
        <span className="font-normal">{year}</span>
      </>
    );
  }
  return (
    <h1 className="relative whitespace-nowrap text-xl text-ink" style={fontStyle}>
      <span className="invisible" aria-hidden="true">{ghost}</span>
      <span className="absolute inset-0">{content}</span>
    </h1>
  );
}


export type CalendarSeat = "admin" | "individual";
export type CalendarAppKind = "calendar" | "diary";

export interface YearCalendarViewProps {
  calId: string;
  defaultTitle: string;
  seat?: CalendarSeat;
  currentDate?: Date;
  currentRange?: DateRange;
  onCurrentDateChange?: (date: Date, range?: DateRange) => void;
  viewMode?: ExtendedViewMode;
  onViewModeChange?: (v: ExtendedViewMode) => void;
  /** Year view: week-number click tints the week (mini-cal follows in week mode). */
  yearWeekHighlight?: boolean;
  onYearWeekHighlightChange?: (active: boolean) => void;
  /** Year view: month-header click tints the month. */
  yearMonthHighlight?: boolean;
  onYearMonthHighlightChange?: (active: boolean) => void;

  visibleCategories?: Set<CategoryKey>;
  /** "diary" restricts to week/month/year, blocks future logging. */
  appKind?: CalendarAppKind;
  /** When viewing a member's diary as a leader/follower, the member's user_id. */
  memberId?: string;
  /** Viewer's relationship to the member; defaults to "owner". */
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  /** When the surrounding left panel is closed, the header makes room for the panel toggle icon. */
  panelOpen?: boolean;
  /** When the surrounding right panel is closed, the header right cluster makes room for the right panel toggle icon. */
  rightPanelOpen?: boolean;
  /** Team scope for resolving the user's category list (defaults to personal). */
  teamId?: string | null;
  /** Lowercase hex colors the viewer has toggled off locally (coach view). */
  hiddenColors?: Set<string>;
  /** Controlled "statistics view" toggle (diary only). */
  statsActive?: boolean;
  onStatsActiveChange?: (next: boolean) => void;
  /** Micro = day/week/month grid; Macro = year Gantt shell. */
  calendarScale?: CalendarScale;
}

export function YearCalendarView(props: YearCalendarViewProps) {
  const ctx = useCalendarViewActionsOptional();
  if (!ctx) {
    return (
      <CalendarViewActionsProvider calId={props.calId}>
        <YearCalendarViewInner {...props} />
      </CalendarViewActionsProvider>
    );
  }
  return <YearCalendarViewInner {...props} />;
}

function YearCalendarViewInner({
  calId,
  defaultTitle,
  seat = "individual",
  currentDate: currentDateProp,
  currentRange: currentRangeProp,
  onCurrentDateChange,
  viewMode: viewModeProp,
  onViewModeChange,
  yearWeekHighlight: yearWeekHighlightProp,
  onYearWeekHighlightChange,
  yearMonthHighlight: yearMonthHighlightProp,
  onYearMonthHighlightChange,
  visibleCategories,
  appKind = "calendar",
  memberId,
  viewerRole = "owner",
  panelOpen = true,
  rightPanelOpen = true,
  teamId = null,
  hiddenColors,
  statsActive: statsActiveProp,
  onStatsActiveChange,
  calendarScale = "micro",
}: YearCalendarViewProps) {
  const { data, meta, upsertCell, upsertCells, fillRange, setMeta } =
    useYearStore(calId, defaultTitle);
  const {
    events,
    upsertEvent,
    reorderEvents,
    moveEvent,
    deleteEvent,
    deleteEvents,
    acceptCoachSession,
    canPaste,
    pasteAtDate,
    peekPasteAnchorDate,
  } = useCalendarViewActions();

  const membershipCalendar = useMembershipCalendarSafe();
  const entityGroupVisibility = useEntityGroupVisibilitySafe();
  const overlayIdSet = useMemo(() => {
    if (seat !== "individual") return new Set<string>();
    return new Set(events.filter((e) => e.entityId).map((e) => e.id));
  }, [events, seat]);

  const stravaEvents: CalendarEvent[] = [];

  // Read the user's category list so we can tell which `me:#color` keys are
  // explicitly hidden. Anything NOT in this hidden set is treated as visible —
  // including freshly-created categories that haven't propagated through the
  // sidebar's realtime refresh yet. This eliminates the race where a new
  // category was picked for a session immediately after creation and the
  // resulting event got filtered out until the page refreshed.
  const { categories: userCats } = useUserCategories({ teamId });
  const { categories: diaryActivityCats } = useUserCategories({
    teamId,
    ownerId: memberId,
    kind: "diary_activity",
  });
  const { categories: ganttProjects, create: createGanttProject, update: updateGanttProject, remove: removeGanttProject } =
    useUserCategories({
      teamId,
      kind: "gantt_project",
    });
  const { openProjectId, setOpenProjectId } = useMacroProjectNavSafe();
  const {
    categories: allGanttPhases,
    create: createGanttPhase,
    update: updateGanttPhase,
    remove: removeGanttPhase,
  } = useUserCategories({
    teamId,
    kind: "gantt_phase",
    allParents: true,
  });
  const isMacro = calendarScale === "macro";
  const ganttPhases = useMemo(
    () =>
      openProjectId
        ? allGanttPhases.filter((p) => p.parent_id === openProjectId)
        : [],
    [allGanttPhases, openProjectId],
  );
  const lockedGanttBlockIds = useMemo(() => {
    if (openProjectId) return undefined;
    return new Set(ganttProjects.map((p) => p.id));
  }, [openProjectId, ganttProjects]);
  const [ganttPanel, setGanttPanel] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [ganttLiveSpan, setGanttLiveSpan] = useState<{
    gantt_start_date: string;
    gantt_end_date: string;
  } | null>(null);
  const diaryVisibility = useDiaryVisibilitySafe();
  const hiddenMeColors = useMemo(() => {
    const s = new Set<string>();
    for (const c of userCats) {
      if (c.hidden) s.add(`me:${c.color.toLowerCase()}`);
    }
    return s;
  }, [userCats]);
  // Per-category hidden set keyed by category id. Filtering sessions by id
  // (rather than by color) eliminates ordering / color-collision bugs where
  // two categories sharing the same color would toggle each other's events.
  const hiddenCategoryIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of userCats) if (c.hidden) s.add(c.id);
    return s;
  }, [userCats]);


  // Coach viewing a client: no longer per-category gated — the coach
  // sees every event in the client's personal calendar. Local hide toggles
  // are applied via `hiddenColors` passed from the parent.
  const { user } = useAuth();
  const isCoachViewer =
    !!memberId && !!user && memberId !== user.id && appKind === "calendar";

  /** Event ids allowed through the hidden-category filter until this timestamp. */
  const [hiddenLingerUntilById, setHiddenLingerUntilById] = useState<Record<string, number>>(
    {},
  );
  const knownEventIdsRef = useRef<Set<string>>(new Set());
  const knownEventsPrimedRef = useRef(false);
  const lingerTimersRef = useRef<Map<string, number>>(new Map());
  const lingerCalIdRef = useRef(calId);

  const isHiddenByActivityTab = useMemo(() => {
    return (e: CalendarEvent): boolean => {
      if (!visibleCategories) return false;
      if (e.diaryType === "training") return !visibleCategories.has("ind:training");
      let key = categoryKeyFromColor(e.color);
      if (!e.categoryId && key.startsWith("admin:")) {
        key = `me:${(e.color ?? "").toLowerCase()}` as CategoryKey;
      }
      if (key.startsWith("me:")) {
        const cid = e.categoryId;
        if (cid) return hiddenCategoryIds.has(cid);
        return hiddenMeColors.has(key);
      }
      return !visibleCategories.has(key);
    };
  }, [visibleCategories, hiddenCategoryIds, hiddenMeColors]);

  // When a titled session first appears under a hidden activity tab, keep it
  // on the grid for 1s so the save is distinguishable from an untitled discard.
  // useLayoutEffect so the linger is applied before paint (no hide→show flash).
  useLayoutEffect(() => {
    if (lingerCalIdRef.current !== calId) {
      lingerCalIdRef.current = calId;
      knownEventsPrimedRef.current = false;
      knownEventIdsRef.current = new Set();
      setHiddenLingerUntilById({});
      for (const timer of lingerTimersRef.current.values()) window.clearTimeout(timer);
      lingerTimersRef.current.clear();
    }

    const known = knownEventIdsRef.current;
    if (!knownEventsPrimedRef.current) {
      knownEventsPrimedRef.current = true;
      for (const e of events) known.add(e.id);
      return;
    }

    const liveIds = new Set(events.map((e) => e.id));
    for (const id of [...known]) {
      if (!liveIds.has(id)) known.delete(id);
    }

    const now = Date.now();
    const toLinger: string[] = [];
    for (const e of events) {
      if (known.has(e.id)) continue;
      known.add(e.id);
      if (!e.title.trim()) continue;
      if (!isHiddenByActivityTab(e)) continue;
      toLinger.push(e.id);
    }
    if (toLinger.length === 0) return;

    setHiddenLingerUntilById((prev) => {
      const next = { ...prev };
      for (const id of toLinger) next[id] = now + HIDDEN_NEW_SESSION_LINGER_MS;
      return next;
    });

    for (const id of toLinger) {
      const prevTimer = lingerTimersRef.current.get(id);
      if (prevTimer != null) window.clearTimeout(prevTimer);
      const timer = window.setTimeout(() => {
        lingerTimersRef.current.delete(id);
        setHiddenLingerUntilById((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _removed, ...rest } = prev;
          return rest;
        });
      }, HIDDEN_NEW_SESSION_LINGER_MS);
      lingerTimersRef.current.set(id, timer);
    }
  }, [events, isHiddenByActivityTab, calId]);

  useEffect(
    () => () => {
      for (const timer of lingerTimersRef.current.values()) window.clearTimeout(timer);
      lingerTimersRef.current.clear();
    },
    [],
  );

  const mergedEvents = useMemo(() => {
    const stravaForDiary = appKind === "diary" ? stravaEvents : [];
    const localById = new Map(events.map((e) => [e.id, e]));
    const stravaIds = new Set(stravaForDiary.map((e) => e.id));
    const mergedStrava = stravaForDiary.map((s) => {
      const local = localById.get(s.id);
      if (!local) return s;
      const overrides: Record<string, unknown> = {};
      for (const k of Object.keys(local) as Array<keyof CalendarEvent>) {
        const v = local[k];
        if (v !== undefined && v !== null && v !== "") overrides[k as string] = v;
      }
      return { ...s, ...overrides, id: s.id } as CalendarEvent;
    });
    const localOnly = events.filter((e) => !stravaIds.has(e.id));
    const withMembershipPrefs: CalendarEvent[] =
      membershipCalendar && seat === "individual"
        ? localOnly.flatMap((e) => {
            if (!e.entityId) return [e];
            if (membershipCalendar.isHidden(e.entityId)) return [];
            const overlay = membershipCalendar.overlayColor(e.entityId);
            return overlay ? [{ ...e, color: overlay }] : [e];
          })
        : localOnly;
    const base = [...withMembershipPrefs, ...mergedStrava];
    const now = Date.now();

    const passesLocalHide = (e: CalendarEvent) => {
      if (!hiddenColors || hiddenColors.size === 0) return true;
      const c = (e.color ?? "").toLowerCase();
      return !hiddenColors.has(c);
    };

    const passesCategoryHide = (e: CalendarEvent): boolean => {
      if (!diaryVisibility || appKind !== "diary") return true;
      if (e.id.startsWith("strava:")) return true;
      const c = (e.color ?? "").toLowerCase();
      const matchingCat = diaryActivityCats.find((cat) => cat.color.toLowerCase() === c);
      if (matchingCat && diaryVisibility.isCategoryHidden(matchingCat.id)) return false;
      return true;
    };

    const passesSportTypeHide = (e: CalendarEvent): boolean => {
      if (!diaryVisibility || appKind !== "diary") return true;
      if (!e.id.startsWith("strava:")) return true;
      const sport = e.sportType ?? "";
      if (!sport) return true;
      return !diaryVisibility.isSportTypeHidden(sport);
    };

    const filterChain = (e: CalendarEvent) =>
      passesLocalHide(e) && passesCategoryHide(e) && passesSportTypeHide(e);

    const passesGroupHide = (e: CalendarEvent) => {
      if (seat !== "admin" || !entityGroupVisibility) return true;
      return entityGroupVisibility.isSessionVisible(e.appGroupId ?? null);
    };

    const isLingeringHidden = (e: CalendarEvent) => {
      const until = hiddenLingerUntilById[e.id];
      return until != null && now < until;
    };

    if (!visibleCategories) {
      return base.filter((e) => passesGroupHide(e) && (e.entityId || filterChain(e)));
    }
    return base.filter((e) => {
      if (!passesGroupHide(e)) return false;
      if (e.entityId) return true;
      if (!filterChain(e)) return false;
      if (e.diaryType === "training") {
        return visibleCategories.has("ind:training") || isLingeringHidden(e);
      }
      let key = categoryKeyFromColor(e.color);
      // Uncategorized sessions (imports, free-color tiles) must not disappear
      // behind admin tabs just because their hex collides with meeting/event/race.
      if (!e.categoryId && key.startsWith("admin:")) {
        key = `me:${(e.color ?? "").toLowerCase()}` as CategoryKey;
      }
      if (key.startsWith("me:")) {
        // Prefer per-id filtering when the event carries its categoryId so
        // two categories sharing the same color don't toggle each other.
        const cid = (e as { categoryId?: string | null }).categoryId;
        const hidden = cid ? hiddenCategoryIds.has(cid) : hiddenMeColors.has(key);
        if (!hidden) return true;
        return isLingeringHidden(e);
      }
      if (visibleCategories.has(key)) return true;
      return isLingeringHidden(e);
    });
  }, [
    events,
    stravaEvents,
    visibleCategories,
    appKind,
    hiddenMeColors,
    hiddenCategoryIds,
    isCoachViewer,
    hiddenColors,
    diaryVisibility,
    diaryActivityCats,
    hiddenLingerUntilById,
    membershipCalendar,
    entityGroupVisibility,
    seat,
  ]);

  // Publish the (pre-filter) event list to the side-panel search so it can
  // surface matches regardless of which categories are currently hidden.
  const search = useCalendarSearchSafe();
  const publishSearchEvents = search?.publishEvents;
  useEffect(() => {
    if (!publishSearchEvents) return;
    publishSearchEvents(events);
  }, [events, publishSearchEvents]);


  const [selected, setSelected] = useState<CellKey | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meta.title);

  // Shared "what is the calendar showing?" state — drives both the main grid
  // and the mini-calendar navigator at the top-right of the grid. Falls back
  // to internal state when no controlled value is supplied (legacy usage).
  const [internalDate, setInternalDate] = useState<Date>(() => new Date());
  const [internalRange, setInternalRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const currentDate = currentDateProp ?? internalDate;
  const currentRange = currentRangeProp ?? internalRange;
  const ganttYear = currentDate.getFullYear();
  const ganttWeeks = useMemo(() => weeksForCalendarYear(ganttYear), [ganttYear]);
  /** Project list bars = live union of child phase spans (not stored on the project). */
  const ganttTracks = useMemo(() => {
    if (openProjectId) return ganttPhases;
    return ganttProjects.map((project) => {
      const phases = allGanttPhases.filter((p) => p.parent_id === project.id);
      const union = unionGanttDaySpan(ganttWeeks, phases);
      if (!union) {
        return {
          ...project,
          gantt_start_week: null,
          gantt_end_week: null,
          gantt_start_date: null,
          gantt_end_date: null,
        };
      }
      return { ...project, ...union };
    });
  }, [openProjectId, ganttPhases, ganttProjects, allGanttPhases, ganttWeeks]);
  const ganttPanelItem = useMemo(
    () => (ganttPanel ? ganttTracks.find((t) => t.id === ganttPanel.id) ?? null : null),
    [ganttPanel, ganttTracks],
  );

  useEffect(() => {
    setGanttPanel(null);
    setGanttLiveSpan(null);
  }, [openProjectId, isMacro]);

  useEffect(() => {
    if (ganttPanel && !ganttPanelItem) {
      setGanttPanel(null);
      setGanttLiveSpan(null);
    }
  }, [ganttPanel, ganttPanelItem]);
  const updateCurrent = (d: Date, r?: DateRange) => {
    if (onCurrentDateChange) onCurrentDateChange(d, r);
    else {
      setInternalDate(d);
      setInternalRange(r ?? { start: d, end: d });
    }
  };
  const [internalViewMode, setInternalViewMode] = useState<ExtendedViewMode>("month");
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = (v: ExtendedViewMode) => {
    if (onViewModeChange) onViewModeChange(v);
    else setInternalViewMode(v);
  };
  const [internalYearWeekHighlight, setInternalYearWeekHighlight] = useState(false);
  const yearWeekHighlight = yearWeekHighlightProp ?? internalYearWeekHighlight;
  const setYearWeekHighlight = (active: boolean) => {
    if (yearWeekHighlightProp === undefined) setInternalYearWeekHighlight(active);
    onYearWeekHighlightChange?.(active);
  };
  const [internalYearMonthHighlight, setInternalYearMonthHighlight] = useState(false);
  const yearMonthHighlight = yearMonthHighlightProp ?? internalYearMonthHighlight;
  const setYearMonthHighlight = (active: boolean) => {
    if (yearMonthHighlightProp === undefined) setInternalYearMonthHighlight(active);
    onYearMonthHighlightChange?.(active);
  };
  useEffect(() => {
    if (viewMode !== "year") {
      setYearWeekHighlight(false);
      setYearMonthHighlight(false);
    }
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Coerced view mode used by parts of the UI that only understand
   * day/week/month (the grid, side nav, MonthNavControl). */
  const gridViewMode: ViewMode = viewMode === "year" ? "month" : viewMode;
  const navMiniViewMode = miniCalendarViewMode(
    viewMode,
    yearWeekHighlight,
    yearMonthHighlight,
  );

  /** Keep year view on this year when the week's Monday falls in December. */
  const dateInYearForWeek = (anchor: Date, year: number) => {
    const monday = startOfWeekMon(anchor);
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (d.getFullYear() === year) return d;
    }
    return monday;
  };

  // Diary-only: toggle between the calendar grid and the statistics chart.
  const [internalStatsActive, setInternalStatsActive] = useState(false);
  const statsActive = statsActiveProp ?? internalStatsActive;
  const setStatsActive = (next: boolean) => {
    if (onStatsActiveChange) onStatsActiveChange(next);
    else setInternalStatsActive(next);
  };
  const showStatsToggle = appKind === "diary";

  /** Calendar day/week: hide the hour scale and stack sessions at equal height. */
  const [hideTimeScale, setHideTimeScale] = useState(false);
  const showTimeScaleToggle =
    appKind === "calendar" && (viewMode === "day" || viewMode === "week");
  const headerClusterHostRef = useRef<HTMLDivElement | null>(null);
  const headerClusterRef = useRef<HTMLDivElement | null>(null);
  const clockBtnRef = useRef<HTMLButtonElement | null>(null);
  const viewTypeRef = useRef<HTMLDivElement | null>(null);
  const todayBtnRef = useRef<HTMLButtonElement | null>(null);
  const clockWidthRef = useRef(32);
  const todayWidthRef = useRef(58);
  const viewTypeWidthRef = useRef(108);
  const [hideToday, setHideToday] = useState(false);
  const [hideViewType, setHideViewType] = useState(false);
  const hideTodayRef = useRef(hideToday);
  const hideViewTypeRef = useRef(hideViewType);
  hideTodayRef.current = hideToday;
  hideViewTypeRef.current = hideViewType;
  const [pasteToast, setPasteToast] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (statsActive || isMacro) {
      setHideToday(false);
      setHideViewType(false);
      return;
    }
    const parent = headerClusterHostRef.current;
    const cluster = headerClusterRef.current;
    if (!parent || !cluster) return;

    const measure = () => {
      const clockEl = clockBtnRef.current;
      const todayEl = todayBtnRef.current;
      const viewEl = viewTypeRef.current;
      if (clockEl) clockWidthRef.current = clockEl.offsetWidth;
      if (todayEl) todayWidthRef.current = todayEl.offsetWidth;
      if (viewEl) viewTypeWidthRef.current = viewEl.offsetWidth;

      const next = nextHeaderClusterHiding({
        available: parent.clientWidth,
        clockWidth: showTimeScaleToggle ? clockWidthRef.current : 0,
        todayWidth: todayWidthRef.current,
        viewTypeWidth: viewTypeWidthRef.current,
        hideToday: hideTodayRef.current,
        hideViewType: hideViewTypeRef.current,
        gap: HEADER_CLUSTER_GAP_PX,
        slack: HEADER_CLUSTER_SHOW_SLACK_PX,
      });
      setHideToday((prev) => (prev === next.hideToday ? prev : next.hideToday));
      setHideViewType((prev) =>
        prev === next.hideViewType ? prev : next.hideViewType,
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    ro.observe(cluster);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [statsActive, isMacro, showTimeScaleToggle, showStatsToggle, viewMode, rightPanelOpen]);

  useShortcut(
    "pasteSession",
    () => {
      if (statsActive || isMacro) return;
      if (viewMode === "year") return;
      if (viewerRole !== "owner") return;
      if (!canPaste(gridViewMode)) return;
      if (
        pasteAtDate(
          dateForSessionPaste(gridViewMode, currentDate, selected, peekPasteAnchorDate()),
          gridViewMode,
        )
      ) {
        setPasteToast("Session was pasted.");
      }
    },
    { enabled: !statsActive && !isMacro && viewMode !== "year" && viewerRole === "owner" },
  );

  // Stats-only: Nordnet-style timeframe + x-axis bucket.
  const [statsTimeframe, setStatsTimeframe] = useState<TimeframeKey>("1M");
  const [statsXBucket, setStatsXBucket] = useState<XBucket>("day");

  /** Earliest event date across the merged feed — gates Nordnet buttons. */
  const earliestDataDate = useMemo<Date | null>(() => {
    let earliest: number | null = null;
    for (const e of mergedEvents) {
      const t = new Date(e.startISO).getTime();
      if (!Number.isFinite(t)) continue;
      if (earliest === null || t < earliest) earliest = t;
    }
    return earliest === null ? null : new Date(earliest);
  }, [mergedEvents]);

  // Clamp x-bucket to options allowed by the active timeframe.
  useEffect(() => {
    const allowed = allowedBucketsForTimeframe(statsTimeframe);
    if (!allowed.includes(statsXBucket)) setStatsXBucket(allowed[0]);
  }, [statsTimeframe, statsXBucket]);






  const commitTitle = () => {
    setEditingTitle(false);
    const v = titleDraft.trim();
    if (v && v !== meta.title) setMeta({ ...meta, title: v });
    else setTitleDraft(meta.title);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — title + nav arrows on the left, action cluster on the right.
          z-50 + overflow-visible so header controls stay above the calendar grid. */}
      <div className="relative z-50 flex h-12 flex-none items-center justify-between gap-3 overflow-visible bg-white px-0.5 pr-4 md:pr-6">
        <div className="flex items-center gap-2 min-w-0 pl-9">
          {!statsActive && (
            <>
              <ViewTitle
                viewMode={isMacro ? "year" : viewMode}
                currentDate={currentDate}
              />
              <MonthNavControl
                unit={isMacro ? "year" : viewMode === "year" ? "year" : viewMode}
                currentDate={currentDate}
                selectedRange={currentRange}
                onChange={(d, r) => updateCurrent(d, r)}
                viewMode={navMiniViewMode}
              />
            </>
          )}
        </div>

        {isMacro && !statsActive ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-12 items-center justify-center">
            <div className="pointer-events-auto">
              <GanttMacroZoomControl />
            </div>
          </div>
        ) : null}

        <div
          className={`flex flex-1 items-center min-w-0 transition-[padding-right] duration-300 ease-out ${rightPanelOpen ? "pr-0" : "pr-9"}`}
        >
          {showStatsToggle && (
            <button
              type="button"
              aria-label={statsActive ? "Show calendar" : "Show statistics"}
              title={statsActive ? "Calendar" : "Statistics"}
              aria-pressed={statsActive}
              onClick={() => setStatsActive(!statsActive)}
              className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
                statsActive
                  ? "bg-secondary text-ink"
                  : "text-muted-foreground hover:bg-secondary hover:text-ink"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
            </button>
          )}

          <div
            ref={headerClusterHostRef}
            className="flex min-w-0 flex-1 justify-end"
          >
          <div
            ref={headerClusterRef}
            className="relative z-50 flex shrink-0 items-center gap-1.5 overflow-visible"
          >
            {!statsActive && (
              <>
                {!isMacro && showTimeScaleToggle && (
                  <button
                    ref={clockBtnRef}
                    type="button"
                    aria-label={
                      hideTimeScale ? "Show hour scale" : "Hide hour scale"
                    }
                    aria-pressed={hideTimeScale}
                    title={
                      hideTimeScale
                        ? "Show timed layout"
                        : "Stack sessions without hours"
                    }
                    onClick={() => setHideTimeScale((v) => !v)}
                    className="relative grid h-8 w-8 place-items-center rounded-md border border-hairline bg-background/90 text-ink shadow-sm backdrop-blur transition-colors hover:bg-secondary"
                  >
                    <Clock className="h-4 w-4" strokeWidth={2} />
                    {hideTimeScale && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[18px] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] rounded-full bg-muted-foreground/70"
                      />
                    )}
                  </button>
                )}
                {!isMacro && (
                  <>
                    {!hideToday && (
                      <button
                        ref={todayBtnRef}
                        type="button"
                        aria-label="Go to today"
                        onClick={() => {
                          const t = new Date();
                          setYearWeekHighlight(false);
                          setYearMonthHighlight(false);
                          updateCurrent(t, { start: t, end: t });
                        }}
                        className="flex h-8 items-center justify-center rounded-md border border-hairline bg-background/90 px-2.5 text-xs font-medium text-ink shadow-sm backdrop-blur transition-colors hover:bg-secondary"
                      >
                        Today
                      </button>
                    )}
                    {!hideViewType && (
                      <div ref={viewTypeRef}>
                        <HeaderDropdown<ExtendedViewMode>
                          ariaLabel="View mode"
                          value={viewMode}
                          onChange={setViewMode}
                          width={108}
                          options={
                            appKind === "diary"
                              ? [
                                  { value: "week", label: "Week" },
                                  { value: "month", label: "Month" },
                                  { value: "year", label: "Year" },
                                ]
                              : [
                                  { value: "day", label: "Day" },
                                  { value: "week", label: "Week" },
                                  { value: "month", label: "Month" },
                                  { value: "year", label: "Year" },
                                ]
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {showStatsToggle && statsActive && (
              <div className="self-end pb-0.5">
                <HeaderDropdown<XBucket>
                  ariaLabel="X axis"
                  value={statsXBucket}
                  onChange={setStatsXBucket}
                  width={108}
                  options={(() => {
                    const allowed = allowedBucketsForTimeframe(statsTimeframe);
                    const all: { value: XBucket; label: string }[] = [
                      { value: "day", label: "Day" },
                      { value: "week", label: "Week" },
                      { value: "month", label: "Month" },
                      { value: "year", label: "Year" },
                    ];
                    return all.filter((o) => allowed.includes(o.value));
                  })()}
                />
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {statsActive ? (
          <StatsChartView
            events={mergedEvents}
            xBucket={statsXBucket}
            timeframe={statsTimeframe}
            onTimeframeChange={setStatsTimeframe}
            earliestDataDate={earliestDataDate}
            diaryActivityCats={diaryActivityCats}
            hiddenCategoryIds={diaryVisibility?.hiddenCategoryIds ?? new Set()}
            hiddenSportTypes={diaryVisibility?.hiddenSportTypes ?? new Set()}
          />

        ) : isMacro ? (
          <>
            <GanttYearGrid
              year={ganttYear}
              projects={ganttTracks}
              lockedBlockIds={lockedGanttBlockIds}
              scrollResetKey={openProjectId ?? "list"}
              scrollFocusPhases={!!openProjectId}
              onCommitSpan={(rowId, span) => {
                setGanttLiveSpan(null);
                if (openProjectId) {
                  void updateGanttPhase(rowId, span);
                }
              }}
              onCreateSpan={(span) => {
                if (openProjectId) {
                  void createGanttPhase("New phase", "#C7C7CC", null, span, openProjectId);
                } else {
                  void (async () => {
                    const project = await createGanttProject(
                      "New project",
                      "#C7C7CC",
                      null,
                      null,
                    );
                    if (!project) return;
                    await createGanttPhase(
                      "New phase",
                      "#C7C7CC",
                      null,
                      span,
                      project.id,
                    );
                  })();
                }
              }}
              onOpenItem={(id, rect) => {
                if (!openProjectId) {
                  setOpenProjectId(id);
                  return;
                }
                setGanttLiveSpan(null);
                setGanttPanel({ id, rect });
              }}
              onBlockDragStart={() => {
                setGanttPanel(null);
                setGanttLiveSpan(null);
              }}
              onLiveResize={(id, span) => {
                if (ganttPanel?.id !== id) return;
                setGanttLiveSpan({
                  gantt_start_date: span.gantt_start_date,
                  gantt_end_date: span.gantt_end_date,
                });
              }}
            />
            {ganttPanel && ganttPanelItem ? (
              <GanttItemPanel
                key={ganttPanelItem.id}
                item={ganttPanelItem}
                year={currentDate.getFullYear()}
                anchor={ganttPanel.rect}
                teamId={teamId}
                liveSpan={
                  ganttLiveSpan && ganttPanel.id === ganttPanelItem.id
                    ? ganttLiveSpan
                    : null
                }
                onChange={(patch) => {
                  if (openProjectId) {
                    void updateGanttPhase(ganttPanelItem.id, patch);
                  } else {
                    void updateGanttProject(ganttPanelItem.id, patch);
                  }
                }}
                onDelete={() => {
                  if (openProjectId) {
                    void removeGanttPhase(ganttPanelItem.id);
                  } else {
                    void removeGanttProject(ganttPanelItem.id);
                  }
                }}
                onClose={() => {
                  setGanttPanel(null);
                  setGanttLiveSpan(null);
                }}
              />
            ) : null}
          </>
        ) : appKind === "calendar" && viewMode === "year" ? (
          <YearGrid
            year={currentDate.getFullYear()}
            selectedDate={currentDate}
            weekHighlight={yearWeekHighlight}
            monthHighlight={yearMonthHighlight}
            onSelectDate={(d) => {
              setYearWeekHighlight(false);
              setYearMonthHighlight(false);
              updateCurrent(d, { start: d, end: d });
            }}
            onWeekClick={(anchor) => {
              const d = dateInYearForWeek(anchor, currentDate.getFullYear());
              updateCurrent(d, { start: d, end: d });
              setYearMonthHighlight(false);
              setYearWeekHighlight(true);
            }}
            onWeekDoubleClick={(anchor) => {
              updateCurrent(anchor, { start: anchor, end: anchor });
              setViewMode("week");
            }}
            onDayDoubleClick={(d) => {
              updateCurrent(d, { start: d, end: d });
              setViewMode("day");
            }}
            onMonthClick={(monthIndex) => {
              const d = new Date(currentDate.getFullYear(), monthIndex, 1);
              updateCurrent(d, { start: d, end: d });
              setYearWeekHighlight(false);
              setYearMonthHighlight(true);
            }}
            onMonthDoubleClick={(monthIndex) => {
              const d = new Date(currentDate.getFullYear(), monthIndex, 1);
              updateCurrent(d, { start: d, end: d });
              setYearWeekHighlight(false);
              setYearMonthHighlight(false);
              setViewMode("month");
            }}
          />
        ) : (
        <UnifiedElasticGrid
          calId={calId}
          year={meta.year}
          data={data}
          selected={selected}
          onSelect={setSelected}
          onCommitText={(k, text) => upsertCell(k, { text })}
          onCommitTexts={(updates) => upsertCells(updates.map(({ key, text }) => ({ key, patch: { text } })))}
          onCommitDuration={(k, duration) => upsertCell(k, { duration })}
          onFill={fillRange}
          seat={seat}
          events={mergedEvents}
          onUpsertEvent={(patch) => {
            const patchId = (patch as { id?: string }).id;
            if (patchId && overlayIdSet.has(patchId)) {
              return events.find((e) => e.id === patchId) ?? {
                id: patchId,
                startISO: "",
                endISO: "",
                allDay: false,
                title: "",
                color: null,
                entityId: "overlay",
              };
            }
            if (appKind === "diary") {
              const startISO = (patch as { startISO?: string }).startISO;
              if (startISO && new Date(startISO).getTime() > Date.now()) {
                toast("Diary is for logging past sessions", {
                  description: "For planning upcoming sessions, go to Calendar.",
                });
                // Return a no-op CalendarEvent shape to satisfy type.
                return {
                  id: "__blocked__",
                  startISO: startISO ?? "",
                  endISO: (patch as { endISO?: string }).endISO ?? "",
                  allDay: false,
                  title: "",
                  color: null,
                };
              }
            }
            return upsertEvent(patch);
          }}
          onMoveEvent={(id, patch) => {
            if (overlayIdSet.has(id)) return;
            moveEvent(id, patch);
          }}
          onDeleteEvent={(id) => {
            if (overlayIdSet.has(id)) return;
            deleteEvent(id);
          }}
          onDeleteEvents={(ids) => {
            deleteEvents(ids.filter((id) => !overlayIdSet.has(id)));
          }}
          onAcceptCoachSession={
            // Only the actual owner of the calendar (scope kind "user")
            // can accept a coach-pending session. For coaches viewing a
            // client's calendar (scope "client:..."), this stays undefined
            // so the modal renders Save/Edit instead of Accept.
            calId.startsWith("user:") ? acceptCoachSession : undefined
          }
          onReorderEvents={(ids) => {
            const next = ids.filter((id) => !overlayIdSet.has(id));
            if (next.length === 0) return;
            reorderEvents(next);
          }}
          currentDate={currentDate}
          currentRange={currentRange}
          onCurrentDateChange={(d, r) => updateCurrent(d, r)}
          viewMode={gridViewMode}
          onViewModeChange={(v) => setViewMode(v)}
          onOpenYearView={() => setViewMode("year")}
          hideTimeScale={showTimeScaleToggle && hideTimeScale}

          appKind={appKind}
          memberId={memberId}
          viewerRole={viewerRole}
          teamId={teamId}
        />
        )}
      </div>
      {pasteToast ? (
        <CalendarInfoToast message={pasteToast} onDismiss={() => setPasteToast(null)} />
      ) : null}
    </div>
  );
}
