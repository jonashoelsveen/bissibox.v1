import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { entityInviteCallerAllowed } from "../_shared/entity-flag.ts";

interface Body {
  token: string;
}

type InviteRole = "admin" | "member";

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

    /** Entity invite accept — Bucket A: reject public callers until launch. */
    if (!(await entityInviteCallerAllowed(req, admin))) {
      return json({ error: "Invitation not found or already used." }, 404);
    }

    const body = (await req.json()) as Body;
    const token = body?.token?.trim();
    if (!token) return json({ error: "Invalid token" }, 400);

    const found = await findInvite(admin, token);
    if (!found) return json({ error: "Invitation not found or already used." }, 404);

    if (found.status === "active" && found.user_id === userData.user.id) {
      const { data: team } = await admin
        .from("app_teams")
        .select("name")
        .eq("id", found.team_id)
        .maybeSingle();
      return json({
        ok: true,
        team_id: found.team_id,
        team_name: team?.name ?? "Team",
        role: found.role,
        already_active: true,
      });
    }

    if (found.status === "active") {
      return json({ error: "Invitation already accepted." }, 400);
    }

    const userEmail = (userData.user.email ?? "").toLowerCase();
    if (userEmail !== (found.email ?? "").toLowerCase()) {
      return json({
        error: `This invitation was sent to ${found.email}. Please sign in with that email to accept.`,
      }, 403);
    }

    if (found.invited_at) {
      const ageMs = Date.now() - new Date(found.invited_at).getTime();
      if (ageMs > 30 * 24 * 60 * 60 * 1000) {
        return json({ error: "Invitation expired." }, 400);
      }
    }

    const table = found.role === "admin" ? "app_team_admins" : "entity_members";
    const { error: upErr } = await admin
      .from(table)
      .update({
        user_id: userData.user.id,
        status: "active",
        invite_token: null,
      })
      .eq("id", found.id);

    if (upErr) return json({ error: upErr.message }, 500);

    const { data: team } = await admin
      .from("app_teams")
      .select("name")
      .eq("id", found.team_id)
      .maybeSingle();

    return json({
      ok: true,
      team_id: found.team_id,
      team_name: team?.name ?? "Team",
      role: found.role,
    });
  } catch (e) {
    console.error("accept-entity-invite error", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

async function findInvite(
  admin: ReturnType<typeof createClient>,
  token: string,
): Promise<{
  id: string;
  team_id: string;
  email: string | null;
  status: string;
  invited_at: string | null;
  user_id: string | null;
  role: InviteRole;
} | null> {
  const { data: adminRow } = await admin
    .from("app_team_admins")
    .select("id, team_id, email, status, invited_at, user_id")
    .eq("invite_token", token)
    .maybeSingle();
  if (adminRow) return { ...adminRow, role: "admin" };

  const { data: memberRow } = await admin
    .from("entity_members")
    .select("id, team_id, email, status, invited_at, user_id")
    .eq("invite_token", token)
    .maybeSingle();
  if (memberRow) return { ...memberRow, role: "member" };

  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
