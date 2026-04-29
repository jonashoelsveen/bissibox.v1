/**
 * CalendarSideNav — replica of LibrarySideNav adapted for the Calendar page.
 *
 * Same look-and-feel, same interactions:
 *   - "Previous" row at the top.
 *   - One collapsible section "Calendars" with the same chevron + indent style
 *     as Library categories.
 *   - "Unsorted" pseudo-folder, then real folders rendered as sortable rows
 *     with pin / rename / delete via three-dot menu.
 *
 * Folders are persisted by the parent (placeholder localStorage today,
 * real table later). This component only handles UI state.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  ChevronRight,
  History,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import type { CalFolder } from "./CalendarPage";

export type CalendarCategory = "previous" | "calendars";

export interface CalendarSideNavValue {
  category: CalendarCategory;
  folder: string;
}

export function CalendarSideNav({
  value,
  onChange,
  folders,
  onFoldersChange,
}: {
  value: CalendarSideNavValue;
  onChange: (v: CalendarSideNavValue) => void;
  folders: CalFolder[];
  onFoldersChange: (next: CalFolder[]) => void;
}) {
  const [open, setOpen] = useState(true);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<CalFolder | null>(null);
  const [activeDrag, setActiveDrag] = useState<CalFolder | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const sorted = [...folders].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || a.sort_order - b.sort_order,
  );
  const ids = sorted.map((f) => f.id);

  const isPreviousActive = value.category === "previous";
  const isCalActive = value.category === "calendars";
  const isAllActive = isCalActive && value.folder === "";
  const isUnsortedActive = isCalActive && value.folder === "__unsorted__";

  const handleCategoryClick = () => {
    if (isAllActive) {
      setOpen((o) => !o);
    } else {
      onChange({ category: "calendars", folder: "" });
    }
  };

  const togglePin = (folder: CalFolder) => {
    setMenuFor(null);
    onFoldersChange(folders.map((f) => (f.id === folder.id ? { ...f, pinned: !f.pinned } : f)));
  };
  const startRename = (folder: CalFolder) => {
    setMenuFor(null);
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };
  const commitRename = (folder: CalFolder) => {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === folder.name) return;
    onFoldersChange(folders.map((f) => (f.id === folder.id ? { ...f, name: newName } : f)));
  };
  const doDelete = () => {
    if (!confirmDelete) return;
    onFoldersChange(folders.filter((f) => f.id !== confirmDelete.id));
    setConfirmDelete(null);
  };

  const handleDragStart = (e: DragStartEvent) => {
    const f = sorted.find((x) => x.id === e.active.id);
    if (f) setActiveDrag(f);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = sorted.findIndex((f) => f.id === active.id);
    const to = sorted.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    if (sorted[from].pinned !== sorted[to].pinned) return;
    const next = arrayMove(sorted, from, to).map((f, i) => ({ ...f, sort_order: i }));
    onFoldersChange(next);
  };

  return (
    <nav className="flex flex-col gap-1">
      {/* Previous */}
      <button
        onClick={() => onChange({ category: "previous", folder: "" })}
        className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
          isPreviousActive ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
        }`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
          <History className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate">Previous</span>
      </button>

      {/* Calendars section header */}
      <div className="flex flex-col">
        <button
          onClick={handleCategoryClick}
          className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
            isAllActive ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
          }`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="ml-2 min-w-0 flex-1 truncate">Calendars</span>
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-90" : "rotate-0"
            }`}
          />
        </button>

        <motion.div
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={{
            height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
            opacity: { duration: open ? 0.18 : 0.12, ease: "easeOut", delay: open ? 0.04 : 0 },
          }}
          style={{
            overflow: open ? "visible" : "hidden",
            willChange: "height, opacity",
            pointerEvents: open ? "auto" : "none",
          }}
        >
          <div
            className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2"
            style={{ overflow: "visible" }}
          >
            <button
              onClick={() => onChange({ category: "calendars", folder: "__unsorted__" })}
              className={`rounded-md px-3 py-1 text-left text-xs transition ${
                isUnsortedActive
                  ? "bg-secondary font-medium text-ink"
                  : "text-muted-foreground hover:text-ink"
              }`}
            >
              Unsorted
            </button>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveDrag(null)}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-0.5">
                  <AnimatePresence initial={false}>
                    {sorted.map((f) => {
                      const active = isCalActive && value.folder === f.id;
                      return (
                        <SortableFolderRow
                          key={f.id}
                          folder={f}
                          active={active}
                          renaming={renamingId === f.id}
                          renameValue={renameValue}
                          setRenameValue={setRenameValue}
                          onSelect={() => onChange({ category: "calendars", folder: f.id })}
                          onCommitRename={() => commitRename(f)}
                          onCancelRename={() => setRenamingId(null)}
                          menuOpen={menuFor === f.id}
                          onToggleMenu={() => setMenuFor(menuFor === f.id ? null : f.id)}
                          onCloseMenu={() => setMenuFor(null)}
                          onPin={() => togglePin(f)}
                          onRename={() => startRename(f)}
                          onDelete={() => setConfirmDelete(f)}
                        />
                      );
                    })}
                  </AnimatePresence>
                </div>
              </SortableContext>
              <DragOverlay
                dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
              >
                {activeDrag ? (
                  <div className="rounded-md bg-card/95 px-3 py-1 text-xs text-ink shadow-lg ring-1 ring-hairline backdrop-blur-sm">
                    <div className="flex items-center gap-1.5">
                      {activeDrag.pinned && (
                        <Pin className="h-2.5 w-2.5 fill-current text-ink/70" />
                      )}
                      <span className="truncate">{activeDrag.name}</span>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {sorted.length === 0 && (
              <span className="px-3 py-1 text-[11px] text-muted-foreground/70">
                No folders yet
              </span>
            )}
          </div>
        </motion.div>
      </div>

      {confirmDelete && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setConfirmDelete(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-hairline bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-ink">
              Delete &ldquo;{confirmDelete.name}&rdquo;?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes the folder. Calendars inside will become unsorted.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-hairline bg-card px-3 py-1.5 text-xs text-ink hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

/* ---------------- Sortable wrapper + row (mirrors LibrarySideNav) ---------------- */

function SortableFolderRow(props: {
  folder: CalFolder;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onSelect: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.folder.id,
    disabled: props.renaming,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <FolderRow {...props} />
    </div>
  );
}

function FolderRow({
  folder,
  active,
  renaming,
  renameValue,
  setRenameValue,
  onSelect,
  onCommitRename,
  onCancelRename,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onPin,
  onRename,
  onDelete,
}: {
  folder: CalFolder;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onSelect: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    if (menuOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuW = 160;
      setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - menuW) });
    } else {
      setMenuPos(null);
    }
  }, [menuOpen]);

  return (
    <div
      className={`group relative flex items-center gap-1 rounded-md pr-1 transition-colors duration-150 ease-out ${
        active ? "bg-secondary" : "hover:bg-secondary/70"
      }`}
    >
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            else if (e.key === "Escape") onCancelRename();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded-md border border-hairline bg-background px-2 py-1 text-xs text-ink outline-none ring-0 focus:border-ink/30"
        />
      ) : (
        <button
          onClick={onSelect}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs transition ${
            active ? "font-medium text-ink" : "text-muted-foreground group-hover:text-ink"
          }`}
        >
          {folder.pinned && (
            <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />
          )}
          <span className="truncate">{folder.name}</span>
        </button>
      )}

      {!renaming && (
        <>
          <button
            ref={btnRef}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            data-open={menuOpen}
            aria-label="Folder actions"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && menuPos &&
            createPortal(
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={onCloseMenu}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onCloseMenu();
                  }}
                />
                <div
                  className="fixed z-[70] w-40 overflow-hidden rounded-lg border border-hairline bg-card py-1 shadow-lg animate-in fade-in-0 zoom-in-95"
                  style={{ top: menuPos.top, left: menuPos.left }}
                >
                  <MenuItem
                    icon={folder.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    label={folder.pinned ? "Unpin" : "Pin to top"}
                    onClick={() => {
                      onCloseMenu();
                      onPin();
                    }}
                  />
                  <MenuItem
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    label="Rename"
                    onClick={() => {
                      onCloseMenu();
                      onRename();
                    }}
                  />
                  <MenuItem
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Delete"
                    destructive
                    onClick={() => {
                      onCloseMenu();
                      onDelete();
                    }}
                  />
                </div>
              </>,
              document.body,
            )}
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-ink hover:bg-secondary"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
