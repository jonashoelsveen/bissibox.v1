## Goal

On the individual Calendar page left panel, change each personal category tab's three-dot menu and let the user grant per-category access to specific coaches. When a coach opens that user's Calendar from the Clients page, only the categories the owner has granted access to are shown — both the category tabs (in the left panel, when present) and the events of those categories in the calendar grid.

Scope: individual Calendar only. Diary, admin/team calendar, and the Coaches settings table are unchanged.

## 1. Three-dot menu changes (`CategoryActionsMenu` used by `MeCategorySection`)

- Remove the `Pin to top` / `Unpin` extra item that `MeCategorySection` passes in for personal categories on the individual Calendar (we'll stop passing it there; the menu component keeps `extraItems` support so Diary etc. are untouched).
- Reorder so `Rename` is the top item and `Color` sits right under it (already the case once Pin is removed).
- Add a new `Access` submenu entry, styled like `Color`, that opens a side panel on hover:
  - Empty state: "No coaches".
  - Otherwise: a list of the owner's accepted coaches (display name from `profiles`, falling back to email), each with a checkbox to the left. Toggling the checkbox grants/revokes access for that coach to this category.
  - Coach list is fetched once when the menu opens (lightweight, scoped to current user).

## 2. Database

New join table mapping a personal calendar category to a coach who has been granted access.

```text
calendar_category_coach_access
  id            uuid pk
  owner_id     uuid  -- the category owner (auth.uid())
  category_id   uuid -> calendar_categories(id) on delete cascade
  coach_user_id uuid -- references the accepted coach's user id
  created_at    timestamptz
  unique(category_id, coach_user_id)
```

RLS:
- Owner (`owner_id = auth.uid()`) can SELECT/INSERT/DELETE their own rows.
- A coach can SELECT rows where `coach_user_id = auth.uid()` (needed so the coach's client can filter categories/events client-side).

No changes to `user_coaches` or `calendar_categories`.

## 3. Coach-side filtering on Clients page

Only the Calendar sub-tab in `MemberWorkspace` is affected.

- Add a hook `useGrantedCategoryIds(ownerId)` that, when the viewer is not the owner, returns the set of `category_id`s the viewer has been granted access to (queries `calendar_category_coach_access` where `coach_user_id = auth.uid()` and joins on `owner_id = ownerId`).
- In `YearCalendarView`, when `memberId !== auth.uid()` (coach-on-client), filter the personal `me:` categories down to the granted set before rendering both:
  - the side-nav personal category list (if/when rendered for the clients view), and
  - the events shown in the grid (filter by category id / color mapping).
- Owner's own view is unchanged: they continue to see all of their own categories.
- Admin / `ind:` (built-in individual) / diary categories are unaffected by this filter — only user-defined `me:` categories are gated.

## Files

- `src/components/library/CategoryActionsMenu.tsx` — add an `accessPanel` prop (optional render slot) so we can mount an Access sub-menu in the same component.
- `src/components/calendar/MeCategorySection.tsx` — drop the `Pin to top` extra item, pass an `accessPanel` that lists coaches and toggles access; only enable this on the individual Calendar (not Diary or team scope).
- `src/hooks/useCoachAccessForCategory.ts` (new) — reads/writes the join rows for a given category.
- `src/hooks/useGrantedCategoryIds.ts` (new) — reads granted categories for the viewing coach.
- `src/components/team/MemberWorkspace.tsx` and/or `src/components/calendar/YearCalendarView.tsx` — apply the granted-category filter to events and (where applicable) the category list when the viewer is a coach.
- New Supabase migration creating `calendar_category_coach_access` with the RLS policies above.

## Out of scope

- Diary categories, Strava categories, admin/team categories.
- Reordering or visual restyle of the menu beyond removing Pin and adding Access.
- Surfacing access state in the Coaches settings page.
