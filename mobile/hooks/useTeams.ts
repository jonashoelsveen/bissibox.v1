import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AppTeam } from "@/lib/profile-context";
import {
  notifyEntityRosterChanged,
  subscribeEntityRosterSync,
} from "@/lib/entityRosterSync";

export function useTeams(ownerId: string | null) {
  const [teams, setTeams] = useState<AppTeam[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) {
      setTeams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("app_teams")
      .select("id, name, owner_id")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    setTeams((data ?? []) as AppTeam[]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTeam = useCallback(
    async (name: string, ownerEmail?: string) => {
      if (!ownerId) return null;
      const { data, error } = await supabase
        .from("app_teams")
        .insert({ owner_id: ownerId, name: name.trim() || "New team" })
        .select("id, name, owner_id")
        .single();
      if (error || !data) return null;
      const team = data as AppTeam;
      if (ownerEmail) {
        await supabase.from("app_team_admins").insert({
          team_id: team.id,
          email: ownerEmail.toLowerCase(),
          user_id: ownerId,
          status: "active",
        });
      }
      setTeams((prev) => [...prev, team]);
      return team;
    },
    [ownerId],
  );

  const updateTeam = useCallback(async (id: string, name: string) => {
    const { error } = await supabase
      .from("app_teams")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)));
    }
    return !error;
  }, []);

  const deleteTeam = useCallback(async (id: string) => {
    const { error } = await supabase.from("app_teams").delete().eq("id", id);
    if (!error) setTeams((prev) => prev.filter((t) => t.id !== id));
    return !error;
  }, []);

  return { teams, loading, load, createTeam, updateTeam, deleteTeam };
}

export type TeamGroupLink = {
  id: string;
  groupId: string;
  name: string;
  ageFrom: string;
  ageTo: string;
};

export type TeamAdmin = {
  id: string;
  team_id: string;
  email: string | null;
  user_id: string | null;
  first_name?: string | null;
  last_name?: string | null;
  sex?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  status: string;
  groups: TeamGroupLink[];
};

export type TeamGroup = {
  id: string;
  team_id: string;
  name: string;
  age_from: number | null;
  age_to: number | null;
  sort_order: number;
  deleted_at?: string | null;
};

export type TeamRoster = ReturnType<typeof useTeamRoster>;

export type TeamInviteMember = {
  id: string;
  team_id: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  sex?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  payment_status?: string | null;
  status: string;
  app_group_id: string | null;
  groups: TeamGroupLink[];
};

export type SaveRosterPersonInput = {
  id: string;
  first_name: string;
  last_name: string;
  sex: string;
  date_of_birth: string;
  email: string;
  phone: string;
  status: string;
  payment_status?: string;
  groups: TeamGroupLink[];
};

export type SaveRosterPersonResult = { ok: true } | { ok: false; error: string };

export type SaveGroupResult = { ok: true } | { ok: false; error: string };

function activeGroups(rows: TeamGroup[]): TeamGroup[] {
  return rows.filter((g) => g.deleted_at == null);
}

function buildGroupLinks(
  links: Array<{ id: string; group_id: string }>,
  groupById: Map<string, TeamGroup>,
): TeamGroupLink[] {
  return links.map((link) => {
    const group = groupById.get(link.group_id);
    return {
      id: link.id,
      groupId: link.group_id,
      name: group?.name ?? "",
      ageFrom: group?.age_from != null ? String(group.age_from) : "",
      ageTo: group?.age_to != null ? String(group.age_to) : "",
    };
  });
}

function mapAdminRow(
  row: TeamAdmin & {
    first_name?: string | null;
    last_name?: string | null;
    sex?: string | null;
    phone?: string | null;
    date_of_birth?: string | null;
  },
  links: TeamGroupLink[],
): TeamAdmin {
  return {
    ...row,
    email: row.email ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    sex: row.sex ?? null,
    phone: row.phone ?? null,
    date_of_birth: row.date_of_birth ?? null,
    groups: links,
  };
}

