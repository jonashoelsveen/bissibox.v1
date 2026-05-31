/**
 * Diary — replica of the Calendar page restricted to logging past sessions.
 * Profile-scoped (personal or active team); week + month only.
 */

import { useEffect, useMemo, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useLibrarySetting } from "@/lib/library-settings";
import type { CategoryKey } from "./CalendarSideNav";
import { DiarySideNav } from "./DiarySideNav";
import { YearCalendarView } from "./YearCalendarView";
import type { DateRange } from "./MiniCalendar";
import type { ViewMode } from "./UnifiedElasticGrid";

export function DiaryPage() {
  const { user, loading, activeEntityId } = useAuth();

  const { calId, calTitle, teamId, memberId } = useMemo(
    () => ({
      calId: user ? (activeEntityId ? `diary:team:${activeEntityId}` : `diary:user:${user.id}`) : "",
      calTitle: activeEntityId ? "Team diary" : "My diary",
      teamId: activeEntityId ?? null,
      memberId: activeEntityId ? null : user?.id ?? null,
    }),
    [user, activeEntityId],
  );
  const profileScopeKey = `${user?.id ?? "anon"}:${activeEntityId ?? "individual"}`;

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

  useEffect(() => {
    const t = new Date();
    setCurrentDate(t);
    setCurrentRange({ start: t, end: t });
    setViewMode("week");
    setVisibleCategories(new Set<CategoryKey>(["ind:training"]));
  }, [profileScopeKey]);

  const panelScopeKey = activeEntityId ?? user?.id ?? "anon";
  const [panelOpen, setPanelOpen] = useLibrarySetting<boolean>(
    `diary:panel:open:${panelScopeKey}`,
    true,
  );

  // Gate the entire diary on a resolved auth state. Without this, the page
  // briefly mounts with no user during auth bootstrap and any writes would
  // land in a shared bucket that the next signed-in user would inherit.
  // NOTE: This early-return MUST come AFTER every hook above, otherwise the
  // hook count changes between renders and React crashes the component to a
  // blank screen ("Rendered more hooks than during the previous render.").
  if (loading || !user) {
    return <div className="h-full w-full bg-white" />;
  }

  return (
    <div className="h-full overflow-hidden bg-white">
      <div
        className="relative grid h-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: panelOpen ? "256px 1fr" : "0px 1fr" }}
      >
        <aside className="relative md:h-full overflow-hidden">
          <div
            className="relative h-full pl-2 pr-2 py-2 transition-transform duration-300 ease-out"
            style={{
              width: 256,
              transform: panelOpen ? "translateX(0)" : "translateX(-100%)",
            }}
          >
            <div className="mac-panel relative h-full overflow-hidden rounded-lg border border-hairline shadow-sm">
              <div className="h-full overflow-y-auto px-1.5 pb-6 pt-[48px]">
                <DiarySideNav
                  key={profileScopeKey}
                  currentDate={currentDate}
                  currentRange={currentRange}
                  onCurrentDateChange={(d, r) => {
                    setCurrentDate(d);
                    setCurrentRange(r);
                  }}
                  viewMode={viewMode}
                  visibleCategories={visibleCategories}
                  onToggleCategory={toggleCategory}
                  teamId={teamId}
                  ownerId={memberId}
                  stravaUserId={memberId}
                />
              </div>
              <div className="mac-panel-fade pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-lg" />
            </div>
          </div>
        </aside>

        <button
          type="button"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label={panelOpen ? "Hide panel" : "Show panel"}
          title={panelOpen ? "Hide panel" : "Show panel"}
          className="absolute left-3 top-[12px] z-40 grid h-7 w-7 place-items-center rounded-md bg-white/0 text-muted-foreground hover:bg-secondary/60 hover:text-ink"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className={`relative min-w-0 md:h-full md:overflow-hidden transition-[padding-left] duration-300 ease-out ${panelOpen ? "pl-0" : "pl-2"}`}>
          <YearCalendarView
            key={profileScopeKey}
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
            memberId={memberId ?? undefined}
            viewerRole="owner"
            panelOpen={panelOpen}
            teamId={teamId ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
