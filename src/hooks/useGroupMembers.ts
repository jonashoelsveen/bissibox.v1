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

      // Source of truth: `user_coaches`. A "client" of mine is any user who
      // has accepted me as their coach. This mirrors the Clients table in
      // Settings exactly — no team-group-leader fallback, no email match.
      const { data: coachRows } = await supabase
        .from("user_coaches")
        .select("owner_id")
        .eq("coach_user_id", user.id)
        .eq("status", "accepted");

      const ids = Array.from(
        new Set((coachRows ?? []).map((r) => r.owner_id as string)),
      );

      let rows: GroupMemberRow[] = [];
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

      if (!cancelled) {
        setMembers(rows);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return { members, loading };
}
