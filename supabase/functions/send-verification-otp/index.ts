// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { FROM_EMAIL, sendEmail } from "../_shared/resend.ts";

async function hashCode(code: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const data = new TextEncoder().encode(`${salt}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${salt}:${hash}`;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Body {
  channel: "email" | "sms";
  destination: string; // email or phone
  target_kind: "event_registration" | "team_membership" | "account_signup" | "account_email_change" | "account_deletion" | "account_password_change";
  target_id: string;
  target_meta?: Record<string, unknown>;
}

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}

function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

async function sendOtpEmail(to: string, code: string, kind: Body["target_kind"]) {
  const deletion = kind === "account_deletion";
  const title = deletion ? "Confirm account deletion" : "Verify it's you";
  const lead = deletion
    ? "Enter this 6-digit code to permanently delete your Bissibox-account:"
    : "Enter this 6-digit code to complete verification:";
  const subject = deletion
    ? `Your Bissibox-account deletion code: ${code}`
    : `Your verification code: ${code}`;
  const text = [
    title,
    "",
    `${lead} ${code}`,
    "",
    "This code expires in 10 minutes. If you didn't request it, you can ignore this email.",
  ].join("\n");
  await sendEmail({
    to,
    from: FROM_EMAIL,
    subject,
    text,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a;background:#ffffff">
      <h1 style="font-size:18px;margin:0 0 16px">${title}</h1>
      <p style="margin:0 0 12px;color:#475569">${lead}</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:600;margin:24px 0;text-align:center">${code}</p>
      <p style="margin:0;color:#94a3b8;font-size:12px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userRes.user;

    const body = (await req.json()) as Body;
    if (!body.channel || !body.destination || !body.target_kind || !body.target_id) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.channel !== "email") {
      return new Response(JSON.stringify({ error: "SMS not enabled yet" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const destination = (body.destination ?? "").trim().toLowerCase();
    const currentEmail = (user.email ?? "").trim().toLowerCase();
    if (body.target_kind === "account_email_change") {
      if (!destination.includes("@")) {
        return new Response(JSON.stringify({ error: "Enter a valid email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (destination === currentEmail) {
        return new Response(JSON.stringify({ error: "That's already your email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (destination !== currentEmail) {
      // Prevent abuse: OTPs may only be sent to the signed-in user's own email,
      // except when confirming a new address for an account email change.
      return new Response(
        JSON.stringify({ error: "Destination must match your account email" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Rate limit: max 5 sends per user per destination+target per 10 minutes
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin
      .from("verification_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("destination", destination)
      .eq("target_kind", body.target_kind)
      .eq("target_id", body.target_id)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: "Too many requests. Try again in a few minutes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = generateCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const { data: insertData, error: insertErr } = await admin
      .from("verification_attempts")
      .insert({
        user_id: user.id,
        channel: body.channel,
        destination,
        target_kind: body.target_kind,
        target_id: body.target_id,
        target_meta: body.target_meta ?? {},
        code_hash: codeHash,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (insertErr) {
      console.error("verification_attempts insert failed", insertErr);
      throw insertErr;
    }

    try {
      await sendOtpEmail(destination, code, body.target_kind);
    } catch (emailErr) {
      await admin.from("verification_attempts").delete().eq("id", insertData.id);
      throw emailErr;
    }

    return new Response(
      JSON.stringify({ ok: true, attempt_id: insertData.id, masked: maskEmail(destination) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-verification-otp error", e);
    return new Response(JSON.stringify({ error: "Could not send verification code" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
