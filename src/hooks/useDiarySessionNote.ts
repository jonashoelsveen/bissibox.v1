/**
 * Per-session leader/follower notes backed by Supabase (`diary_session_notes`).
 *
 * The member's own session note continues to live on the event itself
 * (`event.sessionNote`). This hook returns the additional notes written by
 * leaders / active followers (and the current viewer's own note if non-owner).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { canAnnotate, type ViewerRole } from "./useViewerRole";
import type { AuthoredNote } from "./useDiaryDayNote";

const CHANGE_EVENT = "diary-sessionnote-changed";

interface State {
  rows: { author_id: string; body: string }[];
  names: Record<string, string>;
}

function fmtName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!p) return "";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
}

export function useDiarySessionNote(
  eventId: string,
  memberId: string,
  role: ViewerRole,
) {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const [state, setState] = useState<State>({ rows: [], names: {} });

  const reload = useCallback(async () => {
    if (!eventId || !memberId) return;
    const { data } = await supabase
      .from("diary_session_notes")
      .select("author_id,body")
      .eq("event_id", eventId)
      .eq("member_id", memberId);
    const rows = (data ?? []) as { author_id: string; body: string }[];
    const names: Record<string, string> = {};
    const ids = rows.map((r) => r.author_id);
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", ids);
      for (const p of profs ?? []) names[p.id] = fmtName(p);
    }
    setState({ rows, names });
  }, [eventId, memberId]);

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
      if (role === "owner") return; // owner uses event.sessionNote
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
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { eventId } }));
    },
    [eventId, memberId, viewerId, role],
  );

  const isOwner = role === "owner";

  const viewerNote = useMemo(
    () =>
      !isOwner && viewerId
        ? state.rows.find((r) => r.author_id === viewerId)?.body ?? ""
        : "",
    [state.rows, viewerId, isOwner],
  );

  /** All other-authored notes (excluding current viewer's own row). */
  const leaderNotes: AuthoredNote[] = useMemo(
    () =>
      state.rows
        .filter((r) => r.author_id !== viewerId)
        .map((r) => ({
          authorId: r.author_id,
          authorName: state.names[r.author_id] ?? "",
          body: r.body,
        })),
    [state.rows, state.names, viewerId],
  );

  return {
    viewerNote,
    leaderNotes,
    isOwner,
    canEdit: canAnnotate(role) && role !== "owner",
    saveViewerNote,
  };
}
