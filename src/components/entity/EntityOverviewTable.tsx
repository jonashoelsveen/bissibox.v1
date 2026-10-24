/**
 * Entity Overview — macOS Finder-style hierarchical table: groups,
 * administrators and members nested inside each group.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { useLibrarySetting } from "@/lib/library-settings";
import { useAuth } from "@/lib/auth";
import {
  type EntityAdministrator,
  type EntityGroup,
  type EntityMember,
} from "@/hooks/useEntityRoster";
import {
  ColumnResizeHandle,
  columnWidthConfigs,
  ENTITY_TABLE_EDIT_COLUMN_WIDTH,
  entityTableEditIconInset,
  useTableColumnWidths,
} from "@/hooks/useTableColumnWidths";
import {
  isNoOpPeopleDrop,
  parsePersonRowId,
} from "@/lib/entityMemberMove";
import { useEntityPeoplePointerDrag } from "@/lib/useEntityPeoplePointerDrag";
import { cn } from "@/lib/utils";
import { GroupMembersIcon } from "@/components/entity/GroupMembersIcon";

const SELECTION_PURPLE = "#AF52DE";
/** Finder-style hairline between consecutive selected rows — inset only, no layout shift. */
const SELECTION_GAP_SHADOW = "inset 0 0.5px 0 0 rgba(255,255,255,0.28)";
const DROP_BLINK_MS = 420;

function overviewRowSelectionClass({
  isSelected,
  rowIndex,
  isDragging,
}: {
  isSelected: boolean;
  rowIndex: number;
  isDragging?: boolean;
}): string {
  if (isDragging) return "rounded-md text-ink";
  if (isSelected) return "overflow-hidden rounded-md text-white";
  return cn(
    "rounded-md text-ink",
    rowIndex % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
  );
}

function overviewRowSelectionStyle({
  isSelected,
  selectionGapAbove,
  isDragging,
  isHolding,
}: {
  isSelected: boolean;
  selectionGapAbove?: boolean;
  isDragging?: boolean;
  isHolding?: boolean;
}): CSSProperties | undefined {
  if (isDragging || isHolding) return undefined;
  if (!isSelected) return undefined;
  return {
    backgroundColor: SELECTION_PURPLE,
    boxShadow: selectionGapAbove ? SELECTION_GAP_SHADOW : undefined,
  };
}

const ENTITY_OVERVIEW_ROW_CLASS = "cursor-default select-none";

const OVERVIEW_COLUMNS = [
  { key: "name", label: "Name", defaultWidth: 180, minWidth: 120, maxWidth: 360 },
  { key: "surname", label: "Surname", defaultWidth: 132, minWidth: 96, maxWidth: 240 },
  { key: "born", label: "Born", defaultWidth: 112, minWidth: 96, maxWidth: 180 },
  { key: "group", label: "Group", defaultWidth: 160, minWidth: 96, maxWidth: 320 },
] as const;

type OverviewRowKind = "group" | "admin" | "member";

interface OverviewRow {
  id: string;
  kind: OverviewRowKind;
  groupId: string;
  name: string;
  surname: string;
  born: string;
  group: string;
  groupRef?: EntityGroup;
  adminRef?: EntityAdministrator;
  memberRef?: EntityMember;
}

/** Filled user silhouette: circle head + semicircle upper body. */
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

