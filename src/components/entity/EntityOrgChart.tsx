/**
 * Entity Chart — organization chart of groups (left→right = Overview order).
 * Nested groups are supported in the tree model; today all groups are roots.
 * Finder-style multi-select drag moves people between group boxes.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import {
  type EntityAdministrator,
  type EntityGroup,
  type EntityMember,
} from "@/hooks/useEntityRoster";
import {
  ENTITY_TABLE_EDIT_COLUMN_WIDTH,
  entityTableEditIconInset,
} from "@/hooks/useTableColumnWidths";
import {
  isNoOpPeopleDrop,
  isPersonRowAlreadyInGroup,
  parsePersonRowId,
  personIdentityKey,
} from "@/lib/entityMemberMove";
import { useEntityPeoplePointerDrag } from "@/lib/useEntityPeoplePointerDrag";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";
import { cn } from "@/lib/utils";

/** Same periwinkle as Overview folder icons. */
const GROUP_PURPLE = "#8E8CF0";
const GROUP_PURPLE_DEEP = "#7B79E8";

const SELECTION_PURPLE = "#AF52DE";
/** Finder-style hairline between consecutive selected rows — inset only, no layout shift. */
const SELECTION_GAP_SHADOW = "inset 0 0.5px 0 0 rgba(255,255,255,0.28)";
/** macOS Finder spring-loaded folder dwell (~0.75s). */
const SPRING_LOAD_MS = 750;
/** One Finder-style destination flash on the group header. */
const DROP_BLINK_MS = 380;

function chartRowSelectionClass(isSelected: boolean, rowIndex: number): string {
  if (isSelected) return "overflow-hidden rounded-md text-white";
  return cn(
    "rounded-md text-ink",
    rowIndex % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
  );
}

function chartRowSelectionStyle(
  isSelected: boolean,
  selectionGapAbove?: boolean,
): CSSProperties | undefined {
  if (!isSelected) return undefined;
  return {
    backgroundColor: SELECTION_PURPLE,
    boxShadow: selectionGapAbove ? SELECTION_GAP_SHADOW : undefined,
  };
}

const CHART_GRID = `minmax(0, 1.15fr) minmax(0, 1fr) ${ENTITY_TABLE_EDIT_COLUMN_WIDTH}px`;

type ChartPerson = {
  id: string;
  kind: "admin" | "member";
  name: string;
  surname: string;
  born: string;
  groupName: string;
  pending: boolean;
  adminRef?: EntityAdministrator;
  memberRef?: EntityMember;
};

/** Tree node — `children` reserved for groups-within-groups. */
export type OrgChartNode = {
  group: EntityGroup;
  people: ChartPerson[];
  children: OrgChartNode[];
};

