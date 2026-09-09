/**
 * Event subevents table — Finder-style rows mirrored from EntityOverviewTable
 * (folder icon, purple selection, rounded hover, vertical reorder), but scoped
 * to event subevents only (`data-event-subevent-*`) so entity overview state
 * never crosses in.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { Eye, EyeOff, MoreHorizontal, Plus } from "lucide-react";
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
import {
  CategoryActionsMenu,
  STANDARD_COLORS_8,
} from "@/components/library/CategoryActionsMenu";
import {
  ColumnResizeHandle,
  columnWidthConfigs,
  ENTITY_TABLE_EDIT_COLUMN_WIDTH,
  useTableColumnWidths,
} from "@/hooks/useTableColumnWidths";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SUBEVENT_COLOR,
  formatSubeventTime,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  type EventDraft,
  type EventSubeventDraft,
} from "./event-ui-types";

const SELECTION_PURPLE = "#AF52DE";
/** Finder-style hairline between consecutive selected rows — inset only, no layout shift. */
const SELECTION_GAP_SHADOW = "inset 0 0.5px 0 0 rgba(255,255,255,0.28)";
/** Fixed width for the Live badge column (between Time end and ⋯). */
const SUBEVENT_LIVE_COLUMN_WIDTH = 52;

const SUBEVENT_ROW_CLASS = "cursor-default select-none";

type EditableField = "name" | "startsAt" | "endsAt";

type CellEdit = {
  id: string;
  field: EditableField;
  value: string;
};

const SUBEVENT_COLUMNS = [
  { key: "name", label: "Name", defaultWidth: 220, minWidth: 120, maxWidth: 420 },
  { key: "startsAt", label: "Time start", defaultWidth: 160, minWidth: 96, maxWidth: 280 },
  { key: "endsAt", label: "Time end", defaultWidth: 160, minWidth: 96, maxWidth: 280 },
] as const;

function subeventRowSelectionClass({
  isSelected,
  rowIndex,
  isDragging,
  isHolding,
}: {
  isSelected: boolean;
  rowIndex: number;
  isDragging?: boolean;
  isHolding?: boolean;
}): string {
  if (isDragging || isHolding) return "rounded-md text-ink";
  if (isSelected) return "overflow-hidden rounded-md text-white";
  return cn(
    "rounded-md text-ink",
    rowIndex % 2 === 1 ? "bg-[#F5F5F7]" : "bg-white",
  );
}

function subeventRowSelectionStyle({
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

function PeriwinkleFolderIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
      <path
        d="M1.5 3.25C1.5 2.56 2.06 2 2.75 2h3.05l1.2 1.2h6.25c.69 0 1.25.56 1.25 1.25v7.3c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V3.25Z"
        fill={color}
      />
      <path
        d="M1.5 4.75h13v6.05c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V4.75Z"
        fill={color}
        opacity={0.82}
      />
    </svg>
  );
}

function newSubeventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function withSortOrders(rows: EventSubeventDraft[]): EventSubeventDraft[] {
  return rows.map((row, i) => ({ ...row, sortOrder: i }));
}

type Props = {
  draft: EventDraft;
  onChange: (patch: { subevents: EventSubeventDraft[] }) => void;
};

