# Group Meetings (separate page) — implementation plan

## Goal

- Add a new "Group Meetings" page that is a behavioral replica of the current Library "Meetings" tab, but:
  - Lives at its own route (`/team/group-meetings`), with its own icon (suitcase) in the left main nav.
  - Stores data in **separate tables** so board and group meetings never mix.
- Rename the current Library "Meetings" tab to **Board Meetings** (visible label + side-nav label).
- Role gating: per user instruction, role/access logic is deferred. For now, **always show the new icon in team mode** so the user can preview the page. Specs for who sees what will be wired later.

## Database (new tables, mirror of board ones)

Mirror the schema/RLS of the existing board tables one-for-one, replacing `team_board` with `team_group`:

- `team_group_meetings` (id, team_id, title, folder, meeting_date, notes, created_by, timestamps)
- `team_group_meeting_folders` (id, team_id, name, pinned, sort_order, timestamps)
- `team_group_meeting_attachments` (id, meeting_id, team_id, uploaded_by, file_name, storage_path, file_size, mime_type, created_at)
- `team_group_meeting_roster` (id, meeting_id, team_id, board_member_id, name, role, email, sort_order)
- `team_group_meeting_attendance` (id, meeting_id, team_id, board_member_id, roster_id, created_at)

RLS for now: team owner full access (matches how the board tables read/write today). Read access for non-owners can be tightened once the role model is specified.

No changes to existing board tables.

## Code changes

Strategy: parameterize the existing components with a `kind: "board" | "group"` prop that selects table names, instead of duplicating ~2000 lines.

1. **`src/lib/meeting-kind.ts` (new)** — small helper:
   ```ts
   export type MeetingKind = "board" | "group";
   export const meetingTables = (k: MeetingKind) => k === "group"
     ? { meetings: "team_group_meetings", folders: "team_group_meeting_folders",
         attachments: "team_group_meeting_attachments",
         roster: "team_group_meeting_roster", attendance: "team_group_meeting_attendance" }
     : { meetings: "team_board_meetings", folders: "meeting_folders",
         attachments: "team_board_meeting_attachments",
         roster: "team_board_meeting_roster", attendance: "team_board_meeting_attendance" };
   ```

2. **`MeetingsListPage`** — add optional `kind` prop (default `"board"`); replace hardcoded table names with `meetingTables(kind).*`.

3. **`TeamBoardPage`** — add optional `kind` prop; replace hardcoded board-table names with `meetingTables(kind).*`. Default `"board"` so existing usage is unaffected.

4. **`LibrarySideNav`** — rename the "Meetings" section label to **"Board Meetings"**. (It only ever shows board folders.)

5. **`src/routes/media.tsx`** — rename the "Meetings" library tab label to **"Board Meetings"** wherever shown to the user. Library continues to use `kind="board"` (default).

6. **`src/routes/team.group-meetings.tsx` (new)** — a new page that mimics `media.tsx`'s shell but with only one fixed top tab ("Meetings", suitcase icon) plus opened-meeting tabs. It renders:
   - Sidebar = a slim folder list (just the group meeting folders) — built inline (small component); reuses the same drag/pin/rename/delete patterns by calling into `meetingTables("group").folders`.
   - Body = `<MeetingsListPage kind="group" ... />` and `<TeamBoardPage kind="group" embedded hideOwnTabBar forceMeetingId={...} />` for the active meeting tab.
   - + button shows a tiny menu: Folder | Meeting (matching the spec).

7. **`src/components/Chrome.tsx`** — add a new `Briefcase` nav button "Group Meetings" → `/team/group-meetings`, shown when `mode === "team"` and a user is signed in. Place it directly under the Organization (Tent) icon as requested.

## Out of scope (per user)

- Role enforcement (admin vs group leader). Will be specified later.
- Invite/accept flow for either role.
- Permission-based hiding/showing of icons or pages.

## Notes

- All existing Board Meetings behavior remains unchanged (default `kind="board"`).
- New tables are isolated; any future role policies can be applied without disturbing the board side.
