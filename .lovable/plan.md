## Goal

When the diary week-view hover menu is showing for a logged session and the user clicks the session to edit, do NOT open the separate `DiaryPopoverEditor` modal over it. Keep the hover menu mounted and extend it downward with the edit fields (duration, activity group, subgroup, save). Also restyle the in-modal note panel: no border-radius, no shadow, with the same thin left rail color used by the session.

## Scope

Only the diary week view (`UnifiedElasticGrid` → `WeekEventsOverlay` + `DiarySimpleStack`) and `SessionHoverMenu`. Creating a brand-new session (drag-mark on empty time) still uses `DiaryPopoverEditor` (no hover menu exists yet). The year/grid path (`MonthGridType1`) is untouched.

## Changes

### 1. `SessionHoverMenu.tsx`
- Add `editMode` boolean state. Expose `defaultEditMode` prop so the parent can open the menu directly in edit mode when the user clicks an existing session.
- While in edit mode, treat the menu as `sticky` (don't close on hover-out).
- Below the menu header (and below the note panel if open), render an "edit panel" portal aligned at `left, top + menuH (+ note panel height)`:
  - Clock + `DurationInput` row (extract `DurationInput` + `SideRailRow` from `DiaryPopoverEditor` into a small shared module, e.g. `DiaryEditFields.tsx`, so both files use the same code).
  - Group `<select>` (Endurance / Strength / Stretch).
  - Subgroup `<select>` when applicable.
  - Footer with "Lagre" button.
- Compute `accent` color via `colorForActivity(diarySub)` / `CAT_TRAINING_COLOR` same as the popover.
- Persist on Save / Enter via `onUpsert(patch)`, then exit edit mode (menu remains).
- The pencil icon still opens `SessionDetailsModal` (via existing `onOpenDetails`).

### 2. `UnifiedElasticGrid.tsx`
- In the diary week-view branches (`WeekEventsOverlay.onEventClick` and `DiarySimpleStack.onEventClick`): instead of `setPopover({...isEdit:true, eventId})`, set hover state to that event with a new `forceEdit` flag and clear any open popover. The `<SessionHoverMenu>` at the bottom receives `defaultEditMode={forceEdit}`.
- Keep the popover path for `markRange` (new session creation) only.

### 3. `DiaryEditFields.tsx` (new, small)
- Export `SideRailRow`, `DurationInput`, and a `<DiaryGroupSelects>` component so `SessionHoverMenu` and `DiaryPopoverEditor` share the exact same UI.

### 4. `NotePanel` styling when used inside the diary edit menu
- Add a `flush` prop to `NotePanel`. When `flush`, drop `shadow-lg`, `rounded-b-md`, and side borders so it visually merges with the menu container; keep the left rail in the passed `tone` / accent color.
- Allow `tone` to accept a custom hex string (currently only `gray`/`leader`) so the session's activity color is applied to the left rail.
- Update `SessionHoverMenu`'s in-edit `NotePanel` render and `DiaryPopoverEditor`'s `NotePanel` render to pass `flush` + the accent color.

## Out of scope

- Year/list calendar view session click behavior.
- Creating a new session (still uses popover, since no hover menu exists).
- Hover-menu visuals when NOT in edit mode.

## Files touched

- `src/components/calendar/SessionHoverMenu.tsx` (edit mode + edit panel)
- `src/components/calendar/UnifiedElasticGrid.tsx` (route clicks into hover menu)
- `src/components/calendar/DiaryPopoverEditor.tsx` (use shared fields; flush note panel)
- `src/components/calendar/DayNoteButton.tsx` (NotePanel `flush` prop + custom tone color)
- `src/components/calendar/DiaryEditFields.tsx` (new shared module)
