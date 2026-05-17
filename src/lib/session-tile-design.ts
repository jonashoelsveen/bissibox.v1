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
