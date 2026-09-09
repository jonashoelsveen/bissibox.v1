import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildCookieHeader,
  readCookieFromHeader,
  unsealSession,
} from "@/lib/auth-cookie.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cookie = readCookieFromHeader(request.headers.get("cookie"));
        const sealed = unsealSession(cookie);
        const requestHost = new URL(request.url).host;
        // Clear the session cookie in this response immediately. Remote token
        // revoke is best-effort and must not delay logout (it can hang ~20s).
        if (sealed && process.env.SUPABASE_SERVICE_ROLE_KEY) {
          void supabaseAdmin.auth.admin.signOut(sealed.refresh_token).catch(() => {});
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
