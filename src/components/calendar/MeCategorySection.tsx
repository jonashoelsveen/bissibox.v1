import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Plus, Eye, EyeOff, MoreHorizontal, Pin, PinOff } from "lucide-react";
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
import { DEFAULT_SWATCHES } from "./MiniColorPicker";
import { CategoryActionsMenu } from "@/components/library/CategoryActionsMenu";


export function MeCategorySection({
  hidden,
  onToggleHidden,
  teamId,
  title = "Me",
}: {
  hidden: Set<string>; // category ids that are hidden
  onToggleHidden: (id: string) => void;
  /** When set, scopes categories to this team. */
  teamId?: string | null;
  /** Header label for the section. Defaults to "Me". */
  title?: string;
}) {
  const { categories, create, update, remove, reorder } = useUserCategories({ teamId });
  const [open, setOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const startRename = (c: UserCategory) => {
    if (c.is_default) return;
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
    const created = await create("New tab", DEFAULT_SWATCHES[0]);
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
    if (categories[from].pinned !== categories[to].pinned) return;
    const next = arrayMove(categories, from, to);
    void reorder(next);
  };

  const ids = categories.map((c) => c.id);
  const menuCat = categories.find((c) => c.id === menuFor);

  return (
    <div className="flex flex-col">
      {/* Header row — chevron LEFT (entity-style), plus on the RIGHT */}
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
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void handleAdd(); }}
          aria-label="Add category"
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
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
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2" style={{ overflow: "visible" }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {categories.map((c) => (
                <SortableCategoryRow
                  key={c.id}
                  cat={c}
                  hidden={hidden.has(c.id)}
                  renaming={renamingId === c.id}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onCommitRename={() => void commitRename(c)}
                  onCancelRename={() => setRenamingId(null)}
                  onToggleHidden={() => onToggleHidden(c.id)}
                  onOpenMenu={(rect) => {
                    setMenuFor(c.id);
                    setMenuAnchor({ x: rect.right + 4, y: rect.top });
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </motion.div>

      {menuFor && menuCat && menuAnchor && (
        <CategoryMenu
          cat={menuCat}
          anchor={menuAnchor}
          onClose={() => { setMenuFor(null); setMenuAnchor(null); }}
          onRename={() => { setMenuFor(null); startRename(menuCat); }}
          onPin={async () => { await update(menuCat.id, { pinned: !menuCat.pinned }); setMenuFor(null); }}
          onDelete={async () => { await remove(menuCat.id); setMenuFor(null); }}
          onColor={(hex) => { void update(menuCat.id, { color: hex }); }}
          onCustomDone={() => { setMenuFor(null); setMenuAnchor(null); }}
        />
      )}
    </div>
  );
}

function SortableCategoryRow(props: {
  cat: UserCategory;
  hidden: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggleHidden: () => void;
  onOpenMenu: (rect: DOMRect) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.cat.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const dotsRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [props.renaming]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (props.renaming) return;
        // Ignore clicks that originated on action buttons (they stopPropagation already, but guard anyway)
        const tgt = e.target as HTMLElement;
        if (tgt.closest("button")) return;
        props.onToggleHidden();
      }}
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition hover:bg-secondary/60 ${
        props.hidden ? "text-muted-foreground" : "text-ink"
      }`}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-hairline"
        style={{ background: props.cat.color, opacity: props.hidden ? 0.35 : 1 }}
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
        <span className="min-w-0 flex-1 truncate">
          {props.cat.name}
          {props.cat.pinned && <Pin className="ml-1 inline h-2.5 w-2.5 text-muted-foreground" />}
        </span>
      )}
      <button
        ref={dotsRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          props.onOpenMenu(r);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 hover:bg-secondary hover:text-ink group-hover:opacity-100"
        aria-label="More"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); props.onToggleHidden(); }}
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

function CategoryMenu({
  cat,
  anchor,
  onClose,
  onRename,
  onPin,
  onDelete,
  onColor,
  onCustomDone,
}: {
  cat: UserCategory;
  anchor: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onPin: () => void;
  onDelete: () => void;
  onColor: (hex: string) => void;
  onCustomDone: () => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<{ x: number; y: number } | null>(null);
  const [colorPinned, setColorPinned] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAnchor, setCustomAnchor] = useState<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      if (!colorPinned) {
        setColorOpen(false);
        setCustomOpen(false);
      }
    }, 120);
  };

  useEffect(() => {
    const onDocPointer = (e: PointerEvent | MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t)) return;
      if (document.getElementById("__cat_color_menu")?.contains(t)) return;
      if (document.getElementById("__cat_custom_menu")?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    // Defer registration so the opening click doesn't immediately close us.
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointer, true);
      document.addEventListener("mousedown", onDocPointer, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("mousedown", onDocPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const openColor = (rect: DOMRect) => {
    cancelClose();
    setColorAnchor({ x: rect.right + 4, y: rect.top });
    setColorOpen(true);
  };

  return createPortal(
    <>
      <div
        ref={rootRef}
        className="fixed z-50 min-w-[170px] overflow-hidden rounded-xl border border-hairline bg-popover p-1 text-xs shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
        style={{ left: anchor.x, top: anchor.y }}
      >
        <button onClick={onPin} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-ink hover:bg-secondary">
          {cat.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {cat.pinned ? "Unpin" : "Pin to top"}
        </button>
        <button
          onClick={onRename}
          disabled={cat.is_default}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-ink hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pencil className="h-3 w-3" /> Rename
        </button>
        <button
          onMouseEnter={(e) => openColor(e.currentTarget.getBoundingClientRect())}
          onMouseLeave={scheduleClose}
          onClick={(e) => {
            openColor(e.currentTarget.getBoundingClientRect());
            setColorPinned(true);
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-ink hover:bg-secondary"
        >
          <Palette className="h-3 w-3" /> Color
          <ChevronRight className="ml-auto h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          disabled={cat.is_default}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-destructive hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>

      {colorOpen && colorAnchor && (
        <div
          id="__cat_color_menu"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-50 overflow-hidden rounded-xl border border-hairline bg-popover p-2 shadow-xl animate-in fade-in zoom-in-95 duration-150"
          style={{ left: colorAnchor.x, top: colorAnchor.y }}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {DEFAULT_SWATCHES.map((hex) => {
              const selected = cat.color.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => { setColorPinned(false); onColor(hex); }}
                  className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
                    selected ? "border-ink ring-2 ring-ink/30" : "border-black/10"
                  }`}
                  style={{ background: hex }}
                  aria-label={hex}
                />
              );
            })}
          </div>
          <button
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setCustomAnchor({ x: r.right + 6, y: r.top });
              setCustomOpen(true);
              setColorPinned(true);
            }}
            className="mt-2 flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] text-ink hover:bg-secondary"
          >
            Custom
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {customOpen && customAnchor && (
        <div
          id="__cat_custom_menu"
          onMouseEnter={cancelClose}
          className="fixed z-50 overflow-hidden rounded-xl border border-hairline bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-150"
          style={{ left: customAnchor.x, top: customAnchor.y }}
        >
          <MiniColorPicker
            initial={cat.color}
            onPreview={(hex) => onColor(hex)}
            onSave={(hex) => { onColor(hex); onCustomDone(); }}
          />
        </div>
      )}
    </>,
    document.body,
  );
}
