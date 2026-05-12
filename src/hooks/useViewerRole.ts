import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ViewerRole = "owner" | "leader" | "active_follower" | "follower" | "none";

export interface UseViewerRoleOptions {
  /**
   * "auto" (default) — viewing your own member id resolves to "owner".
   * "leader"        — never resolves to "owner"; asks the DB for the
   *                   leader/follower-side role even when viewing yourself.
   *                   Use this from leader/group-members surfaces so a
   *                   self-leader keeps the leader persona.
   */
  context?: "auto" | "leader";
}

/**
 * Resolves the calling user's relationship to `memberId`.
 */
export function useViewerRole(
  memberId: string | null | undefined,
  options: UseViewerRoleOptions = {},
): ViewerRole {
  const { user } = useAuth();
  const context = options.context ?? "auto";
  const [role, setRole] = useState<ViewerRole>("none");

  useEffect(() => {
    if (!memberId || !user) {
      setRole("none");
      return;
    }
    if (context === "auto" && memberId === user.id) {
      setRole("owner");
      return;
    }
    let cancelled = false;
    void (async () => {
      const rpcName =
        context === "leader"
          ? "get_member_viewer_role_for_leader"
          : "get_member_viewer_role";
      const { data, error } = await supabase.rpc(rpcName, { _member: memberId });
      if (cancelled) return;
      if (error || !data) setRole("none");
      else setRole(data as ViewerRole);
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, user, context]);

  return role;
}

export function canAnnotate(role: ViewerRole): boolean {
  return role === "owner" || role === "leader" || role === "active_follower";
}

export function isOwner(role: ViewerRole): boolean {
  return role === "owner";
}
