# Leader / Follower view of member diary

## 1. Backend: schema + access model

New tables (all RLS-on, with `updated_at` triggers using `public.set_updated_at_now`):

### `team_followers`
View-only followers of a member's calendar/diary.
- `id`, `member_id` (uuid → profiles.id), `follower_id` (uuid → profiles.id), `team_id` (uuid, nullable — null = personal), `created_at`, `created_by`
- Unique (`member_id`, `follower_id`, `team_id`)

### `team_active_followers`
Followers who can also annotate (write notes) but not edit sessions. Group leaders of OTHER groups in the same team and any explicitly-promoted user end up here.
- Same shape as `team_followers`

### Helper SECURITY DEFINER functions (in `public`, `SET search_path = public`):
- `is_group_leader_of_member(_member uuid)` → true when caller leads the same team_group as `_member` (matches by `team_group_leaders.user_id` OR `lower(email)` like `useIsGroupLeader`).
- `can_annotate_member(_member uuid)` → `auth.uid() = _member` OR `is_group_leader_of_member(_member)` OR row exists in `team_active_followers` for caller.
- `can_view_member(_member uuid)` → `can_annotate_member` OR row exists in `team_followers`.

### `diary_day_notes`
Replaces `localStorage` day notes.
- `id`, `member_id` (uuid, owner of the diary), `author_id` (uuid, who wrote the note), `day` (date), `body` (text), `created_at`, `updated_at`
- Unique (`member_id`, `author_id`, `day`) — one note per (member, author, day). Lets the member and each leader/follower hold their own note for the same day.

### `diary_session_notes`
Replaces the leader-side note for a session (member-side note already lives on `events.session_note` — see §2).
- `id`, `event_id` (uuid), `member_id` (uuid), `author_id` (uuid), `body` (text), `created_at`, `updated_at`
- Unique (`event_id`, `author_id`)

### RLS for both note tables
- SELECT: `author_id = auth.uid()` OR `member_id = auth.uid()` OR `can_view_member(member_id)`
- INSERT/UPDATE/DELETE: `author_id = auth.uid()` AND `can_annotate_member(member_id)`

### Server-side write lockdown for sessions (UI + backend)
Today the diary's events live in localStorage via `yearStore`. Per scope, we keep that as-is for now; backend-policy enforcement applies to the new note tables. A short note: when sessions move to Supabase later (already foreshadowed by the schema), the same `can_annotate_member` / owner-only split will gate writes.

> If you want me to also migrate sessions in this pass, say so — that's another ~2× scope.

## 2. Member-side day note migration

Migrate `useDayNote` to query `diary_day_notes` filtered by `member_id = currentMember`, `author_id = auth.uid()`. The hook returns `{ memberNote, viewerNote, canEdit, canViewMemberNote }`. localStorage stays as a one-time read-and-clear fallback (best-effort migration on first mount).

The same hook serves both:
- The member viewing their own diary (`memberNote` = their own row, `viewerNote` = null)
- A leader/active-follower viewing the member (`memberNote` = member's row, read-only; `viewerNote` = leader's own row)

## 3. Diary viewer-mode plumbing

Add a new prop chain `viewerRole: "owner" | "leader" | "follower"` and `memberId: uuid` from `MemberWorkspace` → `YearCalendarView` → `UnifiedElasticGrid` → `SessionHoverMenu` / `DayNoteButton`.

`MemberWorkspace` resolves the role on mount via a single RPC: `select role from get_member_viewer_role(member_id)` returning `'owner' | 'leader' | 'follower' | 'none'`. (`follower` and `none` both render the diary read-only with no annotation; only `owner` and `leader` can write notes; only `owner` can edit sessions.)

`DiaryPage` (the member's own `/diary` route) passes `viewerRole="owner"`, `memberId=auth.uid()`.

## 4. SessionHoverMenu changes

Two layouts:

**Owner (today's behavior, reordered):**
```
[Details] [Note]            (no Delete here in the menu — Delete moves into
                             the Details modal, matching the spec: "the
                             delete button is not there" when leader hovers,
                             implying Delete is always inside Details)
```

Actually re-reading: "they cannot ... add sessions or edit sessions. Therefore, when they hover the sessions created by the user in Diary, the delete button is not there." So Delete is hidden only for leaders. Owner keeps Delete.

- Owner menu: `[Details] [Note]` left/right + `[Delete]` slot rendered only when `viewerRole === "owner"`.
- Leader/follower menu: `[Details (read-only)] [Note]` only.

The Note icon on the right opens the leader/follower's OWN note panel (`diary_session_notes`). The member's note (`events.session_note`) stays where it is — rendered as the existing read-only/preview panel attached to the member-side icon.

### Side-by-side panels
When both notes exist (or one is being edited):
- Member-side note panel renders at the existing position (left of menu, attached to member icon).
- Leader-side note panel renders to the right of the menu, top edge aligned with menu top, ~6px gap.
- Leader panel uses a 3px LEFT border in the platform's dark blue (`hsl(var(--primary))` or whichever of the 8 brand colors is the dark blue — I'll use the primary token; if you want a specific one of the 8, say which).
- Member panel keeps its existing gray left border.

The member viewing their own diary sees the same layout: their own note on the left, leader's note (if any) on the right with the blue border.

## 5. DayNoteButton changes

Same idea: when a leader/follower note exists (or is being edited), render a second `NotePanel` to the right of the member panel, blue left border. The right-side icon to open it lives mirrored on the day cell (same icon, right-aligned).

## 6. Read-only Details modal

`SessionDetailsModal` gets a `readOnly` prop. When true: no editable inputs (text becomes plain spans), no Save button, footer shows just a Close button. Delete button removed for leaders (already not present in their hover menu).

## 7. Files touched

**New**
- `supabase/migrations/<ts>_followers_and_diary_notes.sql`
- `src/hooks/useDiaryDayNote.ts` (replaces direct `useDayNote` localStorage usage)
- `src/hooks/useDiarySessionNote.ts`
- `src/hooks/useViewerRole.ts`

**Edited**
- `src/components/team/MemberWorkspace.tsx` — resolve viewerRole, pass through
- `src/components/calendar/DiaryPage.tsx` — pass `viewerRole="owner"`
- `src/components/calendar/YearCalendarView.tsx` — forward props
- `src/components/calendar/UnifiedElasticGrid.tsx` — forward props, hide owner-only affordances
- `src/components/calendar/SessionHoverMenu.tsx` — leader layout + dual panel
- `src/components/calendar/DayNoteButton.tsx` — swap localStorage hook for Supabase, dual panel
- `src/components/calendar/SessionDetailsModal.tsx` — `readOnly` prop

## 8. Scope I'm explicitly NOT doing this round (per your message)

- UI to add/remove followers and active_followers (you said you'll give further instructions).
- Migrating diary sessions/events from localStorage to Supabase.
- Calendar-page leader view (only Diary in this pass; mention if you want Calendar covered too — same plumbing).

## 9. Open detail to confirm

The "dark blue" — the codebase doesn't have a single named "8-color brand palette" I can see at a glance. I'll use `hsl(var(--primary))` unless you point me at a specific token (e.g. one of the activity colors in `lib/activity-colors.ts`).
