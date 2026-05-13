/**
 * Tracks which session notes the current viewer has not yet seen.
 *
 * - Owner viewer: a session has an "unseen leader" badge when any leader/follower
 *   has authored or updated a note on it after the viewer's last_seen_at.
 * - Non-owner viewer (leader/active follower): a session has an "unseen owner"
 *   badge when the owner's own session note was updated after last_seen, AND
 *   an "unseen leader" badge when any OTHER leader/follower note was updated
 *   after last_seen.
 *
 * `markSeen(eventId)` upserts last_seen_at = now() for the (viewer, event) pair.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { ViewerRole } from "./useViewerRole";
import type { CalendarEvent } from "@/components/calendar/yearStore";

const VIEWS_CHANGE_EVENT = "diary-sessionnote-views-changed";
const NOTES_CHANGE_EVENT = "diary-sessionnote-changed";

interface LeaderRow {
  event_id: string;
  author_id: string;
  updated_at: string;
}
interface ViewRow {
  event_id: string;
  last_seen_at: string;
}

export interface UnseenInfo {
  hasUnseenOwner: boolean;
  hasUnseenLeader: boolean;
}

export function useUnseenSessionNotes(
  memberId: string | undefined,
  viewerRole: ViewerRole,
  events: CalendarEvent[],
) {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const [leaderRows, setLeaderRows] = useState<LeaderRow[]>([]);
  const [views, setViews] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!memberId || !viewerId) return;
    const [{ data: notes }, { data: vs }] = await Promise.all([
      supabase
        .from("diary_session_notes")
        .select("event_id,author_id,updated_at")
        .eq("member_id", memberId)
        .eq("kind", "leader"),
      supabase
        .from("diary_session_note_views")
        .select("event_id,last_seen_at")
        .eq("viewer_id", viewerId),
    ]);
    setLeaderRows((notes ?? []) as LeaderRow[]);
    const map: Record<string, string> = {};
    for (const r of (vs ?? []) as ViewRow[]) map[r.event_id] = r.last_seen_at;
    setViews(map);
  }, [memberId, viewerId]);

  useEffect(() => {
    void reload();
    const onChange = () => void reload();
    window.addEventListener(VIEWS_CHANGE_EVENT, onChange);
    window.addEventListener(NOTES_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener(VIEWS_CHANGE_EVENT, onChange);
      window.removeEventListener(NOTES_CHANGE_EVENT, onChange);
    };
  }, [reload]);

  const isOwner = viewerRole === "owner";

  const unseen = useMemo(() => {
    const out: Record<string, UnseenInfo> = {};
    if (!viewerId) return out;
    // Group leader rows by event_id for quick lookup.
    const byEv: Record<string, LeaderRow[]> = {};
    for (const r of leaderRows) {
      (byEv[r.event_id] ??= []).push(r);
    }
    for (const ev of events) {
      const lastSeen = views[ev.id] ? Date.parse(views[ev.id]) : 0;
      let hasUnseenOwner = false;
      let hasUnseenLeader = false;
      if (!isOwner) {
        const ownerUpd = ev.sessionNoteUpdatedAt
          ? Date.parse(ev.sessionNoteUpdatedAt)
          : 0;
        const ownerHasNote = !!(ev.sessionNote && ev.sessionNote.trim());
        if (ownerHasNote && ownerUpd > lastSeen) hasUnseenOwner = true;
      }
      const rows = byEv[ev.id] ?? [];
      for (const r of rows) {
        if (isOwner) {
          if (Date.parse(r.updated_at) > lastSeen) {
            hasUnseenLeader = true;
            break;
          }
        } else {
          if (r.author_id === viewerId) continue;
          if (Date.parse(r.updated_at) > lastSeen) {
            hasUnseenLeader = true;
            break;
          }
        }
      }
      if (hasUnseenOwner || hasUnseenLeader) {
        out[ev.id] = { hasUnseenOwner, hasUnseenLeader };
      }
    }
    return out;
  }, [leaderRows, views, events, isOwner, viewerId]);

  const markSeen = useCallback(
    async (eventId: string) => {
      if (!viewerId) return;
      // Optimistic update so the badge disappears immediately.
      setViews((v) => ({ ...v, [eventId]: new Date().toISOString() }));
      await supabase
        .from("diary_session_note_views")
        .upsert(
          { viewer_id: viewerId, event_id: eventId, last_seen_at: new Date().toISOString() },
          { onConflict: "viewer_id,event_id" },
        );
      window.dispatchEvent(new CustomEvent(VIEWS_CHANGE_EVENT));
    },
    [viewerId],
  );

  return { unseen, markSeen };
}
