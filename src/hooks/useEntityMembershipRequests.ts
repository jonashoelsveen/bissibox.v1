import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyEntityRosterChanged } from "@/lib/entityRosterSync";

export type EntityMembershipRequest = {
  id: string;
  team_id: string;
  requester_id: string;
  team_name: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  status: "pending" | "denied" | "cancelled";
  decided_at?: string | null;
  deny_expires_at: string | null;
  created_at: string;
};

type DecideResult = { ok: true } | { ok: false; error: string };

export function useEntityMembershipRequests(teamId: string | null) {
  const [requests, setRequests] = useState<EntityMembershipRequest[]>([]);
  const [loading, setLoading] = useState(!!teamId);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!teamId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    const { data, error: qErr } = await supabase
      .from("entity_membership_requests")
      .select(
        "id, team_id, requester_id, team_name, email, first_name, last_name, date_of_birth, status, deny_expires_at, created_at",
      )
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (qErr) {
      setError(qErr.message);
      return;
    }
    setError(null);
    setRequests((data ?? []) as EntityMembershipRequest[]);
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!teamId) return;
    const channel = supabase
      .channel(`entity-membership-requests:${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entity_membership_requests",
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [teamId, load]);

  const decide = useCallback(
    async (
      requestId: string,
      action: "accept" | "deny" | "cancel",
      groupId?: string | null,
    ): Promise<DecideResult> => {
      if (!teamId) return { ok: false, error: "no_team" };
      setBusyIds((prev) => new Set(prev).add(requestId));
      try {
        const { data, error: fnErr } = await supabase.functions.invoke(
          "decide-entity-membership-request",
          {
            body: {
              request_id: requestId,
              action,
              group_id: action === "accept" ? groupId || null : null,
            },
          },
        );
        let body = data as { ok?: boolean; error?: string } | null;
        if (!body && fnErr && "context" in fnErr) {
          try {
            body = (await (fnErr as { context: Response }).context.json()) as {
              ok?: boolean;
              error?: string;
            };
          } catch {
            body = null;
          }
        }
        if (fnErr || !body?.ok) {
          const message = body?.error ?? fnErr?.message ?? "failed";
          setError(message);
          return { ok: false, error: message };
        }
        setError(null);
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (action === "accept") {
          await notifyEntityRosterChanged(supabase, teamId);
        }
        return { ok: true };
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [teamId],
  );

  const pendingCount = useMemo(() => requests.length, [requests]);

  return {
    requests,
    pendingCount,
    loading,
    error,
    busyIds,
    reload: load,
    decide,
  };
}
