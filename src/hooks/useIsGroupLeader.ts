import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Returns true if the current user has at least one active group-leader role on any team.
 * Used to show the Group Meetings icon in the left nav.
 */
export function useIsGroupLeader(): boolean {
  const { user } = useAuth();
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsLeader(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const email = (user.email ?? "").toLowerCase();
      const { data } = await supabase
        .from("team_group_leaders")
        .select("id")
        .eq("status", "active")
        .or(`user_id.eq.${user.id}${email ? `,email.ilike.${email}` : ""}`)
        .limit(1);
      if (!cancelled) setIsLeader((data ?? []).length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isLeader;
}
