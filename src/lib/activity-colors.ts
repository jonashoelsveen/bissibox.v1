/**
 * Activity-specific colors for diary training sessions.
 *
 * Each endurance activity gets its own color so sessions are visually
 * distinguishable at a glance across the diary, calendar tiles and Strava
 * imports.
 */

export const ACTIVITY_COLORS = {
  running: "#B8B8FF", // Periwinkle
  swimming: "#5EFF5E",
  cycling: "#B8FFB8",
  else: "#D1D1E0",
} as const;

export type ActivityKind = keyof typeof ACTIVITY_COLORS;

/** Resolve a color for a diary sub-group / activity id (e.g. "running"). */
export function colorForActivity(activity?: string | null): string {
  const a = (activity || "").toLowerCase();
  if (a === "running") return ACTIVITY_COLORS.running;
  if (a === "swimming" || a === "swim") return ACTIVITY_COLORS.swimming;
  if (a === "cycling" || a === "cycle" || a === "bike" || a === "ride") return ACTIVITY_COLORS.cycling;
  return ACTIVITY_COLORS.else;
}

/** Map a Strava sport_type string to one of our activity kinds. */
export function activityFromStravaSport(sport: string | null | undefined): ActivityKind {
  const s = (sport || "").toLowerCase();
  if (s.includes("run")) return "running";
  if (s.includes("swim")) return "swimming";
  if (s.includes("ride") || s.includes("cycl") || s.includes("bike")) return "cycling";
  return "else";
}