function sortPeople<T extends { name: string; surname: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const aKey = (a.surname || a.name).toLowerCase();
    const bKey = (b.surname || b.name).toLowerCase();
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

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

function peopleForGroup(
  group: EntityGroup,
  admins: EntityAdministrator[],
  members: EntityMember[],
): ChartPerson[] {
  const groupAdmins = sortPeople(
    admins.filter((a) => (a.groups ?? []).some((g) => g.groupId === group.id)),
  );
  const groupMembers = sortPeople(
    members.filter((m) => (m.groups ?? []).some((g) => g.groupId === group.id)),
  );

  const people: ChartPerson[] = [];
  for (const admin of groupAdmins) {
    people.push({
      id: `admin:${group.id}:${admin.id}`,
      kind: "admin",
      name: admin.name,
      surname: admin.surname,
      born: admin.born,
      groupName: group.name,
      pending: admin.status === "pending",
      adminRef: admin,
    });
  }
  for (const member of groupMembers) {
    people.push({
      id: `member:${group.id}:${member.id}`,
      kind: "member",
      name: member.name,
      surname: member.surname,
      born: member.born,
      groupName: group.name,
      pending: member.status === "pending",
      memberRef: member,
    });
  }
  return people;
}

/**
 * Build the org-chart forest. Today every group is a root in Overview order.
 * When groups can nest, attach children under their parent here.
 */
export function buildOrgChartForest(
  groups: EntityGroup[],
  admins: EntityAdministrator[],
  members: EntityMember[],
): OrgChartNode[] {
  return groups.map((group) => ({
    group,
    people: peopleForGroup(group, admins, members),
    children: [] as OrgChartNode[],
  }));
}

export function EntityOrgChart({
  groups,
  admins,
  members,
  onEditAdmin,
  onEditMember,
  onMovePeopleToGroup,
}: {
  groups: EntityGroup[];
  admins: EntityAdministrator[];
  members: EntityMember[];
  onEditAdmin: (row: EntityAdministrator) => void;
  onEditMember: (row: EntityMember) => void;
  onMovePeopleToGroup: (rowIds: string[], targetGroupId: string) => Promise<boolean>;
}) {
  const forest = useMemo(
    () => buildOrgChartForest(groups, admins, members),
    [groups, admins, members],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [blinkGroupId, setBlinkGroupId] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectionAnchorRef = useRef<string | null>(null);
  const blinkTimerRef = useRef<number | null>(null);
  const springTimerRef = useRef<number | null>(null);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const triggerBlink = useCallback((groupId: string) => {
    if (blinkTimerRef.current != null) window.clearTimeout(blinkTimerRef.current);
    setBlinkGroupId(groupId);
    blinkTimerRef.current = window.setTimeout(() => {
      setBlinkGroupId(null);
      blinkTimerRef.current = null;
    }, DROP_BLINK_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (blinkTimerRef.current != null) window.clearTimeout(blinkTimerRef.current);
      if (springTimerRef.current != null) window.clearTimeout(springTimerRef.current);
    };
  }, []);

  const personByRowId = useMemo(() => {
    const map = new Map<string, ChartPerson>();
    for (const node of forest) {
      for (const person of node.people) map.set(person.id, person);
    }
    return map;
  }, [forest]);

  const orderedPersonIds = useMemo(
    () => forest.flatMap((node) => node.people.map((p) => p.id)),
    [forest],
  );

  const commitPeopleMove = useCallback(
    (rowIds: string[], targetGroupId: string) => {
      if (rowIds.length === 0 || isNoOpPeopleDrop(rowIds, targetGroupId)) return;
      // Finder destination-folder blink on the group header at release.
      triggerBlink(targetGroupId);
      setExpanded((prev) => {
        if (prev.has(targetGroupId)) return prev;
        const next = new Set(prev);
        next.add(targetGroupId);
        return next;
      });
      const destSelected = new Set<string>();
      for (const id of rowIds) {
        const parsed = parsePersonRowId(id);
        if (!parsed) continue;
        destSelected.add(`${parsed.kind}:${targetGroupId}:${parsed.personId}`);
      }
      selectedRef.current = destSelected;
      selectionAnchorRef.current =
        destSelected.size > 0 ? [...destSelected][destSelected.size - 1]! : null;
      setSelected(destSelected);
      void onMovePeopleToGroup(rowIds, targetGroupId);
    },
    [onMovePeopleToGroup, triggerBlink],
  );

  const { drag, draggingIds, overGroupId, hoverGroupId, beginDrag } =
    useEntityPeoplePointerDrag({
      selected,
      onMove: commitPeopleMove,
    });

  // Finder spring-loaded folders: hold over a collapsed chart box to open it.
  useEffect(() => {
    if (springTimerRef.current != null) {
      window.clearTimeout(springTimerRef.current);
      springTimerRef.current = null;
    }

    if (!draggingIds?.length || !hoverGroupId) return;
    if (expandedRef.current.has(hoverGroupId)) return;
    if (isNoOpPeopleDrop(draggingIds, hoverGroupId)) return;

    const target = hoverGroupId;
    springTimerRef.current = window.setTimeout(() => {
      springTimerRef.current = null;
      setExpanded((prev) => {
        if (prev.has(target)) return prev;
        const next = new Set(prev);
        next.add(target);
        return next;
      });
    }, SPRING_LOAD_MS);

    return () => {
      if (springTimerRef.current != null) {
        window.clearTimeout(springTimerRef.current);
        springTimerRef.current = null;
      }
    };
  }, [draggingIds, hoverGroupId]);

  const peopleDragPreview = useMemo(() => {
    if (!draggingIds?.length) return [] as ChartPerson[];
    return draggingIds
      .map((id) => personByRowId.get(id))
      .filter((p): p is ChartPerson => !!p);
  }, [draggingIds, personByRowId]);

  const toggleExpanded = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const applyFinderSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && selectionAnchorRef.current) {
        const from = orderedPersonIds.indexOf(selectionAnchorRef.current);
        const to = orderedPersonIds.indexOf(id);
        if (from >= 0 && to >= 0) {
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const next = new Set(orderedPersonIds.slice(lo, hi + 1));
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
    [orderedPersonIds],
  );

  const handlePersonPointerDown = useCallback(
    (event: PointerEvent, id: string) => {
      if (event.button !== 0) return;
      if (event.shiftKey) {
        applyFinderSelect(id, true);
        return;
      }
      if (!selectedRef.current.has(id)) {
        applyFinderSelect(id, false);
      }
      beginDrag(event, id);
    },
    [applyFinderSelect, beginDrag],
  );

  const peopleDragActive = draggingIds != null;

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
      // Keep selection only when the click lands inside a group box.
      if (target.closest("[data-entity-drop-group]")) return;
      clear();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected.size, peopleDragActive]);

  if (forest.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No groups yet.
      </div>
    );
  }

  const dragCount = draggingIds?.length ?? 0;

  return (
    <div className="relative h-full overflow-auto px-6 py-6">
      <div className="flex flex-wrap items-start gap-5">
        {forest.map((node) => (
          <OrgChartNodeView
            key={node.group.id}
            node={node}
            expanded={expanded}
            selected={selected}
            peopleDragIds={draggingIds}
            peopleDragPreview={peopleDragPreview}
            dropOverGroupId={overGroupId}
            blinkGroupId={blinkGroupId}
            onToggleExpanded={toggleExpanded}
            onPersonPointerDown={handlePersonPointerDown}
            onEditAdmin={onEditAdmin}
            onEditMember={onEditMember}
          />
        ))}
      </div>
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
  );
}