export function EventSubeventsSection({ draft, onChange }: Props) {
  const [cellEdit, setCellEdit] = useState<CellEdit | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const selectionAnchorRef = useRef<string | null>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  const isEditing = cellEdit != null;

  const widthConfigs = useMemo(() => columnWidthConfigs([...SUBEVENT_COLUMNS]), []);
  const { isResizing, startResize, dataColumnsTemplate } = useTableColumnWidths(
    "event-subevents",
    widthConfigs,
  );
  const gridTemplate = `${dataColumnsTemplate} ${SUBEVENT_LIVE_COLUMN_WIDTH}px ${ENTITY_TABLE_EDIT_COLUMN_WIDTH}px`;

  const rows = useMemo(
    () => [...draft.subevents].sort((a, b) => a.sortOrder - b.sortOrder),
    [draft.subevents],
  );
  const orderedIds = useMemo(() => rows.map((r) => r.id), [rows]);

  useEffect(() => {
    if (!cellEdit) return;
    const el = cellInputRef.current;
    if (!el) return;
    el.focus();
    if (cellEdit.field === "name") el.select();
    // Only when starting an edit — not when the value changes while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellEdit?.id, cellEdit?.field]);

  useEffect(() => {
    const live = new Set(orderedIds);
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    if (selectionAnchorRef.current && !live.has(selectionAnchorRef.current)) {
      selectionAnchorRef.current = null;
    }
  }, [orderedIds]);

  useEffect(() => {
    if (selected.size === 0) return;
    const clear = () => {
      selectedRef.current = new Set();
      selectionAnchorRef.current = null;
      setSelected(new Set());
    };
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-event-subevent-keep-selection]")) return;
      if (
        target.closest(
          '[role="dialog"], [data-radix-popper-content-wrapper], [data-radix-menu-content], .mac-menu',
        )
      ) {
        return;
      }
      if (target.closest("[data-event-subevent-row]")) return;
      clear();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected.size]);

  const applyFinderSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && selectionAnchorRef.current) {
        const from = orderedIds.indexOf(selectionAnchorRef.current);
        const to = orderedIds.indexOf(id);
        if (from >= 0 && to >= 0) {
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const next = new Set(orderedIds.slice(lo, hi + 1));
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
    [orderedIds],
  );

  const handleRowPointerDown = useCallback(
    (event: PointerEvent, id: string) => {
      if (event.button !== 0) return;
      if (cellEdit) return;
      if (event.shiftKey) {
        applyFinderSelect(id, true);
        return;
      }
      if (!selectedRef.current.has(id)) {
        applyFinderSelect(id, false);
      }
    },
    [applyFinderSelect, cellEdit],
  );

  const selectionGapAbove = useMemo(() => {
    const gaps = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (selected.has(prev.id) && selected.has(curr.id)) {
        gaps.add(curr.id);
      }
    }
    return gaps;
  }, [rows, selected]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const persistRows = (next: EventSubeventDraft[]) => {
    onChange({ subevents: withSortOrders(next) });
  };

  const patchRow = (id: string, patch: Partial<EventSubeventDraft>) => {
    onChange({
      subevents: draft.subevents.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.id === String(active.id));
    const to = rows.findIndex((r) => r.id === String(over.id));
    if (from < 0 || to < 0) return;
    persistRows(arrayMove(rows, from, to));
  };

  const startCellEdit = (row: EventSubeventDraft, field: EditableField) => {
    if (field === "name") {
      setCellEdit({ id: row.id, field, value: row.name });
      return;
    }
    setCellEdit({
      id: row.id,
      field,
      value: toDatetimeLocalValue(field === "startsAt" ? row.startsAt : row.endsAt),
    });
  };

  const commitCellEdit = () => {
    if (!cellEdit) return;
    const { id, field, value } = cellEdit;
    setCellEdit(null);
    const current = draft.subevents.find((r) => r.id === id);
    if (!current) return;

    if (field === "name") {
      const next = value.trim() || "Untitled";
      if (current.name === next) return;
      patchRow(id, { name: next });
      return;
    }

    const next = fromDatetimeLocalValue(value);
    const prev = field === "startsAt" ? current.startsAt : current.endsAt;
    if (prev === next) return;
    patchRow(id, { [field]: next });
  };

  const cancelCellEdit = () => {
    if (!cellEdit) return;
    const { id, field } = cellEdit;
    const current = draft.subevents.find((r) => r.id === id);
    setCellEdit(null);
    if (field === "name" && current && !current.name.trim()) {
      patchRow(id, { name: "Untitled" });
    }
  };

  const deleteRow = (id: string) => {
    onChange({ subevents: draft.subevents.filter((row) => row.id !== id) });
    if (cellEdit?.id === id) setCellEdit(null);
  };

  const addPlaceholder = () => {
    const nextOrder =
      rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    const row: EventSubeventDraft = {
      id: newSubeventId(),
      name: "",
      startsAt: null,
      endsAt: null,
      sortOrder: nextOrder,
      color: DEFAULT_SUBEVENT_COLOR,
      live: false,
    };
    onChange({ subevents: [...draft.subevents, row] });
    setSelected(new Set());
    selectionAnchorRef.current = null;
    setCellEdit({ id: row.id, field: "name", value: "" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div
        data-event-subevent-keep-selection
        className="flex h-12 flex-none items-center px-6"
      >
        <button
          type="button"
          aria-label="Add subevent"
          onClick={addPlaceholder}
          className="grid h-7 w-7 place-items-center text-muted-foreground transition-colors hover:text-ink"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div
          className="grid h-8 flex-none items-stretch border-b border-hairline bg-transparent px-3 text-[12px] text-ink"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {SUBEVENT_COLUMNS.map((c) => (
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
          <div />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {rows.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              No subevents yet.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                {rows.map((row, rowIndex) => (
                  <SortableSubeventRow
                    key={row.id}
                    row={row}
                    rowIndex={rowIndex}
                    gridTemplate={gridTemplate}
                    isResizing={isResizing}
                    isSelected={selected.has(row.id)}
                    selectionGapAbove={selectionGapAbove.has(row.id)}
                    cellEdit={
                      cellEdit?.id === row.id ? cellEdit : null
                    }
                    cellInputRef={cellInputRef}
                    onCellEditValueChange={(value) =>
                      setCellEdit((prev) =>
                        prev && prev.id === row.id ? { ...prev, value } : prev,
                      )
                    }
                    onCommitCellEdit={commitCellEdit}
                    onCancelCellEdit={cancelCellEdit}
                    canDrag={!isEditing}
                    onRowPointerDown={(e) => handleRowPointerDown(e, row.id)}
                    onStartEdit={(field) => startCellEdit(row, field)}
                    onColorChange={(hex) => patchRow(row.id, { color: hex })}
                    onToggleLive={() => patchRow(row.id, { live: !row.live })}
                    onDelete={() => deleteRow(row.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    </div>
  );
}

function SortableSubeventRow({
  row,
  rowIndex,
  gridTemplate,
  isResizing,
  isSelected,
  selectionGapAbove,
  cellEdit,
  cellInputRef,
  onCellEditValueChange,
  onCommitCellEdit,
  onCancelCellEdit,
  canDrag,
  onRowPointerDown,
  onStartEdit,
  onColorChange,
  onToggleLive,
  onDelete,
}: {
  row: EventSubeventDraft;
  rowIndex: number;
  gridTemplate: string;
  isResizing: boolean;
  isSelected: boolean;
  selectionGapAbove: boolean;
  cellEdit: CellEdit | null;
  cellInputRef: RefObject<HTMLInputElement | null>;
  onCellEditValueChange: (v: string) => void;
  onCommitCellEdit: () => void;
  onCancelCellEdit: () => void;
  canDrag: boolean;
  onRowPointerDown: (e: PointerEvent) => void;
  onStartEdit: (field: EditableField) => void;
  onColorChange: (hex: string) => void;
  onToggleLive: () => void;
  onDelete: () => void;
}) {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const isEditingRow = cellEdit != null;
  const editingField = cellEdit?.field ?? null;

  const clearHoldTimer = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: row.id,
      disabled: !canDrag || isEditingRow,
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
      : subeventRowSelectionStyle({
          isSelected,
          selectionGapAbove,
          isDragging,
          isHolding,
        }) ?? {}),
  };

  const dragListeners =
    canDrag && !isEditingRow
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

  const selectedChrome = isSelected && !isDragging && !isHolding;

  const cellInputKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommitCellEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelCellEdit();
    }
  };

  return (
    <div
      ref={setNodeRef}
      data-event-subevent-row
      style={style}
      {...(canDrag && !isEditingRow ? attributes : {})}
      {...dragListeners}
      className={cn(
        "group mb-px grid h-[22px] items-center text-[12px]",
        SUBEVENT_ROW_CLASS,
        canDrag && !isEditingRow && "touch-none",
        subeventRowSelectionClass({ isSelected, rowIndex, isDragging, isHolding }),
        !isResizing && !isDragging && "transition-colors duration-75",
        !isDragging &&
          !isEditingRow &&
          (isSelected ? "hover:brightness-[0.96]" : "hover:bg-[#EAEAEC]"),
        isEditingRow && "ring-1 ring-inset ring-hairline",
      )}
    >
      <div className="flex min-w-0 items-center truncate px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <PeriwinkleFolderIcon color={row.color || DEFAULT_SUBEVENT_COLOR} />
          {editingField === "name" && cellEdit ? (
            <input
              ref={cellInputRef}
              value={cellEdit.value}
              onChange={(e) => onCellEditValueChange(e.target.value)}
              onBlur={onCommitCellEdit}
              onKeyDown={cellInputKeys}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Subevent name"
              aria-label="Subevent name"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
            />
          ) : (
            <span
              className="min-w-0 flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onStartEdit("name");
              }}
            >
              {row.name || "Untitled"}
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 truncate px-3">
        {editingField === "startsAt" && cellEdit ? (
          <input
            ref={cellInputRef}
            type="datetime-local"
            value={cellEdit.value}
            onChange={(e) => onCellEditValueChange(e.target.value)}
            onBlur={onCommitCellEdit}
            onKeyDown={cellInputKeys}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Time start"
            className="h-[18px] w-full min-w-0 bg-transparent text-[11px] outline-none"
          />
        ) : (
          <span
            className="block truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onStartEdit("startsAt");
            }}
          >
            {formatSubeventTime(row.startsAt) || "—"}
          </span>
        )}
      </div>

      <div className="min-w-0 truncate px-3">
        {editingField === "endsAt" && cellEdit ? (
          <input
            ref={cellInputRef}
            type="datetime-local"
            value={cellEdit.value}
            onChange={(e) => onCellEditValueChange(e.target.value)}
            onBlur={onCommitCellEdit}
            onKeyDown={cellInputKeys}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Time end"
            className="h-[18px] w-full min-w-0 bg-transparent text-[11px] outline-none"
          />
        ) : (
          <span
            className="block truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onStartEdit("endsAt");
            }}
          >
            {formatSubeventTime(row.endsAt) || "—"}
          </span>
        )}
      </div>

      <div className="flex h-full items-center justify-center px-1">
        {row.live ? (
          <span
            className={cn(
              "text-[11px] font-semibold",
              selectedChrome ? "text-white" : "text-[#B42318]",
            )}
          >
            Live
          </span>
        ) : null}
      </div>

      <div
        className="flex h-full max-h-[22px] items-center justify-center overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <CategoryActionsMenu
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${row.name || "Untitled"}`}
              className={cn(
                "grid h-[22px] w-[22px] cursor-pointer place-items-center",
                selectedChrome
                  ? "text-white/90 hover:text-white"
                  : "text-muted-foreground hover:text-ink",
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          }
          currentColor={row.color || DEFAULT_SUBEVENT_COLOR}
          onColorChange={onColorChange}
          onRename={() => onStartEdit("name")}
          onDelete={onDelete}
          colorSwatches={STANDARD_COLORS_8}
          extraItems={[
            {
              label: row.live ? "Hide on Live" : "Show on Live",
              icon: row.live ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              ),
              onClick: onToggleLive,
            },
          ]}
        />
      </div>
    </div>
  );
}
