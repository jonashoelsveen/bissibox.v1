/**
 * Per-session leader/follower note backed by Supabase (`diary_session_notes`).
 * The member's own session note continues to live on the event itself
 * (`event.sessionNote`) — this hook only handles the additional notes written
 * by leaders / active followers about a member's session.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { canAnnotate, type ViewerRole } from "./useViewerRole";

const CHANGE_EVENT = "diary-sessionnote-changed";

export function useDiarySessionNote(
  eventId: string,
  memberId: string,
  role: ViewerRole,
) {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const [viewerNote, setViewerNote] = useState<string>("");
  const [otherNotes, setOtherNotes] = useState<{ author_id: string; body: string }[]>([]);

  const reload = useCallback(async () => {
    if (!eventId || !memberId) return;
    const { data } = await supabase
      .from("diary_session_notes")
      .select("author_id,body")
      .eq("event_id", eventId)
      .eq("member_id", memberId);
    const rows = (data ?? []) as { author_id: string; body: string }[];
    setViewerNote(viewerId ? rows.find((r) => r.author_id === viewerId)?.body ?? "" : "");
    setOtherNotes(viewerId ? rows.filter((r) => r.author_id !== viewerId) : rows);
  }, [eventId, memberId, viewerId]);

  useEffect(() => {
    void reload();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { eventId?: string } | undefined;
      if (detail?.eventId === eventId) void reload();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [reload, eventId]);

  const saveViewerNote = useCallback(
    async (text: string) => {
      if (!viewerId) return;
      if (!canAnnotate(role)) return;
      // Owner writes their note to the event itself, not here.
      if (role === "owner") return;
      const trimmed = text.trim();
      if (!trimmed) {
        await supabase
          .from("diary_session_notes")
          .delete()
          .eq("event_id", eventId)
          .eq("author_id", viewerId);
      } else {
        await supabase.from("diary_session_notes").upsert(
          {
            event_id: eventId,
            member_id: memberId,
            author_id: viewerId,
            body: text,
          },
          { onConflict: "event_id,author_id" },
        );
      }
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: { eventId } }),
      );
    },
    [eventId, memberId, viewerId, role],
  );

  // For the member viewing their own diary, "viewerNote" should be the
  // first leader/follower note (if any) so it renders to the right.
  const leaderNoteForOwner = role === "owner" ? otherNotes[0]?.body ?? "" : "";

  return {
    viewerNote: role === "owner" ? leaderNoteForOwner : viewerNote,
    /** True when there is any leader/follower-authored note worth showing. */
    hasLeaderNote: role === "owner" ? otherNotes.length > 0 : !!viewerNote.trim(),
    canEdit: canAnnotate(role) && role !== "owner",
    saveViewerNote,
  };
}
