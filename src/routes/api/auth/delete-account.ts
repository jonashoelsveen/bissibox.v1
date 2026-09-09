import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { buildCookieHeader } from "@/lib/auth-cookie.server";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";
import { deleteAuthenticatedUser } from "@/lib/delete-account.server";
import {
  AccountDeleteConfirmBody,
  sendAccountDeletionOtp,
  verifyAccountDeletionOtp,
} from "@/lib/account-delete-otp.server";

function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function supabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
}

function supabasePublishableKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ""
  );
}

/** Service role lives on the Edge Function, not the web server. */
async function deleteViaEdgeFunction(accessToken: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const url = supabaseUrl();
  const apikey = supabasePublishableKey();
  if (!url || !apikey) {
    return { ok: false, error: "Your account could not be deleted.", status: 500 };
  }

  const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok) {
    const raw = body.error ?? "";
    const leaked = /lovable|service_role|environment variable/i.test(raw);
    return {
      ok: false,
      error: leaked || !raw ? "Your account could not be deleted." : raw,
      status: res.status >= 400 && res.status < 600 ? res.status : 502,
    };
  }
  return { ok: true };
}

export const Route = createFileRoute("/api/auth/delete-account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        let raw: unknown = {};
        try {
          const text = await request.text();
          if (text.trim()) raw = JSON.parse(text);
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        const asRecord = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        if (typeof asRecord.code === "string") {
          let parsed;
          try {
            parsed = AccountDeleteConfirmBody.parse(raw);
          } catch (e) {
            const message =
              e instanceof z.ZodError ? (e.issues[0]?.message ?? "Invalid code") : "Invalid request";
            return json({ error: message }, 400);
          }

          const verified = await verifyAccountDeletionOtp(
            auth.ctx,
            parsed.attempt_id,
            parsed.code,
          );
          if (!verified.ok) {
            return json(
              {
                error: verified.error,
                ...(verified.code ? { code: verified.code } : {}),
                ...(typeof verified.remaining === "number"
                  ? { remaining: verified.remaining }
                  : {}),
              },
              verified.status,
            );
          }

          const userId = auth.ctx.user.id;
          const requestHost = new URL(request.url).host;
          const cleared = {
            "Set-Cookie": buildCookieHeader("", { clear: true, requestHost }),
          };

          try {
            const admin = await getSupabaseAdminOrNull();
            if (admin) {
              await deleteAuthenticatedUser(admin, userId);
              return json({ ok: true }, 200, cleared);
            }

            const viaFn = await deleteViaEdgeFunction(auth.ctx.accessToken);
            if (!viaFn.ok) return json({ error: viaFn.error }, viaFn.status);
            return json({ ok: true }, 200, cleared);
          } catch (err) {
            const leaked = /lovable|service_role|environment variable/i.test(
              err instanceof Error ? err.message : "",
            );
            console.error("[delete-account]", err);
            return json(
              { error: leaked ? "Your account could not be deleted." : "Your account could not be deleted." },
              500,
            );
          }
        }

        const sent = await sendAccountDeletionOtp(auth.ctx);
        if (!sent.ok) return json({ error: sent.error }, sent.status);
        return json({ masked: sent.masked, attempt_id: sent.attempt_id });
      },
    },
  },
});
