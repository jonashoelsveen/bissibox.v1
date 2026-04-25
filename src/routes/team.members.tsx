import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  ChevronDown,
  GripVertical,
  Plus,
  Save,
  Search,
  Trash2,
  Users as UsersIcon,
  Layers,
  Wallet,
  Network,
} from "lucide-react";
import { OrgChart, type OrgPerson, type OrgGroup } from "@/components/OrgChart";

export const Route = createFileRoute("/team/members")({
  component: TeamMembersPage,
  head: () => ({ meta: [{ title: "Organization · Raceline" }] }),
});

interface GroupDraft {
  id?: string;
  name: string;
  age_from: string;
  age_to: string;
  sort_order: number;
  member_count: number;
  description: string;
  leader_name: string;
  leader_email: string;
  leader_phone: string;
  is_default: boolean;
}

interface MembershipDraft {
  id?: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  sort_order: number;
  group_assignment_mode: "volunteer" | "criteria";
  criteria_label: string;
}

interface MemberRow {
  team_member_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  email: string | null;
  group_ids: string[];
}

function TeamMembersPage() {
  const { user, loading: authLoading, mode } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"memberships" | "groups" | "members" | "chart">("memberships");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Groups state
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragHandleIdx, setDragHandleIdx] = useState<number | null>(null);

  // Memberships state
  const [memberships, setMemberships] = useState<MembershipDraft[]>([]);
  const [openMemIdx, setOpenMemIdx] = useState<number | null>(null);
  const [dragMemIdx, setDragMemIdx] = useState<number | null>(null);
  const [dragMemHandleIdx, setDragMemHandleIdx] = useState<number | null>(null);

  // Members state
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState("");
  // group assignments map: user_id -> group_id ("" = none)
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  // Board / team meta for org chart
  const [teamName, setTeamName] = useState<string>("");
  const [boardMembers, setBoardMembers] = useState<Array<{ id: string; name: string; role: string; email: string }>>([]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: team } = await supabase
        .from("teams")
        .select("id, name")
        .eq("owner_id", user.id)
        .maybeSingle();
      const tid = (team as { id: string; name: string | null } | null)?.id ?? null;
      setTeamName((team as { id: string; name: string | null } | null)?.name ?? "");
      setTeamId(tid);
      if (!tid) {
        setLoaded(true);
        return;
      }

      const [{ data: gs }, { data: tms }, { data: tgms }, { data: tiers }, { data: bms }] = await Promise.all([
        supabase
          .from("team_groups")
          .select("id,name,age_from,age_to,sort_order,description,leader_name,leader_email,leader_phone,is_default")
          .eq("team_id", tid)
          .order("sort_order", { ascending: true }),
        supabase
          .from("team_members")
          .select("id,user_id,accepted")
          .eq("team_id", tid),
        supabase
          .from("team_group_members")
          .select("group_id,user_id")
          .eq("team_id", tid),
        supabase
          .from("team_membership_tiers")
          .select("id,name,description,price,currency,sort_order,group_assignment_mode,criteria_label")
          .eq("team_id", tid)
          .order("sort_order", { ascending: true }),
        supabase
          .from("team_board_members")
          .select("id,name,role,email,sort_order")
          .eq("team_id", tid)
          .order("sort_order", { ascending: true }),
      ]);

      setBoardMembers(
        ((bms ?? []) as Array<{ id: string; name: string | null; role: string | null; email: string | null }>).map((b) => ({
          id: b.id,
          name: b.name ?? "",
          role: b.role ?? "",
          email: b.email ?? "",
        })),
      );

      setMemberships(
        ((tiers ?? []) as Array<{ id: string; name: string | null; description: string | null; price: number | null; currency: string | null; sort_order: number | null; group_assignment_mode: string | null; criteria_label: string | null }>).map((t, i) => ({
          id: t.id,
          name: t.name ?? "",
          description: t.description ?? "",
          price: t.price != null ? String(t.price) : "0",
          currency: t.currency ?? "NOK",
          sort_order: t.sort_order ?? i,
          group_assignment_mode: (t.group_assignment_mode === "criteria" ? "criteria" : "volunteer"),
          criteria_label: t.criteria_label ?? "age",
        }))
      );

      const tgmsArr = (tgms ?? []) as { group_id: string; user_id: string }[];
      const countByGroup: Record<string, number> = {};
      for (const x of tgmsArr) countByGroup[x.group_id] = (countByGroup[x.group_id] ?? 0) + 1;

      setGroups(
        ((gs ?? []) as Array<{ id: string; name: string | null; age_from: number | null; age_to: number | null; sort_order: number | null; description: string | null; leader_name: string | null; leader_email: string | null; leader_phone: string | null; is_default: boolean | null }>).map((g, i) => ({
          id: g.id,
          name: g.name ?? "",
          age_from: g.age_from != null ? String(g.age_from) : "",
          age_to: g.age_to != null ? String(g.age_to) : "",
          sort_order: g.sort_order ?? i,
          member_count: countByGroup[g.id] ?? 0,
          description: g.description ?? "",
          leader_name: g.leader_name ?? "",
          leader_email: g.leader_email ?? "",
          leader_phone: g.leader_phone ?? "",
          is_default: !!g.is_default,
        }))
      );

      const userIds = (tms ?? []).map((t) => t.user_id);
      let profMap: Record<string, { first_name: string | null; last_name: string | null; birth_date: string | null; email: string | null }> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,birth_date,email")
          .in("id", userIds);
        for (const p of (profs ?? []) as { id: string; first_name: string | null; last_name: string | null; birth_date: string | null; email: string | null }[]) {
          profMap[p.id] = p;
        }
      }

      const groupsByUser: Record<string, string[]> = {};
      for (const x of tgmsArr) {
        (groupsByUser[x.user_id] = groupsByUser[x.user_id] ?? []).push(x.group_id);
      }

      const memRows: MemberRow[] = (tms ?? []).map((t) => {
        const p = profMap[t.user_id];
        return {
          team_member_id: t.id,
          user_id: t.user_id,
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          birth_date: p?.birth_date ?? null,
          email: p?.email ?? null,
          group_ids: groupsByUser[t.user_id] ?? [],
        };
      });
      setMembers(memRows);

      const initAssign: Record<string, string> = {};
      for (const m of memRows) initAssign[m.user_id] = m.group_ids[0] ?? "";
      setAssignments(initAssign);

      setLoaded(true);
    })();
  }, [user]);

  const currentYear = new Date().getFullYear();

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      return [m.first_name, m.last_name, m.email].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [members, search]);

  // Build org chart data (board + groups with leaders + members)
  const orgBoard: OrgPerson[] = useMemo(
    () =>
      boardMembers.map((b) => ({
        id: b.id,
        name: b.name || b.email || "Board member",
        role: b.role || null,
        email: b.email || null,
        phone: null,
      })),
    [boardMembers],
  );

  const orgGroups: OrgGroup[] = useMemo(() => {
    return groups
      .filter((g) => g.id)
      .map((g) => {
        const memberPeople: OrgPerson[] = members
          .filter((m) => (assignments[m.user_id] ?? "") === g.id)
          .map((m) => ({
            id: m.user_id,
            name: [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Unnamed",
            role: null,
            email: m.email,
            phone: null,
          }));
        const leaders: OrgPerson[] = g.leader_name || g.leader_email || g.leader_phone
          ? [
              {
                id: `leader-${g.id}`,
                name: g.leader_name || g.leader_email || "Leader",
                role: "Leader",
                email: g.leader_email || null,
                phone: g.leader_phone || null,
              },
            ]
          : [];
        return {
          id: g.id!,
          name: g.name || "Untitled",
          description: g.description || null,
          leaders,
          members: memberPeople,
        };
      });
  }, [groups, members, assignments]);


  const save = async () => {
    if (!teamId) {
      toast.error("Create a team first in Settings.");
      return;
    }
    setBusy(true);
    try {
      // Replace groups: delete removed, upsert kept/added.
      const existingIds = groups.filter((g) => g.id).map((g) => g.id!) as string[];
      // Delete groups in DB that are not in current list
      const { data: dbGroups } = await supabase
        .from("team_groups")
        .select("id")
        .eq("team_id", teamId);
      const dbIds = (dbGroups ?? []).map((d) => d.id as string);
      const toDelete = dbIds.filter((id) => !existingIds.includes(id));
      if (toDelete.length) {
        await supabase.from("team_groups").delete().in("id", toDelete);
      }

      // Upsert / insert
      const idMap: Record<number, string> = {};
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const payload = {
          team_id: teamId,
          name: g.name.trim() || `Group ${i + 1}`,
          age_from: g.age_from ? Number(g.age_from) : null,
          age_to: g.age_to ? Number(g.age_to) : null,
          sort_order: i,
          description: g.description.trim() || null,
          leader_name: g.leader_name.trim() || null,
          leader_email: g.leader_email.trim() || null,
          leader_phone: g.leader_phone.trim() || null,
          is_default: g.is_default,
        };
        if (g.id) {
          const { error } = await supabase
            .from("team_groups")
            .update(payload as never)
            .eq("id", g.id);
          if (error) throw error;
          idMap[i] = g.id;
        } else {
          const { data, error } = await supabase
            .from("team_groups")
            .insert(payload as never)
            .select("id")
            .single();
          if (error) throw error;
          idMap[i] = data!.id as string;
        }
      }

      // Replace member assignments based on `assignments` map
      // (Single-group selection per user from the Members tab)
      await supabase.from("team_group_members").delete().eq("team_id", teamId);
      const inserts: { team_id: string; group_id: string; user_id: string }[] = [];
      for (const [uid, gid] of Object.entries(assignments)) {
        if (!gid) continue;
        // Translate index-based fresh ids if user assigned to a brand-new group? assignments use real ids from DB.
        inserts.push({ team_id: teamId, group_id: gid, user_id: uid });
      }
      if (inserts.length) {
        const { error } = await supabase.from("team_group_members").insert(inserts as never);
        if (error) throw error;
      }

      // Reload group ids back into the local groups list (replace temp)
      setGroups((arr) => arr.map((g, i) => ({ ...g, id: idMap[i] })));

      // Replace memberships
      const memExistingIds = memberships.filter((m) => m.id).map((m) => m.id!) as string[];
      const { data: dbTiers } = await supabase
        .from("team_membership_tiers")
        .select("id")
        .eq("team_id", teamId);
      const dbTierIds = (dbTiers ?? []).map((d) => d.id as string);
      const tiersToDelete = dbTierIds.filter((id) => !memExistingIds.includes(id));
      if (tiersToDelete.length) {
        await supabase.from("team_membership_tiers").delete().in("id", tiersToDelete);
      }
      const memIdMap: Record<number, string> = {};
      for (let i = 0; i < memberships.length; i++) {
        const m = memberships[i];
        const payload = {
          team_id: teamId,
          name: m.name.trim() || `Membership ${i + 1}`,
          description: m.description.trim() || null,
          price: m.price ? Number(m.price) : 0,
          currency: m.currency.trim() || "NOK",
          sort_order: i,
          group_assignment_mode: m.group_assignment_mode,
          criteria_label: (m.criteria_label.trim() || "age"),
        };
        if (m.id) {
          const { error } = await supabase
            .from("team_membership_tiers")
            .update(payload as never)
            .eq("id", m.id);
          if (error) throw error;
          memIdMap[i] = m.id;
        } else {
          const { data, error } = await supabase
            .from("team_membership_tiers")
            .insert(payload as never)
            .select("id")
            .single();
          if (error) throw error;
          memIdMap[i] = data!.id as string;
        }
      }
      setMemberships((arr) => arr.map((m, i) => ({ ...m, id: memIdMap[i] })));

      toast.success("Members saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || !loaded) {
    return <div className="mx-auto max-w-5xl px-6 py-16 text-muted-foreground">Loading…</div>;
  }

  if (mode !== "team") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl text-ink">Switch to Team mode</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The Members page is only available in Team mode. Use the I/T toggle in the left rail.
        </p>
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl text-ink">No team yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your team in Settings to manage members.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 pt-3">
        <div>
          <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Team</p>
          <h1 className="mt-2 text-3xl text-ink md:text-4xl">Organization</h1>
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {busy ? "Saving…" : "Save"}
        </button>
      </header>

      <nav className="mt-7 flex border-b border-hairline">
        <TabBtn active={tab === "memberships"} onClick={() => setTab("memberships")} icon={<Wallet className="h-3.5 w-3.5" />}>
          Memberships
        </TabBtn>
        <TabBtn active={tab === "groups"} onClick={() => setTab("groups")} icon={<Layers className="h-3.5 w-3.5" />}>
          Groups
        </TabBtn>
        <TabBtn active={tab === "members"} onClick={() => setTab("members")} icon={<UsersIcon className="h-3.5 w-3.5" />}>
          Members
        </TabBtn>
        <TabBtn active={tab === "chart"} onClick={() => setTab("chart")} icon={<Network className="h-3.5 w-3.5" />}>
          Chart
        </TabBtn>
      </nav>

      {tab === "memberships" && (
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Memberships people can choose when joining your team. Drag to reorder, click to expand.
            </p>
            <button
              onClick={() => {
                setMemberships((arr) => [
                  ...arr,
                  { name: "", description: "", price: "0", currency: "NOK", sort_order: arr.length, group_assignment_mode: "volunteer", criteria_label: "age" },
                ]);
                setOpenMemIdx(memberships.length);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-3 py-1.5 text-xs text-ink hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> Add new membership
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {memberships.length === 0 && (
              <div className="rounded-lg border border-hairline px-5 py-8 text-center text-sm text-muted-foreground">
                No memberships yet. Add one to let people join.
              </div>
            )}
            {memberships.map((m, idx) => {
              const isDragging = dragMemIdx === idx;
              return (
                <div
                  key={m.id ?? `new-mem-${idx}`}
                  draggable={dragMemHandleIdx === idx}
                  onDragStart={(e) => {
                    if (dragMemHandleIdx !== idx) {
                      e.preventDefault();
                      return;
                    }
                    setDragMemIdx(idx);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    if (dragMemIdx === null) return;
                    const from = dragMemIdx;
                    const to = idx;
                    if (from === to) return;
                    setMemberships((arr) => {
                      const next = [...arr];
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      return next.map((x, i) => ({ ...x, sort_order: i }));
                    });
                    setOpenMemIdx((o) => (o === from ? to : o === to ? from : o));
                    setDragMemIdx(to);
                  }}
                  onDragOver={(e) => {
                    if (dragMemIdx === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragMemIdx(null);
                    setDragMemHandleIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragMemIdx(null);
                    setDragMemHandleIdx(null);
                  }}
                  className={`overflow-hidden rounded-lg border border-hairline bg-card transition ${
                    isDragging ? "opacity-40" : ""
                  }`}
                >
                  <MembershipRow
                    membership={m}
                    open={openMemIdx === idx}
                    onToggle={() => setOpenMemIdx((o) => (o === idx ? null : idx))}
                    onChange={(patch) =>
                      setMemberships((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
                    }
                    onDelete={() => {
                      if (!confirm(`Delete membership "${m.name || `Membership ${idx + 1}`}"? This cannot be undone.`)) return;
                      setMemberships((arr) => arr.filter((_, i) => i !== idx));
                      setOpenMemIdx(null);
                    }}
                    onHandleDown={() => setDragMemHandleIdx(idx)}
                    onHandleUp={() => setDragMemHandleIdx(null)}
                    hasGroups={groups.length > 0}
                  />
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {tab === "groups" && (
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Group your team members by age. Drag to reorder, click to expand.
            </p>
            <button
              onClick={() => {
                setGroups((arr) => [
                  ...arr,
                  { name: "", age_from: "", age_to: "", sort_order: arr.length, member_count: 0, description: "", leader_name: "", leader_email: "", leader_phone: "", is_default: false },
                ]);
                setOpenIdx(groups.length);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-3 py-1.5 text-xs text-ink hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> Add group
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {groups.length === 0 && (
              <div className="rounded-lg border border-hairline px-5 py-8 text-center text-sm text-muted-foreground">
                No groups yet. Add one to get started.
              </div>
            )}
            {groups.map((g, idx) => {
              const isDragging = dragIdx === idx;
              return (
                <div
                  key={g.id ?? `new-${idx}`}
                  draggable={dragHandleIdx === idx}
                  onDragStart={(e) => {
                    if (dragHandleIdx !== idx) {
                      e.preventDefault();
                      return;
                    }
                    setDragIdx(idx);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    if (dragIdx === null) return;
                    const from = dragIdx;
                    const to = idx;
                    if (from === to) return;
                    setGroups((arr) => {
                      const next = [...arr];
                      const [moved] = next.splice(from, 1);
                      next.splice(to, 0, moved);
                      return next.map((x, i) => ({ ...x, sort_order: i }));
                    });
                    setOpenIdx((o) => (o === from ? to : o === to ? from : o));
                    setDragIdx(to);
                  }}
                  onDragOver={(e) => {
                    if (dragIdx === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragIdx(null);
                    setDragOverIdx(null);
                    setDragHandleIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragOverIdx(null);
                    setDragHandleIdx(null);
                  }}
                  className={`overflow-hidden rounded-lg border border-hairline bg-card transition ${
                    isDragging ? "opacity-40" : ""
                  }`}
                >
                  <GroupRow
                    group={g}
                    open={openIdx === idx}
                    onToggle={() => setOpenIdx((o) => (o === idx ? null : idx))}
                    currentYear={currentYear}
                    onChange={(patch) =>
                      setGroups((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
                    }
                    onDelete={() => {
                      if (!confirm(`Delete group "${g.name || `Group ${idx + 1}`}"? This cannot be undone.`)) return;
                      setGroups((arr) => arr.filter((_, i) => i !== idx));
                      setOpenIdx(null);
                    }}
                    onHandleDown={() => setDragHandleIdx(idx)}
                    onHandleUp={() => setDragHandleIdx(null)}
                  />
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {tab === "members" && (
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email…"
                className="h-10 w-full rounded-lg border border-hairline bg-card pl-8 pr-3 text-sm text-ink outline-none focus:border-primary"
              />
            </div>
            <span className="ml-auto mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {filteredMembers.length} / {members.length}
            </span>
          </div>

          <section className="mt-3 overflow-hidden rounded-lg border border-hairline bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-hairline bg-secondary/50 text-left">
                    <Th>First name</Th>
                    <Th>Surname</Th>
                    <Th className="w-24">Born</Th>
                    <Th>Email</Th>
                    <Th className="w-56">Groups</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        No members yet.
                      </td>
                    </tr>
                  )}
                  {filteredMembers.map((m, i) => {
                    const born = m.birth_date ? m.birth_date.slice(0, 10).replace(/-/g, "") : "—";
                    return (
                      <tr
                        key={m.user_id}
                        className={`border-b border-hairline transition last:border-b-0 hover:bg-secondary/40 ${
                          i % 2 === 0 ? "bg-card" : "bg-background/40"
                        }`}
                      >
                        <td className="px-3 py-1 text-ink">{m.first_name ?? "—"}</td>
                        <td className="px-3 py-1 text-ink">{m.last_name ?? ""}</td>
                        <td className="px-3 py-1 num text-ink">{born}</td>
                        <td className="px-3 py-1 text-muted-foreground">{m.email ?? "—"}</td>
                        <td className="px-3 py-1">
                          {groups.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <select
                              value={assignments[m.user_id] ?? ""}
                              onChange={(e) =>
                                setAssignments((a) => ({ ...a, [m.user_id]: e.target.value }))
                              }
                              className="w-full cursor-pointer rounded-md border border-hairline bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-primary"
                            >
                              <option value="">— No group —</option>
                              {groups
                                .filter((g) => g.id)
                                .map((g, gi) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name || `Group ${gi + 1}`}{g.is_default ? " (Default)" : ""}
                                  </option>
                                ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {groups.some((g) => !g.id) && (
            <p className="mt-2 text-xs text-muted-foreground">
              New groups appear in the dropdown after you save.
            </p>
          )}
        </Panel>
      )}

      {tab === "chart" && (
        <Panel>
          <div className="h-[640px] min-h-[520px] w-full">
            <OrgChart board={orgBoard} groups={orgGroups} teamName={teamName} />
          </div>
        </Panel>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function GroupRow({
  group,
  open,
  onToggle,
  onChange,
  onDelete,
  currentYear,
  onHandleDown,
  onHandleUp,
}: {
  group: GroupDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<GroupDraft>) => void;
  onDelete: () => void;
  currentYear: number;
  onHandleDown?: () => void;
  onHandleUp?: () => void;
}) {
  const yearFrom = group.age_from ? currentYear - Number(group.age_from) : null;
  const yearTo = group.age_to ? currentYear - Number(group.age_to) : null;
  return (
    <div>
      <div className="flex w-full items-center gap-2 bg-secondary/40 px-3 py-3 transition hover:bg-secondary">
        <span
          onMouseDown={onHandleDown}
          onMouseUp={onHandleUp}
          onMouseLeave={onHandleUp}
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-hairline bg-background text-muted-foreground hover:text-ink active:cursor-grabbing"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="truncate text-sm font-medium text-ink">
            {group.name || "Untitled group"}
          </span>
          {group.is_default && (
            <span className="mono rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-primary">
              Default
            </span>
          )}
          <span className="mono text-xs text-muted-foreground">
            · {group.member_count} total members
          </span>
        </button>
        <button
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Name</span>
              <input
                value={group.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="U10, Senior, Masters…"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Age from</span>
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {yearFrom ?? "—"}
              </span>
              <input
                type="number"
                min={0}
                value={group.age_from}
                onChange={(e) => onChange({ age_from: e.target.value })}
                placeholder="6"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Age to</span>
              <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {yearTo ?? "—"}
              </span>
              <input
                type="number"
                min={0}
                value={group.age_to}
                onChange={(e) => onChange({ age_to: e.target.value })}
                placeholder="10"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 md:col-span-3">
              <span className="text-xs text-muted-foreground">Detail / info</span>
              <textarea
                value={group.description}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={2}
                placeholder={group.is_default ? "Members whose age does not fit any defined group land here automatically." : "Anything new joiners should know about this group."}
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Group leader name</span>
              <input
                value={group.leader_name}
                onChange={(e) => onChange({ leader_name: e.target.value })}
                placeholder="—"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Leader email</span>
              <input
                type="email"
                value={group.leader_email}
                onChange={(e) => onChange({ leader_email: e.target.value })}
                placeholder="leader@team.com"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Leader phone</span>
              <input
                value={group.leader_phone}
                onChange={(e) => onChange({ leader_phone: e.target.value })}
                placeholder="+47 …"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <p className="md:col-span-3 text-[11px] text-muted-foreground">
              If left empty, joiners see the team's contact email/phone instead.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MembershipRow({
  membership,
  open,
  onToggle,
  onChange,
  onDelete,
  onHandleDown,
  onHandleUp,
  hasGroups,
}: {
  membership: MembershipDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<MembershipDraft>) => void;
  onDelete: () => void;
  onHandleDown?: () => void;
  onHandleUp?: () => void;
  hasGroups: boolean;
}) {
  return (
    <div>
      <div className="flex w-full items-center gap-2 bg-secondary/40 px-3 py-3 transition hover:bg-secondary">
        <span
          onMouseDown={onHandleDown}
          onMouseUp={onHandleUp}
          onMouseLeave={onHandleUp}
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-hairline bg-background text-muted-foreground hover:text-ink active:cursor-grabbing"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="truncate text-sm font-medium text-ink">
            {membership.name || "Untitled membership"}
          </span>
          {membership.price && Number(membership.price) > 0 && (
            <span className="mono text-xs text-muted-foreground">
              · {membership.price} {membership.currency || "NOK"}
            </span>
          )}
        </button>
        <button
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 md:col-span-3">
              <span className="text-xs text-muted-foreground">Name</span>
              <input
                value={membership.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="Standard, Family, Junior…"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Price</span>
              <input
                type="number"
                min={0}
                value={membership.price}
                onChange={(e) => onChange({ price: e.target.value })}
                placeholder="0"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Currency</span>
              <input
                value={membership.currency}
                onChange={(e) => onChange({ currency: e.target.value })}
                placeholder="NOK"
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-3">
              <span className="text-xs text-muted-foreground">Description</span>
              <textarea
                value={membership.description}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={3}
                placeholder="What's included with this membership."
                className="rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
          </div>

          {hasGroups && (
            <div className="mt-5 rounded-lg border border-hairline bg-background/50 p-4">
              <p className="mono mb-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Group assignment
              </p>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={membership.group_assignment_mode === "volunteer"}
                    onChange={() => onChange({ group_assignment_mode: "volunteer" })}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                  />
                  <span className="text-sm text-ink">
                    <span className="font-medium">Volunteer</span>{" "}
                    <span className="text-muted-foreground">— member chooses their group when joining.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={membership.group_assignment_mode === "criteria"}
                    onChange={() => onChange({ group_assignment_mode: "criteria" })}
                    className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                  />
                  <span className="text-sm text-ink">
                    <span className="font-medium">Categorize by</span>{" "}
                    <input
                      value={membership.criteria_label}
                      onChange={(e) => onChange({ criteria_label: e.target.value, group_assignment_mode: "criteria" })}
                      placeholder="age"
                      className="ml-1 inline-block w-32 rounded-md border border-hairline bg-background px-2 py-0.5 text-sm text-ink outline-none focus:border-primary"
                    />
                    <span className="text-muted-foreground"> — auto-assigned (currently always uses age range).</span>
                  </span>
                </label>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                One option must be selected. The criteria word is shown to members in the confirmation message.
              </p>
            </div>
          )}
        </div>
      )}
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

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={`mt-5 rounded-lg border border-hairline bg-card p-6 md:p-8 ${className ?? ""}`}>{children}</section>;
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`mono px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
