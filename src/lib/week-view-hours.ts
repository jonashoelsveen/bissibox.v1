/**
 * Week-view day timeframe preference.
 *
 * Persisted per-user via library-settings (localStorage). `startHour`
 * is the default week/day viewport (that hour is pinned at the top on
 * enter). Timed week/day grids always include 00:00 above it so the
 * user can scroll up to midnight. `endHour` still caps the bottom.
 *
 * Constraints:
 *   - startHour: 0..12 (00:00 – 12:00)
 *   - endHour:   13..24 (13:00 – 24:00)
 *
 * Stored globally for the signed-in user so the calendar and diary
 * week views stay in sync.
 */

import { useLibrarySetting } from "./library-settings";

export interface WeekViewHours {
  startHour: number;
  endHour: number;
}

const DEFAULT_HOURS: WeekViewHours = { startHour: 6, endHour: 24 };

export type WeekViewApp = "calendar" | "diary";

const keyFor = (app: WeekViewApp) => `${app}:week-view-hours:global`;

export function clampWeekViewHours(h: Partial<WeekViewHours>): WeekViewHours {
  let s = Math.round(h.startHour ?? DEFAULT_HOURS.startHour);
  let e = Math.round(h.endHour ?? DEFAULT_HOURS.endHour);
  if (!Number.isFinite(s)) s = DEFAULT_HOURS.startHour;
  if (!Number.isFinite(e)) e = DEFAULT_HOURS.endHour;
  s = Math.max(0, Math.min(12, s));
  e = Math.max(13, Math.min(24, e));
  if (e <= s) e = Math.max(s + 1, 13);
  return { startHour: s, endHour: e };
}

export function useWeekViewHours(
  app: WeekViewApp = "diary",
): [WeekViewHours, (v: WeekViewHours) => void] {
  const [val, set] = useLibrarySetting<WeekViewHours>(keyFor(app), DEFAULT_HOURS);
  const safe = clampWeekViewHours(val ?? DEFAULT_HOURS);
  return [safe, (v: WeekViewHours) => set(clampWeekViewHours(v))];
}
