import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { authHeaders } from "@/lib/calendarSessionPersist";
import { detachUserCalendarLocally, setMemberReadOnlyCalendars, setSubscriptionReadOnlyCalendars } from "./yearStore";

export type CalendarAccessRole = "admin" | "member";
export type CalendarMemberStatus = "pending" | "accepted";

export type UserCalendarMember = {
  id: string;
  calendarId: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  role: CalendarAccessRole;
  status: CalendarMemberStatus;
};

export type UserCalendar = {
  id: string;
  ownerId: string;
  entityId: string | null;
  appGroupId: string | null;
  name: string;
  color: string;
  sortOrder: number;
  myRole: CalendarAccessRole;
  hidden: boolean;
  members: UserCalendarMember[];
  source: "local" | "subscription";
};

type UserCalendarsValue = {
  calendars: UserCalendar[];
  loading: boolean;
  createCalendar: (input: {
    name: string;
    color: string;
    entityId?: string | null;
    appGroupId?: string | null;
  }) => Promise<UserCalendar | null>;
  renameCalendar: (id: string, name: string) => Promise<void>;
  setCalendarColor: (id: string, color: string) => Promise<void>;
  setCalendarHidden: (id: string, hidden: boolean) => Promise<void>;
  deleteCalendar: (id: string) => Promise<void>;
  reorderCalendars: (ordered: UserCalendar[]) => Promise<void>;
  lookupUserName: (email: string) => Promise<string | null>;
  inviteMember: (input: {
    calendarId: string;
    email: string;
    role: CalendarAccessRole;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateMemberRole: (memberId: string, role: CalendarAccessRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const UserCalendarsContext = createContext<UserCalendarsValue | null>(null);

function asRole(value: string): CalendarAccessRole {
  return value === "admin" ? "admin" : "member";
}

function asStatus(value: string): CalendarMemberStatus {
  return value === "accepted" ? "accepted" : "pending";
}

function applyCalendarOrder(prev: UserCalendar[], ranks: Map<string, number> | null): UserCalendar[] {
  if (!ranks || ranks.size < 2) return prev;
  const ordered = prev
    .filter((calendar) => ranks.has(calendar.id))
    .sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));
  const slots: number[] = [];
  prev.forEach((calendar, index) => {
    if (ranks.has(calendar.id)) slots.push(index);
  });
  const next = prev.slice();
  ordered.forEach((calendar, index) => {
    const slot = slots[index];
    const sortOrder = ranks.get(calendar.id);
    if (slot == null || sortOrder == null) return;
    next[slot] = { ...calendar, sortOrder };
  });
  return next;
}

export function UserCalendarsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<UserCalendar[]>([]);
  const [loading, setLoading] = useState(false);
  const removedIds = useRef(new Set<string>());
  const orderRevision = useRef(0);
  const pendingOrder = useRef<Map<string, number> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCalendars([]);
      setMemberReadOnlyCalendars([]);
      setSubscriptionReadOnlyCalendars([]);
      return;
    }
    const seen = orderRevision.current;
    setLoading(true);
    const [calRes, memberRes, visRes] = await Promise.all([
      supabase
        .from("user_calendars")
        .select("id, owner_id, entity_id, app_group_id, name, color, sort_order, source")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("user_calendar_members")
        .select("id, calendar_id, user_id, email, display_name, role, status"),
      supabase.from("user_calendar_visibility").select("calendar_id, hidden").eq("user_id", user.id),
    ]);
    setLoading(false);
    if (seen !== orderRevision.current) return;
    if (calRes.error || memberRes.error) return;

    const hiddenById = new Map<string, boolean>();
    for (const row of visRes.data ?? []) {
      hiddenById.set(row.calendar_id, !!row.hidden);
    }
    const membersByCalendar = new Map<string, UserCalendarMember[]>();
    for (const row of memberRes.data ?? []) {
      const member: UserCalendarMember = {
        id: row.id,
        calendarId: row.calendar_id,
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: asRole(row.role),
        status: asStatus(row.status),
      };
      const list = membersByCalendar.get(row.calendar_id) ?? [];
      list.push(member);
      membersByCalendar.set(row.calendar_id, list);
    }

    const next: UserCalendar[] = [];
    for (const row of calRes.data ?? []) {
      const members = membersByCalendar.get(row.id) ?? [];
      const mine = members.find((member) => member.userId === user.id && member.status === "accepted");
      const myRole: CalendarAccessRole =
        row.owner_id === user.id || mine?.role === "admin" ? "admin" : "member";
      next.push({
        id: row.id,
        ownerId: row.owner_id,
        entityId: row.entity_id,
        appGroupId: row.app_group_id,
        name: row.name,
        color: row.color,
        sortOrder: row.sort_order,
        myRole,
        hidden: hiddenById.get(row.id) ?? false,
        members,
        source: row.source === "subscription" ? "subscription" : "local",
      });
    }
    setMemberReadOnlyCalendars(
      next.filter((calendar) => calendar.myRole === "member").map((calendar) => calendar.id),
    );
    setSubscriptionReadOnlyCalendars(
      next.filter((calendar) => calendar.source === "subscription").map((calendar) => calendar.id),
    );
    setCalendars(applyCalendarOrder(next.filter((calendar) => !removedIds.current.has(calendar.id)), pendingOrder.current));
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("bissibox-calendars-changed", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("bissibox-calendars-changed", onFocus);
    };
  }, [refresh]);

  const createCalendar = useCallback<UserCalendarsValue["createCalendar"]>(
    async (input) => {
      if (!user) return null;
      const sortOrder =
        calendars.reduce((max, calendar) => Math.max(max, calendar.sortOrder), 0) + 1;
      const { data, error } = await supabase
        .from("user_calendars")
        .insert({
          owner_id: user.id,
          name: input.name,
          color: input.color,
          entity_id: input.entityId ?? null,
          app_group_id: input.appGroupId ?? null,
          sort_order: sortOrder,
        })
        .select("id, owner_id, entity_id, app_group_id, name, color, sort_order, source")
        .single();
      if (error || !data) {
        console.error("[calendars] create failed", error?.message ?? "no row");
        return null;
      }
      const created: UserCalendar = {
        id: data.id,
        ownerId: data.owner_id,
        entityId: data.entity_id,
        appGroupId: data.app_group_id,
        name: data.name,
        color: data.color,
        sortOrder: data.sort_order,
        myRole: "admin",
        hidden: false,
        members: [],
        source: data.source === "subscription" ? "subscription" : "local",
      };
      setCalendars((prev) => [...prev, created]);
      void refresh();
      return created;
    },
    [calendars, refresh, user],
  );

  const renameCalendar = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCalendars((prev) =>
      prev.map((calendar) => (calendar.id === id ? { ...calendar, name: trimmed } : calendar)),
    );
    await supabase.from("user_calendars").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const setCalendarColor = useCallback(async (id: string, color: string) => {
    setCalendars((prev) =>
      prev.map((calendar) => (calendar.id === id ? { ...calendar, color } : calendar)),
    );
    await supabase.from("user_calendars").update({ color, updated_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const setCalendarHidden = useCallback(
    async (id: string, hidden: boolean) => {
      if (!user) return;
      setCalendars((prev) =>
        prev.map((calendar) => (calendar.id === id ? { ...calendar, hidden } : calendar)),
      );
      await supabase.from("user_calendar_visibility").upsert({
        calendar_id: id,
        user_id: user.id,
        hidden,
      });
    },
    [user],
  );

  const reorderCalendars = useCallback(
    async (ordered: UserCalendar[]) => {
      if (ordered.length < 2) return;
      const revisionAtWrite = ++orderRevision.current;
      const ranks = new Map(ordered.map((calendar, index) => [calendar.id, index]));
      pendingOrder.current = ranks;
      setCalendars((prev) => applyCalendarOrder(prev, ranks));
      const now = new Date().toISOString();
      const results = await Promise.all(
        ordered.map((calendar, index) =>
          supabase
            .from("user_calendars")
            .update({ sort_order: index, updated_at: now })
            .eq("id", calendar.id)
            .select("id"),
        ),
      );
      if (orderRevision.current !== revisionAtWrite) return;
      const failed = results.find((result) => result.error || (Array.isArray(result.data) && result.data.length === 0));
      if (failed) {
        console.error("[calendars] reorder failed", failed.error?.message ?? "sort order was not saved");
        return;
      }
      if (pendingOrder.current === ranks) pendingOrder.current = null;
    },
    [],
  );

  const deleteCalendar = useCallback(async (id: string) => {
    const leaving = calendars.some((calendar) => calendar.id === id && calendar.myRole === "member");
    removedIds.current.add(id);
    setCalendars((prev) => prev.filter((calendar) => calendar.id !== id));
    detachUserCalendarLocally(id);
    const { error } = leaving
      ? await supabase.rpc("leave_user_calendar", { p_id: id })
      : await supabase.rpc("soft_delete_user_calendar", { p_id: id });
    if (error) {
      removedIds.current.delete(id);
      console.error("[calendars] delete failed", error.message);
      void refresh();
    }
  }, [calendars, refresh]);

  const lookupUserName = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return null;
    const res = await fetch(`/api/calendar/lookup-user?email=${encodeURIComponent(trimmed)}`, {
      credentials: "include",
      headers: await authHeaders(),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { name?: string | null };
    return typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  }, []);

  const inviteMember = useCallback<UserCalendarsValue["inviteMember"]>(async (input) => {
    const res = await fetch("/api/calendar/invite", {
      method: "POST",
      credentials: "include",
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error || "Could not add this person" };
    await refresh();
    return { ok: true };
  }, [refresh]);

  const updateMemberRole = useCallback(async (memberId: string, role: CalendarAccessRole) => {
    setCalendars((prev) =>
      prev.map((calendar) => ({
        ...calendar,
        members: calendar.members.map((member) =>
          member.id === memberId ? { ...member, role } : member,
        ),
      })),
    );
    const { error } = await supabase.rpc("set_user_calendar_member_role", {
      p_member_id: memberId,
      p_role: role,
    });
    if (error) console.error("[calendars] role change failed", error.message);
    void refresh();
  }, [refresh]);

  const removeMember = useCallback(async (memberId: string) => {
    setCalendars((prev) =>
      prev.map((calendar) => ({
        ...calendar,
        members: calendar.members.filter((member) => member.id !== memberId),
      })),
    );
    const { error } = await supabase.rpc("remove_user_calendar_member", { p_member_id: memberId });
    if (error) console.error("[calendars] remove person failed", error.message);
    void refresh();
  }, [refresh]);

  const value = useMemo<UserCalendarsValue>(
    () => ({
      calendars,
      loading,
      createCalendar,
      renameCalendar,
      setCalendarColor,
      setCalendarHidden,
      deleteCalendar,
      reorderCalendars,
      lookupUserName,
      inviteMember,
      updateMemberRole,
      removeMember,
      refresh,
    }),
    [
      calendars,
      loading,
      createCalendar,
      renameCalendar,
      setCalendarColor,
      setCalendarHidden,
      deleteCalendar,
      reorderCalendars,
      lookupUserName,
      inviteMember,
      updateMemberRole,
      removeMember,
      refresh,
    ],
  );

  return <UserCalendarsContext.Provider value={value}>{children}</UserCalendarsContext.Provider>;
}

export function useUserCalendars(): UserCalendarsValue {
  const value = useContext(UserCalendarsContext);
  if (!value) throw new Error("useUserCalendars requires UserCalendarsProvider");
  return value;
}

export function useUserCalendarsSafe(): UserCalendarsValue | null {
  return useContext(UserCalendarsContext);
}

export function calendarAdminIds(calendar: UserCalendar): string[] {
  const ids = new Set<string>();
  ids.add(calendar.ownerId);
  for (const member of calendar.members) {
    if (member.status === "accepted" && member.role === "admin" && member.userId) {
      ids.add(member.userId);
    }
  }
  return [...ids];
}
