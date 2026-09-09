/**
 * CalendarSearchContext — shared state for the left-panel session search.
 *
 * Owned by CalendarPage. Consumed by:
 *  - CalendarSearch (toggle icon + expanding input + results list)
 *  - CalendarSideNav (shows results / hides default content when active)
 *  - YearCalendarView (publishes the underlying event list)
 *
 * A small DOM effect in CalendarPage applies `data-search-match`
 * attributes to session tiles (which all carry `data-event-id`) so
 * non-matches can be greyed in CSS. The selected calendar tile uses the
 * usual clicked fill without an outline; the session menu stays closed
 * until the user clicks that tile.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CalendarEvent } from "./yearStore";

export interface SearchResult {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
  color: string | null;
  allDay: boolean;
}

function parseSessionMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** First current/upcoming result in a chronological list; else the last (most recent past). */
export function findAnchorSearchResult(
  list: SearchResult[],
  now = Date.now(),
): SearchResult | null {
  if (list.length === 0) return null;
  for (const r of list) {
    const end = parseSessionMs(r.endISO);
    if (!Number.isNaN(end) && end >= now) return r;
    const start = parseSessionMs(r.startISO);
    if (!Number.isNaN(start) && start >= now) return r;
  }
  return list[list.length - 1] ?? null;
}

interface CalendarSearchValue {
  /** Search bar expanded? */
  active: boolean;
  setActive: (next: boolean) => void;
  query: string;
  setQuery: (next: string) => void;

  /** Currently selected result (same solid click fill as a calendar tile). */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  /** Published by YearCalendarView so the side nav can filter. */
  publishEvents: (events: CalendarEvent[]) => void;
  /** Full published event list (day sessions under mini-cal, search, etc.). */
  events: CalendarEvent[];
  /** Computed: results matching `query` (empty when query is blank). */
  results: SearchResult[];
  /**
   * Next upcoming (or still-running) match in chronological results;
   * most recent past match if everything has already ended.
   */
  anchorResult: SearchResult | null;
  /** Computed: ids of matching events for DOM highlighting. */
  matchIds: Set<string>;

  /** Click handler for selecting a result (also focuses date in the grid). */
  onPickResult: (r: SearchResult) => void;
  setOnPickResult: (fn: (r: SearchResult) => void) => void;
}

const Ctx = createContext<CalendarSearchValue | null>(null);

export function CalendarSearchProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState(false);
  const [query, setQueryState] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pickHandler, setPickHandler] = useState<(r: SearchResult) => void>(
    () => () => {},
  );

  const publishEvents = useCallback((next: CalendarEvent[]) => {
    setEvents(next);
  }, []);

  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
    if (!next) {
      setQueryState("");
      setSelectedId(null);
    }
  }, []);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setSelectedId(null);
  }, []);

  const setOnPickResult = useCallback((fn: (r: SearchResult) => void) => {
    setPickHandler(() => fn);
  }, []);

  const { results, matchIds, anchorResult } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        results: [] as SearchResult[],
        matchIds: new Set<string>(),
        anchorResult: null as SearchResult | null,
      };
    }
    const list: SearchResult[] = [];
    const ids = new Set<string>();
    for (const e of events) {
      const haystack = [e.title, e.diaryGroup, e.diarySub, e.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) continue;
      ids.add(e.id);
      list.push({
        id: e.id,
        title: e.title || e.diarySub || e.diaryGroup || "Session",
        startISO: e.startISO,
        endISO: e.endISO,
        color: e.color,
        allDay: e.allDay,
      });
    }
    // Chronological: past above, future below. The results list scrolls so the
    // next upcoming match sits at the top of the visible pane.
    list.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0));
    return {
      results: list,
      matchIds: ids,
      anchorResult: findAnchorSearchResult(list),
    };
  }, [events, query]);

  const value = useMemo<CalendarSearchValue>(
    () => ({
      active,
      setActive,
      query,
      setQuery,
      selectedId,
      setSelectedId,
      publishEvents,
      events,
      results,
      matchIds,
      anchorResult,
      onPickResult: pickHandler,
      setOnPickResult,
    }),
    [
      active,
      setActive,
      query,
      setQuery,
      selectedId,
      publishEvents,
      events,
      results,
      matchIds,
      anchorResult,
      pickHandler,
      setOnPickResult,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCalendarSearch(): CalendarSearchValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCalendarSearch must be used within CalendarSearchProvider");
  return v;
}

/** Safe variant — returns null outside a provider. */
export function useCalendarSearchSafe(): CalendarSearchValue | null {
  return useContext(Ctx);
}
