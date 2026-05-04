## Problem

The Month and Week views in the calendar share the same key namespace but use it to mean two completely different things:

- **Month view** writes `{year: Y, month: 0–11, day: 1–31, session: 0}` — one cell per real calendar day, multiple items packed as newline‑separated text.
- **Week view** writes `{year: Y, month: weekdayColIdx 0–6, day: halfHourSlotRank 1–19, session: 0|1}` — `month` is hijacked as the column index of the visible week and `day` as a 30‑minute slot rank starting at 06:00.

This is why:
- Events in week view never appear in month view (and vice versa).
- The same week-view event "moves" when you change weeks (the column index always rewrites to the same `month` slot).
- Multi-cell drag selections get attached to one column only, and timezone/date math is impossible because there is no actual datetime stored.

## Goal

Both views read and write a single source of truth keyed by **real datetime**, just like Outlook/Google. UI/visual design is preserved exactly — only data model, event handlers, and date math change.

## New data model

Add a parallel **events store** alongside the legacy cell store (kept for backwards-compat for existing saved cells in localStorage). One typed event per session:

```ts
interface CalendarEvent {
  id: string;             // stable uuid
  startISO: string;       // "2026-05-04T09:30:00" (local, no Z)
  endISO: string;         // "2026-05-04T10:30:00"
  allDay: boolean;        // month-view items default to true
  title: string;
  color: string | null;   // hex
  category?: "training" | "school" | "work" | "else";
  description?: string;
}
```

Persisted under `calendar:events:{calId}` in localStorage with the same shape & API as `useYearStore`. New hook: `useEventStore(calId)` exposing `events`, `upsertEvent`, `deleteEvent`, `moveEvent`, `undo`, `redo`.

Both views derive their visible items from `events` filtered by date range:

```text
Month view  → events where startISO date ∈ [monthStart, monthEnd]
Week view   → events where startISO date ∈ [weekStart, weekEnd]
```

## Week view changes (`UnifiedElasticGrid.tsx`)

1. Compute the visible week from `currentDate` (already done with `weekDates`).
2. When the user mark-drags a vertical range in column `c` from slot `loRank` to `hiRank`:
   - `date = weekDates[c]` (real `Date`)
   - `start = setHM(date, 6 + Math.floor(loRank/2), (loRank%2)*30)`
   - `end   = setHM(date, 6 + Math.floor((hiRank+1)/2), ((hiRank+1)%2)*30)`
   - Open the popover; on commit call `upsertEvent({ startISO, endISO, allDay: false, title, color })`.
3. Existing event rendering: instead of reading per-cell text, project each `event` into the column for `event.startISO`'s date, positioned absolutely between its start and end pixel offsets. Re-uses the existing color/contrast/icon visuals.
4. Drag-and-drop a session block:
   - Vertical drag → `moveEvent(id, { startISO, endISO })` shifting time only.
   - Horizontal drag → shifts date only (column → `weekDates[newCol]`).
5. Delete the legacy `markRange → onCommitTexts` path that writes into hijacked `{month,day,session}` keys.

## Month view changes (`MonthGridType1.tsx`)

1. Read items per day cell from `events.filter(e => sameDay(e.startISO, d.date))` instead of parsing `data[id].text` lines.
2. Add an item via popover → `upsertEvent({ startISO: d.date@09:00, endISO: +1h, allDay: true, title, color, category })`. (Default 1 h duration so it shows correctly when switched to week view.)
3. Drag-an-item between days → `moveEvent(id, { startISO: newDate@sameTime })` keeping time-of-day intact.
4. Keep the legacy text-cell read path as a fallback for any pre-existing data so users don't lose what they had.

## View synchronization

`YearCalendarView` already owns `currentDate`. Confirm:
- Switching from Month → Week keeps `currentDate` so the week containing it is shown.
- Switching from Week → Month focuses the month containing `currentDate`.
- All write paths funnel through `useEventStore`, so React state updates re-render both views (the inactive one re-renders on next switch with no extra plumbing).

## Date utilities

Add `src/components/calendar/dateUtils.ts`:
```ts
export const sameDay  = (a: Date, b: Date) => /* y/m/d compare */;
export const startOfDay = (d: Date) => /* 00:00 local */;
export const setHM    = (d: Date, h: number, m: number) => /* new Date */;
export const toISOLocal = (d: Date) => /* "YYYY-MM-DDTHH:mm:00" */;
export const fromISOLocal = (s: string) => /* parse w/o TZ shift */;
```

All datetime conversions go through these helpers — no `toISOString()` (which forces UTC and shifts the date across timezones).

## Files touched

- `src/components/calendar/yearStore.ts` — add `useEventStore`, `CalendarEvent` type, persistence + undo/redo (mirrors `useYearStore` pattern). Keep `useYearStore` intact.
- `src/components/calendar/dateUtils.ts` — **new**, helpers above.
- `src/components/calendar/YearCalendarView.tsx` — wire `useEventStore`, pass `events`, `upsertEvent`, `moveEvent`, `deleteEvent` down. Keep undo/redo working across both stores.
- `src/components/calendar/UnifiedElasticGrid.tsx` — replace per-cell text writes in week mode with event creation; render events as absolutely-positioned blocks within day columns; drag-and-drop translates pixel offsets back to datetimes.
- `src/components/calendar/MonthGridType1.tsx` — read items from `events` for the rendered month; popover commit + drag-between-days call `upsertEvent` / `moveEvent`. Keep the visual cell layout, fonts, and animations untouched.

## Out of scope (kept exactly as-is)

- Tailwind classes, layout, colors, icons, popover styling.
- The `MonthNavControl`, `MiniCalendar`, header dropdown, undo/redo shortcuts.
- The "Else" 8-color palette, category fixed colors, dynamic contrast.
- The "now" line and today highlighting.
