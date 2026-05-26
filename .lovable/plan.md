# Day-view rebuild

Replace the current placeholder day-view (which renders a month) with a real single-day timeline that reuses all week-view mechanics: 30-min rows, marking, edge-drag resize with 5-min snapping, double-click placeholder creation, and live integration with month/week-view sessions.

## Scope

- Calendar page (individual and admin/entity)
- Clients page → MemberWorkspace calendar (read-only for coaches, same rules as month/week today)
- Diary page: out of scope (not requested)

## Behavior

1. **View-mode dropdown** — "Dag / Uke / Måned" already exists; "Dag" will now render the new day-view.
2. **Week-view column header click** — Each weekday header (Mon, Tue, …) becomes a button with the same hover treatment as the week-number gutter in month-view (`hover:bg-secondary hover:text-ink`). Clicking sets the anchor date to that day and switches to `"day"` mode.
3. **Day-view column header click** — The single day header acts as a "zoom out" button (same hover style) that switches back to `"week"` view, mirroring how the week-number header zooms month→week today.
4. **Day-view layout**:
   - Single centered column whose width equals 3 × current week column width.
   - Left time gutter (same width and styling as week-view's hour gutter) showing the hour labels.
   - Empty space on either side uses the same `bg-card`/page background as week-view.
   - 30-min row lines, identical row height and visual styling to week-view.
5. **Interaction parity with week-view** (single column):
   - Click-drag marking, double-click single-cell marking, mouseup auto-creates a placeholder session tile.
   - Existing edge-drag resize logic (5-min snap) works unchanged.
   - Session tiles render using existing session components; data flows through the same `events` / `onUpsertEvent` / `onMoveEvent` pipeline so sessions are visible in month + week views.
6. **Navigation arrows** — `MonthNavControl` already accepts `unit={viewMode}`; verify/extend it so `unit="day"` moves ±1 day.
7. **Coaches on Clients page** — `viewerRole` already gates edits in week-view; the new day-view reads the same prop and applies identical gating.

## Implementation approach

The week-view code in `UnifiedElasticGrid.tsx` already implements every cell mechanic we need: the grid is a parametrized N-column layout (currently 7 for week / 1 for "year" pseudo-day-of-month). The cleanest path is to **make `viewMode === "day"` render the same week-view body with `months` reduced to a single entry for `currentDate`**, plus a centered wrapper.

### Files to change

- **`src/components/calendar/UnifiedElasticGrid.tsx`** (primary)
  - Introduce a `isDayView = viewMode === "day"` branch in the `weekDates` / `months` derivation so only the anchor day is rendered.
  - When `isDayView`, wrap the existing week scroller in a centered flex container (`mx-auto`) with width = `gutter + 3 × weekColWidth`; surrounding space stays `bg-card`.
  - Convert the weekday column header `<div>` into a `<button>` with hover styling matching the existing week-number button; `onClick` calls `onCurrentDateChange(colDate, …)` then `handleViewModeChange("day")` in week mode, or `handleViewModeChange("week")` in day mode.
  - Reuse all marking/drag/double-click handlers as-is — they key off `month.idx` which becomes `0` in day-view.
  - Remove the stale `mode: Mode = viewMode === "day" ? { kind: "month", month: 0 } : { kind: "year" }` line so day-view doesn't accidentally render a month grid; replace with `kind: "year"` always for week/day and keep `kind: "month"` only for month-view.

- **`src/components/calendar/MonthNavControl.tsx`** — confirm `unit="day"` shifts by ±1 day; add the case if missing.

- **`src/components/calendar/YearCalendarView.tsx`** — no change expected (it already forwards `viewMode` and date handlers).

- **Clients page / `MemberWorkspace`** — no change expected; it already renders the same `YearCalendarView` and passes `viewerRole`.

### Data flow (unchanged)

```text
Day-view marking ─▶ same handlers as week-view
                 ─▶ onUpsertEvent(event)
                 ─▶ events state (single source of truth)
                 ─▶ visible in Day / Week / Month views
```

### Out of scope

- Diary day-view (not requested)
- New schema or server changes (none needed)
- Visual redesign of session tiles (reused as-is)

## Verification

- Switch Calendar to "Dag" and confirm: single centered column, time gutter on left, 30-min lines, hover header, arrows move ±1 day.
- Drag-mark and double-click create a placeholder tile; the tile appears in Week view on the same day and in Month view on the same date.
- Drag tile edges resize in 5-min increments.
- Week-view weekday headers now have the same hover effect as the week-number gutter and navigate to Day-view on click.
- On Clients page, coach role cannot edit (no mark/drag), can only view.
