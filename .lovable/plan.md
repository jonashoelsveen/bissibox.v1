## Goal

Make the Library page's category behavior fully consistent across **Previous, Meetings, Notes, Files, Media** — every category renders content in the main area and exposes its actions (search icon + "+" dropdown/button) in the **horizontal top-tab actions area** (the `actionsMount` portal), matching the existing Notes search-icon style. Meetings stops being its own embedded sub-app and becomes a normal Library category with an expandable folder list in the sidebar.

## Changes

### 1. Sidebar — Meetings becomes a normal expandable category
File: `src/components/library/LibrarySideNav.tsx`
- Remove the standalone "Meetings" button.
- Add `meetings` to the `sections` array (team-mode only) with the `Briefcase` icon. Loads folder list from `team_board_meetings` (`distinct folder` for current team) plus pulls any `extra` folders if needed (initially just real folder names from meeting rows is enough).
- Folder identifier: the folder name string (mirrors Notes folder behavior). `__unsorted__` = meetings with `folder = null`.
- Selecting Meetings (no folder) sets `folder=""` (All), expanding/collapsing matches other categories.

### 2. Routing / state in `src/routes/media.tsx`
- Drop the special `view=meetings` URL param. Treat `tab=meetings` like `tab=notes/files/media`.
  - Update `validateSearch` to add `"meetings"` to `LibraryTab` (team-mode only enforced at render).
- Remove `showingMeetings` branch and `<TeamBoardPage embedded …/>`. Render new `<MeetingsListPage actionsMount={…} hideSideNav externalView={…} onOpenMeeting={…} />` instead.
- The "Previous" view also stops rendering its own search/+; it portals its actions into `actionsMount` instead. Keep `view=previous` URL param.
- "+" dropdown for Previous and Meetings still includes Meeting/Note/Files/Media (same `handleCreateFromPrevious`).

### 3. New component `src/components/library/MeetingsListPage.tsx`
Slim list view that mirrors the structure/style of NotesPage:
- Loads meetings (`team_board_meetings`) for the active team. Filters by `externalView` (all vs folder name vs unsorted).
- Renders meeting cards (title, date, folder badge) using the same card grid styling NotesPage uses.
- Click a meeting → calls `onOpenMeeting(id)`. Initial implementation: navigate to existing `/team/board` route with the meeting id (cheap, preserves the current editor). Opening meetings as horizontal tabs inside Library is **out of scope for this change** (would require porting all TeamBoard editor state).
- Portals into `actionsMount`:
  - **Search icon** (expanding pill) — copy the exact JSX/classes from NotesPage's search affordance, switched to filter the meetings list.
  - **"+ New meeting"** primary button — opens the same NewMeeting modal flow. Reuse logic from team.board.tsx (extract `createMeeting(teamId, title, folder)` helper into the new component, or call a small shared util).
  - **"+ New folder"** secondary button — inserts into local extraFolders + triggers sidebar refresh (folders are derived from meetings, so until a meeting is created in the folder it won't persist; mirrors current TeamBoard behavior).

### 4. PreviousPage — move actions into the top tab bar
File: `src/components/library/PreviousPage.tsx`
- Accept `actionsMount?: HTMLDivElement | null`.
- Remove the in-content search input and "+" dropdown header.
- Build the same `actions` JSX (search icon + "+" dropdown with Meeting/Note/Files/Media) and `createPortal(actions, actionsMount)`.
- The list rendering (Recently edited) and empty/loading states stay.

### 5. Cleanup
- `team.board.tsx`: keep the `embedded` and `newMeetingSignal` props (still used by `/team/board` route directly and possibly future), but Library no longer mounts it.
- No DB migrations.

## Out of scope (explicit)

- Opening meetings as draggable horizontal tabs inside the Library (notes-style multi-tab editor for meetings). Today the meeting editor is large and lives inside TeamBoardPage; clicking a meeting card from the Library list will route to `/team/board?meeting=<id>` which already supports tabbed editing.
- Any visual/behavior change to the existing `/team/board` route itself.

## Technical notes

- Sidebar meeting folders query (per active team):
  `select folder from team_board_meetings where team_id = $1 and folder is not null` then dedupe client-side. Sorted alphabetically. No `pinned`/`sort_order` (the table doesn't have folder rows — folders are implicit).
- `MeetingsListPage` uses the same `scope` pattern as other Library pages (`team_id` for team mode).
- Search-icon pill JSX is copied verbatim from `NotesPage` for visual parity.
- `tab=meetings` is only valid in team mode; if the user is not in team mode, we redirect to `tab=files`.
