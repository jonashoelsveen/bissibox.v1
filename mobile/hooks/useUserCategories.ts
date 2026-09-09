import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { notifyCategoryChanged, subscribeCategorySync } from "@/lib/categorySync";

export interface UserCategory {
  id: string;
  name: string;
  color: string;
  hidden: boolean;
  sort_order: number;
  app_group_id?: string | null;
}

type CategoryRow = UserCategory & {
  kind?: string;
  team_id?: string | null;
  app_team_id?: string | null;
};

const PERSONAL_DEFAULTS = [
  { name: "Training", color: "#B8B8FF", sort_order: 0, default_key: "training" },
  { name: "School", color: "#ADD8E6", sort_order: 1, default_key: "school" },
  { name: "Work", color: "#C19A6B", sort_order: 2, default_key: "work" },
] as const;

function toCategory(row: CategoryRow): UserCategory {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    hidden: row.hidden ?? false,
    sort_order: row.sort_order ?? 0,
    app_group_id: row.app_group_id ?? null,
  };
}

function mergeCategory(prev: UserCategory[], row: CategoryRow): UserCategory[] {
  if (!row || (row.kind != null && row.kind !== "calendar")) return prev;
  const cat = toCategory(row);
  const idx = prev.findIndex((c) => c.id === cat.id);
  const next = idx >= 0 ? prev.map((c) => (c.id === cat.id ? cat : c)) : [...prev, cat];
  return [...next].sort((a, b) => a.sort_order - b.sort_order);
}

function isIndividualRow(row: CategoryRow): boolean {
  return row.app_team_id == null && row.team_id == null;
}

function isTeamRow(row: CategoryRow, teamId: string): boolean {
  return row.app_team_id === teamId;
}

async function ensurePersonalDefaults(userId: string): Promise<UserCategory[]> {
  const inserted: UserCategory[] = [];

  for (const d of PERSONAL_DEFAULTS) {
    const { data: existing } = await supabase
      .from("calendar_categories")
      .select("id")
      .eq("user_id", userId)
      .is("app_team_id", null)
      .is("team_id", null)
      .eq("kind", "calendar")
      .eq("default_key", d.default_key)
      .maybeSingle();

    if (existing) continue;

    const { data, error } = await supabase
      .from("calendar_categories")
      .insert({
        user_id: userId,
        name: d.name,
        color: d.color,
        kind: "calendar",
        sort_order: d.sort_order,
        is_default: true,
        default_key: d.default_key,
        hidden: false,
        app_team_id: null,
        team_id: null,
      })
      .select("id,name,color,hidden,sort_order,app_group_id")
      .single();

    if (!error && data) inserted.push(toCategory(data as CategoryRow));
  }

  return inserted;
}

async function fetchMaxSortOrder(
  ownerId: string,
  teamId: string | null,
  groupId: string | null,
): Promise<number> {
  let query = supabase
    .from("calendar_categories")
    .select("sort_order")
    .eq("kind", "calendar")
    .order("sort_order", { ascending: false })
    .limit(1);

  if (teamId) {
    query = query.eq("app_team_id", teamId);
    query = groupId ? query.eq("app_group_id", groupId) : query.is("app_group_id", null);
  } else {
    query = query.eq("user_id", ownerId).is("app_team_id", null).is("team_id", null);
  }

  const { data } = await query.maybeSingle();
  return data?.sort_order ?? -1;
}

