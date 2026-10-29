import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { FROM_EMAIL, sendEmail } from "../_shared/resend.ts";

const ACCEPT_URL = "https://bissibox.com/?signin=calendar";
const FLAG_KEY = "calendarTabsFlag";

const BUTTON_STYLE = [
  "display:inline-block",
  "background:#1d1d1f",
  "color:#ffffff",
  "border-radius:980px",
  "padding:14px 36px",
  "font-size:17px",
  "font-weight:500",
  "letter-spacing:-0.01em",
  "text-decoration:none",
  'font-family:-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
].join(";");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!token || !expected || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function betaEmail(): { subject: string; html: string; text: string } {
  const subject = "You are chosen as a beta user";
  const html = `
    <div style="font-family:-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1d1d1f;">
      <p style="font-size:17px;line-height:1.4;">You are chosen as a beta user for the following new features:</p>
      <ul style="font-size:17px;line-height:1.4;padding-left:20px;">
        <li>Create calendars</li>
        <li>Import calendars from web-adresses</li>
      </ul>
      <p style="margin:28px 0;">
        <a href="${ACCEPT_URL}" style="${BUTTON_STYLE}">Accept</a>
      </p>
    </div>`;
  const text = [
    "You are chosen as a beta user for the following new features:",
    "- Create calendars",
    "- Import calendars from web-adresses",
    `Accept: ${ACCEPT_URL}`,
  ].join("\n");
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);

  let body: { flag_key?: unknown; user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const flagKey = typeof body.flag_key === "string" ? body.flag_key : "";
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (flagKey !== FLAG_KEY || !userId) return json({ ok: true, skipped: true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Not configured" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: grant, error: grantError } = await admin
    .from("feature_flag_users")
    .select("invited_at")
    .eq("flag_key", FLAG_KEY)
    .eq("user_id", userId)
    .maybeSingle();
  if (grantError) return json({ error: "Lookup failed" }, 500);
  if (!grant || grant.invited_at) return json({ ok: true, skipped: true });

  const { data: account, error: accountError } = await admin.auth.admin.getUserById(userId);
  const email = account?.user?.email?.trim();
  if (accountError || !email) return json({ error: "Recipient unavailable" }, 500);

  const message = betaEmail();
  try {
    await sendEmail({
      to: email,
      from: FROM_EMAIL,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  } catch (error) {
    console.error(
      "[feature-flag-invite] send failed",
      userId,
      error instanceof Error ? error.message : "error",
    );
    return json({ error: "Send failed" }, 500);
  }

  const { error: stampError } = await admin
    .from("feature_flag_users")
    .update({ invited_at: new Date().toISOString() })
    .eq("flag_key", FLAG_KEY)
    .eq("user_id", userId)
    .is("invited_at", null);
  if (stampError) {
    console.error("[feature-flag-invite] stamp failed", userId, stampError.message);
    return json({ error: "Stamp failed" }, 500);
  }

  return json({ ok: true });
});
