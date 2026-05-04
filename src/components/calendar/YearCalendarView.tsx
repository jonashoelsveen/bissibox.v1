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

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, Undo2, Redo2 } from "lucide-react";
import { useYearStore, useEventStore, type CellKey } from "./yearStore";
import { UnifiedElasticGrid, HeaderDropdown, type ViewMode } from "./UnifiedElasticGrid";
import { MonthNavControl } from "./MonthNavControl";
import type { DateRange } from "./MiniCalendar";

export type CalendarSeat = "admin" | "individual";

export function YearCalendarView({
  calId,
  defaultTitle,
  seat = "individual",
}: {
  calId: string;
  defaultTitle: string;
  seat?: CalendarSeat;
}) {
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
  const [selected, setSelected] = useState<CellKey | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meta.title);

  // Shared "what is the calendar showing?" state — drives both the main grid
  // and the mini-calendar navigator at the top-right of the grid.
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  // Lifted from UnifiedElasticGrid so the prev/next + mini-cal arrows can
  // live in the page header (left of the year + undo cluster) instead of
  // floating on top of the grid.
  const [viewMode, setViewMode] = useState<ViewMode>("month");

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
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setEditingTitle(false);
                setTitleDraft(meta.title);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-hairline bg-background px-2 py-1 text-xl font-semibold text-ink outline-none focus:border-primary"
          />
        ) : (
          <h1
            onDoubleClick={() => {
              setTitleDraft(meta.title);
              setEditingTitle(true);
            }}
            className="cursor-text truncate text-xl font-semibold text-ink"
            title="Double-click to rename"
          >
            {meta.title}
          </h1>
        )}
        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs text-muted-foreground">{meta.year}</span>
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
        </div>
      </div>

      <div className="min-h-[60vh]">
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
          events={events}
          onUpsertEvent={upsertEvent}
          onMoveEvent={moveEvent}
          onDeleteEvent={deleteEvent}
          currentDate={currentDate}
          currentRange={currentRange}
          onCurrentDateChange={(d, r) => {
            setCurrentDate(d);
            if (r) setCurrentRange(r);
            else setCurrentRange({ start: d, end: d });
          }}
        />
      </div>
    </div>
  );
}
