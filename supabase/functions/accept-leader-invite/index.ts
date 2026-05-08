import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  token: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.token || typeof body.token !== "string") {
      return json({ error: "Invalid token" }, 400);
    }

    const { data: leader, error: lErr } = await admin
      .from("team_group_leaders")
      .select("id, team_id, group_name, status, accepted_at, invited_at")
      .eq("invite_token", body.token)
      .maybeSingle();

    if (lErr) return json({ error: lErr.message }, 500);
    if (!leader) return json({ error: "Invitation not found or already used." }, 400);
    if (leader.accepted_at) return json({ error: "Invitation already accepted." }, 400);
    if (leader.status !== "pending") return json({ error: "Invitation is no longer valid." }, 400);

    if (leader.invited_at) {
      const ageMs = Date.now() - new Date(leader.invited_at).getTime();
      if (ageMs > 30 * 24 * 60 * 60 * 1000) {
        return json({ error: "Invitation expired." }, 400);
      }
    }

    const { error: upErr } = await admin
      .from("team_group_leaders")
      .update({
        user_id: userData.user.id,
        status: "active",
        accepted_at: new Date().toISOString(),
        invite_token: null,
      })
      .eq("id", leader.id);

    if (upErr) return json({ error: upErr.message }, 500);

    const { data: team } = await admin
      .from("teams")
      .select("id, name")
      .eq("id", leader.team_id)
      .maybeSingle();

    return json({
      ok: true,
      team_id: leader.team_id,
      team_name: team?.name ?? "",
      group_name: leader.group_name ?? "",
    });
  } catch (e) {
    console.error("accept-leader-invite error", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
