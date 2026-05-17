## Goal

In the **diary month view** and the **diary week "simple view"**:
1. Newly created sessions always render **last** in their day, regardless of time-of-day.
2. Users can **drag a session vertically inside its day** to reorder. Animation is vertical-only, smooth, mirroring the library-sidebar folder drag.
3. On release, a **centered confirmation modal** asks the user to confirm or cancel the new order.

Normal week view (hourly grid) is unchanged — sessions there are still positioned by time of day.

---

## Data model

Add an optional `sortIndex?: number` to `CalendarEvent` in `src/components/calendar/yearStore.ts`.

- `useEventStore.upsertEvent`: when creating a brand-new event (no existing match) and the caller did not supply `sortIndex`, set it to `Date.now()`. This guarantees freshly added sessions sort after older ones.
- New helper `reorderEvents(ids: string[])` on the store: takes an ordered list of event IDs for one column and writes monotonically increasing `sortIndex` values to each, then `persist()`s. Used after drag confirm.

Sort rule used by month + simple views:
```
key(ev) = ev.sortIndex ?? Date.parse(ev.startISO)
```
sorted ascending. Older sessions keep their time-based order; new ones land at the bottom.

---

## Drag-and-drop (shared)

Reuse the same `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` setup as `src/components/library/LibrarySideNav.tsx`:
- `PointerSensor` with `activationConstraint: { distance: 4 }`
- `modifiers={[restrictToVerticalAxis, restrictToParentElement]}`
- `verticalListSortingStrategy`
- `DragOverlay` for the lifted clone, original hidden (`opacity: 0`) while dragging
- Ghost / strava-preview events (`id.startsWith("__ghost__:")`) are **not** sortable.

New shared component `src/components/calendar/ReorderConfirmDialog.tsx` — centered `AlertDialog` with title "Confirm reorder", body "Apply the new order to this day?", buttons **Cancel** / **Confirm**.

Drag-end flow in both views:
1. Compute the proposed ordered ID list for that column.
2. If no change, do nothing.
3. Otherwise open `ReorderConfirmDialog` with the pending order in local state.
4. On **Confirm** → call `reorderEvents(pendingIds)`.
5. On **Cancel** → discard, original order persists.

---

## Files touched

### `src/components/calendar/yearStore.ts`
- Add `sortIndex?: number` to `CalendarEvent`.
- In `upsertEvent`, default `sortIndex = Date.now()` for brand-new events.
- Add `reorderEvents(ids: string[])` and export it from `useEventStore`.

### `src/components/calendar/YearCalendarView.tsx`
- Pass the new `reorderEvents` down to `UnifiedElasticGrid` and `MonthGridType1` (whichever consumes it).

### `src/components/calendar/UnifiedElasticGrid.tsx` — `DiarySimpleStack`
- Refactor the per-column rendering from absolute-positioned tiles into a **flow container** anchored at each measured column box, with `SortableContext` per column.
- Each tile becomes a `useSortable` item (vertical-only translate, fixed `TILE_H`).
- One top-level `DndContext` per column (or one shared context keyed by column id; per-column keeps logic simple).
- Sort by `sortIndex ?? startISO`.
- On `onDragEnd`, if order changed → set pending order, open `ReorderConfirmDialog`.
- Hover menu, click-to-edit, double-click-to-create unchanged.

### `src/components/calendar/MonthGridType1.tsx`
- Replace the existing HTML5 `draggable` per-item logic **for in-cell reorder only**. Cross-day drag (moving a session to a different date) keeps the current HTML5 path — only same-cell reordering becomes a dnd-kit sortable interaction.
- Wrap the visible event tiles in each day cell with a `SortableContext` scoped to that cell. Legacy text items and ghost events stay non-sortable and render before/after the sortable block (legacy items render after events as today).
- Sort `dayEvents` by `sortIndex ?? startISO`.
- On `onDragEnd` in-cell with changed order → open `ReorderConfirmDialog`, then call `reorderEvents`.

### New `src/components/calendar/ReorderConfirmDialog.tsx`
- Tiny wrapper around `AlertDialog` with cancel + confirm actions.

---

## Out of scope
- Cross-day drag in simple view (only vertical reorder inside one day column).
- Reorder in normal week hourly view (positions are time-based).
- Touch/keyboard sensors beyond what dnd-kit's defaults provide.
- Persisting `sortIndex` to a remote backend — still localStorage like the rest of the store.

Confirm and I'll build it.
