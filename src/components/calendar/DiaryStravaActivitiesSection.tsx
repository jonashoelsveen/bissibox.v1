/**
 * DiaryStravaActivitiesSection — collapsible left-rail section that lists
 * the Strava sport types currently synced for the logged-in user.
 *
 * Unlike DiaryActivitiesSection (which is backed by `calendar_categories`),
 * this list is derived dynamically from the rows returned by
 * `useStravaActivities` — one row per unique `sport_type`. There is no add,
 * rename, delete or reorder; rows just toggle visibility locally.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
import { useStravaActivities } from "./useStravaActivities";
import { colorForStravaSportType } from "@/lib/activity-colors";
import { useDiaryVisibility } from "./DiaryVisibilityContext";

function prettySportName(sport: string): string {
  // Strava sport_type values come in PascalCase (e.g. "TrailRun", "VirtualRide").
  // Split on capitals and lower-case the remainder words.
  const parts = sport.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/);
  return parts
    .map((w, i) => (i === 0 ? w : w.toLowerCase()))
    .join(" ");
}

export interface DiaryStravaActivitiesSectionProps {
  title?: string;
  /** When false, hide rows (read-only leader mode still shows the list). */
  canEdit?: boolean;
  targetUserId?: string | null;
}

export function DiaryStravaActivitiesSection({
  title = "Strava activities",
  targetUserId,
}: DiaryStravaActivitiesSectionProps) {
  const { rows } = useStravaActivities(targetUserId ?? undefined);
  const [open, setOpen] = useState(true);
  const { isSportTypeHidden, toggleSportType } = useDiaryVisibility();

  const sports = useMemo(() => {
    const countMap = new Map<string, number>();
    const colorMap = new Map<string, string>();
    Object.values(rows).forEach((r) => {
      const s = (r.sport_type || "").trim();
      if (!s) return;
      countMap.set(s, (countMap.get(s) ?? 0) + 1);
      if (!colorMap.has(s)) {
        colorMap.set(s, colorForStravaSportType(s));
      }
    });
    return Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sport, count]) => ({ sport, count, color: colorMap.get(sport)! }));
  }, [rows]);




  return (
    <div className="flex flex-col">
      <div className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm transition hover:bg-secondary/60">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{
          height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: open ? 0.18 : 0.12, ease: "easeOut", delay: open ? 0.04 : 0 },
        }}
        style={{ overflow: open ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="mt-0.5 flex flex-col gap-0.5">
          {sports.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground/70">
              No synced activities yet.
            </div>
          ) : (
            sports.map(({ sport, color }) => {
              const isHidden = isSportTypeHidden(sport);
              return (
                <div
                  key={sport}
                  onClick={() => toggleSportType(sport)}
                  className={`group flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-secondary/60 ${
                    isHidden ? "text-muted-foreground" : "text-ink"
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-hairline"
                    style={{ background: color, opacity: isHidden ? 0.35 : 1 }}
                  />
                  <span className="min-w-0 flex-1 truncate">{prettySportName(sport)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHidden(sport);
                    }}
                    aria-label={isHidden ? "Show" : "Hide"}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
                  >
                    {isHidden ? (
                      <EyeOff className="h-3 w-3 text-muted-foreground/70" />
                    ) : (
                      <Eye className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
