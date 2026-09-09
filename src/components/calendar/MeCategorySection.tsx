import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Eye, EyeOff, MoreHorizontal, Pin, PinOff } from "lucide-react";
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
import {
  useUserCategories,
  type CategoryKind,
  type UserCategory,
} from "@/hooks/useUserCategories";
import { DEFAULT_SWATCHES } from "./MiniColorPicker";
import { CategoryActionsMenu } from "@/components/library/CategoryActionsMenu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/** Matches week-view ROW_HEIGHT in UnifiedElasticGrid / GanttYearGrid. */
export const GANTT_PROJECT_ROW_HEIGHT = 28;

export function MeCategorySection({
  hidden,
  onToggleHidden,
  teamId,
  groupId = null,
  title = "Me",
  showCoachAccess = false,
  defaultOpen = true,
  /** `flat` = settings page: always expanded, no sticky collapse chrome. */
  variant = "sidenav",
  kind = "calendar",
  createName = "New tab",
  /** Fixed row height so Macro project rows line up with Gantt tracks. */
  rowHeight,
  hidePin = false,
  /** Blank strip under the sticky header (Macro: matches Gantt week-number row). */
  listOffsetTop,
  /** Optional span for newly created Macro projects / phases. */
  createSpan,
  /** Parent project id when creating/listing Macro phases. */
  parentId = null,
  /** Row click opens/activates instead of hide toggle. */
  onRowActivate,
  /**
   * When false, row body click does not toggle visibility (eye only).
   * Defaults to true when `onRowActivate` is unset.
   */
  rowClickTogglesHidden,
  /** When set, header shows back arrow and stays expanded (drill-in). */
  onBack,
  /** Open project — header three-dot menu (rename / color / delete). */
  headerCategory,
  onHeaderColorChange,
  onHeaderRename,
  onHeaderDelete,
}: {
  hidden: Set<string>; // category ids that are hidden
  onToggleHidden: (id: string) => void;
  /** When set, scopes categories to this team. */
  teamId?: string | null;
  /** When set on a team, shows only categories for this group. */
  groupId?: string | null;
  /** Header label for the section. Defaults to "Me". */
  title?: string;
  /**
   * When true (individual Calendar only):
   *  - The "Pin to top" menu item is hidden.
   *  - An "Access" submenu is added that lets the user grant per-category
   *    access to specific coaches.
   */
  showCoachAccess?: boolean;
  defaultOpen?: boolean;
  variant?: "sidenav" | "flat";
  kind?: CategoryKind;
  /** Default name for newly created rows. */
  createName?: string;
  rowHeight?: number;
  /** Hide pin action (Macro projects). */
  hidePin?: boolean;
  listOffsetTop?: number;
  createSpan?: () => {
    gantt_start_week: number;
    gantt_end_week: number;
    gantt_start_date?: string;
    gantt_end_date?: string;
  };
  parentId?: string | null;
  onRowActivate?: (id: string) => void;
  rowClickTogglesHidden?: boolean;
  onBack?: () => void;
  headerCategory?: UserCategory;
  onHeaderColorChange?: (hex: string) => void;
  onHeaderRename?: (name: string) => Promise<void> | void;
  onHeaderDelete?: () => void;
}) {
  const allowRowHideToggle = rowClickTogglesHidden ?? !onRowActivate;
  const { categories, create, update, remove, reorder } = useUserCategories({
    teamId,
    kind,
    parentId: kind === "gantt_phase" ? parentId : null,
  });
  const visibleCategories = useMemo(() => {
    if (!teamId) return categories;
    if (groupId) return categories.filter((c) => c.app_group_id === groupId);
    return categories.filter((c) => !c.app_group_id);
  }, [categories, teamId, groupId]);
  const [open, setOpen] = useState(defaultOpen);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [headerRenaming, setHeaderRenaming] = useState(false);
  const [headerRenameValue, setHeaderRenameValue] = useState("");
  const headerRenameRef = useRef<HTMLInputElement>(null);
  const flat = variant === "flat";
  const suppressPin = showCoachAccess || hidePin;
  const drilledIn = typeof onBack === "function";
  const listOpen = drilledIn ? true : open;

  useEffect(() => {
    if (!headerRenaming) return;
    headerRenameRef.current?.focus();
    headerRenameRef.current?.select();
  }, [headerRenaming]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const startRename = (c: UserCategory) => {
    // Defer to the next macrotask so the actions menu (Radix dropdown) can
    // finish closing and restore focus to its trigger BEFORE we mount the
    // rename input. Otherwise Radix's focus-restore lands after our input
    // mounts and focuses, blurs the input, and commitRename() fires with
    // an unchanged value — exiting rename mode after a single frame.
    setTimeout(() => {
      setRenamingId(c.id);
      setRenameValue(c.name);
    }, 0);
  };
  const startHeaderRename = () => {
    if (!headerCategory) return;
    setTimeout(() => {
      setHeaderRenaming(true);
      setHeaderRenameValue(headerCategory.name);
    }, 0);
  };
  const commitHeaderRename = async () => {
    const v = headerRenameValue.trim();
    setHeaderRenaming(false);
    if (!headerCategory || !v || v === headerCategory.name) return;
    await onHeaderRename?.(v);
  };
  const commitRename = async (c: UserCategory) => {
    const v = renameValue.trim();
    setRenamingId(null);
    if (!v || v === c.name) return;
    await update(c.id, { name: v });
  };

  const handleAdd = async () => {
    // Default new tabs to a neutral grey slightly darker than the left
    // panel background (rgb(245,245,247)) so the swatch is visible but
    // unopinionated — users pick a real color when they want one.
    const created = await create(
      createName,
      "#C7C7CC",
      teamId ? groupId : null,
      createSpan?.() ?? null,
      kind === "gantt_phase" ? parentId : null,
    );
    if (created) {
      if (!drilledIn) setOpen(true);
      setRenamingId(created.id);
      setRenameValue(created.name);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = visibleCategories.findIndex((c) => c.id === active.id);
    const to = visibleCategories.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    if (visibleCategories[from].pinned !== visibleCategories[to].pinned) return;
    const next = arrayMove(visibleCategories, from, to);
    void reorder(next);
  };

  const ids = visibleCategories.map((c) => c.id);

  const listEl = (
    <div
      className={`flex flex-col ${rowHeight != null ? "gap-0" : "gap-0.5"} ${flat ? "" : rowHeight != null ? "" : "mt-0.5"}`}
      style={{ overflow: "visible" }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {visibleCategories.map((c) => (
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
              onActivate={onRowActivate ? () => onRowActivate(c.id) : undefined}
              rowClickTogglesHidden={allowRowHideToggle}
              onRename={() => startRename(c)}
              onTogglePin={() => void update(c.id, { pinned: !c.pinned })}
              onDelete={() => void remove(c.id)}
              onColorChange={(hex) => void update(c.id, { color: hex })}
              showCoachAccess={showCoachAccess}
              hidePin={suppressPin}
              rowHeight={rowHeight}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );

  if (flat) {
    return (
      <div className="flex max-w-md flex-col items-stretch">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          {title ? (
            <span className="text-sm font-medium text-ink">{title}</span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => void handleAdd()}
            aria-label="Add activity type"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {listEl}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header row — sticky so it stays visible while the list scrolls */}
      <div
        className="group sticky top-0 z-[2] flex w-full items-center gap-1.5 rounded-md bg-[rgba(245,245,247,0.92)] px-2 text-sm transition-colors hover:bg-[#EAEAEC]"
        style={
          rowHeight != null ? { height: 36, minHeight: 36 } : { paddingTop: 8, paddingBottom: 8 }
        }
      >
        {drilledIn ? (
          headerRenaming ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-ink">
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={headerRenameRef}
                value={headerRenameValue}
                onChange={(e) => setHeaderRenameValue(e.target.value)}
                onBlur={() => void commitHeaderRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitHeaderRename();
                  else if (e.key === "Escape") setHeaderRenaming(false);
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent font-medium outline-none"
                aria-label="Project name"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to projects"
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink"
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
            </button>
          )
        ) : (
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
        )}
        <div className="flex shrink-0 items-center gap-2">
          {headerCategory ? (
            <CategoryActionsMenu
              trigger={
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 hover:bg-secondary hover:text-ink group-hover:opacity-100 data-[state=open]:opacity-100"
                  aria-label="Project actions"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </button>
              }
              currentColor={headerCategory.color}
              onColorChange={(hex) => onHeaderColorChange?.(hex)}
              onRename={startHeaderRename}
              onDelete={() => onHeaderDelete?.()}
            />
          ) : null}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleAdd(); }}
            aria-label="Add category"
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {listOffsetTop != null && listOffsetTop > 0 ? (
        <div
          aria-hidden
          className="sticky z-[2]"
          style={{
            top: rowHeight != null ? 36 : 0,
            height: listOffsetTop,
            backgroundColor: "rgba(245, 245, 247, 0.92)",
          }}
        />
      ) : null}

      <motion.div
        initial={false}
        animate={{ height: listOpen ? "auto" : 0, opacity: listOpen ? 1 : 0 }}
        transition={{
          height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: listOpen ? 0.18 : 0.12, ease: "easeOut", delay: listOpen ? 0.04 : 0 },
        }}
        style={{ overflow: listOpen ? "visible" : "hidden", pointerEvents: listOpen ? "auto" : "none" }}
      >
        {listEl}
      </motion.div>
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
  onActivate?: () => void;
  /** When false, row body click is a no-op for visibility. */
  rowClickTogglesHidden?: boolean;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onColorChange: (hex: string) => void;
  showCoachAccess?: boolean;
  hidePin?: boolean;
  rowHeight?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.cat.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging ? 50 : undefined,
    background: isDragging ? "#ffffff" : undefined,
    boxShadow: isDragging
      ? "0 1px 0 rgba(0,0,0,0.04), 0 10px 24px -10px rgba(0,0,0,0.25)"
      : undefined,
    ...(props.rowHeight != null
      ? { height: props.rowHeight, minHeight: props.rowHeight, boxSizing: "border-box" as const }
      : null),
  };
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [props.renaming]);

  const { cat } = props;

  const extraItems = props.hidePin
    ? []
    : [
        {
          top: true,
          label: cat.pinned ? "Unpin" : "Pin to top",
          icon: cat.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />,
          onClick: props.onTogglePin,
        },
      ];

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
        if (tgt.closest("input")) return;
        if (props.onActivate) {
          props.onActivate();
          return;
        }
        if (props.rowClickTogglesHidden === false) return;
        props.onToggleHidden();
      }}
      className={`group flex items-center gap-2 rounded-md px-2 text-xs transition-colors hover:bg-secondary/60 ${
        props.rowHeight != null ? "py-0" : "py-1"
      } ${isDragging ? "cursor-default" : "cursor-default"} ${
        props.hidden ? "text-muted-foreground" : "text-ink"
      } ${props.renaming ? "ring-1 ring-inset ring-hairline" : ""}`}
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
        <span className="min-w-0 flex-1 truncate">
          {cat.name}
          {cat.pinned && <Pin className="ml-1 inline h-2.5 w-2.5 text-muted-foreground" />}
        </span>
      )}
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
        extraItems={extraItems}
        accessPanel={
          props.showCoachAccess ? <CoachAccessPanel categoryId={cat.id} /> : undefined
        }
      />
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

