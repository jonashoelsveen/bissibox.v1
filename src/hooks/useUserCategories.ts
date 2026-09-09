import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { notifyCategoryChanged, subscribeCategorySync } from "@/lib/categorySync";
import { defaultGanttWeekSpan } from "@/components/calendar/ganttWeeks";

export interface UserCategory {
  id: string;
  name: string;
  color: string;
  pinned: boolean;
  hidden: boolean;
  sort_order: number;
  is_default: boolean;
  default_key: string | null;
  app_group_id?: string | null;
  /** Parent project id for Macro phases (`gantt_phase`). */
  parent_id?: string | null;
  /** Inclusive week index (0-based in the Macro year grid) for Gantt spans. */
  gantt_start_week?: number | null;
  gantt_end_week?: number | null;
  /** Inclusive calendar dates for day-precision edge resize (ISO YYYY-MM-DD). */
  gantt_start_date?: string | null;
  gantt_end_date?: string | null;
}

const CATEGORY_SELECT =
  "id,name,color,pinned,hidden,sort_order,is_default,default_key,app_group_id,parent_id,gantt_start_week,gantt_end_week,gantt_start_date,gantt_end_date";

/** @deprecated Prefer defaultGanttWeekSpan(year) — kept for call sites without a year. */
export function defaultGanttSpan(now = new Date()): {
  gantt_start_week: number;
  gantt_end_week: number;
  gantt_start_date: string;
  gantt_end_date: string;
} {
  return defaultGanttWeekSpan(now.getFullYear(), now);
}

export type CategoryKind =
  | "calendar"
  | "diary_activity"
  | "diary_strava"
  | "gantt_project"
  | "gantt_phase";

type CategoryRow = UserCategory & {
  kind?: string;
  team_id?: string | null;
  app_team_id?: string | null;
  user_id?: string;
};

const PERSONAL_DEFAULTS = [
  { name: "Training", color: "#B8B8FF", sort_order: 0, default_key: "training" },
  { name: "School", color: "#ADD8E6", sort_order: 1, default_key: "school" },
  { name: "Work", color: "#C19A6B", sort_order: 2, default_key: "work" },
] as const;

function isPersonalRow(row: CategoryRow): boolean {
  return row.app_team_id == null && row.team_id == null;
}

function isTeamRow(row: CategoryRow, teamId: string): boolean {
  return row.app_team_id === teamId;
}

/** In-memory cache so remounts (e.g. session activity picker) don't flash an
 *  empty "…" state and resize the popover after categories already loaded. */
const categoryCache = new Map<string, { categories: UserCategory[]; loaded: boolean }>();

function categoryCacheKey(
  kind: CategoryKind,
  scopeKey: string,
  parentId: string | null = null,
): string {
  return parentId ? `${kind}:${scopeKey}:parent:${parentId}` : `${kind}:${scopeKey}`;
}

function readCategoryCache(
  kind: CategoryKind,
  scopeKey: string,
  parentId: string | null = null,
): { categories: UserCategory[]; loaded: boolean } | null {
  return categoryCache.get(categoryCacheKey(kind, scopeKey, parentId)) ?? null;
}

function writeCategoryCache(
  kind: CategoryKind,
  scopeKey: string,
  categories: UserCategory[],
  loaded: boolean,
  parentId: string | null = null,
): void {
  categoryCache.set(categoryCacheKey(kind, scopeKey, parentId), { categories, loaded });
}

async function ensurePersonalDefaults(userId: string, kind: CategoryKind): Promise<UserCategory[]> {
  if (kind !== "calendar") return [];

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
        pinned: false,
        app_team_id: null,
        team_id: null,
      })
      .select(CATEGORY_SELECT)
      .single();

    if (!error && data) inserted.push(data as UserCategory);
  }

  return inserted;
}

async function fetchMaxSortOrder(
  ownerId: string,
  teamId: string | null,
  groupId: string | null,
  kind: CategoryKind = "calendar",
  parentId: string | null = null,
): Promise<number> {
  let query = supabase
    .from("calendar_categories")
    .select("sort_order")
    .eq("kind", kind)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (parentId) query = query.eq("parent_id", parentId);
  else query = query.is("parent_id", null);

  if (teamId) {
    query = query.eq("app_team_id", teamId);
    query = groupId ? query.eq("app_group_id", groupId) : query.is("app_group_id", null);
  } else {
    query = query.eq("user_id", ownerId).is("app_team_id", null).is("team_id", null);
  }

  const { data } = await query.maybeSingle();
  return data?.sort_order ?? -1;
}

