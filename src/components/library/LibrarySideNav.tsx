import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ChevronRight,
  StickyNote,
  FolderClosed,
  Image as ImageIcon,
  Pin,
  PinOff,
  History,
  Briefcase,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

export type LibraryCategory = "previous" | "meetings" | "notes" | "files" | "media";

interface FolderLite {
  id: string;
  name: string;
  pinned: boolean;
}

export interface LibrarySideNavValue {
  category: LibraryCategory;
  /** For notes: folder name (string) or null = unsorted, "" = all.
   *  For files/media: folder/album id (string) or null = unsorted, "" = all. */
  folder: string;
}

type SectionKey = "meetings" | "notes" | "files" | "media";

type TableName = "note_folders" | "file_folders" | "media_albums";

export function LibrarySideNav({
  value,
  onChange,
}: {
  value: LibrarySideNavValue;
  onChange: (v: LibrarySideNavValue) => void;
}) {
  const { user, mode, activeEntityId } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  const [noteFolders, setNoteFolders] = useState<FolderLite[]>([]);
  const [fileFolders, setFileFolders] = useState<FolderLite[]>([]);
  const [mediaAlbums, setMediaAlbums] = useState<FolderLite[]>([]);
  const [meetingFolders, setMeetingFolders] = useState<FolderLite[]>([]);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    meetings: true,
    notes: true,
    files: true,
    media: true,
  });

  // Per-row UI state
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    section: SectionKey;
    folder: FolderLite;
  } | null>(null);

  // Drag state — keyed per-section so a drag in Notes can't reorder Files
  const [dragSection, setDragSection] = useState<SectionKey | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

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
          .select("id,name,pinned")
          .order("pinned", { ascending: false })
          .order("sort_order", { ascending: true }),
      ),
    ]);
    setNoteFolders((nf ?? []) as FolderLite[]);
    setFileFolders((ff ?? []) as FolderLite[]);
    setMediaAlbums((ma ?? []) as FolderLite[]);

    // Meetings: derive folder names from team_board_meetings (team mode only)
    if (isTeamMode && teamId) {
      const { data: mtgs } = await supabase
        .from("team_board_meetings")
        .select("folder")
        .eq("team_id", teamId);
      const seen = new Set<string>();
      const list: FolderLite[] = [];
      for (const row of (mtgs ?? []) as { folder: string | null }[]) {
        if (row.folder && !seen.has(row.folder)) {
          seen.add(row.folder);
          list.push({ id: row.folder, name: row.folder, pinned: false });
        }
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMeetingFolders(list);
    } else {
      setMeetingFolders([]);
    }
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`library-side-nav-${user?.id ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "note_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "file_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "media_albums" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "team_board_meetings" }, () => load())
      .subscribe();
    const onLocal = () => void load();
    window.addEventListener("library:refresh", onLocal);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("library:refresh", onLocal);
    };
  }, [load, user?.id]);

  // ----- Helpers ----------------------------------------------------------

  const tableFor = (section: SectionKey): TableName | null => {
    if (section === "notes") return "note_folders";
    if (section === "files") return "file_folders";
    if (section === "media") return "media_albums";
    return null; // meetings: derived
  };

  const setStateFor = (section: SectionKey, updater: (arr: FolderLite[]) => FolderLite[]) => {
    if (section === "notes") setNoteFolders(updater);
    else if (section === "files") setFileFolders(updater);
    else if (section === "media") setMediaAlbums(updater);
    else if (section === "meetings") setMeetingFolders(updater);
  };

  const persistOrder = async (section: SectionKey, next: FolderLite[]) => {
    const table = tableFor(section);
    if (!table) return;
    await Promise.all(
      next.map((f, idx) =>
        supabase.from(table).update({ sort_order: idx }).eq("id", f.id),
      ),
    );
    window.dispatchEvent(new Event("library:refresh"));
  };

  const togglePin = async (section: SectionKey, folder: FolderLite) => {
    setMenuFor(null);
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

  const startRename = (folder: FolderLite) => {
    setMenuFor(null);
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  };

  const commitRename = async (section: SectionKey, folder: FolderLite) => {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === folder.name) return;
    const table = tableFor(section);
    if (!table) return;
    const { error } = await supabase
      .from(table)
      .update({ name: newName })
      .eq("id", folder.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Renamed");
      void load();
      window.dispatchEvent(new Event("library:refresh"));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { section, folder } = confirmDelete;
    setConfirmDelete(null);
    const table = tableFor(section);
    if (!table) return;
    const { error } = await supabase.from(table).delete().eq("id", folder.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      void load();
      window.dispatchEvent(new Event("library:refresh"));
    }
  };

  // ----- Sections ---------------------------------------------------------

  const allSections: {
    key: SectionKey;
    label: string;
    icon: React.ReactNode;
    folders: FolderLite[];
    folderLabel: string;
    folderKey: (f: FolderLite) => string;
    teamOnly?: boolean;
    derived?: boolean; // meetings: no DnD / menu
  }[] = [
    {
      key: "meetings",
      label: "Meetings",
      icon: <Briefcase className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: meetingFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.name,
      teamOnly: true,
      derived: true,
    },
    {
      key: "notes",
      label: "Notes",
      icon: <StickyNote className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: noteFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.name,
    },
    {
      key: "files",
      label: "Files",
      icon: <FolderClosed className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: fileFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.id,
    },
    {
      key: "media",
      label: "Media",
      icon: <ImageIcon className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: mediaAlbums,
      folderLabel: "Albums",
      folderKey: (f) => f.id,
    },
  ];
  const sections = allSections.filter((s) => !s.teamOnly || isTeamMode);

  const isPreviousActive = value.category === "previous";

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
          if (isCategoryActive && isOpen) {
            setOpen((o) => ({ ...o, [s.key]: false }));
          } else {
            setOpen((o) => ({ ...o, [s.key]: true }));
            onChange({ category: s.key, folder: "" });
          }
        };

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

            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2">
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

                  {s.folders.map((f) => {
                    const id = s.folderKey(f);
                    const active = isCategoryActive && value.folder === id;
                    const isDragging = dragSection === s.key && dragId === f.id;
                    const draggable = !s.derived;

                    return (
                      <FolderRow
                        key={f.id}
                        folder={f}
                        active={active}
                        isDragging={isDragging}
                        draggable={draggable}
                        renaming={renamingId === f.id}
                        renameValue={renameValue}
                        setRenameValue={setRenameValue}
                        onSelect={() => onChange({ category: s.key, folder: id })}
                        onCommitRename={() => void commitRename(s.key, f)}
                        onCancelRename={() => setRenamingId(null)}
                        menuOpen={menuFor === f.id}
                        onToggleMenu={() =>
                          setMenuFor(menuFor === f.id ? null : f.id)
                        }
                        onCloseMenu={() => setMenuFor(null)}
                        onPin={() => void togglePin(s.key, f)}
                        onRename={() => startRename(f)}
                        onDelete={() =>
                          setConfirmDelete({ section: s.key, folder: f })
                        }
                        onDragStartRow={() => {
                          setDragSection(s.key);
                          setDragId(f.id);
                        }}
                        onDragEnterRow={() => {
                          if (
                            dragSection === s.key &&
                            dragId &&
                            dragId !== f.id
                          ) {
                            setStateFor(s.key, (arr) => {
                              const from = arr.findIndex((x) => x.id === dragId);
                              const to = arr.findIndex((x) => x.id === f.id);
                              if (from < 0 || to < 0 || from === to) return arr;
                              if (arr[from].pinned !== arr[to].pinned) return arr;
                              const next = [...arr];
                              const [moved] = next.splice(from, 1);
                              next.splice(to, 0, moved);
                              return next;
                            });
                          }
                        }}
                        onDragEndRow={() => {
                          const sec = dragSection;
                          setDragId(null);
                          setDragSection(null);
                          if (!sec) return;
                          const arr =
                            sec === "notes"
                              ? noteFolders
                              : sec === "files"
                              ? fileFolders
                              : sec === "media"
                              ? mediaAlbums
                              : null;
                          if (arr) void persistOrder(sec, arr);
                        }}
                      />
                    );
                  })}
                  {s.folders.length === 0 && (
                    <span className="px-3 py-1 text-[11px] text-muted-foreground/70">
                      No {s.folderLabel.toLowerCase()} yet
                    </span>
                  )}
                </div>
              </div>
            </div>
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
// Row component
// ---------------------------------------------------------------------------

function FolderRow({
  folder,
  active,
  isDragging,
  draggable,
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
  onDragStartRow,
  onDragEnterRow,
  onDragEndRow,
}: {
  folder: FolderLite;
  active: boolean;
  isDragging: boolean;
  draggable: boolean;
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
  onDragStartRow: () => void;
  onDragEnterRow: () => void;
  onDragEndRow: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  return (
    <div
      draggable={draggable && !renaming}
      onDragStart={(e) => {
        if (!draggable || renaming) {
          e.preventDefault();
          return;
        }
        onDragStartRow();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", folder.id);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnterRow();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnd={() => onDragEndRow()}
      onDrop={(e) => e.preventDefault()}
      className={`group relative flex items-center gap-1 rounded-md pr-1 transition-all duration-150 ease-out ${
        active ? "bg-secondary" : "hover:bg-secondary/70"
      } ${isDragging ? "opacity-40" : ""}`}
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
        <div className="relative shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            data-open={menuOpen}
            aria-label="Folder actions"
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={onCloseMenu} />
              <div className="absolute right-0 top-7 z-50 w-40 overflow-hidden rounded-lg border border-hairline bg-card py-1 shadow-lg">
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
            </>
          )}
        </div>
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
