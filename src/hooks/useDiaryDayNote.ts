/**
 * Diary day notes backed by Supabase (`diary_day_notes`).
 *
 * Returns per-author rows so the UI can render the member's note plus any
 * number of leader / active-follower notes side-by-side.
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
}

interface State {
  rows: { author_id: string; body: string }[];
  names: Record<string, string>;
  loading: boolean;
}

function fmtName(p: { first_name: string | null; last_name: string | null } | undefined): string {
  if (!p) return "";
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
}

export function useDiaryDayNote(memberId: string, date: Date, role: ViewerRole) {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const [state, setState] = useState<State>({ rows: [], names: {}, loading: true });

  const reload = useCallback(async () => {
    if (!memberId) return;
    const { data } = await supabase
      .from("diary_day_notes")
      .select("author_id,body")
      .eq("member_id", memberId)
      .eq("day", dayKey(date));
    const rows = (data ?? []) as { author_id: string; body: string }[];

    const names: Record<string, string> = {};
    const otherIds = rows.map((r) => r.author_id).filter((id) => id !== memberId);
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
          .eq("day", dayKey(date));
      } else {
        await supabase.from("diary_day_notes").upsert(
          {
            member_id: memberId,
            author_id: viewerId,
            day: dayKey(date),
            body: text,
          },
          { onConflict: "member_id,author_id,day" },
        );
      }
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: { memberId, day: dayKey(date) } }),
      );
    },
    [memberId, date, viewerId, role],
  );

  const isOwner = role === "owner";

  const memberNote = useMemo(
    () => state.rows.find((r) => r.author_id === memberId)?.body ?? "",
    [state.rows, memberId],
  );

  const viewerNote = useMemo(
    () =>
      !isOwner && viewerId
        ? state.rows.find((r) => r.author_id === viewerId)?.body ?? ""
        : "",
    [state.rows, viewerId, isOwner],
  );

  /** All leader/follower-authored notes that are NOT the current viewer's note. */
  const leaderNotes: AuthoredNote[] = useMemo(
    () =>
      state.rows
        .filter((r) => r.author_id !== memberId && r.author_id !== viewerId)
        .map((r) => ({
          authorId: r.author_id,
          authorName: state.names[r.author_id] ?? "",
          body: r.body,
        })),
    [state.rows, state.names, memberId, viewerId],
  );

  return {
    memberNote,
    viewerNote,
    leaderNotes,
    isOwner,
    canEdit: canAnnotate(role),
    loading: state.loading,
    saveViewerNote,
  };
}
