/**
 * Entity page — Overview (roster) + Chart. Shares the global LeftPanel
 * chrome with Calendar/Home.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, X, MoreHorizontal } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { LeftPanel } from "@/components/LeftPanel";
import { useLibrarySetting } from "@/lib/library-settings";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_GROUP_COLOR,
  DEFAULT_GROUP_NAME,
  useEntityRoster,
  type EntityAdministrator,
  type EntityGroup,
  type EntityMember,
  type EntityMemberGroupRow,
} from "@/hooks/useEntityRoster";
import { AccountSegmentIsland } from "@/components/account/AccountSegmentIsland";
import { GroupMembersIcon } from "@/components/entity/GroupMembersIcon";
import { CategoryActionsMenu } from "@/components/library/CategoryActionsMenu";
import { useUserGroups } from "@/hooks/useUserGroups";
import {
  ColumnResizeHandle,
  columnWidthConfigs,
  ENTITY_TABLE_EDIT_COLUMN_WIDTH,
  entityTableEditIconInset,
  useTableColumnWidths,
} from "@/hooks/useTableColumnWidths";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { EntityOverviewTable, type OverviewSelectionSummary } from "@/components/entity/EntityOverviewTable";
import { EntityOrgChart } from "@/components/entity/EntityOrgChart";
import { EntityMemberRequestsTable } from "@/components/entity/EntityMemberRequestsTable";
import { EntityGroupsTable } from "@/components/entity/EntityGroupsTable";
import {
  EntitySearchInput,
  EntitySearchProvider,
  EntitySearchResults,
  EntitySearchToggle,
  useEntitySearch,
} from "@/components/entity/EntitySearch";
import { DeleteGroupMembersDialog } from "@/components/entity/DeleteGroupMembersDialog";
import { useEntityMembershipRequests } from "@/hooks/useEntityMembershipRequests";
import { memberGroupRowFromEntityGroup } from "@/lib/entityMemberMove";
import {
  accountFieldLabelStyle,
  HELVETICA_STACK,
} from "@/lib/cloud-landing-design";


const EntityGroupsContext = createContext<{
  groups: EntityGroup[];
} | null>(null);

function useEntityGroups() {
  const ctx = useContext(EntityGroupsContext);
  if (!ctx) throw new Error("EntityGroupsContext missing");
  return ctx;
}

type SectionKey = "groups" | "members" | "chart" | "requests";

/** Row checkbox: opaque fill so row hover does not bleed into the square. */
const ENTITY_ROW_CHECKBOX_CLASS =
  "h-3.5 w-3.5 cursor-pointer rounded-none border-hairline bg-white shadow-none hover:bg-white group-hover:bg-white data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary data-[state=checked]:group-hover:bg-primary";

interface ColumnDef<T> {
  key: keyof T;
  label: string;
  isDefault?: boolean;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function EntityPage() {
  const { user, activeEntityId } = useAuth();
  const navigate = useNavigate();
  const scope = user?.id ?? "anon";
  const teamId = activeEntityId;
  const roster = useEntityRoster(teamId);
  const membershipRequests = useEntityMembershipRequests(teamId);
  const { groups: userGroups } = useUserGroups();
  const entityName = userGroups.find((g) => g.id === teamId)?.name ?? "Entity";
  const [panelOpen, setPanelOpen] = useLibrarySetting<boolean>(
    `entity:panel:open:${scope}`,
    true,
  );
  const [section, setSection] = useState<SectionKey>("members");
  const [searchEditingAdmin, setSearchEditingAdmin] = useState<EntityAdministrator | null>(null);
  const [searchEditingMember, setSearchEditingMember] = useState<EntityMember | null>(null);

  useEffect(() => {
    if (!user) return;
    if (activeEntityId) return;
    void navigate({ to: "/calendar", replace: true });
  }, [user, activeEntityId, navigate]);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-muted-foreground">
        Sign in to manage your entity.
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-muted-foreground">
        Opening calendar…
      </div>
    );
  }

  return (
    <EntityGroupsContext.Provider value={{ groups: roster.groups }}>
      <EntitySearchProvider>
        <div className="h-full overflow-hidden bg-white">
          <EntitySearchToggle onEnsurePanelOpen={() => setPanelOpen(true)} />
          <EntitySearchInput />
          <LeftPanel open={panelOpen} onOpenChange={setPanelOpen}>
            <EntitySideNav
              active={section}
              onSelect={setSection}
              groups={roster.groups}
              admins={roster.admins}
              members={roster.members}
              pendingRequestCount={membershipRequests.pendingCount}
              onAddGroup={roster.addGroup}
              onSaveGroup={roster.saveGroup}
              onDeleteGroups={roster.deleteGroups}
              onReorderGroups={roster.reorderGroups}
              onRehomeGroupPeople={roster.rehomeGroupPeople}
              onEditAdmin={setSearchEditingAdmin}
              onEditMember={setSearchEditingMember}
            />
          </LeftPanel>

          <EntityMainClickDismiss>
            {roster.loading && roster.admins.length === 0 && roster.groups.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              <EntityMain
                section={section}
                roster={roster}
                entityName={entityName}
                membershipRequests={membershipRequests}
              />
            )}
            {(roster.error || membershipRequests.error) && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md border border-hairline bg-white px-3 py-1.5 text-xs text-[#B42318] shadow-sm">
                {roster.error || membershipRequests.error}
              </div>
            )}
          </EntityMainClickDismiss>

          <AdministratorModal
            open={!!searchEditingAdmin}
            onOpenChange={(v) => !v && setSearchEditingAdmin(null)}
            initial={searchEditingAdmin}
            onSave={async (row) => {
              const ok = await roster.saveAdministrator(row);
              if (ok) setSearchEditingAdmin(null);
            }}
          />
          <MemberModal
            open={!!searchEditingMember}
            onOpenChange={(v) => !v && setSearchEditingMember(null)}
            initial={searchEditingMember}
            onSave={async (row) => {
              const ok = await roster.saveMember(row);
              if (ok) setSearchEditingMember(null);
            }}
          />
        </div>
      </EntitySearchProvider>
    </EntityGroupsContext.Provider>
  );
}

/* ---------------- Side nav ---------------- */

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "groups", label: "Groups" },
  { key: "members", label: "Members" },
  { key: "chart", label: "Chart" },
  { key: "requests", label: "Member requests" },
];

function groupHasMembers(members: EntityMember[], groupId: string) {
  return members.some((m) => (m.groups ?? []).some((g) => g.groupId === groupId));
}

function EntityMainClickDismiss({ children }: { children: ReactNode }) {
  const search = useEntitySearch();
  return (
    <div
      className="relative h-full min-w-0 overflow-hidden"
      onClick={(event) => {
        if (!search.active) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (
          target.closest(
            '[role="dialog"], [data-radix-popper-content-wrapper], [data-radix-menu-content]',
          )
        ) {
          return;
        }
        search.setActive(false);
      }}
    >
      {children}
    </div>
  );
}

