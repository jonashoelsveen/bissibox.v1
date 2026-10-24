/**
 * useUserGroups — app teams owned by the signed-in user (`app_teams` table).
 * Same entity model as the mobile app; selecting a group sets activeEntityId
 * for team-scoped calendar sessions and categories.
 *
 * Groups are stored in a module-level snapshot so the profile menu and
 * account profile editor stay in sync while typing.
 *
 * Mutations go through cookie-authenticated `/api/account/entities` so they
 * work on account.bissibox.com (HTTP-only session cookie), with a client RLS
 * fallback for the cloud app.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getAccountAccessToken } from "@/lib/account-profile-client";
import { clipProfileName, persistOptionalText, persistProfileName, ENTITY_PROFILE_NAME_MAX } from "@/lib/profileName";

export interface UserGroup {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  entityCode: string;
  /** Local plus-click row that has not finished inserting. */
  creating?: boolean;
}

export type UserGroupPatch = {
  name?: string;
  description?: string | null;
  website?: string | null;
};

const GROUP_SELECT = "id,name,description,website,entity_code";

let groupsSnapshot: UserGroup[] = [];
let refreshGeneration = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setGroupsSnapshot(next: UserGroup[]) {
  groupsSnapshot = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getGroupsSnapshot() {
  return groupsSnapshot;
}

function mapRow(r: {
  id: string;
  name: string;
  description?: string | null;
  website?: string | null;
  entity_code?: string | null;
}): UserGroup {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    website: r.website ?? null,
    entityCode: r.entity_code ?? "",
  };
}

function patchSnapshot(id: string, patch: UserGroupPatch) {
  setGroupsSnapshot(
    groupsSnapshot.map((g) => (g.id === id ? { ...g, ...patch } : g)),
  );
}

async function accountAuthHeaders() {
  const token = await getAccountAccessToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T & { error?: string } }> {
  const headers = await accountAuthHeaders();
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { ok: res.ok, status: res.status, body };
}

