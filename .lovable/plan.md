# Move Map into Library as a new category

Map becomes a category inside `/media`, sitting in the side nav under Media with the same folder logic. The standalone `/map` route redirects into `/media?tab=map` so existing links keep working.

## What changes

1. **Library side nav** — add a "Map" section under Media listing the user/team's map folders (with pin / rename / delete / drag-reorder, identical UX to the existing categories).
2. **Library page (`/media`)** — adds a `map` tab. When active, the right pane shows the existing Map experience (folder map view, item view, "Previous" list) without its own side nav or top tab strip — those are provided by the Library shell.
3. **Map item tabs** — opening a location/course adds a tab to the same global top tab bar used by notes/meetings/media (new tab type `map`). Closing/dragging tabs works exactly as today.
4. **Map nav icon** — the top nav "Map" icon now points to `/media?tab=map` instead of `/map`.
5. **`/map` route** — still exists, but its component immediately redirects to `/media?tab=map` (preserving `folder`, `open`, `edit`, `view`).
6. **Global "+ menu"** — `map-location` / `map-course` already trigger creation; the GlobalCreateOverlay handler now navigates to `/media?tab=map` and opens the new item as a map tab via the existing `library:open-tab` event.

## Technical notes

- New file `src/components/map/MapEmbedded.tsx`: thin wrapper that owns map folders + items state (same localStorage keys as today) and renders `MapBody` / `FolderMapView` / `MapItemView`. It accepts `folder`, `editId`, `activeItemId`, `onSearchChange`, `onOpenItem`, `onItemCreated` props instead of using `useSearch/useNavigate` for `/map`.
- `MapPage.tsx` is split: `MapBody`, `NewFolderDialog`, `NewMapItemDialog`, `PreviousList`, `MapItem`, `MapFolder`, `pickFolderColor`, storage helpers stay; the page wrapper (TopBarSlot + aside + tab DnD) is removed in favour of MapEmbedded.
- `LibrarySideNav.tsx`: add `map` to `LibraryCategory`, load map folders from `localStorage` keyed by the same `scope` MapPage uses, listen to `map:refresh`. Folder rename/delete updates localStorage and dispatches `map:refresh`.
- `routes/media.tsx`: add `"map"` to `LibraryTab`, extend `OpenNoteTab` with `type: "map"` + `mapKind`, render `<MapEmbedded />` when `tab === "map"` and active tab is not a map item, render `<MapItemView />` when active tab is a map item. Listen for `library:open-tab` `type: "map"`.
- `routes/map.tsx`: change component to a redirect to `/media?tab=map`, forwarding search params.
- `NavIconTabs` and `GlobalCreateOverlay`: swap any `/map` `to:` for `/media` with `search: { tab: "map", ... }`.

## Out of scope

- Backend persistence for map folders/items (still localStorage, as today).
- Any visual redesign of the Map body / item view — pixel-identical to current.
