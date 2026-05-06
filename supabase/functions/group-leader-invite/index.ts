import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@4.0.0";
import { corsHeaders } from "../_shared/cors.ts";

interface Body {
  leader_id: string;
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
    if (!body?.leader_id) return json({ error: "leader_id required" }, 400);

    // Load leader row + verify the caller is admin (team owner OR active board member).
    const { data: leader, error: lErr } = await admin
      .from("team_group_leaders")
      .select("id, team_id, name, email, group_name")
      .eq("id", body.leader_id)
      .maybeSingle();
    if (lErr || !leader) return json({ error: "Leader not found" }, 404);
    if (!leader.email || !leader.email.includes("@")) return json({ error: "Invalid email" }, 400);

    const { data: team } = await admin
      .from("teams")
      .select("id, name, owner_id")
      .eq("id", leader.team_id)
      .maybeSingle();
    if (!team) return json({ error: "Team not found" }, 404);

    let isAdmin = team.owner_id === userData.user.id;
    if (!isAdmin) {
      const { data: bm } = await admin
        .from("team_board_members")
        .select("id")
        .eq("team_id", leader.team_id)
        .eq("user_id", userData.user.id)
        .eq("status", "active")
        .maybeSingle();
      isAdmin = !!bm;
    }
    if (!isAdmin) return json({ error: "Only admins can invite" }, 403);

    // Mark invited.
    await admin
      .from("team_group_leaders")
      .update({ invited_at: new Date().toISOString(), status: "pending", invited_by: userData.user.id })
      .eq("id", leader.id);

    // Send email.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const resend = new Resend(resendKey);
      const teamName = team.name || "the team";
      const greet = leader.name ? `Hi ${leader.name},` : "Hi,";
      const html = `
        <p>${greet}</p>
        <p>You have been invited to be a <strong>group leader</strong> for <strong>${teamName}</strong>${leader.group_name ? ` (group: ${leader.group_name})` : ""}.</p>
        <p>Sign in to Raceline to accept the invitation. Once accepted, you will see the Group Meetings page in your left menu.</p>
        <p>— Raceline</p>
      `;
      try {
        await resend.emails.send({
          from: "Raceline <onboarding@resend.dev>",
          to: [leader.email],
          subject: `You've been invited as group leader for ${teamName}`,
          html,
        });
      } catch (e) {
        console.error("resend error", e);
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