export function useUserGroups(): {
  groups: UserGroup[];
  loading: boolean;
  refresh: () => Promise<void>;
  createGroup: (name: string, onDraft?: (group: UserGroup) => void) => Promise<UserGroup | null>;
  patchGroup: (id: string, patch: UserGroupPatch) => void;
  persistGroup: (id: string) => Promise<boolean>;
  updateGroup: (id: string, patch: UserGroupPatch) => Promise<boolean>;
  deleteGroup: (id: string) => Promise<boolean>;
} {
  const { user, activeEntityId, setActiveEntity } = useAuth();
  const userId = user?.id ?? null;
  const groups = useSyncExternalStore(subscribe, getGroupsSnapshot, getGroupsSnapshot);
  const [loading, setLoading] = useState(false);
  const activeEntityIdRef = useRef(activeEntityId);
  activeEntityIdRef.current = activeEntityId;
  const setActiveEntityRef = useRef(setActiveEntity);
  setActiveEntityRef.current = setActiveEntity;

  const refresh = useCallback(async () => {
    if (!userId) {
      return;
    }
    const gen = ++refreshGeneration;
    setLoading(true);
    try {
      const api = await apiJson<{ groups?: Array<Parameters<typeof mapRow>[0]> }>(
        "/api/account/entities",
      );
      let fetched: UserGroup[] | null = null;
      if (api.ok && Array.isArray(api.body.groups)) {
        fetched = api.body.groups.map((r) => mapRow(r));
      } else {
        const { data, error } = await supabase
          .from("app_teams")
          .select(GROUP_SELECT)
          .eq("owner_id", userId)
          .order("created_at", { ascending: true });
        if (error) return;
        const owned = (data ?? []).map((r) => mapRow(r));
        const ownedIds = new Set(owned.map((row) => row.id));
        const { data: adminLinks } = await supabase
          .from("app_team_admins")
          .select("team_id")
          .eq("user_id", userId)
          .eq("status", "active");
        const extraIds = [
          ...new Set(
            (adminLinks ?? [])
              .map((row) => row.team_id)
              .filter((id): id is string => typeof id === "string" && !ownedIds.has(id)),
          ),
        ];
        let extra: UserGroup[] = [];
        if (extraIds.length > 0) {
          const { data: extraRows } = await supabase
            .from("app_teams")
            .select(GROUP_SELECT)
            .in("id", extraIds);
          extra = (extraRows ?? []).map((r) => mapRow(r));
        }
        fetched = [...owned, ...extra];
      }
      if (gen !== refreshGeneration) return;
      const fetchedIds = new Set(fetched.map((row) => row.id));
      const inFlight = groupsSnapshot.filter((g) => g.creating && !fetchedIds.has(g.id));
      setGroupsSnapshot([...fetched, ...inFlight]);
      const current = activeEntityIdRef.current;
      if (
        current &&
        !fetchedIds.has(current) &&
        !inFlight.some((g) => g.id === current)
      ) {
        setActiveEntityRef.current(null);
      }
    } finally {
      if (gen === refreshGeneration) setLoading(false);
    }
  }, [userId]);

  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (userId && lastUserIdRef.current && lastUserIdRef.current !== userId) {
      setGroupsSnapshot([]);
    }
    lastUserIdRef.current = userId;
    void refresh();
  }, [refresh, userId]);

  const createGroup = useCallback(
    async (name: string, onDraft?: (group: UserGroup) => void): Promise<UserGroup | null> => {
      if (!userId) return null;
      const trimmed = persistProfileName(name, ENTITY_PROFILE_NAME_MAX) || name.trim() || "New entity";
      const draftId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
              const n = (Math.random() * 16) | 0;
              const v = ch === "x" ? n : (n & 0x3) | 0x8;
              return v.toString(16);
            });
      const draft: UserGroup = {
        id: draftId,
        name: trimmed,
        description: null,
        website: null,
        entityCode: "",
        creating: true,
      };
      setGroupsSnapshot([...groupsSnapshot, draft]);
      onDraft?.(draft);

      const api = await apiJson<{ group?: Parameters<typeof mapRow>[0] }>("/api/account/entities", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });

      if (!api.ok || !api.body.group) {
        console.error("[useUserGroups] createGroup", api.body.error ?? `HTTP ${api.status}`);
        setGroupsSnapshot(groupsSnapshot.filter((g) => g.id !== draftId));
        return null;
      }

      const local = groupsSnapshot.find((g) => g.id === draftId);
      const persisted = mapRow(api.body.group);
      const next: UserGroup = {
        ...persisted,
        name: local?.name ?? persisted.name,
        description: local?.description ?? persisted.description,
        website: local?.website ?? persisted.website,
      };

      refreshGeneration += 1;
      setLoading(false);
      setGroupsSnapshot(
        groupsSnapshot.filter((g) => g.id !== draftId).concat(next),
      );

      if (
        next.name !== persisted.name ||
        next.description !== persisted.description ||
        next.website !== persisted.website
      ) {
        const persist = await apiJson(`/api/account/entities/${next.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: persistProfileName(next.name, ENTITY_PROFILE_NAME_MAX) || "New entity",
            description: next.description,
            website: next.website,
          }),
        });
        if (!persist.ok) {
          console.error("[useUserGroups] createGroup persist", persist.body.error);
        }
      }
      return next;
    },
    [userId],
  );

  const patchGroup = useCallback((id: string, patch: UserGroupPatch) => {
    const next: UserGroupPatch = { ...patch };
    if (typeof next.name === "string") next.name = clipProfileName(next.name, ENTITY_PROFILE_NAME_MAX);
    patchSnapshot(id, next);
  }, []);

  const persistGroup = useCallback(async (id: string): Promise<boolean> => {
    const g = groupsSnapshot.find((x) => x.id === id);
    if (!g || !userId || g.creating) return false;
    const name = persistProfileName(g.name, ENTITY_PROFILE_NAME_MAX) || "New entity";
    const description = g.description && g.description.length > 0 ? g.description : null;
    const website = persistOptionalText(g.website ?? "");
    const api = await apiJson<{ group?: Parameters<typeof mapRow>[0] }>(
      `/api/account/entities/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name, description, website }),
      },
    );
    // Keep the in-progress field value. Trim is persist-only — writing the
    // server name back would drop a trailing space and overwrite later keystrokes.
    if (api.ok) return true;

    const { error } = await supabase
      .from("app_teams")
      .update({
        name,
        description,
        website,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", userId);
    if (error) {
      void refresh();
      return false;
    }
    return true;
  }, [userId, refresh]);

  const updateGroup = useCallback(
    async (id: string, patch: UserGroupPatch): Promise<boolean> => {
      patchGroup(id, patch);
      return persistGroup(id);
    },
    [patchGroup, persistGroup],
  );

  const deleteGroup = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) return false;
      const api = await apiJson(`/api/account/entities/${id}`, { method: "DELETE" });
      if (api.ok) {
        setGroupsSnapshot(groupsSnapshot.filter((g) => g.id !== id));
        return true;
      }
      const { error } = await supabase
        .from("app_teams")
        .delete()
        .eq("id", id)
        .eq("owner_id", userId);
      if (error) {
        console.error("[useUserGroups] deleteGroup", error.message);
        return false;
      }
      setGroupsSnapshot(groupsSnapshot.filter((g) => g.id !== id));
      return true;
    },
    [userId],
  );

  return { groups, loading, refresh, createGroup, patchGroup, persistGroup, updateGroup, deleteGroup };
}
