import { z } from "zod";
import { createUserSupabaseClient, type AuthenticatedContext } from "@/lib/account-auth.server";
import {
  EMAIL_CHANGE_COOKIE_NAME,
  buildCookieHeader,
  sealEmailChangeChallenge,
  unsealEmailChangeChallenge,
  type EmailChangeChallenge,
} from "@/lib/auth-cookie.server";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";

export const AccountEmailSendBody = z
  .object({
    email: z.string().trim().email().max(320),
  })
  .strict();

export const AccountEmailVerifyBody = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    attempt_id: z.string().uuid().optional(),
  })
  .strict();

function maskEmail(email: string) {
  const [u, d] = email.split("@");
  if (!u || !d) return email;
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}

export function emailChangeSetCookie(
  challenge: EmailChangeChallenge | null,
  requestHost: string,
) {
  if (!challenge) {
    return buildCookieHeader("", {
      name: EMAIL_CHANGE_COOKIE_NAME,
      clear: true,
      requestHost,
    });
  }
  return buildCookieHeader(sealEmailChangeChallenge(challenge), {
    name: EMAIL_CHANGE_COOKIE_NAME,
    maxAge: 10 * 60,
    requestHost,
  });
}

function publicOtpError(message: string) {
  if (/lovable|resend|api[_ ]?key|not configured/i.test(message)) {
    return "Could not send verification code";
  }
  return message;
}

async function sendEmailChangeOtp(
  ctx: AuthenticatedContext,
  email: string,
): Promise<
  | { ok: true; attempt_id: string; masked: string }
  | { ok: false; status: number; error: string }
> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey || !ctx.accessToken) {
    return { ok: false, status: 503, error: "Could not send verification code" };
  }

  const res = await fetch(`${url}/functions/v1/send-verification-otp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: "email",
      destination: email,
      target_kind: "account_email_change",
      target_id: ctx.user.id,
      target_meta: { new_email: email },
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    attempt_id?: string;
    masked?: string;
  };
  if (!res.ok || payload.error || !payload.attempt_id) {
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

async function verifyOtpViaSignupPath(
  ctx: AuthenticatedContext,
  attemptId: string,
  code: string,
): Promise<
  | { ok: true; email?: string; kind?: string }
  | { ok: false; status: number; error: string; code?: string; remaining?: number }
> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey || !ctx.accessToken) {
    return { ok: false, status: 503, error: "Verification failed" };
  }

  const res = await fetch(`${url}/functions/v1/verify-otp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ attempt_id: attemptId, code }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    email?: string;
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
  return { ok: true, email: payload.email, kind: payload.kind };
}

const EMAIL_TAKEN_MESSAGE = "Email is already registered. Please use another email.";

function escapeIlikeExact(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isEmailTakenAuthError(err: { message?: string; code?: string }) {
  const code = (err.code ?? "").toLowerCase();
  const message = (err.message ?? "").toLowerCase();
  return (
    code === "email_exists" ||
    message.includes("already been registered") ||
    message.includes("already registered") ||
    message.includes("email address is already")
  );
}

function rpcSaysTaken(data: unknown) {
  return data === true || data === "true" || data === "t";
}

async function emailAlreadyRegistered(
  ctx: AuthenticatedContext,
  email: string,
): Promise<{ ok: true; taken: boolean } | { ok: false }> {
  const tryRpc = async (
    client: Awaited<ReturnType<typeof createUserSupabaseClient>>,
  ): Promise<boolean | null> => {
    const { data, error } = await client.rpc("email_registered_to_other_user", {
      p_email: email,
      p_except_user_id: ctx.user.id,
    });
    if (error) {
      console.error("[account/email] registered-email rpc failed:", error.message);
      return null;
    }
    return rpcSaysTaken(data);
  };

  const admin = await getSupabaseAdminOrNull();
  if (admin) {
    const fromAdmin = await tryRpc(admin);
    if (fromAdmin !== null) return { ok: true, taken: fromAdmin };
  }

  const userClient = await createUserSupabaseClient(ctx.accessToken);
  const fromUser = await tryRpc(userClient);
  if (fromUser !== null) return { ok: true, taken: fromUser };

  if (!admin) return { ok: false };

  const { data: profiles, error: profileErr } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", escapeIlikeExact(email))
    .limit(20);
  if (profileErr) {
    console.error("[account/email] profiles email lookup failed:", profileErr.message);
    return { ok: false };
  }
  if ((profiles ?? []).some((row) => row.id !== ctx.user.id)) {
    return { ok: true, taken: true };
  }

  const perPage = 50;
  for (let page = 1; page <= 40; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage });
    if (listed.error) {
      console.error("[account/email] auth user list failed:", listed.error.message);
      return { ok: false };
    }
    const users = listed.data.users ?? [];
    if (
      users.some(
        (user) => (user.email ?? "").trim().toLowerCase() === email && user.id !== ctx.user.id,
      )
    ) {
      return { ok: true, taken: true };
    }
    if (users.length < perPage) return { ok: true, taken: false };
  }

  return { ok: false };
}

