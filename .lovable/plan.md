# Zoomable Year ↔ Month View Transition

## Goal

Add a Month View that opens by **double-clicking a month column header** in the Year Grid. The transition is a shared-element zoom: the narrow column expands to full width, day rows grow to reveal session details, and prev/next months sit desaturated on the edges as a horizontal carousel.

## UX flow

1. User double-clicks "Jun" header (or presses `Z` on a selected cell) → Year Grid morphs into Month View focused on June.
2. Month View shows a vertical list of days: `dato` · `weekday` · `1. økt` text · `Duration` (matches the screenshot reference).
3. Faded previews of May (left) and Jul (right) are visible at the edges; clicking either pans horizontally to that month.
4. Currently selected cell remains highlighted across the morph.
5. Pressing `Esc`, double-clicking the month header again, or clicking the "back to year" affordance morphs back to the Year Grid.
6. Arrow keys still navigate. Moving past the last day of June with `↓` or past the right edge with `→` triggers a smooth horizontal slide to July.

## Files

**New**
- `src/components/calendar/MonthView.tsx` — single-month vertical list with sticky header, two sessions per day, selection + edit reuse.
- `src/components/calendar/MonthCarousel.tsx` — horizontal carousel of MonthView panes (prev / current / next), framer-motion driven panning.
- `src/components/calendar/ZoomableCalendar.tsx` — orchestrator that owns view mode (`"year" | "month"`), focused month, and runs the shared-element morph using framer-motion `layoutId`.

**Edited**
- `src/components/calendar/YearGrid.tsx` — add `onMonthHeaderDoubleClick(month)` prop; tag each `<th>` and each cell with `layoutId={\`cell-${calId}-${y}-${m}-${d}-${s}\`}` so framer-motion can morph them. Extend keyboard handler so `↓` past day 31 and `→` past month 11 emit an `onCrossMonth` callback.
- `src/components/calendar/YearCalendarView.tsx` — replace direct `<YearGrid>` mount with `<ZoomableCalendar>`; keep title/undo/redo/settings header untouched.

**Dependencies**
- Already installed: `framer-motion` (verify in `package.json`; `bun add framer-motion` if missing).

## Technical details

### Shared-element morph
- Wrap both Year cells and Month rows in `motion.div` with the same `layoutId`. framer-motion's `LayoutGroup` interpolates width/height/position automatically.
- Use `transition={{ type: "spring", stiffness: 300, damping: 30 }}` per spec.
- Apply `style={{ willChange: "transform" }}` on morphing nodes.
- Selected cell uses a separate `motion.div layoutId="selection-ring"` so the ring smoothly travels into the new layout.

### View state
```ts
type ViewMode = { kind: "year" } | { kind: "month"; month: number };
```
Lifted into `ZoomableCalendar`. Selection (`CellKey | null`) lives here too so it survives the mode switch.

### Month View layout
Vertical CSS grid: `grid-template-columns: 64px 64px 1fr 96px` (date, weekday, session text, duration). Two rows per day (one per session) matching `Session = 0 | 1`. Sticky `<header>` with month + year, expands from column width to full container via shared `layoutId={\`month-header-${m}\`}`.

### Carousel
`MonthCarousel` renders three `MonthView` panes side-by-side inside an `overflow-hidden` container; an outer `motion.div` translates by `-100% * focusedIndex`. Prev/next panes get `filter: grayscale(1) opacity(0.4)` and `pointer-events-none` until they become focused. Click on a faded pane animates focus to it.

### Keyboard
Reuse existing `moveSelection` logic. New cross-month behavior:
- `↓` on last day's lower session → advance to next month, day 1, session 0, and trigger carousel pan.
- `↑` on day 1 upper session → previous month, last day, session 1.
- `→` already crosses months horizontally; in Month View it triggers the carousel pan instead of column hop.
- `Esc` exits Month View back to Year View.
- `Enter` in Month View: same as Year — moves selection down (commits edit if editing).

### Performance
- Only three MonthView panes mounted at once (prev/current/next); others unmounted.
- `LayoutGroup` scoped to the morphing region only, so unrelated nodes don't recompute.
- Avoid layout thrash: container has fixed `min-h-[60vh]`, panes are absolutely sized within the carousel track.

## Out of scope
- Persisting view mode across reloads.
- Touch/swipe gestures on the carousel (keyboard + click only for this pass).
- Restructuring `yearStore` — Month View reads/writes the same `data` map keyed by `CellKey`.

