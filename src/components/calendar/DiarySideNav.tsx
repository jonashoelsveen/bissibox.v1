/**
 * DiarySideNav — left rail for the Diary page.
 *
 * Mini calendar at the top, then two collapsible sections:
 *   - Activities         (user-defined tabs, drive the activity dropdown
 *                         used in the new/edit session panel).
 *   - Strava activities  (Strava sport types currently synced for the user;
 *                         no add button — list is driven by Strava sync).
 *
 * In group-leader (read-only) mode, the plus icons are hidden; the
 * sections can still be collapsed/expanded.
 */

import { MiniCalendar, type DateRange } from "./MiniCalendar";
import { DiaryActivitiesSection } from "./DiaryActivitiesSection";
import { DiaryStravaActivitiesSection } from "./DiaryStravaActivitiesSection";
import { MetricsSection } from "./MetricsSection";
import type { CategoryKey } from "./CalendarSideNav";

export interface DiarySideNavProps {
  currentDate: Date;
  currentRange: DateRange;
  onCurrentDateChange: (date: Date, range: DateRange) => void;
  viewMode?: "day" | "week" | "month";
  visibleCategories: Set<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
  /** Display name shown above the mini-calendar. Defaults to "Me". */
  displayName?: string;
  /** When false, hides plus icons and disables editing (leader view). */
  canEdit?: boolean;
  teamId?: string | null;
  ownerId?: string | null;
  stravaUserId?: string | null;
}

export function DiarySideNav({
  currentDate,
  currentRange,
  onCurrentDateChange,
  viewMode,
  canEdit = true,
  teamId = null,
  ownerId = null,
  stravaUserId = null,
}: DiarySideNavProps) {
  return (
    <nav className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <MiniCalendar
          selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
          onSelectRange={(r) => onCurrentDateChange(r.start, r)}
          viewMode={viewMode}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
        <DiaryActivitiesSection
          title="Activities"
          canEdit={canEdit}
          kind="diary_activity"
          teamId={teamId}
          ownerId={ownerId}
        />
        <DiaryStravaActivitiesSection
          title="Strava activities"
          canEdit={canEdit}
          targetUserId={stravaUserId}
        />
        <MetricsSection title="Metrics" canEdit={canEdit} />
      </div>
    </nav>
  );
}
