/**
 * Calendar / Projects — UI shell.
 *
 * Each profile has exactly ONE calendar. The page renders a two-column
 * layout: left rail and YearCalendarView on the right.
 *
 * `scale="micro"` (Calendar app) shows the day/week/month grid + mini-cal.
 * `scale="macro"` (Projects app) shows the year Gantt + projects list.
 *
 * Mini-calendar selection (`currentDate` / `currentRange`), the active
 * `viewMode`, and the `visibleCategories` set are owned here so the rail
 * and the grid stay in lockstep.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isEntityFeatureEnabled } from "@/lib/features";
import { useLibrarySetting } from "@/lib/library-settings";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarSideNav,
  type CategoryKey,
  INDIVIDUAL_SIDENAV_CATEGORIES,
  type SideNavEntity,
} from "./CalendarSideNav";
import { YearCalendarView } from "./YearCalendarView";
import { miniCalendarViewMode, type DateRange } from "./MiniCalendar";
import type { ViewMode, ExtendedViewMode } from "./UnifiedElasticGrid";
import { LeftPanel } from "@/components/LeftPanel";
import { CalendarSearchProvider,
  useCalendarSearch,
  type SearchResult,
} from "./CalendarSearchContext";
import { CalendarSearchToggle, CalendarSearchInput, type CalendarScale } from "./CalendarSearch";
import { MacroProjectNavProvider } from "./MacroProjectNavContext";
import { CalendarViewActionsProvider } from "./CalendarViewActionsContext";
import {
  clearCalendarSignedOut,
  isCalendarExplicitlySignedOut,
  readLastCalendarScope,
  writeLastCalendarScope,
} from "@/lib/calendarSessionPersist";
import { MembershipCalendarProvider } from "./MembershipCalendarContext";
import { EntityGroupVisibilityProvider } from "./EntityGroupVisibilityContext";


export function CalendarPage({ scale = "micro" }: { scale?: CalendarScale } = {}) {
  return (
    <CalendarSearchProvider>
      <MacroProjectNavProvider>
        <CalendarPageInner scale={scale} />
      </MacroProjectNavProvider>
    </CalendarSearchProvider>
  );
}

/** Standalone Projects app — the former Calendar Macro view. */
export function ProjectsPage() {
  return <CalendarPage scale="macro" />;
}

