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
  const isLeader = useIsGroupLeader();
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !isLeader) {
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
      const { data: leaderRows } = await supabase
        .from("team_group_leaders")
        .select("team_id, group_id")
        .or(orFilter);
      const groupIds = Array.from(
        new Set((leaderRows ?? []).map((r) => r.group_id).filter((x): x is string => !!x)),
      );
      if (groupIds.length === 0) {
        if (!cancelled) { setMembers([]); setLoading(false); }
        return;
      }
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
      if (userIds.length === 0) {
        if (!cancelled) { setMembers([]); setLoading(false); }
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url, email")
        .in("id", userIds);
      const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
      const rows: GroupMemberRow[] = (memberRows ?? []).map((m) => {
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
      if (!cancelled) {
        setMembers(rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isLeader]);

  return { members, loading };
}
