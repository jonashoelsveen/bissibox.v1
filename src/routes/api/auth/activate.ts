import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildCookieHeader, buildSessionPayload, sealSession } from "@/lib/auth-cookie.server";

const Body = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().optional(),
});

/** Persist an in-memory Supabase session into the HTTP-only aponna_session cookie. */
export const Route = createFileRoute("/api/auth/activate")({
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

        const { data, error } = await supabaseAdmin.auth.getUser(parsed.access_token);
        if (error || !data.user) {
          return new Response(JSON.stringify({ error: "Invalid session" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const cookie = sealSession(
          buildSessionPayload({
            userId: data.user.id,
            refreshToken: parsed.refresh_token,
            accessToken: parsed.access_token,
            expiresAt: parsed.expires_at,
          }),
        );
        const requestHost = new URL(request.url).host;

        return new Response(JSON.stringify({ ok: true, user: data.user }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": buildCookieHeader(cookie, { requestHost }),
          },
        });
      },
    },
  },
});
