import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Folder as FolderIcon,
  Mail,
  Paperclip,
  Plus,
  Save,
  Search,
  Trash2,
  User as UserIcon,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { useLibrarySetting, meetingsAutosaveKey, registerUnsaved } from "@/lib/library-settings";
import { meetingTables, type MeetingKind } from "@/lib/meeting-kind";

// Cast for dynamic table names not present in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/team/board")({
  component: TeamBoardPage,
  head: () => ({ meta: [{ title: "Meetings · Raceline" }] }),
});

interface BoardMemberDraft {
  id?: string;
  name: string;
  role: string;
  email: string;
  status: "pending" | "active";
  invited_at: string | null;
  sort_order: number;
}

interface MeetingRow {
  id: string;
  title: string;
  folder: string | null;
  meeting_date: string | null;
  notes: string | null;
  created_at: string;
  group_id?: string | null;
}

interface AttachmentRow {
  id: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
}

interface RosterEntry {
  id: string;
  board_member_id: string | null;
  name: string;
  role: string;
  email: string;
  sort_order: number;
  is_leader?: boolean;
  user_id?: string | null;
}

interface GroupOption {
  id: string;
  name: string;
}

export function TeamBoardPage({
  kind = "board",
  embedded,
  newMeetingSignal,
  hideOwnTabBar,
  forceMeetingId,
  onMeetingOpened,
  onMeetingDeleted,
}: {
  kind?: MeetingKind;
  embedded?: boolean;
  newMeetingSignal?: number;
  /** When true, hide the inner tab nav and meetings list — parent controls tabs. */
  hideOwnTabBar?: boolean;
  /** When set, auto-open this meeting and force-activate it. */
  forceMeetingId?: string | null;
  /** Notify parent when a meeting is opened (e.g. after creation via newMeetingSignal). */
  onMeetingOpened?: (meeting: { id: string; title: string; folder: string | null; kind: "new" | "earlier" }) => void;
  /** Notify parent when a meeting is deleted from this view. */
  onMeetingDeleted?: (id: string) => void;
} = {}) {
  const tables = meetingTables(kind);
  const kindLabel = kind === "group" ? "Group" : "Board";
  const { user, loading: authLoading, mode, activeEntityId } = useAuth();
  const nav = useNavigate();
  // Active tab: "meetings" or a meeting id
  const [activeTab, setActiveTab] = useState<string>("meetings");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Members
  const [members, setMembers] = useState<BoardMemberDraft[]>([]);

  // Meetings
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingFolder, setNewMeetingFolder] = useState<string>("");
  const [newMeetingGroupId, setNewMeetingGroupId] = useState<string>("");
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [editMeetingOpen, setEditMeetingOpen] = useState(false);
  const [editMeetingTitle, setEditMeetingTitle] = useState("");
  const [editMeetingFolder, setEditMeetingFolder] = useState<string>("");
  const [confirmDeleteMeetingId, setConfirmDeleteMeetingId] = useState<string | null>(null);
  const [deletingMeeting, setDeletingMeeting] = useState(false);
  const [meetingSearch, setMeetingSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Open meeting tabs (max 10). "new" tabs are green, "earlier" tabs are grey.
  interface OpenTab {
    meeting: MeetingRow;
    kind: "new" | "earlier";
    text: string;
    savedText: string;
    attachments: AttachmentRow[];
    attendance: string[];
    roster: RosterEntry[];
  }
  const MAX_TABS = 10;
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [saving, setSaving] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceDraft, setAttendanceDraft] = useState<string[]>([]);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ongoing = activeTab !== "meetings" ? openTabs.find((t) => t.meeting.id === activeTab) ?? null : null;
  const ongoingText = ongoing?.text ?? "";
  const savedText = ongoing?.savedText ?? "";
  const attachments = ongoing?.attachments ?? [];
  const attendance = ongoing?.attendance ?? [];
  const roster = ongoing?.roster ?? [];
  const isDirty = ongoingText !== savedText;
  const meetingsScopeKey = activeEntityId ? `entity:${activeEntityId}` : `user:${user?.id ?? "anon"}`;
  const [meetingsAutosave] = useLibrarySetting<boolean>(meetingsAutosaveKey(meetingsScopeKey), false);

  function patchTab(id: string, patch: Partial<OpenTab>) {
    setOpenTabs((prev) => prev.map((t) => (t.meeting.id === id ? { ...t, ...patch } : t)));
  }
  function setOngoingText(v: string) {
    if (ongoing) patchTab(ongoing.meeting.id, { text: v });
  }
  function setAttachments(next: AttachmentRow[] | ((prev: AttachmentRow[]) => AttachmentRow[])) {
    if (!ongoing) return;
    const value = typeof next === "function" ? (next as (p: AttachmentRow[]) => AttachmentRow[])(ongoing.attachments) : next;
    patchTab(ongoing.meeting.id, { attachments: value });
  }
  function setAttendance(next: string[] | ((prev: string[]) => string[])) {
    if (!ongoing) return;
    const value = typeof next === "function" ? (next as (p: string[]) => string[])(ongoing.attendance) : next;
    patchTab(ongoing.meeting.id, { attendance: value });
  }
  function setRoster(next: RosterEntry[] | ((prev: RosterEntry[]) => RosterEntry[])) {
    if (!ongoing) return;
    const value = typeof next === "function" ? (next as (p: RosterEntry[]) => RosterEntry[])(ongoing.roster) : next;
    patchTab(ongoing.meeting.id, { roster: value });
  }
  function setSavedText(v: string) {
    if (ongoing) patchTab(ongoing.meeting.id, { savedText: v });
  }

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      let team: { id: string; name: string | null } | null = null;
      if (activeEntityId) {
        const { data } = await supabase
          .from("teams")
          .select("id,name")
          .eq("id", activeEntityId)
          .maybeSingle();
        team = data as { id: string; name: string | null } | null;
      }
      if (!team) {
        const { data } = await supabase
          .from("teams")
          .select("id,name")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        team = data as { id: string; name: string | null } | null;
      }
      const tid = team?.id ?? null;
      setTeamId(tid);
      setTeamName(team?.name ?? "");
      if (!tid) {
        setLoaded(true);
        return;
      }
      await Promise.all([loadMembers(tid), loadMeetings(tid), loadGroupOptions(tid)]);
      setLoaded(true);
    })();
  }, [user, activeEntityId]);

  // External "new meeting" trigger from the embedding parent (Library Previous tab).
  const lastSignalRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (newMeetingSignal === undefined) return;
    if (lastSignalRef.current === newMeetingSignal) return;
    lastSignalRef.current = newMeetingSignal;
    if (!loaded || !teamId) return;
    setActiveTab("meetings");
    openNewMeeting();
  }, [newMeetingSignal, loaded, teamId]);

  // External "force open this meeting" — used when the parent (Library) drives
  // the top tab strip and wants this embedded view to render a specific meeting.
  useEffect(() => {
    if (!forceMeetingId) return;
    if (!loaded || !teamId) return;
    if (activeTab === forceMeetingId) return;
    const existing = openTabs.find((t) => t.meeting.id === forceMeetingId);
    if (existing) {
      setActiveTab(forceMeetingId);
      return;
    }
    const m = meetings.find((x) => x.id === forceMeetingId);
    if (m) openMeeting(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceMeetingId, loaded, teamId, meetings]);

  async function loadMembers(tid: string) {
    const { data } = await supabase
      .from("team_board_members")
      .select("id,name,role,email,status,invited_at,sort_order")
      .eq("team_id", tid)
      .order("sort_order", { ascending: true });
    setMembers(
      (data ?? []).map((m) => ({
        id: m.id,
        name: m.name ?? "",
        role: m.role ?? "",
        email: m.email ?? "",
        status: (m.status as "pending" | "active") ?? "pending",
        invited_at: m.invited_at,
        sort_order: m.sort_order ?? 0,
      })),
    );
  }

  async function loadMeetings(tid: string) {
    const cols = kind === "group"
      ? "id,title,folder,meeting_date,notes,created_at,group_id"
      : "id,title,folder,meeting_date,notes,created_at";
    const { data } = await sb
      .from(tables.meetings)
      .select(cols)
      .eq("team_id", tid)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setMeetings(data ?? []);
  }

  async function loadGroupOptions(tid: string) {
    if (kind !== "group") return;
    const { data: allGroups } = await supabase
      .from("team_groups")
      .select("id,name")
      .eq("team_id", tid)
      .order("sort_order", { ascending: true });
    const all = (allGroups ?? []).map((g) => ({ id: g.id, name: g.name || "Group" }));

    // If the user is the team owner, show all groups. Otherwise restrict to
    // the groups they lead (matched via team_group_leaders by user_id or email).
    const { data: teamRow } = await supabase
      .from("teams")
      .select("owner_id")
      .eq("id", tid)
      .maybeSingle();
    const isOwner = !!user && teamRow?.owner_id === user.id;
    if (isOwner) {
      setGroupOptions(all);
      return;
    }
    const email = (user?.email ?? "").toLowerCase();
    const orFilter = email
      ? `user_id.eq.${user!.id},email.ilike.${email}`
      : `user_id.eq.${user!.id}`;
    const { data: leaderRows } = await supabase
      .from("team_group_leaders")
      .select("group_id,group_name")
      .eq("team_id", tid)
      .or(orFilter);
    const ledIds = new Set<string>();
    const ledNames = new Set<string>();
    for (const r of (leaderRows ?? []) as Array<{ group_id: string | null; group_name: string | null }>) {
      if (r.group_id) ledIds.add(r.group_id);
      if (r.group_name) ledNames.add(r.group_name.toLowerCase());
    }
    const filtered = all.filter((g) => ledIds.has(g.id) || ledNames.has(g.name.toLowerCase()));
    setGroupOptions(filtered.length ? filtered : all);
  }

  // ── Members ────────────────────────────────────────────────────────────────
  function addMember() {
    setMembers((prev) => [
      ...prev,
      {
        name: "",
        role: "",
        email: "",
        status: "pending",
        invited_at: null,
        sort_order: prev.length,
      },
    ]);
  }

  function updateMember(idx: number, patch: Partial<BoardMemberDraft>) {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  async function removeMember(idx: number) {
    const m = members[idx];
    if (m.id) {
      const { error } = await supabase.from("team_board_members").delete().eq("id", m.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!teamId) return;
    setBusy(true);
    try {
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        if (m.id) {
          await supabase
            .from("team_board_members")
            .update({ name: m.name, role: m.role, email: m.email, sort_order: i })
            .eq("id", m.id);
        } else {
          const { data, error } = await supabase
            .from("team_board_members")
            .insert({
              team_id: teamId,
              name: m.name,
              role: m.role,
              email: m.email,
              status: "pending",
              sort_order: i,
            })
            .select("id")
            .single();
          if (error) throw error;
          m.id = data.id;
        }
      }
      toast.success("Saved");
      await loadMembers(teamId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function inviteMember(idx: number) {
    const m = members[idx];
    if (!m.email || !m.email.includes("@")) {
      toast.error("Enter a valid email first");
      return;
    }
    if (!m.id) await save();
    const updated = members[idx];
    if (!updated.id) return;
    const { error } = await supabase
      .from("team_board_members")
      .update({ invited_at: new Date().toISOString(), status: "pending" })
      .eq("id", updated.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Invitation sent to ${updated.email}`);
    if (teamId) await loadMembers(teamId);
  }

  // ── Meetings ───────────────────────────────────────────────────────────────
  const folders = useMemo(() => {
    const set = new Set<string>();
    meetings.forEach((m) => m.folder && set.add(m.folder));
    extraFolders.forEach((f) => f && set.add(f));
    return Array.from(set).sort();
  }, [meetings, extraFolders]);

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (folders.includes(name)) {
      toast.error("A folder with that name already exists");
      return;
    }
    setExtraFolders((prev) => [...prev, name]);
    setFolderFilter(name);
    setNewFolderName("");
    setNewFolderOpen(false);
    toast.success("Folder created");
  }

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (folderFilter !== "all" && (m.folder ?? "") !== folderFilter) return false;
      if (meetingSearch) {
        const q = meetingSearch.toLowerCase();
        const hay = `${m.title} ${m.notes ?? ""} ${m.folder ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dateFrom && m.meeting_date && m.meeting_date < dateFrom) return false;
      if (dateTo && m.meeting_date && m.meeting_date > dateTo) return false;
      return true;
    });
  }, [meetings, folderFilter, meetingSearch, dateFrom, dateTo]);

  function openNewMeeting() {
    setNewMeetingTitle(`${kindLabel} meeting · ${new Date().toLocaleDateString()}`);
    setNewMeetingFolder("");
    setNewMeetingGroupId(kind === "group" && groupOptions.length === 1 ? groupOptions[0].id : "");
    setNewMeetingOpen(true);
  }

  function patchMeetingInTab(id: string, patch: Partial<MeetingRow>) {
    setOpenTabs((prev) =>
      prev.map((t) => (t.meeting.id === id ? { ...t, meeting: { ...t.meeting, ...patch } } : t)),
    );
  }

  async function startNewMeeting() {
    if (!teamId || !user) return;
    if (openTabs.length >= MAX_TABS) {
      toast.error(`You can have at most ${MAX_TABS} meeting tabs open at once. Please close another tab to open a new meeting.`);
      return;
    }
    const title = newMeetingTitle.trim() || `${kindLabel} meeting · ${new Date().toLocaleDateString()}`;
    const folder = newMeetingFolder.trim() || null;
    const isGroupKind = kind === "group";
    const groupId = isGroupKind ? (newMeetingGroupId || null) : null;
    if (isGroupKind && !groupId) {
      toast.error("Pick a group for this meeting");
      return;
    }
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
    if (error) {
      toast.error(error.message);
      return;
    }

    // Build the roster snapshot.
    let snapshotRows: Array<Record<string, unknown>> = [];
    if (isGroupKind && groupId) {
      const groupName = groupOptions.find((g) => g.id === groupId)?.name ?? "";
      // Group leaders for this group: match by group_name (case-insensitive) or any leader if blank.
      const { data: leadersData } = await supabase
        .from("team_group_leaders")
        .select("id,name,email,group_name,user_id,sort_order")
        .eq("team_id", teamId);
      const leaders = (leadersData ?? []).filter((l) => {
        const gn = (l.group_name ?? "").trim().toLowerCase();
        return gn === "" || gn === groupName.toLowerCase();
      });
      // Group members for this group, with profile info.
      const { data: gmData } = await supabase
        .from("team_group_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("group_id", groupId);
      const memberIds = (gmData ?? []).map((r) => r.user_id);
      let memberProfiles: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> = [];
      if (memberIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,email")
          .in("id", memberIds);
        memberProfiles = profs ?? [];
      }
      let order = 0;
      for (const l of leaders) {
        snapshotRows.push({
          meeting_id: data.id,
          team_id: teamId,
          board_member_id: null,
          name: l.name ?? "",
          role: "Group leader",
          email: l.email ?? "",
          sort_order: order++,
          is_leader: true,
          user_id: l.user_id ?? null,
        });
      }
      for (const p of memberProfiles) {
        const fullName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
        snapshotRows.push({
          meeting_id: data.id,
          team_id: teamId,
          board_member_id: null,
          name: fullName || (p.email ?? ""),
          role: "",
          email: p.email ?? "",
          sort_order: order++,
          is_leader: false,
          user_id: p.id,
        });
      }
    } else {
      snapshotRows = members
        .filter((m) => !!m.id)
        .map((m) => ({
          meeting_id: data.id,
          team_id: teamId,
          board_member_id: m.id as string,
          name: m.name ?? "",
          role: m.role ?? "",
          email: m.email ?? "",
          sort_order: m.sort_order ?? 0,
        }));
    }

    let snapshot: RosterEntry[] = [];
    if (snapshotRows.length) {
      const rosterSelect = isGroupKind
        ? "id,board_member_id,name,role,email,sort_order,is_leader,user_id"
        : "id,board_member_id,name,role,email,sort_order";
      const { data: rosterData } = await sb
        .from(tables.roster)
        .insert(snapshotRows)
        .select(rosterSelect);
      snapshot = (rosterData ?? []) as RosterEntry[];
    }

    // Auto-attend the creator: prefer user_id match (group meetings), fall back to email.
    const creatorEmail = (user.email ?? "").toLowerCase();
    let initialAttendance: string[] = [];
    const selfEntry =
      snapshot.find((r) => r.user_id === user.id) ??
      (creatorEmail ? snapshot.find((r) => (r.email ?? "").toLowerCase() === creatorEmail) : undefined);
    if (selfEntry) {
      const { error: attErr } = await sb
        .from(tables.attendance)
        .insert({
          meeting_id: data.id,
          team_id: teamId,
          roster_id: selfEntry.id,
          board_member_id: selfEntry.board_member_id ?? selfEntry.id,
        });
      if (!attErr) initialAttendance = [selfEntry.id];
    }

    setMeetings((prev) => [data, ...prev]);
    setOpenTabs((prev) => [
      ...prev,
      {
        meeting: data,
        kind: "new",
        text: data.notes ?? "",
        savedText: data.notes ?? "",
        attachments: [],
        attendance: initialAttendance,
        roster: snapshot.sort((a, b) => a.sort_order - b.sort_order),
      },
    ]);
    setNewMeetingOpen(false);
    setActiveTab(data.id);
    onMeetingOpened?.({ id: data.id, title: data.title, folder: data.folder, kind: "new" });
  }

  function openEditMeeting() {
    if (!ongoing) return;
    setEditMeetingTitle(ongoing.meeting.title ?? "");
    setEditMeetingFolder(ongoing.meeting.folder ?? "");
    setEditMeetingOpen(true);
  }

  async function saveEditMeeting() {
    if (!ongoing) return;
    const title = editMeetingTitle.trim() || ongoing.meeting.title;
    const folder = editMeetingFolder.trim() || null;
    const { error } = await sb
      .from(tables.meetings)
      .update({ title, folder, updated_at: new Date().toISOString() })
      .eq("id", ongoing.meeting.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    patchMeetingInTab(ongoing.meeting.id, { title, folder });
    setMeetings((prev) =>
      prev.map((m) => (m.id === ongoing.meeting.id ? { ...m, title, folder } : m)),
    );
    setEditMeetingOpen(false);
    toast.success("Updated");
  }

  function openMeeting(m: MeetingRow) {
    const existing = openTabs.find((t) => t.meeting.id === m.id);
    if (existing) {
      setActiveTab(m.id);
      return;
    }
    if (openTabs.length >= MAX_TABS) {
      toast.error(`You can have at most ${MAX_TABS} meeting tabs open at once. Please close another tab to open a new meeting.`);
      return;
    }
    const newTab: OpenTab = {
      meeting: m,
      kind: "earlier",
      text: m.notes ?? "",
      savedText: m.notes ?? "",
      attachments: [],
      attendance: [],
      roster: [],
    };
    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTab(m.id);
    void loadAttachmentsFor(m.id);
    void loadRosterAndAttendanceFor(m.id);
  }

  function removeTabFromOpen(id: string) {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.meeting.id !== id);
      if (activeTab === id) {
        if (next.length > 0) setActiveTab(next[next.length - 1].meeting.id);
        else setActiveTab("meetings");
      }
      return next;
    });
  }

  async function closeTab(id: string) {
    const tab = openTabs.find((t) => t.meeting.id === id);
    if (!tab) return;
    const isUnsaved = tab.text !== tab.savedText;
    const hasAnyContent =
      (tab.text && tab.text.trim().length > 0) ||
      (tab.savedText && tab.savedText.trim().length > 0) ||
      tab.attachments.length > 0;

    if (hasAnyContent) {
      if (isUnsaved) {
        await saveTabText(id);
      }
      removeTabFromOpen(id);
      return;
    }

    if (!confirm(`Do you want to delete ${kindLabel.toLowerCase()} meeting?`)) return;

    if (tab.attachments.length) {
      await supabase.storage
        .from("board-attachments")
        .remove(tab.attachments.map((a) => a.storage_path));
    }
    await sb.from(tables.attachments).delete().eq("meeting_id", id);
    const { error } = await sb.from(tables.meetings).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    removeTabFromOpen(id);
  }

  async function deleteMeeting(m: MeetingRow) {
    if (!confirm(`Do you want to delete ${kindLabel.toLowerCase()} meeting?`)) return;
    const { data: atts } = await sb
      .from(tables.attachments)
      .select("storage_path")
      .eq("meeting_id", m.id);
    if (atts && atts.length) {
      await supabase.storage.from("board-attachments").remove(atts.map((a: { storage_path: string }) => a.storage_path));
    }
    await sb.from(tables.attachments).delete().eq("meeting_id", m.id);
    const { error } = await sb.from(tables.meetings).delete().eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMeetings((prev) => prev.filter((x) => x.id !== m.id));
    if (openTabs.some((t) => t.meeting.id === m.id)) {
      removeTabFromOpen(m.id);
    }
  }

  async function saveTabText(id: string) {
    const tab = openTabs.find((t) => t.meeting.id === id);
    if (!tab) return;
    if (tab.text === tab.savedText) return;
    const textToSave = tab.text;
    setSaving(true);
    const { error } = await sb
      .from(tables.meetings)
      .update({ notes: textToSave, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    patchTab(id, { savedText: textToSave });
    patchMeetingInTab(id, { notes: textToSave });
    setMeetings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, notes: textToSave } : m)),
    );
  }

  async function saveOngoingText() {
    if (!ongoing) return;
    await saveTabText(ongoing.meeting.id);
  }

  // Autosave for the active meeting tab when enabled
  useEffect(() => {
    if (!meetingsAutosave || !isDirty || !ongoing) return;
    const t = setTimeout(() => { void saveOngoingText(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingsAutosave, ongoingText, isDirty, ongoing?.meeting.id]);

  // Register dirty-state for host close-confirmation
  useEffect(() => {
    if (!ongoing) return;
    const id = ongoing.meeting.id;
    const title = ongoing.meeting.title || "Untitled meeting";
    return registerUnsaved(id, {
      isDirty: () => (openTabs.find((t) => t.meeting.id === id)?.text ?? "") !== (openTabs.find((t) => t.meeting.id === id)?.savedText ?? ""),
      isNew: () => false,
      title: () => title,
      save: async () => { await saveTabText(id); },
      discard: async () => {
        const t = openTabs.find((x) => x.meeting.id === id);
        if (t) patchTab(id, { text: t.savedText });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ongoing?.meeting.id, ongoingText, savedText]);

  async function loadAttachmentsFor(meetingId: string) {
    const { data } = await sb
      .from(tables.attachments)
      .select("id,file_name,storage_path,file_size")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false });
    patchTab(meetingId, { attachments: data ?? [] });
  }

  async function loadRosterAndAttendanceFor(meetingId: string) {
    const rosterCols = kind === "group"
      ? "id,board_member_id,name,role,email,sort_order,is_leader,user_id"
      : "id,board_member_id,name,role,email,sort_order";
    const { data: rosterData } = await sb
      .from(tables.roster)
      .select(rosterCols)
      .eq("meeting_id", meetingId)
      .order("sort_order", { ascending: true });
    let rosterRows = (rosterData ?? []) as RosterEntry[];

    if (rosterRows.length === 0 && teamId) {
      const live = members.filter((m) => !!m.id);
      if (live.length) {
        const insertRows = live.map((m) => ({
          meeting_id: meetingId,
          team_id: teamId,
          board_member_id: m.id as string,
          name: m.name ?? "",
          role: m.role ?? "",
          email: m.email ?? "",
          sort_order: m.sort_order ?? 0,
        }));
        const { data: inserted } = await sb
          .from(tables.roster)
          .insert(insertRows)
          .select("id,board_member_id,name,role,email,sort_order");
        rosterRows = ((inserted ?? []) as RosterEntry[]).sort(
          (a, b) => a.sort_order - b.sort_order,
        );

        const { data: legacyAtt } = await sb
          .from(tables.attendance)
          .select("id,board_member_id,roster_id")
          .eq("meeting_id", meetingId);
        for (const row of legacyAtt ?? []) {
          if (row.roster_id) continue;
          const match = rosterRows.find((r) => r.board_member_id === row.board_member_id);
          if (match) {
            await sb
              .from(tables.attendance)
              .update({ roster_id: match.id })
              .eq("id", row.id);
          }
        }
      }
    }

    const { data: attData } = await sb
      .from(tables.attendance)
      .select("roster_id,board_member_id")
      .eq("meeting_id", meetingId);
    const ids: string[] = [];
    for (const r of attData ?? []) {
      if (r.roster_id) {
        ids.push(r.roster_id as string);
      } else if (r.board_member_id) {
        const match = rosterRows.find((x) => x.board_member_id === r.board_member_id);
        if (match) ids.push(match.id);
      }
    }
    patchTab(meetingId, { roster: rosterRows, attendance: ids });
  }

  function openAttendance() {
    setAttendanceDraft(attendance);
    setAttendanceOpen(true);
  }

  async function saveAttendance() {
    if (!ongoing || !teamId) return;
    setAttendanceSaving(true);
    try {
      const current = new Set(attendance);
      const draft = new Set(attendanceDraft);
      const toAdd = [...draft].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !draft.has(id));
      if (toRemove.length) {
        const { error } = await sb
          .from(tables.attendance)
          .delete()
          .eq("meeting_id", ongoing.meeting.id)
          .in("roster_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const rows = toAdd.map((rid) => {
          const entry = roster.find((r) => r.id === rid);
          return {
            meeting_id: ongoing.meeting.id,
            team_id: teamId,
            roster_id: rid,
            board_member_id: entry?.board_member_id ?? rid,
          };
        });
        const { error } = await sb
          .from(tables.attendance)
          .insert(rows);
        if (error) throw error;
      }
      setAttendance(attendanceDraft);
      setAttendanceOpen(false);
      toast.success("Attendance saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save attendance");
    } finally {
      setAttendanceSaving(false);
    }
  }

  async function uploadAttachments(files: FileList | File[]) {
    if (!teamId || !ongoing || !user) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const safeName = file.name
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "");
        const path = `${teamId}/${ongoing.meeting.id}/${Date.now()}-${safeName || "file"}`;
        const { error: upErr } = await supabase.storage
          .from("board-attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) throw upErr;
        const { error: insErr } = await sb.from(tables.attachments).insert({
          meeting_id: ongoing.meeting.id,
          team_id: teamId,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        });
        if (insErr) throw insErr;
      }
      toast.success("Uploaded");
      await loadAttachmentsFor(ongoing.meeting.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadAttachment(path: string, name: string) {
    const { data, error } = await supabase.storage.from("board-attachments").download(path);
    if (error || !data) {
      toast.error(error?.message ?? "Download failed");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeAttachment(id: string, path: string) {
    await supabase.storage.from("board-attachments").remove([path]);
    await sb.from(tables.attachments).delete().eq("id", id);
    if (ongoing) await loadAttachmentsFor(ongoing.meeting.id);
  }

  // ── Render guards ──────────────────────────────────────────────────────────
  if (authLoading || !loaded) {
    return <div className="p-12 text-sm text-muted-foreground">Loading…</div>;
  }

  if (mode !== "team" && mode !== "organizer") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl text-ink">Switch to Team mode</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The Board page is only available in Team mode. Use the I/T toggle in the left rail.
        </p>
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl text-ink">No team yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your team in Settings to manage your board.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6">
      {!embedded && (
        <header className="flex flex-wrap items-start justify-between gap-4 pt-3">
          <div>
            <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Team</p>
            <h1 className="mt-2 text-3xl text-ink md:text-4xl">Meetings</h1>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "meetings" && (
              <>
                <button
                  onClick={() => setNewFolderOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-card px-4 py-2.5 text-sm text-ink transition hover:bg-secondary"
                >
                  <Plus className="h-4 w-4" /> New folder
                </button>
                <button
                  onClick={openNewMeeting}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> New {kindLabel.toLowerCase()} meeting
                </button>
              </>
            )}
          </div>
        </header>
      )}

      {!hideOwnTabBar && (
        <nav className="mt-7 flex border-b border-hairline overflow-hidden">
          <TabBtn
            active={activeTab === "meetings"}
            onClick={() => setActiveTab("meetings")}
            icon={<CalendarClock className="h-3.5 w-3.5" />}
          >
            Meetings
          </TabBtn>
          {openTabs.map((t) => {
            const isActive = activeTab === t.meeting.id;
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
                key={t.meeting.id}
                onClick={() => setActiveTab(t.meeting.id)}
                style={{ flex: "1 1 0", minWidth: 0, maxWidth: 240 }}
                className={`group -mb-px inline-flex min-w-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition ${
                  isActive ? colorActive : colorIdle
                }`}
                title={t.meeting.title}
              >
                <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                <span className="min-w-0 flex-1 truncate text-left">
                  {t.meeting.folder ? `${t.meeting.folder} · ${t.meeting.title}` : t.meeting.title}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void closeTab(t.meeting.id);
                  }}
                  className="ml-1 shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </nav>
      )}



      {!hideOwnTabBar && activeTab === "meetings" && (
        <div className="mt-8 grid gap-8 md:grid-cols-[200px_1fr]">
          <nav className="-ml-2 flex flex-col gap-0.5">
            <SideNavBtn active={folderFilter === "all"} onClick={() => setFolderFilter("all")}>
              All
            </SideNavBtn>
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
                {folders.length === 0 && (
                  <span className="px-3 py-1.5 text-xs text-muted-foreground">No folders yet</span>
                )}
                {folders.map((f) => (
                  <SideNavBtn
                    key={f}
                    small
                    active={folderFilter === f}
                    onClick={() => setFolderFilter(f)}
                  >
                    {f}
                  </SideNavBtn>
                ))}
              </div>
            )}
          </nav>

          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={meetingSearch}
                  onChange={(e) => setMeetingSearch(e.target.value)}
                  placeholder="Search meetings…"
                  className="h-10 w-full rounded-lg border border-hairline bg-card pl-8 pr-3 text-sm text-ink outline-none focus:border-primary"
                />
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 rounded-lg border border-hairline bg-card px-3 text-sm text-ink outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 rounded-lg border border-hairline bg-card px-3 text-sm text-ink outline-none focus:border-primary"
              />
              <span className="ml-auto mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {filteredMeetings.length} / {meetings.length}
              </span>
            </div>

            <div className="mt-5 space-y-2">
              {filteredMeetings.length === 0 && (
                <div className="rounded-lg border border-hairline px-5 py-8 text-center text-sm text-muted-foreground">
                  {`No ${kindLabel.toLowerCase()} meetings yet.`}
                </div>
              )}
              {filteredMeetings.map((m) => (
                <div
                  key={m.id}
                  className="flex w-full items-center gap-3 rounded-lg border border-hairline bg-card p-4 transition hover:bg-secondary/40"
                >
                  <button
                    onClick={() => openMeeting(m)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                      <Briefcase className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{m.title}</div>
                      <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {m.meeting_date ?? new Date(m.created_at).toLocaleDateString()}
                        {m.folder && ` · ${m.folder}`}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => deleteMeeting(m)}
                    className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${kindLabel.toLowerCase()} meeting`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {activeTab !== "meetings" && ongoing && (
        <section className="mt-5 rounded-lg border border-hairline bg-card shadow-sm">
          {/* Document toolbar */}
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach documents"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <Paperclip className="h-4 w-4" />
              <span>Attach</span>
            </button>
            <button
              onClick={openAttendance}
              title="Attendance"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <ClipboardCheck className="h-4 w-4" />
              <span>Attendance</span>
            </button>
            <span className="ml-3 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
              {ongoing.meeting.folder ? `${ongoing.meeting.folder} · ${ongoing.meeting.title}` : ongoing.meeting.title}
            </span>
            <button
              onClick={openEditMeeting}
              title="Edit name and folder"
              className="ml-auto rounded-md p-2 text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <FolderIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmDeleteMeetingId(ongoing.meeting.id)}
              title="Delete meeting"
              className="rounded-md p-2 text-muted-foreground transition hover:bg-secondary hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {meetingsAutosave ? (
              <span
                title="Autosave is on. Edits are saved automatically."
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Autosave"}
              </span>
            ) : (
              <button
                onClick={saveOngoingText}
                disabled={!isDirty || saving}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition ${
                  isDirty && !saving
                    ? "text-ink hover:bg-secondary"
                    : "cursor-default text-muted-foreground/50"
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
              </button>
            )}
          </div>

          {/* Document body — single blank page */}
          <div className="mx-auto my-6 flex min-h-[700px] w-full max-w-3xl flex-col rounded-md border border-hairline bg-background p-10 shadow-inner">
            {/* Attachments always show at top of the document */}
            {attachments.length > 0 && (
              <div className="mb-6 border-b border-hairline pb-4">
                <AttachmentList
                  attachments={attachments}
                  onDownload={downloadAttachment}
                  onRemove={removeAttachment}
                />
              </div>
            )}

            {/* Attendance — between attachments divider and notes */}
            {attendance.length > 0 && (
              <div className="mb-6 border-b border-hairline pb-4">
                <div className="mono mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Attendance
                </div>
                <div className="text-sm text-ink">
                  {roster
                    .filter((r) => attendance.includes(r.id))
                    .map((r) => r.name || r.email || "—")
                    .join(", ")}
                </div>
              </div>
            )}

            <textarea
              value={ongoingText}
              onChange={(e) => setOngoingText(e.target.value)}
              onBlur={saveOngoingText}
              placeholder="Write meeting notes here…"
              className="flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-ink outline-none placeholder:text-muted-foreground/60"
            />

          </div>
        </section>
      )}

      {/* Attendance dialog */}
      {attendanceOpen && ongoing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAttendanceOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-hairline bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <h2 className="text-sm font-medium text-ink">Attendance</h2>
              <button
                onClick={() => setAttendanceOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No one was on the roster when this meeting was created.
                </p>
              ) : (() => {
                const leaders = roster.filter((r) => r.is_leader);
                const others = roster.filter((r) => !r.is_leader);
                const renderRow = (r: RosterEntry) => {
                  const id = r.id;
                  const checked = attendanceDraft.includes(id);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-hairline bg-background px-3 py-2 hover:bg-secondary/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setAttendanceDraft((prev) =>
                            e.target.checked ? [...prev, id] : prev.filter((x) => x !== id),
                          )
                        }
                        className="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">
                          {r.name || r.email || "—"}
                        </div>
                        {r.role && (
                          <div className="truncate text-xs text-muted-foreground">{r.role}</div>
                        )}
                      </div>
                    </label>
                  );
                };
                return (
                  <div className="space-y-4">
                    {leaders.length > 0 && (
                      <div className="space-y-2">
                        <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          Group leaders
                        </div>
                        {leaders.map(renderRow)}
                      </div>
                    )}
                    {others.length > 0 && (
                      <div className="space-y-2">
                        {leaders.length > 0 && (
                          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            Members
                          </div>
                        )}
                        {others.map(renderRow)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-hairline px-5 py-3">
              <button
                onClick={() => setAttendanceOpen(false)}
                className="rounded-md border border-hairline bg-background px-3 py-1.5 text-xs text-ink hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={saveAttendance}
                disabled={attendanceSaving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {attendanceSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) void uploadAttachments(fs);
          e.target.value = "";
        }}
      />

      {newFolderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setNewFolderOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg text-ink">New folder</h2>
              <button
                onClick={() => setNewFolderOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="block">
              <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Name
              </span>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                }}
                className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setNewFolderOpen(false)}
                className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={createFolder}
                disabled={!newFolderName.trim()}
                className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {newMeetingOpen && (
        <MeetingDialog
          title={`New ${kindLabel.toLowerCase()} meeting`}
          name={newMeetingTitle}
          folder={newMeetingFolder}
          folders={folders}
          onName={setNewMeetingTitle}
          onFolder={setNewMeetingFolder}
          onCreateFolder={(name) => {
            setExtraFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
            setNewMeetingFolder(name);
          }}
          onClose={() => setNewMeetingOpen(false)}
          onConfirm={startNewMeeting}
          confirmLabel="Start meeting"
          groupOptions={kind === "group" ? groupOptions : undefined}
          groupId={newMeetingGroupId}
          onGroupId={setNewMeetingGroupId}
        />
      )}

      {editMeetingOpen && (
        <MeetingDialog
          title="About this meeting"
          name={editMeetingTitle}
          folder={editMeetingFolder}
          folders={folders}
          onName={setEditMeetingTitle}
          onFolder={setEditMeetingFolder}
          onCreateFolder={(name) => {
            setExtraFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
            setEditMeetingFolder(name);
          }}
          onClose={() => setEditMeetingOpen(false)}
          onConfirm={saveEditMeeting}
          confirmLabel="Save"
        />
      )}

      {confirmDeleteMeetingId && (() => {
        const m = openTabs.find((t) => t.meeting.id === confirmDeleteMeetingId)?.meeting
          ?? meetings.find((x) => x.id === confirmDeleteMeetingId);
        const title = m?.title || "Untitled meeting";
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
            onClick={() => !deletingMeeting && setConfirmDeleteMeetingId(null)}
          >
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg text-ink">Delete meeting?</h2>
                <button
                  onClick={() => setConfirmDeleteMeetingId(null)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-ink">"{title}"</span> will be permanently removed. This cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteMeetingId(null)}
                  className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
                >Cancel</button>
                <button
                  onClick={async () => {
                    const id = confirmDeleteMeetingId;
                    if (!id) return;
                    setDeletingMeeting(true);
                    const tab = openTabs.find((t) => t.meeting.id === id);
                    const atts = tab?.attachments ?? [];
                    if (atts.length) {
                      await supabase.storage.from("board-attachments").remove(atts.map((a: { storage_path: string }) => a.storage_path));
                    } else {
                      const { data } = await sb
                        .from(tables.attachments)
                        .select("storage_path").eq("meeting_id", id);
                      if (data && data.length) {
                        await supabase.storage.from("board-attachments")
                          .remove(data.map((a: { storage_path: string }) => a.storage_path));
                      }
                    }
                    await sb.from(tables.attachments).delete().eq("meeting_id", id);
                    const { error } = await sb.from(tables.meetings).delete().eq("id", id);
                    setDeletingMeeting(false);
                    if (error) { toast.error(error.message); return; }
                    setMeetings((prev) => prev.filter((x) => x.id !== id));
                    removeTabFromOpen(id);
                    setConfirmDeleteMeetingId(null);
                    toast.success("Meeting deleted");
                    window.dispatchEvent(new Event("library:refresh"));
                    onMeetingDeleted?.(id);
                  }}
                  disabled={deletingMeeting}
                  className="rounded-full bg-destructive px-5 py-2 text-xs text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {deletingMeeting ? "Deleting…" : "Delete meeting"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function AttachmentList({
  attachments,
  onDownload,
  onRemove,
}: {
  attachments: AttachmentRow[];
  onDownload: (path: string, name: string) => void;
  onRemove: (id: string, path: string) => void;
}) {
  return (
    <div className="space-y-2">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-md border border-hairline bg-card p-2.5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </div>
          <button
            onClick={() => onDownload(a.storage_path, a.file_name)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:underline"
          >
            {a.file_name}
          </button>
          {a.file_size != null && (
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {(a.file_size / 1024).toFixed(0)} KB
            </span>
          )}
          <button
            onClick={() => onRemove(a.id, a.storage_path)}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
        active
          ? "border-primary text-ink"
          : "border-transparent text-muted-foreground hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-lg border border-hairline bg-card p-6 md:p-8">
      {children}
    </section>
  );
}

function SideNavBtn({
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

function MeetingDialog({
  title,
  name,
  folder,
  folders,
  onName,
  onFolder,
  onCreateFolder,
  onClose,
  onConfirm,
  confirmLabel,
  groupOptions,
  groupId,
  onGroupId,
}: {
  title: string;
  name: string;
  folder: string;
  folders: string[];
  onName: (v: string) => void;
  onFolder: (v: string) => void;
  onCreateFolder: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  groupOptions?: GroupOption[];
  groupId?: string;
  onGroupId?: (v: string) => void;
}) {
  const showGroup = !!groupOptions;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
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
        <label className="block">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => onName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          />
        </label>
        {showGroup && (
          <label className="mt-4 block">
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Group
            </span>
            <select
              value={groupId ?? ""}
              onChange={(e) => onGroupId?.(e.target.value)}
              className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
            >
              <option value="">Select a group…</option>
              {groupOptions!.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
        )}
        <FolderSelect folder={folder} folders={folders} onFolder={onFolder} onCreateFolder={onCreateFolder} />
        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!name.trim() || (showGroup && !groupId)}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderSelect({
  folder,
  folders,
  onFolder,
  onCreateFolder,
}: {
  folder: string;
  folders: string[];
  onFolder: (v: string) => void;
  onCreateFolder: (v: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);


  function commitAdd() {
    const name = draft.trim();
    if (!name) {
      toast.error("Folder name is required");
      return;
    }
    if (folders.includes(name)) {
      toast.error("A folder with that name already exists");
      return;
    }
    onCreateFolder(name);
    toast.success(`Folder "${name}" created`);
    setDraft("");
    setCreating(false);
  }

  return (
    <div className="mt-4">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Folder
      </span>
      {creating ? (
        <div className="mt-1 flex items-center gap-2 rounded-xl border border-hairline bg-background pr-1 focus-within:border-primary">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAdd();
              } else if (e.key === "Escape") {
                setDraft("");
                setCreating(false);
              }
            }}
            placeholder="New folder name"
            className="flex-1 bg-transparent px-4 py-2.5 text-sm text-ink outline-none"
          />
          <button
            type="button"
            onClick={commitAdd}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Add folder
          </button>
        </div>
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <select
            value={folder}
            onChange={(e) => onFolder(e.target.value)}
            className="flex-1 rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setDraft("");
              setCreating(true);
            }}
            title="Add folder"
            aria-label="Add folder"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-background text-ink hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
