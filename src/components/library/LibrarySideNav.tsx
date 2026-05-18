import { useCallback, useEffect, useRef, useState } from "react";
import { CategoryActionsMenu } from "@/components/library/CategoryActionsMenu";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ChevronRight,
  FolderClosed,
  Image as ImageIcon,
  Pin,
  PinOff,
  MoreHorizontal,
  Users as UsersIcon,
} from "lucide-react";

/** Library is media-only. The category type is kept as a single literal for
 *  back-compat with callers that destructure `value.category`. */
export type LibraryCategory = "media";

interface FolderLite {
  id: string;
  name: string;
  pinned: boolean;
  color?: string | null;
}

export interface LibrarySideNavValue {
  category: LibraryCategory;
  folder: string;
}

export function LibrarySideNav({
  value,
  onChange,
  onOpenAsTab,
}: {
  value: LibrarySideNavValue;
  onChange: (v: LibrarySideNavValue) => void;
  onOpenAsTab?: (v: LibrarySideNavValue, label: string, color?: string | null) => void;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  const [mediaAlbums, setMediaAlbums] = useState<FolderLite[]>([]);
  const [memberAlbums, setMemberAlbums] = useState<FolderLite[]>([]);
  const [membersOpen, setMembersOpen] = useState<boolean>(true);
  const [open, setOpen] = useState<boolean>(true);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FolderLite | null>(null);
  const [activeDrag, setActiveDrag] = useState<FolderLite | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    let teamId: string | null = null;
    if (isTeamMode) {
      if (activeEntityId) {
        const { data } = await supabase
          .from("teams")
          .select("id")
          .eq("id", activeEntityId)
          .maybeSingle();
        teamId = data?.id ?? null;
      }
      if (!teamId) {
        const { data } = await supabase
          .from("teams")
          .select("id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        teamId = data?.id ?? null;
      }
    }
    const q = supabase
      .from("media_albums")
      .select("id,name,pinned,color,member_user_id")
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });
    const { data: ma } = await (isTeamMode && teamId
      ? q.eq("team_id", teamId)
      : q.is("team_id", null).eq("user_id", user.id));
    type AlbumRow = FolderLite & { member_user_id: string | null; color: string | null };
    const allAlbums = (ma ?? []) as AlbumRow[];
    setMediaAlbums(
      allAlbums
        .filter((a) => !a.member_user_id)
        .map(({ id, name, pinned, color }) => ({ id, name, pinned, color })),
    );
    setMemberAlbums(
      isTeamMode
        ? allAlbums
            .filter((a) => !!a.member_user_id)
            .map(({ id, name, pinned, color }) => ({ id, name, pinned, color }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    );
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`library-side-nav-${user?.id ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "media_albums" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "team_group_members" }, () => load())
      .subscribe();
    const onLocal = () => void load();
    window.addEventListener("library:refresh", onLocal);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("library:refresh", onLocal);
    };
  }, [load, user?.id]);

  const persistOrder = async (next: FolderLite[]) => {
    await Promise.all(
      next.map((f, idx) => supabase.from("media_albums").update({ sort_order: idx }).eq("id", f.id)),
    );
    window.dispatchEvent(new Event("library:refresh"));
  };

  const togglePin = async (folder: FolderLite) => {
    setMenuFor(null);
    const { error } = await supabase
      .from("media_albums")
      .update({ pinned: !folder.pinned })
      .eq("id", folder.id);
    if (error) toast.error(error.message);
    else {
      void load();
      window.dispatchEvent(new Event("library:refresh"));
    }
  };

  const setAlbumColor = async (folder: FolderLite, hex: string) => {
    setMediaAlbums((prev) =>
      prev.map((f) => (f.id === folder.id ? { ...f, color: hex } : f)),
    );
    setMemberAlbums((prev) =>
      prev.map((f) => (f.id === folder.id ? { ...f, color: hex } : f)),
    );
    window.dispatchEvent(
      new CustomEvent("library:album-color", { detail: { id: folder.id, color: hex } }),
    );
    const { error } = await supabase
      .from("media_albums")
      .update({ color: hex })
      .eq("id", folder.id);
    if (error) toast.error(error.message);
  };

  const startRename = (folder: FolderLite) => {
    setMenuFor(null);
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };

  const commitRename = async (folder: FolderLite) => {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === folder.name) return;
    const { error } = await supabase
      .from("media_albums")
      .update({ name: newName })
      .eq("id", folder.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renamed");
    void load();
    window.dispatchEvent(new Event("library:refresh"));
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const folder = confirmDelete;
    setConfirmDelete(null);
    const { error } = await supabase.from("media_albums").delete().eq("id", folder.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      void load();
      window.dispatchEvent(new Event("library:refresh"));
    }
  };

  const isAllActive = value.folder === "";
  const isUnsortedActive = value.folder === "__unsorted__";
  const ids = mediaAlbums.map((f) => f.id);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragStart = (e: DragStartEvent) => {
    const f = mediaAlbums.find((x) => x.id === e.active.id);
    if (f) setActiveDrag(f);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = mediaAlbums.findIndex((f) => f.id === active.id);
    const to = mediaAlbums.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    if (mediaAlbums[from].pinned !== mediaAlbums[to].pinned) return;
    const next = arrayMove(mediaAlbums, from, to);
    setMediaAlbums(next);
    void persistOrder(next);
  };

  return (
    <nav className="flex flex-col gap-1">
      <div className="flex flex-col">
        <button
          onClick={() => {
            if (isAllActive) setOpen((o) => !o);
            else onChange({ category: "media", folder: "" });
          }}
          className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
            isAllActive ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
          }`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="ml-2 min-w-0 flex-1 truncate">Media</span>
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
          style={{ overflow: open ? "visible" : "hidden", willChange: "height, opacity", pointerEvents: open ? "auto" : "none" }}
        >
          <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2" style={{ overflow: "visible" }}>
            <button
              onClick={() => onChange({ category: "media", folder: "__unsorted__" })}
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
                    {mediaAlbums.map((f) => {
                      const active = value.folder === f.id;
                      return (
                        <SortableFolderRow
                          key={f.id}
                          folder={f}
                          active={active}
                          renaming={renamingId === f.id}
                          renameValue={renameValue}
                          setRenameValue={setRenameValue}
                          onSelect={() => onChange({ category: "media", folder: f.id })}
                          onOpenAsTab={
                            onOpenAsTab
                              ? () => onOpenAsTab({ category: "media", folder: f.id }, f.name, f.color ?? null)
                              : undefined
                          }
                          onCommitRename={() => void commitRename(f)}
                          onCancelRename={() => setRenamingId(null)}
                          menuOpen={menuFor === f.id}
                          onToggleMenu={() => setMenuFor(menuFor === f.id ? null : f.id)}
                          onCloseMenu={() => setMenuFor(null)}
                          onPin={() => void togglePin(f)}
                          onRename={() => startRename(f)}
                          onColor={(hex) => void setAlbumColor(f, hex)}
                          onDelete={() => setConfirmDelete(f)}
                        />
                      );
                    })}
                  </AnimatePresence>
                </div>
              </SortableContext>

              <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
                {activeDrag ? (
                  <div className="rounded-md bg-card/95 px-3 py-1 text-xs text-ink shadow-lg ring-1 ring-hairline backdrop-blur-sm">
                    <div className="flex items-center gap-1.5">
                      {activeDrag.pinned && <Pin className="h-2.5 w-2.5 fill-current text-ink/70" />}
                      <span className="truncate">{activeDrag.name}</span>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {mediaAlbums.length === 0 && (
              <span className="px-3 py-1 text-[11px] text-muted-foreground/70">No albums yet</span>
            )}

            {isTeamMode && (
              <div className="mt-1 flex flex-col">
                <button
                  onClick={() => setMembersOpen((v) => !v)}
                  className="group flex w-full items-center rounded-md px-3 py-1 text-left text-xs text-ink hover:bg-secondary/60"
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground">
                    <UsersIcon className="h-3 w-3" strokeWidth={2.25} />
                  </span>
                  <span className="ml-1.5 min-w-0 flex-1 truncate font-medium">Members</span>
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      membersOpen ? "rotate-90" : "rotate-0"
                    }`}
                  />
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: membersOpen ? "auto" : 0, opacity: membersOpen ? 1 : 0 }}
                  transition={{
                    height: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
                    opacity: { duration: membersOpen ? 0.16 : 0.1, ease: "easeOut" },
                  }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {memberAlbums.length === 0 ? (
                      <span className="px-3 py-1 text-[11px] text-muted-foreground/70">No members yet</span>
                    ) : (
                      memberAlbums.map((f) => {
                        const active = value.folder === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => onChange({ category: "media", folder: f.id })}
                            onDoubleClick={() =>
                              onOpenAsTab?.({ category: "media", folder: f.id }, f.name, f.color ?? null)
                            }
                            className={`flex min-w-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-xs transition ${
                              active
                                ? "bg-secondary font-medium text-ink"
                                : "text-muted-foreground hover:bg-secondary/60 hover:text-ink"
                            }`}
                          >
                            <FolderClosed
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2.25}
                              style={f.color ? { color: f.color } : { color: "var(--muted-foreground)" }}
                            />
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setConfirmDelete(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-hairline bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-ink">
              Delete &ldquo;{confirmDelete.name}&rdquo;?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes the album. Items inside will become unsorted.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-hairline bg-card px-3 py-1.5 text-xs text-ink hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => void doDelete()}
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

// ---------------------------------------------------------------------------
// Sortable + row components
// ---------------------------------------------------------------------------

interface RowProps {
  folder: FolderLite;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onSelect: () => void;
  onOpenAsTab?: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onPin: () => void;
  onRename: () => void;
  onColor?: (hex: string) => void;
  onDelete: () => void;
}

function SortableFolderRow(props: RowProps) {
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
  onOpenAsTab,
  onCommitRename,
  onCancelRename,
  onPin,
  onRename,
  onColor,
  onDelete,
}: RowProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

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
          onDoubleClick={onOpenAsTab}
          className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-xs transition ${
            active ? "font-medium text-ink" : "text-muted-foreground group-hover:text-ink"
          }`}
        >
          {folder.pinned && <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />}
          <span
            className="shrink-0 text-muted-foreground"
            style={folder.color ? { color: folder.color } : undefined}
          >
            <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        </button>
      )}

      {!renaming && (
        <CategoryActionsMenu
          trigger={
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              aria-label="Album actions"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          }
          currentColor={folder.color ?? "#3b82f6"}
          allowColor={!!onColor}
          onColorChange={(hex) => onColor?.(hex)}
          onRename={onRename}
          onDelete={onDelete}
          extraItems={[
            {
              top: true,
              label: folder.pinned ? "Unpin" : "Pin to top",
              icon: folder.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />,
              onClick: onPin,
            },
          ]}
        />
      )}
    </div>
  );
}
