/**
 * User preference for how a logged session is rendered as a tile in the
 * Diary month view. Stored per-user via library-settings (localStorage).
 *
 *   "compact" — current low month tile, but with the activity icon used in
 *               the week view (option 1).
 *   "split"   — double-height tile, week "split" layout (icon + distance).
 *   "stacked" — double-height tile, week "stacked" layout (icon + name /
 *               duration / distance).
 */

import { useLibrarySetting } from "./library-settings";

export type MonthTileDesign = "compact" | "split" | "stacked";

export const MONTH_TILE_DESIGNS: {
  id: MonthTileDesign;
  label: string;
  description: string;
}[] = [
  { id: "compact", label: "Compact", description: "Low tile with the activity icon." },
  { id: "split", label: "Distance", description: "Double-height. Icon and distance side-by-side." },
  { id: "stacked", label: "Detailed", description: "Double-height. Icon plus name, duration and distance." },
];

const KEY = "diary:month-tile-design:global";

export function useMonthTileDesign(): [MonthTileDesign, (v: MonthTileDesign) => void] {
  return useLibrarySetting<MonthTileDesign>(KEY, "compact");
}
