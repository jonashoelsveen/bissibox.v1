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
        if (sealed) {
          try {
            await supabaseAdmin.auth.admin.signOut(sealed.refresh_token);
          } catch {
            /* ignore — clearing the cookie is what matters */
          }
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildCookieHeader("", { clear: true }),
          },
        });
      },
    },
  },
});
