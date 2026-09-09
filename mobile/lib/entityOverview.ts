import type { TeamAdmin, TeamGroup, TeamGroupLink, TeamInviteMember } from "@/hooks/useTeams";

export type OverviewRowKind = "group" | "admin" | "member";

export interface OverviewRow {
  id: string;
  kind: OverviewRowKind;
  groupId: string;
  label: string;
  sublabel?: string;
  status?: string;
  groupRef?: TeamGroup;
  adminRef?: TeamAdmin;
  memberRef?: TeamInviteMember;
}

export function rosterPersonLabel(
  row: Pick<TeamInviteMember | TeamAdmin, "first_name" | "last_name" | "email">,
  fallback = "Unnamed",
): string {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  const email = row.email?.trim();
  if (email) return email;
  return fallback;
}

function normalizeSearchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function personMatchesSearch(
  row: Pick<TeamInviteMember | TeamAdmin, "first_name" | "last_name" | "email">,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const haystack = [
    row.first_name,
    row.last_name,
    row.email,
    rosterPersonLabel(row),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterRosterPeople<T extends TeamAdmin | TeamInviteMember>(
  rows: T[],
  searchQuery: string,
): T[] {
  const tokens = normalizeSearchTokens(searchQuery);
  return rows.filter((row) => personMatchesSearch(row, tokens));
}

function adminsForGroup(admin: TeamAdmin, groupId: string): boolean {
  if (admin.groups?.some((g) => g.groupId === groupId)) return true;
  return false;
}

function membersForGroup(member: TeamInviteMember, groupId: string): boolean {
  if (member.groups?.some((g) => g.groupId === groupId)) return true;
  if (member.app_group_id === groupId) return true;
  return false;
}

export function filterAdminsByGroup(admins: TeamAdmin[], groupId: string | null): TeamAdmin[] {
  if (!groupId) return admins;
  return admins.filter((admin) => adminsForGroup(admin, groupId));
}

export function filterMembersByGroup(members: TeamInviteMember[], groupId: string | null): TeamInviteMember[] {
  if (!groupId) return members;
  return members.filter((member) => membersForGroup(member, groupId));
}

function sortPeople<T extends { first_name?: string | null; last_name?: string | null; email?: string | null }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    const aKey = (a.last_name || a.first_name || a.email || "").toLowerCase();
    const bKey = (b.last_name || b.first_name || b.email || "").toLowerCase();
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return (a.first_name || "").toLowerCase().localeCompare((b.first_name || "").toLowerCase());
  });
}

function rowMatchesQuery(row: OverviewRow, q: string): boolean {
  return (
    row.label.toLowerCase().includes(q) ||
    (row.sublabel?.toLowerCase().includes(q) ?? false)
  );
}

export function buildOverviewBlocks(
  groups: TeamGroup[],
  admins: TeamAdmin[],
  members: TeamInviteMember[],
  expanded: Set<string>,
  query: string,
  groupFilter: string | null,
): { groupRow: OverviewRow; childRows: OverviewRow[] }[] {
  const q = query.trim().toLowerCase();
  const visibleGroups = groupFilter
    ? groups.filter((g) => g.id === groupFilter)
    : groups;

  const blocks: { groupRow: OverviewRow; childRows: OverviewRow[] }[] = [];

  for (const group of visibleGroups) {
    const groupRow: OverviewRow = {
      id: `group:${group.id}`,
      kind: "group",
      groupId: group.id,
      label: group.name,
      groupRef: group,
    };

    const childRows: OverviewRow[] = [];
    const groupAdmins = sortPeople(admins.filter((a) => adminsForGroup(a, group.id)));
    for (const admin of groupAdmins) {
      childRows.push({
        id: `admin:${group.id}:${admin.id}`,
        kind: "admin",
        groupId: group.id,
        label: rosterPersonLabel(admin, "Administrator"),
        status: admin.status,
        adminRef: admin,
      });
    }
    const groupMembers = sortPeople(members.filter((m) => membersForGroup(m, group.id)));
    for (const member of groupMembers) {
      childRows.push({
        id: `member:${group.id}:${member.id}`,
        kind: "member",
        groupId: group.id,
        label: rosterPersonLabel(member),
        status: member.status,
        memberRef: member,
      });
    }

    const visibleChildRows = expanded.has(group.id) ? childRows : [];

    if (!q) {
      blocks.push({ groupRow, childRows: visibleChildRows });
      continue;
    }

    const groupMatches = rowMatchesQuery(groupRow, q);
    const matchingChildren = childRows.filter((r) => rowMatchesQuery(r, q));

    if (groupMatches || matchingChildren.length > 0) {
      blocks.push({
        groupRow,
        childRows: groupMatches ? childRows : matchingChildren,
      });
    }
  }

  return blocks;
}

/** Flat admin + member rows for the All tab (no group folder rows). */
export function buildAllTabRows(
  _groups: TeamGroup[],
  admins: TeamAdmin[],
  members: TeamInviteMember[],
  query: string,
  groupFilter: string | null,
): OverviewRow[] {
  const q = query.trim().toLowerCase();
  const rows: OverviewRow[] = [];

  const primaryGroupId = (person: TeamAdmin | TeamInviteMember): string =>
    person.groups.find((g) => g.groupId)?.groupId ??
    ("app_group_id" in person ? person.app_group_id : null) ??
    "";

  for (const admin of sortPeople(filterAdminsByGroup(admins, groupFilter))) {
    rows.push({
      id: `admin:${admin.id}`,
      kind: "admin",
      groupId: primaryGroupId(admin),
      label: rosterPersonLabel(admin, "Administrator"),
      status: admin.status,
      adminRef: admin,
    });
  }

  for (const member of sortPeople(filterMembersByGroup(members, groupFilter))) {
    rows.push({
      id: `member:${member.id}`,
      kind: "member",
      groupId: primaryGroupId(member),
      label: rosterPersonLabel(member),
      status: member.status,
      memberRef: member,
    });
  }

  if (!q) return rows;
  return rows.filter((row) => rowMatchesQuery(row, q));
}

export function groupLinksFromLegacy(
  appGroupId: string | null | undefined,
  groupById: Map<string, TeamGroup>,
  rowId: string,
): TeamGroupLink[] {
  if (!appGroupId) return [];
  const group = groupById.get(appGroupId);
  return [
    {
      id: `legacy:${rowId}:${appGroupId}`,
      groupId: appGroupId,
      name: group?.name ?? "",
      ageFrom: group?.age_from != null ? String(group.age_from) : "",
      ageTo: group?.age_to != null ? String(group.age_to) : "",
    },
  ];
}
