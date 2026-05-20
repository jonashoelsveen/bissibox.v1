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

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Settings as SettingsIcon } from "lucide-react";
import { useYearStore, useEventStore, type CellKey } from "./yearStore";
import { UnifiedElasticGrid, HeaderDropdown, type ViewMode } from "./UnifiedElasticGrid";
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
import { useStravaActivities } from "./useStravaActivities";

const MONTHS_NB = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

function ViewTitle({ viewMode, currentDate }: { viewMode: ViewMode; currentDate: Date }) {
  const month = MONTHS_NB[currentDate.getMonth()];
  const year = currentDate.getFullYear();
  const fontStyle = { fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' };
  if (viewMode === "week") {
    const wk = isoWeekNumber(currentDate);
    return (
      <h1 className="truncate text-xl text-ink" style={fontStyle}>
        <span className="font-semibold">Uke {wk} {month}</span>{" "}
        <span className="font-normal">{year}</span>
      </h1>
    );
  }
  if (viewMode === "day") {
    return (
      <h1 className="truncate text-xl text-ink" style={fontStyle}>
        <span className="font-semibold">{currentDate.getDate()}. {month}</span>{" "}
        <span className="font-normal">{year}</span>
      </h1>
    );
  }
  return (
    <h1 className="truncate text-xl text-ink" style={fontStyle}>
      <span className="font-semibold">{month}</span>{" "}
      <span className="font-normal">{year}</span>
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
  viewMode?: ViewMode;
  onViewModeChange?: (v: ViewMode) => void;
  visibleCategories?: Set<CategoryKey>;
  /** "diary" hides import + undo/redo, restricts to week/month, blocks future logging. */
  appKind?: CalendarAppKind;
  /** When viewing a member's diary as a leader/follower, the member's user_id. */
  memberId?: string;
  /** Viewer's relationship to the member; defaults to "owner". */
  viewerRole?: import("@/hooks/useViewerRole").ViewerRole;
  /** When the surrounding left panel is closed, the header makes room for the panel toggle icon. */
  panelOpen?: boolean;
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
}: YearCalendarViewProps) {
  const { data, meta, upsertCell, upsertCells, fillRange, setMeta } =
    useYearStore(calId, defaultTitle);
  const {
    events,
    upsertEvent,
    reorderEvents,
    moveEvent,
    deleteEvent,
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
  const { events: stravaEvents } = useStravaActivities(memberId);
  const mergedEvents = useMemo(() => {
    const stravaForDiary = appKind === "diary" ? stravaEvents : [];
    // De-duplicate: a manually-logged event with the same id (strava:<id>) takes precedence.
    const ids = new Set(events.map((e) => e.id));
    const stravaUnique = stravaForDiary.filter((e) => !ids.has(e.id));
    const base = previewActive
      ? [...events, ...stravaUnique, ...ghostEvents]
      : [...events, ...stravaUnique];
    if (!visibleCategories) return base;
    return base.filter((e) => {
      if (e.diaryType === "training") return visibleCategories.has("ind:training");
      return visibleCategories.has(categoryKeyFromColor(e.color));
    });
  }, [previewActive, events, stravaEvents, ghostEvents, visibleCategories, appKind]);
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
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>("month");
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = (v: ViewMode) => {
    if (onViewModeChange) onViewModeChange(v);
    else setInternalViewMode(v);
  };




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
          <ViewTitle viewMode={viewMode} currentDate={currentDate} />
          <MonthNavControl
            unit={viewMode}
            currentDate={currentDate}
            selectedRange={currentRange}
            onChange={(d, r) => updateCurrent(d, r)}
          />
        </div>

        <div className="flex items-center gap-1">
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
          <HeaderDropdown<ViewMode>
            ariaLabel="Visningsmodus"
            value={viewMode}
            onChange={setViewMode}
            width={108}
            options={
              appKind === "diary"
                ? [
                    { value: "week", label: "Uke" },
                    { value: "month", label: "Måned" },
                  ]
                : [
                    { value: "day", label: "Dag" },
                    { value: "week", label: "Uke" },
                    { value: "month", label: "Måned" },
                  ]
            }
          />
          <button
            aria-label="Calendar settings"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          {appKind !== "diary" && (
            <ImportButton seat={seat} onCommit={(patch) => upsertEvent(patch)} />
          )}
        </div>
      </div>

      <div data-preview-active={previewActive ? "true" : "false"} className="flex-1 min-h-0 overflow-y-auto">
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
          onReorderEvents={reorderEvents}
          currentDate={currentDate}
          currentRange={currentRange}
          onCurrentDateChange={(d, r) => updateCurrent(d, r)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          appKind={appKind}
          memberId={memberId}
          viewerRole={viewerRole}
        />
      </div>
    </div>
  );
}
