import { useMemo } from "react";
import type { EntityAdministrator, EntityGroup, EntityMember } from "@/hooks/useEntityRoster";
import { buildFlatMemberRows } from "@/lib/entityRosterDisplay";
import { EntitySimpleDataTable } from "@/components/entity/EntitySimpleDataTable";

const MEMBER_COLUMNS = [
  { key: "name", label: "Name", defaultWidth: 180, minWidth: 120, maxWidth: 360 },
  { key: "surname", label: "Surname", defaultWidth: 132, minWidth: 96, maxWidth: 240 },
  { key: "born", label: "Born", defaultWidth: 112, minWidth: 96, maxWidth: 180 },
  { key: "group", label: "Group", defaultWidth: 160, minWidth: 96, maxWidth: 320 },
] as const;

/** Same filled user silhouette as entity Overview table and Chart person rows. */
function OverviewUserIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 shrink-0">
      <circle cx="8" cy="3.85" r="3.1" fill={color} />
      <path
        d="M3.15 13.35A4.85 4.85 0 0 1 12.85 13.35L12.85 14H3.15v-.65Z"
        fill={color}
      />
    </svg>
  );
}

export function EntityMembersTable({
  groups,
  admins,
  members,
  loading,
}: {
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  loading?: boolean;
}) {
  const rows = useMemo(
    () => buildFlatMemberRows(admins, members, groups),
    [admins, members, groups],
  );

  return (
    <EntitySimpleDataTable
      tableId="entity-members"
      columns={MEMBER_COLUMNS}
      rows={rows}
      loading={loading}
      emptyText="No members."
      getCell={(row, key) => {
        if (key === "name") {
          return (
            <span className="flex min-w-0 cursor-default items-center gap-1">
              <OverviewUserIcon color="#AEAEB2" />
              <span className="truncate">{row.name}</span>
            </span>
          );
        }
        if (key === "surname") return row.surname;
        if (key === "born") return row.born;
        return row.group;
      }}
    />
  );
}
