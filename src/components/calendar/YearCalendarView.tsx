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

import { useEffect, useMemo, useState } from "react";
import { Settings as SettingsIcon, Undo2, Redo2 } from "lucide-react";
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

const MONTHS_NB = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];

function ViewTitle({ viewMode, currentDate }: { viewMode: ViewMode; currentDate: Date }) {
  const month = MONTHS_NB[currentDate.getMonth()];
  const year = currentDate.getFullYear();
  if (viewMode === "week") {
    const wk = isoWeekNumber(currentDate);
    return (
      <h1 className="truncate text-xl text-ink">
        <span className="font-semibold">Uke {wk} {month}</span>{" "}
        <span className="font-normal">{year}</span>
      </h1>
    );
  }
  if (viewMode === "day") {
    return (
      <h1 className="truncate text-xl text-ink">
        <span className="font-semibold">{currentDate.getDate()}. {month}</span>{" "}
        <span className="font-normal">{year}</span>
      </h1>
    );
  }
  return (
    <h1 className="truncate text-xl text-ink">
      <span className="font-semibold">{month}</span>{" "}
      <span className="font-normal">{year}</span>
    </h1>
  );
}

export type CalendarSeat = "admin" | "individual";

export interface YearCalendarViewProps {
  calId: string;
  defaultTitle: string;
  seat?: CalendarSeat;
  /** Optional controlled state (driven by the page shell + sidebar). */
  currentDate?: Date;
  currentRange?: DateRange;
  onCurrentDateChange?: (date: Date, range?: DateRange) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (v: ViewMode) => void;
  /** When provided, only events whose category is in this set are rendered. */
  visibleCategories?: Set<CategoryKey>;
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
}: YearCalendarViewProps) {
  const { data, meta, upsertCell, upsertCells, fillRange, setMeta, undo, redo, canUndo, canRedo } =
    useYearStore(calId, defaultTitle);
  const {
    events,
    upsertEvent,
    moveEvent,
    deleteEvent,
    undoEvents,
    redoEvents,
    canUndoEvents,
    canRedoEvents,
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
      ),
    [overlay.events, overlay.visibleCategoryIds, overlay.categoryColors, overlay.categories],
  );
  const previewActive = overlay.events !== null;
  const mergedEvents = useMemo(
    () => (previewActive ? [...events, ...ghostEvents] : events),
    [previewActive, events, ghostEvents],
  );
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

  // Keyboard shortcuts: ⌘Z / Ctrl+Z for undo, ⌘⇧Z / Ctrl+Y for redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTyping) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        undoEvents();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
        redoEvents();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, undoEvents, redoEvents]);

  const commitTitle = () => {
    setEditingTitle(false);
    const v = titleDraft.trim();
    if (v && v !== meta.title) setMeta({ ...meta, title: v });
    else setTitleDraft(meta.title);
  };

  return (
    <div className="mt-3 flex flex-col">
      {/* Header — inline-editable title + gear */}
      <div className="mb-3 flex items-center justify-between gap-3 px-0.5">
        <ViewTitle viewMode={viewMode} currentDate={currentDate} />

        <div className="flex items-center gap-1">
          {/* Mode dropdown + prev/next/mini-cal arrows. Sit to the LEFT of
              the year + undo/redo cluster so all navigation lives above the
              calendar window instead of floating on top of it. */}
          <HeaderDropdown<ViewMode>
            ariaLabel="Visningsmodus"
            value={viewMode}
            onChange={setViewMode}
            width={108}
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
            onChange={(d, r) => updateCurrent(d, r)}
          />
          <span className="ml-2 mr-2 text-xs text-muted-foreground">{meta.year}</span>
          <button
            type="button"
            aria-label="Undo"
            title="Undo (⌘Z)"
            onClick={() => { undo(); undoEvents(); }}
            disabled={!canUndo && !canUndoEvents}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (⌘⇧Z)"
            onClick={() => { redo(); redoEvents(); }}
            disabled={!canRedo && !canRedoEvents}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            aria-label="Calendar settings"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          <ImportButton onCommit={(patch) => upsertEvent(patch)} />
        </div>
      </div>

      <div className="min-h-[60vh]" data-preview-active={previewActive ? "true" : "false"}>
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
          onUpsertEvent={upsertEvent}
          onMoveEvent={moveEvent}
          onDeleteEvent={deleteEvent}
          currentDate={currentDate}
          currentRange={currentRange}
          onCurrentDateChange={(d, r) => updateCurrent(d, r)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>
    </div>
  );
}
