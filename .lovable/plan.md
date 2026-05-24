## Week-view snap-in: where the smoothness comes from

In `UnifiedElasticGrid.tsx` (week-view "SimpleColumn"):

- Wraps each day's session tiles in `<DndContext>` + `<SortableContext strategy={verticalListSortingStrategy}>`.
- Each tile uses `useSortable({ id })`, which provides `transform` + `transition` — that is the smooth slide as neighbors swap during a drag.
- On drop, a `<DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>` smoothly tweens the floating clone from cursor position to the final slot. This is the snap-in.
- "Logging" a new session renders a simple bordered placeholder tile inside the same flex list:
  ```tsx
  {creating && (
    <div className="pointer-events-none rounded-[3px] border-2 border-solid border-primary/60 bg-primary/10"
         style={{ height: SIMPLE_TILE_H }} />
  )}
  ```
  Because the list is flex and existing tiles have `useSortable` transitions, the new placeholder pushes neighbors smoothly. On commit, the real tile replaces the placeholder in-place — no visible jump.

## Goal

Apply both behaviors to month-view diary cells:
1. Same-day session reorder uses dnd-kit (no more custom pointer-drag + frozen-geometry math).
2. Snap-in on drop uses `DragOverlay.dropAnimation`.
3. New-session creation animation uses the same flex + sortable trick — placeholder inserted into the list, neighbors slide via dnd-kit transitions, real tile replaces placeholder on commit.

## Changes to `src/components/calendar/MonthGridType1.tsx`

### 1. Add a new internal component `DiaryMonthDayDnd`

Renders the diary event tiles of one day cell inside a `<DndContext>`/`<SortableContext>` (per cell, mirroring week-view's per-column setup).

```tsx
<DndContext sensors={...} collisionDetection={closestCenter}
  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
  onDragStart={...} onDragEnd={...} onDragCancel={...}>
  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
    <div className="flex flex-col" style={{ gap: 2 }}>
      {visibleEvents.map(ev => <SortableMonthTile ... />)}
      {creating && <CreatingPlaceholder />}
    </div>
  </SortableContext>
  <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
    {activeEv ? <DiaryMonthReorderTile ev={activeEv} ... dragging /> : null}
  </DragOverlay>
</DndContext>
```

- `onDragEnd` runs `arrayMove`, checks Strava sessions, then `setPendingOrder` + `scheduleModalOpen` (existing 300ms delay code stays so the confirm dialog appears after snap-in).
- The "Strava-blocked" check is moved out of the pointerup handler into this `onDragEnd`.

### 2. Per-day rendering branch

In the cell's item list (`renderVisible.map(...)`), for diary mode replace the manual `motion.div` event tiles + ghost-slot splicing with the new `DiaryMonthDayDnd` for the event portion. Legacy items and the "+N more" button stay where they are (legacy items always render below events; this matches current ordering).

The custom-drag "ghost" rendering (`renderGhost`, `hideSource`, ghost-slot insertion at `insertIndex`) is removed for diary — dnd-kit handles all of that.

### 3. Pointer-drag handler

Restrict the existing `useEffect` pointer-drag logic to `appKind !== "diary"` so cross-day calendar drag remains. Remove the diary-specific branches (frozen geometry, `diarySlotTop`, `landing`, etc.).

### 4. Creating placeholder

When `popover` is open in create mode (no `eventId`) for a diary cell, append a `<CreatingPlaceholder />` inside the dnd list. On commit/`Enter`, `onUpsertEvent` adds the real event → it re-renders in the sorted list. The flex + sortable transitions absorb the swap without a jump (same trick as week-view).

### 5. Cleanup

- Remove now-unused state: diary geometry fields on `dragStartRef`, `landing` field on `dragSession`, `landingTimerRef`.
- Keep `pendingOrder`, `stravaBlocked`, `modalReady`, `scheduleModalOpen` exactly as-is.

## Out of scope

- Calendar (non-diary) month cross-day drag — unchanged.
- Week-view — unchanged.
- DiaryPopoverEditor commit flow — unchanged (only the placeholder visual is new).
