# Top Bar with Profile Switcher & Color Theming

## What we'll build

**1. Persistent top bar (every page)**
- Fixed bar across the top of every page, same height as the current profile icon (~36px / h-9).
- Background = the user's selected color for the active profile (individual or entity).
- Left side: round profile avatar (initial, or uploaded image when present) + active profile name + down chevron.
- Clicking the name/chevron opens a dropdown listing **Individual** at top, then all entities (teams/companies/cooperations) — exact same style as the existing entity switcher in settings.
- Selecting an entry switches the active profile (`setActiveEntity`) and the top bar color updates immediately.

**2. Storing the per-profile color**
- New column `top_bar_color text` on `profiles` (individual) and on `teams` (entity).
- Default: a neutral light token (no color set → falls back to a subtle background).
- Read on app load + on profile switch, used as the top bar background.

**3. Appearance tab in Settings (both modes)**
- New "Appearance" tab in the settings sidebar for both individual and entity modes.
- Contains a collapsible category **"Top bar color"** styled like the Groups category on the organization page (header row with title left, chevron right; click expands).
- When expanded, shows the color picker tool described below.

**4. Color picker tool**
- Excel-inspired, sharp-edged, white / light gray / off-white surface.
- Rectangular canvas (saturation × value) with a draggable selector.
- Separate hue slider (vertical strip beside the canvas) so the canvas can show hue/sat space cleanly.
- Hex input field directly below the canvas.
- "Save" button bottom-right; on click, persists `top_bar_color` to `profiles` or `teams` (depending on active mode) and the top bar updates live.

## Technical notes

- DB migration adds `top_bar_color text` to `public.profiles` and `public.teams`. RLS already covers owner updates.
- New component `src/components/TopBar.tsx` rendered inside `RootComponent` above `<Outlet />`. `TopChrome` (left rail) stays — but the duplicate profile avatar at the top of the rail is removed since the top bar now owns identity.
- New `src/components/appearance/TopBarColorPicker.tsx` (canvas + hue slider + hex + save). HSV→RGB conversion utility colocated.
- Settings page (`src/routes/settings.tsx`) gets a new "Appearance" tab containing a `Collapsible` "Top bar color" section.
- Active color is read in `AuthProvider` (or a small `useTopBarColor` hook) keyed by `activeEntityId` / user id, refetched on switch and after save.
- All new colors are written via CSS custom property on the bar element (`style={{ background: color }}`) — no hard-coded tailwind color classes.

## Files

- `supabase/migrations/...` — add `top_bar_color` columns
- `src/components/TopBar.tsx` (new)
- `src/components/appearance/TopBarColorPicker.tsx` (new)
- `src/components/Chrome.tsx` — drop the top profile avatar (moved into TopBar)
- `src/routes/__root.tsx` — render `<TopBar />`, add top padding to `<main>`
- `src/routes/settings.tsx` — add Appearance tab + collapsible section
