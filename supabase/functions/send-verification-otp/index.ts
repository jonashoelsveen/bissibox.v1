// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "Raceline <onboarding@resend.dev>";

interface Body {
  channel: "email" | "sms";
  destination: string; // email or phone
  target_kind: "event_registration" | "team_membership";
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

async function sendEmail(to: string, code: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `Your verification code: ${code}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
        <h1 style="font-size:18px;margin:0 0 16px">Verify it's you</h1>
        <p style="margin:0 0 12px;color:#475569">Enter this 6-digit code to complete your sign up:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:600;margin:24px 0;text-align:center">${code}</p>
        <p style="margin:0;color:#94a3b8;font-size:12px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>`,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend error ${res.status}: ${t}`);
  }
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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Rate limit: max 3 sends per user per 10 minutes
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin
      .from("verification_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      return new Response(JSON.stringify({ error: "Too many requests. Try again in a few minutes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code);
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

    await sendEmail(body.destination, code);
    // Suppress unused warning for LOVABLE_API_KEY (kept for parity / future)
    void LOVABLE_API_KEY;

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
