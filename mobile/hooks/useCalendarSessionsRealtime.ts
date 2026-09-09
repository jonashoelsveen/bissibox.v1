import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, parseISO } from "date-fns";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  subscribeCalendarSessionsSync,
  notifyCalendarSessionsChanged,
} from "@/lib/calendarSessionSync";
import { fetchMemberEntityCalendar, type CalendarSession } from "@/hooks/useCalendarSessions";

type SessionRow = CalendarSession & {
  user_id?: string;
  entity_id?: string | null;
};

function rowMatchesScope(
  row: SessionRow,
  userId: string,
  teamId: string | null,
  memberTeamIds: string[] = [],
): boolean {
  if (teamId) return row.entity_id === teamId;
  if (row.entity_id && memberTeamIds.includes(row.entity_id)) return true;
  return row.user_id === userId && row.entity_id == null;
}

function rowToSession(row: SessionRow): CalendarSession {
  return {
    id: row.id,
    title: row.title,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    color: row.color,
    description: row.description,
    category: row.category,
    category_id: row.category_id,
    sport_type: row.sport_type,
    distance_km: row.distance_km,
    all_day: row.all_day,
    app_group_id: row.app_group_id ?? null,
  };
}

function sessionInMonth(startsAt: string, monthFrom: string, monthTo: string): boolean {
  const day = startsAt.slice(0, 10);
  return day >= monthFrom && day <= monthTo;
}

function sortSessions(rows: CalendarSession[]): CalendarSession[] {
  return [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function applySessionRow(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  teamId: string | null,
  row: SessionRow,
  memberTeamIds: string[] = [],
) {
  if (!rowMatchesScope(row, userId, teamId, memberTeamIds)) return;
  const session = rowToSession(row);
  const hasTitle = session.title.trim().length > 0;

  const entries = qc.getQueriesData<CalendarSession[]>({
    queryKey: ["calendar-sessions", userId, teamId],
    exact: false,
  });

  for (const [queryKey, rows] of entries) {
    if (!rows) continue;
    const monthFrom = queryKey[3] as string;
    if (typeof monthFrom !== "string") continue;
    const monthTo = format(endOfMonth(parseISO(`${monthFrom}T00:00:00`)), "yyyy-MM-dd");
    const inMonth = sessionInMonth(session.starts_at, monthFrom, monthTo);
    const idx = rows.findIndex((s) => s.id === session.id);

    let next: CalendarSession[];
    if (!hasTitle || !inMonth) {
      next = idx >= 0 ? rows.filter((s) => s.id !== session.id) : rows;
    } else if (idx >= 0) {
      next = sortSessions(rows.map((s) => (s.id === session.id ? session : s)));
    } else {
      next = sortSessions([...rows, session]);
    }

    if (next !== rows) {
      qc.setQueryData(queryKey, next);
    }
  }
}

function removeSession(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  teamId: string | null,
  sessionId: string,
) {
  qc.setQueriesData<CalendarSession[]>(
    { queryKey: ["calendar-sessions", userId, teamId], exact: false },
    (rows) => rows?.filter((s) => s.id !== sessionId),
  );
}

/**
 * Single app-level subscription for calendar session changes (web ↔ mobile).
 * Mirrors the entity roster pattern: set Realtime auth before subscribing,
 * then keep React Query month caches in sync via postgres_changes + broadcast.
 */
export function useCalendarSessionsRealtime(
  userId: string | null,
  teamId: string | null,
  options: { onSessionDeleted?: (sessionId: string) => void } = {},
) {
  const qc = useQueryClient();
  const onDeletedRef = useRef(options.onSessionDeleted);
  onDeletedRef.current = options.onSessionDeleted;
  const remoteRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [realtimeEpoch, setRealtimeEpoch] = useState(0);

  useEffect(() => {
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session?.access_token) {
          void supabase.realtime.setAuth(session.access_token);
        }
        setRealtimeEpoch((n) => n + 1);
      }
    });
    return () => authSub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    const refreshAll = () => {
      void qc.refetchQueries({
        queryKey: ["calendar-sessions", userId, teamId],
        type: "all",
      });
    };

    const scheduleRefreshAll = () => {
      if (remoteRefreshTimer.current) clearTimeout(remoteRefreshTimer.current);
      remoteRefreshTimer.current = setTimeout(refreshAll, 50);
    };

    let cancelled = false;
    const memberTeamIdsRef = { current: [] as string[] };
    const unsubBroadcast = subscribeCalendarSessionsSync(
      supabase,
      userId,
      teamId,
      scheduleRefreshAll,
    );
    const memberBroadcastUnsubs: Array<() => void> = [];
    const memberSessionChannels: RealtimeChannel[] = [];

    const attachSessionChannel = (channel: RealtimeChannel, filter: string) => {
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "calendar_sessions", filter },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const deletedId = (payload.old as { id?: string })?.id;
              if (deletedId) {
                onDeletedRef.current?.(deletedId);
                removeSession(qc, userId, teamId, deletedId);
              }
              scheduleRefreshAll();
              return;
            }
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              applySessionRow(
                qc,
                userId,
                teamId,
                payload.new as SessionRow,
                memberTeamIdsRef.current,
              );
              scheduleRefreshAll();
            }
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setRealtimeEpoch((n) => n + 1);
          }
        });
      return channel;
    };

    const filter = teamId
      ? `entity_id=eq.${teamId}`
      : `user_id=eq.${userId}`;

    let ch: RealtimeChannel = supabase.channel(
      `mob-cal-sessions-rt-${teamId ?? userId}-${realtimeEpoch}`,
    );

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session?.access_token) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      ch = attachSessionChannel(ch, filter);

      if (!teamId) {
        const overlay = await fetchMemberEntityCalendar();
        if (cancelled) return;
        memberTeamIdsRef.current = overlay.teamIds;
        for (const id of overlay.teamIds) {
          memberBroadcastUnsubs.push(
            subscribeCalendarSessionsSync(supabase, userId, id, scheduleRefreshAll),
          );
          memberSessionChannels.push(
            attachSessionChannel(
              supabase.channel(`mob-cal-member-sessions-${userId}-${id}-${realtimeEpoch}`),
              `entity_id=eq.${id}`,
            ),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubBroadcast();
      for (const unsub of memberBroadcastUnsubs) unsub();
      for (const channel of memberSessionChannels) void supabase.removeChannel(channel);
      if (remoteRefreshTimer.current) clearTimeout(remoteRefreshTimer.current);
      void supabase.removeChannel(ch);
    };
  }, [userId, teamId, qc, realtimeEpoch]);
}

export { notifyCalendarSessionsChanged };
