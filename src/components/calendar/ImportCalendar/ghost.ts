// Helpers to synthesize CalendarEvents from preview overlay state so that
// existing month/week renderers can show "ghost" preview events alongside
// real ones without changing their props shape.

import type { CalendarEvent } from "../yearStore";
import type { ParsedEvent, DetectedCategory } from "./types";
import { fromISOLocal, normalizeImportedLocalISO, toISOLocal } from "../dateUtils";

export const GHOST_ID_PREFIX = "__ghost__:";

export function isGhostEvent(id: string): boolean {
  return id.startsWith(GHOST_ID_PREFIX);
}

/** Build CalendarEvents from parsed preview events for visible categories. */
export function buildGhostEvents(
  events: ParsedEvent[] | null,
  visibleCategoryIds: Set<string>,
  categoryColors: Record<string, string>,
  _categories: DetectedCategory[],
): CalendarEvent[] {
  if (!events || events.length === 0) return [];
  const out: CalendarEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (!visibleCategoryIds.has(ev.category)) continue;
    const startISO = normalizeImportedLocalISO(ev.start_time);
    if (!startISO) continue;
    const endISO = normalizeImportedLocalISO(ev.end_time ?? "")
      ?? toISOLocal(new Date(fromISOLocal(startISO).getTime() + 60 * 60 * 1000));
    out.push({
      id: `${GHOST_ID_PREFIX}${i}`,
      title: ev.title,
      startISO,
      endISO,
      allDay: false,
      color: categoryColors[ev.category] ?? "#22C55E",
      description: ev.description,
    });
  }
  return out;
}
