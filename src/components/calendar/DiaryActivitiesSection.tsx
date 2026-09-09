/**
 * DiaryActivitiesSection — collapsible left-rail section that lists the
 * user's diary activity tabs (Running, Swimming, Cycling, etc.).
 *
 * Mirrors MeCategorySection but tailored for diary:
 *  - No pin-to-top action.
 *  - Color picker is limited to the 8 standard swatches (no custom).
 *  - Plus icon on the header is hidden in read-only (leader) mode.
 *
 * Persistence is shared with CalendarCategories via the `kind` column on
 * `calendar_categories` (`kind = 'diary_activity'`).
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Plus, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { useUserCategories, type UserCategory } from "@/hooks/useUserCategories";
import {
  CategoryActionsMenu,
  STANDARD_COLORS_8,
} from "@/components/library/CategoryActionsMenu";
import { useDiaryVisibility } from "./DiaryVisibilityContext";

export interface DiaryActivitiesSectionProps {
  /** Header label — defaults to "Activities". */
  title?: string;
  /** When true, show plus icon and enable rename/color/delete actions. */
  canEdit?: boolean;
  /** Optional click handler for the header plus icon (overrides default create). */
  onAddClick?: () => void;
  /** Which row kind to query/create — "diary_activity" (default) or "diary_strava". */
  kind?: "diary_activity" | "diary_strava";
  /** When false, hide the header plus icon entirely. Defaults to true. */
  showAdd?: boolean;
  teamId?: string | null;
  ownerId?: string | null;
}

export function DiaryActivitiesSection({
  title = "Activities",
  canEdit = true,
  onAddClick,
  kind = "diary_activity",
  showAdd = true,
  teamId = null,
  ownerId = null,
}: DiaryActivitiesSectionProps) {
  const { categories, create, update, remove, reorder } = useUserCategories({ kind, teamId, ownerId });
  const [open, setOpen] = useState(true);
  const { isCategoryHidden, toggleCategoryId } = useDiaryVisibility();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));


  const startRename = (c: UserCategory) => {
    setRenamingId(c.id);
    setRenameValue(c.name);
  };

  const commitRename = async (c: UserCategory) => {
    const v = renameValue.trim();
    setRenamingId(null);
    if (!v || v === c.name) return;
    await update(c.id, { name: v });
  };

  const handleAdd = async () => {
    if (onAddClick) {
      onAddClick();
      return;
    }
    const created = await create("New activity", "#C7C7CC");
    if (created) {
      setOpen(true);
      setRenamingId(created.id);
      setRenameValue(created.name);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = categories.findIndex((c) => c.id === active.id);
    const to = categories.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(categories, from, to);
    void reorder(next);
  };

  const ids = categories.map((c) => c.id);

  return (
    <div className="flex flex-col">
      <div className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm transition hover:bg-secondary/60">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        </button>
        {canEdit && showAdd && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleAdd();
            }}
            aria-label={`Add ${title.toLowerCase()}`}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{
          height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: open ? 0.18 : 0.12, ease: "easeOut", delay: open ? 0.04 : 0 },
        }}
        style={{ overflow: open ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" }}
      >
        <div
          className="mt-0.5 flex flex-col gap-0.5"
          style={{ overflow: "visible" }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {categories.map((c) => (
                <SortableActivityRow
                  key={c.id}
                  cat={c}
                  hidden={isCategoryHidden(c.id)}
                  canEdit={canEdit}
                  renaming={renamingId === c.id}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onCommitRename={() => void commitRename(c)}
                  onCancelRename={() => setRenamingId(null)}
                  onToggleHidden={() => toggleCategoryId(c.id)}
                  onRename={() => startRename(c)}
                  onDelete={() => void remove(c.id)}
                  onColorChange={(hex) => void update(c.id, { color: hex })}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </motion.div>
    </div>
  );
}

function SortableActivityRow(props: {
  cat: UserCategory;
  hidden: boolean;
  canEdit: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleHidden: () => void;
  onRename: () => void;
  onDelete: () => void;
  onColorChange: (hex: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.cat.id,
    disabled: !props.canEdit,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging ? 50 : undefined,
    background: isDragging ? "#ffffff" : undefined,
    boxShadow: isDragging
      ? "0 1px 0 rgba(0,0,0,0.04), 0 10px 24px -10px rgba(0,0,0,0.25)"
      : undefined,
  };
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [props.renaming]);

  const { cat } = props;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (props.renaming) return;
        const tgt = e.target as HTMLElement;
        if (tgt.closest("button")) return;
        props.onToggleHidden();
      }}
      className={`group flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors hover:bg-secondary/60 ${
        isDragging ? "cursor-default" : "cursor-default"
      } ${props.hidden ? "text-muted-foreground" : "text-ink"} ${
        props.renaming ? "ring-1 ring-inset ring-hairline" : ""
      }`}
    >
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-hairline"
        style={{ background: cat.color, opacity: props.hidden ? 0.35 : 1 }}
      />
      {props.renaming ? (
        <input
          ref={inputRef}
          value={props.renameValue}
          onChange={(e) => props.setRenameValue(e.target.value)}
          onBlur={props.onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onCommitRename();
            else if (e.key === "Escape") props.onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{cat.name}</span>
      )}
      {props.canEdit && (
        <CategoryActionsMenu
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 hover:bg-secondary hover:text-ink group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label="More"
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          }
          currentColor={cat.color}
          onColorChange={props.onColorChange}
          onRename={props.onRename}
          onDelete={props.onDelete}
          allowCustomColor={false}
          colorSwatches={STANDARD_COLORS_8}
        />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          props.onToggleHidden();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={props.hidden ? "Show" : "Hide"}
        className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
      >
        {props.hidden ? (
          <EyeOff className="h-3 w-3 text-muted-foreground/70" />
        ) : (
          <Eye className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
}
