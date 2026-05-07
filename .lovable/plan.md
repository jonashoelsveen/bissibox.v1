# Group Members — Navigation + Page Scaffold

This first iteration adds the nav entry and a new page route, gated to group leaders. The full member-browsing UI (member search, per-member Calendar/Diary/Library panel) will be built in follow-up iterations on top of this scaffold.

## Scope of this step

1. **Left main menu icon (group leaders only)**
   - In `src/components/Chrome.tsx`, add a new `NavBtn` near the existing "Group meetings" leader-only entry.
   - Visible only when `user && isOrganizer && isGroupLeader` (same gate as Group meetings).
   - Icon: `UsersRound` from `lucide-react` (distinct from the existing `Users` "Members" icon).
   - Label: "Group members". Links to `/team/group-members`.

2. **New route `/team/group-members`**
   - Create `src/routes/team.group-members.tsx` mirroring the structure of `src/routes/team.group-meetings.tsx`.
   - Component: `GroupMembersPage` from a new `src/components/team/GroupMembersPage.tsx`.

3. **Page scaffold `GroupMembersPage`**
   - Reuses the diary page layout pattern (left side nav with search + member list, main content area with tabs).
   - For now: render a left side nav with a search input and an empty/"coming soon" member list, plus a main area placeholder reading "Select a member to view their data".
   - No data fetching wired yet — the team_group_leaders → group → members query, the per-member tab strip, and the right-side Calendar/Diary/Library panel will land in the next iteration once this scaffold is approved.

## Files touched

- `src/components/Chrome.tsx` — add leader-only nav button.
- `src/routes/team.group-members.tsx` — new route file.
- `src/components/team/GroupMembersPage.tsx` — new page component (scaffold only).

## Out of scope (next iterations)

- Querying the leader's group and listing real members.
- Opening members as horizontal tabs.
- Right-side panel with Helvetica name header, divider, and Calendar/Diary/Library sub-tabs.
- Filtering categories to "Training" only on the Calendar sub-tab.
- Read-only Library media viewer with cross-to-close.
- Access-grant logic.
