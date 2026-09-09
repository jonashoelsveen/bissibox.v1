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
    const body = (await req.json()) as Body;
    const token = body?.token?.trim();
    if (!token) return json({ error: "Invalid token" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    /** Entity invite peek — Bucket A: reject public callers until launch. */
    if (!(await entityInviteCallerAllowed(req, admin))) {
      return json({ error: "Invitation not found or already used." }, 404);
    }

    const found = await findInvite(admin, token);
    if (!found) return json({ error: "Invitation not found or already used." }, 404);

    const { data: team } = await admin
      .from("app_teams")
      .select("name")
      .eq("id", found.team_id)
      .maybeSingle();

    const groupNames = await loadGroupNames(admin, found.id, found.role);

    if (found.invited_at) {
      const ageMs = Date.now() - new Date(found.invited_at).getTime();
      if (ageMs > 30 * 24 * 60 * 60 * 1000) {
        return json({ error: "Invitation expired." }, 400);
      }
    }

    return json({
      ok: true,
      team_name: team?.name ?? "Team",
      role: found.role,
      group_names: groupNames,
      invite_email: found.email ?? "",
      status: found.status,
      already_active: found.status === "active",
    });
  } catch (e) {
    console.error("peek-entity-invite error", e);
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
  role: InviteRole;
} | null> {
  const { data: adminRow } = await admin
    .from("app_team_admins")
    .select("id, team_id, email, status, invited_at")
    .eq("invite_token", token)
    .maybeSingle();
  if (adminRow) return { ...adminRow, role: "admin" };

  const { data: memberRow } = await admin
    .from("entity_members")
    .select("id, team_id, email, status, invited_at")
    .eq("invite_token", token)
    .maybeSingle();
  if (memberRow) return { ...memberRow, role: "member" };

  return null;
}

async function loadGroupNames(
  admin: ReturnType<typeof createClient>,
  rosterId: string,
  role: InviteRole,
): Promise<string[]> {
  const linkTable = role === "admin" ? "entity_admin_groups" : "entity_member_groups";
  const rosterColumn = role === "admin" ? "admin_id" : "member_id";

  const { data: links, error } = await admin
    .from(linkTable)
    .select("group_id")
    .eq(rosterColumn, rosterId);

  if (error || !links?.length) return [];

  const groupIds = links.map((l) => l.group_id as string);
  const { data: groups } = await admin
    .from("app_team_groups")
    .select("name")
    .in("id", groupIds);

  return (groups ?? []).map((g) => g.name as string).filter(Boolean);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
