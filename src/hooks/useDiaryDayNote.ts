/**
 * Diary day notes backed by Supabase (`diary_day_notes`).
 *
 * Returns:
 *  - memberNote: text written by the member who owns the diary
 *  - viewerNote: text written by the current user (only relevant when
 *                viewer is not the member)
 *  - canEdit:    true iff the current user is allowed to write notes for this member
 *  - saveViewerNote: persists the current user's note for the day
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { canAnnotate, type ViewerRole } from "./useViewerRole";

const CHANGE_EVENT = "diary-daynote-changed-v2";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface State {
  memberNote: string;
  viewerNote: string;
  loading: boolean;
}

export function useDiaryDayNote(memberId: string, date: Date, role: ViewerRole) {
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const [state, setState] = useState<State>({
    memberNote: "",
    viewerNote: "",
    loading: true,
  });

  const reload = useCallback(async () => {
    if (!memberId) return;
    const { data } = await supabase
      .from("diary_day_notes")
      .select("author_id,body")
      .eq("member_id", memberId)
      .eq("day", dayKey(date));
    const rows = (data ?? []) as { author_id: string; body: string }[];
    const member = rows.find((r) => r.author_id === memberId)?.body ?? "";
    const viewer =
      viewerId && viewerId !== memberId
        ? rows.find((r) => r.author_id === viewerId)?.body ?? ""
        : "";
    setState({ memberNote: member, viewerNote: viewer, loading: false });
  }, [memberId, date, viewerId]);

  useEffect(() => {
    void reload();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { memberId?: string; day?: string }
        | undefined;
      if (detail?.memberId === memberId && detail?.day === dayKey(date)) {
        void reload();
      }
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [reload, memberId, date]);

  const saveViewerNote = useCallback(
    async (text: string) => {
      if (!viewerId) return;
      if (!canAnnotate(role)) return;
      // For owner: viewer == member, so this writes the member note.
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
        new CustomEvent(CHANGE_EVENT, {
          detail: { memberId, day: dayKey(date) },
        }),
      );
    },
    [memberId, date, viewerId, role],
  );

  const isOwner = role === "owner";
  const memberNote = isOwner ? state.viewerNote || state.memberNote : state.memberNote;
  const viewerNote = isOwner ? "" : state.viewerNote;

  return {
    memberNote,
    viewerNote,
    canEdit: canAnnotate(role),
    isOwner,
    loading: state.loading,
    saveViewerNote,
  };
}
