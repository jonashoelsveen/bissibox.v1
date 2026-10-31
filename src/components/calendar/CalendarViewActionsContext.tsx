import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import {
  isSharedCalendarReadOnly,
  useEventStore,
  type CalendarEvent,
} from "@/components/calendar/yearStore";
import { duplicateSortIndex } from "@/lib/duplicatePlacement";
import {
  buildPasteEventsAtDate,
  buildPasteEventsAtDateTime,
  buildPasteEventsForWeek,
  canPasteClipboard,
  canPasteWeekClipboard,
  eventToDuplicatePatch,
  oneOffRepeatFields,
  readCalendarClipboard,
  writeEventsToClipboard,
  type ClipboardSpan,
} from "@/lib/calendarClipboard";

type EventStore = ReturnType<typeof useEventStore>;

type CalendarViewActionsValue = {
  calId: string;
  events: CalendarEvent[];
  upsertEvent: EventStore["upsertEvent"];
  deleteEvent: EventStore["deleteEvent"];
  deleteEvents: EventStore["deleteEvents"];
  canMutateEvent: EventStore["canMutateEvent"];
  reorderEvents: EventStore["reorderEvents"];
  moveEvent: EventStore["moveEvent"];
  acceptCoachSession: EventStore["acceptCoachSession"];
  refreshEvents: EventStore["refreshEvents"];
  clipboardTick: number;
  bumpClipboard: () => void;
  copyEventsToClipboard: (
    events: CalendarEvent[],
    viewMode: ViewMode,
    span?: ClipboardSpan,
  ) => void;
  duplicateEvent: (event: CalendarEvent, peers?: CalendarEvent[]) => CalendarEvent | null;
  canPaste: (viewMode: ViewMode) => boolean;
  canPasteWeek: () => boolean;
  pasteAtDate: (targetDate: Date, viewMode: ViewMode, startMin?: number) => boolean;
  pasteWeekAt: (weekStart: Date, viewMode: ViewMode) => boolean;
  /** Month-grid focused cell, including previous/next-month overflow days. */
  setPasteAnchorDate: (date: Date) => void;
  peekPasteAnchorDate: () => Date | null;
};

const CalendarViewActionsContext = createContext<CalendarViewActionsValue | null>(null);

export function useCalendarViewActionsOptional(): CalendarViewActionsValue | null {
  return useContext(CalendarViewActionsContext);
}

function pastedEventPatch(event: CalendarEvent) {
  // Clipboard clones are local sessions. A web-address paste must not keep the
  // subscription calendar, or it would stay undeletable like the feed row.
  return {
    startISO: event.startISO,
    endISO: event.endISO,
    title: event.title,
    allDay: event.allDay,
    color: event.color,
    categoryId: event.categoryId,
    ...(event.description != null && event.description !== ""
      ? { description: event.description }
      : {}),
    ...(event.location != null && event.location !== ""
      ? { location: event.location }
      : {}),
    ...(event.locationUrl != null && event.locationUrl !== ""
      ? { locationUrl: event.locationUrl }
      : {}),
    ...(event.appGroupId != null ? { appGroupId: event.appGroupId } : {}),
    ...oneOffRepeatFields(),
  };
}

