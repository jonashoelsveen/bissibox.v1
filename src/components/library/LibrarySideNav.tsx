import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  ChevronRight,
  StickyNote,
  FolderClosed,
  Image as ImageIcon,
  Pin,
  History,
  Briefcase,
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
  const [open, setOpen] = useState<Record<"meetings" | "notes" | "files" | "media", boolean>>({
    meetings: true,
    notes: true,
    files: true,
    media: true,
  });

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
    // Reload when sub-pages mutate folders/albums
    const ch = supabase
      .channel(`library-side-nav-${user?.id ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "note_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "file_folders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "media_albums" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "team_board_meetings" }, () => load())
      .subscribe();
    // Local same-tab signal so creations reflect immediately, even without realtime
    const onLocal = () => void load();
    window.addEventListener("library:refresh", onLocal);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("library:refresh", onLocal);
    };
  }, [load, user?.id]);

  const allSections: {
    key: "meetings" | "notes" | "files" | "media";
    label: string;
    icon: React.ReactNode;
    folders: FolderLite[];
    folderLabel: string;
    /** For notes/meetings folder identifier is the name; for files/media it's the id. */
    folderKey: (f: FolderLite) => string;
    teamOnly?: boolean;
  }[] = [
    {
      key: "meetings",
      label: "Meetings",
      icon: <Briefcase className="h-3.5 w-3.5" strokeWidth={2.25} />,
      folders: meetingFolders,
      folderLabel: "Folders",
      folderKey: (f) => f.name,
      teamOnly: true,
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
          // Single click: select category AND toggle expansion smoothly.
          // If category is already active and open, collapse it; otherwise open + select.
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
                    return (
                      <button
                        key={f.id}
                        onClick={() => onChange({ category: s.key, folder: id })}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs transition ${
                          active
                            ? "bg-secondary font-medium text-ink"
                            : "text-muted-foreground hover:text-ink"
                        }`}
                      >
                        {f.pinned && (
                          <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />
                        )}
                        <span className="truncate">{f.name}</span>
                      </button>
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
    </nav>
  );
}
