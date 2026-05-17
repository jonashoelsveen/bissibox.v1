## Done so far
1. Added `useDiarySimpleView()` hook in `src/lib/session-tile-design.ts` (localStorage-backed, default off).
2. Added a **Simple view** switch in Settings → Diary → "Session tile design Week", below the three tile-design cards. Shows "On"/"Off" beside the toggle and an explanation underneath.

## Still to build — Simple view week grid

The current week view in `UnifiedElasticGrid.tsx` renders an hourly grid (06:00–24:30, 38 rows × 7 day-columns) with absolutely-positioned session tiles laid out by time of day. Simple view needs a structurally different body.

### Approach
Add an `isSimple` branch inside the existing week-view JSX (rather than a separate top-level component) so all popover/edit/delete/upsert state is reused.

When `appKind === "diary" && viewMode === "week" && simpleView === true`:

- **Header row**: unchanged (same week-number gutter + 7 day headers, same `DayNoteButton`, same "today" highlight).
- **Body**:
  - Replace the 19 × (left-hour-label + 7 columns) row grid with a single body row.
  - Left week-number gutter cell renders empty (no time labels), same vertical column border as today.
  - Each of the 7 day columns becomes one tall flex container (vertical stack) with internal padding. No horizontal divider lines, only the vertical column borders that already exist.
  - On hover, the entire column body gets the same gray tone used today when marking cells (no plus icon).
  - On double-click anywhere in a column body (outside a tile), call `openPopover` with a synthetic `CellKey` for that day and a default time slot (e.g. 09:00–10:00). The existing popover handles new-session creation.
- **Session tiles**:
  - Replace `WeekEventsOverlay` with an inline stack: for each day, render its events sorted by start time as fixed-height tiles (same height as the tile previews in settings) with small vertical gaps.
  - Reuse the existing tile-content renderer (split / stacked / icon) — extract the per-tile JSX from `WeekEventsOverlay` into a small `DiarySessionTileBody` helper so both code paths share rendering.
  - Hover a tile → same `SessionHoverMenu` as today.
  - Click a tile → opens edit popover (same path as `onEventClick`).
  - Drag-to-reorder/reschedule is **out of scope** for v1 of simple view — tiles are static stacks, no time-based dragging.

### Files to touch
- `src/components/calendar/UnifiedElasticGrid.tsx`
  - Read `useDiarySimpleView()` once.
  - Branch the week-view body (lines ~903–969) on `isSimple`.
  - Skip `<WeekEventsOverlay/>` when simple is on; render a new inline `<DiarySimpleWeekBody/>` instead.
  - Extract `DiarySessionTileBody` from existing overlay tile rendering.

### Out of scope
- Day view, month view, calendar (non-diary) seat — unchanged.
- Strava ghost imports in simple view render the same as normal events.
- No animation between normal ↔ simple toggle.

Confirm and I'll build it.
