
# Aponna Cloud Settings — page conversion

## 1. Top tab bar

`src/components/GlobalTopTabBar.tsx`
- Add a new entry in the Apps menu between `aponnacloud.com` and `account.aponna.com` rows:
  - Label: **Aponna Cloud settings**
  - Icon: `Settings` (lucide) in the same muted style as the other two entries
  - Click → `navigate({ to: "/settings" })` and close the menu
- Render the apps menu in both the logged-out home variant and the dark logged-in variant (currently only the home variant renders it; the dark bar's apps menu is in `NavIconTabs`). I will add the new row to wherever the existing aponnacloud.com / account.aponna.com rows live (verified at edit time).

`src/components/ProfileMenuButton.tsx`
- Remove the **Settings** and **Change profile** entries from the dropdown.
- Keep only: profile name (top, opens profile modal) and **Log out**.
- Remove the `open-settings` dispatch and related handler.

`src/components/SettingsModal.tsx`
- Delete (no longer used). Remove its mount from `__root.tsx` / wherever it is rendered.

## 2. New `/settings` page

`src/routes/settings.tsx` — full rewrite of the page shell, reusing the existing tab content components from the current `SettingsView`.

### Layout
- Same global top tab bar (unchanged).
- Below it: a left side panel matching `CalendarSideNav` / `DiarySideNav` / photos side nav exactly — same width, same collapse/expand chevron at top, tabs starting one level under it.
- Main content area on the right with a **sticky top frozen bar** (white, matching photos page) showing the active tab's name on the left. No back arrow — that pattern is reserved for sub-views like the Strava "Read more".
- Content area uses the same scrollbar style as calendar/diary/photos.
- Remove the global **Save** button and **Create entity** button entirely. Each panel keeps its own inline save behavior where it already exists (e.g. CoachesPanel); otherwise edits autosave or are saved per-field as today.

### Left panel structure

```
[collapse/expand chevron]

Account

────────────────

▾ Me                          (collapsible header, calendar-category style)
   Calendar                   (only if user has the app/role)
   Diary
   Photos
   Profile
   Coaches
   Connectors
   System
   Appearance

▾ {Other profile name}        (one collapsible group per other entity the user owns/belongs to)
   — if admin role:
     About
     Profile
     Calendar
     Organization
   — if coach role:
     Clients
   — if photographer role:
     Photos
   System
   Appearance

────────────────

Sign out
```

- Each "Me" / other-profile group is a collapsible header with the same drop-down arrow style as calendar categories.
- Tab text uses the calendar tab font/size/black color; active tab gets the same active-state styling as calendar tabs.
- Selecting a tab under an "other profile" group implicitly switches `activeEntityId` (via `useAuth().setActiveEntity`) so the existing entity-scoped panels render correctly.

### Tab → existing-component mapping

Reuse the JSX blocks currently in `SettingsView` for each tab:

| New tab | Existing tab key |
|---|---|
| Account | `account` |
| Me → Calendar | `calendar` |
| Me → Diary | `diary` |
| Me → Photos | `library` (current photos/library tab) |
| Me → Profile | personal profile block from `profiles` tab |
| Me → Coaches | `coaches` |
| Me → Connectors | `connectors` |
| Me → System | `system` |
| Me → Appearance | `appearance` |
| Other → About | `entity-general` |
| Other → Profile | `entity-profile` |
| Other → Calendar | `entity-calendar` |
| Other → Organization | `entity-organization` |
| Other → Clients | (reuse coaches/clients UI from entity context; if not present, render a placeholder header "Clients" with the existing members list from `entity-organization`) |
| Other → Photos | `entity-library` |
| Other → System | new — same controls as personal `system`, scoped to entity preferences |
| Other → Appearance | new — same controls as personal `appearance`, scoped to entity preferences |

Note: "System" and "Appearance" already exist for the personal profile. The spec says every profile gets its own System/Appearance; for entity-scoped versions I will render the same control set, persisting under the entity's settings key. If existing per-entity persistence isn't wired, I'll fall back to the existing global keys and add a TODO note in code.

### Sub-view back arrows
- Only sub-views like Strava "Read more" inside Connectors keep their back arrow. Top-level tabs do not show one.

## 3. Files touched

- `src/components/GlobalTopTabBar.tsx` — add menu row (both variants)
- `src/components/ProfileMenuButton.tsx` — strip to profile name + log out
- `src/components/SettingsModal.tsx` — delete
- `src/routes/__root.tsx` — remove `<SettingsModal />` mount
- `src/routes/settings.tsx` — rewrite shell, keep panel content components
- (possibly) extract the long per-tab JSX from current `SettingsView` into smaller `Panel*` components in `src/components/settings/` so the new shell stays readable

## 4. Open questions

These I will resolve while implementing unless you object:
1. **Role detection** for which sub-tabs to show under each "other profile" group — I will use the existing `entity_type` plus `useViewerRole` / `roles` already loaded for `profileEntities` in the current settings code. If a user is admin of a team, that team's group shows About/Profile/Calendar/Organization; coach → Clients; photographer → Photos.
2. **Entity-scoped System/Appearance persistence** — see note above; will reuse global keys with a TODO if entity-scoped keys aren't already present.
3. **"Me → Photos" visibility** — shown whenever the user has the photographer/photos app enabled, else hidden. If unclear, shown by default.
