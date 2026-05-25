import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, PanelLeft } from "lucide-react";
import { MiniCalendar, type DateRange } from "@/components/calendar/MiniCalendar";
import { YearCalendarView } from "@/components/calendar/YearCalendarView";
import { DiaryActivitiesSection } from "@/components/calendar/DiaryActivitiesSection";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import type { CategoryKey } from "@/components/calendar/CalendarSideNav";
import { useViewerRole } from "@/hooks/useViewerRole";
import { useLibrarySetting } from "@/lib/library-settings";


export type MemberSubTab = "calendar" | "diary";

interface Props {
  userId: string;
  name: string;
  /** Whether the surrounding right-side clients panel is open. Used to shift
   *  the calendar header so its right cluster makes room for the toggle icon. */
  rightPanelOpen?: boolean;
}

/**
 * MemberWorkspace — full calendar/diary view for a single client/member,
 * shown when their tab is active on the Clients page. Renders a left
 * rail (mini-calendar with calendar/diary toggle) and the YearCalendarView.
 */
export function MemberWorkspace({ userId, name, rightPanelOpen = true }: Props) {
  void name;
  const [subTab, setSubTab] = useState<MemberSubTab>("calendar");
  const viewerRole = useViewerRole(userId, { context: "leader" });

  const [leftPanelOpen, setLeftPanelOpen] = useLibrarySetting<boolean>(
    `clients:member-panel:open:${userId}`,
    true,
  );

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
      className="relative grid h-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
      style={{ gridTemplateColumns: leftPanelOpen ? "256px 1fr" : "0px 1fr" }}
    >
      <aside className="relative md:h-full overflow-hidden">
        <div
          className="relative h-full pl-2 pr-2 py-2 transition-transform duration-300 ease-out"
          style={{
            width: 256,
            transform: leftPanelOpen ? "translateX(0)" : "translateX(-100%)",
          }}
        >
          <div className="mac-panel relative h-full overflow-hidden rounded-lg border border-hairline shadow-sm">
            <div className="h-full overflow-y-auto px-3 pb-6 pt-[48px]">
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

                {subTab === "diary" && (
                  <div className="flex flex-col gap-1 pb-4">
                    <DiaryActivitiesSection
                      title="Activities"
                      canEdit={false}
                      kind="diary_activity"
                    />
                    <DiaryActivitiesSection
                      title="Strava activities"
                      canEdit={false}
                      kind="diary_strava"
                    />
                  </div>
                )}
              </nav>

            </div>
            <div className="mac-panel-fade pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-lg" />
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setLeftPanelOpen(!leftPanelOpen)}
        aria-label={leftPanelOpen ? "Hide panel" : "Show panel"}
        title={leftPanelOpen ? "Hide panel" : "Show panel"}
        className="absolute left-3 top-[12px] z-40 grid h-7 w-7 place-items-center rounded-md bg-white/0 text-muted-foreground hover:bg-secondary/60 hover:text-ink"
      >
        <PanelLeft className="h-4 w-4" />
      </button>

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
          panelOpen={leftPanelOpen}
          rightPanelOpen={rightPanelOpen}
          disableImport
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
