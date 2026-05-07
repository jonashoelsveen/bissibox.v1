/**
 * useStravaActivities — fetches synced Strava activities for the logged-in
 * user from the `activities` table and exposes them as CalendarEvent-shaped
 * items so the Diary view can render them next to manually logged sessions.
 *
 * It also subscribes to realtime changes so newly webhook-synced activities
 * appear without a refresh.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { colorForActivity, colorForStravaSession } from "@/lib/activity-colors";
import type { CalendarEvent } from "./yearStore";

export type StravaActivityRow = {
  id: string;
  user_id: string;
  strava_activity_id: number | null;
  name: string | null;
  sport_type: string | null;
  sub_type: string | null;
  start_date: string | null;
  elapsed_time_sec: number | null;
  moving_time_sec: number | null;
  distance_m: number | null;
  total_elevation_gain_m: number | null;
  average_heartrate: number | null;
  summary_polyline: string | null;
  map_polyline: string | null;
  sync_status: string;
};

function localISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function sportToDiary(sport: string | null, name: string | null): {
  group: string;
  sub?: string;
  activity?: "running" | "cycling" | "swimming" | "strength" | "xcskiing";
} {
  const s = (sport || "").toLowerCase();
  const t = (name || "").toLowerCase();
  if (s.includes("run")) {
    const isTrack = /\b(track|bane)\b/i.test(t);
    return { group: "endurance", sub: isTrack ? "track" : "running", activity: "running" };
  }
  if (s.includes("ride") || s.includes("cycl") || s.includes("bike")) {
    return { group: "endurance", sub: "cycling", activity: "cycling" };
  }
  if (s.includes("swim")) return { group: "endurance", sub: "swimming", activity: "swimming" };
  if (s.includes("ski")) return { group: "endurance", sub: "other", activity: "xcskiing" };
  if (s.includes("weight") || s.includes("strength")) {
    const isCore = /\b(core|basis)\b/i.test(t);
    return { group: "strength", sub: isCore ? "core" : "max", activity: "strength" };
  }
  if (s.includes("yoga") || s.includes("stretch")) return { group: "stretch" };
  // Unknown sport types still get imported, but show as "Else".
  return { group: "else" };
}

export function rowToCalendarEvent(row: StravaActivityRow): CalendarEvent | null {
  if (!row.start_date) return null;
  const start = new Date(row.start_date);
  if (Number.isNaN(start.getTime())) return null;
  const dur = (row.elapsed_time_sec ?? row.moving_time_sec ?? 3600) * 1000;
  const end = new Date(start.getTime() + dur);
  const { group, sub, activity } = sportToDiary(row.sport_type, row.name);
  return {
    id: `strava:${row.strava_activity_id ?? row.id}`,
    title: row.name || row.sport_type || "Strava activity",
    startISO: localISO(start),
    endISO: localISO(end),
    allDay: false,
    color: colorForStravaSession(row.sport_type, row.name),
    diaryType: "training",
    diaryGroup: group,
    diarySub: sub,
    activity,
    distanceKm: row.distance_m != null ? row.distance_m / 1000 : undefined,
    sportType: row.sport_type ?? undefined,
    subType: row.sub_type ?? undefined,
    summaryPolyline: row.summary_polyline ?? undefined,
    totalElevationGainM: row.total_elevation_gain_m ?? undefined,
    averageHeartrate: row.average_heartrate ?? undefined,
    stravaActivityId: row.strava_activity_id ?? undefined,
  };
}

/**
 * Group sessions whose end-of-prev → start-of-next gap is < 30 minutes.
 * They are rendered as one continuous block (no visual gap), but each
 * session keeps its own tile so the activity / color split stays visible.
 *
 * The merging is purely visual: we extend the previous event's `endISO`
 * to butt up against the next event's `startISO`, eliminating the gap
 * while preserving each session as a separate calendar entry.
 */
export function mergeAdjacentSessions(events: CalendarEvent[]): CalendarEvent[] {
  if (events.length < 2) return events;
  const sorted = [...events].sort((a, b) => a.startISO.localeCompare(b.startISO));
  const GAP_MS = 30 * 60 * 1000;
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i];
    const next = sorted[i + 1];
    const prevEnd = new Date(prev.endISO).getTime();
    const nextStart = new Date(next.startISO).getTime();
    if (Number.isNaN(prevEnd) || Number.isNaN(nextStart)) continue;
    const gap = nextStart - prevEnd;
    if (gap > 0 && gap < GAP_MS) {
      // Close the gap: extend prev to touch next.
      sorted[i] = { ...prev, endISO: next.startISO };
    }
  }
  return sorted;
}

// Silence unused-import linter for colorForActivity (kept for backward compat).
void colorForActivity;

export function useStravaActivities(): {
  events: CalendarEvent[];
  rows: Record<string, StravaActivityRow>;
  loading: boolean;
} {
  const [rows, setRows] = useState<StravaActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { if (active) { setRows([]); setLoading(false); } return; }
      const { data } = await supabase
        .from("activities")
        .select("*")
        .eq("user_id", auth.user.id)
        .eq("source", "strava")
        .order("start_date", { ascending: false });
      if (active) {
        setRows((data || []) as StravaActivityRow[]);
        setLoading(false);
      }

      // Fire-and-forget background re-sync so any activity edits made in
      // Strava (e.g. sport_type changes) get pulled in without requiring the
      // user to press "Re-sync". Realtime will propagate the resulting
      // updates to this component.
      supabase.functions.invoke("strava-sync-recent", { body: { days: 90 } })
        .catch(() => { /* ignore — user may not be connected */ });

      channel = supabase
        .channel(`activities:${auth.user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "activities", filter: `user_id=eq.${auth.user.id}` },
          (payload) => {
            setRows((prev) => {
              const next = [...prev];
              const incoming = (payload.new || payload.old) as StravaActivityRow;
              if (payload.eventType === "DELETE") {
                return next.filter((r) => r.id !== (payload.old as StravaActivityRow).id);
              }
              const idx = next.findIndex((r) => r.id === incoming.id);
              if (idx >= 0) next[idx] = incoming;
              else next.unshift(incoming);
              return next;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const events = rows
    .map(rowToCalendarEvent)
    .filter((e): e is CalendarEvent => !!e);

  const byKey: Record<string, StravaActivityRow> = {};
  rows.forEach((r) => {
    const k = `strava:${r.strava_activity_id ?? r.id}`;
    byKey[k] = r;
  });

  return { events, rows: byKey, loading };
}
