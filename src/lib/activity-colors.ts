/**
 * Activity-specific colors for diary training sessions.
 *
 * Each activity gets its own color so sessions are visually distinguishable
 * at a glance across the diary, calendar tiles and Strava imports.
 *
 * Color rules driven by Strava sport_type + session name:
 *  - Run + name contains "Track"/"Bane"          → #FF755E (track)
 *  - WeightTraining default / "Max"/"Maks"        → #3D3D3D (strength dark)
 *  - WeightTraining + "Core"/"Basis"              → #ADADAD (strength light)
 *  - Running / Cycling / Swimming                 → branded pastels
 *  - Anything else                                → #D1D1E0 ("Else")
 */

export const ACTIVITY_COLORS = {
  running: "#B8B8FF", // Periwinkle
  swimming: "#B8FFFF",
  cycling: "#B8FFB8",
  track: "#FF755E",
  strength: "#3D3D3D",
  strengthCore: "#ADADAD",
  else: "#D1D1E0",
} as const;

export type ActivityKind = keyof typeof ACTIVITY_COLORS;

/** Resolve a color for a diary sub-group / activity id (e.g. "running"). */
export function colorForActivity(activity?: string | null): string {
  const a = (activity || "").toLowerCase();
  // Curated 6 primary-color palette used in the Activities tab + dropdowns.
  if (a === "running") return "#ef4444";
  if (a === "cycling" || a === "cycle" || a === "bike" || a === "ride") return "#f97316";
  if (a === "swimming" || a === "swim") return "#eab308";
  if (a === "core" || a === "basis") return "#22c55e";
  if (a === "max" || a === "lifting" || a === "strength" || a === "weighttraining" || a === "weight_training") return "#3b82f6";
  if (a === "stretch" || a === "stretching") return "#8b5cf6";
  if (a === "track") return ACTIVITY_COLORS.track;
  return ACTIVITY_COLORS.else;
}

/** Map a Strava sport_type string to one of our activity kinds. */
export function activityFromStravaSport(sport: string | null | undefined): ActivityKind {
  const s = (sport || "").toLowerCase();
  if (s.includes("run")) return "running";
  if (s.includes("swim")) return "swimming";
  if (s.includes("ride") || s.includes("cycl") || s.includes("bike")) return "cycling";
  if (s.includes("weight") || s.includes("strength")) return "strength";
  return "else";
}

/**
 * Resolve the tile color for a Strava session given its sport type + name.
 * Implements the keyword-based overrides described at the top of this file.
 */
export function colorForStravaSession(
  sportType: string | null | undefined,
  name: string | null | undefined,
): string {
  const sport = (sportType || "").toLowerCase();
  const title = (name || "").toLowerCase();

  // Running on a track (English "track" / Norwegian "bane").
  if (sport.includes("run")) {
    if (/\b(track|bane)\b/i.test(title)) return ACTIVITY_COLORS.track;
    return ACTIVITY_COLORS.running;
  }

  // Weight / strength training keywords.
  if (sport.includes("weight") || sport.includes("strength")) {
    if (/\b(core|basis)\b/i.test(title)) return ACTIVITY_COLORS.strengthCore;
    // Default + explicit "Max"/"Maks" both use the dark strength color.
    return ACTIVITY_COLORS.strength;
  }

  if (sport.includes("swim")) return ACTIVITY_COLORS.swimming;
  if (sport.includes("ride") || sport.includes("cycl") || sport.includes("bike")) {
    return ACTIVITY_COLORS.cycling;
  }

  return ACTIVITY_COLORS.else;
}
