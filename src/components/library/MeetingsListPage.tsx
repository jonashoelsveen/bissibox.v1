import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Briefcase,
  CheckSquare,
  Plus,
  Search as SearchIcon,
  Trash2,
  X,
} from "lucide-react";

interface MeetingRow {
  id: string;
  title: string;
  folder: string | null;
  meeting_date: string | null;
  notes: string | null;
  created_at: string;
}

export function MeetingsListPage({
  actionsMount,
  hideNewActions,
  externalView,
  onOpenMeeting,
  onMeetingCreated,
  newMeetingSignal,
}: {
  actionsMount?: HTMLDivElement | null;
  hideNewActions?: boolean;
  /** "all" or filter by folder name (null = unsorted, string = folder name). */
  externalView?: { type: "all" } | { type: "folder"; name: string | null };
  /** When provided, clicking a meeting card calls this instead of navigating. */
  onOpenMeeting?: (m: { id: string; title: string; folder: string | null }) => void;
  /** Notify parent when a new meeting is created here. */
  onMeetingCreated?: (m: { id: string; title: string; folder: string | null }) => void;
  /** Trigger the "new meeting" dialog from the parent (counter increments). */
  newMeetingSignal?: number;
} = {}) {
  const { user, mode, activeEntityId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isTeamMode = mode === "team" || mode === "organizer" || !!activeEntityId;

  const [teamId, setTeamId] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  // search + select state (mirrors NotesPage)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // new meeting modal
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingFolder, setNewMeetingFolder] = useState("");
  const [creatingFolderInline, setCreatingFolderInline] = useState(false);
  const [draftFolder, setDraftFolder] = useState("");

  // standalone new folder modal (from header action)
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // extra folders created without meetings yet (persisted per team)
  const [extraFolders, setExtraFolders] = useState<string[]>([]);

  const view = externalView ?? { type: "all" as const };

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    if (!user || !isTeamMode) {
      setTeamId(null);
      setMeetings([]);
      setLoaded(true);
      return;
    }
    let team: { id: string } | null = null;
    if (activeEntityId) {
      const { data } = await supabase
        .from("teams").select("id").eq("id", activeEntityId).maybeSingle();
      team = data ?? null;
    }
    if (!team) {
      const { data } = await supabase
        .from("teams").select("id").eq("owner_id", user.id)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      team = data ?? null;
    }
    if (!team) {
      setTeamId(null);
      setMeetings([]);
      setLoaded(true);
      return;
    }
    setTeamId(team.id);
    const { data: rows } = await supabase
      .from("team_board_meetings")
      .select("id,title,folder,meeting_date,notes,created_at")
      .eq("team_id", team.id)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setMeetings((rows ?? []) as MeetingRow[]);
    setLoaded(true);
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => { void load(); }, [load]);

  // Load extra folders from localStorage when team becomes available.
  useEffect(() => {
    if (!teamId) { setExtraFolders([]); return; }
    try {
      const raw = window.localStorage.getItem(`meeting-extra-folders:${teamId}`);
      setExtraFolders(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { setExtraFolders([]); }
  }, [teamId]);

  const persistExtras = useCallback((next: string[]) => {
    if (!teamId) return;
    try {
      window.localStorage.setItem(`meeting-extra-folders:${teamId}`, JSON.stringify(next));
    } catch { /* ignore */ }
    setExtraFolders(next);
    window.dispatchEvent(new Event("library:refresh"));
  }, [teamId]);

  // Existing folder list (derived from meetings + extras) for the new-meeting picker
  const folders = useMemo(() => {
    const set = new Set<string>();
    meetings.forEach((m) => m.folder && set.add(m.folder));
    extraFolders.forEach((f) => f && set.add(f));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meetings, extraFolders]);

  const addFolder = useCallback((name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Folder name is required"); return false; }
    if (folders.includes(trimmed)) { toast.error("A folder with that name already exists"); return false; }
    if (!extraFolders.includes(trimmed)) {
      persistExtras([...extraFolders, trimmed]);
    }
    return true;
  }, [folders, extraFolders, persistExtras]);

  const filtered = useMemo(() => {
    let list = meetings;
    if (view.type === "folder") {
      list = view.name === null
        ? list.filter((m) => !m.folder)
        : list.filter((m) => m.folder === view.name);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((m) =>
        `${m.title} ${m.folder ?? ""} ${m.notes ?? ""}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [meetings, view, searchQuery]);

  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  const closeSearch = () => {
    setSearchQuery("");
    setSearchOpen(false);
  };

  const toggleSel = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} meeting(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("team_board_meetings").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    exitSelect();
    void load();
  };

  async function createMeeting() {
    if (!teamId || !user) {
      toast.error("No active team");
      return;
    }
    const title = newMeetingTitle.trim() || `Board meeting · ${new Date().toLocaleDateString()}`;
    const folder = newMeetingFolder.trim() || (view.type === "folder" && view.name) || null;
    const { data, error } = await supabase
      .from("team_board_meetings")
      .insert({
        team_id: teamId,
        title,
        folder,
        meeting_date: new Date().toISOString().slice(0, 10),
        created_by: user.id,
      })
      .select("id,title,folder,meeting_date,notes,created_at")
      .single();
    if (error) { toast.error(error.message); return; }

    // Snapshot board members into roster + auto-attend creator
    const { data: members } = await supabase
      .from("team_board_members")
      .select("id,name,role,email,sort_order")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: true });
    const snapshotRows = (members ?? []).map((m) => ({
      meeting_id: data.id,
      team_id: teamId,
      board_member_id: m.id,
      name: m.name ?? "",
      role: m.role ?? "",
      email: m.email ?? "",
      sort_order: m.sort_order ?? 0,
    }));
    if (snapshotRows.length) {
      const { data: rosterData } = await supabase
        .from("team_board_meeting_roster")
        .insert(snapshotRows)
        .select("id,board_member_id,name,role,email,sort_order");
      const creatorEmail = (user.email ?? "").toLowerCase();
      const selfEntry = (rosterData ?? []).find(
        (r) => (r.email ?? "").toLowerCase() === creatorEmail,
      );
      if (selfEntry) {
        await supabase.from("team_board_meeting_attendance").insert({
          meeting_id: data.id,
          team_id: teamId,
          roster_id: selfEntry.id,
          board_member_id: selfEntry.board_member_id ?? selfEntry.id,
        });
      }
    }

    setMeetings((prev) => [data as MeetingRow, ...prev]);
    setNewMeetingOpen(false);
    setNewMeetingTitle("");
    setNewMeetingFolder("");
    if (onMeetingCreated) {
      onMeetingCreated({ id: data.id, title: data.title, folder: data.folder });
    } else {
      // Fallback (standalone usage): open the existing TeamBoard editor.
      navigate({ to: "/team/board" });
    }
  }

  function openMeeting(id: string) {
    const m = meetings.find((x) => x.id === id);
    if (onOpenMeeting && m) {
      onOpenMeeting({ id: m.id, title: m.title, folder: m.folder });
      return;
    }
    // Fallback (standalone usage): open the existing TeamBoard editor.
    navigate({ to: "/team/board" });
  }

  // External "new meeting" trigger from the embedding parent.
  // Initialize the ref to the incoming signal so a fresh mount (e.g. when the
  // user navigates back to the meetings tab) does NOT re-trigger the dialog
  // for a stale signal value. Only true increments after mount should fire.
  const lastSigRef = useRef<number | undefined>(newMeetingSignal);
  useEffect(() => {
    if (newMeetingSignal === undefined) return;
    if (lastSigRef.current === newMeetingSignal) return;
    lastSigRef.current = newMeetingSignal;
    setNewMeetingOpen(true);
  }, [newMeetingSignal]);

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
            aria-label="Search meetings"
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
            placeholder="Search meetings"
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
      {!hideNewActions && (
        <>
          <button
            onClick={() => { setNewFolderName(""); setNewFolderOpen(true); }}
            className="flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> New folder
          </button>
          <button
            onClick={() => setNewMeetingOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> New meeting
          </button>
        </>
      )}
    </>
  );

  return (
    <div>
      {actionsMount && createPortal(actions, actionsMount)}

      {!isTeamMode ? (
        <div className="px-2 py-16 text-center text-sm text-muted-foreground">
          Meetings are available in team mode only.
        </div>
      ) : !loaded ? (
        <div className="px-2 py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="px-2 py-16 text-center text-sm text-muted-foreground">
          {meetings.length === 0
            ? "No meetings yet. Create your first meeting."
            : "No meetings match this filter."}
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => {
            const isSel = selected.has(m.id);
            return (
              <li key={m.id}>
                <button
                  onClick={() => {
                    if (selectMode) toggleSel(m.id);
                    else openMeeting(m.id);
                  }}
                  className={`group flex w-full flex-col gap-2 rounded-lg border p-4 text-left transition hover:bg-secondary/50 ${
                    isSel ? "border-primary bg-secondary/40" : "border-hairline bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                    {m.folder && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        {m.folder}
                      </span>
                    )}
                  </div>
                  <h3 className="truncate text-sm font-medium text-ink">{m.title}</h3>
                  <p className="text-xs text-muted-foreground mono">
                    {m.meeting_date ?? new Date(m.created_at).toLocaleDateString()}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {newMeetingOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setNewMeetingOpen(false)}
        >
          <form
            className="w-full max-w-md rounded-xl border border-hairline bg-popover p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void createMeeting(); }}
          >
            <h2 className="mb-4 text-lg text-ink">New meeting</h2>
            <label className="mb-3 block text-xs text-muted-foreground">
              Title
              <input
                autoFocus
                value={newMeetingTitle}
                onChange={(e) => setNewMeetingTitle(e.target.value)}
                placeholder={`Board meeting · ${new Date().toLocaleDateString()}`}
                className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="mb-4 block text-xs text-muted-foreground">
              Folder (optional)
              <input
                value={newMeetingFolder}
                onChange={(e) => setNewMeetingFolder(e.target.value)}
                list="meeting-folders"
                placeholder="No folder"
                className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
              <datalist id="meeting-folders">
                {folders.map((f) => <option key={f} value={f} />)}
              </datalist>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewMeetingOpen(false)}
                className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
