/**
 * DiarySideNav — left rail for the Diary page.
 *
 * Mini calendar at the top, then two collapsible sections:
 *   - Activities         (user-defined tabs, drive the activity dropdown
 *                         used in the new/edit session panel).
 *   - Strava activities  (Strava sport types the user opts in to show).
 *
 * In group-leader (read-only) mode, the plus icons are hidden; the
 * sections can still be collapsed/expanded.
 */

import { useState } from "react";
import { MiniCalendar, type DateRange } from "./MiniCalendar";
import { DiaryActivitiesSection } from "./DiaryActivitiesSection";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
}

export function DiarySideNav({
  currentDate,
  currentRange,
  onCurrentDateChange,
  viewMode,
  canEdit = true,
}: DiarySideNavProps) {
  const [stravaPickerOpen, setStravaPickerOpen] = useState(false);

  return (
    <>
      <nav className="flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
        <div>
          <MiniCalendar
            selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
            onSelectRange={(r) => onCurrentDateChange(r.start, r)}
            viewMode={viewMode}
          />
        </div>

        <div className="flex flex-col gap-1 pb-4">
          <DiaryActivitiesSection title="Activities" canEdit={canEdit} kind="diary_activity" />
          <DiaryActivitiesSection
            title="Strava activities"
            canEdit={canEdit}
            kind="diary_strava"
            onAddClick={() => setStravaPickerOpen(true)}
          />
        </div>
      </nav>

      <Dialog open={stravaPickerOpen} onOpenChange={setStravaPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose Strava activities</DialogTitle>
            <DialogDescription>
              Pick which Strava activity types should appear in your diary left panel.
              Detailed picker coming soon.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center text-sm text-muted-foreground">
            Strava activity picker — to be implemented.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