function mapMemberRow(
  row: TeamInviteMember & {
    app_group_id?: string | null;
    sex?: string | null;
    phone?: string | null;
    date_of_birth?: string | null;
    payment_status?: string | null;
  },
  links: TeamGroupLink[],
  groupById: Map<string, TeamGroup>,
): TeamInviteMember {
  const resolvedLinks =
    links.length > 0
      ? links
      : row.app_group_id
        ? buildGroupLinks([{ id: `legacy:${row.id}`, group_id: row.app_group_id }], groupById)
        : [];
  return {
    ...row,
    email: row.email ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    sex: row.sex ?? null,
    phone: row.phone ?? null,
    date_of_birth: row.date_of_birth ?? null,
    payment_status: row.payment_status ?? null,
    app_group_id: row.app_group_id ?? null,
    groups: resolvedLinks,
  };
}

function isMissingPhoneColumnError(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  return (
    code === "42703" ||
    (msg.includes("phone") &&
      (msg.includes("schema cache") ||
        msg.includes("does not exist") ||
        msg.includes("could not find")))
  );
}

function isMissingAdminGroupsTableError(error: { message?: string; code?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("entity_admin_groups") && msg.includes("does not exist");
}

function buildAdminPayload(
  teamId: string,
  row: SaveRosterPersonInput,
  includePhone: boolean,
) {
  const payload = {
    team_id: teamId,
    first_name: row.first_name.trim() || null,
    last_name: row.last_name.trim() || null,
    sex: row.sex || null,
    date_of_birth: row.date_of_birth || null,
    email: row.email.trim().toLowerCase() || null,
    status: row.status === "pending" ? "pending" : "roster",
  };
  return includePhone ? { ...payload, phone: row.phone.trim() || null } : payload;
}

function buildMemberPayload(
  teamId: string,
  row: SaveRosterPersonInput,
  includePhone: boolean,
) {
  const payload = {
    team_id: teamId,
    first_name: row.first_name.trim() || null,
    last_name: row.last_name.trim() || null,
    sex: row.sex || null,
    date_of_birth: row.date_of_birth || null,
    payment_status: row.payment_status ?? "",
    email: row.email.trim().toLowerCase() || null,
    status: row.status === "pending" ? "pending" : "roster",
    app_group_id: row.groups.find((g) => g.groupId)?.groupId ?? null,
  };
  return includePhone ? { ...payload, phone: row.phone.trim() || null } : payload;
}

export function useTeamRoster(teamId: string | null) {
  const [admins, setAdmins] = useState<TeamAdmin[]>([]);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [members, setMembers] = useState<TeamInviteMember[]>([]);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const remoteLoadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!teamId) {
      setAdmins([]);
      setGroups([]);
      setMembers([]);
      return;
    }
    const [a, g, m, memberLinkRes, adminLinkRes] = await Promise.all([
      supabase.from("app_team_admins").select("*").eq("team_id", teamId).order("created_at"),
      supabase.from("app_team_groups").select("*").eq("team_id", teamId).order("sort_order"),
      supabase.from("entity_members").select("*").eq("team_id", teamId).order("created_at"),
      supabase.from("entity_member_groups").select("id, member_id, group_id").eq("team_id", teamId),
      supabase.from("entity_admin_groups").select("id, admin_id, group_id").eq("team_id", teamId),
    ]);
    if (a.error) console.error("[useTeamRoster] load admins", a.error.message);
    if (g.error) console.error("[useTeamRoster] load groups", g.error.message);
    if (m.error) console.error("[useTeamRoster] load members", m.error.message);
    if (memberLinkRes.error) console.error("[useTeamRoster] load member groups", memberLinkRes.error.message);
    if (adminLinkRes.error) {
      console.warn("[useTeamRoster] load admin groups", adminLinkRes.error.message);
    }

    const mappedGroups = activeGroups((g.data ?? []) as TeamGroup[]);
    const groupById = new Map(mappedGroups.map((group) => [group.id, group]));

    const linksByMember = new Map<string, Array<{ id: string; group_id: string }>>();
    for (const link of memberLinkRes.data ?? []) {
      const list = linksByMember.get(link.member_id) ?? [];
      list.push({ id: link.id, group_id: link.group_id });
      linksByMember.set(link.member_id, list);
    }

    const linksByAdmin = new Map<string, Array<{ id: string; group_id: string }>>();
    if (!adminLinkRes.error) {
      for (const link of adminLinkRes.data ?? []) {
        const list = linksByAdmin.get(link.admin_id) ?? [];
        list.push({ id: link.id, group_id: link.group_id });
        linksByAdmin.set(link.admin_id, list);
      }
    }

    setGroups(mappedGroups);
    setAdmins(
      ((a.data ?? []) as Array<TeamAdmin & { first_name?: string | null; last_name?: string | null }>).map(
        (row) =>
          mapAdminRow(row, buildGroupLinks(linksByAdmin.get(row.id) ?? [], groupById)),
      ),
    );
    setMembers(
      ((m.data ?? []) as Array<TeamInviteMember & { app_group_id?: string | null }>).map((row) =>
        mapMemberRow(row, buildGroupLinks(linksByMember.get(row.id) ?? [], groupById), groupById),
      ),
    );
  }, [teamId]);

  loadRef.current = load;

  const broadcastRosterChange = useCallback(() => {
    if (teamId) void notifyEntityRosterChanged(supabase, teamId);
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!teamId) return;
    return subscribeEntityRosterSync(supabase, teamId, () => {
      if (remoteLoadTimer.current) clearTimeout(remoteLoadTimer.current);
      remoteLoadTimer.current = setTimeout(() => {
        void loadRef.current();
      }, 50);
    });
  }, [teamId]);

  const invite = useCallback(
    async (email: string, role: "admin" | "athlete" | "coach" | "member") => {
      if (!teamId) return { error: "No team" };
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return { error: "Not signed in" };

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mobile-team-invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ team_id: teamId, email, role }),
        },
      );
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) return { error: json.error ?? "Invite failed" };
      await load();
      broadcastRosterChange();
      return { error: null };
    },
    [teamId, load, broadcastRosterChange],
  );

  const saveGroup = useCallback(
    async (input: {
      id?: string;
      name: string;
      age_from: number | null;
      age_to: number | null;
    }): Promise<SaveGroupResult> => {
      if (!teamId) return { ok: false, error: "No team selected" };
      const trimmedName = input.name.trim() || "New group";

      if (input.id) {
        const { data, error } = await supabase
          .from("app_team_groups")
          .update({
            name: trimmedName,
            age_from: input.age_from,
            age_to: input.age_to,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) {
          console.error("[useTeamRoster] saveGroup update", error.message);
          return { ok: false, error: error.message };
        }
        const row = data as TeamGroup;
        setGroups((prev) => prev.map((g) => (g.id === row.id ? row : g)));
        broadcastRosterChange();
        return { ok: true };
      }

      const maxOrder = groups.reduce((m, g) => Math.max(m, g.sort_order), -1);
      const { data, error } = await supabase
        .from("app_team_groups")
        .insert({
          team_id: teamId,
          name: trimmedName,
          age_from: input.age_from,
          age_to: input.age_to,
          sort_order: maxOrder + 1,
        })
        .select("*")
        .single();

      if (error || !data) {
        console.error("[useTeamRoster] saveGroup insert", error?.message ?? "No row returned");
        return { ok: false, error: error?.message ?? "Could not create group" };
      }

      const row = data as TeamGroup;
      setGroups((prev) => [...prev, row].sort((a, b) => a.sort_order - b.sort_order));
      broadcastRosterChange();
      return { ok: true };
    },
    [teamId, groups, broadcastRosterChange],
  );

  const deleteRow = useCallback(
    async (
      table: "app_team_admins" | "app_team_groups" | "entity_members",
      id: string,
    ) => {
      if (table === "app_team_groups") {
        setGroups((prev) => prev.filter((g) => g.id !== id));
        const { error: softError } = await supabase
          .from("app_team_groups")
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", id);
        if (!softError) {
          broadcastRosterChange();
          return true;
        }

        console.warn("[useTeamRoster] soft delete failed, trying hard delete", softError.message);
        const { error: hardError } = await supabase.from("app_team_groups").delete().eq("id", id);
        if (hardError) {
          console.error("[useTeamRoster] delete group", hardError.message);
          await load();
          return false;
        }
        broadcastRosterChange();
        return true;
      }
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) {
        console.error(`[useTeamRoster] delete ${table}`, error.message);
        await load();
        return false;
      }
      if (table === "app_team_admins") {
        setAdmins((prev) => prev.filter((a) => a.id !== id));
      } else if (table === "entity_members") {
        setMembers((prev) => prev.filter((m) => m.id !== id));
      }
      broadcastRosterChange();
      return true;
    },
    [load, broadcastRosterChange],
  );

  const reorderGroups = useCallback(
    async (from: number, to: number) => {
      if (from === to) return;
      const next = [...groups];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const reordered = next.map((g, i) => ({ ...g, sort_order: i }));
      setGroups(reordered);
      const results = await Promise.all(
        reordered.map((g, i) =>
          supabase.from("app_team_groups").update({ sort_order: i }).eq("id", g.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        console.error("[useTeamRoster] reorderGroups", failed.error.message);
        await load();
      } else {
        broadcastRosterChange();
      }
    },
    [groups, load, broadcastRosterChange],
  );

  const syncAdminGroups = useCallback(
    async (adminId: string, nextGroups: TeamGroupLink[]): Promise<boolean> => {
      if (!teamId) return false;
      const { data: existing, error: readError } = await supabase
        .from("entity_admin_groups")
        .select("id, group_id")
        .eq("admin_id", adminId);
      if (readError) {
        if (isMissingAdminGroupsTableError(readError)) {
          console.warn("[useTeamRoster] entity_admin_groups not available");
          return true;
        }
        console.error("[useTeamRoster] syncAdminGroups read", readError.message);
        return false;
      }

      const wantIds = new Set(
        nextGroups.map((g) => g.groupId).filter((id): id is string => !!id),
      );
      const toDelete = ((existing ?? []) as Array<{ id: string; group_id: string }>).filter(
        (row) => !wantIds.has(row.group_id),
      );
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("entity_admin_groups")
          .delete()
          .in(
            "id",
            toDelete.map((r) => r.id),
          );
        if (error) {
          console.error("[useTeamRoster] syncAdminGroups delete", error.message);
          return false;
        }
      }

      const existingGroupIds = new Set(
        ((existing ?? []) as Array<{ group_id: string }>).map((r) => r.group_id),
      );
      const toInsert = [...wantIds].filter((id) => !existingGroupIds.has(id));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("entity_admin_groups").insert(
          toInsert.map((groupId) => ({
            team_id: teamId,
            admin_id: adminId,
            group_id: groupId,
          })),
        );
        if (error) {
          console.error("[useTeamRoster] syncAdminGroups insert", error.message);
          return false;
        }
      }
      return true;
    },
    [teamId],
  );

  const syncMemberGroups = useCallback(
    async (memberId: string, nextGroups: TeamGroupLink[]): Promise<boolean> => {
      if (!teamId) return false;
      const { data: existing, error: readError } = await supabase
        .from("entity_member_groups")
        .select("id, group_id")
        .eq("member_id", memberId);
      if (readError) {
        console.error("[useTeamRoster] syncMemberGroups read", readError.message);
        return false;
      }

      const wantIds = new Set(
        nextGroups.map((g) => g.groupId).filter((id): id is string => !!id),
      );
      const toDelete = ((existing ?? []) as Array<{ id: string; group_id: string }>).filter(
        (row) => !wantIds.has(row.group_id),
      );
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("entity_member_groups")
          .delete()
          .in(
            "id",
            toDelete.map((r) => r.id),
          );
        if (error) {
          console.error("[useTeamRoster] syncMemberGroups delete", error.message);
          return false;
        }
      }

      const existingGroupIds = new Set(
        ((existing ?? []) as Array<{ group_id: string }>).map((r) => r.group_id),
      );
      const toInsert = [...wantIds].filter((id) => !existingGroupIds.has(id));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("entity_member_groups").insert(
          toInsert.map((groupId) => ({
            team_id: teamId,
            member_id: memberId,
            group_id: groupId,
          })),
        );
        if (error) {
          console.error("[useTeamRoster] syncMemberGroups insert", error.message);
          return false;
        }
      }
      return true;
    },
    [teamId],
  );

  const phoneColumnSupportedRef = useRef(true);

  const saveAdministrator = useCallback(
    async (row: SaveRosterPersonInput): Promise<SaveRosterPersonResult> => {
      if (!teamId) return { ok: false, error: "No team selected" };
      let includePhone = phoneColumnSupportedRef.current;
      let payload = buildAdminPayload(teamId, row, includePhone);
      let { error: updateError } = await supabase
        .from("app_team_admins")
        .update(payload)
        .eq("id", row.id);
      if (updateError && includePhone && isMissingPhoneColumnError(updateError)) {
        phoneColumnSupportedRef.current = false;
        includePhone = false;
        payload = buildAdminPayload(teamId, row, false);
        ({ error: updateError } = await supabase
          .from("app_team_admins")
          .update(payload)
          .eq("id", row.id));
      }
      if (updateError) {
        console.error("[useTeamRoster] saveAdministrator", updateError.message);
        return { ok: false, error: updateError.message };
      }
      const ok = await syncAdminGroups(
        row.id,
        row.groups.filter((g) => g.groupId),
      );
      if (!ok) {
        await load();
        return { ok: false, error: "Could not save group assignments" };
      }
      await load();
      broadcastRosterChange();
      return { ok: true };
    },
    [teamId, syncAdminGroups, load, broadcastRosterChange],
  );

  const saveMember = useCallback(
    async (row: SaveRosterPersonInput): Promise<SaveRosterPersonResult> => {
      if (!teamId) return { ok: false, error: "No team selected" };
      let includePhone = phoneColumnSupportedRef.current;
      let payload = buildMemberPayload(teamId, row, includePhone);
      let { error: updateError } = await supabase
        .from("entity_members")
        .update(payload)
        .eq("id", row.id);
      if (updateError && includePhone && isMissingPhoneColumnError(updateError)) {
        phoneColumnSupportedRef.current = false;
        includePhone = false;
        payload = buildMemberPayload(teamId, row, false);
        ({ error: updateError } = await supabase
          .from("entity_members")
          .update(payload)
          .eq("id", row.id));
      }
      if (updateError) {
        console.error("[useTeamRoster] saveMember", updateError.message);
        return { ok: false, error: updateError.message };
      }
      const ok = await syncMemberGroups(
        row.id,
        row.groups.filter((g) => g.groupId),
      );
      if (!ok) {
        await load();
        return { ok: false, error: "Could not save group assignments" };
      }
      await load();
      broadcastRosterChange();
      return { ok: true };
    },
    [teamId, syncMemberGroups, load, broadcastRosterChange],
  );

  return {
    admins,
    groups,
    members,
    load,
    invite,
    saveGroup,
    saveAdministrator,
    saveMember,
    deleteRow,
    reorderGroups,
  };
}