export async function startAccountEmailChange(
  ctx: AuthenticatedContext,
  newEmail: string,
): Promise<
  | { ok: true; masked: string; challenge: EmailChangeChallenge }
  | { ok: false; status: number; error: string; code?: "email_taken" }
> {
  const email = newEmail.trim().toLowerCase();
  const current = (ctx.user.email ?? "").trim().toLowerCase();
  if (!current) return { ok: false, status: 400, error: "Account email is missing" };
  if (email === current) {
    return { ok: false, status: 400, error: "That's already your email" };
  }
  const taken = await emailAlreadyRegistered(ctx, email);
  if (!taken.ok) {
    return { ok: false, status: 503, error: "Could not verify email" };
  }
  if (taken.taken) {
    return { ok: false, status: 409, error: EMAIL_TAKEN_MESSAGE, code: "email_taken" };
  }

  const sent = await sendEmailChangeOtp(ctx, email);
  if (!sent.ok) {
    console.error("[account/email] send failed:", sent.error);
    return { ok: false, status: sent.status, error: publicOtpError(sent.error) };
  }

  return {
    ok: true,
    masked: sent.masked,
    challenge: {
      purpose: "email_change",
      user_id: ctx.user.id,
      email,
      attempt_id: sent.attempt_id,
      exp: Date.now() + 10 * 60 * 1000,
    },
  };
}

export async function confirmAccountEmailChange(
  ctx: AuthenticatedContext,
  challenge: EmailChangeChallenge | null,
  code: string,
  attemptIdFromClient?: string,
): Promise<
  | { ok: true; challenge: null }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      remaining?: number;
      challenge: EmailChangeChallenge | null;
    }
> {
  const attemptId = attemptIdFromClient || challenge?.attempt_id;
  if (!attemptId) {
    return { ok: false, status: 400, error: "Invalid session", challenge: null };
  }
  if (challenge && challenge.user_id !== ctx.user.id) {
    return { ok: false, status: 400, error: "Invalid session", challenge: null };
  }

  const verified = await verifyOtpViaSignupPath(ctx, attemptId, code);
  if (!verified.ok) {
    return {
      ok: false,
      status: verified.status,
      error: verified.error,
      ...(verified.code ? { code: verified.code } : {}),
      ...(typeof verified.remaining === "number" ? { remaining: verified.remaining } : {}),
      challenge: verified.status === 429 ? null : challenge,
    };
  }

  const newEmail = (verified.email ?? challenge?.email ?? "").trim().toLowerCase();
  if (verified.email) {
    return { ok: true, challenge: null };
  }
  if (!newEmail) {
    return { ok: false, status: 400, error: "Invalid session", challenge: null };
  }

  const taken = await emailAlreadyRegistered(ctx, newEmail);
  if (!taken.ok) {
    return { ok: false, status: 503, error: "Could not verify email", challenge };
  }
  if (taken.taken) {
    return {
      ok: false,
      status: 409,
      error: EMAIL_TAKEN_MESSAGE,
      code: "email_taken",
      challenge: null,
    };
  }

  const admin = await getSupabaseAdminOrNull();
  if (!admin) {
    return { ok: false, status: 503, error: "Email change is unavailable", challenge };
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(ctx.user.id, {
    email: newEmail,
    email_confirm: true,
  });
  if (authErr) {
    console.error("[account/email] auth update failed:", authErr);
    if (isEmailTakenAuthError(authErr)) {
      return {
        ok: false,
        status: 409,
        error: EMAIL_TAKEN_MESSAGE,
        code: "email_taken",
        challenge: null,
      };
    }
    return {
      ok: false,
      status: 400,
      error: authErr.message ?? "Could not update email",
      challenge,
    };
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ email: newEmail })
    .eq("id", ctx.user.id);
  if (profileErr) {
    console.error("[account/email] profile update failed:", profileErr);
  }

  return { ok: true, challenge: null };
}
