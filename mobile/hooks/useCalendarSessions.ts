import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { notifyCalendarSessionsChanged } from "@/lib/calendarSessionSync";
import { endOfMonth, format, startOfMonth } from "date-fns";

export interface CalendarSession {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  color: string | null;
  description: string | null;
  category: string | null;
  category_id: string | null;
  sport_type: string | null;
  distance_km: number | null;
  all_day: boolean;
  app_group_id?: string | null;
  entity_id?: string | null;
}

type MemberEntityCalendar = {
  memberships?: Array<{ teamId?: string }>;
  sessions?: Array<Record<string, unknown>>;
};

const STORED_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isStoredSessionId(id: string): boolean {
  return STORED_SESSION_ID.test(id);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function utcToLocalIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function appOrigin(): string {
  const configured = process.env.EXPO_PUBLIC_APP_URL?.trim();
  return (configured || "https://bissibox.com").replace(/\/$/, "");
}

async function subscriptionSessions(from: string, to: string): Promise<CalendarSession[]> {
  const { data: calendars, error } = await supabase
    .from("user_calendars")
    .select("id, color")
    .eq("source", "subscription");
  if (error || !calendars?.length) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return [];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  const params = new URLSearchParams({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: end.toISOString(),
    timeZone,
  });
  const batches = await Promise.all(
    calendars.map(async (calendar) => {
      try {
        const response = await fetch(
          `${appOrigin()}/api/calendar/subscriptions/${calendar.id}/events?${params}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
        );
        if (!response.ok) return [];
        const body = (await response.json()) as {
          events?: Array<{
            id: string;
            title: string;
            allDay: boolean;
            start: string;
            end: string;
            description: string | null;
          }>;
        };
        return (body.events ?? []).flatMap((event) => {
          const title = event.title.trim() || (event.allDay ? "New event" : "New session");
          const starts_at = event.allDay ? `${event.start}T00:00:00` : utcToLocalIso(event.start);
          const ends_at = event.allDay ? `${event.end}T00:00:00` : utcToLocalIso(event.end);
          if (!event.id || !starts_at || !ends_at) return [];
          const session: CalendarSession = {
            id: event.id,
            title,
            starts_at,
            ends_at,
            color: typeof calendar.color === "string" ? calendar.color : null,
            description: event.description,
            category: null,
            category_id: null,
            sport_type: null,
            distance_km: null,
            all_day: event.allDay,
          };
          return [session];
        });
      } catch {
        return [];
      }
    }),
  );
  return batches.flat();
}

async function withSubscriptions(sessions: CalendarSession[], from: string, to: string): Promise<CalendarSession[]> {
  try {
    const extra = await subscriptionSessions(from, to);
    if (extra.length === 0) return sessions;
    return [...sessions, ...extra].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  } catch {
    return sessions;
  }
}

function asCalendarSession(row: Record<string, unknown>): CalendarSession | null {
  const id = typeof row.id === "string" ? row.id : "";
  const title = typeof row.title === "string" ? row.title : "";
  const starts_at = typeof row.starts_at === "string" ? row.starts_at : "";
  const ends_at = typeof row.ends_at === "string" ? row.ends_at : "";
  if (!id || !title.trim() || !starts_at || !ends_at) return null;
  return {
    id,
    title,
    starts_at,
    ends_at,
    color: typeof row.color === "string" ? row.color : null,
    description: typeof row.description === "string" ? row.description : null,
    category: typeof row.category === "string" ? row.category : null,
    category_id: typeof row.category_id === "string" ? row.category_id : null,
    sport_type: typeof row.sport_type === "string" ? row.sport_type : null,
    distance_km: typeof row.distance_km === "number" ? row.distance_km : null,
    all_day: !!row.all_day,
    app_group_id: typeof row.app_group_id === "string" ? row.app_group_id : null,
    entity_id: typeof row.entity_id === "string" ? row.entity_id : null,
  };
}

export async function fetchMemberEntityCalendar(): Promise<{
  teamIds: string[];
  sessions: CalendarSession[];
}> {
  const { data, error } = await supabase.rpc("list_visible_calendar_sessions");
  if (error || !data || typeof data !== "object") {
    return { teamIds: [], sessions: [] };
  }
  const payload = data as MemberEntityCalendar;
  const teamIds: string[] = [];
  for (const row of payload.memberships ?? []) {
    if (typeof row.teamId === "string" && row.teamId) teamIds.push(row.teamId);
  }
  const sessions: CalendarSession[] = [];
  for (const row of payload.sessions ?? []) {
    const mapped = asCalendarSession(row);
    if (mapped) sessions.push(mapped);
  }
  return { teamIds, sessions };
}

/** Map desktop/cloud rows that only have legacy category/color onto mobile category ids. */
export function resolveSessionCategoryId(
  session: Pick<CalendarSession, "category_id" | "category" | "color">,
  categories: Array<{ id: string; name: string; color: string }>,
): string | null {
  if (session.category_id) return session.category_id;
  if (!session.color && !session.category) return null;
  if (session.color) {
    const byColor = categories.find(
      (c) => c.color.toLowerCase() === session.color!.toLowerCase(),
    );
    if (byColor) return byColor.id;
  }
  const label = session.category?.trim().toLowerCase();
  if (!label) return null;
  return categories.find((c) => c.name.trim().toLowerCase() === label)?.id ?? null;
}

export function useCalendarSessions(
  userId: string | null,
  month: Date,
  teamId: string | null = null,
) {
  const from = format(startOfMonth(month), "yyyy-MM-dd");
  const to = format(endOfMonth(month), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["calendar-sessions", userId, teamId, from],
    enabled: !!userId,
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: "always",
    queryFn: async (): Promise<CalendarSession[]> => {
      let q = supabase
        .from("calendar_sessions")
        .select(
          "id,title,starts_at,ends_at,color,description,category,category_id,sport_type,distance_km,all_day,app_group_id",
        )
        .gte("starts_at", `${from}T00:00:00`)
        .lte("starts_at", `${to}T23:59:59`)
        .order("starts_at", { ascending: true });

      if (teamId) {
        q = q.eq("entity_id", teamId);
      } else {
        const { data: visible, error: visibleError } = await supabase.rpc(
          "list_visible_calendar_sessions",
        );
        if (!visibleError && visible && typeof visible === "object") {
          const payload = visible as MemberEntityCalendar;
          const sessions: CalendarSession[] = [];
          for (const row of payload.sessions ?? []) {
            const mapped = asCalendarSession(row);
            if (!mapped) continue;
            const day = mapped.starts_at.slice(0, 10);
            if (day >= from && day <= to) sessions.push(mapped);
          }
          return withSubscriptions(sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at)), from, to);
        }
        q = q.eq("user_id", userId!).is("entity_id", null);
      }

      const { data, error } = await q;
      if (error) throw error;
      return withSubscriptions((data ?? []) as CalendarSession[], from, to);
    },
  });
}

export function useCreateSession(userId: string | null, teamId: string | null = null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      category_id: string | null;
      color: string | null;
      entity_id?: string | null;
      app_group_id?: string | null;
      description?: string | null;
      all_day?: boolean;
    }) => {
      if (input.entity_id) {
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
                const n = (Math.random() * 16) | 0;
                const v = ch === "x" ? n : (n & 0x3) | 0x8;
                return v.toString(16);
              });
        const { data, error } = await supabase.rpc("upsert_entity_calendar_session", {
          p: {
            id,
            entity_id: input.entity_id,
            user_id: input.user_id,
            title: input.title,
            starts_at: input.starts_at,
            ends_at: input.ends_at,
            category_id: input.category_id,
            color: input.color,
            all_day: input.all_day ?? false,
            app_group_id: input.app_group_id ?? null,
            description: input.description ?? null,
          },
        });
        if (error) throw error;
        if (typeof data !== "string" || !data) {
          throw new Error("Entity session did not save.");
        }
        return;
      }
      const { error } = await supabase.from("calendar_sessions").insert({
        user_id: input.user_id,
        title: input.title,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        category_id: input.category_id,
        color: input.color,
        all_day: input.all_day ?? false,
        ...(input.description !== undefined ? { description: input.description } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar-sessions"] });
      if (userId) void notifyCalendarSessionsChanged(supabase, userId, teamId);
    },
  });
}

export function useUpdateSession(userId: string | null, teamId: string | null = null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SessionUpdateInput) => {
      if (!isStoredSessionId(input.id)) return;
      let q = supabase
        .from("calendar_sessions")
        .update({
          title: input.title,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          category_id: input.category_id,
          color: input.color,
          ...(input.all_day !== undefined ? { all_day: input.all_day } : {}),
          ...(input.app_group_id !== undefined ? { app_group_id: input.app_group_id } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .eq("id", input.id);

      if (teamId) {
        q = q.eq("entity_id", teamId);
      } else if (userId) {
        q = q.eq("user_id", userId).is("entity_id", null);
      }

      const { data, error } = await q.select("id").maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("This session could not be updated. Try reopening the calendar.");
      }
    },
    onMutate: async (input) => {
      if (!isStoredSessionId(input.id)) return;
      await qc.cancelQueries({ queryKey: ["calendar-sessions", userId, teamId] });
      const previous = qc.getQueriesData<CalendarSession[]>({
        queryKey: ["calendar-sessions", userId, teamId],
        exact: false,
      });
      patchSessionInCaches(qc, userId, teamId, input.id, {
        title: input.title,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        category_id: input.category_id,
        color: input.color,
        all_day: input.all_day ?? false,
        ...(input.app_group_id !== undefined ? { app_group_id: input.app_group_id } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      });
      return { previous };
    },
    onError: (_err, _input, context) => {
      for (const [key, data] of context?.previous ?? []) {
        qc.setQueryData(key, data);
      }
    },
    onSuccess: () => {
      if (userId) void notifyCalendarSessionsChanged(supabase, userId, teamId);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["calendar-sessions", userId, teamId] });
    },
  });
}

export function useDeleteSession(userId: string | null, teamId: string | null = null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!isStoredSessionId(id)) return;
      let q = supabase.from("calendar_sessions").delete().eq("id", id);
      if (teamId) {
        q = q.eq("entity_id", teamId);
      } else if (userId) {
        q = q.eq("user_id", userId).is("entity_id", null);
      }
      const { data, error } = await q.select("id").maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("This session could not be deleted. Try reopening the calendar.");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar-sessions"] });
      if (userId) void notifyCalendarSessionsChanged(supabase, userId, teamId);
    },
  });
}

/** Fields mirrored between the session sheet and cloud calendar editor. */
export type LiveSessionSnapshot = {
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  category_id: string | null;
  app_group_id: string | null;
  description: string | null;
};

export function liveSessionSnapshot(session: CalendarSession): LiveSessionSnapshot {
  return {
    title: session.title,
    starts_at: session.starts_at,
    ends_at: session.ends_at,
    all_day: session.all_day ?? false,
    category_id: session.category_id,
    app_group_id: session.app_group_id ?? null,
    description: session.description,
  };
}

export function liveSessionSnapshotsEqual(a: LiveSessionSnapshot, b: LiveSessionSnapshot): boolean {
  return (
    a.title === b.title &&
    a.starts_at === b.starts_at &&
    a.ends_at === b.ends_at &&
    a.all_day === b.all_day &&
    a.category_id === b.category_id &&
    a.app_group_id === b.app_group_id &&
    a.description === b.description
  );
}

/** Autosave equality — description is saved only on explicit session save. */
export function liveSessionAutosaveEqual(a: LiveSessionSnapshot, b: LiveSessionSnapshot): boolean {
  return (
    a.title === b.title &&
    a.starts_at === b.starts_at &&
    a.ends_at === b.ends_at &&
    a.all_day === b.all_day &&
    a.category_id === b.category_id &&
    a.app_group_id === b.app_group_id
  );
}

export type SessionUpdateInput = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  category_id: string | null;
  color: string | null;
  app_group_id?: string | null;
  description?: string | null;
  all_day?: boolean;
};

function patchSessionInCaches(
  qc: QueryClient,
  userId: string | null,
  teamId: string | null,
  sessionId: string,
  patch: Partial<CalendarSession>,
) {
  qc.setQueriesData<CalendarSession[]>(
    { queryKey: ["calendar-sessions", userId, teamId], exact: false },
    (rows) => {
      if (!rows) return rows;
      const idx = rows.findIndex((s) => s.id === sessionId);
      if (idx < 0) return rows;
      const next = rows.map((s) => (s.id === sessionId ? { ...s, ...patch } : s));
      return next.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    },
  );
}

/**
 * Resolve the freshest session row from React Query month caches (postgres_changes
 * + broadcast). Falls back to the snapshot passed when the row is not cached yet.
 */
export function useLiveCalendarSession(
  userId: string | null,
  teamId: string | null,
  session: CalendarSession | null,
): CalendarSession | null {
  const qc = useQueryClient();
  const sessionId = session?.id ?? null;
  const [cacheEpoch, setCacheEpoch] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    return qc.getQueryCache().subscribe((event) => {
      const key = event.query?.queryKey;
      if (Array.isArray(key) && key[0] === "calendar-sessions") {
        setCacheEpoch((n) => n + 1);
      }
    });
  }, [sessionId, qc]);

  return useMemo(() => {
    if (!session) return null;
    if (!sessionId) return session;
    const entries = qc.getQueriesData<CalendarSession[]>({
      queryKey: ["calendar-sessions", userId, teamId],
      exact: false,
    });
    for (const [, rows] of entries) {
      const found = rows?.find((s) => s.id === sessionId);
      if (found) return found;
    }
    return session;
  }, [session, sessionId, userId, teamId, qc, cacheEpoch]);
}
