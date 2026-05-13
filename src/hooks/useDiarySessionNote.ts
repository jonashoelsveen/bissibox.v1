/**
 * Per-session leader/follower notes backed by Supabase (`diary_session_notes`).
 *
 * Rows are split by `kind`:
 *  - 'member' — authored by the member themselves (their own session note)
 *  - 'leader' — authored by a group leader / active follower
 *
 * The member's own session note still also lives on `event.sessionNote`;
 * this hook only manages the leader-side rows.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { canAnnotate, type ViewerRole } from "./useViewerRole";
import type { AuthoredNote } from "./useDiaryDayNote";

const CHANGE_EVENT = "diary-sessionnote-changed";

interface Row {
  author_id: string;
  body: string;
  kind: "member" | "leader";
  updated_at: string;
}

interface State {
  rows: Row[];
  names: Record<string, string>;
}

function fmtName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!p) return "";
  return (p.first_name ?? "").trim();
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
      .select("author_id,body,kind,updated_at")
      .eq("event_id", eventId)
      .eq("member_id", memberId)
      .eq("kind", "leader");
    const rows = (data ?? []) as Row[];
    const names: Record<string, string> = {};
    const ids = Array.from(new Set(rows.map((r) => r.author_id)));
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
          .eq("author_id", viewerId)
          .eq("kind", "leader");
      } else {
        await supabase.from("diary_session_notes").upsert(
          {
            event_id: eventId,
            member_id: memberId,
            author_id: viewerId,
            body: text,
            kind: "leader",
          },
          { onConflict: "event_id,author_id,kind" },
        );
      }
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { eventId } }));
    },
    [eventId, memberId, viewerId, role],
  );

  const isOwner = role === "owner";

  const viewerRow = useMemo(
    () =>
      !isOwner && viewerId
        ? state.rows.find((r) => r.author_id === viewerId)
        : undefined,
    [state.rows, viewerId, isOwner],
  );
  const viewerNote = viewerRow?.body ?? "";
  const viewerNoteUpdatedAt = viewerRow?.updated_at ?? "";

  const leaderNotes: AuthoredNote[] = useMemo(
    () =>
      state.rows
        .filter((r) => isOwner || r.author_id !== viewerId)
        .map((r) => ({
          authorId: r.author_id,
          authorName: state.names[r.author_id] ?? "",
          body: r.body,
          updatedAt: r.updated_at,
        })),
    [state.rows, state.names, viewerId, isOwner],
  );

  return {
    viewerNote,
    viewerNoteUpdatedAt,
    leaderNotes,
    isOwner,
    canEdit: canAnnotate(role) && role !== "owner",
    saveViewerNote,
  };
}
