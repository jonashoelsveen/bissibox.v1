import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, PanelLeft } from "lucide-react";
import { MiniCalendar, type DateRange } from "@/components/calendar/MiniCalendar";
import { YearCalendarView } from "@/components/calendar/YearCalendarView";
import { DiaryActivitiesSection } from "@/components/calendar/DiaryActivitiesSection";
import { MetricsSection } from "@/components/calendar/MetricsSection";
import { ClientCategoriesSection } from "@/components/calendar/ClientCategoriesSection";
import { DiaryVisibilityProvider } from "@/components/calendar/DiaryVisibilityContext";
import type { ViewMode, ExtendedViewMode } from "@/components/calendar/UnifiedElasticGrid";
import type { CategoryKey } from "@/components/calendar/CalendarSideNav";
import { useAuth } from "@/lib/auth";
import { useViewerRole } from "@/hooks/useViewerRole";
import { useCoachAccess } from "@/hooks/useCoachAccess";
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
 * MemberWorkspace — full calendar/diary view for a single client/member.
 *
 * When the viewer is a coach (i.e. not the member themself) it switches the
 * calendar scope to `client:<uuid>` so sessions created by the coach are
 * persisted with `coach_pending = true` against the client's own row. The
 * left rail then shows only the categories the client has explicitly
 * granted this coach access to, with the client's name as the section
 * header (mirroring the "Me" header in individual mode).
 *
 * View-vs-edit is driven by `user_coaches.calendar_access`:
 *   - "edit" → coach gets the same in-grid editing affordances as the
 *     owner (double-click + area-mark to create sessions). All created
 *     sessions appear as `coach_pending` until the client accepts.
 *   - "view" → categories still render, but no editing surface is
 *     exposed (double-click does nothing, drag selections release with
 *     no tile created).
 */
export function MemberWorkspace({ userId, name, rightPanelOpen = true }: Props) {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<MemberSubTab>("calendar");
  const viewerRole = useViewerRole(userId, { context: "leader" });
  const coachAccess = useCoachAccess(userId);

  const isSelf = !!user && user.id === userId;
  const isCoach = !isSelf && !!coachAccess;
  const canEditCalendar = isCoach && coachAccess?.calendarAccess === "edit";

  const [leftPanelOpen, setLeftPanelOpen] = useLibrarySetting<boolean>(
    `clients:member-panel:open:${userId}`,
    true,
  );

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const [calViewMode, setCalViewMode] = useState<ExtendedViewMode>("month");
  const [diaryViewMode, setDiaryViewMode] = useState<ExtendedViewMode>("week");

  // Categories the coach is hiding locally — toggled from the side rail.
  // Stored as a set of lowercase hex colors. Only events whose color is in
  // the *granted* set are visible to begin with; this set filters further.
  const [hiddenColors, setHiddenColors] = useState<Set<string>>(() => new Set());
  const toggleHiddenColor = (color: string) =>
    setHiddenColors((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color);
      else next.add(color);
      return next;
    });

  // Coach view restricts category visibility to granted colors only — the
  // YearCalendarView's coach-gate already filters non-granted "me:*"
  // events. Local hide toggles narrow further by removing those colors
  // from `visibleCategories`. For the coach side we pass an unrestricted
  // set (visibleCategories=undefined effectively means "show everything
  // the coach-gate allows"), then re-add a filter via a derived set.
  const visibleCategories = useMemo<Set<CategoryKey> | undefined>(() => {
    if (!isCoach) {
      // Self-view fallback (rare from /clients): keep training visible.
      return new Set<CategoryKey>(["ind:training"]);
    }
    // Coach view: we don't constrain the set here — the YearCalendarView's
    // coach-gate already drops events outside granted colors. Local hides
    // are applied via a separate transform in YearCalendarView through
    // `hiddenMeColors` (which reads owner-side `calendar_categories.hidden`).
    // To honor *our* local toggles, we widen the set to undefined so all
    // other-category events pass; me:* events are then gated by the
    // owner-side hidden flags + granted set.
    return undefined;
  }, [isCoach]);

  const viewMode = subTab === "diary" ? diaryViewMode : calViewMode;
  const setViewMode = (v: ExtendedViewMode) => {
    if (subTab === "diary") setDiaryViewMode(v === "day" ? "week" : v);
    else setCalViewMode(v);
  };

  // Calendar scope id. Coaches write into the client's calendar via the
  // `client:` scope so RLS attaches `coach_pending = true` + the coach id.
  const calId = useMemo(() => {
    if (subTab === "diary") {
      return isCoach ? `diary:client:${userId}` : `diary:user:${userId}`;
    }
    return isCoach ? `client:${userId}` : `user:${userId}`;
  }, [subTab, userId, isCoach]);

  // viewerRole as seen by the grid. Coaches with edit access get the full
  // owner UX so the existing edit affordances (double-click, mark-area,
  // drag) light up. View-only coaches keep the read-only role.
  const gridViewerRole = canEditCalendar ? "owner" : viewerRole;

  return (
    <DiaryVisibilityProvider>
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
              <nav className="flex h-full flex-col gap-3 overflow-hidden px-3 pb-6 pt-[48px]">
                <div className="shrink-0">
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
                  <div className="mt-3">
                    <MiniCalendar
                      selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
                      onSelectRange={(r) => {
                        setCurrentDate(r.start);
                        setCurrentRange(r);
                      }}
                      viewMode={viewMode === "year" ? "month" : viewMode}
                    />
                  </div>
                </div>

                {subTab === "calendar" && isCoach && (
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
                    <ClientCategoriesSection
                      clientUserId={userId}
                      displayName={name}
                      hiddenColors={hiddenColors}
                      onToggleHidden={toggleHiddenColor}
                    />
                  </div>
                )}

                {subTab === "diary" && (
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
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
                    <MetricsSection title="Metrics" canEdit={false} />
                  </div>
                )}
              </nav>
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

        <div
          className={`relative min-w-0 md:h-full md:overflow-hidden transition-[padding-left] duration-300 ease-out ${
            leftPanelOpen ? "pl-0" : "pl-2"
          }`}
        >
          <YearCalendarView
            calId={calId}
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
            hiddenColors={hiddenColors}
            memberId={userId}
            viewerRole={gridViewerRole}
            panelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
            disableImport
          />
        </div>
      </div>
    </DiaryVisibilityProvider>
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
