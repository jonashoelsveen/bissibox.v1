import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface UserCategory {
  id: string;
  name: string;
  color: string;
  pinned: boolean;
  hidden: boolean;
  sort_order: number;
  is_default: boolean;
  default_key: string | null;
}

export type CategoryKind = "calendar" | "diary_activity" | "diary_strava";

/**
 * Manage calendar categories for either the current user (personal) or a
 * given team (entity scope). When `teamId` is provided, queries/inserts are
 * scoped to that team; otherwise they are scoped to the user's personal
 * (team_id IS NULL) categories.
 *
 * `kind` switches between calendar categories (default) and diary-specific
 * lists (diary_activity, diary_strava) stored in the same table.
 */
export function useUserCategories(opts?: { teamId?: string | null; kind?: CategoryKind }) {
  const teamId = opts?.teamId ?? null;
  const kind: CategoryKind = opts?.kind ?? "calendar";
  const { user } = useAuth();
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoaded(true);
      return;
    }
    let q = supabase
      .from("calendar_categories")
      .select("id,name,color,pinned,hidden,sort_order,is_default,default_key")
      .eq("kind", kind);
    if (teamId) q = q.eq("team_id", teamId);
    else q = q.is("team_id", null).eq("user_id", user.id);
    const { data } = await q
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });
    setCategories((data ?? []) as UserCategory[]);
    setLoaded(true);
  }, [user, teamId, kind]);

  useEffect(() => {
    void load();
    if (!user) return;
    const filter = teamId ? `team_id=eq.${teamId}` : `user_id=eq.${user.id}`;
    const matchesScope = (row: Partial<UserCategory> & { team_id?: string | null; user_id?: string; kind?: string }) => {
      if (row.kind && row.kind !== kind) return false;
      if (teamId) return row.team_id === teamId;
      return row.team_id == null && row.user_id === user.id;
    };
    const sortRows = (rows: UserCategory[]) =>
      [...rows].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.sort_order - b.sort_order;
      });
    const ch = supabase
      .channel(`calendar-categories-${kind}-${teamId ?? user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_categories", filter },
        (payload) => {
          // Apply payload directly instead of refetching — refetching after
          // our own INSERT/UPDATE can race read-after-write replication and
          // drop the just-written row from local state, making newly-created
          // tabs visually disappear.
          setCategories((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string })?.id;
              return oldId ? prev.filter((c) => c.id !== oldId) : prev;
            }
            const next = payload.new as UserCategory & { team_id?: string | null; user_id?: string; kind?: string };
            if (!next || !matchesScope(next)) return prev;
            const row: UserCategory = {
              id: next.id,
              name: next.name,
              color: next.color,
              pinned: next.pinned,
              hidden: next.hidden,
              sort_order: next.sort_order,
              is_default: next.is_default,
              default_key: next.default_key,
            };
            const idx = prev.findIndex((c) => c.id === row.id);
            const merged = idx >= 0
              ? prev.map((c) => (c.id === row.id ? row : c))
              : [...prev, row];
            return sortRows(merged);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, user, teamId, kind]);


  const create = useCallback(
    async (name: string, color: string): Promise<UserCategory | null> => {
      if (!user) return null;
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1);
      const { data, error } = await supabase
        .from("calendar_categories")
        .insert({
          user_id: user.id,
          team_id: teamId,
          name,
          color,
          kind,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();
      if (error || !data) return null;
      const created = data as UserCategory;
      setCategories((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
      return created;
    },
    [user, teamId, kind, categories],
  );


  const update = useCallback(
    async (id: string, patch: Partial<Pick<UserCategory, "name" | "color" | "pinned" | "hidden">>) => {
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      await supabase.from("calendar_categories").update(patch).eq("id", id);
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("calendar_categories").delete().eq("id", id);
  }, []);

  const reorder = useCallback(async (next: UserCategory[]) => {
    setCategories(next);
    await Promise.all(
      next.map((c, idx) =>
        supabase.from("calendar_categories").update({ sort_order: idx }).eq("id", c.id),
      ),
    );
  }, []);

  return { categories, loaded, create, update, remove, reorder, refetch: load };
}
