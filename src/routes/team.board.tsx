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
  head: () => ({ meta: [{ title: "Board · Raceline" }] }),
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
  const [tab, setTab] = useState<"members" | "meetings" | "ongoing">("members");
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
  const [meetingSearch, setMeetingSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Ongoing meeting
  const [ongoing, setOngoing] = useState<MeetingRow | null>(null);
  const [ongoingText, setOngoingText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [attendance, setAttendance] = useState<string[]>([]); // roster_ids
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceDraft, setAttendanceDraft] = useState<string[]>([]);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDirty = ongoingText !== savedText;

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
    return Array.from(set).sort();
  }, [meetings]);

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

  async function startNewMeeting() {
    if (!teamId || !user) return;
    const { data, error } = await supabase
      .from("team_board_meetings")
      .insert({
        team_id: teamId,
        title: `Board meeting · ${new Date().toLocaleDateString()}`,
        meeting_date: new Date().toISOString().slice(0, 10),
        created_by: user.id,
      })
      .select("id,title,folder,meeting_date,notes,created_at")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    // Snapshot the current board roster for this meeting
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
    setOngoing(data);
    setOngoingText(data.notes ?? "");
    setSavedText(data.notes ?? "");
    setAttachments([]);
    setAttendance([]);
    setRoster(snapshot.sort((a, b) => a.sort_order - b.sort_order));
    setTab("ongoing");
  }

  function openMeeting(m: MeetingRow) {
    setOngoing(m);
    setOngoingText(m.notes ?? "");
    setSavedText(m.notes ?? "");
    setTab("ongoing");
    void loadAttachments(m.id);
    void loadRosterAndAttendance(m.id);
  }

  async function closeOngoing() {
    if (!ongoing) return;
    const isUnsaved = ongoingText !== savedText;
    const hasAnyContent =
      (ongoingText && ongoingText.trim().length > 0) ||
      (savedText && savedText.trim().length > 0) ||
      attachments.length > 0;

    // If there's any content, persist any pending edits and just close the tab.
    if (hasAnyContent) {
      if (isUnsaved) {
        await saveOngoingText();
      }
      setOngoing(null);
      setAttachments([]);
      setAttendance([]);
      setOngoingText("");
      setSavedText("");
      setTab("meetings");
      return;
    }

    // Truly empty meeting — confirm deletion
    if (!confirm("Do you want to delete board meeting?")) return;

    if (attachments.length) {
      await supabase.storage
        .from("board-attachments")
        .remove(attachments.map((a) => a.storage_path));
    }
    await supabase.from("team_board_meeting_attachments").delete().eq("meeting_id", ongoing.id);
    const { error } = await supabase.from("team_board_meetings").delete().eq("id", ongoing.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMeetings((prev) => prev.filter((m) => m.id !== ongoing.id));
    setOngoing(null);
    setAttachments([]);
    setTab("meetings");
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
    if (ongoing?.id === m.id) {
      setOngoing(null);
      setAttachments([]);
      setTab("meetings");
    }
  }

  async function saveOngoingText() {
    if (!ongoing) return;
    if (ongoingText === savedText) return;
    const textToSave = ongoingText;
    setSaving(true);
    const { error } = await supabase
      .from("team_board_meetings")
      .update({ notes: textToSave, updated_at: new Date().toISOString() })
      .eq("id", ongoing.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSavedText(textToSave);
    setOngoing((prev) => (prev ? { ...prev, notes: textToSave } : prev));
    setMeetings((prev) =>
      prev.map((m) => (m.id === ongoing.id ? { ...m, notes: textToSave } : m)),
    );
    toast.success("Saved");
  }

  async function loadAttachments(meetingId: string) {
    const { data } = await supabase
      .from("team_board_meeting_attachments")
      .select("id,file_name,storage_path,file_size")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false });
    setAttachments(data ?? []);
  }

  async function loadRosterAndAttendance(meetingId: string) {
    // Load roster snapshot
    const { data: rosterData } = await supabase
      .from("team_board_meeting_roster")
      .select("id,board_member_id,name,role,email,sort_order")
      .eq("meeting_id", meetingId)
      .order("sort_order", { ascending: true });
    let rosterRows = (rosterData ?? []) as RosterEntry[];

    // Backfill: legacy meetings without a roster — snapshot from current live members.
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

        // Migrate any legacy attendance rows (which used board_member_id) to roster_id
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
    setRoster(rosterRows);

    const { data: attData } = await supabase
      .from("team_board_meeting_attendance")
      .select("roster_id,board_member_id")
      .eq("meeting_id", meetingId);
    const ids: string[] = [];
    for (const r of attData ?? []) {
      if (r.roster_id) {
        ids.push(r.roster_id as string);
      } else if (r.board_member_id) {
        // Legacy fallback — map to roster entry by board_member_id
        const match = rosterRows.find((x) => x.board_member_id === r.board_member_id);
        if (match) ids.push(match.id);
      }
    }
    setAttendance(ids);
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
          .eq("meeting_id", ongoing.id)
          .in("roster_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const rows = toAdd.map((rid) => {
          const entry = roster.find((r) => r.id === rid);
          return {
            meeting_id: ongoing.id,
            team_id: teamId,
            roster_id: rid,
            board_member_id: entry?.board_member_id ?? rid, // legacy NOT NULL column
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
        const path = `${teamId}/${ongoing.id}/${Date.now()}-${safeName || "file"}`;
        const { error: upErr } = await supabase.storage
          .from("board-attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("team_board_meeting_attachments").insert({
          meeting_id: ongoing.id,
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
      await loadAttachments(ongoing.id);
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
    if (ongoing) await loadAttachments(ongoing.id);
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
          <h1 className="mt-2 text-3xl text-ink md:text-4xl">Board</h1>
        </div>
        <div className="flex items-center gap-2">
          {tab === "meetings" && (
            <button
              onClick={startNewMeeting}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> New board meeting
            </button>
          )}
          {tab === "members" && (
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </header>

      <nav className="mt-7 flex border-b border-hairline">
        <TabBtn
          active={tab === "members"}
          onClick={() => setTab("members")}
          icon={<UsersIcon className="h-3.5 w-3.5" />}
        >
          Members of the board
        </TabBtn>
        <TabBtn
          active={tab === "meetings"}
          onClick={() => setTab("meetings")}
          icon={<CalendarClock className="h-3.5 w-3.5" />}
        >
          Board meetings
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
            <span className="max-w-[200px] truncate">{ongoing.title}</span>
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

      {tab === "members" && (
        <Panel>
          <div className="space-y-3">
            {members.length === 0 && (
              <div className="rounded-lg border border-hairline px-5 py-8 text-center text-sm text-muted-foreground">
                No board members yet. Add one to get started.
              </div>
            )}
            {members.map((m, i) => (
              <div
                key={m.id ?? `new-${i}`}
                className="flex items-center gap-4 rounded-lg border border-hairline bg-card p-4"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <UserIcon className="h-6 w-6" />
                </div>
                <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-3">
                  <input
                    placeholder="Name"
                    value={m.name}
                    onChange={(e) => updateMember(i, { name: e.target.value })}
                    className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                  />
                  <input
                    placeholder="Role (e.g. Chair, Treasurer)"
                    value={m.role}
                    onChange={(e) => updateMember(i, { role: e.target.value })}
                    className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                  />
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        placeholder="Email"
                        value={m.email}
                        onChange={(e) => updateMember(i, { email: e.target.value })}
                        className="w-full rounded-md border border-hairline bg-background py-2 pl-8 pr-3 text-sm text-ink outline-none focus:border-primary"
                      />
                    </div>
                    <button
                      onClick={() => inviteMember(i)}
                      title={
                        m.status === "active"
                          ? "Active board member"
                          : m.invited_at
                            ? "Invitation pending"
                            : `Invite to ${teamName || "team"} board`
                      }
                      className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition ${
                        m.status === "active"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : m.invited_at
                            ? "border border-hairline bg-card text-muted-foreground hover:text-ink"
                            : "bg-primary text-primary-foreground hover:opacity-90"
                      }`}
                    >
                      {m.status === "active" ? "Active" : m.invited_at ? "Pending" : "Invite"}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => removeMember(i)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Remove board member"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addMember}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-3 py-1.5 text-xs text-ink hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> Add board member
          </button>
        </Panel>
      )}

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
              className="rounded-md p-2 text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {ongoing.title}
            </span>
            <button
              onClick={openAttendance}
              title="Attendance"
              className="ml-auto rounded-md p-2 text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <ClipboardCheck className="h-4 w-4" />
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
              {members.filter((m) => !!m.id).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No board members yet. Add them in the Members tab.
                </p>
              ) : (
                <div className="space-y-2">
                  {members
                    .filter((m) => !!m.id)
                    .map((m) => {
                      const id = m.id as string;
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
                              {m.name || m.email || "—"}
                            </div>
                            {m.role && (
                              <div className="truncate text-xs text-muted-foreground">
                                {m.role}
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
