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
  StickyNote,
  FolderClosed,
  Image as ImageIcon,
  Library,
  Pin,
  PinOff,
  History,
  Map as MapIcon,
  Briefcase,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users as UsersIcon,
  Palette,
} from "lucide-react";
import { MiniColorPicker, DEFAULT_SWATCHES } from "@/components/calendar/MiniColorPicker";

export type LibraryCategory = "previous" | "meetings" | "notes" | "files" | "media" | "map";

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

type SectionKey = "meetings" | "notes" | "files" | "media" | "map";
type TableName = "meeting_folders" | "note_folders" | "file_folders" | "media_albums";

/** Mirrors MapPage's MapFolder shape (subset). */
interface MapFolderLite {
  id: string;
  name: string;
  pinned: boolean;
  sort_order: number;
}
const mapFoldersKey = (scope: string) => `map:folders:${scope}`;
function readMapFolders(scope: string): MapFolderLite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(mapFoldersKey(scope));
    return raw ? (JSON.parse(raw) as MapFolderLite[]) : [];
  } catch {
    return [];
  }
}
function writeMapFolders(scope: string, next: MapFolderLite[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(mapFoldersKey(scope), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("map:refresh"));
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

  const [noteFolders, setNoteFolders] = useState<FolderLite[]>([]);
  const [fileFolders, setFileFolders] = useState<FolderLite[]>([]);
  const [mediaAlbums, setMediaAlbums] = useState<FolderLite[]>([]);
  const [memberAlbums, setMemberAlbums] = useState<FolderLite[]>([]);
  const [membersOpen, setMembersOpen] = useState<boolean>(true);
  const [meetingFolders, setMeetingFolders] = useState<FolderLite[]>([]);
  const [mapFolders, setMapFolders] = useState<FolderLite[]>([]);
  const [mapScope, setMapScope] = useState<string>("anon");
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    meetings: true,
    notes: true,
    files: true,
    media: true,
    map: true,
  });

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    section: SectionKey;
    folder: FolderLite;
  } | null>(null);

  // Drag overlay state
  const [activeDrag, setActiveDrag] = useState<{ section: SectionKey; folder: FolderLite } | null>(
    null,
  );

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
    const scopeQuery = (q: ReturnType<typeof supabase.from>) =>
      isTeamMode && teamId
        ? q.eq("team_id", teamId)
        : q.is("team_id", null).eq("user_id", user.id);

    const [{ data: nf }, { data: ff }, { data: ma }] = await Promise.all([
      scopeQuery(
        supabase
          .from("note_folders")
          .select("id,name,pinned")
          .order("pinned", { ascending: false })
          .order("sort_order", { ascending: true }),
      ),
      scopeQuery(
        supabase
          .from("file_folders")
          .select("id,name,pinned")
          .order("pinned", { ascending: false })
          .order("sort_order", { ascending: true }),
      ),
      scopeQuery(
        supabase
          .from("media_albums")
          .select("id,name,pinned,color,member_user_id")
          .order("pinned", { ascending: false })
          .order("sort_order", { ascending: true }),
      ),
    ]);
    setNoteFolders((nf ?? []) as FolderLite[]);
    setFileFolders((ff ?? []) as FolderLite[]);
    type AlbumRow = FolderLite & { member_user_id: string | null; color: string | null };
    const allAlbums = (ma ?? []) as AlbumRow[];
    setMediaAlbums(
      allAlbums.filter((a) => !a.member_user_id).map(({ id, name, pinned, color }) => ({ id, name, pinned, color })),
    );
    setMemberAlbums(
      isTeamMode
        ? allAlbums
            .filter((a) => !!a.member_user_id)
            .map(({ id, name, pinned, color }) => ({ id, name, pinned, color }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    );

    if (isTeamMode && teamId) {
      const { data: mf } = await supabase
        .from("meeting_folders")
        .select("id,name,pinned")
        .eq("team_id", teamId)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true });
      setMeetingFolders((mf ?? []) as FolderLite[]);
    } else {
      setMeetingFolders([]);
    }

    // Map folders live in localStorage (mirrors MapPage scope).
    const scope = isTeamMode ? `team:${teamId ?? "none"}` : `user:${user.id}`;
    setMapScope(scope);
    const mfRaw = readMapFolders(scope);
    const sorted = [...mfRaw].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    setMapFolders(sorted.map((f) => ({ id: f.id, name: f.name, pinned: !!f.pinned })));
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`library-side-nav-${user?.id ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "note_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "file_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "media_albums" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "team_board_meetings" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "team_group_members" }, () => load())
      .subscribe();
    const onLocal = () => void load();
    window.addEventListener("library:refresh", onLocal);
    window.addEventListener("map:refresh", onLocal);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("library:refresh", onLocal);
      window.removeEventListener("map:refresh", onLocal);
    };
  }, [load, user?.id]);

  const tableFor = (section: SectionKey): TableName | null => {
    if (section === "notes") return "note_folders";
    if (section === "files") return "file_folders";
    if (section === "media") return "media_albums";
    if (section === "meetings") return "meeting_folders";
    return null;
  };

  const setStateFor = (section: SectionKey, next: FolderLite[]) => {
    if (section === "notes") setNoteFolders(next);
    else if (section === "files") setFileFolders(next);
    else if (section === "media") setMediaAlbums(next);
    else if (section === "meetings") setMeetingFolders(next);
    else if (section === "map") setMapFolders(next);
  };

  /** Map folders are stored in localStorage, not Supabase. */
  const updateMapFolders = (mutator: (prev: MapFolderLite[]) => MapFolderLite[]) => {
    const current = readMapFolders(mapScope);
    const next = mutator(current);
    writeMapFolders(mapScope, next);
  };

  const persistOrder = async (section: SectionKey, next: FolderLite[]) => {
    if (section === "map") {
      updateMapFolders((prev) => {
        const byId = new Map(prev.map((f) => [f.id, f]));
        return next
          .map((f, idx) => {
            const existing = byId.get(f.id);
            if (!existing) return null;
            return { ...existing, sort_order: idx };
          })
          .filter((f): f is MapFolderLite => !!f);
      });
      return;
    }
    const table = tableFor(section);
    if (!table) return;
    await Promise.all(
      next.map((f, idx) => supabase.from(table).update({ sort_order: idx }).eq("id", f.id)),
    );
    window.dispatchEvent(new Event("library:refresh"));
  };

  const togglePin = async (section: SectionKey, folder: FolderLite) => {
    setMenuFor(null);
    if (section === "map") {
      updateMapFolders((prev) =>
        prev.map((f) => (f.id === folder.id ? { ...f, pinned: !folder.pinned } : f)),
      );
      return;
    }
    const table = tableFor(section);
    if (!table) return;
    const { error } = await supabase
      .from(table)
      .update({ pinned: !folder.pinned })
      .eq("id", folder.id);
    if (error) toast.error(error.message);
    else {
      void load();
      window.dispatchEvent(new Event("library:refresh"));
    }
  };

  /** Set album color (media only). Optimistically updates local state, persists
   * to DB, and broadcasts so open tabs / other surfaces update live. */
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

  const commitRename = async (section: SectionKey, folder: FolderLite) => {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === folder.name) return;
    if (section === "map") {
      const current = readMapFolders(mapScope);
      if (current.some((f) => f.id !== folder.id && f.name.toLowerCase() === newName.toLowerCase())) {
        toast.error("A folder with this name already exists");
        return;
      }
      const oldName = folder.name;
      writeMapFolders(
        mapScope,
        current.map((f) => (f.id === folder.id ? { ...f, name: newName } : f)),
      );
      // Cascade rename to map items referencing this folder by name.
      try {
        const itemsKey = `map:items:${mapScope}`;
        const raw = localStorage.getItem(itemsKey);
        if (raw) {
          const items = JSON.parse(raw) as Array<{ folder: string | null }>;
          const next = items.map((it) =>
            it.folder === oldName ? { ...it, folder: newName } : it,
          );
          localStorage.setItem(itemsKey, JSON.stringify(next));
          window.dispatchEvent(new CustomEvent("map:refresh"));
        }
      } catch { /* ignore */ }
      toast.success("Renamed");
      return;
    }
    const table = tableFor(section);
    if (!table) return;
    const { error } = await supabase
      .from(table)
      .update({ name: newName })
      .eq("id", folder.id);
    if (error) { toast.error(error.message); return; }
    if (section === "meetings") {
      // Cascade rename to meetings referencing this folder by name
      await supabase
        .from("team_board_meetings")
        .update({ folder: newName })
        .eq("folder", folder.name);
    }
    toast.success("Renamed");
    void load();
    window.dispatchEvent(new Event("library:refresh"));
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { section, folder } = confirmDelete;
    setConfirmDelete(null);
    if (section === "map") {
      const current = readMapFolders(mapScope);
      writeMapFolders(mapScope, current.filter((f) => f.id !== folder.id));
      // Detach map items in this folder.
      try {
        const itemsKey = `map:items:${mapScope}`;
        const raw = localStorage.getItem(itemsKey);
        if (raw) {
          const items = JSON.parse(raw) as Array<{ folder: string | null; folderId: string | null }>;
          const next = items.map((it) =>
            it.folderId === folder.id ? { ...it, folder: null, folderId: null } : it,
          );
          localStorage.setItem(itemsKey, JSON.stringify(next));
          window.dispatchEvent(new CustomEvent("map:refresh"));
        }
      } catch { /* ignore */ }
      toast.success("Deleted");
      return;
    }
    const table = tableFor(section);
    if (!table) return;
    if (section === "meetings") {
      // Detach meetings referencing this folder before deleting it
      await supabase
        .from("team_board_meetings")
        .update({ folder: null })
        .eq("folder", folder.name);
    }
    const { error } = await supabase.from(table).delete().eq("id", folder.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      void load();
      window.dispatchEvent(new Event("library:refresh"));
    }
  };

  const allSections: {
    key: SectionKey;
    label: string;
    icon: React.ReactNode;
    rowIcon: React.ReactNode;
    folders: FolderLite[];
    folderLabel: string;
    folderKey: (f: FolderLite) => string;
    teamOnly?: boolean;
    derived?: boolean;
  }[] = [
    {
      key: "meetings",
      label: "Board Meetings",
      icon: <Briefcase className="h-3.5 w-3.5" strokeWidth={2.25} />,
      rowIcon: <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: meetingFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.name,
      teamOnly: true,
    },
    {
      key: "notes",
      label: "Notes",
      icon: <StickyNote className="h-3.5 w-3.5" strokeWidth={2.25} />,
      rowIcon: <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: noteFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.name,
    },
    {
      key: "files",
      label: "Files",
      icon: <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />,
      rowIcon: <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: fileFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.id,
    },
    {
      key: "media",
      label: "Media",
      icon: <ImageIcon className="h-3.5 w-3.5" strokeWidth={2.25} />,
      rowIcon: <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: mediaAlbums,
      folderLabel: "Albums",
      folderKey: (f) => f.id,
    },
    {
      key: "map",
      label: "Map",
      icon: <MapIcon className="h-3.5 w-3.5" strokeWidth={2.25} />,
      rowIcon: <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: mapFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.id,
    },
  ];
  const sections = allSections.filter((s) => !s.teamOnly || isTeamMode);

  const isPreviousActive = value.category === "previous";

  // dnd-kit sensors — small activation distance so click vs drag is clean
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragStart = (section: SectionKey, folders: FolderLite[]) => (e: DragStartEvent) => {
    const f = folders.find((x) => x.id === e.active.id);
    if (f) setActiveDrag({ section, folder: f });
  };

  const handleDragEnd = (section: SectionKey, folders: FolderLite[]) => (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = folders.findIndex((f) => f.id === active.id);
    const to = folders.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    // Disallow crossing pinned/unpinned groups
    if (folders[from].pinned !== folders[to].pinned) return;
    const next = arrayMove(folders, from, to);
    setStateFor(section, next);
    void persistOrder(section, next);
  };

  return (
    <nav className="flex flex-col gap-1">
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


      {sections.map((s) => {
        const isCategoryActive = value.category === s.key;
        const isAllActive = isCategoryActive && value.folder === "";
        const isUnsortedActive = isCategoryActive && value.folder === "__unsorted__";
        const isOpen = open[s.key];
        const handleCategoryClick = () => {
          // Only fold/unfold when already viewing this category's "All" view.
          // If in the category but inside a subfolder, first click navigates to "All".
          // If in a different category, first click navigates here.
          if (isAllActive) {
            setOpen((o) => ({ ...o, [s.key]: !o[s.key] }));
          } else {
            onChange({ category: s.key, folder: "" });
          }
        };

        const ids = s.folders.map((f) => f.id);

        return (
          <div key={s.key} className="flex flex-col">
            <button
              onClick={handleCategoryClick}
              className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
                isAllActive ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
              }`}
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
                {s.icon}
              </span>
              <span className="ml-2 min-w-0 flex-1 truncate">{s.label}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                  isOpen ? "rotate-90" : "rotate-0"
                }`}
              />
            </button>

            <motion.div
              initial={false}
              animate={{
                height: isOpen ? "auto" : 0,
                opacity: isOpen ? 1 : 0,
              }}
              transition={{
                height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: isOpen ? 0.18 : 0.12, ease: "easeOut", delay: isOpen ? 0.04 : 0 },
              }}
              style={{ overflow: isOpen ? "visible" : "hidden", willChange: "height, opacity", pointerEvents: isOpen ? "auto" : "none" }}
            >
                  <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2" style={{ overflow: "visible" }}>
                  <button
                    onClick={() => onChange({ category: s.key, folder: "__unsorted__" })}
                    className={`rounded-md px-3 py-1 text-left text-xs transition ${
                      isUnsortedActive
                        ? "bg-secondary font-medium text-ink"
                        : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    Unsorted
                  </button>

                  {s.derived ? (
                    s.folders.map((f) => {
                      const id = s.folderKey(f);
                      const active = isCategoryActive && value.folder === id;
                      return (
                        <FolderRow
                          key={f.id}
                          folder={f}
                          rowIcon={s.rowIcon}
                          active={active}
                          renaming={false}
                          renameValue=""
                          setRenameValue={() => {}}
                          onSelect={() => onChange({ category: s.key, folder: id })}
                          onOpenAsTab={
                            onOpenAsTab
                              ? () => onOpenAsTab({ category: s.key, folder: id }, f.name)
                              : undefined
                          }
                          onCommitRename={() => {}}
                          onCancelRename={() => {}}
                          menuOpen={false}
                          onToggleMenu={() => {}}
                          onCloseMenu={() => {}}
                          onPin={() => {}}
                          onRename={() => {}}
                          onDelete={() => {}}
                          showMenu={false}
                          sortable={false}
                        />
                      );
                    })
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                      onDragStart={handleDragStart(s.key, s.folders)}
                      onDragEnd={handleDragEnd(s.key, s.folders)}
                      onDragCancel={() => setActiveDrag(null)}
                    >
                      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-0.5">
                          <AnimatePresence initial={false}>
                            {s.folders.map((f) => {
                              const id = s.folderKey(f);
                              const active = isCategoryActive && value.folder === id;
                              return (
                                <SortableFolderRow
                                  key={f.id}
                                  folder={f}
                                  rowIcon={s.rowIcon}
                                  active={active}
                                  renaming={renamingId === f.id}
                                  renameValue={renameValue}
                                  setRenameValue={setRenameValue}
                                  onSelect={() => onChange({ category: s.key, folder: id })}
                                  onOpenAsTab={
                                    onOpenAsTab
                                      ? () => onOpenAsTab({ category: s.key, folder: id }, f.name, f.color ?? null)
                                      : undefined
                                  }
                                  onCommitRename={() => void commitRename(s.key, f)}
                                  onCancelRename={() => setRenamingId(null)}
                                  menuOpen={menuFor === f.id}
                                  onToggleMenu={() =>
                                    setMenuFor(menuFor === f.id ? null : f.id)
                                  }
                                  onCloseMenu={() => setMenuFor(null)}
                                  onPin={() => void togglePin(s.key, f)}
                                  onRename={() => startRename(f)}
                                  onColor={s.key === "media" ? (hex) => void setAlbumColor(f, hex) : undefined}
                                  onDelete={() =>
                                    setConfirmDelete({ section: s.key, folder: f })
                                  }
                                />
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      </SortableContext>

                      <DragOverlay
                        dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
                      >
                        {activeDrag && activeDrag.section === s.key ? (
                          <div className="rounded-md bg-card/95 px-3 py-1 text-xs text-ink shadow-lg ring-1 ring-hairline backdrop-blur-sm">
                            <div className="flex items-center gap-1.5">
                              {activeDrag.folder.pinned && (
                                <Pin className="h-2.5 w-2.5 fill-current text-ink/70" />
                              )}
                              <span className="truncate">{activeDrag.folder.name}</span>
                            </div>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  )}

                  {s.folders.length === 0 && (
                    <span className="px-3 py-1 text-[11px] text-muted-foreground/70">
                      No {s.folderLabel.toLowerCase()} yet
                    </span>
                  )}

                  {s.key === "media" && isTeamMode && (
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
                            <span className="px-3 py-1 text-[11px] text-muted-foreground/70">
                              No members yet
                            </span>
                          ) : (
                            memberAlbums.map((f) => {
                              const active = isCategoryActive && value.folder === f.id;
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
        );
      })}

      {confirmDelete && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setConfirmDelete(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-hairline bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-ink">
              Delete &ldquo;{confirmDelete.folder.name}&rdquo;?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This removes the {confirmDelete.section === "media" ? "album" : "folder"}.
              Items inside will become unsorted.
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
// Sortable wrapper
// ---------------------------------------------------------------------------

function SortableFolderRow(props: {
  folder: FolderLite;
  rowIcon?: React.ReactNode;
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
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.folder.id,
    disabled: props.renaming,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // hide original; DragOverlay shows the lifted clone
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <FolderRow {...props} sortable />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function FolderRow({
  folder,
  rowIcon,
  active,
  renaming,
  renameValue,
  setRenameValue,
  onSelect,
  onOpenAsTab,
  onCommitRename,
  onCancelRename,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onPin,
  onRename,
  onColor,
  onDelete,
  showMenu = true,
  sortable = true,
}: {
  folder: FolderLite;
  rowIcon?: React.ReactNode;
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
  showMenu?: boolean;
  sortable?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  void sortable;
  void menuOpen;
  void onToggleMenu;
  void onCloseMenu;

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
          {folder.pinned && (
            <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />
          )}
          {rowIcon && (
            <span
              className="shrink-0 text-muted-foreground"
              style={folder.color ? { color: folder.color } : undefined}
            >
              {rowIcon}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        </button>
      )}

      {!renaming && showMenu && (
        <CategoryActionsMenu
          trigger={
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              aria-label="Folder actions"
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
