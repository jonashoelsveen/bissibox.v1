import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { scanFile, pollScan } from "@/server/scan-file";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  CheckSquare,
  Square,
  X,
  Trash2,
  MoreVertical,
  GripVertical,
  Pin,
  PinOff,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Download,
} from "lucide-react";

interface Folder {
  id: string;
  name: string;
  pinned: boolean;
  sort_order: number;
}

interface FileRow {
  id: string;
  user_id: string;
  team_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  folder_id: string | null;
  scan_status: "pending" | "safe" | "infected" | "error";
  scanned_at: string | null;
  created_at: string;
}

function formatBytes(n: number | null) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function FilesPage({
  actionsMount,
  hideSideNav,
  externalView,
  hideNewActions,
  onOpenFile,
}: {
  actionsMount?: HTMLDivElement | null;
  hideSideNav?: boolean;
  externalView?: { type: "all" } | { type: "folder"; id: string | null };
  hideNewActions?: boolean;
  onOpenFile?: (id: string) => void;
} = {}) {
  const { user, session, mode, activeEntityId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;
  const accessToken = session?.access_token ?? null;
  const runScan = useServerFn(scanFile);
  const runPoll = useServerFn(pollScan);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [internalView, setInternalView] = useState<{ type: "all" } | { type: "folder"; id: string | null }>({
    type: "all",
  });
  const view = externalView ?? internalView;
  const setView = setInternalView;
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [folderMenuFor, setFolderMenuFor] = useState<string | null>(null);
  const [folderDragId, setFolderDragId] = useState<string | null>(null);
  const [folderDragHandle, setFolderDragHandle] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Folder | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  // Auto-open the import dialog when ?new=1 is in URL (from + dropdown in Previous tab)
  const search = useSearch({ from: "/media" });
  useEffect(() => {
    if (search.new === "1" && search.tab === "files") {
      setImportOpen(true);
      navigate({ to: "/media", search: { tab: "files" }, replace: true });
    }
  }, [search.new, search.tab, navigate]);

  const persistFolderOrder = useCallback(async (next: Folder[]) => {
    await Promise.all(
      next.map((f, idx) =>
        supabase.from("file_folders").update({ sort_order: idx }).eq("id", f.id),
      ),
    );
  }, []);

  const togglePin = async (folder: Folder) => {
    setFolderMenuFor(null);
    const { error } = await supabase
      .from("file_folders")
      .update({ pinned: !folder.pinned })
      .eq("id", folder.id);
    if (error) toast.error(error.message);
    else void load();
  };

  const deleteFolder = async (folder: Folder) => {
    setConfirmDelete(null);
    const { error } = await supabase.from("file_folders").delete().eq("id", folder.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted "${folder.name}"`);
    if (view.type === "folder" && view.id === folder.id) setView({ type: "all" });
    void load();
  };

  const load = useCallback(async () => {
    if (!user) return;
    if (isTeamMode) {
      let team: { id: string } | null = null;
      if (activeEntityId) {
        const { data } = await supabase
          .from("teams")
          .select("id")
          .eq("id", activeEntityId)
          .maybeSingle();
        team = data ?? null;
      }
      if (!team) {
        const { data } = await supabase
          .from("teams")
          .select("id")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        team = data ?? null;
      }
      if (!team) {
        setTeamId(null);
        setFolders([]);
        setFiles([]);
        return;
      }
      setTeamId(team.id);
      const { data: f } = await supabase
        .from("file_folders")
        .select("id,name,pinned,sort_order")
        .eq("team_id", team.id)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setFolders((f ?? []) as Folder[]);
      const { data: rows } = await supabase
        .from("files")
        .select("*")
        .eq("team_id", team.id)
        .order("created_at", { ascending: false });
      setFiles((rows as FileRow[]) ?? []);
    } else {
      setTeamId(null);
      const { data: f } = await supabase
        .from("file_folders")
        .select("id,name,pinned,sort_order")
        .is("team_id", null)
        .eq("user_id", user.id)
        .order("pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      setFolders((f ?? []) as Folder[]);
      const { data: rows } = await supabase
        .from("files")
        .select("*")
        .is("team_id", null)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setFiles((rows as FileRow[]) ?? []);
    }
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll VirusTotal for any pending items, then refresh the list
  useEffect(() => {
    if (!accessToken) return;
    const pending = files.filter((f) => f.scan_status === "pending");
    if (pending.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      const results = await Promise.all(
        pending.map((f) =>
          runPoll({ data: { kind: "file", id: f.id, accessToken } }).catch(() => null),
        ),
      );
      if (cancelled) return;
      const anyResolved = results.some(
        (r) => r && (r.status === "safe" || r.status === "infected" || r.status === "error"),
      );
      if (anyResolved) void load();
    };
    const t = setInterval(() => {
      void tick();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accessToken, files, load, runPoll]);

  const filtered = useMemo(() => {
    if (view.type === "all") return files;
    if (view.id === null) return files.filter((f) => !f.folder_id);
    return files.filter((f) => f.folder_id === view.id);
  }, [files, view]);

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const paths = files.filter((f) => ids.includes(f.id)).map((f) => f.storage_path);
    await supabase.storage.from("documents").remove(paths);
    await supabase.from("files").delete().in("id", ids);
    toast.success("Deleted");
    exitSelect();
    void load();
  };

  const downloadOne = async (f: FileRow) => {
    setMenuFor(null);
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(f.storage_path, 60, { download: f.file_name });
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Could not get download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
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
          <button
            onClick={exitSelect}
            className="ml-1 rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
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
      {!hideNewActions && (
        <>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> New folder
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
          >
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
        </>
      )}
    </>
  );

  return (
    <div>
      {actionsMount && createPortal(actions, actionsMount)}

      <div className={`mt-4 grid gap-8 ${hideSideNav ? "md:grid-cols-1" : "md:grid-cols-[200px_1fr]"}`}>
        {!hideSideNav && (
        <nav className="-ml-2 flex flex-col gap-0.5">
          <NavBtn active={view.type === "all"} onClick={() => setView({ type: "all" })}>
            All
          </NavBtn>
          <button
            onClick={() => setFoldersOpen((o) => !o)}
            className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:text-ink"
          >
            <span>Folders</span>
            {foldersOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {foldersOpen && (
            <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
              <NavBtn
                small
                active={view.type === "folder" && view.id === null}
                onClick={() => setView({ type: "folder", id: null })}
              >
                Unsorted
              </NavBtn>
              {folders.map((a) => {
                const active = view.type === "folder" && view.id === a.id;
                const isDragging = folderDragId === a.id;
                return (
                  <div
                    key={a.id}
                    draggable={folderDragHandle === a.id}
                    onDragStart={(e) => {
                      if (folderDragHandle !== a.id) {
                        e.preventDefault();
                        return;
                      }
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
                          const next = [...arr];
                          const [moved] = next.splice(from, 1);
                          next.splice(to, 0, moved);
                          return next;
                        });
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnd={() => {
                      const final = folders;
                      setFolderDragId(null);
                      setFolderDragHandle(null);
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
                      onMouseLeave={() => {
                        if (!folderDragId) setFolderDragHandle(null);
                      }}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-3 w-3" />
                    </span>
                    <button
                      onClick={() => setView({ type: "folder", id: a.id })}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1 text-left text-xs transition ${
                        active ? "font-medium text-ink" : "text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {a.pinned && <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />}
                      <span className="truncate">{a.name}</span>
                    </button>
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderMenuFor(folderMenuFor === a.id ? null : a.id);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
                        data-open={folderMenuFor === a.id}
                        aria-label="Folder actions"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                      {folderMenuFor === a.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setFolderMenuFor(null)}
                          />
                          <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-md border border-hairline bg-card shadow-lg">
                            <button
                              onClick={() => togglePin(a)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                            >
                              {a.pinned ? (
                                <>
                                  <PinOff className="h-3.5 w-3.5" /> Unpin
                                </>
                              ) : (
                                <>
                                  <Pin className="h-3.5 w-3.5" /> Pin to top
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setFolderMenuFor(null);
                                setConfirmDelete(a);
                              }}
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
        )}

        <section>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-20 text-center text-sm text-muted-foreground">
              No files yet. Import your first document.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((f) => {
                const isSel = selected.has(f.id);
                return (
                  <div
                    key={f.id}
                    onClick={() => {
                      if (selectMode) toggleSel(f.id);
                      else if (onOpenFile) onOpenFile(f.id);
                      else void downloadOne(f);
                    }}
                    className="group relative flex aspect-square cursor-pointer flex-col overflow-hidden rounded-xl border border-hairline bg-card p-3 transition hover:border-ink/20"
                  >
                    {selectMode && (
                      <div className="absolute left-2 top-2 z-10 rounded-full bg-background/80 p-0.5">
                        {isSel ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}

                    <div className="flex flex-1 items-center justify-center">
                      <FileText className="h-12 w-12 text-muted-foreground/60" strokeWidth={1.25} />
                    </div>
                    <div className="mt-2 min-w-0">
                      <p
                        className="truncate text-xs text-ink"
                        title={f.file_name}
                      >
                        {f.file_name}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{formatBytes(f.file_size)}</span>
                        <ScanBadge status={f.scan_status} />
                      </div>
                    </div>

                    {f.user_id === user.id && (
                      <div className="absolute right-2 top-2 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuFor((c) => (c === f.id ? null : f.id));
                          }}
                          className="rounded-full bg-card/90 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
                          data-open={menuFor === f.id}
                          aria-label="More"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === f.id && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setMenuFor(null)}
                            />
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-lg border border-hairline bg-card text-xs shadow-xl"
                            >
                              <button
                                onClick={() => void downloadOne(f)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-ink hover:bg-secondary"
                              >
                                <Download className="h-3.5 w-3.5" /> Download
                              </button>
                              <button
                                onClick={async () => {
                                  setMenuFor(null);
                                  if (!confirm(`Delete "${f.file_name}"?`)) return;
                                  await supabase.storage.from("documents").remove([f.storage_path]);
                                  await supabase.from("files").delete().eq("id", f.id);
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

      {createOpen && (
        <CreateFolderDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void load();
          }}
          userId={user.id}
          teamId={isTeamMode ? teamId : null}
        />
      )}
      {importOpen && (
        <ImportDialog
          folders={folders}
          userId={user.id}
          teamId={isTeamMode ? teamId : null}
          onClose={() => setImportOpen(false)}
          onUploaded={(insertedIds) => {
            setImportOpen(false);
            void load();
            // Trigger verification in background; status pill will reflect outcome
            if (!accessToken) return;
            insertedIds.forEach((id) => {
              runScan({ data: { kind: "file", id, accessToken } }).catch(() => {
                /* error reflected via scan_status="error" pill */
              });
            });
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete folder?"
          message={
            <>
              <span className="font-medium text-ink">"{confirmDelete.name}"</span> will be removed.
              Files inside will move to <span className="font-medium text-ink">Unsorted</span>.
            </>
          }
          confirmLabel="Delete folder"
          destructive
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void deleteFolder(confirmDelete)}
        />
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function NavBtn({
  active,
  onClick,
  children,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 ${small ? "py-1.5 text-xs" : "py-2 text-sm"} text-left transition ${
        active ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ScanBadge({ status }: { status: FileRow["scan_status"] }) {
  if (status === "pending") {
    return (
      <span
        className="mono inline-flex items-center gap-1 rounded-full bg-secondary/70 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground"
        title="Verifying file integrity"
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Checking
      </span>
    );
  }
  if (status === "infected") {
    return (
      <span
        className="mono inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-destructive"
        title="This file failed verification and has been quarantined"
      >
        <ShieldAlert className="h-2.5 w-2.5" /> Quarantined
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="mono inline-flex items-center gap-1 rounded-full bg-secondary/70 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground"
        title="Verification could not be completed"
      >
        Unverified
      </span>
    );
  }
  return (
    <span
      className="mono inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-emerald-500"
      title="File verified and safe"
    >
      <ShieldCheck className="h-2.5 w-2.5" /> Verified
    </span>
  );
}

function CreateFolderDialog({
  onClose,
  onCreated,
  userId,
  teamId,
}: {
  onClose: () => void;
  onCreated: () => void;
  userId: string;
  teamId: string | null;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("file_folders")
      .insert({ user_id: userId, team_id: teamId, name: name.trim() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Folder created");
    onCreated();
  };

  return (
    <Modal title="New folder" onClose={onClose}>
      <FieldInput label="Name" value={name} onChange={setName} autoFocus />
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={create}
          disabled={busy || !name.trim()}
          className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
  );
}

function ImportDialog({
  folders,
  userId,
  teamId,
  onClose,
  onUploaded,
}: {
  folders: Folder[];
  userId: string;
  teamId: string | null;
  onClose: () => void;
  onUploaded: (insertedIds: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [folderId, setFolderId] = useState<string | "">("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const upload = async () => {
    if (picked.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, total: picked.length });
    const insertedIds: string[] = [];
    try {
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i];
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) throw upErr;

        const { data: row, error: insErr } = await supabase
          .from("files")
          .insert({
            user_id: userId,
            team_id: teamId,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            file_size: file.size,
            folder_id: folderId || null,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        if (row) insertedIds.push(row.id);
        setProgress({ done: i + 1, total: picked.length });
      }
      toast.success(
        picked.length > 1
          ? `Imported ${picked.length} files — running verification`
          : "Imported — running verification",
      );
      onUploaded(insertedIds);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Modal title="Import files" onClose={onClose}>
      <div>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-background px-4 py-8 text-sm text-muted-foreground hover:text-ink"
        >
          <Upload className="h-4 w-4" />
          {picked.length === 0
            ? "Choose files"
            : picked.length === 1
              ? picked[0].name
              : `${picked.length} files selected`}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => setPicked(e.target.files ? Array.from(e.target.files) : [])}
        />
      </div>

      <div className="mt-4">
        <LabelText>Folder</LabelText>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
        >
          <option value="">Unsorted</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Every file is automatically verified for integrity before it becomes available to share.
      </p>

      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={upload}
          disabled={busy || picked.length === 0}
          className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? progress
              ? `Importing ${progress.done}/${progress.total}…`
              : "Importing…"
            : picked.length > 1
              ? `Import ${picked.length} files`
              : "Import"}
        </button>
      </div>
    </Modal>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`rounded-full px-5 py-2 text-xs ${
            destructive
              ? "bg-destructive text-destructive-foreground hover:opacity-90"
              : "bg-primary text-primary-foreground hover:opacity-90"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <LabelText>{label}</LabelText>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
      />
    </label>
  );
}

function LabelText({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

// satisfy unused-import linter for Link
void Link;
