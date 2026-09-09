import type { AuthenticatedContext } from "@/lib/account-auth.server";

function maskEmail(email: string) {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}

function publicOtpError(message: string) {
  if (/lovable|resend|api[_ ]?key|not configured/i.test(message)) {
    return "Could not send verification code";
  }
  return message;
}

function supabaseUrl() {
  return (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
}

function supabasePublishableKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ""
  );
}

export async function sendAccountPasswordChangeOtp(
  ctx: AuthenticatedContext,
): Promise<
  | { ok: true; attempt_id: string; masked: string }
  | { ok: false; status: number; error: string }
> {
  const email = (ctx.user.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, status: 400, error: "This account has no email address." };
  }
  const url = supabaseUrl();
  const apikey = supabasePublishableKey();
  if (!url || !apikey || !ctx.accessToken) {
    return { ok: false, status: 503, error: "Could not send verification code" };
  }

  const res = await fetch(`${url}/functions/v1/send-verification-otp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      apikey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: "email",
      destination: email,
      target_kind: "account_password_change",
      target_id: ctx.user.id,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    attempt_id?: string;
    masked?: string;
  };
  if (!res.ok || payload.error || !payload.attempt_id) {
    console.error("[account/password] send OTP failed", res.status, payload.error);
    return {
      ok: false,
      status: res.status >= 400 && res.status < 600 ? res.status : 500,
      error: publicOtpError(payload.error ?? "Could not send verification code"),
    };
  }
  return {
    ok: true,
    attempt_id: payload.attempt_id,
    masked: payload.masked ?? maskEmail(email),
  };
}

export async function verifyAccountPasswordChangeOtp(
  ctx: AuthenticatedContext,
  attemptId: string,
  code: string,
): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string; code?: string; remaining?: number }
> {
  const url = supabaseUrl();
  const apikey = supabasePublishableKey();
  if (!url || !apikey || !ctx.accessToken) {
    return { ok: false, status: 503, error: "Verification failed" };
  }

  const res = await fetch(`${url}/functions/v1/verify-otp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      apikey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ attempt_id: attemptId, code }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    kind?: string;
    code?: string;
    remaining?: number;
  };
  if (!res.ok || payload.error) {
    return {
      ok: false,
      status: res.status >= 400 && res.status < 600 ? res.status : 500,
      error: payload.error ?? "Verification failed",
      ...(payload.code ? { code: payload.code } : {}),
      ...(typeof payload.remaining === "number" ? { remaining: payload.remaining } : {}),
    };
  }
  if (payload.kind && payload.kind !== "account_password_change") {
    return { ok: false, status: 400, error: "Invalid session" };
  }
  return { ok: true };
}
