## Overview

Rebuild the calendar left-rail "Categories" section into an editable, persistent **Me** group of user-managed categories. Defaults seed Training, School, Work (locked from rename/delete). User can add custom categories with name, color, drag-order, pin, hide, and these flow into the session editor dropdown.

## Persistence

Store user categories in a new Supabase table `calendar_categories`:

- `id uuid pk`
- `user_id uuid` (RLS: owner only)
- `name text`
- `color text` (hex)
- `pinned bool default false`
- `hidden bool default false`
- `sort_order int`
- `is_default bool default false` (true for seeded Training/School/Work — locks rename/delete)
- `default_key text null` (`'training'|'school'|'work'` so legacy events still match)
- timestamps

A trigger on `auth.users` insert (or first-load fallback) seeds the three defaults with the existing colors `#B8B8FF`, `#ADD8E6`, `#C19A6B`.

## UI changes

### `CalendarSideNav.tsx`
- Replace the "Kategorier" label + static `INDIVIDUAL_SIDENAV_CATEGORIES` with a collapsible **Me** header row.
- Header row: chevron (rotates), label "Me", plus icon (creates a new category — appears at bottom with name "New tab" pre-selected for inline rename).
- Below: list of user's `calendar_categories` rows. Each row:
  - color dot (left)
  - name
  - on hover: three-dot menu + eye toggle (eye click toggles `hidden`; diagonal line via existing EyeOff)
- Drag-and-drop using `@dnd-kit` (mirror `LibrarySideNav` pattern). Pinned rows stay grouped above unpinned, can't cross.
- Three-dot menu items:
  - Pin to top (always available)
  - Rename (disabled when `is_default`)
  - Color → opens nested submenu
  - Delete (disabled when `is_default`)

### Color submenu (Notion-style multi-level)
Anchored to the right of the "Color" item, top edges aligned. Contents:
- 8 swatches generated via HSL with `S=100%, L=68%` across hues `[0, 45, 90, 135, 180, 225, 270, 315]`. Click a swatch → updates dot in real time, **does not close** menu.
- "Custom" row at the bottom. Click → opens a third panel to the right containing a compact `MiniColorPicker` (stripped-down replica of `TopBarColorPicker`: SV canvas + hue strip + hex input + Save). Save / Enter applies and closes the entire menu chain.

### `MiniColorPicker.tsx` (new)
Same HSV math as `TopBarColorPicker` but smaller (SV canvas ~140px), no Supabase write — just `onSave(hex)`.

### Session editor dropdown (`MonthGridType1.tsx`)
- For `seat === "individual"`, replace the hard-coded `INDIVIDUAL_CATEGORIES` `<select>` options with options sourced from `calendar_categories` (sorted, plus an "Else" custom-color option preserved).
- Color of the selected category drives the session color.

### Filtering
- Replace `INDIVIDUAL_SIDENAV_CATEGORIES` filter keys with dynamic per-category keys derived from id/color. `categoryKeyFromColor` becomes color-based (matches by hex).
- `visibleCategories` set still drives event hiding; rows toggled "hidden" remove that category's color from the visible set.

## Out of scope (kept as-is)

- Admin-seat Møte/Event/Løp categories untouched.
- Diary side nav untouched (it already has its own tree).
- Existing event records keep their stored hex; matching is purely by color so renames/recolors don't orphan events.

## Files

- new: `supabase/migrations/...` — table, RLS, seeding trigger
- new: `src/components/calendar/MiniColorPicker.tsx`
- new: `src/components/calendar/CategoryColorMenu.tsx` (handles swatches + Custom panel)
- new: `src/hooks/useUserCategories.ts` (CRUD + realtime)
- edited: `src/components/calendar/CalendarSideNav.tsx`
- edited: `src/components/calendar/MonthGridType1.tsx` (dropdown sourcing)
- edited: `src/components/calendar/CalendarPage.tsx` if needed for filter wiring
