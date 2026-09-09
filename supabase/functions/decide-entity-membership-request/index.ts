import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  request_id?: string;
  action?: "accept" | "deny";
  group_id?: string | null;
}

type RpcResult = {
  ok?: boolean;
  error?: string;
  status?: string;
  member_id?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const requestId = body.request_id?.trim();
    const action = body.action;
    const groupId = body.group_id?.trim() || null;

    if (!requestId || (action !== "accept" && action !== "deny")) {
      return json({ ok: false, error: "invalid_request" });
    }

    const { data: requestRow } = await admin
      .from("entity_membership_requests")
      .select("id, team_id, requester_id, status")
      .eq("id", requestId)
      .maybeSingle();

    if (!requestRow || requestRow.status !== "pending") {
      return json({ ok: false, error: "not_found" });
    }

    const { data: isAdmin, error: rpcErr } = await userClient.rpc("is_app_team_admin", {
      p_team_id: requestRow.team_id,
    });
    if (rpcErr) return json({ ok: false, error: rpcErr.message });
    if (!isAdmin) return json({ ok: false, error: "forbidden" });

    if (action === "accept" && groupId) {
      const { data: group } = await admin
        .from("app_team_groups")
        .select("id")
        .eq("id", groupId)
        .eq("team_id", requestRow.team_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!group) return json({ ok: false, error: "invalid_group" });
    }

    // Do not pass p_group_id into the RPC. PostgREST 500s on the 4-arg call
    // (schema cache / uuid default) while the 3-arg accept/deny path succeeds.
    // Group assignment is applied below after the member row exists.
    const { data, error } = await admin.rpc("decide_entity_membership_request", {
      p_request_id: requestId,
      p_actor_id: userData.user.id,
      p_action: action,
    });

    if (error) {
      console.error("decide_entity_membership_request rpc", error.message);
      return json({ ok: false, error: error.message });
    }
    const result = parseRpc(data);
    if (!result?.ok) {
      return json({ ok: false, error: result?.error ?? "failed" });
    }

    if (action === "accept" && groupId) {
      const memberId =
        result.member_id ??
        (await lookupMemberId(admin, requestRow.team_id, requestRow.requester_id));
      if (memberId) {
        const attached = await attachMemberToGroup(
          admin,
          requestRow.team_id,
          memberId,
          groupId,
        );
        if (!attached) {
          console.error("attachMemberToGroup failed", { memberId, groupId });
        }
      }
    }

    return json({ ok: true, status: result.status ?? action, member_id: result.member_id });
  } catch (e) {
    console.error("decide-entity-membership-request error", e);
    return json({ ok: false, error: (e as Error).message ?? "unexpected" });
  }
});

function parseRpc(data: unknown): RpcResult | null {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as RpcResult;
    } catch {
      return null;
    }
  }
  return data as RpcResult;
}

async function lookupMemberId(
  admin: ReturnType<typeof createClient>,
  teamId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("entity_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

async function attachMemberToGroup(
  admin: ReturnType<typeof createClient>,
  teamId: string,
  memberId: string,
  groupId: string,
): Promise<boolean> {
  const { data: group } = await admin
    .from("app_team_groups")
    .select("id")
    .eq("id", groupId)
    .eq("team_id", teamId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!group) return false;

  const { error: updateErr } = await admin
    .from("entity_members")
    .update({ app_group_id: groupId })
    .eq("id", memberId);
  if (updateErr) {
    console.error("entity_members app_group_id", updateErr.message);
    return false;
  }

  const { error: linkErr } = await admin.from("entity_member_groups").upsert(
    { team_id: teamId, member_id: memberId, group_id: groupId },
    { onConflict: "member_id,group_id", ignoreDuplicates: true },
  );
  if (linkErr) {
    console.error("entity_member_groups upsert", linkErr.message);
    return false;
  }
  return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
