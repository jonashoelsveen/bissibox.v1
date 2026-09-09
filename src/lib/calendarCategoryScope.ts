import type { UserCategory } from "@/hooks/useUserCategories";

/** Resolve team / owner scope from a calendar id (`user:…`, `team:…`, `client:…`). */
export function calendarScopeFromCalId(calId: string): {
  teamId: string | null;
  ownerId: string | null;
} {
  if (calId.startsWith("team:")) return { teamId: calId.slice(5), ownerId: null };
  if (calId.startsWith("user:")) return { teamId: null, ownerId: calId.slice(5) };
  if (calId.startsWith("client:")) return { teamId: null, ownerId: calId.slice(7) };
  return { teamId: null, ownerId: null };
}

/** Categories shown in one left-panel section (Me, team header, or group). */
export function sidebarSectionCategories(
  categories: UserCategory[],
  opts: { teamId?: string | null; groupId?: string | null },
): UserCategory[] {
  if (!opts.teamId) return categories;
  if (opts.groupId) return categories.filter((c) => c.app_group_id === opts.groupId);
  return categories.filter((c) => !c.app_group_id);
}

/**
 * Union of every activity tab rendered in the calendar left panel for the
 * active calendar scope. Excludes orphan group-scoped rows whose group no
 * longer exists in the roster.
 */
export function sidebarAllCategories(
  categories: UserCategory[],
  opts: { teamId?: string | null; groupIds?: string[] },
): UserCategory[] {
  if (!opts.teamId) return categories;
  const groupSet = new Set(opts.groupIds ?? []);
  return categories.filter((c) => {
    if (!c.app_group_id) return true;
    if (groupSet.size === 0) return false;
    return groupSet.has(c.app_group_id);
  });
}
