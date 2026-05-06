import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Briefcase,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { MeetingsListPage } from "@/components/library/MeetingsListPage";
import { TeamBoardPage } from "@/routes/team.board";
import { meetingTables } from "@/lib/meeting-kind";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLES = meetingTables("group");

type SearchT = { tab?: "meetings"; folder?: string; open?: string };

export const Route = createFileRoute("/team/group-meetings")({
  component: GroupMeetingsPage,
  validateSearch: (s: Record<string, unknown>): SearchT => ({
    tab: s.tab === "meetings" ? "meetings" : undefined,
    folder: typeof s.folder === "string" ? (s.folder as string) : undefined,
    open: typeof s.open === "string" ? (s.open as string) : undefined,
  }),
  head: () => ({ meta: [{ title: "Group Meetings · Raceline" }] }),
});

interface OpenTab {
  id: string;
  title: string;
  folder: string | null;
  kind: "new" | "earlier";
}

interface FolderRow {
  id: string;
  name: string;
  pinned: boolean;
}

const MAX_TABS = 10;

function GroupMeetingsPage() {
  const search = useSearch({ from: "/team/group-meetings" });
  const navigate = useNavigate();
  const { user, mode, activeEntityId, loading: authLoading } = useAuth();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actionsMount, setActionsMount] = useState<HTMLDivElement | null>(null);
  const [newMeetingSignal, setNewMeetingSignal] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const folder = search.folder ?? "";
  const externalView: { type: "all" } | { type: "folder"; name: string | null } =
    folder === "" ? { type: "all" } : folder === "__unsorted__"
      ? { type: "folder", name: null }
      : { type: "folder", name: folder };

  const setFolder = (f: string) => {
    setActiveId(null);
    navigate({
      to: "/team/group-meetings",
      search: { tab: "meetings", folder: f || undefined },
      replace: true,
    });
  };

  const openMeetingTab = useCallback(
    (m: { id: string; title: string; folder: string | null }, kind: "new" | "earlier" = "earlier") => {
      setOpenTabs((prev) => {
        if (prev.some((t) => t.id === m.id)) return prev;
        if (prev.length >= MAX_TABS) {
          toast.error(`You can have at most ${MAX_TABS} tabs open at once.`);
          return prev;
        }
        return [...prev, { id: m.id, title: m.title, folder: m.folder, kind }];
      });
      setActiveId(m.id);
    },
    [],
  );

  const closeTab = (id: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        if (next.length === 0) setActiveId(null);
        else setActiveId(next[Math.max(0, (idx === -1 ? 0 : idx) - 1)].id);
      }
      return next;
    });
  };

  const showingMeeting = !!activeId;

  if (!user) return null;
  if (!isTeamMode) {
    return (
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">
        Group Meetings are available in team mode only.
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6">
      {/* Top tab bar — single fixed "Meetings" + open meeting tabs */}
      <div className="sticky top-14 z-20 -mx-4 flex items-end justify-between gap-0 border-b border-hairline bg-background pl-4 pr-4 md:-mx-6 md:pl-6 md:pr-6">
        <button
          onClick={() => setActiveId(null)}
          className={`-mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 py-2.5 pl-0 pr-4 text-sm font-medium ${
            showingMeeting
              ? "border-transparent text-muted-foreground hover:text-ink"
              : "border-primary text-ink"
          }`}
          style={{ width: 220, justifyContent: "flex-start" }}
          title="Group Meetings"
        >
          <Briefcase className="h-3.5 w-3.5 opacity-70" strokeWidth={2.25} />
          <span>Meetings</span>
        </button>
        <nav className="flex min-w-0 flex-1 items-end overflow-x-auto pl-2">
          {openTabs.map((t) => {
            const isActive = activeId === t.id;
            const isNew = t.kind === "new";
            const colorActive = isNew
              ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
              : "border-muted-foreground text-ink";
            const colorIdle = isNew
              ? "border-transparent text-emerald-600/80 hover:text-emerald-700 dark:text-emerald-400/80"
              : "border-transparent text-muted-foreground hover:text-ink";
            const dotColor = isNew ? "bg-emerald-500" : "bg-muted-foreground/60";
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                style={{ flex: "1 1 200px", minWidth: 140, maxWidth: 240 }}
                className={`group -mb-px inline-flex shrink-0 select-none items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${
                  isActive ? colorActive : colorIdle
                }`}
                title={t.title}
              >
                <Briefcase className="h-3 w-3 shrink-0 opacity-70" />
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                <span className="min-w-0 flex-1 truncate text-left">
                  {t.folder ? `${t.folder} · ${t.title}` : t.title}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className="ml-1 shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </nav>
        <div ref={setActionsMount} className="flex shrink-0 items-center gap-2 pb-1.5 pl-2" />
      </div>

      <div className="grid gap-6 pt-4 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-28 md:self-start">
          <GroupFoldersSideNav
            activeFolder={folder}
            onSelect={setFolder}
            onNewMeeting={() => {
              setActiveId(null);
              setNewMeetingSignal((n) => n + 1);
            }}
          />
        </aside>
        <div className="min-w-0">
          {showingMeeting && activeId ? (
            <TeamBoardPage
              key={activeId}
              kind="group"
              embedded
              hideOwnTabBar
              forceMeetingId={activeId}
              onMeetingOpened={(m) =>
                openMeetingTab({ id: m.id, title: m.title, folder: m.folder }, m.kind)
              }
              onMeetingDeleted={(id) => closeTab(id)}
            />
          ) : (
            <MeetingsListPage
              kind="group"
              actionsMount={actionsMount}
              externalView={externalView}
              newMeetingSignal={newMeetingSignal}
              onOpenMeeting={(m) => openMeetingTab(m, "earlier")}
              onMeetingCreated={(m) => openMeetingTab(m, "new")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Side nav (group meeting folders only)
// ──────────────────────────────────────────────────────────────────────────────

function GroupFoldersSideNav({
  activeFolder,
  onSelect,
  onNewMeeting,
}: {
  activeFolder: string;
  onSelect: (folder: string) => void;
  onNewMeeting: () => void;
}) {
  const { user, activeEntityId } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [open, setOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FolderRow | null>(null);

  const loadTeam = useCallback(async () => {
    if (!user) return;
    let t: { id: string } | null = null;
    if (activeEntityId) {
      const { data } = await supabase
        .from("teams").select("id").eq("id", activeEntityId).maybeSingle();
      t = data ?? null;
    }
    if (!t) {
      const { data } = await supabase
        .from("teams").select("id").eq("owner_id", user.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      t = data ?? null;
    }
    setTeamId(t?.id ?? null);
  }, [user, activeEntityId]);

  const loadFolders = useCallback(async () => {
    if (!teamId) { setFolders([]); return; }
    const { data } = await sb
      .from(TABLES.folders)
      .select("id,name,pinned")
      .eq("team_id", teamId)
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });
    setFolders((data ?? []) as FolderRow[]);
  }, [teamId]);

  useEffect(() => { void loadTeam(); }, [loadTeam]);
  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => {
    const onLocal = () => void loadFolders();
    window.addEventListener("group-meetings:refresh", onLocal);
    const ch = supabase
      .channel(`group-meetings-folders-${user?.id ?? "anon"}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: TABLES.folders }, () => loadFolders())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: TABLES.meetings }, () => loadFolders())
      .subscribe();
    return () => {
      window.removeEventListener("group-meetings:refresh", onLocal);
      void supabase.removeChannel(ch);
    };
  }, [loadFolders, user?.id]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = folders.findIndex((f) => f.id === active.id);
    const to = folders.findIndex((f) => f.id === over.id);
    if (from < 0 || to < 0) return;
    if (folders[from].pinned !== folders[to].pinned) return;
    const next = arrayMove(folders, from, to);
    setFolders(next);
    await Promise.all(next.map((f, idx) =>
      sb.from(TABLES.folders).update({ sort_order: idx }).eq("id", f.id),
    ));
  };

  const togglePin = async (f: FolderRow) => {
    setMenuFor(null);
    const { error } = await sb.from(TABLES.folders).update({ pinned: !f.pinned }).eq("id", f.id);
    if (error) toast.error(error.message);
    else void loadFolders();
  };

  const commitRename = async (f: FolderRow) => {
    const newName = renameValue.trim();
    setRenamingId(null);
    if (!newName || newName === f.name) return;
    const { error } = await sb.from(TABLES.folders).update({ name: newName }).eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    await sb.from(TABLES.meetings).update({ folder: newName }).eq("folder", f.name);
    toast.success("Renamed");
    void loadFolders();
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const f = confirmDelete;
    setConfirmDelete(null);
    await sb.from(TABLES.meetings).update({ folder: null }).eq("folder", f.name);
    const { error } = await sb.from(TABLES.folders).delete().eq("id", f.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); void loadFolders(); }
  };

  const ids = folders.map((f) => f.id);
  const isAllActive = activeFolder === "";
  const isUnsortedActive = activeFolder === "__unsorted__";

  return (
    <nav className="flex flex-col gap-1">
      <div className="flex items-center">
        <button
          onClick={() => {
            if (isAllActive) setOpen((o) => !o);
            else onSelect("");
          }}
          className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
            isAllActive ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
          }`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="ml-2 min-w-0 flex-1 truncate">Meetings</span>
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-90" : "rotate-0"
            }`}
          />
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ height: { duration: 0.24 }, opacity: { duration: 0.18 } }}
        style={{ overflow: open ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2">
          <button
            onClick={() => onSelect("__unsorted__")}
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
            onDragEnd={onDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-0.5">
                <AnimatePresence initial={false}>
                  {folders.map((f) => (
                    <SortableFolderRow
                      key={f.id}
                      folder={f}
                      active={activeFolder === f.name}
                      renaming={renamingId === f.id}
                      renameValue={renameValue}
                      setRenameValue={setRenameValue}
                      onSelect={() => onSelect(f.name)}
                      onCommitRename={() => void commitRename(f)}
                      onCancelRename={() => setRenamingId(null)}
                      menuOpen={menuFor === f.id}
                      onToggleMenu={() => setMenuFor(menuFor === f.id ? null : f.id)}
                      onCloseMenu={() => setMenuFor(null)}
                      onPin={() => void togglePin(f)}
                      onRename={() => {
                        setMenuFor(null);
                        setRenamingId(f.id);
                        setRenameValue(f.name);
                      }}
                      onDelete={() => {
                        setMenuFor(null);
                        setConfirmDelete(f);
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </motion.div>

      {confirmDelete && createPortal(
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-hairline bg-popover p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg text-ink">Delete folder?</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              "{confirmDelete.name}" will be deleted. Meetings inside will become unsorted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
              >Cancel</button>
              <button
                onClick={() => void doDelete()}
                className="rounded-full bg-destructive px-4 py-2 text-xs text-destructive-foreground hover:opacity-90"
              >Delete</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </nav>
  );
}

function SortableFolderRow({
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
  folder: FolderRow;
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: folder.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      layout
      className={`group flex items-center gap-1 rounded-md transition ${
        active ? "bg-secondary" : "hover:bg-secondary/60"
      }`}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            else if (e.key === "Escape") onCancelRename();
          }}
          className="flex-1 rounded-md bg-transparent px-3 py-1 text-xs text-ink outline-none"
        />
      ) : (
        <button
          onClick={onSelect}
          className={`flex-1 truncate px-3 py-1 text-left text-xs transition ${
            active ? "font-medium text-ink" : "text-muted-foreground hover:text-ink"
          }`}
        >
          {folder.pinned && <Pin className="mr-1 inline h-3 w-3" />}
          {folder.name}
        </button>
      )}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
          className="rounded p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-ink"
          aria-label="Folder menu"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={onCloseMenu} />
            <div className="absolute right-0 z-40 mt-1 min-w-[140px] rounded-md border border-hairline bg-popover p-1 shadow-lg">
              <button
                onClick={onPin}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-ink hover:bg-secondary"
              >
                {folder.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                {folder.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                onClick={onRename}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-ink hover:bg-secondary"
              >
                <Pencil className="h-3 w-3" /> Rename
              </button>
              <button
                onClick={onDelete}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
