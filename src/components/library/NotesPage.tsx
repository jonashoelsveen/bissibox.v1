import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  PenLine,
  Search as SearchIcon,
  Folder as FolderIcon,
} from "lucide-react";

/* ───────── search helpers ───────── */

// Levenshtein distance for typo tolerance on individual words
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[a.length];
}

// Allowed edit distance based on token length
function maxEditsFor(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

// True if any word in `text` matches `token` exactly, as a substring, or within a small edit distance
function tokenMatchesWord(text: string, token: string): boolean {
  if (!token) return false;
  if (text.includes(token)) return true;
  const max = maxEditsFor(token.length);
  if (max === 0) return false;
  const words = text.split(/[^a-z0-9]+/i).filter(Boolean);
  for (const w of words) {
    if (Math.abs(w.length - token.length) > max) continue;
    if (levenshtein(w, token) <= max) return true;
  }
  return false;
}

// Score a string against a query. Higher = better match. 0 = no match.
// Only returns > 0 when the query (or all of its tokens) actually appear
// in the text — as substrings or as close typo variants of real words.
function scoreText(
  text: string | null | undefined,
  query: string,
  weights: { exact: number; partial: number; fuzzy: number },
): number {
  if (!text || !query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  if (t === q) return weights.exact * 2;
  if (t.startsWith(q)) return weights.exact;
  if (t.includes(q)) return weights.partial;

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((tok) => tokenMatchesWord(t, tok)) ? weights.partial * 0.85 : 0;
  }

  return tokenMatchesWord(t, q) ? weights.fuzzy : 0;
}


function snippet(body: string | null | undefined, query: string, len = 120): { text: string; matchAt: number } {
  if (!body) return { text: "", matchAt: -1 };
  const idx = body.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) {
    return { text: body.length > len ? body.slice(0, len) + "…" : body, matchAt: -1 };
  }
  const start = Math.max(0, idx - 30);
  const end = Math.min(body.length, idx + query.length + 80);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return { text: prefix + body.slice(start, end) + suffix, matchAt: idx - start + prefix.length };
}

