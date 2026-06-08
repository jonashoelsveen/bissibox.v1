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

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
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

import { useYearStore, useEventStore, type CellKey, type CalendarEvent } from "./yearStore";
import { UnifiedElasticGrid, HeaderDropdown, type ViewMode, type ExtendedViewMode } from "./UnifiedElasticGrid";
import { MonthNavControl } from "./MonthNavControl";
import type { DateRange } from "./MiniCalendar";
import {
  PreviewOverlayProvider,
  usePreviewOverlay,
} from "./ImportCalendar/PreviewOverlayContext";
import { ImportButton } from "./ImportCalendar/ImportButton";
import { buildGhostEvents } from "./ImportCalendar/ghost";
import { isoWeekNumber } from "./dateUtils";
import { categoryKeyFromColor, type CategoryKey } from "./CalendarSideNav";
// Strava integration removed; diary/strava activity sync is no longer available.
import { useUserCategories } from "@/hooks/useUserCategories";

const MONTHS_NB = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

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
    ghost = <span className="font-semibold">8888</span>;
    content = <span className="font-semibold">{year}</span>;
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

  visibleCategories?: Set<CategoryKey>;
  /** "diary" hides import + undo/redo, restricts to week/month, blocks future logging. */
  appKind?: CalendarAppKind;
  /** When viewing a member's diary as a leader/follower, the member's user_id. */
  memberId?: string;
  /** Viewer's relationship to the member; defaults to "owner". */
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  /** When the surrounding left panel is closed, the header makes room for the panel toggle icon. */
  panelOpen?: boolean;
  /** When the surrounding right panel is closed, the header right cluster makes room for the right panel toggle icon. */
  rightPanelOpen?: boolean;
  /** Hide the Import button (e.g. when viewing another user's calendar). */
  disableImport?: boolean;
  /** Team scope for resolving the user's category list (defaults to personal). */
  teamId?: string | null;
  /** Lowercase hex colors the viewer has toggled off locally (coach view). */
  hiddenColors?: Set<string>;
  /** Controlled "statistics view" toggle (diary only). */
  statsActive?: boolean;
  onStatsActiveChange?: (next: boolean) => void;
}

