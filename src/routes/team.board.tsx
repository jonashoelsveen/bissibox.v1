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
}

function TeamBoardPage() {
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
  const [editMeetingOpen, setEditMeetingOpen] = useState(false);
  const [editMeetingTitle, setEditMeetingTitle] = useState("");
  const [editMeetingFolder, setEditMeetingFolder] = useState<string>("");
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
      await Promise.all([loadMembers(tid), loadMeetings(tid)]);
      setLoaded(true);
    })();
  }, [user, activeEntityId]);

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
    const { data } = await supabase
      .from("team_board_meetings")
      .select("id,title,folder,meeting_date,notes,created_at")
      .eq("team_id", tid)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    setMeetings(data ?? []);
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
    setNewMeetingTitle(`Board meeting · ${new Date().toLocaleDateString()}`);
    setNewMeetingFolder("");
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
    const title = newMeetingTitle.trim() || `Board meeting · ${new Date().toLocaleDateString()}`;
    const folder = newMeetingFolder.trim() || null;
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
    if (error) {
      toast.error(error.message);
      return;
    }
    const snapshotRows = members
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
    let snapshot: RosterEntry[] = [];
    if (snapshotRows.length) {
      const { data: rosterData } = await supabase
        .from("team_board_meeting_roster")
        .insert(snapshotRows)
        .select("id,board_member_id,name,role,email,sort_order");
      snapshot = (rosterData ?? []) as RosterEntry[];
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
        attendance: [],
        roster: snapshot.sort((a, b) => a.sort_order - b.sort_order),
      },
    ]);
    setNewMeetingOpen(false);
    setActiveTab(data.id);
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
    const { error } = await supabase
      .from("team_board_meetings")
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

    if (!confirm("Do you want to delete board meeting?")) return;

    if (tab.attachments.length) {
      await supabase.storage
        .from("board-attachments")
        .remove(tab.attachments.map((a) => a.storage_path));
    }
    await supabase.from("team_board_meeting_attachments").delete().eq("meeting_id", id);
    const { error } = await supabase.from("team_board_meetings").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    removeTabFromOpen(id);
  }

  async function deleteMeeting(m: MeetingRow) {
    if (!confirm("Do you want to delete board meeting?")) return;
    const { data: atts } = await supabase
      .from("team_board_meeting_attachments")
      .select("storage_path")
      .eq("meeting_id", m.id);
    if (atts && atts.length) {
      await supabase.storage.from("board-attachments").remove(atts.map((a) => a.storage_path));
    }
    await supabase.from("team_board_meeting_attachments").delete().eq("meeting_id", m.id);
    const { error } = await supabase.from("team_board_meetings").delete().eq("id", m.id);
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
    const { error } = await supabase
      .from("team_board_meetings")
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

  async function loadAttachmentsFor(meetingId: string) {
    const { data } = await supabase
      .from("team_board_meeting_attachments")
      .select("id,file_name,storage_path,file_size")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false });
    patchTab(meetingId, { attachments: data ?? [] });
  }

  async function loadRosterAndAttendanceFor(meetingId: string) {
    const { data: rosterData } = await supabase
      .from("team_board_meeting_roster")
      .select("id,board_member_id,name,role,email,sort_order")
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
        const { data: inserted } = await supabase
          .from("team_board_meeting_roster")
          .insert(insertRows)
          .select("id,board_member_id,name,role,email,sort_order");
        rosterRows = ((inserted ?? []) as RosterEntry[]).sort(
          (a, b) => a.sort_order - b.sort_order,
        );

        const { data: legacyAtt } = await supabase
          .from("team_board_meeting_attendance")
          .select("id,board_member_id,roster_id")
          .eq("meeting_id", meetingId);
        for (const row of legacyAtt ?? []) {
          if (row.roster_id) continue;
          const match = rosterRows.find((r) => r.board_member_id === row.board_member_id);
          if (match) {
            await supabase
              .from("team_board_meeting_attendance")
              .update({ roster_id: match.id })
              .eq("id", row.id);
          }
        }
      }
    }

    const { data: attData } = await supabase
      .from("team_board_meeting_attendance")
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
        const { error } = await supabase
          .from("team_board_meeting_attendance")
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
        const { error } = await supabase
          .from("team_board_meeting_attendance")
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
        const { error: insErr } = await supabase.from("team_board_meeting_attachments").insert({
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
    await supabase.from("team_board_meeting_attachments").delete().eq("id", id);
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
                <Plus className="h-4 w-4" /> New board meeting
              </button>
            </>
          )}
        </div>
      </header>

      <nav className="mt-7 flex border-b border-hairline">
        <TabBtn
          active={tab === "meetings"}
          onClick={() => setTab("meetings")}
          icon={<CalendarClock className="h-3.5 w-3.5" />}
        >
          Meetings
        </TabBtn>
        {ongoing && (
          <button
            onClick={() => setTab("ongoing")}
            className={`group -mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
              tab === "ongoing"
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-emerald-600/80 hover:text-emerald-700 dark:text-emerald-400/80"
            }`}
            title={ongoing.title}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="max-w-[240px] truncate">
              {ongoing.folder ? `${ongoing.folder} · ${ongoing.title}` : ongoing.title}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                closeOngoing();
              }}
              className="ml-1 rounded px-1 text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </span>
          </button>
        )}
      </nav>



      {tab === "meetings" && (
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
                  No board meetings yet.
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
                    aria-label="Delete board meeting"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === "ongoing" && ongoing && (
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
              {ongoing.folder ? `${ongoing.folder} · ${ongoing.title}` : ongoing.title}
            </span>
            <button
              onClick={openEditMeeting}
              title="Edit name and folder"
              className="ml-auto rounded-md p-2 text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <FolderIcon className="h-4 w-4" />
            </button>
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
                  No board members were on the board when this meeting was created.
                </p>
              ) : (
                <div className="space-y-2">
                  {roster.map((r) => {
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
                              e.target.checked
                                ? [...prev, id]
                                : prev.filter((x) => x !== id),
                            )
                          }
                          className="h-4 w-4"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-ink">
                            {r.name || r.email || "—"}
                          </div>
                          {r.role && (
                            <div className="truncate text-xs text-muted-foreground">
                              {r.role}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
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
          title="New board meeting"
          name={newMeetingTitle}
          folder={newMeetingFolder}
          folders={folders}
          onName={setNewMeetingTitle}
          onFolder={setNewMeetingFolder}
          onClose={() => setNewMeetingOpen(false)}
          onConfirm={startNewMeeting}
          confirmLabel="Start meeting"
        />
      )}

      {editMeetingOpen && (
        <MeetingDialog
          title="Edit meeting"
          name={editMeetingTitle}
          folder={editMeetingFolder}
          folders={folders}
          onName={setEditMeetingTitle}
          onFolder={setEditMeetingFolder}
          onClose={() => setEditMeetingOpen(false)}
          onConfirm={saveEditMeeting}
          confirmLabel="Save"
        />
      )}
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
  onClose,
  onConfirm,
  confirmLabel,
}: {
  title: string;
  name: string;
  folder: string;
  folders: string[];
  onName: (v: string) => void;
  onFolder: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
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
        <div className="mt-4">
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Folder
          </span>
          <select
            value={folder}
            onChange={(e) => onFolder(e.target.value)}
            className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
          >
            <option value="">None</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!name.trim()}
            className="rounded-full bg-primary px-5 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
