// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LOVABLE_EMAIL_URL = "https://api.lovable.dev/v1/messaging/email/send";
const SENDER_DOMAIN = "notify.dev.aponna.com";
const FROM_EMAIL = `Aponna <noreply@${SENDER_DOMAIN}>`;

interface Body {
  channel: "email" | "sms";
  destination: string; // email or phone
  target_kind: "event_registration" | "team_membership" | "account_signup";
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

async function getOrCreateUnsubscribeToken(admin: ReturnType<typeof createClient>, email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error: existingErr } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingErr) throw existingErr;
  if (existing?.token) return existing.token;

  const token = crypto.randomUUID();
  const { error: insertErr } = await admin
    .from("email_unsubscribe_tokens")
    .insert({ email: normalizedEmail, token });

  if (insertErr) throw insertErr;
  return token;
}

async function sendEmail(to: string, code: string, unsubscribeToken: string) {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const messageId = crypto.randomUUID();
  const text = [
    "Verify it's you",
    "",
    `Enter this 6-digit code to complete verification: ${code}`,
    "",
    "This code expires in 10 minutes. If you didn't request it, you can ignore this email.",
  ].join("\n");
  const payload = {
    to,
    from: FROM_EMAIL,
    sender_domain: SENDER_DOMAIN,
    subject: `Your verification code: ${code}`,
    text,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a;background:#ffffff">
      <h1 style="font-size:18px;margin:0 0 16px">Verify it's you</h1>
      <p style="margin:0 0 12px;color:#475569">Enter this 6-digit code to complete verification:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:600;margin:24px 0;text-align:center">${code}</p>
      <p style="margin:0;color:#94a3b8;font-size:12px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>`,
    purpose: "transactional",
    label: "verification_otp",
    unsubscribe_token: unsubscribeToken,
    message_id: messageId,
    idempotency_key: messageId,
  };

  const res = await fetch(LOVABLE_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": messageId,
    },
    body: JSON.stringify(payload),
  });
  const responseText = await res.text();
  if (!res.ok) {
    console.error("Lovable email error", { status: res.status, body: responseText });
    throw new Error(`Lovable email error ${res.status}: ${responseText}`);
  }
  console.log("Lovable email sent", { status: res.status });
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

    // Prevent abuse: OTPs may only be sent to the signed-in user's own email.
    if ((body.destination ?? "").toLowerCase() !== (user.email ?? "").toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Destination must match your account email" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const unsubscribeToken = await getOrCreateUnsubscribeToken(admin, body.destination);

    // Rate limit: max 5 sends per user per destination+target per 10 minutes
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin
      .from("verification_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("destination", body.destination)
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
        destination: body.destination,
        target_kind: body.target_kind,
        target_id: body.target_id,
        target_meta: body.target_meta ?? {},
        code_hash: codeHash,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    try {
      await sendEmail(body.destination, code, unsubscribeToken);
    } catch (emailErr) {
      await admin.from("verification_attempts").delete().eq("id", insertData.id);
      throw emailErr;
    }

    return new Response(
      JSON.stringify({ ok: true, attempt_id: insertData.id, masked: maskEmail(body.destination) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-verification-otp error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
