/**
 * Diary — replica of the Calendar page restricted to logging past sessions.
 * Individual seat only; no entity tabs; week + month only.
 */

import { NavIconTabs } from "@/components/NavIconTabs";
import { ProfileTab } from "@/components/ProfileTab";
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
    <div className="px-4 md:px-6">
      <div className="sticky top-[98px] z-20 -mx-4 flex items-end justify-between gap-2 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        <div className="flex-1" />
      </div>

      <div className="grid gap-6 pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-28 md:self-start">
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

        <div className="min-w-0">
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
