/**
 * Calendar — UI shell.
 *
 * Each profile has exactly ONE calendar (no folders, no tabs, no "Previous"
 * list). The page renders:
 *   - A simple top header strip (matching the existing /media chrome look)
 *     with a portal mount for the inner page's actions.
 *   - A two-column layout: left rail (mini-calendar + category filters)
 *     and the main YearCalendarView on the right.
 *
 * Mini-calendar selection (`currentDate` / `currentRange`), the active
 * `viewMode`, and the `visibleCategories` set are owned here so the rail
 * and the grid stay in lockstep.
 */

import { useEffect, useMemo, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLibrarySetting } from "@/lib/library-settings";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarSideNav,
  type CategoryKey,
  ADMIN_SIDENAV_CATEGORIES,
  INDIVIDUAL_SIDENAV_CATEGORIES,
  type SideNavEntity,
} from "./CalendarSideNav";
import { YearCalendarView } from "./YearCalendarView";
import type { DateRange } from "./MiniCalendar";
import type { ViewMode, ExtendedViewMode } from "./UnifiedElasticGrid";

export function CalendarPage() {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const seat: "individual" | "admin" = isTeamMode ? "admin" : "individual";

  /* ----- entity scope (single-calendar id) ----- */
  const [entityName, setEntityName] = useState("");
  const [entities, setEntities] = useState<SideNavEntity[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setEntityName("");
        setEntities([]);
        return;
      }
      const { data } = await supabase
        .from("teams")
        .select("id,name")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const list = (data ?? []) as Array<{ id: string; name: string }>;
      setEntities(list.map((e) => ({ id: e.id, name: e.name })));
      if (isTeamMode) {
        const found = activeEntityId ? list.find((e) => e.id === activeEntityId) : list[0];
        setEntityName(found?.name ?? "Team");
      } else {
        setEntityName("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isTeamMode, activeEntityId]);

  /* ----- the single calendar id for this profile ----- */
  const { calId, calTitle } = useMemo(() => {
    if (!user) return { calId: "anon", calTitle: "Calendar" };
    if (isTeamMode) {
      const eid = activeEntityId ?? entities[0]?.id ?? "none";
      return { calId: `team:${eid}`, calTitle: `${entityName || "Team"} calendar` };
    }
    return { calId: `user:${user.id}`, calTitle: "My calendar" };
  }, [user, isTeamMode, activeEntityId, entityName, entities]);

  /* ----- shared state: date / range / view / filters ----- */
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const [viewMode, setViewMode] = useState<ExtendedViewMode>("month");

  // Default: every category visible. Categories load lazily; new keys are
  // added to the visible set as soon as we encounter them in the grid filter.
  const [visibleCategories, setVisibleCategories] = useState<Set<CategoryKey>>(() => {
    const all = new Set<CategoryKey>();
    INDIVIDUAL_SIDENAV_CATEGORIES.forEach((c) => all.add(c.key));
    ADMIN_SIDENAV_CATEGORIES.forEach((c) => all.add(c.key));
    return all;
  });
  const toggleCategory = (k: CategoryKey) =>
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // Load category rows so unknown me:* keys are pre-seeded according to
  // their persisted `hidden` flag. Subscribes for live updates. In team
  // mode, loads the active team's categories; otherwise the user's
  // personal categories.
  const teamId: string | null = isTeamMode ? (activeEntityId ?? entities[0]?.id ?? null) : null;
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const apply = (rows: Array<{ color: string; hidden: boolean; default_key: string | null }>) => {
      if (cancelled) return;
      setVisibleCategories((prev) => {
        const next = new Set(prev);
        for (const row of rows) {
          const key = `me:${row.color.toLowerCase()}` as CategoryKey;
          if (row.hidden) next.delete(key);
          else next.add(key);
          if (row.default_key === "training") {
            if (row.hidden) next.delete("ind:training");
            else next.add("ind:training");
          }
        }
        return next;
      });
    };
    const baseQuery = () => {
      let q = supabase
        .from("calendar_categories")
        .select("color,hidden,default_key");
      if (teamId) q = q.eq("team_id", teamId);
      else q = q.is("team_id", null).eq("user_id", user.id);
      return q;
    };
    void baseQuery().then(({ data }) => apply((data ?? []) as never));
    const filter = teamId ? `team_id=eq.${teamId}` : `user_id=eq.${user.id}`;
    const ch = supabase
      .channel(`calendar-page-categories-${teamId ?? user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_categories", filter },
        () => {
          void baseQuery().then(({ data }) => apply((data ?? []) as never));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [user, teamId]);

  const panelScopeKey = activeEntityId ?? user?.id ?? "anon";
  const [panelOpen, setPanelOpen] = useLibrarySetting<boolean>(
    `calendar:panel:open:${panelScopeKey}`,
    true,
  );

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
              <div className="h-full overflow-hidden px-1.5 pt-[48px]">
                <CalendarSideNav
                  currentDate={currentDate}
                  currentRange={currentRange}
                  onCurrentDateChange={(d, r) => {
                    setCurrentDate(d);
                    setCurrentRange(r);
                  }}
                  viewMode={viewMode === "year" ? "month" : viewMode}

                  visibleCategories={visibleCategories}
                  onToggleCategory={toggleCategory}
                  seat={seat}
                  entities={seat === "individual" ? entities : []}
                  teamId={teamId}
                  teamName={entityName}
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
            calId={calId}
            defaultTitle={calTitle}
            seat={seat}
            currentDate={currentDate}
            currentRange={currentRange}
            onCurrentDateChange={(d, r) => {
              setCurrentDate(d);
              setCurrentRange(r ?? { start: d, end: d });
            }}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            visibleCategories={visibleCategories}
            teamId={teamId}
            panelOpen={panelOpen}
          />
        </div>
      </div>
    </div>
  );
}