function OrgChartNodeView({
  node,
  expanded,
  selected,
  peopleDragIds,
  peopleDragPreview,
  dropOverGroupId,
  blinkGroupId,
  onToggleExpanded,
  onPersonPointerDown,
  onEditAdmin,
  onEditMember,
}: {
  node: OrgChartNode;
  expanded: Set<string>;
  selected: Set<string>;
  peopleDragIds: string[] | null;
  peopleDragPreview: ChartPerson[];
  dropOverGroupId: string | null;
  blinkGroupId: string | null;
  onToggleExpanded: (groupId: string) => void;
  onPersonPointerDown: (e: PointerEvent, rowId: string) => void;
  onEditAdmin: (row: EntityAdministrator) => void;
  onEditMember: (row: EntityMember) => void;
}) {
  const open = expanded.has(node.group.id);
  const isBlinking = blinkGroupId === node.group.id;
  const isDropTarget = dropOverGroupId === node.group.id;
  const showPlaceholders =
    isDropTarget &&
    peopleDragIds &&
    !isNoOpPeopleDrop(peopleDragIds, node.group.id);
  const existingPersonKeys = new Set(
    node.people.flatMap((person) => {
      const key = personIdentityKey(person.id);
      return key ? [key] : [];
    }),
  );
  const placeholderPeople = showPlaceholders
    ? peopleDragPreview.filter((person) => {
        const key = personIdentityKey(person.id);
        if (!key) return true;
        if (existingPersonKeys.has(key)) return false;
        return !isPersonRowAlreadyInGroup(person.id, node.group.id);
      })
    : [];
  const placeholderCount = placeholderPeople.length;
  const draggedPersonKeys = new Set(
    (peopleDragIds ?? []).flatMap((id) => {
      const key = personIdentityKey(id);
      return key ? [key] : [];
    }),
  );
  const alreadyHerePersonKeys = showPlaceholders
    ? new Set([...existingPersonKeys].filter((key) => draggedPersonKeys.has(key)))
    : null;

  const highlight = !!showPlaceholders;

  return (
    <div
      data-entity-drop-group={node.group.id}
      className={cn(
        "flex min-w-[300px] max-w-[420px] flex-1 flex-col items-stretch rounded-md",
        highlight && "ring-2 ring-[#AF52DE] ring-offset-2",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? `Collapse ${node.group.name}` : `Expand ${node.group.name}`}
        onClick={() => onToggleExpanded(node.group.id)}
        className={cn(
          "flex h-9 w-full items-center gap-1.5 rounded-md px-2.5 text-left text-white shadow-sm",
          isBlinking
            ? "animate-[entity-chart-drop-blink_380ms_linear] [animation-fill-mode:forwards]"
            : "transition-[filter] hover:brightness-[0.97] active:brightness-[0.94]",
        )}
        style={{
          backgroundColor: GROUP_PURPLE,
          fontFamily: HELVETICA_STACK,
          boxShadow: `inset 0 0 0 1px ${GROUP_PURPLE_DEEP}`,
        }}
      >
        <span className="grid h-4 w-4 shrink-0 place-items-center text-white/95">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-[-0.01em]">
          {node.group.name}
        </span>
        <span className="shrink-0 text-[11px] font-normal text-white/80">
          {node.people.length + placeholderCount}
        </span>
      </button>

      {open ? (
        <div className="mt-1.5 overflow-hidden rounded-md border border-black/20 bg-white">
          {node.people.length === 0 && placeholderCount === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
              No participants in this group.
            </div>
          ) : (
            <div className="px-1 py-0.5">
              {node.people.map((person, index) => {
                const personKey = personIdentityKey(person.id);
                const isInPlacePlaceholder =
                  !!personKey && !!alreadyHerePersonKeys?.has(personKey);
                const isDimmed =
                  (!!peopleDragIds && peopleDragIds.includes(person.id)) ||
                  isInPlacePlaceholder;
                const prev = index > 0 ? node.people[index - 1] : null;
                const prevKey = prev ? personIdentityKey(prev.id) : null;
                const prevInPlace =
                  !!prevKey && !!alreadyHerePersonKeys?.has(prevKey);
                const selectionGapAbove =
                  !!prev &&
                  (selected.has(prev.id) || prevInPlace) &&
                  (selected.has(person.id) || isInPlacePlaceholder);
                return (
                  <ChartPersonRow
                    key={person.id}
                    person={person}
                    rowIndex={index}
                    isSelected={selected.has(person.id) || isInPlacePlaceholder}
                    selectionGapAbove={selectionGapAbove}
                    isDimmed={isDimmed}
                    suppressRowHover={!!peopleDragIds}
                    onPersonPointerDown={onPersonPointerDown}
                    onEdit={() => {
                      if (person.pending) return;
                      if (person.kind === "admin" && person.adminRef) {
                        onEditAdmin(person.adminRef);
                      } else if (person.kind === "member" && person.memberRef) {
                        onEditMember(person.memberRef);
                      }
                    }}
                  />
                );
              })}
              {placeholderPeople.map((person, i) => (
                <ChartPlaceholderRow
                  key={`ph-${node.group.id}-${person.id}-${i}`}
                  person={person}
                  rowIndex={node.people.length + i}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      {node.children.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3 border-l border-black/10 pl-3">
          {node.children.map((child) => (
            <OrgChartNodeView
              key={child.group.id}
              node={child}
              expanded={expanded}
              selected={selected}
              peopleDragIds={peopleDragIds}
              peopleDragPreview={peopleDragPreview}
              dropOverGroupId={dropOverGroupId}
              blinkGroupId={blinkGroupId}
              onToggleExpanded={onToggleExpanded}
              onPersonPointerDown={onPersonPointerDown}
              onEditAdmin={onEditAdmin}
              onEditMember={onEditMember}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChartPlaceholderRow({
  person,
  rowIndex,
}: {
  person: ChartPerson;
  rowIndex: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none mb-px grid h-[22px] select-none items-center overflow-hidden rounded-md text-[12px] text-white",
      )}
      style={{
        gridTemplateColumns: CHART_GRID,
        backgroundColor: SELECTION_PURPLE,
        boxShadow:
          rowIndex > 0 ? SELECTION_GAP_SHADOW : undefined,
      }}
    >
      <div className="flex min-w-0 items-center truncate px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <OverviewUserIcon color="#FFFFFF" />
          <span className="truncate">{person.name}</span>
        </div>
      </div>
      <div className="truncate px-2">{person.surname}</div>
      <div />
    </div>
  );
}

function ChartPersonRow({
  person,
  rowIndex,
  isSelected,
  selectionGapAbove,
  isDimmed,
  suppressRowHover,
  onPersonPointerDown,
  onEdit,
}: {
  person: ChartPerson;
  rowIndex: number;
  isSelected: boolean;
  selectionGapAbove: boolean;
  isDimmed: boolean;
  suppressRowHover: boolean;
  onPersonPointerDown: (e: PointerEvent, rowId: string) => void;
  onEdit: () => void;
}) {
  return (
    <div
      data-entity-row
      onPointerDown={(e) => onPersonPointerDown(e, person.id)}
      className={cn(
        "group mb-px grid h-[22px] cursor-default select-none items-center overflow-hidden text-[12px]",
        chartRowSelectionClass(isSelected, rowIndex),
        isSelected && !suppressRowHover && "hover:brightness-[0.96]",
        !isSelected && !suppressRowHover && "hover:bg-[#EAEAEC]",
        isSelected && !suppressRowHover && "touch-none",
        isDimmed && "opacity-35",
      )}
      style={{
        gridTemplateColumns: CHART_GRID,
        ...chartRowSelectionStyle(isSelected, selectionGapAbove),
      }}
    >
      <div className="flex min-w-0 items-center truncate px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <OverviewUserIcon
            color={isSelected ? "#FFFFFF" : "#AEAEB2"}
          />
          <span className="truncate">{person.name}</span>
        </div>
      </div>

      <div className="truncate px-2">{person.surname}</div>

      <div
        className={cn(
          "flex h-full shrink-0 items-center",
          person.pending ? "justify-start" : "justify-center",
        )}
        style={
          person.pending ? { paddingLeft: entityTableEditIconInset() } : undefined
        }
      >
        {person.pending ? (
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
              "grid h-6 w-6 shrink-0 cursor-pointer place-items-center",
              isSelected
                ? "text-white/90 hover:text-white"
                : "text-muted-foreground hover:text-ink",
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
