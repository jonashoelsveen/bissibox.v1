import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ViewerRole = "owner" | "leader" | "active_follower" | "follower" | "none";

/**
 * Resolves the calling user's relationship to `memberId`.
 *  - "owner": the user is viewing their own diary
 *  - "leader": group leader of a group containing the member
 *  - "active_follower": explicitly granted annotate access
 *  - "follower": view-only
 *  - "none": no access (treated as read-only locally; backend will reject writes)
 */
export function useViewerRole(memberId: string | null | undefined): ViewerRole {
  const { user } = useAuth();
  const [role, setRole] = useState<ViewerRole>("none");

  useEffect(() => {
    if (!memberId || !user) {
      setRole("none");
      return;
    }
    if (memberId === user.id) {
      setRole("owner");
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("get_member_viewer_role", {
        _member: memberId,
      });
      if (cancelled) return;
      if (error || !data) setRole("none");
      else setRole(data as ViewerRole);
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, user]);

  return role;
}

export function canAnnotate(role: ViewerRole): boolean {
  return role === "owner" || role === "leader" || role === "active_follower";
}

export function isOwner(role: ViewerRole): boolean {
  return role === "owner";
}
