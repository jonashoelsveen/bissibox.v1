import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
const CODE_LENGTH = 32;
const RATE_LIMIT_PER_HOUR = 10;

interface Body {
  entity_code?: string;
}

function isEntityCode(value: string): boolean {
  if (value.length !== CODE_LENGTH) return false;
  for (const ch of value) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

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

    const user = userData.user;
    const body = (await req.json().catch(() => ({}))) as Body;
    const entityCode = (body.entity_code ?? "").trim().toLowerCase();

    await admin.from("entity_membership_request_attempts").insert({
      requester_id: user.id,
    });

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("entity_membership_request_attempts")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", user.id)
      .gte("created_at", since);
    if ((count ?? 0) > RATE_LIMIT_PER_HOUR) {
      return json({ ok: false, error: "rate_limited" }, 429);
    }

    if (!isEntityCode(entityCode)) {
      return json({ ok: false, error: "not_found" });
    }

    const { data: team } = await admin
      .from("app_teams")
      .select("id, name, owner_id")
      .eq("entity_code", entityCode)
      .maybeSingle();

    if (!team) return json({ ok: false, error: "not_found" });

    const [{ data: memberRow }, { data: existingReq }] = await Promise.all([
      admin
        .from("entity_members")
        .select("id, status")
        .eq("team_id", team.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("entity_membership_requests")
        .select("id, status")
        .eq("team_id", team.id)
        .eq("requester_id", user.id)
        .maybeSingle(),
    ]);

    if (memberRow?.status === "active") {
      return json({ ok: false, error: "already_member" });
    }
    if (existingReq && existingReq.status !== "cancelled") {
      return json({ ok: false, error: "already_sent" });
    }
    if (existingReq?.status === "cancelled") {
      const { error: clearErr } = await admin
        .from("entity_membership_requests")
        .delete()
        .eq("id", existingReq.id);
      if (clearErr) return json({ ok: false, error: clearErr.message }, 500);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, birth_date, email")
      .eq("id", user.id)
      .maybeSingle();

    const email = (user.email ?? profile?.email ?? "").trim().toLowerCase() || null;
    const { error: insErr, data: created } = await admin
      .from("entity_membership_requests")
      .insert({
        team_id: team.id,
        requester_id: user.id,
        team_name: team.name,
        email,
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        date_of_birth: profile?.birth_date ?? null,
        status: "pending",
      })
      .select("id, team_id, team_name, status, created_at")
      .single();

    if (insErr) {
      if (insErr.code === "23505") return json({ ok: false, error: "already_sent" });
      return json({ ok: false, error: insErr.message }, 500);
    }

    return json({
      ok: true,
      team_name: team.name,
      request: created,
    });
  } catch (e) {
    console.error("request-entity-membership error", e);
    return json({ ok: false, error: (e as Error).message ?? "unexpected" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
