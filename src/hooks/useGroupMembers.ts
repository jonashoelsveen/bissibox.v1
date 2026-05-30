/**
 * useGroupMembers — fetches the leader's group members across all groups
 * they lead. Shared by GroupMembersPage and the top-bar hover menu.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";


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
  const { user, activeEntityId } = useAuth();
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setMembers([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setMembers([]);
    void (async () => {
      setLoading(true);
      let rows: GroupMemberRow[] = [];

      if (activeEntityId) {
        const [{ data: memberRows }, { data: groups }] = await Promise.all([
          supabase
            .from("team_group_members")
            .select("user_id,group_id")
            .eq("team_id", activeEntityId),
          supabase
            .from("team_groups")
            .select("id,name")
            .eq("team_id", activeEntityId),
        ]);

        const groupNameById = new Map(
          (groups ?? []).map((group) => [group.id as string, (group.name as string) || "Clients"]),
        );
        const uniqueMembers = new Map<string, { user_id: string; group_id: string }>();

        for (const row of (memberRows ?? []) as Array<{ user_id: string; group_id: string }>) {
          if (!uniqueMembers.has(row.user_id)) {
            uniqueMembers.set(row.user_id, row);
          }
        }

        const ids = Array.from(uniqueMembers.keys());
        if (ids.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url, email")
            .in("id", ids);
          const profById = new Map(
            (profs ?? []).map((p) => [p.id as string, p]),
          );
          rows = ids.map((id) => {
            const member = uniqueMembers.get(id)!;
            const p = profById.get(id);
            return {
              user_id: id,
              group_id: member.group_id,
              group_name: groupNameById.get(member.group_id) ?? "Clients",
              first_name: (p?.first_name as string) ?? null,
              last_name: (p?.last_name as string) ?? null,
              avatar_url: (p?.avatar_url as string) ?? null,
              email: (p?.email as string) ?? null,
            };
          });
        }
      } else {
        // Personal profile: a "client" is any user who has accepted this
        // signed-in user as their coach.
        const { data: coachRows } = await supabase
          .from("user_coaches")
          .select("owner_id")
          .eq("coach_user_id", user.id)
          .eq("status", "accepted");

        const ids = Array.from(
          new Set((coachRows ?? []).map((r) => r.owner_id as string)),
        );

        if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url, email")
          .in("id", ids);
        const profById = new Map(
          (profs ?? []).map((p) => [p.id as string, p]),
        );
        rows = ids.map((id) => {
          const p = profById.get(id);
          return {
            user_id: id,
            group_id: "clients",
            group_name: "Clients",
            first_name: (p?.first_name as string) ?? null,
            last_name: (p?.last_name as string) ?? null,
            avatar_url: (p?.avatar_url as string) ?? null,
            email: (p?.email as string) ?? null,
          };
        });
      }
      }

      if (!cancelled) {
        setMembers(rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, activeEntityId]);

  return { members, loading };
}