/**
 * Manage calendar categories for either the current user (personal) or a
 * given app team (entity scope). Uses `app_team_id` + `entity_id` on sessions
 * — same schema as the mobile app.
 */
export function useUserCategories(opts?: {
  teamId?: string | null;
  ownerId?: string | null;
  kind?: CategoryKind;
  /** When set (Macro phases), only rows with this parent project id. */
  parentId?: string | null;
  /**
   * Load every `gantt_phase` row in scope (all parents). Used to derive
   * project-level Gantt bars from phase spans in list mode.
   */
  allParents?: boolean;
}) {
  const teamId = opts?.teamId ?? null;
  const ownerId = opts?.ownerId ?? null;
  const kind: CategoryKind = opts?.kind ?? "calendar";
  const allParents = opts?.allParents === true;
  const parentId = allParents ? null : (opts?.parentId ?? null);
  const { user } = useAuth();
  const scopeUserId = ownerId ?? user?.id ?? null;
  const scopeKey = teamId ? `team:${teamId}` : `user:${scopeUserId ?? ""}`;
  const cacheParentKey = allParents ? "__all__" : parentId;
  const cached = readCategoryCache(kind, scopeKey, cacheParentKey);
  const [categories, setCategories] = useState<UserCategory[]>(
    () => cached?.categories ?? [],
  );
  const [loaded, setLoaded] = useState(() => cached?.loaded ?? false);

  const sortRows = useCallback(
    (rows: UserCategory[]) =>
      [...rows].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.sort_order - b.sort_order;
      }),
    [],
  );

  const commitCategories = useCallback(
    (rows: UserCategory[], nextLoaded = true) => {
      setCategories(rows);
      setLoaded(nextLoaded);
      writeCategoryCache(kind, scopeKey, rows, nextLoaded, cacheParentKey);
    },
    [kind, scopeKey, cacheParentKey],
  );

  const broadcastCategories = useCallback(
    (rows: UserCategory[]) => {
      writeCategoryCache(kind, scopeKey, rows, true, cacheParentKey);
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("calendar-categories-reorder", {
          detail: {
            scopeKey,
            kind,
            parentId: cacheParentKey,
            categories: rows,
          },
        }),
      );
    },
    [scopeKey, kind, cacheParentKey],
  );

  const load = useCallback(async () => {
    if (!user || (!teamId && !scopeUserId)) {
      commitCategories([], true);
      return;
    }
    if (kind === "gantt_phase" && !parentId && !allParents) {
      commitCategories([], true);
      return;
    }

    let q = supabase
      .from("calendar_categories")
      .select(CATEGORY_SELECT)
      .eq("kind", kind);

    if (allParents) {
      // Every phase in scope — do not filter parent_id.
    } else if (parentId) {
      q = q.eq("parent_id", parentId);
    } else {
      q = q.is("parent_id", null);
    }

    if (teamId) q = q.eq("app_team_id", teamId);
    else q = q.eq("user_id", scopeUserId!).is("app_team_id", null).is("team_id", null);

    const { data, error } = await q
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[useUserCategories] load", error.message);
      commitCategories([], true);
      return;
    }

    let rows = (data ?? []) as UserCategory[];

    if (!teamId && kind === "calendar" && rows.length === 0 && scopeUserId) {
      const seeded = await ensurePersonalDefaults(scopeUserId, kind);
      if (seeded.length > 0) {
        rows = [...seeded].sort((a, b) => a.sort_order - b.sort_order);
      } else {
        const { data: retry } = await supabase
          .from("calendar_categories")
          .select(CATEGORY_SELECT)
          .eq("user_id", scopeUserId)
          .is("app_team_id", null)
          .is("team_id", null)
          .eq("kind", kind)
          .is("parent_id", null)
          .order("sort_order", { ascending: true });
        rows = (retry ?? []) as UserCategory[];
      }
    }

    commitCategories(sortRows(rows), true);
  }, [user, teamId, kind, parentId, allParents, scopeUserId, sortRows, commitCategories]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const next = readCategoryCache(kind, scopeKey, cacheParentKey);
    if (next?.loaded) {
      setCategories(next.categories);
      setLoaded(true);
    } else {
      setLoaded(false);
      setCategories([]);
    }
  }, [teamId, scopeUserId, kind, scopeKey, cacheParentKey]);

  useEffect(() => {
    void load();
    if (!user || (!teamId && !scopeUserId)) return;

    const filter = teamId ? `app_team_id=eq.${teamId}` : `user_id=eq.${scopeUserId}`;

    const matchesScope = (row: CategoryRow) => {
      if (row.kind && row.kind !== kind) return false;
      const rowParent = row.parent_id ?? null;
      if (allParents) {
        if (!rowParent) return false;
      } else if ((parentId ?? null) !== rowParent) {
        return false;
      }
      if (teamId) return isTeamRow(row, teamId);
      return isPersonalRow(row) && row.user_id === scopeUserId;
    };

    const ch = supabase
      .channel(
        `calendar-categories-${kind}-${cacheParentKey ?? "root"}-${teamId ?? scopeUserId}-${Math.random().toString(36).slice(2)}`,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_categories", filter },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as CategoryRow;
            const oldId = old?.id;
            if (oldId && matchesScope(old)) {
              setCategories((prev) => {
                const next = prev.filter((c) => c.id !== oldId);
                writeCategoryCache(kind, scopeKey, next, true, cacheParentKey);
                return next;
              });
            }
            void load();
            return;
          }
          const next = payload.new as CategoryRow;
          if (!next || !matchesScope(next)) return;
          const row: UserCategory = {
            id: next.id,
            name: next.name,
            color: next.color,
            pinned: next.pinned ?? false,
            hidden: next.hidden ?? false,
            sort_order: next.sort_order ?? 0,
            is_default: next.is_default ?? false,
            default_key: next.default_key ?? null,
            app_group_id: next.app_group_id ?? null,
            parent_id: next.parent_id ?? null,
            gantt_start_week: next.gantt_start_week ?? null,
            gantt_end_week: next.gantt_end_week ?? null,
            gantt_start_date: next.gantt_start_date ?? null,
            gantt_end_date: next.gantt_end_date ?? null,
          };
          setCategories((prev) => {
            const idx = prev.findIndex((c) => c.id === row.id);
            const merged = idx >= 0 ? prev.map((c) => (c.id === row.id ? row : c)) : [...prev, row];
            const sorted = sortRows(merged);
            writeCategoryCache(kind, scopeKey, sorted, true, cacheParentKey);
            return sorted;
          });
        },
      )
      .subscribe();

    const onReorder = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        scopeKey: string;
        kind: string;
        parentId?: string | null;
        categories: UserCategory[];
      } | undefined;
      if (!detail || detail.scopeKey !== scopeKey || detail.kind !== kind) return;
      if ((detail.parentId ?? null) !== (cacheParentKey ?? null)) return;
      setCategories(detail.categories);
      setLoaded(true);
      writeCategoryCache(kind, scopeKey, detail.categories, true, cacheParentKey);
    };

    window.addEventListener("calendar-categories-reorder", onReorder);

    const syncUserId = scopeUserId ?? user.id;
    const unsubBroadcast = subscribeCategorySync(supabase, syncUserId, teamId, () => {
      void load();
    });

    return () => {
      unsubBroadcast();
      void supabase.removeChannel(ch);
      window.removeEventListener("calendar-categories-reorder", onReorder);
    };
  }, [load, user, teamId, kind, parentId, allParents, cacheParentKey, scopeUserId, scopeKey, sortRows]);

  const create = useCallback(
    async (
      name: string,
      color: string,
      groupId: string | null = null,
      span?: {
        gantt_start_week: number;
        gantt_end_week: number;
        gantt_start_date?: string;
        gantt_end_date?: string;
      } | null,
      createParentId?: string | null,
    ): Promise<UserCategory | null> => {
      if (!user || !scopeUserId) return null;

      const resolvedParent =
        kind === "gantt_phase" ? (createParentId ?? parentId) : null;
      if (kind === "gantt_phase" && !resolvedParent) {
        console.error("[useUserCategories] create gantt_phase requires parentId");
        return null;
      }

      const ownerId = teamId ? scopeUserId : user.id;
      const maxOrder = await fetchMaxSortOrder(
        ownerId,
        teamId,
        groupId,
        kind,
        resolvedParent,
      );
      const ganttSpan =
        kind === "gantt_phase"
          ? (span ?? defaultGanttSpan())
          : kind === "gantt_project"
            ? (span ?? null)
            : null;

      const insertRow = {
        user_id: ownerId,
        name,
        color,
        kind: kind as string,
        sort_order: maxOrder + 1,
        hidden: false,
        pinned: false,
        app_team_id: teamId,
        app_group_id: teamId ? groupId : null,
        team_id: null as string | null,
        parent_id: resolvedParent,
        gantt_start_week: ganttSpan?.gantt_start_week ?? null,
        gantt_end_week: ganttSpan?.gantt_end_week ?? null,
        gantt_start_date: ganttSpan?.gantt_start_date ?? null,
        gantt_end_date: ganttSpan?.gantt_end_date ?? null,
      };

      const { data, error } = await supabase
        .from("calendar_categories")
        .insert(insertRow)
        .select(CATEGORY_SELECT)
        .single();

      if (error || !data) {
        console.error("[useUserCategories] create", error?.message ?? "unknown");
        return null;
      }

      const created = data as UserCategory;
      const next = sortRows(
        categories.some((c) => c.id === created.id) ? categories : [...categories, created],
      );
      setCategories(next);
      broadcastCategories(next);
      void notifyCategoryChanged(supabase, scopeUserId, teamId);
      return created;
    },
    [user, teamId, kind, parentId, categories, sortRows, broadcastCategories, scopeUserId],
  );

  const update = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          UserCategory,
          | "name"
          | "color"
          | "pinned"
          | "hidden"
          | "gantt_start_week"
          | "gantt_end_week"
          | "gantt_start_date"
          | "gantt_end_date"
          | "app_group_id"
        >
      >,
    ) => {
      const prev = categories.find((c) => c.id === id) ?? null;
      const next = sortRows(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      setCategories(next);
      broadcastCategories(next);
      await supabase.from("calendar_categories").update(patch).eq("id", id);
      void notifyCategoryChanged(supabase, scopeUserId ?? user!.id, teamId);

      if (typeof patch.color === "string" && patch.color) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("calendar-category-color-changed", {
              detail: {
                categoryId: id,
                color: patch.color,
                categoryName: (patch.name ?? prev?.name ?? "").toLowerCase(),
                kind,
                teamId: teamId ?? null,
                scopeUserId: scopeUserId ?? null,
              },
            }),
          );
        }

        const { error } = await supabase
          .from("calendar_sessions")
          .update({ color: patch.color, category_id: id })
          .eq("category_id", id);
        if (error) console.error("[calendar_categories cascade color]", error);

        if (kind === "diary_activity" && prev) {
          const matchName = (patch.name ?? prev.name).toLowerCase();
          const scopeFilter = supabase
            .from("calendar_sessions")
            .update({ color: patch.color, category_id: id })
            .is("category_id", null)
            .or(
              `and(diary_group.eq.endurance,diary_sub.ilike.${matchName}),` +
                `and(diary_sub.is.null,diary_group.ilike.${matchName}),` +
                `and(diary_sub.eq.,diary_group.ilike.${matchName})`,
            );
          const scoped = teamId
            ? scopeFilter.eq("entity_id", teamId)
            : scopeUserId
              ? scopeFilter.eq("user_id", scopeUserId).is("entity_id", null)
              : scopeFilter;
          const { error: backfillError } = await scoped;
          if (backfillError)
            console.error("[calendar_categories diary backfill]", backfillError);
        }
      }
    },
    [categories, sortRows, broadcastCategories, kind, teamId, scopeUserId, user],
  );

  const remove = useCallback(
    async (id: string) => {
      const next = categories.filter((c) => c.id !== id);
      setCategories(next);
      broadcastCategories(next);
      await supabase.from("calendar_categories").delete().eq("id", id);
      void notifyCategoryChanged(supabase, scopeUserId ?? user!.id, teamId);
    },
    [categories, broadcastCategories, scopeUserId, teamId, user],
  );

  const reorder = useCallback(
    async (next: UserCategory[]) => {
      const normalized = next.map((c, idx) => ({ ...c, sort_order: idx }));
      setCategories(normalized);
      broadcastCategories(normalized);
      await Promise.all(
        normalized.map((c) =>
          supabase.from("calendar_categories").update({ sort_order: c.sort_order }).eq("id", c.id),
        ),
      );
      void notifyCategoryChanged(supabase, scopeUserId ?? user!.id, teamId);
    },
    [broadcastCategories, scopeUserId, teamId, user],
  );

  return { categories, loaded, create, update, remove, reorder, refetch: load };
}
