/**
 * useUserGroups — Supabase-backed list of "groups" owned by the signed-in
 * user. A group is a row in `public.teams` with entity_type='team' and
 * owner_id = current user. Selecting a group as the active profile flips
 * the system into team mode (see useAuth().setActiveEntity).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface UserGroup {
  id: string;
  name: string;
}

export function useUserGroups(): {
  groups: UserGroup[];
  loading: boolean;
  refresh: () => Promise<void>;
  createGroup: (name: string) => Promise<UserGroup | null>;
} {
  const { user } = useAuth();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setGroups([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("teams")
      .select("id,name")
      .eq("owner_id", user.id)
      .eq("entity_type", "team")
      .order("created_at", { ascending: true });
    setGroups((data ?? []).map((r) => ({ id: r.id as string, name: r.name as string })));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createGroup = useCallback(
    async (name: string): Promise<UserGroup | null> => {
      if (!user) return null;
      const trimmed = name.trim();
      if (!trimmed) return null;
      const { data, error } = await supabase
        .from("teams")
        .insert({ name: trimmed, owner_id: user.id, entity_type: "team" })
        .select("id,name")
        .single();
      if (error || !data) return null;
      const next: UserGroup = { id: data.id as string, name: data.name as string };
      setGroups((prev) => [...prev, next]);
      return next;
    },
    [user],
  );

  return { groups, loading, refresh, createGroup };
}
