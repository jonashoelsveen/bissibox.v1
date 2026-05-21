import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildCookieHeader, sealSession } from "@/lib/auth-cookie.server";

const Body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { data, error } = await supabaseAdmin.auth.signInWithPassword({
          email: parsed.email,
          password: parsed.password,
        });
        if (error || !data.session || !data.user) {
          return new Response(
            JSON.stringify({ error: error?.message ?? "Invalid email or password" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        const cookie = sealSession({
          refresh_token: data.session.refresh_token,
          user_id: data.user.id,
          issued_at: Date.now(),
        });
        const requestHost = new URL(request.url).host;
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
              "Set-Cookie": buildCookieHeader(cookie, { requestHost }),
            },
          },
        );
      },
    },
  },
});
