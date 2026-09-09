/**
 * Finder-style move of selected Overview/Chart person rows between groups.
 * Moves selected row instances: remove source group links, ensure target.
 */

import type {
  EntityAdministrator,
  EntityGroup,
  EntityMember,
  EntityMemberGroupRow,
} from "@/hooks/useEntityRoster";

export const ENTITY_PEOPLE_DRAG_TYPE = "entity-people" as const;

export type EntityPeopleDragData = {
  type: typeof ENTITY_PEOPLE_DRAG_TYPE;
  rowIds: string[];
};

export type ParsedPersonRowId = {
  kind: "admin" | "member";
  personId: string;
  /** null when the row is under the ungrouped section */
  fromGroupId: string | null;
};

export type PersonGroupMove = {
  kind: "admin" | "member";
  personId: string;
  fromGroupIds: Set<string | null>;
};

export function isEntityPeopleDragData(data: unknown): data is EntityPeopleDragData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.type === ENTITY_PEOPLE_DRAG_TYPE && Array.isArray(d.rowIds);
}

export function dropGroupId(groupId: string): string {
  return `drop-group:${groupId}`;
}

export function parseDropGroupId(id: string | number | null | undefined): string | null {
  if (id == null) return null;
  const s = String(id);
  if (!s.startsWith("drop-group:")) return null;
  return s.slice("drop-group:".length) || null;
}

/** Parse Overview/Chart person row ids: admin|member:{groupId|ungrouped}:{personId} */
export function parsePersonRowId(id: string): ParsedPersonRowId | null {
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const kind = parts[0];
  if (kind !== "admin" && kind !== "member") return null;
  const fromRaw = parts[1];
  const personId = parts.slice(2).join(":");
  if (!personId) return null;
  if (fromRaw === "ungrouped" || fromRaw === "") {
    return { kind, personId, fromGroupId: null };
  }
  return { kind, personId, fromGroupId: fromRaw };
}

