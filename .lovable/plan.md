# Coach calendar editing for clients

This is a large, cross-cutting change touching the calendar grid, side nav, sessions schema, and the clients page. Below is the scoped plan before I start.

## 1. Database (migration)

**Add coach pending state to sessions** (the existing event/session table — I'll confirm exact name on first read; likely `calendar_events` or similar):
- `created_by_coach_id uuid null` — the coach who created it (null = self-created)
- `coach_pending boolean default false` — true until client accepts
- Index on `(user_id, coach_pending)`

**RLS updates on sessions:**
- Coach with `is_coach_of_member(owner)` AND `has access to that category` (via `calendar_category_coach_access`) can `INSERT` rows where `created_by_coach_id = auth.uid()` and `coach_pending = true`.
- Coach can `SELECT/UPDATE/DELETE` only their own pending rows on the client's calendar.
- Client can `UPDATE` to flip `coach_pending → false` (accept) on rows targeting them, and `DELETE` any.

**Coach access level** (view vs edit): use existing column on `user_coaches` (`access_level` text: `'view' | 'edit'`). If missing, add it with default `'view'`. The existing CoachesPanel UI already exposes view/edit toggle.

**Remove obsolete code:** any older "coach can edit" hacks tied to follower/leader paths get removed in favour of the new `created_by_coach_id` + `coach_pending` flow.

## 2. Side nav — coach viewing a client

`CalendarSideNav` already shows `MeCategorySectionAdapter` for individuals. When a coach opens a client's calendar (new prop `clientUserId` + `coachAccessLevel`):
- Header label = client's name (instead of "Me").
- Category list = the client's `calendar_categories` filtered to those present in `calendar_category_coach_access` for `(owner=client, coach=me)`.
- `useUserCategories` extended to accept `ownerUserId` override and apply coach-access filter.

## 3. Calendar grid — coach edit mode

Add `coachMode?: { clientUserId: string; accessLevel: 'view' | 'edit'; allowedCategoryIds: Set<string> }` prop threaded through `CalendarPage → UnifiedElasticGrid`.

In the grid:
- If `accessLevel === 'view'`: double-click is a no-op; drag-select marks the area but on mouseup the marquee just clears (no session created, no editor opens).
- If `accessLevel === 'edit'`: same creation flow as self, but new sessions are inserted with `user_id = clientUserId`, `created_by_coach_id = me`, `coach_pending = true`. Activity dropdown is restricted to `allowedCategoryIds`.
- Render: sessions with `coach_pending=true` get a diagonal-stripe overlay (light gray stripes over the category color) using a CSS `repeating-linear-gradient`. Applies to both sides — coach sees them pending too until accepted.

## 4. Hover menu — pending coach session (client view)

When the client hovers a session where `coach_pending=true` AND `created_by_coach_id` is set:
- Replace the normal hover menu with a compact 2-button panel: ✓ **Accept** (left) | 🗑 **Delete** (right).
- Accept → `UPDATE sessions SET coach_pending=false WHERE id=...`.
- Delete → `DELETE` (RLS allows owner).

Coach hovering their own pending session sees a simple Delete action (cannot accept on client's behalf).

## 5. Clients page wiring

`ClientsPage` / `MemberWorkspace` already opens a client workspace. Mount the existing `CalendarPage` inside the client tab with the new `coachMode` prop and the resolved `accessLevel` from `user_coaches`.

## 6. Realtime

`calendar_events` (or equivalent) is already in `supabase_realtime` for the user — extend the coach's grid to also subscribe to `user_id=eq.${clientUserId}` so accept/delete events from the client flip the stripe live.

---

## Technical notes

- Stripe overlay: single utility CSS class `.session-pending` with `background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.35) 6px 8px)` layered over the existing color.
- Category dropdown filtering: pass `allowedCategoryIds` to `SessionPopoverEditor` / `SessionDetailsModal` and filter at render.
- Drag-select swallow in view mode: early-return in the mouseup handler of `UnifiedElasticGrid` before the "create draft session" branch.

## Out of scope (per your message — saved for later)

- Notifications/email when coach adds session.
- Bulk accept.
- Coach-side edit of an accepted (no-longer-pending) session.

Shall I proceed with this plan?
