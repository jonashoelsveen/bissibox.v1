/**
 * User preference for how a logged session is rendered as a tile in the
 * Diary week view. Stored per-user via library-settings (localStorage).
 *
 *   1 — "split"     : icon (left half) + distance (right half), bold mono
 *   2 — "stacked"   : icon (left half) + name / duration / km stacked
 *   3 — "icon"      : icon-only
 */

import { useLibrarySetting } from "./library-settings";

export type SessionTileDesign = "split" | "stacked" | "icon";

export const SESSION_TILE_DESIGNS: {
  id: SessionTileDesign;
  label: string;
  description: string;
}[] = [
  { id: "split", label: "Distance", description: "Activity icon and distance side-by-side." },
  { id: "stacked", label: "Detailed", description: "Icon plus name, duration and distance." },
  { id: "icon", label: "Icon only", description: "Compact tile with just the activity icon." },
];

const KEY = "diary:session-tile-design:global";

export function useSessionTileDesign(): [SessionTileDesign, (v: SessionTileDesign) => void] {
  return useLibrarySetting<SessionTileDesign>(KEY, "split");
}

/**
 * Simple view: when on, the Diary week view ignores time-of-day and stacks
 * each day's sessions vertically with fixed tile heights.
 */
const SIMPLE_KEY = "diary:simple-view:global";

export function useDiarySimpleView(): [boolean, (v: boolean) => void] {
  return useLibrarySetting<boolean>(SIMPLE_KEY, false);
}

/**
 * How a *combined* session tile is rendered — i.e. two or more Strava
 * sessions synced with less than one hour between the previous one's stop
 * and the next one's start. The tile is split into N equal-width fields
 * (one per synced activity), and each field renders according to the
 * chosen style.
 *
 *   1 — "icon"     : each field shows the activity icon (matches the
 *                    "split" single-session style).
 *   2 — "metric"   : each field shows the distance (endurance: running,
 *                    cycling, swimming, xc-skiing) or duration (strength
 *                    / stretch). Distance unit follows the platform-wide
 *                    metric/imperial preference.
 *   3 — "details"  : each field stacks header, duration and (when
 *                    endurance) distance, matching the "stacked" style.
 */

export type CombinedSessionTileDesign = "icon" | "metric" | "details";

export const COMBINED_SESSION_TILE_DESIGNS: {
  id: CombinedSessionTileDesign;
  label: string;
  description: string;
}[] = [
  { id: "icon", label: "Icons", description: "Each synced activity shown as its icon, side-by-side." },
  { id: "metric", label: "Metric", description: "Distance (endurance) or duration (strength/stretch) per field." },
  { id: "details", label: "Details", description: "Header, duration and distance stacked per field." },
];

const COMBINED_KEY = "diary:combined-session-tile-design:global";

export function useCombinedSessionTileDesign(): [CombinedSessionTileDesign, (v: CombinedSessionTileDesign) => void] {
  return useLibrarySetting<CombinedSessionTileDesign>(COMBINED_KEY, "icon");
}
