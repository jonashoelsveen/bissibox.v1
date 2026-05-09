/**
 * Diary — replica of the Calendar page restricted to logging past sessions.
 * Individual seat only; no entity tabs; week + month only.
 */

import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
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
    <div className="flex h-[calc(100dvh-5rem)] flex-col overflow-hidden px-4 md:px-6">
      <div className="-mx-4 flex shrink-0 items-end justify-between gap-2 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        <div
          className="-mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 border-primary py-2.5 pl-0 pr-4 text-sm font-medium text-ink"
          style={{ width: 240 }}
        >
          <BookOpen className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
          <span className="truncate">Diary</span>
        </div>
        <div className="flex-1" />
      </div>

      <div className="grid min-h-0 flex-1 gap-6 overflow-hidden pt-4 md:grid-cols-[240px_1fr]">
        <aside className="min-h-0 overflow-y-auto md:self-stretch">
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

        <div className="flex min-h-0 min-w-0 flex-col">
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
