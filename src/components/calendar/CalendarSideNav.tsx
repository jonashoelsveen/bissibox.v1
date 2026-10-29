/**
 * CalendarSideNav — left rail for the Calendar page.
 *
 * Micro:
 *   1. MiniCalendar at the top (drives `currentDate` / range), or the
 *      upcoming-sessions list when that rail view is selected.
 *   2. Entity mode: one tab per group (eye filters the main calendar).
 *      Individual mode: one tab per active membership (or empty).
 *
 * Macro:
 *   Projects list (gantt_project categories); mini-cal and group tabs hidden.
 *
 * When search is active, the rail is replaced by search results.
 */

import { useEffect, useRef } from "react";
import { MiniCalendar, type DateRange } from "./MiniCalendar";
import { miniMonthAnchorForSpan } from "@/lib/weekHorizontalScroll";
import { useLiveWeekSpan } from "@/lib/liveWeekSpan";
import { useLiveMonthFocus } from "@/lib/liveMonthFocus";
import {
  INDIVIDUAL_CATEGORIES,
} from "./MonthGridType1";
import { useCalendarSearchSafe } from "./CalendarSearchContext";
import { CalendarSearchResults } from "./CalendarSearch";
import { MembershipEntityTabs } from "./MembershipEntityTabs";
import { EntityGroupTabs } from "./EntityGroupTabs";
import { ProjectsSection } from "./ProjectsSection";
import type { CalendarScale } from "./CalendarSearch";
import { isEntityFeatureEnabled, isFeatureEnabled } from "@/lib/features";
import { useFeatureEnabled } from "@/lib/featureFlagSnapshot";
import { useAuth } from "@/lib/auth";
import { useLibrarySetting } from "@/lib/library-settings";
import {
  CalendarRailViewMenu,
  type CalendarLeftRailView,
} from "./CalendarRailViewMenu";
import { CalendarUpcomingSessions } from "./CalendarUpcomingSessions";
import { CalendarsSection } from "./CalendarsSection";

/* ---------- Category keys (still used by CalendarPage filtering) ---------- */

const CAT_MEETING = "#E63337";
const CAT_EVENT = "#F09B0A";
const CAT_RACE = "#26B270";

export const ADMIN_SIDENAV_CATEGORIES: { key: AdminCatKey; label: string; color: string }[] = [
  { key: "admin:meeting", label: "Møte", color: CAT_MEETING },
  { key: "admin:event", label: "Event", color: CAT_EVENT },
  { key: "admin:race", label: "Løp", color: CAT_RACE },
];

export const INDIVIDUAL_SIDENAV_CATEGORIES = INDIVIDUAL_CATEGORIES.map((c) => ({
  key: `ind:${c.value}` as IndCatKey,
  label: c.label,
  color: c.color,
  Icon: c.Icon,
}));

type IndCatKey = `ind:${"training" | "school" | "work" | "else"}`;
type AdminCatKey = `admin:${"meeting" | "event" | "race"}`;
type MeCatKey = `me:${string}`;
export type CategoryKey = IndCatKey | AdminCatKey | MeCatKey;

/** Map an event color to a stable category key (used for filtering). */
export function categoryKeyFromColor(color: string | null | undefined): CategoryKey {
  const c = (color ?? "").toLowerCase();
  if (c === CAT_MEETING.toLowerCase()) return "admin:meeting";
  if (c === CAT_EVENT.toLowerCase()) return "admin:event";
  if (c === CAT_RACE.toLowerCase()) return "admin:race";
  return `me:${c}` as MeCatKey;
}

export interface SideNavEntity {
  id: string;
  name: string;
}

export interface CalendarSideNavProps {
  /** Mini-calendar selection */
  currentDate: Date;
  currentRange: DateRange;
  onCurrentDateChange: (date: Date, range: DateRange) => void;
  /** Active view mode — drives whole-week highlighting in mini calendar. */
  viewMode?: "day" | "week" | "month" | "monthMark";
  /** Visible category keys (toggle set) — kept for CalendarPage API compat. */
  visibleCategories: Set<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
  /** Profile context */
  seat: "individual" | "admin";
  /** Optional entity list (individual seat) — unused after categories moved to settings. */
  entities?: SideNavEntity[];
  /** Active team id (admin seat only). */
  teamId?: string | null;
  /** Active team name (admin seat only). */
  teamName?: string;
  /** Display name shown above the mini-calendar. */
  displayName?: string;
  /** Micro keeps mini-cal; Macro shows Projects list. */
  calendarScale?: CalendarScale;
  /** When false the ⋯ control is hidden (panel closed). */
  panelOpen?: boolean;
  /** Scope for persisting mini vs upcoming (account / entity id). */
  railViewScope?: string;
  /** Active calendar id, so member team sessions keep their stripe. */
  calId?: string;
}