export function collectMovesFromSelection(
  selectedIds: Iterable<string>,
): PersonGroupMove[] {
  const byKey = new Map<string, PersonGroupMove>();
  for (const id of selectedIds) {
    const parsed = parsePersonRowId(id);
    if (!parsed) continue;
    const key = `${parsed.kind}:${parsed.personId}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        kind: parsed.kind,
        personId: parsed.personId,
        fromGroupIds: new Set(),
      };
      byKey.set(key, entry);
    }
    entry.fromGroupIds.add(parsed.fromGroupId);
  }
  return [...byKey.values()];
}

export function memberGroupRowFromEntityGroup(
  group: EntityGroup,
): EntityMemberGroupRow {
  return {
    // Stable per group so realtime DELETE/INSERT can match by identity
    // even before the DB junction row id is known.
    id: `local:${group.id}`,
    groupId: group.id,
    name: group.name,
    ageFrom: group.ageFrom,
    ageTo: group.ageTo,
  };
}

export function applyPersonGroupMove({
  groups,
  fromGroupIds,
  targetGroup,
}: {
  groups: EntityMemberGroupRow[] | undefined;
  fromGroupIds: Set<string | null>;
  targetGroup: EntityGroup;
}): EntityMemberGroupRow[] {
  const current = groups ?? [];
  const removeIds = new Set(
    [...fromGroupIds].filter((id): id is string => typeof id === "string" && !!id),
  );

  const next = current.filter((g) => {
    if (!g.groupId) return true;
    if (removeIds.has(g.groupId)) return false;
    return true;
  });

  const alreadyInTarget = next.some((g) => g.groupId === targetGroup.id);
  if (!alreadyInTarget) {
    next.push(memberGroupRowFromEntityGroup(targetGroup));
  }

  return next;
}

function groupsEqual(
  a: EntityMemberGroupRow[] | undefined,
  b: EntityMemberGroupRow[],
): boolean {
  const aIds = new Set((a ?? []).map((g) => g.groupId).filter(Boolean));
  const bIds = new Set(b.map((g) => g.groupId).filter(Boolean));
  if (aIds.size !== bIds.size) return false;
  for (const id of aIds) {
    if (!bIds.has(id)) return false;
  }
  return true;
}

export function personGroupSetsEqual(
  a: EntityMemberGroupRow[] | undefined,
  b: EntityMemberGroupRow[],
): boolean {
  return groupsEqual(a, b);
}

export function personRowIdsForSelection(
  selectedIds: Iterable<string>,
): string[] {
  const out: string[] = [];
  for (const id of selectedIds) {
    if (parsePersonRowId(id)) out.push(id);
  }
  return out;
}

/** True when every selected instance already belongs to the target group. */
export function isNoOpPeopleDrop(
  rowIds: string[],
  targetGroupId: string,
): boolean {
  if (rowIds.length === 0) return true;
  return rowIds.every((id) => {
    const parsed = parsePersonRowId(id);
    return !!parsed && parsed.fromGroupId === targetGroupId;
  });
}

/** True when this row instance already lives in the given group. */
export function isPersonRowAlreadyInGroup(
  rowId: string,
  groupId: string,
): boolean {
  const parsed = parsePersonRowId(rowId);
  return !!parsed && parsed.fromGroupId === groupId;
}

export function personIdentityKey(rowId: string): string | null {
  const parsed = parsePersonRowId(rowId);
  return parsed ? `${parsed.kind}:${parsed.personId}` : null;
}

/**
 * Apply moves and persist via save callbacks. Returns true if all saves
 * succeeded (or there was nothing to do).
 */
export async function movePeopleToGroup({
  rowIds,
  targetGroupId,
  groups,
  admins,
  members,
  saveAdministrator,
  saveMember,
  patchPersonGroups,
}: {
  rowIds: string[];
  targetGroupId: string;
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  saveAdministrator: (row: EntityAdministrator) => Promise<boolean>;
  saveMember: (row: EntityMember) => Promise<boolean>;
  patchPersonGroups?: (
    kind: "admin" | "member",
    personId: string,
    nextGroups: EntityMemberGroupRow[],
  ) => void;
}): Promise<{ ok: boolean; moved: boolean }> {
  const targetGroup = groups.find((g) => g.id === targetGroupId);
  if (!targetGroup) return { ok: false, moved: false };

  const moves = collectMovesFromSelection(rowIds);
  if (moves.length === 0) return { ok: true, moved: false };

  let moved = false;
  for (const move of moves) {
    if (move.kind === "admin") {
      const admin = admins.find((a) => a.id === move.personId);
      if (!admin) continue;
      const nextGroups = applyPersonGroupMove({
        groups: admin.groups,
        fromGroupIds: move.fromGroupIds,
        targetGroup,
      });
      if (groupsEqual(admin.groups, nextGroups)) continue;
      moved = true;
      // Optimistic UI first so the row leaves the source group immediately.
      patchPersonGroups?.(move.kind, move.personId, nextGroups);
      const ok = await saveAdministrator({
        ...admin,
        groups: nextGroups,
        group: nextGroups.map((g) => g.name).filter(Boolean).join(", "),
      });
      if (!ok) return { ok: false, moved };
    } else {
      const member = members.find((m) => m.id === move.personId);
      if (!member) continue;
      const nextGroups = applyPersonGroupMove({
        groups: member.groups,
        fromGroupIds: move.fromGroupIds,
        targetGroup,
      });
      if (groupsEqual(member.groups, nextGroups)) continue;
      moved = true;
      patchPersonGroups?.(move.kind, move.personId, nextGroups);
      const ok = await saveMember({
        ...member,
        groups: nextGroups,
        group: nextGroups.map((g) => g.name).filter(Boolean).join(", "),
      });
      if (!ok) return { ok: false, moved };
    }
  }

  return { ok: true, moved };
}