/* ---------- Coach access panel ---------- */

interface CoachOption {
  id: string; // user_coaches row id
  coachUserId: string;
  displayName: string;
}

function CoachAccessPanel({ categoryId }: { categoryId: string }) {
  const { user } = useAuth();
  const [coaches, setCoaches] = useState<CoachOption[] | null>(null);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      const { data: rows } = await supabase
        .from("user_coaches")
        .select("id, coach_email, coach_user_id, status")
        .eq("owner_id", user.id)
        .eq("status", "accepted");

      const list = (rows ?? []).filter(
        (r): r is { id: string; coach_email: string; coach_user_id: string; status: string } =>
          !!r.coach_user_id,
      );

      const ids = list.map((r) => r.coach_user_id);
      let nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", ids);
        for (const p of profs ?? []) {
          const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
          if (n) nameMap.set(p.id, n);
        }
      }

      if (cancelled) return;
      setCoaches(
        list.map((r) => ({
          id: r.id,
          coachUserId: r.coach_user_id,
          displayName: nameMap.get(r.coach_user_id) || r.coach_email,
        })),
      );

      const { data: access } = await supabase
        .from("calendar_category_coach_access")
        .select("coach_user_id")
        .eq("category_id", categoryId)
        .eq("owner_id", user.id);
      if (cancelled) return;
      setGranted(new Set((access ?? []).map((a) => a.coach_user_id)));
    })();

    return () => {
      cancelled = true;
    };
  }, [user, categoryId]);

  const toggle = async (coachUserId: string) => {
    if (!user) return;
    setBusy((b) => new Set(b).add(coachUserId));
    const isGranted = granted.has(coachUserId);
    if (isGranted) {
      setGranted((g) => {
        const n = new Set(g);
        n.delete(coachUserId);
        return n;
      });
      await supabase
        .from("calendar_category_coach_access")
        .delete()
        .eq("category_id", categoryId)
        .eq("coach_user_id", coachUserId);
    } else {
      setGranted((g) => new Set(g).add(coachUserId));
      await supabase.from("calendar_category_coach_access").insert({
        owner_id: user.id,
        category_id: categoryId,
        coach_user_id: coachUserId,
      });
    }
    setBusy((b) => {
      const n = new Set(b);
      n.delete(coachUserId);
      return n;
    });
  };

  if (coaches === null) {
    return <div className="px-1 py-1 text-[11px] text-muted-foreground">Loading…</div>;
  }

  if (coaches.length === 0) {
    return (
      <div className="px-1 py-1 text-[11px] text-muted-foreground" style={{ width: 160 }}>
        No coaches
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 text-xs" style={{ width: 180 }}>
      {coaches.map((c) => {
        const checked = granted.has(c.coachUserId);
        const isBusy = busy.has(c.coachUserId);
        return (
          <button
            key={c.coachUserId}
            type="button"
            disabled={isBusy}
            onClick={() => void toggle(c.coachUserId)}
            className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-ink transition hover:bg-secondary disabled:opacity-60"
          >
            <span
              aria-hidden
              className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border ${
                checked ? "border-ink bg-ink text-background" : "border-hairline bg-background"
              }`}
            >
              {checked ? (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2.5 6.5l2.5 2.5L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{c.displayName}</span>
          </button>
        );
      })}
    </div>
  );
}
