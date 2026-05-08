import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Briefcase,
  Plus,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { meetingTables, type MeetingKind } from "@/lib/meeting-kind";
import { LibraryPlusMenu } from "@/components/library/LibraryPlusMenu";
import type { PreviousNewKind } from "@/components/library/PreviousPage";

// Supabase generated types only know the literal table names, so we cast to
// `any` when the table name is computed dynamically from `kind`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface MeetingRow {
  id: string;
  title: string;
  folder: string | null;
  meeting_date: string | null;
  notes: string | null;
  created_at: string;
}

export function MeetingsListPage({
  kind = "board",
  actionsMount,
  hideNewActions,
  externalView,
  onOpenMeeting,
  onMeetingCreated,
  newMeetingSignal,
  newFolderSignal,
  onCreate,
  onCreateContainer,
  showMeetingOption,
}: {
  kind?: MeetingKind;
  actionsMount?: HTMLDivElement | null;
  hideNewActions?: boolean;
  onCreate?: (kind: PreviousNewKind) => void;
  onCreateContainer?: (kind: PreviousNewKind) => void;
  showMeetingOption?: boolean;
  /** "all" or filter by folder name (null = unsorted, string = folder name). */
  externalView?: { type: "all" } | { type: "folder"; name: string | null };
  /** When provided, clicking a meeting card calls this instead of navigating. */
  onOpenMeeting?: (m: { id: string; title: string; folder: string | null }) => void;
  /** Notify parent when a new meeting is created here. */
  onMeetingCreated?: (m: { id: string; title: string; folder: string | null }) => void;
  /** Trigger the "new meeting" dialog from the parent (counter increments). */
  newMeetingSignal?: number;
  /** Trigger the "new folder" dialog from the parent (counter increments). */
  newFolderSignal?: number;
} = {}) {
  const tables = meetingTables(kind);
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

  // new meeting modal
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingFolder, setNewMeetingFolder] = useState("");
  const [newMeetingGroupId, setNewMeetingGroupId] = useState("");
  const [groupOptions, setGroupOptions] = useState<{ id: string; name: string }[]>([]);
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
    const { data: rows } = await sb
      .from(tables.meetings)
      .select("id,title,folder,meeting_date,notes,created_at")
      .eq("team_id", team.id)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setMeetings((rows ?? []) as MeetingRow[]);
    setLoaded(true);
  }, [user, isTeamMode, activeEntityId]);

  useEffect(() => { void load(); }, [load]);

  // Load folder rows from the meeting_folders table (mirrors note_folders).
  const loadFolders = useCallback(async () => {
    if (!teamId) { setExtraFolders([]); return; }
    const { data } = await sb
      .from(tables.folders)
      .select("name")
      .eq("team_id", teamId)
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });
    setExtraFolders(((data ?? []) as { name: string }[]).map((r) => r.name));
  }, [teamId]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);

  // For group meetings, restrict the group dropdown to groups the current user
  // leads (or all groups if they're the team owner).
  useEffect(() => {
    if (kind !== "group" || !teamId || !user) { setGroupOptions([]); return; }
    let cancelled = false;
    void (async () => {
      const { data: allGroups } = await supabase
        .from("team_groups")
        .select("id,name")
        .eq("team_id", teamId)
        .order("sort_order", { ascending: true });
      const all = (allGroups ?? []).map((g) => ({ id: g.id, name: g.name || "Group" }));
      const { data: teamRow } = await supabase
        .from("teams").select("owner_id").eq("id", teamId).maybeSingle();
      const isOwner = teamRow?.owner_id === user.id;
      if (isOwner) { if (!cancelled) setGroupOptions(all); return; }
      const email = (user.email ?? "").toLowerCase();
      const orFilter = email
        ? `user_id.eq.${user.id},email.ilike.${email}`
        : `user_id.eq.${user.id}`;
      const { data: leaderRows } = await supabase
        .from("team_group_leaders")
        .select("group_id,group_name")
        .eq("team_id", teamId)
        .or(orFilter);
      const ledIds = new Set<string>();
      const ledNames = new Set<string>();
      for (const r of (leaderRows ?? []) as Array<{ group_id: string | null; group_name: string | null }>) {
        if (r.group_id) ledIds.add(r.group_id);
        if (r.group_name) ledNames.add(r.group_name.toLowerCase());
      }
      const filtered = all.filter((g) => ledIds.has(g.id) || ledNames.has(g.name.toLowerCase()));
      if (!cancelled) setGroupOptions(filtered.length ? filtered : all);
    })();
    return () => { cancelled = true; };
  }, [kind, teamId, user]);

  // Existing folder list (folder rows + folders referenced by meetings) for the picker
  const folders = useMemo(() => {
    const set = new Set<string>();
    extraFolders.forEach((f) => f && set.add(f));
    meetings.forEach((m) => m.folder && set.add(m.folder));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [meetings, extraFolders]);

  const addFolder = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Folder name is required"); return false; }
    if (folders.includes(trimmed)) { toast.error("A folder with that name already exists"); return false; }
    if (!teamId) { toast.error("No active team"); return false; }
    const { error } = await sb
      .from(tables.folders)
      .insert({ team_id: teamId, name: trimmed });
    if (error) { toast.error(error.message); return false; }
    await loadFolders();
    window.dispatchEvent(new Event("library:refresh"));
    return true;
  }, [folders, teamId, loadFolders]);

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

  async function createMeeting() {
    if (!teamId || !user) {
      toast.error("No active team");
      return;
    }
    const isGroupKind = kind === "group";
    const groupId = isGroupKind ? newMeetingGroupId : "";
    if (isGroupKind && !groupId) {
      toast.error("Pick a group for this meeting");
      return;
    }
    const title = newMeetingTitle.trim() || `${isGroupKind ? "Group" : "Board"} meeting · ${new Date().toLocaleDateString()}`;
    const folder = newMeetingFolder.trim() || (view.type === "folder" && view.name) || null;
    const insertPayload: Record<string, unknown> = {
      team_id: teamId,
      title,
      folder,
      meeting_date: new Date().toISOString().slice(0, 10),
      created_by: user.id,
    };
    if (isGroupKind) insertPayload.group_id = groupId;
    const selectCols = isGroupKind
      ? "id,title,folder,meeting_date,notes,created_at,group_id"
      : "id,title,folder,meeting_date,notes,created_at";
    const { data, error } = await sb
      .from(tables.meetings)
      .insert(insertPayload)
      .select(selectCols)
      .single();
    if (error) { toast.error(error.message); return; }

    // Build roster snapshot
    let snapshotRows: Array<Record<string, unknown>> = [];
    if (isGroupKind && groupId) {
      const groupName = (groupOptions.find((g) => g.id === groupId)?.name ?? "").toLowerCase();
      const { data: leadersData } = await supabase
        .from("team_group_leaders")
        .select("id,name,email,group_name,group_id,user_id,sort_order")
        .eq("team_id", teamId);
      const leaders = (leadersData ?? []).filter((l) => {
        if (l.group_id) return l.group_id === groupId;
        const gn = (l.group_name ?? "").trim().toLowerCase();
        return gn !== "" && gn === groupName;
      });
      const { data: gmData } = await supabase
        .from("team_group_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("group_id", groupId);
      const memberIds = (gmData ?? []).map((r) => r.user_id);
      let memberProfiles: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> = [];
      if (memberIds.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id,first_name,last_name,email").in("id", memberIds);
        memberProfiles = profs ?? [];
      }
      let order = 0;
      for (const l of leaders) {
        snapshotRows.push({
          meeting_id: data.id, team_id: teamId, board_member_id: null,
          name: l.name ?? "", role: "Group leader", email: l.email ?? "",
          sort_order: order++, is_leader: true, user_id: l.user_id ?? null,
        });
      }
      for (const p of memberProfiles) {
        const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        snapshotRows.push({
          meeting_id: data.id, team_id: teamId, board_member_id: null,
          name: fullName || (p.email ?? ""), role: "", email: p.email ?? "",
          sort_order: order++, is_leader: false, user_id: p.id,
        });
      }
    } else {
      const { data: members } = await supabase
        .from("team_board_members")
        .select("id,name,role,email,sort_order")
        .eq("team_id", teamId)
        .order("sort_order", { ascending: true });
      snapshotRows = (members ?? []).map((m) => ({
        meeting_id: data.id, team_id: teamId, board_member_id: m.id,
        name: m.name ?? "", role: m.role ?? "", email: m.email ?? "",
        sort_order: m.sort_order ?? 0,
      }));
    }

    if (snapshotRows.length) {
      const rosterSelect = isGroupKind
        ? "id,board_member_id,name,role,email,sort_order,is_leader,user_id"
        : "id,board_member_id,name,role,email,sort_order";
      const { data: rosterData } = await sb
        .from(tables.roster).insert(snapshotRows).select(rosterSelect);
      const creatorEmail = (user.email ?? "").toLowerCase();
      const rows = (rosterData ?? []) as Array<{ id: string; board_member_id: string | null; email?: string | null; user_id?: string | null }>;
      const selfEntry =
        rows.find((r) => r.user_id === user.id) ??
        (creatorEmail ? rows.find((r) => (r.email ?? "").toLowerCase() === creatorEmail) : undefined);
      if (selfEntry) {
        await sb.from(tables.attendance).insert({
          meeting_id: data.id, team_id: teamId,
          roster_id: selfEntry.id,
          board_member_id: selfEntry.board_member_id ?? selfEntry.id,
        });
      }
    }

    setMeetings((prev) => [data as MeetingRow, ...prev]);
    setNewMeetingOpen(false);
    setNewMeetingTitle("");
    setNewMeetingFolder("");
    setNewMeetingGroupId("");
    if (onMeetingCreated) {
      onMeetingCreated({ id: data.id, title: data.title, folder: data.folder });
    } else {
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

  const lastFolderSigRef = useRef<number | undefined>(newFolderSignal);
  useEffect(() => {
    if (newFolderSignal === undefined) return;
    if (lastFolderSigRef.current === newFolderSignal) return;
    lastFolderSigRef.current = newFolderSignal;
    setNewFolderOpen(true);
  }, [newFolderSignal]);

  if (authLoading || !user) return null;

  const actions = (
    <>
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
      {onCreate && (
        <LibraryPlusMenu
          onCreate={onCreate}
          onCreateContainer={onCreateContainer}
          showMeetingOption={showMeetingOption}
        />
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
            return (
              <li key={m.id}>
                <button
                  onClick={() => openMeeting(m.id)}
                  className="group flex w-full flex-col gap-2 rounded-lg border border-hairline bg-card p-4 text-left transition hover:bg-secondary/50"
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
            <h2 className="mb-4 text-sm font-medium text-ink">New meeting</h2>
            <label className="mb-3 block text-xs text-muted-foreground">
              Title
              <input
                autoFocus
                value={newMeetingTitle}
                onChange={(e) => setNewMeetingTitle(e.target.value)}
                placeholder={`${kind === "group" ? "Group" : "Board"} meeting · ${new Date().toLocaleDateString()}`}
                className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            {kind === "group" && (
              <label className="mb-3 block text-xs text-muted-foreground">
                Group
                <select
                  value={newMeetingGroupId}
                  onChange={(e) => setNewMeetingGroupId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                >
                  <option value="">Select a group…</option>
                  {groupOptions.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {groupOptions.length === 0 && (
                  <span className="mt-1 block text-[11px] text-muted-foreground/80">
                    You aren't assigned to lead any group yet.
                  </span>
                )}
              </label>
            )}
            <div className="mb-4">
              <span className="block text-xs text-muted-foreground">Folder (optional)</span>
              {creatingFolderInline ? (
                <div className="mt-1 flex items-center gap-2 rounded-md border border-hairline bg-background pr-1 focus-within:border-primary">
                  <input
                    autoFocus
                    value={draftFolder}
                    onChange={(e) => setDraftFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const name = draftFolder.trim();
                        void addFolder(name).then((ok) => {
                          if (ok) {
                            setNewMeetingFolder(name);
                            setDraftFolder("");
                            setCreatingFolderInline(false);
                          }
                        });
                      } else if (e.key === "Escape") {
                        setDraftFolder("");
                        setCreatingFolderInline(false);
                      }
                    }}
                    placeholder="New folder name"
                    className="flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = draftFolder.trim();
                      void addFolder(name).then((ok) => {
                        if (ok) {
                          setNewMeetingFolder(name);
                          setDraftFolder("");
                          setCreatingFolderInline(false);
                        }
                      });
                    }}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Add folder
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={newMeetingFolder}
                    onChange={(e) => setNewMeetingFolder(e.target.value)}
                    className="flex-1 rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                  >
                    <option value="">No folder</option>
                    {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setDraftFolder(""); setCreatingFolderInline(true); }}
                    title="Add folder"
                    aria-label="Add folder"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-background text-ink hover:bg-secondary"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
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
                disabled={kind === "group" && !newMeetingGroupId}
                className="rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {newFolderOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setNewFolderOpen(false)}
        >
          <form
            className="w-full max-w-md rounded-xl border border-hairline bg-popover p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const name = newFolderName.trim();
              void addFolder(name).then((ok) => {
                if (ok) {
                  toast.success(`Folder "${name}" created`);
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }
              });
            }}
          >
            <h2 className="mb-4 text-lg text-ink">New folder</h2>
            <label className="mb-4 block text-xs text-muted-foreground">
              Name
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="mt-1 w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderOpen(false)}
                className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
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
