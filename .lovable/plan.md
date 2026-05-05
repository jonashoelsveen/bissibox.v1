# Map page — folder-scoped locations & courses

Build the missing folder workspace on `/map`. Folders contain locations (single pin) and courses (path + split points). Inside a folder the user can view multiple items at once on one map (checkbox-toggled, color-coded) or edit a single item full-screen using the same editors as the event page.

## Data model (localStorage, structured for backend port later)

Extend `MapItem` in `src/components/map/MapPage.tsx`:

```ts
type LatLng = [number, number];
type SplitPoint = { id; kind; label; position: LatLng; note? };

type MapItem = {
  id; kind: "location" | "course";
  name; pinned; created_at;
  folderId: string | null;        // replaces `folder` (folder name)
  color: string;                   // assigned at creation, used for course/pin tint
  pin?: { lat: number; lng: number } | null;   // location only
  path?: LatLng[];                 // course only
  splits?: SplitPoint[];           // course only
};
```

A small migration on read converts legacy `folder` (name) → `folderId` by lookup. `color` is auto-picked from a 10-color palette, avoiding collisions inside the same folder when possible.

## Side nav behaviour

- Selecting a folder row in `MapSideNav` routes to `?folder=<folderId>` and the body renders the new `FolderMapView`.
- `Unsorted` and `Previous` keep current behaviour (flat list).
- Items inside a folder still open into tabs when clicked from list contexts; opening a single item from inside the folder view is handled by the right sidebar (see below).

## FolderMapView (new file `src/components/map/FolderMapView.tsx`)

Layout: `grid-cols-[1fr_320px]`, full viewport height under the tab bar.

### Right sidebar (320px) (Same size as the current blank right sidebar)

- Header row: folder icon + folder name (renamable inline later — out of scope now).
- Section: **Locations** — checkbox + pin icon + name + color dot. Click row: opens that location for editing in main area. Toggle checkbox: include in view-mode overlay.
- Section: **Courses** — same pattern with route icon.
- Footer: collapsible **+ Add** that expands to two buttons: `+ Location`, `+ Course`. Clicking either creates a new empty item in this folder and immediately switches main area to its editor.

### Main area — three modes

1. **View mode** (default when no item selected for editing)
  - Single Mapbox map.
  - Overlays for every *checked* item in the folder, each rendered in its color (lines for courses with split markers, pins for locations).
  - Top-left: a single search input. As the user types, fuzzy-match across folder items. If a query matches an item in the folder that is **not checked**, show a calm inline notice: *"'*&nbsp;*' is in this folder but not shown — tick it on the right to display it."* No matches → standard "no results" line.
  - Style picker top-right.
2. **Edit location mode**
  - `<SimplePinMap hideSidebar showDescription={false} kindLabel="location" ...>` filling the main area.
  - `onChange` writes pin into the item; `onSave` persists and returns to view mode.
  - Top-right delete-pin / save buttons come from `SimplePinMap` already.
3. **Edit course mode**
  - `<CourseMapEditor ...>` with the existing island, height profile under the map (component already does this), and `onSave` persisting `path` + `splits` to the item.

A small breadcrumb chip top-left in edit modes ("← Back to folder") returns to view mode.

## Item geometry persistence

Editing in either editor calls `onChange` continuously; we debounce-write the item's geometry into `map:items:<scope>` on every change so closing the page never loses work, and `onSave` shows a toast confirmation. This is the "professional save logic" the user asked for; storage shape is ready to swap with Supabase tables later (`map_folders`, `map_items` with `folder_id`, `geometry jsonb`, `color`).

## Tab + creation surface adjustments

- The global `+` dropdown in `MapBody` keeps Folder / Location / Course but the Location/Course flows now require a folder selection (already a select; just enforce non-empty) and route the user into the folder's edit mode after creation rather than opening a separate tab.
- Existing `MapItemView` (placeholder) is deleted — opening an item navigates to its parent folder with `?edit=<itemId>`.

## Files touched

- `src/components/map/MapPage.tsx` — data model, route to FolderMapView, cleanup of MapItemView usage, enforce folder requirement.
- `src/components/map/FolderMapView.tsx` — new component (right sidebar + view/edit mode switcher + multi-overlay viewer).
- `src/components/map/MapItemView.tsx` — removed.

## Out of scope for this round

- Backend (Supabase) tables — keep localStorage; structure is ready.
- Drag-to-reorder items inside a folder.
- Renaming/deleting items from the folder sidebar (will follow once basic flow is verified).
- Sharing folders / multi-user sync.