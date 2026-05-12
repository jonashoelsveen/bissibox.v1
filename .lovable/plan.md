## Goal

When a group leader is also a member of their own group, the leader role and the member role should behave as two independent personas — even though they share the same user account.

- Opening their own profile from the **group members** page → they act as **leader**: they see their own member-notes (read-only) and can write a separate **leader-note**.
- Opening their own diary from **individual mode** → they act as **owner**: they edit their member-note and see any leader-notes (including ones they wrote about themselves) as "notes from others", read-only.

Today the database can only store one note per `(member_id, author_id, day)`, so the same user can never have both a member-note and a leader-note on the same day. We need to introduce a *kind* dimension.

## Changes

### 1. Database (migration)

Add a `kind` column to both diary note tables to distinguish notes authored as the member vs. as a leader/active-follower:

- `diary_day_notes`: add `kind text not null default 'member'` with check `kind in ('member','leader')`.
- `diary_session_notes`: same column.
- Replace the existing unique constraints:
  - `diary_day_notes`: `unique (member_id, author_id, day, kind)`
  - `diary_session_notes`: `unique (member_id, author_id, event_id, kind)`
- Update INSERT/UPDATE RLS `WITH CHECK` so:
  - `kind = 'member'` is only allowed when `author_id = member_id` (and `author_id = auth.uid()`).
  - `kind = 'leader'` is only allowed when `can_annotate_member(member_id)` (and `author_id = auth.uid()`). This permits self-leader rows for someone who is both.
- Add a new SECURITY DEFINER function `get_member_viewer_role_for_leader(_member uuid)` that returns `'leader' | 'active_follower' | 'follower' | 'none'` *without* the owner short-circuit, so the leader-context UI can ask "what's my non-owner role on this member?".

### 2. Viewer role hook

`src/hooks/useViewerRole.ts`:

- Add an options arg: `useViewerRole(memberId, { context?: 'auto' | 'leader' })`. Default `'auto'` keeps current behaviour.
- When `context === 'leader'`, skip the `memberId === user.id` → `'owner'` short-circuit and call `get_member_viewer_role_for_leader` instead. Result is whatever leader/follower role applies (could be `'leader'` for self).

### 3. MemberWorkspace + diary note hooks

- `src/components/team/MemberWorkspace.tsx`: pass `{ context: 'leader' }` to `useViewerRole(userId, …)`. This is the "viewing through the group members page" surface, so the persona is leader even on yourself.
- `src/hooks/useDiaryDayNote.ts` and `src/hooks/useDiarySessionNote.ts`:
  - Include `kind` in select/insert/update/delete.
  - `memberNote` reads the row where `author_id = member_id AND kind = 'member'`.
  - `viewerNote` (leader/active-follower row) reads `author_id = viewerId AND kind = 'leader'`. This works even when `viewerId === memberId`.
  - `leaderNotes` reads everything where `kind = 'leader' AND author_id != viewerId` (so a leader sees other leaders' notes plus the member-note above).
  - `saveViewerNote(text)` always upserts with `kind: isOwner ? 'member' : 'leader'`. With the new conflict key `(member_id, author_id, day, kind)`, a self-leader can have both rows side-by-side.
- `DayNoteButton` keeps the same icon logic — gray = member-note, black = leader-notes — and now correctly shows both icons for a self-leader.

### 4. Individual mode parity

In individual mode (`/diary`, `/calendar`), `useViewerRole` stays in `'auto'`, so the same user is `owner` of themselves and edits their member-note. Any leader-note rows they wrote about themselves through the group surface will now appear under the black icon as a read-only "note from others" — exactly the desired round-trip.

## Technical notes

- Existing rows are migrated with `default 'member'` for member-authored rows (`author_id = member_id`) and `'leader'` for everything else, in a single `UPDATE` inside the migration.
- `useDiaryDayNote.reload` only changes the SELECT/UPSERT shape; the `CHANGE_EVENT` channel and dispatch are unchanged.
- No edge-function changes; all of this is RLS + hook code.
- `types.ts` will regenerate automatically after the migration.
