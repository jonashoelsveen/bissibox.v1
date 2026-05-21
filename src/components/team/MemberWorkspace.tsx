import { useMemo, useState } from "react";
import { BookOpen, CalendarDays } from "lucide-react";
import { MiniCalendar, type DateRange } from "@/components/calendar/MiniCalendar";
import { YearCalendarView } from "@/components/calendar/YearCalendarView";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import type { CategoryKey } from "@/components/calendar/CalendarSideNav";
import { useViewerRole } from "@/hooks/useViewerRole";

export type MemberSubTab = "calendar" | "diary";

interface Props {
  userId: string;
  name: string;
}

/**
 * MemberWorkspace — full calendar/diary view for a single group member,
 * shown when their tab is active on the GroupMembersPage. Renders a left
 * rail (mini-calendar with calendar/diary toggle) styled identically to
 * the Calendar/Diary page rail, and the YearCalendarView on the right.
 */
export function MemberWorkspace({ userId, name }: Props) {
  void name;
  const [subTab, setSubTab] = useState<MemberSubTab>("calendar");
  const viewerRole = useViewerRole(userId, { context: "leader" });

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const [calViewMode, setCalViewMode] = useState<ViewMode>("month");
  const [diaryViewMode, setDiaryViewMode] = useState<ViewMode>("week");

  const visibleCategories = useMemo<Set<CategoryKey>>(
    () => new Set<CategoryKey>(["ind:training"]),
    [],
  );

  const viewMode = subTab === "diary" ? diaryViewMode : calViewMode;
  const setViewMode = (v: ViewMode) => {
    if (subTab === "diary") setDiaryViewMode(v === "day" ? "week" : v);
    else setCalViewMode(v);
  };

  return (
    <div
      className="grid h-full overflow-hidden"
      style={{ gridTemplateColumns: "256px 1fr" }}
    >
      <aside className="relative md:h-full overflow-hidden">
        <div className="relative h-full pl-2 pr-2 py-2">
          <div className="mac-panel relative h-full overflow-hidden rounded-lg border border-hairline shadow-sm">
            <div className="h-full overflow-y-auto px-3 pb-6 pt-3">
              <nav className="flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
                <div className="flex items-center gap-1">
                  <IconTab
                    active={subTab === "calendar"}
                    onClick={() => setSubTab("calendar")}
                    label="Calendar"
                  >
                    <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  </IconTab>
                  <IconTab
                    active={subTab === "diary"}
                    onClick={() => setSubTab("diary")}
                    label="Diary"
                  >
                    <BookOpen className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  </IconTab>
                </div>

                <div>
                  <MiniCalendar
                    selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
                    onSelectRange={(r) => {
                      setCurrentDate(r.start);
                      setCurrentRange(r);
                    }}
                    viewMode={viewMode}
                  />
                </div>
              </nav>
            </div>
            <div className="mac-panel-fade pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-lg" />
          </div>
        </div>
      </aside>

      <div className="min-w-0 md:h-full md:overflow-hidden">
        <YearCalendarView
          calId={subTab === "diary" ? `diary:${userId}` : `user:${userId}`}
          defaultTitle={subTab === "diary" ? "Diary" : "Calendar"}
          seat="individual"
          appKind={subTab}
          currentDate={currentDate}
          currentRange={currentRange}
          onCurrentDateChange={(d, r) => {
            setCurrentDate(d);
            setCurrentRange(r ?? { start: d, end: d });
          }}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          visibleCategories={visibleCategories}
          memberId={userId}
          viewerRole={viewerRole}
        />
      </div>
    </div>
  );
}

function IconTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-transparent transition ${
        active ? "text-ink" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
