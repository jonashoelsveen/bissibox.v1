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
        const cookie = readCookieFromHeader(request.headers.get("cookie"));
        const sealed = unsealSession(cookie);
        if (!sealed) {
          return new Response(
            JSON.stringify({ error: "Not authenticated" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        // Permanently delete the user from auth.users. Postgres cascades
        // (and our app's foreign keys to auth.users) take care of removing
        // every row owned by this user across the public schema.
        const { error } = await supabaseAdmin.auth.admin.deleteUser(
          sealed.user_id,
        );
        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        const requestHost = new URL(request.url).host;
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
