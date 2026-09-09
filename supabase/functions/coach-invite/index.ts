import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { FROM_EMAIL } from "../_shared/resend.ts";

interface Body {
  coach_email: string;
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
    const email = (body?.coach_email ?? "").trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return json({ error: "Invalid email address" }, 400);
    }
    if (email === (userData.user.email ?? "").toLowerCase()) {
      return json({ error: "You cannot invite yourself." }, 400);
    }

    // Generate token
    const tokenBytes = new Uint8Array(24);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    // Upsert pending row (owner_id + lower(email) unique). Reset token + invited_at.
    // If existing accepted row, reject.
    const { data: existing } = await admin
      .from("user_coaches")
      .select("id, status")
      .eq("owner_id", userData.user.id)
      .ilike("coach_email", email)
      .maybeSingle();

    if (existing && existing.status === "accepted") {
      return json({ error: "This coach is already connected." }, 400);
    }

    if (existing) {
      const { error: upErr } = await admin
        .from("user_coaches")
        .update({
          invite_token: token,
          invited_at: new Date().toISOString(),
          status: "pending",
        })
        .eq("id", existing.id);
      if (upErr) return json({ error: upErr.message }, 500);
    } else {
      const { error: insErr } = await admin.from("user_coaches").insert({
        owner_id: userData.user.id,
        coach_email: email,
        status: "pending",
        invite_token: token,
        invited_at: new Date().toISOString(),
      });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    // Inviter display name
    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", userData.user.id)
      .maybeSingle();
    const inviterName =
      [inviterProfile?.first_name, inviterProfile?.last_name].filter(Boolean).join(" ").trim() ||
      inviterProfile?.email ||
      userData.user.email ||
      "An athlete";

    const appUrl =
      Deno.env.get("APP_URL") ||
      req.headers.get("origin") ||
      "https://aponna.com";
    const acceptUrl = `${appUrl}/accept-coach-invite?token=${token}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
        <h1 style="font-size: 22px; margin: 0 0 16px;">You've been invited as a coach</h1>
        <p><strong>${escapeHtml(inviterName)}</strong> has invited you to be their coach on Aponna.</p>
        <p>Accepting will connect you with them so you can view (and optionally edit) their calendar, diary and photos according to the access level they grant.</p>
        <p style="margin: 28px 0;">
          <a href="${acceptUrl}"
             style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
            Accept invitation
          </a>
        </p>
        <p style="font-size: 13px; color: #666;">If you weren't expecting this invitation you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="font-size: 12px; color: #999;">Aponna · Coach invitation</p>
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
        to: [email],
        reply_to: inviterProfile?.email || userData.user.email || undefined,
        subject: `${inviterName} invited you to coach them on Aponna`,
        html,
      }),
    });

    const sendBodyText = await sendRes.text();
    let sendBody: unknown;
    try { sendBody = JSON.parse(sendBodyText); } catch { sendBody = sendBodyText; }

    if (!sendRes.ok) {
      console.error("Resend send failed", sendRes.status, sendBody);
      return json({ error: "Could not send invitation email", details: sendBody }, 502);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("coach-invite error", e);
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