export function YearCalendarView(props: YearCalendarViewProps) {
  return (
    <PreviewOverlayProvider>
      <YearCalendarViewInner {...props} />
    </PreviewOverlayProvider>
  );
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
  visibleCategories,
  appKind = "calendar",
  memberId,
  viewerRole = "owner",
  panelOpen = true,
  rightPanelOpen = true,
  disableImport = false,
  teamId = null,
  hiddenColors,
  statsActive: statsActiveProp,
  onStatsActiveChange,
}: YearCalendarViewProps) {
  const { data, meta, upsertCell, upsertCells, fillRange, setMeta } =
    useYearStore(calId, defaultTitle);
  const {
    events,
    upsertEvent,
    reorderEvents,
    moveEvent,
    deleteEvent,
    acceptCoachSession,
  } = useEventStore(calId);

  // Preview overlay (Import Calendar). When active, ghost events are merged
  // into the events list so the existing month/week renderers display them
  // without bespoke overlay layers. Real events are dimmed via wrapper class.
  const overlay = usePreviewOverlay();
  const ghostEvents = useMemo(
    () =>
      buildGhostEvents(
        overlay.events,
        overlay.visibleCategoryIds,
        overlay.categoryColors,
        overlay.categories,
        overlay.categoryMappings,
        overlay.internalColors,
      ),
    [
      overlay.events,
      overlay.visibleCategoryIds,
      overlay.categoryColors,
      overlay.categories,
      overlay.categoryMappings,
      overlay.internalColors,
    ],
  );
  const previewActive = overlay.events !== null;
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
  const diaryVisibility = useDiaryVisibilitySafe();
  const hiddenMeColors = useMemo(() => {
    const s = new Set<string>();
    for (const c of userCats) {
      if (c.hidden) s.add(`me:${c.color.toLowerCase()}`);
    }
    return s;
  }, [userCats]);


  // Coach viewing a client: no longer per-category gated — the coach
  // sees every event in the client's personal calendar. Local hide toggles
  // are applied via `hiddenColors` passed from the parent.
  const { user } = useAuth();
  const isCoachViewer =
    !!memberId && !!user && memberId !== user.id && appKind === "calendar";

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
    const base = previewActive
      ? [...localOnly, ...mergedStrava, ...ghostEvents]
      : [...localOnly, ...mergedStrava];

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

    if (!visibleCategories) {
      return base.filter(filterChain);
    }
    return base.filter((e) => {
      if (!filterChain(e)) return false;
      if (e.diaryType === "training") return visibleCategories.has("ind:training");
      const key = categoryKeyFromColor(e.color);
      if (key.startsWith("me:")) return visibleCategories.has(key);
      return visibleCategories.has(key);
    });
  }, [previewActive, events, stravaEvents, ghostEvents, visibleCategories, appKind, hiddenMeColors, isCoachViewer, hiddenColors, diaryVisibility, diaryActivityCats]);

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
  /** Coerced view mode used by parts of the UI that only understand
   * day/week/month (the grid, side nav, MonthNavControl). */
  const gridViewMode: ViewMode = viewMode === "year" ? "month" : viewMode;

  // Diary-only: toggle between the calendar grid and the statistics chart.
  const [internalStatsActive, setInternalStatsActive] = useState(false);
  const statsActive = statsActiveProp ?? internalStatsActive;
  const setStatsActive = (next: boolean) => {
    if (onStatsActiveChange) onStatsActiveChange(next);
    else setInternalStatsActive(next);
  };
  const showStatsToggle = appKind === "diary";

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
      {/* Header — title + nav arrows on the left, action cluster on the right */}
      <div className="flex h-12 flex-none items-center justify-between gap-3 bg-white px-0.5 pr-4 md:pr-6">
        <div className={`flex items-center gap-2 min-w-0 transition-[padding-left] duration-300 ease-out ${panelOpen ? "pl-0" : "pl-9"}`}>
          {!statsActive && (
            <>
              <ViewTitle viewMode={viewMode} currentDate={currentDate} />
              <MonthNavControl
                unit={viewMode}
                currentDate={currentDate}
                selectedRange={currentRange}
                onChange={(d, r) => updateCurrent(d, r)}
              />
            </>
          )}
        </div>


        <div className={`flex items-center gap-1 transition-[padding-right] duration-300 ease-out ${rightPanelOpen ? "pr-0" : "pr-9"}`}>
          <button
            type="button"
            aria-label="Gå til i dag"
            title="I dag"
            onClick={() => {
              const t = new Date();
              updateCurrent(t, { start: t, end: t });
            }}
            className="group grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-secondary"
          >
            <span className="block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
          </button>
          {/* When stats is active, hide view-type + timeframe dropdowns and
              show the x-axis bucket dropdown instead. The Nordnet-style
              timeframe row lives at the bottom of the chart itself. */}
          {!statsActive && (
            <HeaderDropdown<ExtendedViewMode>
              ariaLabel="Visningsmodus"
              value={viewMode}
              onChange={setViewMode}
              width={108}
              options={
                appKind === "diary"
                  ? [
                      { value: "week", label: "Uke" },
                      { value: "month", label: "Måned" },
                      { value: "year", label: "År" },
                    ]
                  : [
                      { value: "day", label: "Dag" },
                      { value: "week", label: "Uke" },
                      { value: "month", label: "Måned" },
                    ]
              }
            />
          )}
          {showStatsToggle && statsActive && (
            <div className="self-end pb-0.5">
              <HeaderDropdown<XBucket>
                ariaLabel="X-akse"
                value={statsXBucket}
                onChange={setStatsXBucket}
                width={108}
                options={(() => {
                  const allowed = allowedBucketsForTimeframe(statsTimeframe);
                  const all: { value: XBucket; label: string }[] = [
                    { value: "day", label: "Dag" },
                    { value: "week", label: "Uke" },
                    { value: "month", label: "Måned" },
                    { value: "year", label: "År" },
                  ];
                  return all.filter((o) => allowed.includes(o.value));
                })()}
              />
            </div>
          )}


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
          {appKind !== "diary" && !disableImport && (
            <ImportButton seat={seat} onCommit={(patch) => upsertEvent(patch)} />
          )}
        </div>
      </div>

      <div data-preview-active={previewActive ? "true" : "false"} className="flex flex-1 min-h-0 flex-col overflow-hidden">
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
          onMoveEvent={moveEvent}
          onDeleteEvent={deleteEvent}
          onAcceptCoachSession={
            // Only the actual owner of the calendar (scope kind "user")
            // can accept a coach-pending session. For coaches viewing a
            // client's calendar (scope "client:..."), this stays undefined
            // so the modal renders Save/Edit instead of Accept.
            calId.startsWith("user:") ? acceptCoachSession : undefined
          }
          onReorderEvents={reorderEvents}
          currentDate={currentDate}
          currentRange={currentRange}
          onCurrentDateChange={(d, r) => updateCurrent(d, r)}
          viewMode={gridViewMode}
          onViewModeChange={(v) => setViewMode(v)}

          appKind={appKind}
          memberId={memberId}
          viewerRole={viewerRole}
          teamId={teamId}
        />
        )}
      </div>
    </div>
  );
}