export function useUserCategories(
  userId: string | null,
  teamId: string | null = null,
  teamOwnerId: string | null = null,
) {
  const [individualCategories, setIndividualCategories] = useState<UserCategory[]>([]);
  const [teamCategories, setTeamCategories] = useState<UserCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const individualLoadGen = useRef(0);
  const teamLoadGen = useRef(0);

  const loadIndividual = useCallback(async () => {
    if (!userId) {
      setIndividualCategories([]);
      return;
    }

    const gen = individualLoadGen.current;

    const { data, error } = await supabase
      .from("calendar_categories")
      .select("id,name,color,hidden,sort_order,app_group_id")
      .eq("user_id", userId)
      .is("app_team_id", null)
      .is("team_id", null)
      .eq("kind", "calendar")
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });

    if (gen !== individualLoadGen.current) return;

    if (error) {
      console.error("[useUserCategories] loadIndividual", error.message);
      setLoadError(error.message);
      return;
    }

    setLoadError(null);
    let rows = (data ?? []).map((row) => toCategory(row as CategoryRow));

    if (rows.length === 0) {
      const seeded = await ensurePersonalDefaults(userId);
      if (gen !== individualLoadGen.current) return;

      if (seeded.length > 0) {
        rows = [...seeded].sort((a, b) => a.sort_order - b.sort_order);
      } else {
        const { data: retry, error: retryErr } = await supabase
          .from("calendar_categories")
          .select("id,name,color,hidden,sort_order,app_group_id")
          .eq("user_id", userId)
          .is("app_team_id", null)
          .is("team_id", null)
          .eq("kind", "calendar")
          .order("sort_order", { ascending: true });

        if (gen !== individualLoadGen.current) return;

        if (!retryErr) {
          rows = (retry ?? []).map((row) => toCategory(row as CategoryRow));
        }
      }
    }

    if (gen !== individualLoadGen.current) return;

    setIndividualCategories(rows);
  }, [userId]);

  const loadTeam = useCallback(async () => {
    if (!teamId) {
      setTeamCategories([]);
      return;
    }

    const gen = teamLoadGen.current;

    const { data, error } = await supabase
      .from("calendar_categories")
      .select("id,name,color,hidden,sort_order,app_group_id")
      .eq("app_team_id", teamId)
      .eq("kind", "calendar")
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });

    if (gen !== teamLoadGen.current) return;

    if (error) {
      console.error("[useUserCategories] loadTeam", error.message);
      setLoadError(error.message);
      return;
    }

    setLoadError(null);
    const rows = (data ?? []).map((row) => toCategory(row as CategoryRow));
    setTeamCategories(rows);
  }, [teamId]);

  useEffect(() => {
    void loadIndividual();
  }, [loadIndividual]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    if (!userId) return;

    const unsub = subscribeCategorySync(supabase, userId, null, () => {
      void loadIndividual();
    });

    const ch = supabase
      .channel(`mob-cats-ind-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_categories", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as CategoryRow;
            const id = old?.id;
            if (id) {
              setIndividualCategories((prev) =>
                isIndividualRow(old) ? prev.filter((c) => c.id !== id) : prev,
              );
            }
            void loadIndividual();
            return;
          }
          const row = payload.new as CategoryRow;
          if (!isIndividualRow(row)) return;
          setIndividualCategories((prev) => mergeCategory(prev, row));
        },
      )
      .subscribe();

    return () => {
      unsub();
      void supabase.removeChannel(ch);
    };
  }, [userId, loadIndividual]);

  useEffect(() => {
    if (!teamId) return;

    const syncUserId = teamOwnerId ?? userId;
    if (!syncUserId) return;

    const unsub = subscribeCategorySync(supabase, syncUserId, teamId, () => {
      void loadTeam();
    });

    const ch = supabase
      .channel(`mob-cats-team-${teamId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_categories", filter: `app_team_id=eq.${teamId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as CategoryRow;
            const id = old?.id;
            if (id) {
              setTeamCategories((prev) =>
                isTeamRow(old, teamId) ? prev.filter((c) => c.id !== id) : prev,
              );
            }
            void loadTeam();
            return;
          }
          const row = payload.new as CategoryRow;
          if (!isTeamRow(row, teamId)) return;
          setTeamCategories((prev) => mergeCategory(prev, row));
        },
      )
      .subscribe();

    return () => {
      unsub();
      void supabase.removeChannel(ch);
    };
  }, [teamId, teamOwnerId, userId, loadTeam]);

  const categories = useMemo(
    () => (teamId ? teamCategories : individualCategories),
    [teamId, teamCategories, individualCategories],
  );

  const setCategories = useCallback(
    (updater: (prev: UserCategory[]) => UserCategory[]) => {
      if (teamId) setTeamCategories(updater);
      else setIndividualCategories(updater);
    },
    [teamId],
  );

  const create = useCallback(
    async (name: string, color: string, groupId: string | null = null): Promise<UserCategory | null> => {
      if (!userId) return null;

      if (teamId) teamLoadGen.current += 1;
      else individualLoadGen.current += 1;

      const ownerId = teamId ? (teamOwnerId ?? userId) : userId;
      const maxOrder = await fetchMaxSortOrder(ownerId, teamId, groupId);

      const insertRow = {
        user_id: ownerId,
        name,
        color,
        kind: "calendar" as const,
        sort_order: maxOrder + 1,
        hidden: false,
        app_team_id: teamId ?? null,
        app_group_id: teamId ? groupId : null,
        team_id: null,
      };

      const { data, error } = await supabase
        .from("calendar_categories")
        .insert(insertRow)
        .select("id,name,color,hidden,sort_order,app_group_id")
        .single();

      if (error || !data) {
        console.error("[useUserCategories] create", error?.message ?? "unknown");
        return null;
      }

      const created = toCategory(data as CategoryRow);
      setCategories((prev) => {
        if (prev.some((c) => c.id === created.id)) return prev;
        return [...prev, created].sort((a, b) => a.sort_order - b.sort_order);
      });
      void notifyCategoryChanged(supabase, ownerId, teamId);
      return created;
    },
    [userId, teamId, teamOwnerId, setCategories],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Pick<UserCategory, "name" | "color" | "hidden">>) => {
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      const { error } = await supabase.from("calendar_categories").update(patch).eq("id", id);
      if (error) console.error("[useUserCategories] update", error.message);
      else void notifyCategoryChanged(supabase, teamId ? (teamOwnerId ?? userId!) : userId!, teamId);
      if (typeof patch.color === "string" && patch.color) {
        await supabase
          .from("calendar_sessions")
          .update({ color: patch.color })
          .eq("category_id", id);
      }
    },
    [setCategories, teamId, teamOwnerId, userId],
  );

  const remove = useCallback(
    async (id: string) => {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      const { error } = await supabase.from("calendar_categories").delete().eq("id", id);
      if (error) console.error("[useUserCategories] remove", error.message);
      else void notifyCategoryChanged(supabase, teamId ? (teamOwnerId ?? userId!) : userId!, teamId);
    },
    [setCategories, teamId, teamOwnerId, userId],
  );

  return { categories, create, update, remove, loadError, reload: teamId ? loadTeam : loadIndividual };
}
