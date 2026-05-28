import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildCookieHeader,
  readCookieFromHeader,
  unsealSession,
} from "@/lib/auth-cookie.server";

export const Route = createFileRoute("/api/auth/delete-account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestHost = new URL(request.url).host;

        let userId: string | null = null;

        // Primary: HTTP-only session cookie (set by login/register/session endpoints).
        const cookie = readCookieFromHeader(request.headers.get("cookie"));
        const sealed = unsealSession(cookie);
        if (sealed) {
          userId = sealed.user_id;
        }

        // Fallback: Bearer token in Authorization header.
        // Used when the cookie was never written (e.g. OTP signup flow where
        // activateSession() sets the Supabase client session but not the cookie).
        if (!userId) {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (token) {
            const { data, error } = await supabaseAdmin.auth.getUser(token);
            if (!error && data.user) {
              userId = data.user.id;
            }
          }
        }

        if (!userId) {
          return new Response(JSON.stringify({ error: "Not authenticated" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildCookieHeader("", { clear: true, requestHost }),
          },
        });
      },
    },
  },
});
