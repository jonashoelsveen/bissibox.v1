import { useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DEFAULT_GROUP_COLOR,
  DEFAULT_GROUP_NAME,
  type EntityAdministrator,
  type EntityGroup,
  type EntityMember,
} from "@/hooks/useEntityRoster";
import { countPeopleInGroup } from "@/lib/entityRosterDisplay";
import { EntitySimpleDataTable } from "@/components/entity/EntitySimpleDataTable";
import { DeleteGroupMembersDialog } from "@/components/entity/DeleteGroupMembersDialog";
import { CategoryActionsMenu } from "@/components/library/CategoryActionsMenu";

const GROUP_COLUMNS = [
  { key: "name", label: "Names", defaultWidth: 220, minWidth: 120, maxWidth: 420 },
  { key: "membercount", label: "Membercount", defaultWidth: 140, minWidth: 96, maxWidth: 240 },
] as const;

type GroupRow = {
  id: string;
  name: string;
  membercount: string;
  group: EntityGroup;
};

/** Same periwinkle folder as entity Table (overview) group rows. */
function PeriwinkleFolderIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
      <path
        d="M1.5 3.25C1.5 2.56 2.06 2 2.75 2h3.05l1.2 1.2h6.25c.69 0 1.25.56 1.25 1.25v7.3c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V3.25Z"
        fill="#8E8CF0"
      />
      <path
        d="M1.5 4.75h13v6.05c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V4.75Z"
        fill="#A5A3F5"
      />
    </svg>
  );
}

export function EntityGroupsTable({
  groups,
  admins,
  members,
  loading,
  onSaveGroup,
  onDeleteGroups,
  onRehomeGroupPeople,
}: {
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  loading?: boolean;
  onSaveGroup: (row: EntityGroup) => Promise<EntityGroup | null>;
  onDeleteGroups: (ids: string[]) => Promise<boolean>;
  onRehomeGroupPeople: (fromGroupId: string, toGroupId: string | null) => Promise<boolean>;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<EntityGroup | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameStartedAtRef = useRef(0);

  useEffect(() => {
    if (!renamingId) return;
    renameStartedAtRef.current = Date.now();
    const focusAndMark = () => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    };
    focusAndMark();
    const frame = requestAnimationFrame(focusAndMark);
    return () => cancelAnimationFrame(frame);
  }, [renamingId]);

  const rows = useMemo<GroupRow[]>(
    () =>
      groups.map((group) => ({
        id: group.id,
        name: group.name,
        membercount: String(countPeopleInGroup(group.id, admins, members)),
        group,
      })),
    [groups, admins, members],
  );

  const startRename = (group: EntityGroup) => {
    setTimeout(() => {
      setRenamingId(group.id);
      setRenameValue(group.name);
    }, 50);
  };

  const commitRename = async (group: EntityGroup) => {
    const next = renameValue.trim() || DEFAULT_GROUP_NAME;
    setRenamingId(null);
    if (next === group.name && group.persisted !== false) return;
    await onSaveGroup({ ...group, name: next });
  };

  const handleDelete = async (group: EntityGroup) => {
    if (countPeopleInGroup(group.id, admins, members) > 0) {
      setPendingDelete(group);
      return;
    }
    await onDeleteGroups([group.id]);
  };

  return (
    <>
      <EntitySimpleDataTable
        tableId="entity-groups"
        columns={GROUP_COLUMNS}
        rows={rows}
        loading={loading}
        emptyText="No groups."
        getCell={(row, key) => {
          if (key === "name") {
            const renaming = renamingId === row.id;
            return (
              <span className="flex min-w-0 cursor-default items-center gap-1">
                <PeriwinkleFolderIcon />
                {renaming ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (Date.now() - renameStartedAtRef.current < 250) {
                        requestAnimationFrame(() => renameInputRef.current?.focus());
                        return;
                      }
                      void commitRename(row.group);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(row.group);
                      else if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue(row.group.name);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="min-w-0 flex-1 cursor-text bg-transparent text-[12px] outline-none"
                    aria-label="Group name"
                  />
                ) : (
                  <span className="truncate">{row.name}</span>
                )}
              </span>
            );
          }
          return <span className="truncate">{row.membercount}</span>;
        }}
        renderRowEnd={(row) => {
          const color = row.group.color || DEFAULT_GROUP_COLOR;
          return (
            <CategoryActionsMenu
              trigger={
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="grid h-6 w-6 cursor-pointer place-items-center text-muted-foreground hover:text-ink"
                  aria-label="Group actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              }
              currentColor={color}
              onColorChange={(hex) => {
                void onSaveGroup({ ...row.group, color: hex });
              }}
              onRename={() => startRename(row.group)}
              onDelete={() => void handleDelete(row.group)}
            />
          );
        }}
      />
      <DeleteGroupMembersDialog
        open={!!pendingDelete}
        group={pendingDelete}
        otherGroups={groups.filter((g) => g.id !== pendingDelete?.id)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={async (toGroupId) => {
          if (!pendingDelete) return false;
          const ok = await onRehomeGroupPeople(pendingDelete.id, toGroupId);
          if (ok) setPendingDelete(null);
          return ok;
        }}
      />
    </>
  );
}
