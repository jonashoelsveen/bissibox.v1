import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { FROM_EMAIL, sendEmail } from "../_shared/resend.ts";

type InviteRole = "admin" | "athlete" | "coach" | "member";

interface Body {
  team_id: string;
  email: string;
  role: InviteRole;
}

const TABLE: Record<InviteRole, string> = {
  admin: "app_team_admins",
  athlete: "app_team_athletes",
  coach: "app_team_coaches",
  member: "entity_members",
};

const ROLE_LABEL: Record<InviteRole, string> = {
  admin: "administrator",
  athlete: "athlete",
  coach: "coach",
  member: "member",
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    const teamId = body?.team_id?.trim();
    const email = (body?.email ?? "").trim().toLowerCase();
    const role = body?.role;

    if (!teamId || !email || !role || !TABLE[role]) {
      return json({ error: "Invalid request" }, 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json({ error: "Invalid email address" }, 400);
    }
    if (email === (userData.user.email ?? "").toLowerCase()) {
      return json({ error: "You cannot invite yourself." }, 400);
    }

    const { data: team } = await admin
      .from("app_teams")
      .select("id, name, owner_id")
      .eq("id", teamId)
      .maybeSingle();

    if (!team) return json({ error: "Team not found" }, 404);

    const { data: isAdmin, error: rpcErr } = await userClient.rpc("is_app_team_admin", {
      p_team_id: teamId,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 500);
    if (!isAdmin && team.owner_id !== userData.user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const table = TABLE[role];
    const { data: existing } = await admin
      .from(table)
      .select("id, status")
      .eq("team_id", teamId)
      .ilike("email", email)
      .maybeSingle();

    if (existing?.status === "active") {
      return json({ error: "This person is already on the team." }, 400);
    }

    if (existing) {
      const { error: upErr } = await admin
        .from(table)
        .update({
          invite_token: token,
          invited_at: new Date().toISOString(),
          status: "pending",
        })
        .eq("id", existing.id);
      if (upErr) return json({ error: upErr.message }, 500);
    } else {
      const { error: insErr } = await admin.from(table).insert({
        team_id: teamId,
        email,
        status: "pending",
        invite_token: token,
        invited_at: new Date().toISOString(),
      });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", userData.user.id)
      .maybeSingle();
    const inviterName =
      [inviterProfile?.first_name, inviterProfile?.last_name].filter(Boolean).join(" ").trim() ||
      inviterProfile?.email ||
      userData.user.email ||
      "A team administrator";

    const cloudUrl =
      Deno.env.get("CLOUD_URL") ||
      Deno.env.get("APP_URL") ||
      req.headers.get("origin") ||
      "https://bissiboxcloud.com";
    const acceptUrl = `${cloudUrl.replace(/\/$/, "")}/accept-entity-invite?token=${token}`;

    const teamName = escapeHtml(team.name);
    const roleLabel = ROLE_LABEL[role];
    const subject = `You've been invited to join ${team.name}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
        <h1 style="font-size: 22px; margin: 0 0 16px;">You've been invited</h1>
        <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join <strong>${teamName}</strong> as a ${roleLabel}.</p>
        <p>Sign in or create an account to accept the invitation.</p>
        <p style="margin: 28px 0;">
          <a href="${acceptUrl}"
             style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Accept invitation
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">If you weren't expecting this invitation you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">Bissibox Cloud · Team invitation</p>
      </div>
    `;

    await sendEmail({
      to: email,
      from: FROM_EMAIL,
      subject,
      html,
      text: `${inviterName} has invited you to join ${team.name} as a ${roleLabel}. Accept: ${acceptUrl}`,
    });

    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