function EntitySideNav({
  active,
  onSelect,
  groups,
  admins,
  members,
  pendingRequestCount,
  onAddGroup,
  onSaveGroup,
  onDeleteGroups,
  onReorderGroups,
  onRehomeGroupPeople,
  onEditAdmin,
  onEditMember,
}: {
  active: SectionKey;
  onSelect: (k: SectionKey) => void;
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  pendingRequestCount: number;
  onAddGroup: (draft?: EntityGroup) => Promise<EntityGroup | null>;
  onSaveGroup: (row: EntityGroup) => Promise<EntityGroup | null>;
  onDeleteGroups: (ids: string[]) => Promise<boolean>;
  onReorderGroups: (next: EntityGroup[]) => Promise<boolean>;
  onRehomeGroupPeople: (fromGroupId: string, toGroupId: string | null) => Promise<boolean>;
  onEditAdmin: (row: EntityAdministrator) => void;
  onEditMember: (row: EntityMember) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<EntityGroup | null>(null);
  const search = useEntitySearch();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dragEnabled = groups.length > 1;

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

  const handleAddGroup = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault();
    event.stopPropagation();
    const draft: EntityGroup = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
              const n = (Math.random() * 16) | 0;
              const v = ch === "x" ? n : (n & 0x3) | 0x8;
              return v.toString(16);
            }),
      name: DEFAULT_GROUP_NAME,
      ageFrom: "",
      ageTo: "",
      color: DEFAULT_GROUP_COLOR,
    };
    void onAddGroup(draft);
    setRenamingId(draft.id);
    setRenameValue(draft.name);
  };

  const handleDelete = async (group: EntityGroup) => {
    if (groupHasMembers(members, group.id)) {
      setPendingDelete(group);
      return;
    }
    await onDeleteGroups([group.id]);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = groups.findIndex((g) => g.id === active.id);
    const to = groups.findIndex((g) => g.id === over.id);
    if (from < 0 || to < 0) return;
    void onReorderGroups(arrayMove(groups, from, to));
  };

  return (
    <div className="h-full overflow-y-auto pl-1.5 pr-2 pt-[48px]">
      {search.active ? (
        <EntitySearchResults
          groups={groups}
          admins={admins}
          members={members}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onCommitRename={(group) => void commitRename(group)}
          onCancelRename={(group) => {
            setRenamingId(null);
            setRenameValue(group.name);
          }}
          onRename={startRename}
          onDeleteGroup={(group) => void handleDelete(group)}
          onColorChange={(group, hex) => {
            void onSaveGroup({ ...group, color: hex });
          }}
          onEditAdmin={onEditAdmin}
          onEditMember={onEditMember}
        />
      ) : (
        <>
      <ul className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => {
          const isActive = active === s.key;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                className={
                  "flex h-8 w-full items-center rounded-md px-2 text-sm transition-colors " +
                  (isActive
                    ? "bg-secondary text-ink font-medium"
                    : "text-ink hover:bg-secondary/60")
                }
              >
                <span className="min-w-0 flex-1 truncate text-left">{s.label}</span>
                {s.key === "requests" && pendingRequestCount > 0 ? (
                  <span
                    className="ml-2 shrink-0 rounded-[3px] px-1.5 text-[11px] font-medium leading-4 text-ink"
                    style={{ backgroundColor: "#B8B8FF" }}
                  >
                    {pendingRequestCount}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-1">
        <div className="flex h-8 w-full items-center rounded-md px-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium text-ink">Groups</span>
          <button
            type="button"
            onClick={handleAddGroup}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Add group"
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-0.5 flex flex-col gap-0.5" style={{ overflow: "visible" }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              {groups.map((group) => (
                <GroupTab
                  key={group.id}
                  group={group}
                  sortable={dragEnabled && renamingId !== group.id}
                  renaming={renamingId === group.id}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onCommitRename={() => void commitRename(group)}
                  onCancelRename={() => {
                    setRenamingId(null);
                    setRenameValue(group.name);
                  }}
                  onRename={() => startRename(group)}
                  onDelete={() => void handleDelete(group)}
                  onColorChange={(hex) => {
                    void onSaveGroup({ ...group, color: hex });
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
        </>
      )}

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
    </div>
  );
}

function GroupTab({
  group,
  sortable,
  renaming,
  renameValue,
  setRenameValue,
  onCommitRename,
  onCancelRename,
  onRename,
  onDelete,
  onColorChange,
}: {
  group: EntityGroup;
  sortable: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRename: () => void;
  onDelete: () => void;
  onColorChange: (hex: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    disabled: !sortable || renaming,
    animateLayoutChanges: () => false,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging ? 50 : undefined,
    background: isDragging ? "#ffffff" : undefined,
    boxShadow: isDragging
      ? "0 1px 0 rgba(0,0,0,0.04), 0 10px 24px -10px rgba(0,0,0,0.25)"
      : undefined,
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const renameStartedAtRef = useRef(0);
  useEffect(() => {
    if (!renaming) return;
    renameStartedAtRef.current = Date.now();
    const focusAndMark = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    focusAndMark();
    const frame = requestAnimationFrame(focusAndMark);
    return () => cancelAnimationFrame(frame);
  }, [renaming]);

  const color = group.color || DEFAULT_GROUP_COLOR;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(renaming ? {} : listeners)}
      className={`group flex items-center gap-2 rounded-md px-2 py-1 text-xs text-ink transition-colors hover:bg-secondary/60 ${
        renaming ? "ring-1 ring-inset ring-hairline" : ""
      }`}
    >
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-hairline"
        style={{ background: color }}
      />
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => {
            if (Date.now() - renameStartedAtRef.current < 250) {
              requestAnimationFrame(() => inputRef.current?.focus());
              return;
            }
            onCommitRename();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            else if (e.key === "Escape") onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent outline-none"
          aria-label="Group name"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{group.name}</span>
      )}
      <CategoryActionsMenu
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 hover:bg-secondary hover:text-ink group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label="Group actions"
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        }
        currentColor={color}
        onColorChange={onColorChange}
        onRename={onRename}
        onDelete={onDelete}
      />
    </div>
  );
}

/* ---------------- Main content ---------------- */

function EntityMain({
  section,
  roster,
  entityName,
  membershipRequests,
}: {
  section: SectionKey;
  roster: ReturnType<typeof useEntityRoster>;
  entityName: string;
  membershipRequests: ReturnType<typeof useEntityMembershipRequests>;
}) {
  const [editingGroup, setEditingGroup] = useState<EntityGroup | null>(null);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {section === "groups" ? (
        <>
          <EntityGroupsTable
            groups={roster.groups}
            admins={roster.admins}
            members={roster.members}
            loading={roster.loading}
            onSaveGroup={roster.saveGroup}
            onDeleteGroups={roster.deleteGroups}
            onRehomeGroupPeople={roster.rehomeGroupPeople}
            onEditGroup={setEditingGroup}
          />
          <GroupModal
            open={!!editingGroup}
            onOpenChange={(open) => {
              if (!open) setEditingGroup(null);
            }}
            initial={editingGroup}
            onSave={async (row) => {
              const ok = await roster.saveGroup(row);
              if (ok) setEditingGroup(null);
            }}
          />
        </>
      ) : section === "members" ? (
        <OverviewTable
          groups={roster.groups}
          admins={roster.admins}
          members={roster.members}
          entityName={entityName}
          onSaveGroup={async (row) => !!(await roster.saveGroup(row))}
          onSaveAdministrator={roster.saveAdministrator}
          onInviteAdministrator={roster.inviteAdministrator}
          onSaveMember={roster.saveMember}
          onInviteMember={roster.inviteMember}
          onDeleteGroups={roster.deleteGroups}
          onDeleteAdministrators={roster.deleteAdministrators}
          onDeleteMembers={roster.deleteMembers}
          onReorderGroups={roster.reorderGroups}
          onMovePeopleToGroup={roster.movePeopleToGroup}
        />
      ) : section === "requests" ? (
        <EntityMemberRequestsTable
          requests={membershipRequests.requests}
          groups={roster.groups}
          loading={membershipRequests.loading}
          busyIds={membershipRequests.busyIds}
          onDecide={async (requestId, action, groupId) => {
            let resolvedGroupId = groupId;
            if (action === "accept" && groupId) {
              const group = roster.groups.find((g) => g.id === groupId);
              if (group && group.persisted === false) {
                const saved = await roster.saveGroup(group);
                if (!saved || saved.persisted === false) return;
                resolvedGroupId = saved.id;
              }
            }
            const result = await membershipRequests.decide(requestId, action, resolvedGroupId);
            if (result.ok && action === "accept") {
              await roster.reload();
            }
            return result;
          }}
        />
      ) : (
        <EntityChartPanel roster={roster} />
      )}
    </div>
  );
}

function EntityChartPanel({
  roster,
}: {
  roster: ReturnType<typeof useEntityRoster>;
}) {
  const [editingAdmin, setEditingAdmin] = useState<EntityAdministrator | null>(null);
  const [editingMember, setEditingMember] = useState<EntityMember | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="min-h-0 flex-1 overflow-hidden">
        <EntityOrgChart
          groups={roster.groups}
          admins={roster.admins}
          members={roster.members}
          onEditAdmin={setEditingAdmin}
          onEditMember={setEditingMember}
          onMovePeopleToGroup={roster.movePeopleToGroup}
        />
      </div>
      <AdministratorModal
        open={!!editingAdmin}
        onOpenChange={(v) => !v && setEditingAdmin(null)}
        initial={editingAdmin}
        onSave={async (row) => {
          const ok = await roster.saveAdministrator(row);
          if (ok) setEditingAdmin(null);
        }}
      />
      <MemberModal
        open={!!editingMember}
        onOpenChange={(v) => !v && setEditingMember(null)}
        initial={editingMember}
        onSave={async (row) => {
          const ok = await roster.saveMember(row);
          if (ok) setEditingMember(null);
        }}
      />
    </div>
  );
}

