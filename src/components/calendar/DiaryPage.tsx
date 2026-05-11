/**
 * Diary — replica of the Calendar page restricted to logging past sessions.
 * Individual seat only; no entity tabs; week + month only.
 */

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { CategoryKey } from "./CalendarSideNav";
import { DiarySideNav } from "./DiarySideNav";
import { YearCalendarView } from "./YearCalendarView";
import type { DateRange } from "./MiniCalendar";
import type { ViewMode } from "./UnifiedElasticGrid";

export function DiaryPage() {
  const { user } = useAuth();

  const { calId, calTitle } = useMemo(
    () => ({
      calId: user ? `diary:${user.id}` : "diary:anon",
      calTitle: "My diary",
    }),
    [user],
  );

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const [viewMode, setViewMode] = useState<ViewMode>("week");

  const [visibleCategories, setVisibleCategories] = useState<Set<CategoryKey>>(
    () => new Set<CategoryKey>(["ind:training"]),
  );
  const toggleCategory = (k: CategoryKey) =>
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="h-full overflow-hidden px-4 md:px-6">
      <div className="grid h-full gap-6 overflow-hidden pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:h-full md:overflow-y-auto md:pr-0">
          <DiarySideNav
            currentDate={currentDate}
            currentRange={currentRange}
            onCurrentDateChange={(d, r) => {
              setCurrentDate(d);
              setCurrentRange(r);
            }}
            viewMode={viewMode}
            visibleCategories={visibleCategories}
            onToggleCategory={toggleCategory}
          />
        </aside>

        <div className="min-w-0 md:h-full md:overflow-y-auto">
          <YearCalendarView
            calId={calId}
            defaultTitle={calTitle}
            seat="individual"
            appKind="diary"
            currentDate={currentDate}
            currentRange={currentRange}
            onCurrentDateChange={(d, r) => {
              setCurrentDate(d);
              setCurrentRange(r ?? { start: d, end: d });
            }}
            viewMode={viewMode}
            onViewModeChange={(v) => setViewMode(v === "day" ? "week" : v)}
            visibleCategories={visibleCategories}
          />
        </div>
      </div>
    </div>
  );
}