export function CalendarViewActionsProvider({
  calId,
  children,
}: {
  calId: string;
  children: ReactNode;
}) {
  const store = useEventStore(calId);
  const {
    events,
    upsertEvent,
    deleteEvent,
    deleteEvents,
    canMutateEvent,
    reorderEvents,
    moveEvent,
    acceptCoachSession,
    refreshEvents,
  } = store;
  const [clipboardTick, setClipboardTick] = useState(0);
  const bumpClipboard = useCallback(() => setClipboardTick((n) => n + 1), []);
  const pasteAnchorDateRef = useRef<Date | null>(null);
  const setPasteAnchorDate = useCallback((date: Date) => {
    pasteAnchorDateRef.current = date;
  }, []);
  const peekPasteAnchorDate = useCallback(() => pasteAnchorDateRef.current, []);

  const copyEventsToClipboard = useCallback(
    (copyEvents: CalendarEvent[], viewMode: ViewMode, span: ClipboardSpan = "session") => {
      writeEventsToClipboard(copyEvents, calId, viewMode, "copy", span);
      bumpClipboard();
    },
    [bumpClipboard, calId],
  );

  const duplicateEvent = useCallback(
    (event: CalendarEvent, peers?: CalendarEvent[]) => {
      const copyOnly = isSharedCalendarReadOnly(event.userCalendarId);
      // Feed rows and member calendars cannot be edited. Duplicating one creates a local session.
      if (!copyOnly && !canMutateEvent(event)) return null;
      // Peers include web-address rows, which are not in the session store.
      // Their order is what places the copy beside the session that was duplicated.
      const base = peers && peers.length > 0 ? peers : events;
      const pool = base.some((item) => item.id === event.id) ? base : [...base, event];
      const place = duplicateSortIndex(event, pool);
      for (const bump of place.bumps) {
        const target = events.find((item) => item.id === bump.id);
        if (!target || !canMutateEvent(target)) continue;
        moveEvent(bump.id, { sortIndex: bump.sortIndex });
      }
      const patch = {
        ...eventToDuplicatePatch(event),
        sortIndex: place.sortIndex,
      };
      if (!copyOnly) return upsertEvent(patch);
      return upsertEvent({
        ...patch,
        userCalendarId: null,
        followsCalendarColor: false,
      });
    },
    [canMutateEvent, events, moveEvent, upsertEvent],
  );

  const canPaste = useCallback(
    (viewMode: ViewMode) => {
      void clipboardTick;
      return canPasteClipboard(viewMode, calId);
    },
    [calId, clipboardTick],
  );

  const canPasteWeek = useCallback(() => {
    void clipboardTick;
    return canPasteWeekClipboard(calId);
  }, [calId, clipboardTick]);

  const pasteAtDate = useCallback(
    (targetDate: Date, viewMode: ViewMode, startMin?: number) => {
      const buffer = readCalendarClipboard();
      if (!buffer || !canPasteClipboard(viewMode, calId)) return false;
      const pasted =
        startMin != null && (viewMode === "week" || viewMode === "day")
          ? buildPasteEventsAtDateTime(buffer, targetDate, startMin)
          : buildPasteEventsAtDate(buffer, targetDate);
      for (const event of pasted) upsertEvent(pastedEventPatch(event));
      bumpClipboard();
      return pasted.length > 0;
    },
    [bumpClipboard, calId, upsertEvent],
  );

  const pasteWeekAt = useCallback(
    (weekStart: Date, viewMode: ViewMode) => {
      void viewMode;
      const buffer = readCalendarClipboard();
      if (!buffer || !canPasteWeekClipboard(calId)) return false;
      const pasted = buildPasteEventsForWeek(buffer, weekStart);
      for (const event of pasted) upsertEvent(pastedEventPatch(event));
      bumpClipboard();
      return pasted.length > 0;
    },
    [bumpClipboard, calId, upsertEvent],
  );

  return (
    <CalendarViewActionsContext.Provider
      value={{
        calId,
        events,
        upsertEvent,
        deleteEvent,
        deleteEvents,
        canMutateEvent,
        reorderEvents,
        moveEvent,
        acceptCoachSession,
        refreshEvents,
        clipboardTick,
        bumpClipboard,
        copyEventsToClipboard,
        duplicateEvent,
        canPaste,
        canPasteWeek,
        pasteAtDate,
        pasteWeekAt,
        setPasteAnchorDate,
        peekPasteAnchorDate,
      }}
    >
      {children}
    </CalendarViewActionsContext.Provider>
  );
}

export function useCalendarViewActions(): CalendarViewActionsValue {
  const ctx = useContext(CalendarViewActionsContext);
  if (!ctx) {
    throw new Error("useCalendarViewActions must be used within CalendarViewActionsProvider");
  }
  return ctx;
}
