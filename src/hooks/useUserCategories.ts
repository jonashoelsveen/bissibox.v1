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
export function useUserCategories(opts?: { teamId?: string | null; ownerId?: string | null; kind?: CategoryKind }) {
  const teamId = opts?.teamId ?? null;
  const ownerId = opts?.ownerId ?? null;
  const kind: CategoryKind = opts?.kind ?? "calendar";
  const { user } = useAuth();
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const scopeUserId = ownerId ?? user?.id ?? null;

  const load = useCallback(async () => {
    if (!user || (!teamId && !scopeUserId)) {
      setCategories([]);
      setLoaded(true);
      return;
    }
    let q = supabase
      .from("calendar_categories")
      .select("id,name,color,pinned,hidden,sort_order,is_default,default_key")
      .eq("kind", kind);
    if (teamId) q = q.eq("team_id", teamId);
    else q = q.is("team_id", null).eq("user_id", scopeUserId!);
    const { data } = await q
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });
    setCategories((data ?? []) as UserCategory[]);
    setLoaded(true);
  }, [user, teamId, kind, scopeUserId]);

  // Reset `loaded`/`categories` synchronously when the scope changes so
  // consumers don't briefly see stale rows from a previous owner/team while
  // the new fetch is in flight. Critical for coach-viewing-client paths where
  // a freshly-marked tile reads `categories[0].color` and would otherwise
  // flash the previous scope's top color before the new list arrives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLoaded(false);
    setCategories([]);
  }, [teamId, scopeUserId, kind]);

  useEffect(() => {
    void load();
    if (!user || (!teamId && !scopeUserId)) return;
    const filter = teamId ? `team_id=eq.${teamId}` : `user_id=eq.${scopeUserId}`;
    const matchesScope = (row: Partial<UserCategory> & { team_id?: string | null; user_id?: string; kind?: string }) => {
      if (row.kind && row.kind !== kind) return false;
      if (teamId) return row.team_id === teamId;
      return row.team_id == null && row.user_id === scopeUserId;
    };
    const sortRows = (rows: UserCategory[]) =>
      [...rows].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.sort_order - b.sort_order;
      });
    const ch = supabase
      .channel(`calendar-categories-${kind}-${teamId ?? scopeUserId}-${Math.random().toString(36).slice(2)}`)
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
    const scopeKey = teamId ? `team:${teamId}` : `user:${scopeUserId}`;
    const onReorder = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        scopeKey: string;
        kind: string;
        categories: UserCategory[];
      } | undefined;
      if (!detail || detail.scopeKey !== scopeKey || detail.kind !== kind) return;
      setCategories(detail.categories);
    };
    window.addEventListener("calendar-categories-reorder", onReorder);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener("calendar-categories-reorder", onReorder);
    };
  }, [load, user, teamId, kind, scopeUserId]);


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
      // When the category color changes, cascade the new color to every
      // session currently tagged with this category so the calendar stays
      // visually consistent — same activity type, same color — without
      // requiring users to recolor each session manually. Scope writes to
      // the category's owning user (or team) so RLS only allows the owner /
      // admin (the only roles that can edit categories in the UI) to apply
      // the update. The realtime subscription on calendar_sessions then
      // propagates the new color to every viewer (including coaches).
      if (typeof patch.color === "string" && patch.color) {
        // Cascade by category_id only. RLS already restricts writes to
        // sessions the caller owns (personal) or co-owns (team), so we
        // don't need to re-narrow by user_id / entity_id here — that
        // extra filter was silently dropping legitimate sessions for
        // some users (e.g. sessions whose entity_id was non-null on a
        // personal category, or scope snapshots that didn't match).
        const { error } = await supabase
          .from("calendar_sessions")
          .update({ color: patch.color })
          .eq("category_id", id);
        if (error) console.error("[calendar_categories cascade color]", error);
      }
    },
    [teamId, scopeUserId],
  );

  const remove = useCallback(async (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("calendar_categories").delete().eq("id", id);
  }, []);

  const reorder = useCallback(async (next: UserCategory[]) => {
    const normalized = next.map((c, idx) => ({ ...c, sort_order: idx }));
    setCategories(normalized);
    // Broadcast to other hook instances in the same scope so dropdown
    // defaults (e.g. calendar grid "top category") update immediately,
    // without waiting for per-row realtime payloads to arrive.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("calendar-categories-reorder", {
          detail: {
            scopeKey: teamId ? `team:${teamId}` : `user:${user?.id ?? ""}`,
            kind,
            categories: normalized,
          },
        }),
      );
    }
    await Promise.all(
      normalized.map((c) =>
        supabase.from("calendar_categories").update({ sort_order: c.sort_order }).eq("id", c.id),
      ),
    );
  }, [teamId, kind, user]);

  return { categories, loaded, create, update, remove, reorder, refetch: load };
}
