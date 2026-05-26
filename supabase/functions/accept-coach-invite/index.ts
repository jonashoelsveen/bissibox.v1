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

    const { data: row, error: rErr } = await admin
      .from("user_coaches")
      .select("id, owner_id, coach_email, status, invited_at")
      .eq("invite_token", body.token)
      .maybeSingle();

    if (rErr) return json({ error: rErr.message }, 500);
    if (!row) return json({ error: "Invitation not found or already used." }, 400);
    if (row.status === "accepted") return json({ error: "Invitation already accepted." }, 400);

    // Verify the signed-in user's email matches the invited email
    const userEmail = (userData.user.email ?? "").toLowerCase();
    if (userEmail !== (row.coach_email ?? "").toLowerCase()) {
      return json({
        error: `This invitation was sent to ${row.coach_email}. Please sign in with that email to accept.`,
      }, 403);
    }

    // Optional 30-day expiry
    if (row.invited_at) {
      const ageMs = Date.now() - new Date(row.invited_at).getTime();
      if (ageMs > 30 * 24 * 60 * 60 * 1000) {
        return json({ error: "Invitation expired." }, 400);
      }
    }

    const { error: upErr } = await admin
      .from("user_coaches")
      .update({
        coach_user_id: userData.user.id,
        status: "accepted",
        accepted_at: new Date().toISOString(),
        invite_token: null,
      })
      .eq("id", row.id);

    if (upErr) return json({ error: upErr.message }, 500);

    // Owner display name for confirmation
    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", row.owner_id)
      .maybeSingle();
    const ownerName =
      [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(" ").trim() ||
      ownerProfile?.email ||
      "your new client";

    return json({ ok: true, owner_id: row.owner_id, owner_name: ownerName });
  } catch (e) {
    console.error("accept-coach-invite error", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
