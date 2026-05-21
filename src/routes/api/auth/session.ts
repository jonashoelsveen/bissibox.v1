import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildCookieHeader,
  readCookieFromHeader,
  sealSession,
  unsealSession,
} from "@/lib/auth-cookie.server";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestHost = new URL(request.url).host;
        const cookie = readCookieFromHeader(request.headers.get("cookie"));
        const sealed = unsealSession(cookie);
        if (!sealed) {
          return new Response(JSON.stringify({ user: null }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { data, error } = await supabaseAdmin.auth.refreshSession({
          refresh_token: sealed.refresh_token,
        });
        if (error || !data.session || !data.user) {
          return new Response(JSON.stringify({ user: null, error: error?.message ?? "Invalid session" }), {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": buildCookieHeader("", { clear: true, requestHost }),
            },
          });
        }
        // Rotate the refresh token in the cookie.
        const nextCookie = sealSession({
          refresh_token: data.session.refresh_token,
          user_id: data.user.id,
          issued_at: Date.now(),
        });
        return new Response(
          JSON.stringify({
            user: data.user,
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": buildCookieHeader(nextCookie, { requestHost }),
            },
          },
        );
      },
    },
  },
});
