import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  CheckSquare,
  Square,
  X,
  Trash2,
  MoreVertical,
  GripVertical,
  Pin,
  PinOff,
  StickyNote,
  FileText as NoteIcon,
} from "lucide-react";

interface NoteFolder {
  id: string;
  name: string;
  pinned: boolean;
  sort_order: number;
}

interface NoteRow {
  id: string;
  user_id: string;
  team_id: string | null;
  title: string;
  folder: string | null;
  body: string | null;
  updated_at: string;
  created_at: string;
}

export function NotesPage({
  actionsMount,
  onOpenNote,
}: {
  actionsMount?: HTMLDivElement | null;
  onOpenNote?: (id: string, kind: "new" | "earlier") => void;
}) {
  const { user, mode, activeEntityId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/media" }) as { tab?: string; new?: string };
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [view, setView] = useState<{ type: "all" } | { type: "folder"; name: string | null }>({
    type: "all",
  });
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);
  const [folderDragId, setFolderDragId] = useState<string | null>(null);
  const [folderDragHandle, setFolderDragHandle] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteFolder | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    if (isTeamMode) {
      let team: { id: string } | null = null;
      if (activeEntityId) {
        const { data } = await supabase.from("teams").select("id").eq("id", activeEntityId).maybeSingle();
        team = data ?? null;
      }
      if (!team) {
        const { data } = await supabase
          .from("teams").select("id").eq("owner_id", user.id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        team = data ?? null;
      }
      if (!team) {
        setTeamId(null); setFolders([]); setNotes([]); return;
      }
      setTeamId(team.id);
      const { data: f } = await supabase
        .from("note_folders").select("id,name,pinned,sort_order").eq("team_id", team.id)
        .order("pinned", { ascending: false }).order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setFolders((f ?? []) as NoteFolder[]);
      const { data: rows } = await supabase
        .from("notes").select("*").eq("team_id", team.id).order("updated_at", { ascending: false });
      setNotes((rows as NoteRow[]) ?? []);
    } else {
      setTeamId(null);
      const { data: f } = await supabase
        .from("note_folders").select("id,name,pinned,sort_order")
        .is("team_id", null).eq("user_id", user.id)
        .order("pinned", { ascending: false }).order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setFolders((f ?? []) as NoteFolder[]);
      const { data: rows } = await supabase
        .from("notes").select("*").is("team_id", null).eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setNotes((rows as NoteRow[]) ?? []);
    }
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => { void load(); }, [load]);

  // Auto-open the new-note dialog when ?new=1 is in URL (from + icon in left menu)
  useEffect(() => {
    if (search.new === "1" && search.tab === "notes") {
      setNewNoteOpen(true);
      // Clean the param so refresh doesn't re-open
      navigate({ to: "/media", search: { tab: "notes" }, replace: true });
    }
  }, [search.new, search.tab, navigate]);

  const persistFolderOrder = useCallback(async (next: NoteFolder[]) => {
    await Promise.all(
      next.map((f, idx) => supabase.from("note_folders").update({ sort_order: idx }).eq("id", f.id)),
    );
  }, []);

  const togglePin = async (folder: NoteFolder) => {
    setFolderMenuFor(null);
    const { error } = await supabase.from("note_folders").update({ pinned: !folder.pinned }).eq("id", folder.id);
    if (error) toast.error(error.message); else void load();
  };

  const deleteFolder = async (folder: NoteFolder) => {
    setConfirmDelete(null);
    // Move notes in this folder to Unsorted (folder = null)
    await supabase.from("notes").update({ folder: null }).eq("folder", folder.name).eq(isTeamMode ? "team_id" : "user_id", isTeamMode ? (teamId ?? "") : (user?.id ?? ""));
    const { error } = await supabase.from("note_folders").delete().eq("id", folder.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted "${folder.name}"`);
    if (view.type === "folder" && view.name === folder.name) setView({ type: "all" });
    void load();
  };

  const filtered = useMemo(() => {
    if (view.type === "all") return notes;
    if (view.name === null) return notes.filter((n) => !n.folder);
    return notes.filter((n) => n.folder === view.name);
  }, [notes, view]);

  const toggleSel = (id: string) => {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} note(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    await supabase.from("notes").delete().in("id", ids);
    toast.success("Deleted");
    exitSelect();
    void load();
  };

  const openNote = (id: string, kind: "new" | "earlier" = "earlier") => {
    if (onOpenNote) onOpenNote(id, kind);
    else navigate({ to: "/notes/$noteId", params: { noteId: id } });
  };

  if (authLoading || !user) return null;

  const actions = (
    <>
      {selectMode ? (
        <div className="flex items-center gap-2 rounded-full border border-hairline bg-card p-1 pr-2">
          <button
            onClick={handleDelete}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete ({selected.size})
          </button>
          <button onClick={exitSelect} className="ml-1 rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSelectMode(true)}
          className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          <CheckSquare className="h-3.5 w-3.5" /> Select
        </button>
      )}
      <button
        onClick={() => setCreateFolderOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
      >
        <Plus className="h-3.5 w-3.5" /> New folder
      </button>
      <button
        onClick={() => setNewNoteOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> New note
      </button>
    </>
  );

  return (
    <div>
      {actionsMount && createPortal(actions, actionsMount)}

      <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr]">
        <nav className="-ml-2 flex flex-col gap-0.5">
          <NavBtn active={view.type === "all"} onClick={() => setView({ type: "all" })}>All</NavBtn>
          <button
            onClick={() => setFoldersOpen((o) => !o)}
            className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:text-ink"
          >
            <span>Folders</span>
            {foldersOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {foldersOpen && (
            <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
              <NavBtn small active={view.type === "folder" && view.name === null} onClick={() => setView({ type: "folder", name: null })}>
                Unsorted
              </NavBtn>
              {folders.map((a) => {
                const active = view.type === "folder" && view.name === a.name;
                const isDragging = folderDragId === a.id;
                return (
                  <div
                    key={a.id}
                    draggable={folderDragHandle === a.id}
                    onDragStart={(e) => {
                      if (folderDragHandle !== a.id) { e.preventDefault(); return; }
                      setFolderDragId(a.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", a.id);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      if (folderDragId && folderDragId !== a.id) {
                        setFolders((arr) => {
                          const from = arr.findIndex((x) => x.id === folderDragId);
                          const to = arr.findIndex((x) => x.id === a.id);
                          if (from < 0 || to < 0 || from === to) return arr;
                          if (arr[from].pinned !== arr[to].pinned) return arr;
                          const next = [...arr]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
                          return next;
                        });
                      }
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDragEnd={() => {
                      const final = folders;
                      setFolderDragId(null); setFolderDragHandle(null);
                      void persistFolderOrder(final);
                    }}
                    onDrop={(e) => e.preventDefault()}
                    className={`group relative flex items-center gap-1 rounded-md transition ${
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    } ${isDragging ? "opacity-40" : ""}`}
                  >
                    <span
                      className="grid h-7 w-4 shrink-0 cursor-grab place-items-center text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-ink active:cursor-grabbing"
                      onMouseDown={() => setFolderDragHandle(a.id)}
                      onMouseUp={() => setFolderDragHandle(null)}
                      onMouseLeave={() => { if (!folderDragId) setFolderDragHandle(null); }}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-3 w-3" />
                    </span>
                    <button
                      onClick={() => setView({ type: "folder", name: a.name })}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1 text-left text-xs transition ${
                        active ? "font-medium text-ink" : "text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {a.pinned && <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />}
                      <span className="truncate">{a.name}</span>
                    </button>
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setFolderMenuFor(folderMenuFor === a.id ? null : a.id); }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
                        data-open={folderMenuFor === a.id}
                        aria-label="Folder actions"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {folderMenuFor === a.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setFolderMenuFor(null)} />
                          <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-md border border-hairline bg-card shadow-lg">
                            <button
                              onClick={() => togglePin(a)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                            >
                              {a.pinned ? <><PinOff className="h-3.5 w-3.5" /> Unpin</> : <><Pin className="h-3.5 w-3.5" /> Pin to top</>}
                            </button>
                            <button
                              onClick={() => { setFolderMenuFor(null); setConfirmDelete(a); }}
                              className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {folders.length === 0 && (
                <span className="px-3 py-1.5 text-xs text-muted-foreground">No folders yet</span>
              )}
            </div>
          )}
        </nav>

        <section>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-20 text-center text-sm text-muted-foreground">
              No notes yet. Create your first note.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((n) => {
                const isSel = selected.has(n.id);
                return (
                  <div
                    key={n.id}
                    onClick={() => { if (selectMode) toggleSel(n.id); else openNote(n.id); }}
                    className="group relative flex aspect-square cursor-pointer flex-col overflow-hidden rounded-xl border border-hairline bg-card p-3 transition hover:border-ink/20"
                  >
                    {selectMode && (
                      <div className="absolute left-2 top-2 z-10 rounded-full bg-background/80 p-0.5">
                        {isSel ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    )}
                    <div className="flex flex-1 items-center justify-center">
                      <StickyNote className="h-12 w-12 text-muted-foreground/60" strokeWidth={1.25} />
                    </div>
                    <div className="mt-2 min-w-0">
                      <p className="truncate text-xs text-ink" title={n.title}>{n.title}</p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{n.folder ?? "Unsorted"}</span>
                        <span className="mono">{new Date(n.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {n.user_id === user.id && (
                      <div className="absolute right-2 top-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMenuFor((c) => (c === n.id ? null : n.id)); }}
                          className="rounded-full bg-card/90 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
                          data-open={menuFor === n.id}
                          aria-label="More"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === n.id && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setMenuFor(null)} />
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-lg border border-hairline bg-card text-xs shadow-xl"
                            >
                              <button
                                onClick={() => { setMenuFor(null); openNote(n.id); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                              >
                                <NoteIcon className="h-3.5 w-3.5" /> Open
                              </button>
                              <button
                                onClick={async () => {
                                  setMenuFor(null);
                                  if (!confirm(`Delete "${n.title}"?`)) return;
                                  await supabase.from("notes").delete().eq("id", n.id);
                                  toast.success("Deleted");
                                  void load();
                                }}
                                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {createFolderOpen && (
        <CreateFolderDialog
          onClose={() => setCreateFolderOpen(false)}
          onCreated={() => { setCreateFolderOpen(false); void load(); }}
          userId={user.id}
          teamId={isTeamMode ? teamId : null}
        />
      )}

      {newNoteOpen && (
        <NewNoteDialog
          folders={folders.map((f) => f.name)}
          onClose={() => setNewNoteOpen(false)}
          onCreate={async (title, folder) => {
            const { data, error } = await supabase
              .from("notes")
              .insert({
                user_id: user.id,
                team_id: isTeamMode ? teamId : null,
                title: title || "Untitled note",
                folder: folder || null,
              })
              .select("id")
              .single();
            if (error) { toast.error(error.message); return; }
            setNewNoteOpen(false);
            toast.success("Note created");
            navigate({ to: "/notes/$noteId", params: { noteId: data!.id } });
          }}
          onCreateFolder={async (name) => {
            const { error } = await supabase
              .from("note_folders")
              .insert({ user_id: user.id, team_id: isTeamMode ? teamId : null, name });
            if (error) { toast.error(error.message); return false; }
            await load();
            return true;
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete folder?"
          message={<><span className="font-medium text-ink">"{confirmDelete.name}"</span> will be removed. Notes inside will move to <span className="font-medium text-ink">Unsorted</span>.</>}
          confirmLabel="Delete folder"
          destructive
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void deleteFolder(confirmDelete)}
        />
      )}
    </div>
  );
}

/* ───────── helpers ───────── */

function NavBtn({
  active, onClick, children, small,
}: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} text-left transition ${
        active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:text-ink"
      }`}
    >{children}</button>
  );
}

