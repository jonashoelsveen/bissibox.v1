## Library page restructure

### Layout changes

Remove the "Library" page header (`<h1>Library</h1>`) entirely.

Move the internal library left-side nav (currently inside each of NotesPage, FilesPage, MediaPage) up into the parent `LibraryPage` (`src/routes/media.tsx`). The page becomes a 3-zone layout:

```text
┌──────────────────────────────────────────────────────────────┐
│  TopBar (existing, colored)                                  │
├──────────┬───────────────────────────────────────────────────┤
│ Left     │  Sticky horizontal tab bar (open items + actions) │
│ category │───────────────────────────────────────────────────│
│ nav      │                                                   │
│  ▾ Notes │  Active panel content                             │
│   Folder │                                                   │
│  ▾ Files │                                                   │
│   Folder │                                                   │
│  ▾ Media │                                                   │
│   Album  │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

### Left category nav (new unified `LibrarySideNav`)

Three top-level rows, each with an icon + name + chevron toggle:

- **(StickyNote) Notes** → folders below (existing folder list from NotesPage)
- **(FolderClosed) Files** → folders below (from FilesPage)
- **(Image) Media** → albums below (from MediaPage)

Clicking a category name selects "All [category]" and switches the main panel. Clicking a folder/album selects that specific view. Chevron toggles the sublist independently. The currently-active category stays highlighted.

This nav lives on the left of the library page (replacing the per-page 200px nav columns). It is NOT moved into the global app sidebar (`Chrome.tsx`) — only visible inside `/media`.

### Sticky horizontal tab bar

The existing tab strip (already in `media.tsx`, lines 275–394) stays at the top, now positioned `sticky top-14` (just under the colored TopBar), with the page background so it visually attaches. It contains:

- **Open item tabs** — notes (existing), plus new file and media tabs (with their respective icon prefix and `folder · name` label, same close behavior as notes).
- **Actions area** (right side, the existing `actionsMount` portal): Search, New folder/album, New.

The standalone Notes/Files/Media tabs are removed from the strip (those moved to the left nav).

### Files & media as tabs

Extend the existing `openNoteTabs` model into a unified `openItemTabs` with `kind: "note" | "file" | "media"`:

```ts
interface OpenItemTab {
  id: string;
  kind: "note" | "file" | "media";
  title: string;
  folder: string | null;  // folder name or album name
}
```

- **Files**: clicking a file in `FilesPage` calls `onOpenFile(id)` which adds a tab; the tab renders an inline file viewer (image preview / PDF iframe / download link based on mime type).
- **Media**: clicking a media card calls `onOpenMedia(id)` which adds a tab; the tab renders the full-size media viewer (existing lightbox markup, but inline in the panel area instead of a fullscreen overlay).
- Tab icon prefix: `StickyNote` (note) / `FolderClosed`-style file icon (file) / `ImageIcon` (media).

The TopBar (colored) stays visible because we are still inside `/media` — no change needed; opening media in a tab does not navigate away or open a fullscreen overlay.

### Unified "New" dialog

Replace the three separate creation buttons (New note, New file/upload, New media upload) with one **New** button in the actions area. Behavior depends on context:

- New folder/album button stays separate, contextual:
  - Notes/Files panel → "New folder" with header `(FolderClosed) New {note|file} folder`
  - Media panel → "New album" with header `(ImageIcon) New media album`

- **New** button opens a centered dialog:
  - **Category** select: Note / File / Media (defaults to current panel's category)
  - **Folder/Album** select: list of folders for the chosen category, plus "Unsorted"
  - For Note: title input; on Save creates the note and opens it in a tab
  - For File: file picker; on Save uploads + scans, then opens in a tab
  - For Media: file picker (image/video); on Save uploads + scans, then opens in a tab
  - Footer: **Cancel** (bottom-left), **Save note/file/media** (bottom-right)

### Files affected

- `src/routes/media.tsx` — remove header, restructure layout, add `LibrarySideNav`, generalize tabs to `openItemTabs`, route file/media open events.
- `src/components/library/NotesPage.tsx` — remove internal `<nav>` left column; keep grid; expose folders via parent. Keep the per-folder list rendering.
- `src/components/library/FilesPage.tsx` — same: drop internal left column; add `onOpenFile` prop.
- `src/routes/media.tsx` `MediaPage` — same: drop internal left column; add `onOpenMedia` prop; convert lightbox into an inline tab viewer when invoked from a tab.
- New `src/components/library/LibrarySideNav.tsx` — unified 3-category nav with expandable folders/albums.
- New `src/components/library/NewItemDialog.tsx` — unified create dialog.
- New `src/components/library/FileTabViewer.tsx` and `MediaTabViewer.tsx` — inline viewers used inside an open tab.

### Out of scope

- No database schema changes.
- No changes to global sidebar (`Chrome.tsx`) other than what already exists.
- No changes to the new-note overlay used from the global "+" sidebar button.
- Search, select-mode, drag-reorder, realtime cover updates — preserved as-is.