function CalendarPageInner({ scale: calendarScale }: { scale: CalendarScale }) {

  const { user, activeEntityId, authReady } = useAuth();

  /* ----- entity scope (single-calendar id) ----- */
  const [entityName, setEntityName] = useState("");
  const [entities, setEntities] = useState<SideNavEntity[]>([]);
  const [entitiesLoaded, setEntitiesLoaded] = useState(false);
  const entityKnown =
    !!activeEntityId && entities.some((entity) => entity.id === activeEntityId);
  /** Entity calendar seat — Bucket A: currently live, hidden this round. */
  const isTeamMode = entityKnown && isEntityFeatureEnabled("entityCalendarSharing");
  const seat: "individual" | "admin" = isTeamMode ? "admin" : "individual";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setEntityName("");
        setEntities([]);
        setEntitiesLoaded(true);
        return;
      }
      setEntitiesLoaded(false);
      let list: Array<{ id: string; name: string }> = [];
      try {
        const res = await fetch("/api/account/entities", {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const body = (await res.json()) as { groups?: Array<{ id?: unknown; name?: unknown }> };
          if (Array.isArray(body.groups)) {
            list = body.groups.flatMap((row) =>
              typeof row.id === "string" && row.id
                ? [{ id: row.id, name: typeof row.name === "string" ? row.name : "Entity" }]
                : [],
            );
          }
        }
      } catch {
        /* fall through to client */
      }
      if (cancelled) return;
      /** Client entity list fallback — Bucket A: skip unless calendar sharing is on. */
      if (list.length === 0 && isEntityFeatureEnabled("entityCalendarSharing")) {
        const { data: owned } = await supabase
          .from("app_teams")
          .select("id,name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        const ownedList = (owned ?? []) as Array<{ id: string; name: string }>;
        const ownedIds = new Set(ownedList.map((row) => row.id));
        const { data: adminLinks } = await supabase
          .from("app_team_admins")
          .select("team_id")
          .eq("user_id", user.id)
          .eq("status", "active");
        if (cancelled) return;
        const extraIds = [
          ...new Set(
            (adminLinks ?? [])
              .map((row) => row.team_id)
              .filter((id): id is string => typeof id === "string" && !ownedIds.has(id)),
          ),
        ];
        let adminList: Array<{ id: string; name: string }> = [];
        if (extraIds.length > 0) {
          const { data: extra } = await supabase.from("app_teams").select("id,name").in("id", extraIds);
          if (cancelled) return;
          adminList = (extra ?? []) as Array<{ id: string; name: string }>;
        }
        list = [...ownedList, ...adminList];
      }
      setEntities(list.map((e) => ({ id: e.id, name: e.name })));
      setEntitiesLoaded(true);
      const found = list.find((e) => e.id === activeEntityId);
      setEntityName(found?.name ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, activeEntityId]);

  /* ----- the single calendar id for this profile -----
   * Prefer the signed-in user/team. If the cookie expired mid-session, keep
   * the last scope so the local cache and sync queue still have a calendar
   * to attach to. Explicit sign-out does not reuse that scope. */
  const [cachedScope, setCachedScope] = useState<{ calId: string; calTitle: string } | null>(null);
  useEffect(() => {
    if (isCalendarExplicitlySignedOut()) {
      setCachedScope(null);
      return;
    }
    const last = readLastCalendarScope();
    if (last) setCachedScope({ calId: last.calId, calTitle: last.calTitle });
  }, [user?.id]);

  const { calId, calTitle } = useMemo(() => {
    if (user) {
      if (!entitiesLoaded) return { calId: "", calTitle: "Calendar" };
      if (activeEntityId) {
        if (!isTeamMode) return { calId: `user:${user.id}`, calTitle: "My calendar" };
        return { calId: `team:${activeEntityId}`, calTitle: `${entityName || "Team"} calendar` };
      }
      return { calId: `user:${user.id}`, calTitle: "My calendar" };
    }
    if (cachedScope?.calId) return { calId: cachedScope.calId, calTitle: cachedScope.calTitle };
    return { calId: "", calTitle: "Calendar" };
  }, [user, activeEntityId, entityName, cachedScope, isTeamMode, entitiesLoaded]);

  useEffect(() => {
    if (!user || !calId) return;
    writeLastCalendarScope({ calId, calTitle, userId: user.id });
    clearCalendarSignedOut();
  }, [user, calId, calTitle]);

  /* ----- shared state: date / range / view / filters ----- */
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<DateRange>(() => {
    const t = new Date();
    return { start: t, end: t };
  });
  const [viewMode, setViewMode] = useState<ExtendedViewMode>("month");
  const [yearWeekHighlight, setYearWeekHighlight] = useState(false);
  const [yearMonthHighlight, setYearMonthHighlight] = useState(false);
  useEffect(() => {
    if (viewMode !== "year") {
      setYearWeekHighlight(false);
      setYearMonthHighlight(false);
    }
  }, [viewMode]);

  // Default: every category visible. Categories load lazily; new keys are
  // added to the visible set as soon as we encounter them in the grid filter.
  const [visibleCategories, setVisibleCategories] = useState<Set<CategoryKey>>(() => {
    const all = new Set<CategoryKey>();
    INDIVIDUAL_SIDENAV_CATEGORIES.forEach((c) => all.add(c.key));
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
  const teamId: string | null = activeEntityId;
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
        .select("color,hidden,default_key")
        .eq("kind", "calendar");
      if (teamId) q = q.eq("app_team_id", teamId);
      else q = q.is("app_team_id", null).is("team_id", null).eq("user_id", user.id);
      return q;
    };
    void baseQuery().then(({ data }) => apply((data ?? []) as never));
    const filter = teamId ? `app_team_id=eq.${teamId}` : `user_id=eq.${user.id}`;
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
    `${calendarScale === "macro" ? "projects" : "calendar"}:panel:open:${panelScopeKey}`,
    true,
  );

  /* ----- session search wiring ----- */
  const search = useCalendarSearch();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Wire click-on-result → navigate the grid to that date + remember selection.
  const setOnPickResult = search.setOnPickResult;
  useEffect(() => {
    setOnPickResult((r: SearchResult) => {
      const d = new Date(r.startISO);
      if (Number.isNaN(d.getTime())) return;
      setCurrentDate(d);
      setCurrentRange({ start: d, end: d });
    });
  }, [setOnPickResult]);

  // Jump to the upcoming match once per search query. Ignore result
  // republishes (session-panel autosave) so clearing search cannot yank
  // the grid back to that anchor.
  const searchQuery = search.query;
  const searchAnchor = search.anchorResult;
  const lastSearchNavQueryRef = useRef("");
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      lastSearchNavQueryRef.current = "";
      return;
    }
    if (!searchAnchor) return;
    if (lastSearchNavQueryRef.current === q) return;
    lastSearchNavQueryRef.current = q;
    const d = new Date(searchAnchor.startISO);
    if (Number.isNaN(d.getTime())) return;
    setCurrentDate(d);
    setCurrentRange({ start: d, end: d });
  }, [searchQuery, searchAnchor]);



  // Apply data-search-* attributes to every session tile in the DOM so CSS
  // can grey out non-matches. Re-applies on every relevant change AND on DOM
  // mutations (tiles re-render when the user scrolls weeks / switches view).
  const searchActive = search.active && search.query.trim().length > 0;
  const matchIds = search.matchIds;
  const selectedId = search.selectedId;
  const setSelectedId = search.setSelectedId;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = () => {
      const tiles = root.querySelectorAll<HTMLElement>("[data-event-id]");
      tiles.forEach((el) => {
        const id = el.getAttribute("data-event-id");
        if (!id) return;
        if (searchActive && matchIds.has(id)) {
          el.setAttribute("data-search-match", "1");
        } else {
          el.removeAttribute("data-search-match");
        }
        if (selectedId && id === selectedId) {
          el.setAttribute("data-search-highlight", "1");
        } else {
          el.removeAttribute("data-search-highlight");
        }
        el.removeAttribute("data-search-selected");
      });
    };
    apply();
    const mo = new MutationObserver(() => apply());
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [searchActive, matchIds, selectedId]);

  // Clear the search click-fill when clicking outside that session
  // (main grid tile or matching left-panel row).
  useEffect(() => {
    if (!selectedId) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      const gridTile = t.closest("[data-event-id]");
      if (gridTile?.getAttribute("data-event-id") === selectedId) return;
      const sideTile = t.closest("[data-side-session-id]");
      if (sideTile?.getAttribute("data-side-session-id") === selectedId) return;
      setSelectedId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selectedId, setSelectedId]);

  /** Membership overlay provider — Bucket A: currently live, hidden this round. */
  return (
    <MembershipCalendarProvider enabled={seat === "individual" && authReady && !!user && isEntityFeatureEnabled("entityCalendarSharing")}>
    <EntityGroupVisibilityProvider
      enabled={seat === "admin" && authReady && !!user && !!teamId}
      teamId={teamId}
    >
    <div
      ref={rootRef}
      className={`h-full overflow-hidden bg-white ${searchActive ? "calendar-search-active" : ""}`}
    >
      <CalendarSearchToggle />
      <CalendarSearchInput />
      <LeftPanel open={panelOpen} onOpenChange={setPanelOpen}>
        <div className="h-full overflow-hidden pl-1.5 pr-0 pt-[48px]">
          <CalendarSideNav
            currentDate={currentDate}
            currentRange={currentRange}
            onCurrentDateChange={(d, r) => {
              setCurrentDate(d);
              setCurrentRange(r);
            }}
            viewMode={miniCalendarViewMode(viewMode, yearWeekHighlight, yearMonthHighlight)}
            visibleCategories={visibleCategories}
            onToggleCategory={toggleCategory}
            seat={seat}
            entities={seat === "individual" ? entities : []}
            teamId={teamId}
            teamName={entityName}
            calendarScale={calendarScale}
            panelOpen={panelOpen}
            railViewScope={panelScopeKey}
          />
        </div>
      </LeftPanel>

      <div className="relative h-full min-w-0 overflow-hidden">
        {authReady && calId ? (
          <CalendarViewActionsProvider calId={calId}>
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
              yearWeekHighlight={yearWeekHighlight}
              onYearWeekHighlightChange={setYearWeekHighlight}
              yearMonthHighlight={yearMonthHighlight}
              onYearMonthHighlightChange={setYearMonthHighlight}
              visibleCategories={visibleCategories}
              teamId={teamId}
              panelOpen={panelOpen}
              calendarScale={calendarScale}
            />
          </CalendarViewActionsProvider>
        ) : (
          <div className="h-full bg-white" aria-hidden="true" />
        )}
      </div>
    </div>
    </EntityGroupVisibilityProvider>
    </MembershipCalendarProvider>
  );
}