/** Matches Event Participants Apple search field height. */
const TABLE_TOOLBAR_CONTROL_SIZE = 44; // h-11

function OverviewTopBar({
  canDelete,
  onDelete,
}: {
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [plusOpen, setPlusOpen] = useState(false);
  const plusWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!plusWrapRef.current?.contains(e.target as Node)) setPlusOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [plusOpen]);

  const menuItems = [
    {
      key: "delete",
      label: "Delete",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: () => {
        setPlusOpen(false);
        onDelete();
      },
      disabled: !canDelete,
      destructive: true,
    },
  ];

  return (
    <div
      data-entity-keep-selection
      className="flex h-[68px] flex-none items-center gap-2 px-6"
    >
      <div ref={plusWrapRef} className="relative shrink-0">
        <button
          type="button"
          aria-label="Add"
          aria-haspopup="menu"
          aria-expanded={plusOpen}
          onClick={(e) => {
            e.stopPropagation();
            setPlusOpen((v) => !v);
          }}
          className={cn(
            "grid place-items-center rounded-[10px] bg-[#F2F2F7] text-[#8E8E93] transition-colors",
            "hover:bg-[#EBEBF0] hover:text-ink",
            plusOpen && "bg-[#EBEBF0] text-ink",
          )}
          style={{
            width: TABLE_TOOLBAR_CONTROL_SIZE,
            height: TABLE_TOOLBAR_CONTROL_SIZE,
          }}
        >
          <Plus className="h-[17px] w-[17px]" strokeWidth={2} />
        </button>
        {plusOpen ? (
          <div
            role="menu"
            className="absolute left-0 top-full z-40 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-ink/15 bg-card shadow-lg"
          >
            {menuItems.map((item) => (
              <div key={item.key}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={item.onClick}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition",
                    item.disabled
                      ? "cursor-not-allowed text-muted-foreground/50"
                      : item.destructive
                        ? "text-destructive hover:bg-secondary"
                        : "text-ink hover:bg-secondary",
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MacConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/25 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[60] w-[320px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[10px] bg-[#ECECEC] shadow-[0_12px_40px_rgba(0,0,0,0.28)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="px-5 pb-4 pt-5 text-center">
            <DialogPrimitive.Title className="font-sans text-sm font-medium leading-snug text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-[11px] leading-relaxed text-[#3C3C43]/80">
              {message}
            </DialogPrimitive.Description>
          </div>
          <div className="grid grid-cols-2 border-t border-black/10 bg-[#F5F5F7]/90">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="h-10 border-r border-black/10 text-[13px] font-normal text-ink transition-colors hover:bg-black/[0.04]"
              >
                Cancel
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              className="h-10 text-[13px] font-semibold text-[#FF3B30] transition-colors hover:bg-black/[0.04]"
            >
              {confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function buildInviteAdminRow(
  email: string,
  defaultGroup?: EntityGroup | null,
): EntityAdministrator {
  const groups = defaultGroup ? [memberGroupRowFromEntityGroup(defaultGroup)] : [];
  return {
    id: crypto.randomUUID(),
    name: "",
    surname: "",
    sex: "",
    born: "",
    email: email.trim(),
    phone: "",
    group: groups.map((g) => g.name).filter(Boolean).join(", "),
    status: "roster",
    groups,
  };
}

function buildInviteMemberRow(
  email: string,
  defaultGroup?: EntityGroup | null,
): EntityMember {
  const groups = defaultGroup ? [memberGroupRowFromEntityGroup(defaultGroup)] : [];
  return {
    id: crypto.randomUUID(),
    userId: null,
    name: "",
    surname: "",
    sex: "",
    born: "",
    email: email.trim(),
    phone: "",
    group: groups.map((g) => g.name).filter(Boolean).join(", "),
    paymentStatus: "",
    status: "roster",
    groups,
  };
}

function OverviewTable({
  groups,
  admins,
  members,
  entityName,
  onSaveGroup,
  onSaveAdministrator,
  onInviteAdministrator,
  onSaveMember,
  onInviteMember,
  onDeleteGroups,
  onDeleteAdministrators,
  onDeleteMembers,
  onReorderGroups,
  onMovePeopleToGroup,
}: {
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  entityName: string;
  onSaveGroup: (row: EntityGroup) => Promise<boolean>;
  onSaveAdministrator: (row: EntityAdministrator) => Promise<boolean>;
  onInviteAdministrator: (
    row: EntityAdministrator,
    options?: { withGroups?: boolean },
  ) => Promise<boolean>;
  onSaveMember: (row: EntityMember) => Promise<boolean>;
  onInviteMember: (
    row: EntityMember,
    options?: { withGroups?: boolean },
  ) => Promise<boolean>;
  onDeleteGroups: (ids: string[]) => Promise<boolean>;
  onDeleteAdministrators: (ids: string[]) => Promise<boolean>;
  onDeleteMembers: (ids: string[]) => Promise<boolean>;
  onReorderGroups: (next: EntityGroup[]) => Promise<boolean>;
  onMovePeopleToGroup: (rowIds: string[], targetGroupId: string) => Promise<boolean>;
}) {
  const [selection, setSelection] = useState<OverviewSelectionSummary>({
    count: 0,
    groupIds: [],
    adminIds: [],
    memberIds: [],
    singleGroup: null,
  });
  const [resetSelectionSignal, setResetSelectionSignal] = useState(0);
  const [createKey, setCreateKey] = useState(0);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [createMemberOpen, setCreateMemberOpen] = useState(false);
  const [defaultGroup, setDefaultGroup] = useState<EntityGroup | null>(null);
  const [editingGroup, setEditingGroup] = useState<EntityGroup | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<EntityAdministrator | null>(null);
  const [editingMember, setEditingMember] = useState<EntityMember | null>(null);
  const [deleteGroupsOpen, setDeleteGroupsOpen] = useState(false);
  const [deletePeopleOpen, setDeletePeopleOpen] = useState(false);
  const [deleteMixedOpen, setDeleteMixedOpen] = useState(false);

  const canAddGroup = selection.count === 0;
  const canAssignToSelectedGroup =
    selection.singleGroup !== null &&
    selection.groupIds.length === 1 &&
    selection.adminIds.length === 0 &&
    selection.memberIds.length === 0;
  const canAddAdmin = true;
  const canAddMember = true;
  const canDelete = selection.count > 0;

  const handleAddGroup = () => {
    if (!canAddGroup) return;
    setCreateKey((k) => k + 1);
    setCreateGroupOpen(true);
  };

  const handleAddAdmin = () => {
    setDefaultGroup(canAssignToSelectedGroup ? selection.singleGroup : null);
    setCreateKey((k) => k + 1);
    setCreateAdminOpen(true);
  };

  const handleAddMember = () => {
    setDefaultGroup(canAssignToSelectedGroup ? selection.singleGroup : null);
    setCreateKey((k) => k + 1);
    setCreateMemberOpen(true);
  };

  const handleDeleteClick = () => {
    if (!canDelete) return;
    if (selection.groupIds.length > 0 && selection.adminIds.length === 0 && selection.memberIds.length === 0) {
      setDeleteGroupsOpen(true);
    } else if (selection.groupIds.length === 0) {
      setDeletePeopleOpen(true);
    } else {
      setDeleteMixedOpen(true);
    }
  };

  const clearSelectionAfterDelete = () => {
    setResetSelectionSignal((n) => n + 1);
  };

  const confirmDeleteGroups = async () => {
    const ok = await onDeleteGroups(selection.groupIds);
    if (ok) clearSelectionAfterDelete();
  };

  const confirmDeletePeople = async () => {
    const [adminsOk, membersOk] = await Promise.all([
      selection.adminIds.length > 0
        ? onDeleteAdministrators(selection.adminIds)
        : Promise.resolve(true),
      selection.memberIds.length > 0
        ? onDeleteMembers(selection.memberIds)
        : Promise.resolve(true),
    ]);
    if (adminsOk && membersOk) clearSelectionAfterDelete();
  };

  const confirmDeleteMixed = async () => {
    const groupsOk = await onDeleteGroups(selection.groupIds);
    const adminsOk =
      selection.adminIds.length === 0
        ? true
        : await onDeleteAdministrators(selection.adminIds);
    const membersOk =
      selection.memberIds.length === 0 ? true : await onDeleteMembers(selection.memberIds);
    if (groupsOk && adminsOk && membersOk) clearSelectionAfterDelete();
  };

  const mixedDeleteTitle = "Delete selected items?";
  const mixedDeleteMessage = `This will delete ${selection.groupIds.length} group${selection.groupIds.length === 1 ? "" : "s"} and permanently remove ${selection.adminIds.length + selection.memberIds.length} administrator or member record${selection.adminIds.length + selection.memberIds.length === 1 ? "" : "s"}. This cannot be undone for people in the selection.`;

  const groupDeleteTitle =
    selection.groupIds.length === 1 ? "Delete group?" : `Delete ${selection.groupIds.length} groups?`;

  const selectedGroupNames = selection.groupIds
    .map((id) => groups.find((g) => g.id === id)?.name)
    .filter(Boolean);

  const groupDeleteMessage =
    selection.groupIds.length === 1
      ? `Are you sure you want to delete the group “${selectedGroupNames[0] ?? "this group"}”? Administrators and members will remain, but will no longer be linked to this group.`
      : `Are you sure you want to delete ${selection.groupIds.length} groups (${selectedGroupNames.join(", ")})? Administrators and members will remain, but will no longer be linked to these groups.`;

  const peopleCount = selection.adminIds.length + selection.memberIds.length;
  const peopleDeleteTitle =
    peopleCount === 1 ? "Delete item?" : `Delete ${peopleCount} items?`;

  const peopleDeleteMessage =
    peopleCount === 1
      ? "Are you sure you want to permanently delete the selected administrator or member? This action cannot be undone."
      : `Are you sure you want to permanently delete ${selection.adminIds.length > 0 ? `${selection.adminIds.length} administrator${selection.adminIds.length === 1 ? "" : "s"}` : ""}${selection.adminIds.length > 0 && selection.memberIds.length > 0 ? " and " : ""}${selection.memberIds.length > 0 ? `${selection.memberIds.length} member${selection.memberIds.length === 1 ? "" : "s"}` : ""}? This action cannot be undone.`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <OverviewTopBar
        canDelete={canDelete}
        onDelete={handleDeleteClick}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <EntityOverviewTable
          groups={groups}
          admins={admins}
          members={members}
          query=""
          onEditGroup={setEditingGroup}
          onEditAdmin={setEditingAdmin}
          onEditMember={setEditingMember}
          onSelectionChange={setSelection}
          resetSelectionSignal={resetSelectionSignal}
          onReorderGroups={onReorderGroups}
          onMovePeopleToGroup={onMovePeopleToGroup}
        />
      </div>
      <GroupModal
        key={`new-group-${createKey}`}
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        initial={null}
        onSave={async (row) => {
          const ok = await onSaveGroup(row);
          if (ok) setCreateGroupOpen(false);
        }}
      />
      <GroupModal
        open={!!editingGroup}
        onOpenChange={(v) => !v && setEditingGroup(null)}
        initial={editingGroup}
        onSave={async (row) => {
          const ok = await onSaveGroup(row);
          if (ok) setEditingGroup(null);
        }}
      />
      <InviteRosterModal
        key={`new-admin-${createKey}`}
        open={createAdminOpen}
        onOpenChange={(v) => {
          if (!v) setDefaultGroup(null);
          setCreateAdminOpen(v);
        }}
        role="admin"
        entityName={entityName}
        groupName={defaultGroup?.name ?? null}
        onInvite={async (email) => {
          const row = buildInviteAdminRow(email, defaultGroup);
          const ok = await onInviteAdministrator(row, { withGroups: !!defaultGroup });
          if (ok) {
            setCreateAdminOpen(false);
            setDefaultGroup(null);
          }
          return ok;
        }}
      />
      <AdministratorModal
        open={!!editingAdmin}
        onOpenChange={(v) => !v && setEditingAdmin(null)}
        initial={editingAdmin}
        onSave={async (row) => {
          const ok = await onSaveAdministrator(row);
          if (ok) setEditingAdmin(null);
        }}
      />
      <InviteRosterModal
        key={`new-member-${createKey}`}
        open={createMemberOpen}
        onOpenChange={(v) => {
          if (!v) setDefaultGroup(null);
          setCreateMemberOpen(v);
        }}
        role="member"
        entityName={entityName}
        groupName={defaultGroup?.name ?? null}
        onInvite={async (email) => {
          const row = buildInviteMemberRow(email, defaultGroup);
          const ok = await onInviteMember(row, { withGroups: !!defaultGroup });
          if (ok) {
            setCreateMemberOpen(false);
            setDefaultGroup(null);
          }
          return ok;
        }}
      />
      <MemberModal
        open={!!editingMember}
        onOpenChange={(v) => !v && setEditingMember(null)}
        initial={editingMember}
        onSave={async (row) => {
          const ok = await onSaveMember(row);
          if (ok) setEditingMember(null);
        }}
      />
      <MacConfirmDialog
        open={deleteGroupsOpen}
        onOpenChange={setDeleteGroupsOpen}
        title={groupDeleteTitle}
        message={groupDeleteMessage}
        onConfirm={() => void confirmDeleteGroups()}
      />
      <MacConfirmDialog
        open={deletePeopleOpen}
        onOpenChange={setDeletePeopleOpen}
        title={peopleDeleteTitle}
        message={peopleDeleteMessage}
        onConfirm={() => void confirmDeletePeople()}
      />
      <MacConfirmDialog
        open={deleteMixedOpen}
        onOpenChange={setDeleteMixedOpen}
        title={mixedDeleteTitle}
        message={mixedDeleteMessage}
        onConfirm={() => void confirmDeleteMixed()}
      />
    </div>
  );
}


/* ---------------- Generic Finder-style table ---------------- */

function FinderTable<T extends { id: string }>({
  tableId,
  rows,
  columns,
  defaultSortKey,
  onEdit,
  rowPending,
  emptyText,
  selected,
  onSelectedChange,
}: {
  tableId: string;
  rows: T[];
  columns: ColumnDef<T>[];
  defaultSortKey: keyof T;
  onEdit: (row: T) => void;
  rowPending?: (row: T) => boolean;
  emptyText: string;
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
}) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const widthConfigs = useMemo(() => columnWidthConfigs(columns), [columns]);
  const { isResizing, startResize, dataColumnsTemplate } = useTableColumnWidths(tableId, widthConfigs);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const handleHeader = (k: keyof T) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const allSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const someSelected = !allSelected && sorted.some((r) => selected.has(r.id));
  const toggleAll = (checked: boolean) => {
    onSelectedChange(checked ? new Set(sorted.map((r) => r.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  };

  const gridTemplate = `56px ${ENTITY_TABLE_EDIT_COLUMN_WIDTH}px ${dataColumnsTemplate} minmax(0, 2fr)`;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div
        className="grid h-8 flex-none items-stretch border-b border-hairline bg-transparent px-3 text-[12px] text-ink"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="flex items-center justify-start border-r border-hairline pl-5">
          <Checkbox
            className="h-3.5 w-3.5 rounded-none border-hairline shadow-none"
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) => toggleAll(v === true)}
            aria-label="Select all"
          />
        </div>
        {columns.map((c, i) => {
          const isSorted = sortKey === c.key;
          return (
            <div
              key={String(c.key)}
              style={i === 0 ? { gridColumn: "span 2" } : undefined}
              className="relative flex min-w-0 items-stretch border-r border-hairline"
            >
              <button
                type="button"
                onClick={() => handleHeader(c.key)}
                className={cn(
                  "flex min-w-0 flex-1 items-center pr-3 text-left",
                  i === 0 ? "pl-[44px]" : "px-3",
                  isSorted ? "font-semibold" : "font-normal",
                  !isResizing && "hover:bg-secondary/40",
                )}
              >
                <span className="truncate">{c.label}</span>
                {isSorted && (
                  <span className="ml-1 text-muted-foreground">
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </button>
              <ColumnResizeHandle
                label={c.label}
                onResizeStart={(event) => startResize(String(c.key), event)}
              />
            </div>
          );
        })}
        <div />

      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {sorted.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          sorted.map((row, idx) => {
            const isSelected = selected.has(row.id);
            return (
            <div
              key={row.id}
              className={cn(
                "group grid h-[22px] items-center rounded-md text-[12px] text-ink cursor-default select-none",
                isSelected
                  ? "bg-[#EAEAEC]"
                  : idx % 2 === 1
                    ? "bg-[#F5F5F7]"
                    : "bg-white",
                !isResizing && "transition-colors duration-75",
                isSelected ? "hover:bg-[#E0E0E4]" : "hover:bg-[#EAEAEC]",
              )}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="flex h-full items-center justify-start pl-5 rounded-l-md">
                <Checkbox
                  className={ENTITY_ROW_CHECKBOX_CLASS}
                  checked={selected.has(row.id)}
                  onCheckedChange={(v) => toggleOne(row.id, v === true)}
                  aria-label="Select row"
                />
              </div>
              <div
                className={cn(
                  "flex h-full items-center",
                  rowPending?.(row) ? "justify-start" : "justify-center",
                )}
                style={rowPending?.(row) ? { paddingLeft: entityTableEditIconInset() } : undefined}
              >
                {rowPending?.(row) ? (
                  <span className="whitespace-nowrap text-[11px] text-[#AEAEB2]">Pending</span>
                ) : (
                  <button
                    type="button"
                    aria-label="Edit"
                    onClick={() => onEdit(row)}
                    className="grid h-6 w-6 cursor-pointer place-items-center text-muted-foreground hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {columns.map((c) => (
                <div key={String(c.key)} className="truncate px-3">
                  {String(row[c.key] ?? "")}
                </div>
              ))}
              <div />
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------------- Sharp-edge modal shell ---------------- */

type ModalChromeVariant = "default" | "native" | "macos";

const ModalChromeContext = createContext<ModalChromeVariant>("default");

function useModalChrome(): ModalChromeVariant {
  return useContext(ModalChromeContext);
}

const PERSON_MODAL_BODY_HEIGHT = 440;

function SharpModal({
  open,
  onOpenChange,
  title,
  children,
  onCancel,
  onSave,
  saveLabel = "Save",
  saveDisabled,
  allowClickWhenDisabled = false,
  dirty,
  size = "md",
  variant = "default",
  subheader,
  bodyClassName,
  bodyStyle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  allowClickWhenDisabled?: boolean;
  /** When false, the macOS Save button stays grey until the form changes. */
  dirty?: boolean;
  size?: "md" | "lg";
  variant?: ModalChromeVariant;
  /** Optional strip directly under the title (e.g. About / Groups tabs). */
  subheader?: ReactNode;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
}) {
  const native = variant === "native";
  const macos = variant === "macos";
  const saveIdle = dirty === false;

  return (
    <ModalChromeContext.Provider value={variant}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 z-[210] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              macos || native ? "bg-black/25" : "bg-black/30",
            )}
          />
          <DialogPrimitive.Content
            onPointerDownOutside={(event) => {
              const t = event.target as Element | null;
              if (t?.closest?.("[data-entity-info-toast]")) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
            }}
            onInteractOutside={(event) => {
              const t = event.target as Element | null;
              if (t?.closest?.("[data-entity-info-toast]")) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
            }}
            onEscapeKeyDown={(event) => event.preventDefault()}
            className={cn(
              "fixed left-1/2 top-1/2 z-[211] flex -translate-x-1/2 -translate-y-1/2 flex-col",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              size === "lg" ? "w-[640px] max-w-[92vw]" : "w-[520px] max-w-[92vw]",
              macos
                ? "overflow-hidden rounded-[20px] border border-black/8 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
                : native
                  ? "overflow-hidden rounded-[14px] border border-black/10 bg-[#F5F5F7] shadow-[0_20px_50px_rgba(0,0,0,0.22)]"
                  : "border border-hairline bg-white shadow-xl",
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between gap-3 px-5",
                macos
                  ? "bg-white py-3.5"
                  : native
                    ? "border-b border-black/8 py-4"
                    : "border-b border-hairline py-3",
              )}
            >
              <DialogPrimitive.Title
                className={cn(
                  "min-w-0 flex-1 text-ink",
                  macos
                    ? "text-[17px] font-semibold leading-tight tracking-tight"
                    : native
                      ? "font-sans text-[13px] font-medium leading-snug tracking-normal"
                      : "font-sans text-sm font-semibold",
                )}
                style={macos ? { fontFamily: HELVETICA_STACK } : undefined}
              >
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className={cn(
                  "grid shrink-0 place-items-center transition-colors",
                  macos
                    ? "h-8 w-8 text-[#3C3C43] hover:text-ink"
                    : native
                      ? "h-7 w-7 rounded-lg text-muted-foreground hover:bg-black/[0.05] hover:text-ink"
                      : "h-6 w-6 text-muted-foreground hover:text-ink",
                )}
                aria-label="Close"
              >
                <X className={macos ? "h-6 w-6" : "h-4 w-4"} strokeWidth={macos ? 2.25 : 2} />
              </DialogPrimitive.Close>
            </div>
            {subheader ?? null}
            <div
              className={cn(
                "px-5",
                macos
                  ? "bg-white py-5"
                  : native
                    ? "py-4"
                    : "py-4",
                bodyClassName,
              )}
              style={bodyStyle}
            >
              {children}
            </div>
            <div
              className={cn(
                "flex items-center justify-end gap-2 px-4 py-3",
                macos
                  ? "bg-white"
                  : native
                    ? "border-t border-black/8 bg-[#F5F5F7]"
                    : "border-t border-hairline",
              )}
            >
              <button
                type="button"
                onClick={onCancel}
                className={cn(
                  "h-8 px-3.5 text-sm transition-colors",
                  macos
                    ? "rounded-[9px] bg-black/[0.06] font-medium text-ink hover:bg-black/[0.1]"
                    : native
                      ? "rounded-lg border border-black/10 bg-white text-ink hover:bg-black/[0.04]"
                      : "border border-hairline bg-white text-ink hover:bg-secondary",
                )}
                style={macos ? { fontFamily: HELVETICA_STACK } : undefined}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={(saveIdle || !!saveDisabled) && !allowClickWhenDisabled}
                className={cn(
                  "h-8 px-3.5 text-sm transition-colors",
                  saveIdle ? "disabled:opacity-100" : "disabled:opacity-40",
                  macos
                    ? saveIdle
                      ? "rounded-[9px] bg-[#c7c7cc] font-semibold text-white"
                      : "rounded-[9px] bg-ink font-semibold text-white hover:bg-ink/90"
                    : native
                      ? "rounded-lg bg-ink text-white hover:bg-ink/90"
                      : "bg-ink text-white hover:bg-ink/90",
                  saveDisabled && allowClickWhenDisabled && "opacity-40",
                )}
                style={macos ? { fontFamily: HELVETICA_STACK } : undefined}
              >
                {saveLabel}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </ModalChromeContext.Provider>
  );
}

function InviteRosterModal({
  open,
  onOpenChange,
  role,
  entityName,
  groupName,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: "admin" | "member";
  entityName: string;
  groupName?: string | null;
  onInvite: (email: string) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setEmail("");
  }, [open]);

  const roleLabel = role === "admin" ? "administrator" : "member";
  const title = groupName
    ? `Invite ${roleLabel} to join "${groupName}" in ${entityName}`
    : `Invite ${roleLabel} to join "${entityName}"`;

  const handleInvite = async () => {
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    const ok = await onInvite(email);
    setSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <SharpModal
      variant="native"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onCancel={() => onOpenChange(false)}
      onSave={handleInvite}
      saveLabel={submitting ? "Sending…" : "Invite"}
      saveDisabled={!email.trim() || submitting}
    >
      <div>
        <FieldLabel>Email</FieldLabel>
        <SharpInput
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleInvite();
          }}
        />
      </div>
    </SharpModal>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  const chrome = useModalChrome();
  if (chrome === "macos") {
    return (
      <div className="mb-1.5" style={accountFieldLabelStyle}>
        {children}
      </div>
    );
  }
  const native = chrome === "native";
  return (
    <label
      className={cn(
        "mb-1.5 block font-sans text-muted-foreground",
        native
          ? "text-[12px] font-normal tracking-normal"
          : "text-[11px] font-medium uppercase tracking-wide",
      )}
    >
      {children}
    </label>
  );
}

function AppleModalInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "account-field h-9 w-full rounded-[10px] border-0 bg-[#e5e5ea] px-3 text-[15px] text-ink",
        "placeholder:text-[#8E8E93] outline-none",
        props.className,
      )}
      style={{ fontFamily: HELVETICA_STACK, ...props.style }}
    />
  );
}

function AppleModalSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode },
) {
  const { children, className, ...rest } = props;
  return (
    <select
      {...rest}
      className={cn(
        "account-field h-9 w-full appearance-none rounded-[10px] border-0 bg-[#e5e5ea] px-3 text-[15px] text-ink outline-none",
        className,
      )}
      style={{ fontFamily: HELVETICA_STACK }}
    >
      {children}
    </select>
  );
}

function EntityContactFields({
  email,
  onEmailChange,
  phone,
  onPhoneChange,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
}) {
  const macos = useModalChrome() === "macos";
  return (
    <div className={macos ? "h-full overflow-y-auto p-1 [scrollbar-width:thin]" : undefined}>
      {!macos ? (
        <>
          <div className="my-4 border-t border-hairline" />
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink">
            Contact
          </div>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Email</FieldLabel>
          {macos ? (
            <AppleModalInput
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          ) : (
            <SharpInput
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          )}
        </div>
        <div>
          <FieldLabel>Phone</FieldLabel>
          {macos ? (
            <AppleModalInput
              type="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
            />
          ) : (
            <SharpInput
              type="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SharpInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const native = useModalChrome() === "native";
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full px-3 text-[13px] text-ink outline-none transition-colors",
        native
          ? "rounded-lg border border-black/10 bg-white focus:border-black/25 focus:ring-2 focus:ring-black/[0.06]"
          : "border border-hairline bg-secondary focus:border-ink",
        props.className,
      )}
    />
  );
}

function SharpSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode },
) {
  const { children, className, ...rest } = props;
  return (
    <select
      {...rest}
      className={cn(
        "h-9 w-full border border-hairline bg-secondary px-2 text-sm text-ink outline-none focus:border-ink",
        className,
      )}
    >
      {children}
    </select>
  );
}


const PERSON_GROUP_CHECK_PURPLE = "#AF52DE";

/** `crypto.randomUUID` throws outside secure contexts (e.g. http://LAN-IP). */
function newLocalId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function agentDebugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
  runId = "post-fix",
) {
  const payload = {
    sessionId: "e2f85e",
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  // #region agent log
  try {
    const w = window as Window & { __entityGroupDebug?: unknown[] };
    w.__entityGroupDebug = w.__entityGroupDebug ?? [];
    w.__entityGroupDebug.push(payload);
    if (w.__entityGroupDebug.length > 80) w.__entityGroupDebug.shift();
  } catch {
    /* ignore */
  }
  fetch("http://127.0.0.1:7661/ingest/ab29c1d2-1d52-4e88-a9e5-e4fdad817cad", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "e2f85e",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion
}

type PersonModalTab = "about" | "groups" | "contact";

function assignedGroupIds(rows: EntityMemberGroupRow[]): string[] {
  return rows
    .map((row) => row.groupId)
    .filter((id): id is string => !!id)
    .sort();
}

function personDraftDirty(
  draft: {
    name: string;
    surname: string;
    sex: string;
    born: string;
    email: string;
    phone: string;
    groups: EntityMemberGroupRow[];
  },
  initial: {
    name: string;
    surname: string;
    sex: string;
    born: string;
    email: string;
    phone: string;
    groups?: EntityMemberGroupRow[];
  },
): boolean {
  if (draft.name !== initial.name) return true;
  if (draft.surname !== initial.surname) return true;
  if (draft.sex !== initial.sex) return true;
  if (draft.born !== initial.born) return true;
  if (draft.email !== initial.email) return true;
  if (draft.phone !== initial.phone) return true;
  const nextIds = assignedGroupIds(draft.groups);
  const initialIds = assignedGroupIds(initial.groups ?? []);
  if (nextIds.length !== initialIds.length) return true;
  return nextIds.some((id, index) => id !== initialIds[index]);
}

const PERSON_MODAL_TABS: { id: PersonModalTab; label: string }[] = [
  { id: "about", label: "About" },
  { id: "groups", label: "Groups" },
  { id: "contact", label: "Contact" },
];

function PersonAboutForm({
  name,
  onNameChange,
  surname,
  onSurnameChange,
  sex,
  onSexChange,
  born,
  onBornChange,
  firstNameLabel = "First name",
}: {
  name: string;
  onNameChange: (v: string) => void;
  surname: string;
  onSurnameChange: (v: string) => void;
  sex: string;
  onSexChange: (v: string) => void;
  born: string;
  onBornChange: (v: string) => void;
  firstNameLabel?: string;
}) {
  return (
    <div className="h-full overflow-y-auto p-1 [scrollbar-width:thin]">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>{firstNameLabel}</FieldLabel>
          <AppleModalInput value={name} onChange={(e) => onNameChange(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Surname</FieldLabel>
          <AppleModalInput value={surname} onChange={(e) => onSurnameChange(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Sex</FieldLabel>
          <AppleModalSelect value={sex} onChange={(e) => onSexChange(e.target.value)}>
            <option value="">—</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </AppleModalSelect>
        </div>
        <div>
          <FieldLabel>Date of birth</FieldLabel>
          <AppleModalInput
            type="date"
            value={born}
            onChange={(e) => onBornChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function PersonModalTabPanel({
  tab,
  onTabChange,
  about,
  groups,
  contact,
}: {
  tab: PersonModalTab;
  onTabChange: (tab: PersonModalTab) => void;
  about: ReactNode;
  groups: ReactNode;
  contact: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AccountSegmentIsland
        ariaLabel="Person details"
        value={tab}
        onChange={onTabChange}
        options={PERSON_MODAL_TABS}
      />
      <div className="mt-5 min-h-0 flex-1">
        {tab === "about" ? about : null}
        {tab === "groups" ? groups : null}
        {tab === "contact" ? contact : null}
      </div>
    </div>
  );
}


function AdministratorModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: EntityAdministrator | null;
  onSave?: (row: EntityAdministrator) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [surname, setSurname] = useState(initial?.surname ?? "");
  const [sex, setSex] = useState(initial?.sex ?? "");
  const [born, setBorn] = useState(initial?.born ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [groups, setGroups] = useState<EntityMemberGroupRow[]>(initial?.groups ?? []);
  const [tab, setTab] = useState<PersonModalTab>("about");

  useEffect(() => {
    if (!open || !initial) return;
    // #region agent log
    agentDebugLog("B", "EntityPage.tsx:AdministratorModal.useEffect", "Admin modal reset from initial", {
      open,
      initialId: initial.id,
      groupCount: (initial.groups ?? []).length,
      groupIds: (initial.groups ?? []).map((g) => g.groupId),
    });
    // #endregion
    setName(initial.name);
    setSurname(initial.surname);
    setSex(initial.sex);
    setBorn(initial.born);
    setEmail(initial.email);
    setPhone(initial.phone);
    setGroups(initial.groups ?? []);
    setTab("about");
    // Only re-seed when the modal opens or the person changes — not when the
    // parent replaces the `initial` object identity (that wiped group ticks).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open, initial?.id]);

  const { groups: availableGroups } = useEntityGroups();

  if (!initial) return null;

  const title =
    `${initial.name} ${initial.surname}`.trim() || "Edit administrator";

  const buildRow = (): EntityAdministrator => ({
    id: initial.id,
    name,
    surname,
    sex,
    born,
    email,
    phone,
    status: initial.status,
    group: groups
      .filter((g) => g.groupId)
      .map((g) => g.name)
      .filter(Boolean)
      .join(", "),
    groups: groups.filter((g) => g.groupId),
  });

  return (
    <SharpModal
      variant="macos"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="lg"
      onCancel={() => onOpenChange(false)}
      onSave={() => onSave?.(buildRow())}
      saveDisabled={!name.trim() && !surname.trim()}
      dirty={personDraftDirty(
        { name, surname, sex, born, email, phone, groups },
        initial,
      )}
      bodyClassName="shrink-0 overflow-hidden"
      bodyStyle={{
        height: PERSON_MODAL_BODY_HEIGHT,
        minHeight: PERSON_MODAL_BODY_HEIGHT,
        maxHeight: PERSON_MODAL_BODY_HEIGHT,
      }}
    >
      <PersonModalTabPanel
        tab={tab}
        onTabChange={setTab}
        about={
          <PersonAboutForm
            name={name}
            onNameChange={setName}
            surname={surname}
            onSurnameChange={setSurname}
            sex={sex}
            onSexChange={setSex}
            born={born}
            onBornChange={setBorn}
            firstNameLabel="Firstname"
          />
        }
        groups={
          <MemberGroupsChecklist
            availableGroups={availableGroups}
            assigned={groups}
            onAssignedChange={(next) => {
              // #region agent log
              agentDebugLog("A", "EntityPage.tsx:AdministratorModal.setGroups", "admin groups state update", {
                nextIds: next.map((r) => r.groupId),
                nextLen: next.length,
              });
              // #endregion
              setGroups(next);
            }}
          />
        }
        contact={
          <EntityContactFields
            email={email}
            onEmailChange={setEmail}
            phone={phone}
            onPhoneChange={setPhone}
          />
        }
      />
    </SharpModal>
  );
}

/* ---------------- Shared info toast ---------------- */

function GroupModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: EntityGroup | null;
  onSave: (row: EntityGroup) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
    }
  }, [open, initial]);

  const isEdit = !!initial;
  const title = isEdit ? initial?.name || "Edit group" : "New group";

  return (
    <SharpModal
      variant="native"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onCancel={() => onOpenChange(false)}
      onSave={() =>
        onSave({
          id: initial?.id ?? crypto.randomUUID(),
          name,
          // Age bounds are no longer edited in the UI; preserve existing values.
          ageFrom: initial?.ageFrom ?? "",
          ageTo: initial?.ageTo ?? "",
          color: initial?.color ?? DEFAULT_GROUP_COLOR,
        })
      }
      saveDisabled={!name.trim()}
    >
      <div className="max-w-[320px]">
        <label className="mb-1.5 block text-[13px] font-medium text-ink/80">
          Group name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className={cn(
            "h-10 w-full rounded-[10px] border-0 bg-[#F2F2F7] px-3.5 text-[15px] text-ink",
            "placeholder:text-[#8E8E93] outline-none",
            "focus:bg-[#EBEBF0] focus:ring-0",
          )}
        />
      </div>
    </SharpModal>
  );
}


function MemberModal({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: EntityMember | null;
  onSave?: (row: EntityMember) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [surname, setSurname] = useState(initial?.surname ?? "");
  const [sex, setSex] = useState(initial?.sex ?? "");
  const [born, setBorn] = useState(initial?.born ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [groups, setGroups] = useState<EntityMemberGroupRow[]>(initial?.groups ?? []);
  const [tab, setTab] = useState<PersonModalTab>("about");

  useEffect(() => {
    if (!open || !initial) return;
    // #region agent log
    agentDebugLog("B", "EntityPage.tsx:MemberModal.useEffect", "Member modal reset from initial", {
      open,
      initialId: initial.id,
      groupCount: (initial.groups ?? []).length,
      groupIds: (initial.groups ?? []).map((g) => g.groupId),
    });
    // #endregion
    setName(initial.name);
    setSurname(initial.surname);
    setSex(initial.sex);
    setBorn(initial.born);
    setEmail(initial.email);
    setPhone(initial.phone);
    setGroups(initial.groups ?? []);
    setTab("about");
    // Only re-seed when the modal opens or the person changes — not when the
    // parent replaces the `initial` object identity (that wiped group ticks).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [open, initial?.id]);

  const { groups: availableGroups } = useEntityGroups();

  if (!initial) return null;

  const title = `${initial.name} ${initial.surname}`.trim() || "Edit member";

  const buildRow = (): EntityMember => ({
    id: initial.id,
    userId: initial.userId,
    name,
    surname,
    sex,
    born,
    email,
    phone,
    group: groups
      .filter((g) => g.groupId)
      .map((g) => g.name)
      .filter(Boolean)
      .join(", "),
    paymentStatus: initial.paymentStatus,
    status: initial.status,
    groups: groups.filter((g) => g.groupId),
  });

  return (
    <SharpModal
      variant="macos"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="lg"
      onCancel={() => onOpenChange(false)}
      onSave={() => onSave?.(buildRow())}
      saveDisabled={!name.trim() && !surname.trim()}
      dirty={personDraftDirty(
        { name, surname, sex, born, email, phone, groups },
        initial,
      )}
      bodyClassName="shrink-0 overflow-hidden"
      bodyStyle={{
        height: PERSON_MODAL_BODY_HEIGHT,
        minHeight: PERSON_MODAL_BODY_HEIGHT,
        maxHeight: PERSON_MODAL_BODY_HEIGHT,
      }}
    >
      <PersonModalTabPanel
        tab={tab}
        onTabChange={setTab}
        about={
          <PersonAboutForm
            name={name}
            onNameChange={setName}
            surname={surname}
            onSurnameChange={setSurname}
            sex={sex}
            onSexChange={setSex}
            born={born}
            onBornChange={setBorn}
          />
        }
        groups={
          <MemberGroupsChecklist
            availableGroups={availableGroups}
            assigned={groups}
            onAssignedChange={(next) => {
              // #region agent log
              agentDebugLog("A", "EntityPage.tsx:MemberModal.setGroups", "member groups state update", {
                nextIds: next.map((r) => r.groupId),
                nextLen: next.length,
              });
              // #endregion
              setGroups(next);
            }}
          />
        }
        contact={
          <EntityContactFields
            email={email}
            onEmailChange={setEmail}
            phone={phone}
            onPhoneChange={setPhone}
          />
        }
      />
    </SharpModal>
  );
}


function MemberGroupsChecklist({
  availableGroups,
  assigned,
  onAssignedChange,
}: {
  availableGroups: EntityGroup[];
  assigned: EntityMemberGroupRow[];
  onAssignedChange: (next: EntityMemberGroupRow[]) => void;
}) {
  const assignedByGroupId = useMemo(() => {
    const map = new Map<string, EntityMemberGroupRow>();
    for (const row of assigned) {
      if (row.groupId) map.set(row.groupId, row);
    }
    return map;
  }, [assigned]);

  const sortedGroups = useMemo(
    () => [...availableGroups].sort((a, b) => a.name.localeCompare(b.name)),
    [availableGroups],
  );

  // #region agent log
  agentDebugLog("E", "EntityPage.tsx:MemberGroupsChecklist.render", "Groups checklist render", {
    availableCount: sortedGroups.length,
    availableIds: sortedGroups.map((g) => g.id),
    assignedCount: assigned.length,
    assignedGroupIds: assigned.map((r) => r.groupId),
    selectedCount: sortedGroups.filter((g) => assignedByGroupId.has(g.id)).length,
  });
  // #endregion

  const toggleGroup = (group: EntityGroup) => {
    // #region agent log
    agentDebugLog("A", "EntityPage.tsx:toggleGroup:enter", "toggleGroup entered", {
      groupId: group.id,
      groupName: group.name,
      wasSelected: assignedByGroupId.has(group.id),
      hasRandomUUID:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function",
      isSecureContext:
        typeof window !== "undefined" ? window.isSecureContext : null,
    });
    // #endregion
    try {
      const wasSelected = assignedByGroupId.has(group.id);
      const next = wasSelected
        ? assigned.filter((r) => r.groupId !== group.id)
        : [
            ...assigned.filter((r) => r.groupId),
            {
              id: newLocalId(),
              groupId: group.id,
              name: group.name,
              ageFrom: group.ageFrom,
              ageTo: group.ageTo,
            },
          ];
      // #region agent log
      agentDebugLog("A", "EntityPage.tsx:toggleGroup", "toggleGroup calling onAssignedChange", {
        groupId: group.id,
        groupName: group.name,
        wasSelected,
        nextAssignedIds: next.map((r) => r.groupId),
        assignedLenBefore: assigned.length,
        nextLen: next.length,
      });
      // #endregion
      onAssignedChange(next);
    } catch (err) {
      // #region agent log
      agentDebugLog("A", "EntityPage.tsx:toggleGroup:error", "toggleGroup threw", {
        groupId: group.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // #endregion
      throw err;
    }
  };

  if (sortedGroups.length === 0) {
    // #region agent log
    agentDebugLog("C", "EntityPage.tsx:MemberGroupsChecklist.empty", "No available groups to show", {
      availableGroupsLen: availableGroups.length,
    });
    // #endregion
    return (
      <div className="flex h-full flex-col">
        <div
          className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-[13px] text-[#8E8E93]"
          style={{ fontFamily: HELVETICA_STACK }}
        >
          No groups yet. Create a group from the Groups page to assign this person.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto [scrollbar-width:thin]">
      <div className="flex flex-col">
          {sortedGroups.map((group, index) => {
            const isSelected = assignedByGroupId.has(group.id);
            const label = group.name.trim() || "Untitled group";
            return (
              <label
                key={group.id}
                className={cn(
                  "mb-px flex h-[28px] w-full cursor-pointer select-none items-center gap-2 rounded-md px-3 text-[12px] text-ink transition-colors duration-75",
                  index % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
                  !isSelected && "hover:bg-[#EAEAEC]",
                )}
                style={
                  isSelected
                    ? { backgroundColor: "rgba(175, 82, 222, 0.12)" }
                    : undefined
                }
              >
                {/* Native checkbox — accentColor paints purple without Tailwind/Radix fights.
                    onChange is the only toggle path (label click activates the input once). */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  aria-label={`Assign to ${label}`}
                  onChange={() => {
                    // #region agent log
                    agentDebugLog("D", "EntityPage.tsx:groupRow.onChange", "group checkbox changed", {
                      groupId: group.id,
                      isSelectedBefore: isSelected,
                    });
                    // #endregion
                    toggleGroup(group);
                  }}
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-none"
                  style={{ accentColor: PERSON_GROUP_CHECK_PURPLE }}
                />
                <GroupMembersIcon />
                <span className="min-w-0 truncate font-medium">{label}</span>
              </label>
            );
          })}
        </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function filterRows<T>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    Object.values(r as Record<string, unknown>).some((v) =>
      String(v ?? "").toLowerCase().includes(q),
    ),
  );
}
