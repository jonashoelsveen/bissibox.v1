// Preview overlay context — lets the ImportCalendar floating modal push
// "ghost" events into the active calendar grid and dim existing events.
//
// The provider lives in CalendarPage so any descendant (the grid + the
// import button) can read/write it. While `previewEvents` is non-null the
// grid renders them in green and dims its real events.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ParsedEvent, DetectedCategory } from "./types";

export interface PreviewState {
  /** Set when an import is active. Null means no overlay. */
  events: ParsedEvent[] | null;
  categories: DetectedCategory[];
  /** Category ids that should be visible in the overlay. */
  visibleCategoryIds: Set<string>;
  /** Color per category id. */
  categoryColors: Record<string, string>;
  /** File-category id → internal platform category value (e.g. "training"). */
  categoryMappings: Record<string, string>;
}

interface PreviewActions {
  begin: (
    events: ParsedEvent[],
    categories: DetectedCategory[],
    categoryColors: Record<string, string>,
    categoryMappings: Record<string, string>,
  ) => void;
  setVisibleCategories: (ids: Set<string>) => void;
  setCategoryMapping: (fileCategoryId: string, internal: string) => void;
  clear: () => void;
}

const PreviewContext = createContext<(PreviewState & PreviewActions) | null>(null);

export function PreviewOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewState>({
    events: null,
    categories: [],
    visibleCategoryIds: new Set(),
    categoryColors: {},
    categoryMappings: {},
  });

  const value = useMemo<PreviewState & PreviewActions>(
    () => ({
      ...state,
      begin: (events, categories, categoryColors, categoryMappings) =>
        setState({
          events,
          categories,
          visibleCategoryIds: new Set(categories.map((c) => c.id)),
          categoryColors,
          categoryMappings,
        }),
      setVisibleCategories: (ids) =>
        setState((prev) => ({ ...prev, visibleCategoryIds: new Set(ids) })),
      setCategoryMapping: (fileCategoryId, internal) =>
        setState((prev) => ({
          ...prev,
          categoryMappings: { ...prev.categoryMappings, [fileCategoryId]: internal },
        })),
      clear: () =>
        setState({
          events: null,
          categories: [],
          visibleCategoryIds: new Set(),
          categoryColors: {},
          categoryMappings: {},
        }),
    }),
    [state],
  );

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreviewOverlay() {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    throw new Error("usePreviewOverlay must be used inside <PreviewOverlayProvider>.");
  }
  return ctx;
}

/** Safe read-only accessor that returns nulls when not inside a provider —
 *  used by the grid components so they can be rendered standalone too. */
export function usePreviewOverlaySafe(): (PreviewState & PreviewActions) | null {
  return useContext(PreviewContext);
}