function CreateFolderDialog({
  onClose, onCreated, userId, teamId,
}: { onClose: () => void; onCreated: () => void; userId: string; teamId: string | null }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("note_folders").insert({ user_id: userId, team_id: teamId, name: name.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Folder created");
    onCreated();
  };
  return (
    <Modal title="New folder" onClose={onClose}>
      <label className="block">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</span>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
          className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink">Cancel</button>
        <button onClick={create} disabled={busy || !name.trim()} className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
  );
}

function NewNoteDialog({
  folders, onClose, onCreate, onCreateFolder,
}: {
  folders: string[];
  onClose: () => void;
  onCreate: (title: string, folder: string) => void | Promise<void>;
  onCreateFolder: (name: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [draftFolder, setDraftFolder] = useState("");

  const commitFolder = async () => {
    const name = draftFolder.trim();
    if (!name) { toast.error("Folder name is required"); return; }
    if (folders.includes(name)) { toast.error("A folder with that name already exists"); return; }
    const ok = await onCreateFolder(name);
    if (ok) {
      setFolder(name);
      setDraftFolder("");
      setCreatingFolder(false);
      toast.success(`Folder "${name}" created`);
    }
  };

  return (
    <Modal title="New note" onClose={onClose}>
      <label className="block">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Name</span>
        <input
          autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void onCreate(title.trim() || "Untitled note", folder); }}
          placeholder="Note title"
          className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
      </label>
      <div className="mt-4">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Folder</span>
        {creatingFolder ? (
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-hairline bg-background pr-1 focus-within:border-primary">
            <input
              autoFocus value={draftFolder} onChange={(e) => setDraftFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void commitFolder(); }
                else if (e.key === "Escape") { setDraftFolder(""); setCreatingFolder(false); }
              }}
              placeholder="New folder name"
              className="flex-1 bg-transparent px-4 py-2.5 text-sm text-ink outline-none"
            />
            <button type="button" onClick={() => void commitFolder()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">
              Add folder
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <select
              value={folder} onChange={(e) => setFolder(e.target.value)}
              className="flex-1 rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
            >
              <option value="">None</option>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <button
              type="button" onClick={() => { setDraftFolder(""); setCreatingFolder(true); }}
              title="Add folder" aria-label="Add folder"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-background text-ink hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink">Cancel</button>
        <button
          onClick={() => void onCreate(title.trim() || "Untitled note", folder)}
          className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90"
        >
          Save note
        </button>
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  title, message, confirmLabel, destructive, onCancel, onConfirm,
}: {
  title: string; message: React.ReactNode; confirmLabel: string;
  destructive?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink">Cancel</button>
        <button
          onClick={onConfirm}
          className={`rounded-full px-5 py-2 text-xs ${
            destructive ? "bg-destructive text-destructive-foreground hover:opacity-90" : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >{confirmLabel}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
