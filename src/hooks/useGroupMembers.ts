/**
 * useGroupMembers — fetches the leader's group members across all groups
 * they lead. Shared by GroupMembersPage and the top-bar hover menu.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsGroupLeader } from "@/hooks/useIsGroupLeader";

export interface GroupMemberRow {
  user_id: string;
  group_id: string;
  group_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export function memberDisplayName(m: GroupMemberRow): string {
  return (
    `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() ||
    m.email ||
    "Unnamed"
  );
}

export function useGroupMembers(): { members: GroupMemberRow[]; loading: boolean } {
  const { user } = useAuth();
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setMembers([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      const email = (user.email ?? "").toLowerCase();
      const orFilter = email
        ? `user_id.eq.${user.id},email.ilike.${email}`
        : `user_id.eq.${user.id}`;

      // 1) Team-group-leader clients
      const { data: leaderRows } = await supabase
        .from("team_group_leaders")
        .select("team_id, group_id")
        .or(orFilter);
      const groupIds = Array.from(
        new Set((leaderRows ?? []).map((r) => r.group_id).filter((x): x is string => !!x)),
      );

      let teamRows: GroupMemberRow[] = [];
      if (groupIds.length > 0) {
        const { data: groupsData } = await supabase
          .from("team_groups")
          .select("id, name")
          .in("id", groupIds);
        const groupNameById = new Map<string, string>(
          (groupsData ?? []).map((g) => [g.id as string, (g.name as string) ?? ""]),
        );
        const { data: memberRows } = await supabase
          .from("team_group_members")
          .select("user_id, group_id")
          .in("group_id", groupIds);
        const userIds = Array.from(new Set((memberRows ?? []).map((r) => r.user_id as string)));
        let profileById = new Map<string, { first_name: string | null; last_name: string | null; avatar_url: string | null; email: string | null }>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url, email")
            .in("id", userIds);
          profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
        }
        teamRows = (memberRows ?? []).map((m) => {
          const p = profileById.get(m.user_id as string);
          return {
            user_id: m.user_id as string,
            group_id: m.group_id as string,
            group_name: groupNameById.get(m.group_id as string) ?? "",
            first_name: (p?.first_name as string) ?? null,
            last_name: (p?.last_name as string) ?? null,
            avatar_url: (p?.avatar_url as string) ?? null,
            email: (p?.email as string) ?? null,
          };
        });
      }

      // 2) Individual coach-clients (accepted user_coaches where I'm the coach)
      const { data: coachRows } = await supabase
        .from("user_coaches")
        .select("owner_id")
        .eq("coach_user_id", user.id)
        .eq("status", "accepted");
      const individualIds = Array.from(
        new Set((coachRows ?? []).map((r) => r.owner_id as string)),
      );
      let individualRows: GroupMemberRow[] = [];
      if (individualIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url, email")
          .in("id", individualIds);
        const profById = new Map((profs ?? []).map((p) => [p.id as string, p]));
        individualRows = individualIds.map((id) => {
          const p = profById.get(id);
          return {
            user_id: id,
            group_id: "individuals",
            group_name: "Individuals",
            first_name: (p?.first_name as string) ?? null,
            last_name: (p?.last_name as string) ?? null,
            avatar_url: (p?.avatar_url as string) ?? null,
            email: (p?.email as string) ?? null,
          };
        });
      }

      // Merge, de-dup by user_id (team membership wins)
      const seen = new Set<string>();
      const merged: GroupMemberRow[] = [];
      for (const r of [...teamRows, ...individualRows]) {
        if (seen.has(r.user_id)) continue;
        seen.add(r.user_id);
        merged.push(r);
      }

      if (!cancelled) {
        setMembers(merged);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { members, loading };
}
