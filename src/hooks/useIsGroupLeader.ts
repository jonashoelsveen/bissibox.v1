import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Returns true if the current user has at least one group-leader record on any team.
 * We auto-link by email and treat any matching row as access-granting; a dedicated
 * acceptance UI will refine this later.
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

      // Auto-link any pending invites that match this user's email but have no user_id yet,
      // and mark them active. This is the lightweight "accept on sign-in" until we build a
      // dedicated acceptance flow.
      if (email) {
        await supabase
          .from("team_group_leaders")
          .update({ user_id: user.id, status: "active", accepted_at: new Date().toISOString() })
          .is("user_id", null)
          .ilike("email", email);
      }

      const orFilter = email
        ? `user_id.eq.${user.id},email.ilike.${email}`
        : `user_id.eq.${user.id}`;
      const { data } = await supabase
        .from("team_group_leaders")
        .select("id")
        .or(orFilter)
        .limit(1);
      if (!cancelled) setIsLeader((data ?? []).length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isLeader;
}
