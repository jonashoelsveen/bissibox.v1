/**
 * DiaryVisibilityContext — shared state for which diary activity tabs
 * and Strava sport types are currently hidden by the user.
 *
 * Written by the left-panel sidebar sections (DiaryActivitiesSection,
 * DiaryStravaActivitiesSection) and read by YearCalendarViewInner and
 * StatsChartView to filter events in real time.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface DiaryVisibilityState {
  /** Set of calendar_category IDs that are hidden. */
  hiddenCategoryIds: Set<string>;
  /** Set of Strava sport_type strings that are hidden. */
  hiddenSportTypes: Set<string>;
  toggleCategoryId: (id: string) => void;
  toggleSportType: (sport: string) => void;
  isCategoryHidden: (id: string) => boolean;
  isSportTypeHidden: (sport: string) => boolean;
}

const DiaryVisibilityContext = createContext<DiaryVisibilityState | null>(null);

export function DiaryVisibilityProvider({ children }: { children: ReactNode }) {
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(new Set());
  const [hiddenSportTypes, setHiddenSportTypes] = useState<Set<string>>(new Set());

  const toggleCategoryId = useCallback((id: string) => {
    setHiddenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSportType = useCallback((sport: string) => {
    setHiddenSportTypes((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }, []);

  const isCategoryHidden = useCallback(
    (id: string) => hiddenCategoryIds.has(id),
    [hiddenCategoryIds],
  );

  const isSportTypeHidden = useCallback(
    (sport: string) => hiddenSportTypes.has(sport),
    [hiddenSportTypes],
  );

  const value = useMemo(
    () => ({
      hiddenCategoryIds,
      hiddenSportTypes,
      toggleCategoryId,
      toggleSportType,
      isCategoryHidden,
      isSportTypeHidden,
    }),
    [
      hiddenCategoryIds,
      hiddenSportTypes,
      toggleCategoryId,
      toggleSportType,
      isCategoryHidden,
      isSportTypeHidden,
    ],
  );

  return (
    <DiaryVisibilityContext.Provider value={value}>
      {children}
    </DiaryVisibilityContext.Provider>
  );
}

export function useDiaryVisibility(): DiaryVisibilityState {
  const ctx = useContext(DiaryVisibilityContext);
  if (!ctx) throw new Error("useDiaryVisibility must be used inside DiaryVisibilityProvider");
  return ctx;
}

/** Safe variant — returns null when used outside the provider (e.g. calendar page). */
export function useDiaryVisibilitySafe(): DiaryVisibilityState | null {
  return useContext(DiaryVisibilityContext);
}
