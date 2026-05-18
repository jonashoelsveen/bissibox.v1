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
import type { ViewMode } from "./UnifiedElasticGrid";

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
  const [viewMode, setViewMode] = useState<ViewMode>("month");

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

  return (
    <div className="h-full overflow-hidden px-4 md:px-6">
      <div className="grid h-full gap-6 overflow-hidden pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:h-full md:overflow-y-auto md:pr-0">
          <CalendarSideNav
            currentDate={currentDate}
            currentRange={currentRange}
            onCurrentDateChange={(d, r) => {
              setCurrentDate(d);
              setCurrentRange(r);
            }}
            viewMode={viewMode}
            visibleCategories={visibleCategories}
            onToggleCategory={toggleCategory}
            seat={seat}
            entities={seat === "individual" ? entities : []}
            teamId={teamId}
            teamName={entityName}
          />
        </aside>

        <div className="min-w-0 md:h-full md:overflow-y-auto">
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
          />
        </div>
      </div>
    </div>
  );
}
