## Goal

Remove the vertical icon sidebar on the left of every page. Move those nav icons into the existing top tab bar which becomes universal and sits just below the existing TopBar (avatar + entity switcher). The selected icon becomes the "fixed left tab"; the other icons render as draggable square icon-tabs to its right; any page-specific tabs (e.g. open notes in Library) sit further right and cannot be reordered to the left of the icon-tabs.

## Pages that get the new top tab bar

Universal — appears on every authenticated page (Library, Calendar, Diary, Map, Search, Settings, Profile, Team, Desk, etc.). Logged-out pages keep the current minimal layout.

## Icon order

- Individual mode: `[selected]` · Library · Calendar · Diary · Search
- Entity mode: `[selected]` · Members (team) · Group meetings · Group members · Library · Calendar · Map · My events
- The selected one is shown as the fixed left "wide" tab (icon + label, like today's "Library" tab in `media.tsx`); the others render as square icon-only tabs.
- The `+` (new note / new event) buttons currently in the left sidebar are removed. Library and Organizer keep their existing in-page "+" entry points.

## Style

- Same visual language as the current Library top tab strip (`media.tsx` lines 497–510): sticky `top-14`, `border-b border-hairline`, hover `text-ink`, active `border-primary text-ink`.
- Fixed left tab keeps its current width (220px) and shows icon + label of the active section.
- Icon tabs are square (`h-9 w-9`-ish), icon size matches today's left-bar icons (`h-[18px] w-[18px]`, strokeWidth 2.25). Hover `bg-secondary/60`. Active never appears as a square because it's promoted to the fixed left tab.
- Drag-and-drop on the icon-tabs only — pointer-based, X-axis-locked, same FLIP animation as the Library note-tab strip. They cannot be dragged past the page-tabs region on the right. Order persists per user via `localStorage`.

## File-level changes

### New

- `src/components/MainNavTabs.tsx` — renders the fixed left tab + draggable icon-tab strip + a right-side `tabsSlot` for page-specific tabs and an `actionsSlot`. Reuses the pointer-drag logic adapted from `media.tsx`. Persists icon order in `localStorage` per `mode + entityId`.

### Edited

- `src/routes/__root.tsx` — drop `<TopChrome />`. Change `<main>` padding from `pl-20 md:pl-24 pt-20` to `pt-[calc(56px+44px)]` (TopBar 56px + new nav bar ~44px) and remove the left padding. Mount `<MainNavTabs />` directly under `<TopBar />` so it's universal.
- `src/components/Chrome.tsx` — delete (no longer used).
- `src/routes/media.tsx` — remove the local fixed "Library" tab + outer sticky container (lines 497–510 and the wrapping bar). Pass the open-note tab strip and `actionsMount` into `<MainNavTabs tabsSlot={…} actionsSlot={…} />` via a context or render prop, so they render to the right of the icon-tabs in the universal bar. Adjust `md:sticky md:top-28` on the side aside to the new offset.
- `src/components/calendar/CalendarPage.tsx`, `src/components/calendar/DiaryPage.tsx`, `src/components/map/MapPage.tsx`, `src/routes/team.*`, `src/routes/organizer.library.tsx`, `src/routes/desk.tsx`, `src/routes/settings.tsx`, `src/routes/profile.tsx`, `src/routes/index.tsx` — remove the left-padding compensation that assumed the vertical sidebar (`pl-20`/`md:pl-24` and any `top-14`/`top-28` sticky offsets), shift their internal sticky offsets down by the new bar height (~44px), and ensure they render below `MainNavTabs` cleanly. Internal page side-navs (LibrarySideNav, CalendarSideNav, DiarySideNav, MapSideNav) are unchanged.

### Deleted

- `src/components/Chrome.tsx`

## Drag and drop behaviour

- Icon-tab strip: pointer-based reorder among icon-tabs only.
- When a page exposes its own tabs (Library notes), they are passed in as `tabsSlot`. The page-tabs strip retains its existing internal drag logic; cross-region drag is not supported (icon-tabs and page-tabs are independent strips, separated by a thin divider).

## Out of scope

- No changes to TopBar, the entity switcher, or per-page side-navs.
- No changes to the actual pages' content layouts beyond removing the obsolete left padding.
- No backend / data changes.