function sortPeople<T extends { name: string; surname: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const aKey = (a.surname || a.name).toLowerCase();
    const bKey = (b.surname || b.name).toLowerCase();
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

function rowMatchesQuery(row: OverviewRow, q: string): boolean {
  return (
    row.name.toLowerCase().includes(q) ||
    row.surname.toLowerCase().includes(q) ||
    row.born.toLowerCase().includes(q) ||
    row.group.toLowerCase().includes(q)
  );
}

function personHasGroupLinks(groups: EntityAdministrator["groups"] | EntityMember["groups"]): boolean {
  return (groups ?? []).some((g) => !!g.groupId);
}

function buildUngroupedRows(
  admins: EntityAdministrator[],
  members: EntityMember[],
  query: string,
): OverviewRow[] {
  const q = query.trim().toLowerCase();
  const rows: OverviewRow[] = [];

  for (const admin of sortPeople(admins.filter((a) => !personHasGroupLinks(a.groups)))) {
    const row: OverviewRow = {
      id: `admin:ungrouped:${admin.id}`,
      kind: "admin",
      groupId: "",
      name: admin.name,
      surname: admin.surname,
      born: admin.born,
      group: "",
      adminRef: admin,
    };
    if (!q || rowMatchesQuery(row, q)) rows.push(row);
  }

  for (const member of sortPeople(members.filter((m) => !personHasGroupLinks(m.groups)))) {
    const row: OverviewRow = {
      id: `member:ungrouped:${member.id}`,
      kind: "member",
      groupId: "",
      name: member.name,
      surname: member.surname,
      born: member.born,
      group: "",
      memberRef: member,
    };
    if (!q || rowMatchesQuery(row, q)) rows.push(row);
  }

  return rows;
}

function buildOverviewBlocks(
  groups: EntityGroup[],
  admins: EntityAdministrator[],
  members: EntityMember[],
  expanded: Set<string>,
  query: string,
): { blocks: { groupRow: OverviewRow; childRows: OverviewRow[] }[]; ungroupedRows: OverviewRow[] } {
  const q = query.trim().toLowerCase();

  const adminsByGroup = new Map<string, EntityAdministrator[]>();
  for (const admin of admins) {
    for (const link of admin.groups ?? []) {
      if (!link.groupId) continue;
      const list = adminsByGroup.get(link.groupId) ?? [];
      if (!list.some((a) => a.id === admin.id)) list.push(admin);
      adminsByGroup.set(link.groupId, list);
    }
  }

  const membersByGroup = new Map<string, EntityMember[]>();
  for (const member of members) {
    for (const link of member.groups ?? []) {
      if (!link.groupId) continue;
      const list = membersByGroup.get(link.groupId) ?? [];
      if (!list.some((m) => m.id === member.id)) list.push(member);
      membersByGroup.set(link.groupId, list);
    }
  }

  const buildChildRows = (group: EntityGroup): OverviewRow[] => {
    const childRows: OverviewRow[] = [];
    const groupAdmins = sortPeople(adminsByGroup.get(group.id) ?? []);
    for (const admin of groupAdmins) {
      childRows.push({
        id: `admin:${group.id}:${admin.id}`,
        kind: "admin",
        groupId: group.id,
        name: admin.name,
        surname: admin.surname,
        born: admin.born,
        group: group.name,
        adminRef: admin,
      });
    }
    const groupMembers = sortPeople(membersByGroup.get(group.id) ?? []);
    for (const member of groupMembers) {
      childRows.push({
        id: `member:${group.id}:${member.id}`,
        kind: "member",
        groupId: group.id,
        name: member.name,
        surname: member.surname,
        born: member.born,
        group: group.name,
        memberRef: member,
      });
    }
    return childRows;
  };

  const blocks: { groupRow: OverviewRow; childRows: OverviewRow[] }[] = [];

  for (const group of groups) {
    const groupRow: OverviewRow = {
      id: `group:${group.id}`,
      kind: "group",
      groupId: group.id,
      name: group.name,
      surname: "",
      born: "",
      group: group.name,
      groupRef: group,
    };

    const allChildRows = buildChildRows(group);
    const visibleChildRows = expanded.has(group.id) ? allChildRows : [];

    if (!q) {
      blocks.push({ groupRow, childRows: visibleChildRows });
      continue;
    }

    const groupMatches = rowMatchesQuery(groupRow, q);
    const matchingChildren = allChildRows.filter((r) => rowMatchesQuery(r, q));

    if (groupMatches || matchingChildren.length > 0) {
      blocks.push({
        groupRow,
        childRows: groupMatches ? allChildRows : matchingChildren,
      });
    }
  }

  return {
    blocks,
    ungroupedRows: buildUngroupedRows(admins, members, query),
  };
}

export interface OverviewSelectionSummary {
  count: number;
  groupIds: string[];
  adminIds: string[];
  memberIds: string[];
  singleGroup: EntityGroup | null;
}

const EMPTY_OVERVIEW_SELECTION: OverviewSelectionSummary = {
  count: 0,
  groupIds: [],
  adminIds: [],
  memberIds: [],
  singleGroup: null,
};

function summarizeOverviewSelection(
  selected: Set<string>,
  visibleRows: OverviewRow[],
): OverviewSelectionSummary {
  if (selected.size === 0) return EMPTY_OVERVIEW_SELECTION;

  const rowById = new Map(visibleRows.map((r) => [r.id, r]));
  const groupIds: string[] = [];
  const adminIds = new Set<string>();
  const memberIds = new Set<string>();

  for (const id of selected) {
    const row = rowById.get(id);
    if (!row) continue;
    if (row.kind === "group" && row.groupRef) {
      groupIds.push(row.groupRef.id);
    } else if (row.kind === "admin" && row.adminRef) {
      adminIds.add(row.adminRef.id);
    } else if (row.kind === "member" && row.memberRef) {
      memberIds.add(row.memberRef.id);
    }
  }

  const singleGroup =
    groupIds.length === 1
      ? (visibleRows.find((r) => r.kind === "group" && r.groupRef?.id === groupIds[0])?.groupRef ??
        null)
      : null;

  return {
    count: selected.size,
    groupIds,
    adminIds: [...adminIds],
    memberIds: [...memberIds],
    singleGroup,
  };
}

export function EntityOverviewTable({
  groups,
  admins,
  members,
  query,
  onEditGroup,
  onEditAdmin,
  onEditMember,
  onSelectionChange,
  onReorderGroups,
  onMovePeopleToGroup,
  resetSelectionSignal = 0,
}: {
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  query: string;
  onEditGroup: (row: EntityGroup) => void;
  onEditAdmin: (row: EntityAdministrator) => void;
  onEditMember: (row: EntityMember) => void;
  onSelectionChange: (summary: OverviewSelectionSummary) => void;
  onReorderGroups: (next: EntityGroup[]) => Promise<boolean>;
  onMovePeopleToGroup: (rowIds: string[], targetGroupId: string) => Promise<boolean>;
  resetSelectionSignal?: number;
}) {
  const { user } = useAuth();
  const scope = user?.id ?? "anon";
  const [expandedRaw, setExpandedRaw] = useLibrarySetting<string[]>(
    `entity:overview:expanded:${scope}`,
    [],
  );
  const expanded = useMemo(() => new Set(expandedRaw), [expandedRaw]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectionAnchorRef = useRef<string | null>(null);
  const [localGroups, setLocalGroups] = useState(groups);
  const [blinkGroupId, setBlinkGroupId] = useState<string | null>(null);
  const blinkTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  useEffect(() => {
    return () => {
      if (blinkTimerRef.current != null) window.clearTimeout(blinkTimerRef.current);
    };
  }, []);

  const widthConfigs = useMemo(() => columnWidthConfigs([...OVERVIEW_COLUMNS]), []);
  const { isResizing, startResize, dataColumnsTemplate } = useTableColumnWidths(
    "entity-overview",
    widthConfigs,
  );

  const toggleExpanded = (groupId: string) => {
    const next = new Set(expandedRaw);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setExpandedRaw([...next]);
  };

  const q = query.trim().toLowerCase();
  const dragEnabled = !q && localGroups.length > 1;

  const triggerBlink = (groupId: string) => {
    if (blinkTimerRef.current != null) window.clearTimeout(blinkTimerRef.current);
    setBlinkGroupId(groupId);
    blinkTimerRef.current = window.setTimeout(() => {
      setBlinkGroupId(null);
      blinkTimerRef.current = null;
    }, DROP_BLINK_MS);
  };

  const commitPeopleMove = useCallback(
    (rowIds: string[], targetGroupId: string) => {
      if (rowIds.length === 0 || isNoOpPeopleDrop(rowIds, targetGroupId)) return;
      const expandList = expanded.has(targetGroupId)
        ? null
        : [...expandedRaw, targetGroupId];
      void (async () => {
        const ok = await onMovePeopleToGroup(rowIds, targetGroupId);
        if (!ok) return;
        triggerBlink(targetGroupId);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of rowIds) next.delete(id);
          for (const id of rowIds) {
            const parsed = parsePersonRowId(id);
            if (!parsed) continue;
            next.add(`${parsed.kind}:${targetGroupId}:${parsed.personId}`);
          }
          return next;
        });
        if (expandList) setExpandedRaw(expandList);
      })();
    },
    [expanded, expandedRaw, onMovePeopleToGroup, setExpandedRaw],
  );

  const { drag, draggingIds: peopleDragIds, overGroupId: dropOverGroupId, beginDrag } =
    useEntityPeoplePointerDrag({
      selected,
      onMove: commitPeopleMove,
    });

  const peopleDragActive = peopleDragIds != null;

  // Expand destination only after a successful move (commitPeopleMove).
  // Expanding mid-drag remounts rows, fires pointercancel, and used to
  // wipe the drag payload before onMove could run.

  const { blocks, ungroupedRows } = useMemo(
    () => buildOverviewBlocks(localGroups, admins, members, expanded, query),
    [localGroups, admins, members, expanded, query],
  );

  const visibleRows = useMemo(
    () => [...blocks.flatMap((block) => [block.groupRow, ...block.childRows]), ...ungroupedRows],
    [blocks, ungroupedRows],
  );

  const orderedRowIds = useMemo(
    () => visibleRows.map((r) => r.id),
    [visibleRows],
  );

  const applyFinderSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && selectionAnchorRef.current) {
        const from = orderedRowIds.indexOf(selectionAnchorRef.current);
        const to = orderedRowIds.indexOf(id);
        if (from >= 0 && to >= 0) {
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const next = new Set(orderedRowIds.slice(lo, hi + 1));
          selectedRef.current = next;
          setSelected(next);
          return;
        }
      }
      const next = new Set([id]);
      selectedRef.current = next;
      selectionAnchorRef.current = id;
      setSelected(next);
    },
    [orderedRowIds],
  );

  const handleRowPointerDown = useCallback(
    (event: PointerEvent, id: string, kind: OverviewRowKind) => {
      if (event.button !== 0) return;
      if (event.shiftKey) {
        applyFinderSelect(id, true);
        return;
      }
      if (!selectedRef.current.has(id)) {
        applyFinderSelect(id, false);
      }
      if (kind === "admin" || kind === "member") {
        beginDrag(event, id);
      }
    },
    [applyFinderSelect, beginDrag],
  );

  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const block of blocks) {
      map.set(block.groupRow.id, idx++);
      for (const child of block.childRows) {
        map.set(child.id, idx++);
      }
    }
    for (const row of ungroupedRows) {
      map.set(row.id, idx++);
    }
    return map;
  }, [blocks, ungroupedRows]);

  const selectionGapAbove = useMemo(() => {
    const gaps = new Set<string>();
    for (let i = 1; i < visibleRows.length; i++) {
      const prev = visibleRows[i - 1];
      const curr = visibleRows[i];
      if (selected.has(prev.id) && selected.has(curr.id)) {
        gaps.add(curr.id);
      }
    }
    return gaps;
  }, [visibleRows, selected]);

  const sortableGroupIds = useMemo(
    () => blocks.map((block) => block.groupRow.groupRef!.id),
    [blocks],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    // People moves use pointer hit-testing — DndContext is only for group reorder.
    if (peopleDragActive) return;
    const { active, over } = event;
    if (!over) return;
    const activeGroupId = String(active.id);
    const overGroupId = String(over.id);
    if (activeGroupId === overGroupId) return;
    const from = localGroups.findIndex((g) => g.id === activeGroupId);
    const to = localGroups.findIndex((g) => g.id === overGroupId);
    if (from < 0 || to < 0) return;
    const next = arrayMove(localGroups, from, to);
    setLocalGroups(next);
    void onReorderGroups(next);
  };

  useEffect(() => {
    onSelectionChange(summarizeOverviewSelection(selected, visibleRows));
  }, [selected, visibleRows, onSelectionChange]);

  useEffect(() => {
    if (resetSelectionSignal === 0) return;
    setSelected(new Set());
    selectionAnchorRef.current = null;
  }, [resetSelectionSignal]);

  // Finder: clear marks when clicking empty table chrome / outside the roster.
  useEffect(() => {
    if (selected.size === 0) return;
    const clear = () => {
      selectedRef.current = new Set();
      selectionAnchorRef.current = null;
      setSelected(new Set());
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (peopleDragActive) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-entity-keep-selection]")) return;
      if (
        target.closest(
          '[role="dialog"], [data-radix-popper-content-wrapper], [data-radix-menu-content]',
        )
      ) {
        return;
      }
      // Keep selection only when the click lands on a row.
      if (target.closest("[data-entity-row]")) return;
      clear();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected.size, peopleDragActive]);

  const handleEdit = (row: OverviewRow) => {
    if (row.kind === "group" && row.groupRef) onEditGroup(row.groupRef);
    else if (row.kind === "admin" && row.adminRef) {
      if (row.adminRef.status === "pending") return;
      onEditAdmin(row.adminRef);
    } else if (row.kind === "member" && row.memberRef) {
      if (row.memberRef.status === "pending") return;
      onEditMember(row.memberRef);
    }
  };

  const gridTemplate = `${dataColumnsTemplate} ${ENTITY_TABLE_EDIT_COLUMN_WIDTH}px`;
  const dragCount = peopleDragIds?.length ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div
        className="grid h-8 flex-none items-stretch border-b border-hairline bg-transparent px-3 text-[12px] text-ink"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {OVERVIEW_COLUMNS.map((c) => (
          <div
            key={c.key}
            className={cn(
              "relative flex min-w-0 items-stretch border-r border-hairline",
              !isResizing && "hover:bg-secondary/40",
            )}
          >
            <div className="pointer-events-none flex min-w-0 flex-1 items-center px-3 text-left font-normal">
              <span className="truncate">{c.label}</span>
            </div>
            <ColumnResizeHandle
              label={c.label}
              onResizeStart={(event) => startResize(c.key, event)}
            />
          </div>
        ))}
        <div />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {blocks.length === 0 && ungroupedRows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            {groups.length === 0 ? "No groups yet." : "No matching rows."}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={peopleDragActive ? undefined : [restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableGroupIds} strategy={verticalListSortingStrategy}>
              {blocks.map((block) => {
                const groupOpen =
                  expanded.has(block.groupRow.groupId) ||
                  (!!q && block.childRows.length > 0);
                const groupId = block.groupRow.groupRef!.id;

                return (
                  <OverviewGroupBlock key={groupId} groupId={groupId}>
                    <SortableOverviewGroupRow
                      row={block.groupRow}
                      rowIndex={rowIndexById.get(block.groupRow.id) ?? 0}
                      gridTemplate={gridTemplate}
                      isResizing={isResizing}
                      isSelected={selected.has(block.groupRow.id)}
                      selectionGapAbove={selectionGapAbove.has(block.groupRow.id)}
                      groupOpen={groupOpen}
                      canDragGroup={
                        dragEnabled && block.childRows.length === 0 && !peopleDragActive
                      }
                      isDropTarget={
                        peopleDragActive &&
                        dropOverGroupId === groupId &&
                        !!peopleDragIds &&
                        !isNoOpPeopleDrop(peopleDragIds, groupId)
                      }
                      suppressRowHover={peopleDragActive}
                      isBlinking={blinkGroupId === groupId}
                      onToggleExpanded={() => toggleExpanded(block.groupRow.groupId)}
                      onRowPointerDown={(e) =>
                        handleRowPointerDown(e, block.groupRow.id, "group")
                      }
                      onEdit={() => handleEdit(block.groupRow)}
                    />
                    {block.childRows.map((child) => (
                      <OverviewChildRow
                        key={child.id}
                        row={child}
                        nested
                        rowIndex={rowIndexById.get(child.id) ?? 0}
                        gridTemplate={gridTemplate}
                        isResizing={isResizing}
                        isSelected={selected.has(child.id)}
                        selectionGapAbove={selectionGapAbove.has(child.id)}
                        isDimmed={
                          !!peopleDragIds && peopleDragIds.includes(child.id)
                        }
                        suppressRowHover={peopleDragActive}
                        onRowPointerDown={(e) =>
                          handleRowPointerDown(e, child.id, child.kind)
                        }
                        onEdit={() => handleEdit(child)}
                      />
                    ))}
                  </OverviewGroupBlock>
                );
              })}
            </SortableContext>
            {ungroupedRows.map((row) => (
              <OverviewChildRow
                key={row.id}
                row={row}
                nested={false}
                rowIndex={rowIndexById.get(row.id) ?? 0}
                gridTemplate={gridTemplate}
                isResizing={isResizing}
                isSelected={selected.has(row.id)}
                selectionGapAbove={selectionGapAbove.has(row.id)}
                isDimmed={!!peopleDragIds && peopleDragIds.includes(row.id)}
                suppressRowHover={peopleDragActive}
                onRowPointerDown={(e) => handleRowPointerDown(e, row.id, row.kind)}
                onEdit={() => handleEdit(row)}
              />
            ))}
          </DndContext>
        )}
        {drag && dragCount > 0 ? (
          <div
            className="pointer-events-none fixed z-[200] flex h-[22px] min-w-[120px] -translate-x-2 -translate-y-3 items-center gap-2 rounded-md px-3 text-[12px] font-medium text-white shadow-lg"
            style={{
              left: drag.x,
              top: drag.y,
              backgroundColor: SELECTION_PURPLE,
            }}
          >
            <span className="truncate">
              {dragCount === 1 ? "1 item" : `${dragCount} items`}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Hit target wrapping a group folder + its children. */
function OverviewGroupBlock({
  groupId,
  children,
}: {
  groupId: string;
  children: ReactNode;
}) {
  return (
    <div data-entity-drop-group={groupId} className="rounded-md">
      {children}
    </div>
  );
}

function SortableOverviewGroupRow({
  row,
  rowIndex,
  gridTemplate,
  isResizing,
  isSelected,
  selectionGapAbove,
  groupOpen,
  canDragGroup,
  isDropTarget,
  isBlinking,
  suppressRowHover,
  onToggleExpanded,
  onRowPointerDown,
  onEdit,
}: {
  row: OverviewRow;
  rowIndex: number;
  gridTemplate: string;
  isResizing: boolean;
  isSelected: boolean;
  selectionGapAbove: boolean;
  groupOpen: boolean;
  canDragGroup: boolean;
  isDropTarget: boolean;
  isBlinking: boolean;
  suppressRowHover?: boolean;
  onToggleExpanded: () => void;
  onRowPointerDown: (e: PointerEvent) => void;
  onEdit: () => void;
}) {
  const groupId = row.groupRef!.id;
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);

  const clearHoldTimer = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: groupId,
      disabled: !canDragGroup,
    });

  useEffect(() => {
    if (isDragging) setIsHolding(false);
  }, [isDragging]);

  useEffect(() => () => clearHoldTimer(), []);

  const dragTransform = CSS.Transform.toString(transform);
  const scale = isDragging ? 1.03 : isHolding ? 1.015 : 1;
  const composedTransform =
    scale !== 1 && dragTransform
      ? `${dragTransform} scale(${scale})`
      : scale !== 1
        ? `scale(${scale})`
        : dragTransform;

  const showDropHighlight = isDropTarget;

  const style: CSSProperties = {
    gridTemplateColumns: gridTemplate,
    transform: composedTransform || undefined,
    transition: isDragging || isHolding ? "none" : transition,
    transformOrigin: "center center",
    zIndex: isDragging || isHolding ? 50 : undefined,
    position: "relative",
    ...(isDragging || isHolding
      ? {
          background: "#ffffff",
          boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 10px 24px -10px rgba(0,0,0,0.25)",
        }
      : overviewRowSelectionStyle({
          isSelected,
          selectionGapAbove,
          isDragging,
          isHolding,
        }) ?? {}),
    ...(showDropHighlight && !isDragging
      ? {
          boxShadow: `inset 0 0 0 1.5px ${SELECTION_PURPLE}`,
          backgroundColor: isSelected ? SELECTION_PURPLE : "rgba(175, 82, 222, 0.12)",
        }
      : {}),
  };

  const dragListeners = canDragGroup
    ? {
        ...listeners,
        onPointerDown: (event: PointerEvent) => {
          onRowPointerDown(event);
          clearHoldTimer();
          holdTimerRef.current = window.setTimeout(() => setIsHolding(true), 120);
          listeners?.onPointerDown?.(event);
        },
        onPointerUp: (event: PointerEvent) => {
          clearHoldTimer();
          setIsHolding(false);
          listeners?.onPointerUp?.(event);
        },
        onPointerCancel: (event: PointerEvent) => {
          clearHoldTimer();
          setIsHolding(false);
          listeners?.onPointerCancel?.(event);
        },
      }
    : {
        onPointerDown: onRowPointerDown,
      };

  return (
    <div
      ref={setNodeRef}
      data-entity-row
      style={style}
      {...(canDragGroup ? attributes : {})}
      {...dragListeners}
      className={cn(
        "group mb-px grid h-[22px] items-center text-[12px]",
        ENTITY_OVERVIEW_ROW_CLASS,
        canDragGroup && "touch-none",
        overviewRowSelectionClass({ isSelected, rowIndex, isDragging }),
        !isResizing && !isDragging && "transition-colors duration-75",
        !isDragging &&
          !suppressRowHover &&
          !isDropTarget &&
          (isSelected
            ? "hover:brightness-[0.96]"
            : "hover:bg-[#EAEAEC]"),
        isBlinking && "animate-[entity-drop-blink_420ms_ease-in-out]",
      )}
    >
      <div className="flex min-w-0 items-center truncate px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            aria-label={groupOpen ? "Collapse group" : "Expand group"}
            onClick={onToggleExpanded}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "grid h-4 w-4 shrink-0 cursor-default place-items-center",
              isSelected ? "text-white/90 hover:text-white" : "text-muted-foreground hover:text-ink",
            )}
          >
            {groupOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <GroupMembersIcon />
          <span className="truncate">{row.name}</span>
        </div>
      </div>

      <div className="truncate px-3">{row.surname}</div>
      <div className="truncate px-3">{row.born}</div>
      <div className="truncate px-3" />

      <div className="flex h-full items-center justify-center">
        <button
          type="button"
          aria-label="Edit"
          onClick={onEdit}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "grid h-6 w-6 cursor-pointer place-items-center",
            isSelected ? "text-white/90 hover:text-white" : "text-muted-foreground hover:text-ink",
          )}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function OverviewChildRow({
  row,
  rowIndex,
  gridTemplate,
  isResizing,
  isSelected,
  selectionGapAbove,
  nested,
  isDimmed,
  suppressRowHover,
  onRowPointerDown,
  onEdit,
}: {
  row: OverviewRow;
  rowIndex: number;
  gridTemplate: string;
  isResizing: boolean;
  isSelected: boolean;
  selectionGapAbove: boolean;
  nested: boolean;
  isDimmed: boolean;
  suppressRowHover: boolean;
  onRowPointerDown: (e: PointerEvent) => void;
  onEdit: () => void;
}) {
  const isPending =
    row.adminRef?.status === "pending" || row.memberRef?.status === "pending";

  return (
    <div
      data-entity-row
      onPointerDown={onRowPointerDown}
      className={cn(
        "group mb-px grid h-[22px] items-center text-[12px]",
        ENTITY_OVERVIEW_ROW_CLASS,
        overviewRowSelectionClass({ isSelected, rowIndex, isDragging: false }),
        !isResizing && "transition-colors duration-75",
        isSelected && !suppressRowHover && "hover:brightness-[0.96]",
        !isSelected && !suppressRowHover && "hover:bg-[#EAEAEC]",
        isDimmed && "opacity-35",
        isSelected && !suppressRowHover && "touch-none",
      )}
      style={{
        gridTemplateColumns: gridTemplate,
        ...overviewRowSelectionStyle({
          isSelected,
          selectionGapAbove,
          isDragging: false,
        }),
      }}
    >
      <div className="flex min-w-0 items-center truncate px-3">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1",
            nested && "pl-7",
          )}
        >
          <OverviewUserIcon
            color={isSelected ? "#FFFFFF" : "#AEAEB2"}
          />
          <span className="truncate">{row.name}</span>
        </div>
      </div>

      <div className="truncate px-3">{row.surname}</div>
      <div className="truncate px-3">{row.born}</div>
      <div className="truncate px-3">{row.group}</div>

      <div
        className={cn(
          "flex h-full items-center",
          isPending ? "justify-start" : "justify-center",
        )}
        style={
          isPending ? { paddingLeft: entityTableEditIconInset() } : undefined
        }
      >
        {isPending ? (
          <span
            className={cn(
              "whitespace-nowrap text-[11px]",
              isSelected ? "text-white/85" : "text-[#AEAEB2]",
            )}
          >
            Pending
          </span>
        ) : (
          <button
            type="button"
            aria-label="Edit"
            onClick={onEdit}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "grid h-6 w-6 cursor-pointer place-items-center",
              isSelected ? "text-white/90 hover:text-white" : "text-muted-foreground hover:text-ink",
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
