import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type AccessLevel = "view" | "edit";

export interface CoachAccess {
  calendarAccess: AccessLevel;
  diaryAccess: AccessLevel;
  photosAccess: AccessLevel;
}

/**
 * Resolves the calling user's coach-access record for `ownerId`.
 *
 * Returns `null` when the current user is not an accepted coach for that
 * owner (or while loading). Returns the access levels (`view` / `edit`)
 * stored in `user_coaches` otherwise.
 */
export function useCoachAccess(ownerId: string | null | undefined): CoachAccess | null {
  const { user } = useAuth();
  const [access, setAccess] = useState<CoachAccess | null>(null);

  useEffect(() => {
    if (!user || !ownerId || ownerId === user.id) {
      setAccess(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("user_coaches")
        .select("calendar_access, diary_access, photos_access, status")
        .eq("owner_id", ownerId)
        .eq("coach_user_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setAccess(null);
        return;
      }
      setAccess({
        calendarAccess: (data.calendar_access as AccessLevel) ?? "view",
        diaryAccess: (data.diary_access as AccessLevel) ?? "view",
        photosAccess: (data.photos_access as AccessLevel) ?? "view",
      });
    };

    void load();

    const ch = supabase
      .channel(`user_coaches:${ownerId}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_coaches",
        },
        (payload) => {
          const newRow = (payload.new ?? {}) as {
            owner_id?: string;
            coach_user_id?: string;
          };
          const oldRow = (payload.old ?? {}) as {
            owner_id?: string;
            coach_user_id?: string;
          };
          const matches =
            (newRow.owner_id === ownerId && newRow.coach_user_id === user.id) ||
            (oldRow.owner_id === ownerId && oldRow.coach_user_id === user.id);
          if (matches) void load();
        },
      )
      .subscribe();

    const onFocus = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => void load(), 15000);

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
  }, [user, ownerId]);

  return access;
}
