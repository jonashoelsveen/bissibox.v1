import type {
  EntityAdministrator,
  EntityGroup,
  EntityMember,
  EntityMemberGroupRow,
} from "@/hooks/useEntityRoster";

export function personGroupIds(groups?: EntityMemberGroupRow[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const g of groups ?? []) {
    if (!g.groupId || seen.has(g.groupId)) continue;
    seen.add(g.groupId);
    ids.push(g.groupId);
  }
  return ids;
}

/** Live group names for a person — prefers current roster names over cached link labels. */
export function personGroupLabel(
  groups: EntityGroup[],
  links?: EntityMemberGroupRow[],
): string {
  const byId = new Map(groups.map((g) => [g.id, g.name]));
  return personGroupIds(links)
    .map((id) => byId.get(id) ?? links?.find((l) => l.groupId === id)?.name ?? "")
    .filter(Boolean)
    .join(", ");
}

export function personIsInGroup(
  links: EntityMemberGroupRow[] | undefined,
  groupId: string,
): boolean {
  return (links ?? []).some((g) => g.groupId === groupId);
}

/** Unique people (administrators + members) assigned to the group. */
export function countPeopleInGroup(
  groupId: string,
  admins: EntityAdministrator[],
  members: EntityMember[],
): number {
  return (
    admins.filter((a) => personIsInGroup(a.groups, groupId)).length +
    members.filter((m) => personIsInGroup(m.groups, groupId)).length
  );
}

export type FlatMemberRow = {
  id: string;
  name: string;
  surname: string;
  born: string;
  group: string;
};

function sortPeopleRows<T extends { name: string; surname: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const aKey = (a.surname || a.name).toLowerCase();
    const bKey = (b.surname || b.name).toLowerCase();
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

/** One row per person in the entity, with group names resolved from the live roster. */
export function buildFlatMemberRows(
  admins: EntityAdministrator[],
  members: EntityMember[],
  groups: EntityGroup[],
): FlatMemberRow[] {
  return sortPeopleRows([
    ...admins.map((a) => ({
      id: `admin:${a.id}`,
      name: a.name,
      surname: a.surname,
      born: a.born,
      group: personGroupLabel(groups, a.groups),
    })),
    ...members.map((m) => ({
      id: `member:${m.id}`,
      name: m.name,
      surname: m.surname,
      born: m.born,
      group: personGroupLabel(groups, m.groups),
    })),
  ]);
}