export function CalendarSideNav({
  currentDate,
  currentRange,
  onCurrentDateChange,
  viewMode,
  seat = "individual",
  teamId = null,
  calendarScale = "micro",
  panelOpen = true,
  railViewScope = "anon",
  calId,
}: CalendarSideNavProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const liveWeekSpan = useLiveWeekSpan();
  const liveMonth = useLiveMonthFocus();
  const miniRange =
    viewMode === "week"
      ? (liveWeekSpan ?? currentRange ?? { start: currentDate, end: currentDate })
      : { start: currentDate, end: currentDate };
  const miniSpanDays =
    miniRange.start.getFullYear() !== miniRange.end.getFullYear() ||
    miniRange.start.getMonth() !== miniRange.end.getMonth() ||
    miniRange.start.getDate() !== miniRange.end.getDate();
  const miniMonthAnchor =
    viewMode === "month" && liveMonth
      ? new Date(liveMonth.year, liveMonth.month, 1)
      : viewMode === "week" && miniSpanDays
        ? miniMonthAnchorForSpan(miniRange.start, miniRange.end)
        : undefined;
  const hideTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      el.setAttribute("data-scrolling", "1");
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        el.removeAttribute("data-scrolling");
      }, 800);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  const search = useCalendarSearchSafe();
  const searchActive = !!search?.active;
  const isMacro = calendarScale === "macro";
  const [railView, setRailView] = useLibrarySetting<CalendarLeftRailView>(
    `calendar:left-rail:view:${railViewScope}`,
    "mini",
  );
  const { user } = useAuth();
  const threeDotOn = isFeatureEnabled("calendarThreeDotFlag");
  const calendarTabsOn = useFeatureEnabled("calendarTabsFlag", user?.id);
  const showRailMenu = threeDotOn && panelOpen && !isMacro && !searchActive;
  const upcoming = threeDotOn && !isMacro && !searchActive && railView === "upcoming";

  return (
    <nav className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <CalendarRailViewMenu
        visible={showRailMenu}
        view={railView === "upcoming" ? "upcoming" : "mini"}
        onViewChange={setRailView}
      />
      {searchActive ? (
        <div
          ref={scrollRef}
          className="sidenav-scroll group/scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-6 pt-1"
          style={{
            maskImage:
              "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
          }}
        >
          <CalendarSearchResults calId={calId} />
        </div>
      ) : isMacro ? (
        <div
          ref={scrollRef}
          className="sidenav-scroll group/scroll flex min-h-0 flex-1 flex-col overflow-y-auto pb-6"
          style={{
            // Main sits below the 48px top tab bar; left rail content starts at pt-[48px].
            // YearCalendarView toolbar is h-12 (48px). Spacer so Projects
            // header aligns with the Gantt month header, and the first
            // project tab with the first track row:
            //   (40 + 48) - 48 = 40.
            paddingTop: 40,
            maskImage:
              "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0, black calc(100% - 28px), transparent 100%)",
          }}
        >
          <ProjectsSection teamId={teamId} year={currentDate.getFullYear()} />
        </div>
      ) : upcoming ? (
        <CalendarUpcomingSessions />
      ) : (
        <>
          <div className="shrink-0 pr-1.5">
            <MiniCalendar
              selectedRange={miniRange}
              viewAnchor={miniMonthAnchor}
              onSelectRange={(r) => onCurrentDateChange(r.start, r)}
              viewMode={viewMode}
            />
          </div>

          {calendarTabsOn ? <CalendarsSection seat={seat} teamId={teamId} /> : null}

          {/** Calendar left-rail entity/membership tabs — Bucket A: currently live, hidden this round. */}
          {isEntityFeatureEnabled("entityCalendarSharing") ? (
            seat === "admin" ? (
              <EntityGroupTabs teamId={teamId} />
            ) : (
              <MembershipEntityTabs />
            )
          ) : null}
        </>
      )}
    </nav>
  );
}
