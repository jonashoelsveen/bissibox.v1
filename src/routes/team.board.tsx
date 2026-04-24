import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  Briefcase,
  ChevronDown,
  Folder,
  LayoutGrid,
  Mail,
  Paperclip,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

type MeetingTab = { kind: "meeting"; id: string; title: string };

function TeamBoardPage() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"members" | "meetings" | string>("members");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Members
  const [members, setMembers] = useState<BoardMemberDraft[]>([]);

  // Meetings
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [meetingSearch, setMeetingSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Ongoing meeting tab
  const [ongoing, setOngoing] = useState<MeetingTab | null>(null);
  const [ongoingTab, setOngoingTab] = useState<"text" | "attachments">("attachments");
  const [attachments, setAttachments] = useState<
    { id: string; file_name: string; storage_path: string; file_size: number | null }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: team } = await supabase
        .from("teams")
        .select("id,name")
        .eq("owner_id", user.id)
        .maybeSingle();
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
  }, [user]);

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

  // ------- Members tab -------
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

  async function saveMembers() {
    if (!teamId) return;
    setBusy(true);
    try {
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        if (m.id) {
          await supabase
            .from("team_board_members")
            .update({
              name: m.name,
              role: m.role,
              email: m.email,
              sort_order: i,
            })
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
    if (!m.id) {
      await saveMembers();
    }
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

  // ------- Meetings tab -------
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
    setMeetings((prev) => [data, ...prev]);
    setOngoing({ kind: "meeting", id: data.id, title: data.title });
    setTab(`meeting:${data.id}`);
    setOngoingTab("attachments");
    setAttachments([]);
  }

  function openMeeting(m: MeetingRow) {
    setOngoing({ kind: "meeting", id: m.id, title: m.title });
    setTab(`meeting:${m.id}`);
    setOngoingTab("attachments");
    void loadAttachments(m.id);
  }

  function closeOngoing() {
    setOngoing(null);
    setTab("meetings");
  }

  async function loadAttachments(meetingId: string) {
    const { data } = await supabase
      .from("team_board_meeting_attachments")
      .select("id,file_name,storage_path,file_size")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false });
    setAttachments(data ?? []);
  }

  async function uploadAttachment(file: File) {
    if (!teamId || !ongoing || !user) return;
    setBusy(true);
    try {
      const path = `${teamId}/${ongoing.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("board-attachments")
        .upload(path, file, { contentType: file.type });
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

  if (authLoading || !loaded) {
    return <div className="p-12 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!teamId) {
    return (
      <div className="mx-auto max-w-3xl p-12">
        <h1 className="text-2xl font-semibold">Board</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You don't have a team yet. Create one in your team profile to manage a board.
        </p>
      </div>
    );
  }

  const showingMeeting = tab.startsWith("meeting:") && ongoing;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Board</h1>
        <div className="flex items-center gap-2">
          {tab === "members" && (
            <Button onClick={saveMembers} disabled={busy} size="sm">
              <Save className="mr-1.5 h-4 w-4" />
              Save
            </Button>
          )}
          {tab === "meetings" && (
            <Button onClick={startNewMeeting} disabled={busy} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New board meeting
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 inline-flex items-center gap-1 rounded-full border border-hairline bg-card p-1">
        <TabBtn active={tab === "members"} onClick={() => setTab("members")}>
          Members of the board
        </TabBtn>
        <TabBtn active={tab === "meetings"} onClick={() => setTab("meetings")}>
          Board meetings
        </TabBtn>
        {ongoing && (
          <button
            type="button"
            onClick={() => setTab(`meeting:${ongoing.id}`)}
            className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              showingMeeting
                ? "bg-emerald-500 text-white shadow-sm"
                : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
            }`}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300 ring-2 ring-emerald-300/40" />
            {ongoing.title}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                closeOngoing();
              }}
              className="ml-1 rounded-full px-1 text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </span>
          </button>
        )}
      </div>

      {tab === "members" && (
        <MembersTab
          members={members}
          onAdd={addMember}
          onUpdate={updateMember}
          onRemove={removeMember}
          onInvite={inviteMember}
          teamName={teamName}
        />
      )}

      {tab === "meetings" && (
        <MeetingsTab
          meetings={filteredMeetings}
          folders={folders}
          folderFilter={folderFilter}
          setFolderFilter={setFolderFilter}
          search={meetingSearch}
          setSearch={setMeetingSearch}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          onOpen={openMeeting}
        />
      )}

      {showingMeeting && (
        <OngoingMeetingTab
          tab={ongoingTab}
          setTab={setOngoingTab}
          attachments={attachments}
          onUploadClick={() => fileInputRef.current?.click()}
          onDownload={downloadAttachment}
          onRemove={removeAttachment}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadAttachment(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// ------- Members tab UI -------
function MembersTab({
  members,
  onAdd,
  onUpdate,
  onRemove,
  onInvite,
  teamName,
}: {
  members: BoardMemberDraft[];
  onAdd: () => void;
  onUpdate: (idx: number, patch: Partial<BoardMemberDraft>) => void;
  onRemove: (idx: number) => void;
  onInvite: (idx: number) => void;
  teamName: string;
}) {
  return (
    <div>
      <div className="space-y-3">
        {members.map((m, i) => (
          <div
            key={m.id ?? i}
            className="flex items-center gap-4 rounded-xl border border-hairline bg-card p-4 shadow-sm"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <UserIcon className="h-6 w-6" />
            </div>
            <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-3">
              <Input
                placeholder="Name"
                value={m.name}
                onChange={(e) => onUpdate(i, { name: e.target.value })}
              />
              <Input
                placeholder="Role (e.g. Chair, Treasurer)"
                value={m.role}
                onChange={(e) => onUpdate(i, { role: e.target.value })}
              />
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="Email"
                    className="pl-8"
                    value={m.email}
                    onChange={(e) => onUpdate(i, { email: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  variant={m.status === "active" ? "secondary" : m.invited_at ? "outline" : "default"}
                  onClick={() => onInvite(i)}
                  title={
                    m.status === "active"
                      ? "Active board member"
                      : m.invited_at
                        ? "Invitation pending"
                        : `Invite to ${teamName || "team"} board`
                  }
                >
                  {m.status === "active" ? "Active" : m.invited_at ? "Pending" : "Invite"}
                </Button>
              </div>
            </div>
            <button
              onClick={() => onRemove(i)}
              className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"
              aria-label="Remove board member"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-dashed border-hairline px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-ink"
      >
        <Plus className="h-4 w-4" />
        Add board member
      </button>
    </div>
  );
}

// ------- Meetings tab UI -------
function MeetingsTab({
  meetings,
  folders,
  folderFilter,
  setFolderFilter,
  search,
  setSearch,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  onOpen,
}: {
  meetings: MeetingRow[];
  folders: string[];
  folderFilter: string;
  setFolderFilter: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (s: string) => void;
  setDateTo: (s: string) => void;
  onOpen: (m: MeetingRow) => void;
}) {
  const [folderOpen, setFolderOpen] = useState(true);
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
      <aside className="space-y-1">
        <button
          onClick={() => setFolderFilter("all")}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition ${
            folderFilter === "all" ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:bg-secondary/60"
          }`}
        >
          <LayoutGrid className="h-4 w-4" /> All
        </button>
        <button
          onClick={() => setFolderOpen((v) => !v)}
          className="mt-2 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-ink hover:bg-secondary/60"
        >
          <Folder className="h-4 w-4" />
          Folder
          <ChevronDown
            className={`ml-auto h-4 w-4 transition ${folderOpen ? "" : "-rotate-90"}`}
          />
        </button>
        {folderOpen && (
          <div className="ml-4 space-y-0.5">
            {folders.length === 0 && (
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground">No folders yet</div>
            )}
            {folders.map((f) => (
              <button
                key={f}
                onClick={() => setFolderFilter(f)}
                className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm transition ${
                  folderFilter === f
                    ? "bg-secondary font-medium text-ink"
                    : "text-muted-foreground hover:bg-secondary/60"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </aside>

      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search meetings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[150px]"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[150px]"
          />
        </div>

        <div className="space-y-2">
          {meetings.length === 0 && (
            <div className="rounded-xl border border-dashed border-hairline p-8 text-center text-sm text-muted-foreground">
              No board meetings yet
            </div>
          )}
          {meetings.map((m) => (
            <button
              key={m.id}
              onClick={() => onOpen(m)}
              className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-card p-4 text-left transition hover:bg-secondary/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-ink">{m.title}</div>
                <div className="text-xs text-muted-foreground">
                  {m.meeting_date ?? new Date(m.created_at).toLocaleDateString()}
                  {m.folder && ` · ${m.folder}`}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------- Ongoing meeting tab UI -------
function OngoingMeetingTab({
  tab,
  setTab,
  attachments,
  onUploadClick,
  onDownload,
  onRemove,
}: {
  tab: "text" | "attachments";
  setTab: (t: "text" | "attachments") => void;
  attachments: { id: string; file_name: string; storage_path: string; file_size: number | null }[];
  onUploadClick: () => void;
  onDownload: (path: string, name: string) => void;
  onRemove: (id: string, path: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
      <aside className="space-y-1">
        <button
          onClick={() => setTab("text")}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition ${
            tab === "text" ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:bg-secondary/60"
          }`}
        >
          Text
        </button>
        <button
          onClick={() => setTab("attachments")}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition ${
            tab === "attachments"
              ? "bg-secondary font-medium text-ink"
              : "text-muted-foreground hover:bg-secondary/60"
          }`}
        >
          <Paperclip className="h-4 w-4" /> Attachments
        </button>
      </aside>

      <div>
        {tab === "text" && (
          <div className="rounded-xl border border-dashed border-hairline p-12 text-center text-sm text-muted-foreground">
            Coming soon
          </div>
        )}

        {tab === "attachments" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">Attachments</h2>
              <Button onClick={onUploadClick} size="sm">
                <Upload className="mr-1.5 h-4 w-4" /> Upload document
              </Button>
            </div>

            <div className="space-y-2">
              {attachments.length === 0 && (
                <div className="rounded-xl border border-dashed border-hairline p-8 text-center text-sm text-muted-foreground">
                  No attachments yet
                </div>
              )}
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-hairline bg-card p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <button
                    onClick={() => onDownload(a.storage_path, a.file_name)}
                    className="flex-1 truncate text-left text-sm font-medium text-ink hover:underline"
                  >
                    {a.file_name}
                  </button>
                  {a.file_size != null && (
                    <span className="text-xs text-muted-foreground">
                      {(a.file_size / 1024).toFixed(0)} KB
                    </span>
                  )}
                  <button
                    onClick={() => onRemove(a.id, a.storage_path)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
