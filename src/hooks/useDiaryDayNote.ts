/**
 * Diary day notes backed by Supabase (`diary_day_notes`).
 *
 * Notes are split by `kind`:
 *  - 'member' — authored by the member themselves (gray icon)
 *  - 'leader' — authored by a group leader / active follower (black icon)
 *
 * A user who is BOTH the member and a leader of their own group can have
 * one row of each kind for the same day.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { canAnnotate, type ViewerRole } from "./useViewerRole";

const CHANGE_EVENT = "diary-daynote-changed-v2";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface AuthoredNote {
  authorId: string;
  authorName: string;
  body: string;
  updatedAt: string;
}

interface Row {
  author_id: string;
  body: string;
  kind: "member" | "leader";
  updated_at: string;
}

interface State {
  rows: Row[];
  names: Record<string, string>;
  loading: boolean;
}

function fmtName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!p) return "";
  return (p.first_name ?? "").trim();
}

export function useDiaryDayNote(memberId: string, date: Date, role: ViewerRole) {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const [state, setState] = useState<State>({ rows: [], names: {}, loading: true });

  const reload = useCallback(async () => {
    if (!memberId) return;
    const { data } = await supabase
      .from("diary_day_notes")
      .select("author_id,body,kind,updated_at")
      .eq("member_id", memberId)
      .eq("day", dayKey(date));
    const rows = (data ?? []) as Row[];

    const names: Record<string, string> = {};
    const otherIds = Array.from(
      new Set(rows.filter((r) => r.kind === "leader").map((r) => r.author_id)),
    );
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .in("id", otherIds);
      for (const p of profs ?? []) names[p.id] = fmtName(p);
    }
    setState({ rows, names, loading: false });
  }, [memberId, date]);

  useEffect(() => {
    void reload();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { memberId?: string; day?: string } | undefined;
      if (detail?.memberId === memberId && detail?.day === dayKey(date)) void reload();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [reload, memberId, date]);

  const isOwner = role === "owner";
  const viewerKind: "member" | "leader" = isOwner ? "member" : "leader";

  const saveViewerNote = useCallback(
    async (text: string) => {
      if (!viewerId) return;
      if (!canAnnotate(role)) return;
      const trimmed = text.trim();
      if (!trimmed) {
        await supabase
          .from("diary_day_notes")
          .delete()
          .eq("member_id", memberId)
          .eq("author_id", viewerId)
          .eq("day", dayKey(date))
          .eq("kind", viewerKind);
      } else {
        await supabase.from("diary_day_notes").upsert(
          {
            member_id: memberId,
            author_id: viewerId,
            day: dayKey(date),
            body: text,
            kind: viewerKind,
          },
          { onConflict: "member_id,author_id,day,kind" },
        );
      }
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: { memberId, day: dayKey(date) } }),
      );
    },
    [memberId, date, viewerId, role, viewerKind],
  );

  /** The member's own (gray) note row. */
  const memberRow = useMemo(
    () => state.rows.find((r) => r.kind === "member" && r.author_id === memberId),
    [state.rows, memberId],
  );
  const memberNote = memberRow?.body ?? "";
  const memberNoteUpdatedAt = memberRow?.updated_at ?? "";

  /** The current viewer's leader-note (only meaningful for non-owners). */
  const viewerRow = useMemo(
    () =>
      !isOwner && viewerId
        ? state.rows.find((r) => r.kind === "leader" && r.author_id === viewerId)
        : undefined,
    [state.rows, viewerId, isOwner],
  );
  const viewerNote = viewerRow?.body ?? "";
  const viewerNoteUpdatedAt = viewerRow?.updated_at ?? "";

  const leaderNotes: AuthoredNote[] = useMemo(
    () =>
      state.rows
        .filter((r) => r.kind === "leader" && (isOwner || r.author_id !== viewerId))
        .map((r) => ({
          authorId: r.author_id,
          authorName: state.names[r.author_id] ?? "",
          body: r.body,
          updatedAt: r.updated_at,
        })),
    [state.rows, state.names, viewerId, isOwner],
  );

  return {
    memberNote,
    memberNoteUpdatedAt,
    viewerNote,
    viewerNoteUpdatedAt,
    leaderNotes,
    isOwner,
    canEdit: canAnnotate(role),
    loading: state.loading,
    saveViewerNote,
  };
}