function HighlightedSnippet({ body, query }: { body: string | null | undefined; query: string }) {
  const { text, matchAt } = snippet(body, query);
  if (!text) return <span className="text-muted-foreground/60 italic">No content</span>;
  if (matchAt < 0 || !query) return <span>{text}</span>;
  const before = text.slice(0, matchAt);
  const match = text.slice(matchAt, matchAt + query.length);
  const after = text.slice(matchAt + query.length);
  return (
    <span>
      {before}
      <mark className="rounded bg-primary/20 px-0.5 text-ink">{match}</mark>
      {after}
    </span>
  );
}

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
  cover_image_url?: string | null;
  cover_status?: string | null;
  word_count?: number | null;
  attachments_count?: number | null;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const isSearching = searchQuery.trim().length > 0;

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

  // Realtime: update cover_image_url / cover_status as the worker finishes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notes-cover-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notes" },
        (payload) => {
          const row = payload.new as NoteRow;
          setNotes((prev) =>
            prev.map((n) =>
              n.id === row.id
                ? {
                    ...n,
                    cover_image_url: row.cover_image_url ?? n.cover_image_url,
                    cover_status: row.cover_status ?? n.cover_status,
                    title: row.title ?? n.title,
                    folder: row.folder ?? n.folder,
                    updated_at: row.updated_at ?? n.updated_at,
                  }
                : n,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

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

  // Force the "All" tab while searching
  useEffect(() => {
    if (isSearching && view.type !== "all") setView({ type: "all" });
  }, [isSearching, view.type]);

  // Focus the input on expand
  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return { folders: [] as NoteFolder[], notes: [] as Array<NoteRow & { _score: number }> };

    const folderMatches = folders
      .map((f) => ({ f, score: scoreText(f.name, q, { exact: 100, partial: 60, fuzzy: 25 }) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.f);

    const noteMatches = notes
      .map((n) => {
        const titleScore = scoreText(n.title, q, { exact: 100, partial: 70, fuzzy: 30 });
        const folderScore = scoreText(n.folder ?? "", q, { exact: 50, partial: 30, fuzzy: 12 });
        const bodyScore = scoreText(n.body, q, { exact: 40, partial: 25, fuzzy: 10 });
        const total = titleScore + folderScore * 0.5 + bodyScore;
        return { ...n, _score: total };
      })
      .filter((n) => n._score > 0)
      .sort((a, b) => b._score - a._score);

    return { folders: folderMatches, notes: noteMatches };
  }, [searchQuery, folders, notes]);

  const closeSearch = () => {
    setSearchQuery("");
    setSearchOpen(false);
  };

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
      {!selectMode && (
        <div
          className={`flex items-center gap-1 overflow-hidden rounded-full border border-transparent transition-all duration-300 ease-out ${
            searchOpen
              ? "w-64 border-hairline bg-card pl-3 pr-1"
              : "w-9 hover:border-hairline hover:bg-card"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              if (!searchOpen) setSearchOpen(true);
              else searchInputRef.current?.focus();
            }}
            aria-label="Search notes"
            className="grid h-9 w-9 shrink-0 place-items-center text-muted-foreground transition hover:text-ink"
          >
            <SearchIcon className="h-4 w-4" />
          </button>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Search in notes"
            className={`min-w-0 flex-1 border-b border-hairline bg-transparent py-1 text-xs text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-ink/40 ${
              searchOpen ? "opacity-100" : "pointer-events-none w-0 opacity-0"
            }`}
          />
          {searchOpen && (
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Clear search"
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-ink ${
                searchQuery ? "opacity-100" : "opacity-60"
              }`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
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
              {(isSearching
                ? folders.filter((f) => searchResults.folders.some((sf) => sf.id === f.id))
                : folders
              ).map((a) => {
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
          {isSearching ? (
            <SearchResults
              query={searchQuery}
              folders={searchResults.folders}
              notes={searchResults.notes}
              onOpenFolder={(name) => {
                closeSearch();
                setView({ type: "folder", name });
              }}
              onOpenNote={(id) => {
                closeSearch();
                openNote(id);
              }}
            />
          ) : filtered.length === 0 ? (
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
                    <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-secondary/40">
                      {n.cover_image_url ? (
                        <img
                          src={n.cover_image_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : n.cover_status === "pending" || n.cover_status === "generating" ? (
                        <div className="flex h-full w-full animate-pulse items-center justify-center bg-gradient-to-br from-secondary/30 to-secondary/60">
                          <StickyNote className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.25} />
                        </div>
                      ) : n.cover_status === "failed" ? (
                        <PenLine className="h-12 w-12 text-muted-foreground/60" strokeWidth={1.25} />
                      ) : (
                        <StickyNote className="h-12 w-12 text-muted-foreground/60" strokeWidth={1.25} />
                      )}
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
            await load();
            openNote(data!.id, "new");
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

export function NewNoteDialog({
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

function SearchResults({
  query, folders, notes, onOpenFolder, onOpenNote,
}: {
  query: string;
  folders: NoteFolder[];
  notes: Array<NoteRow & { _score: number }>;
  onOpenFolder: (name: string) => void;
  onOpenNote: (id: string) => void;
}) {
  const noResults = folders.length === 0 && notes.length === 0;

  if (noResults) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-20 text-center">
        <p className="text-sm text-ink">No results found for "{query}"</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Try different keywords or check your spelling.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-200">
      {folders.length > 0 && (
        <div>
          <h3 className="mono mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            Matching folders ({folders.length})
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => onOpenFolder(f.name)}
                className="group flex items-center gap-2 rounded-xl border border-hairline bg-card px-3 py-2.5 text-left transition hover:border-ink/20 hover:bg-secondary/50"
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-ink" />
                <span className="truncate text-xs text-ink">{f.name}</span>
                {f.pinned && <Pin className="ml-auto h-2.5 w-2.5 shrink-0 fill-current text-ink/60" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {folders.length > 0 && notes.length > 0 && (
        <div className="my-6 border-t border-hairline" />
      )}

      {notes.length > 0 && (
        <div>
          <h3 className="mono mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            Matching notes ({notes.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                className="group flex flex-col gap-2 rounded-xl border border-hairline bg-card p-4 text-left transition hover:border-ink/20"
              >
                <div className="flex items-start gap-2">
                  <NoteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="flex-1 truncate text-sm text-ink">{n.title}</p>
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  <HighlightedSnippet body={n.body} query={query} />
                </p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">{n.folder ?? "Unsorted"}</span>
                  <span className="mono">{new Date(n.updated_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
