## Goal

Make month ↔ week navigation feel like a single continuous sheet that zooms in/out, and unify the headers between the two views.

---

## 1. Week view — mark today's column

In the Week view header row (weekday name + date), highlight today's column header with a dark-grey background (`bg-secondary` / `text-ink`) so the user always sees "today". Other columns stay in the current muted style.

## 2. Month view — add a week-number column

Add a thin (28px) leftmost column to the month grid that shows the ISO week number for each row (week). Styling: hairline right border, muted-foreground text, hover affordance, cursor-pointer.

- Layout change: `gridTemplateColumns: "28px repeat(7, minmax(0,1fr))"`.
- Weekday header strip gets a matching 28px empty leading cell so columns align.

## 3. Week view — add a week-number column (mirror)

Same 28px leftmost column in Week view showing the current week number, click → zoom back out to month. Same visual treatment for symmetry.

## 4. Unify the column headers

- Remove the "Måned År" header bar from MonthGridType1 (lines 423-430 in MonthGridType1.tsx).
- Make the weekday header strip identical in both views: weekday name only, **no date** behind it (Week view currently shows date — strip it down to just "Man / Tir / …" matching the Month view).
- Today's column header gets the dark-grey treatment in both views (#1 applies symmetrically).
- Keep the existing top control cluster (mode dropdown, mini-cal, undo/redo) untouched — only the in-grid header strip is unified.

## 5. Match cell column widths exactly

Currently Week view uses `repeat(7, minmax(220px, 1fr))` and Month view uses `repeat(7, minmax(0, 1fr))`. To get a precise zoom animation, both must compute the same px width per day column at the same container width.

Change both to `repeat(7, minmax(0, 1fr))` with the same horizontal padding/scrollbar accounting. The 28px week-number column is added identically in both, so the 7 day columns end up the same px wide.

## 6. Click week-number → animated zoom into Week view

The big one. The animation must give the impression that the clicked week-row "expands in height" while everything else collapses, with sessions remaining visible the whole time.

### Approach: FLIP between two real layouts on the same DOM tree

Both views are rendered by the same `UnifiedElasticGrid`-level wrapper. We do NOT cross-fade two separate trees. Instead:

1. **Shared container** owns both layouts. State `view: "month" | "week"` and `focusWeekIndex: number`.
2. On click of week-number cell:
   - Measure (`getBoundingClientRect`) every day-cell's current rect → "FIRST".
   - Switch state to `"week"` with `focusWeekIndex = clickedRow`.
   - After React commits new layout, measure again → "LAST".
   - For the focused week's cells: apply `transform: translate(dx, dy) scale(sx, sy)` to invert, then animate to identity over 320ms with `cubic-bezier(0.2,0,0,1)`.
   - For non-focused weeks: animate them collapsing (opacity → 0, height → 0) over the same duration so the focused row visibly "stretches" into the full viewport.
3. **Sessions remain visible**: session pills render with `layoutId={event.id}` inside `framer-motion`'s `LayoutGroup`. They translate/scale into their new positions automatically. The text and color are the same node — it just moves and grows.
4. Reverse animation on click of week-number in Week view: the focused row collapses back into one row, the other weeks fade/expand back in.

### Why this works

- We're already using `LayoutGroup` in MonthGridType1.
- The "same sheet" illusion comes from `layoutId` on session items — Framer interpolates position + size automatically.
- The grid morphing comes from CSS `transition` on `grid-template-rows` (set the focused row to `1fr`, others to `0`) plus FLIP on the surviving row's contents.

### Animation choreography (320ms total)

```
0ms     User clicks week #N
0–40ms  FLIP measure phase (sync, invisible)
40–360ms
        - Focused row height: current → 100%
        - Other rows height:  current → 0, opacity 1 → 0
        - Day cells in focused row: scale up to week-cell size
        - Session pills: layout-animate to week positions (start times shown)
360ms   Settle into Week view; "view" dropdown reads "Uke"
```

## 7. View dropdown reflects the zoom

When the user click-zooms via the week-number column, the existing view-mode dropdown (`Måned` / `Uke` / `Dag`) updates to `Uke`. Conversely, manually choosing `Uke` from the dropdown still works (animates from current view).

---

## Files to edit

- `src/components/calendar/MonthGridType1.tsx`
  - Remove month/year header (lines 423-430).
  - Add week-number column + clickable cells.
  - Unify weekday strip styling with Week view.
  - Use `layoutId` on session items.
- `src/components/calendar/UnifiedElasticGrid.tsx`
  - Mark today's column header in Week view; remove date from header.
  - Add week-number column to Week view header + body.
  - Click handler on week-number → zoom out to month with reverse FLIP.
  - Match `gridTemplateColumns` exactly with Month view.
  - Orchestrate the FLIP animation when switching `viewMode` between `month` ↔ `week` via week-number click.
- `src/components/calendar/dateUtils.ts`
  - Add `isoWeekNumber(date: Date): number` helper.

## Out of scope (will not change)

- Day view, the editor popovers, drag-to-create, the duration picker (mini column), undo/redo, mini-calendar nav.
- Backend/persistence — this is purely presentation.

---

## Risks / known gotchas

- Framer `layoutId` requires unique IDs across the whole `LayoutGroup`. We'll use `event.id` directly.
- The week-number column adds 28px; both views must include it at the same time so per-day-column widths stay identical for a clean animation.
- ISO week calculation has edge cases at year boundaries — using the standard ISO 8601 algorithm.
- If the user clicks a week-number for a week with no in-month days (rare leading/trailing rows), we still zoom; the week shows the dates that are actually in that ISO week regardless of which calendar month is "active".