import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { FROM_EMAIL } from "../_shared/resend.ts";

interface Body {
  leader_id: string;
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!lovableKey || !resendKey) {
      console.error("Missing LOVABLE_API_KEY or RESEND_API_KEY");
      return json({ error: "Email service not configured" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.leader_id) return json({ error: "leader_id required" }, 400);

    const { data: leader, error: lErr } = await admin
      .from("team_group_leaders")
      .select("id, team_id, name, email, group_name")
      .eq("id", body.leader_id)
      .maybeSingle();
    if (lErr || !leader) return json({ error: "Leader not found" }, 404);
    if (!leader.email || !leader.email.includes("@")) {
      return json({ error: "Invalid email address" }, 400);
    }

    const { data: team } = await admin
      .from("teams")
      .select("id, name, owner_id")
      .eq("id", leader.team_id)
      .maybeSingle();
    if (!team) return json({ error: "Team not found" }, 404);

    // Authorize: team owner OR active board member
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
    if (!isAdmin) return json({ error: "Only admins can invite group leaders" }, 403);

    // Determine inviter display name from profile
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", userData.user.id)
      .maybeSingle();
    const inviterName =
      [inviterProfile?.first_name, inviterProfile?.last_name].filter(Boolean).join(" ").trim() ||
      inviterProfile?.email ||
      userData.user.email ||
      "A team admin";

    const teamName = team.name || "the team";
    const greet = leader.name ? `Hi ${leader.name},` : "Hi,";
    const groupLine = leader.group_name
      ? `<p>You will be the group leader for <strong>${escapeHtml(leader.group_name)}</strong>.</p>`
      : "";

    // Generate a cryptographically random invite token (48 hex chars).
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    // Best-effort app URL for the accept link.
    const appUrl =
      Deno.env.get("APP_URL") ||
      req.headers.get("origin") ||
      "https://raceline.lovable.app";
    const acceptUrl = `${appUrl}/accept-leader-invite?token=${token}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
        <h1 style="font-size: 22px; margin: 0 0 16px;">You've been invited as a group leader</h1>
        <p>${escapeHtml(greet)}</p>
        <p><strong>${escapeHtml(inviterName)}</strong> has invited you to be a <strong>group leader</strong> for <strong>${escapeHtml(teamName)}</strong> on Raceline.</p>
        ${groupLine}
        <p>As a group leader you'll get access to your group's meetings page, notes and files inside the team.</p>
        <p style="margin: 28px 0;">
          <a href="${acceptUrl}"
             style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Accept invitation
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">If you weren't expecting this invitation you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">Raceline · Group leader invitation</p>
      </div>
    `;

    const sendRes = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [leader.email],
        subject: `You've been invited as group leader for ${teamName}`,
        html,
      }),
    });

    const sendBodyText = await sendRes.text();
    let sendBody: unknown;
    try {
      sendBody = JSON.parse(sendBodyText);
    } catch {
      sendBody = sendBodyText;
    }

    if (!sendRes.ok) {
      console.error("Resend send failed", sendRes.status, sendBody);
      return json(
        {
          error: "Could not send invitation email",
          status: sendRes.status,
          details: sendBody,
        },
        502,
      );
    }

    // Mark invited only after successful send
    await admin
      .from("team_group_leaders")
      .update({
        invited_at: new Date().toISOString(),
        status: "pending",
        invited_by: userData.user.id,
        invite_token: token,
      })
      .eq("id", leader.id);

    console.log("Group leader invite sent", { leader_id: leader.id, email: leader.email });
    return json({ ok: true, provider_response: sendBody });
  } catch (e) {
    console.error("group-leader-invite error", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
