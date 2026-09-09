import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseServerAuth } from "@/lib/supabase-server-auth";
import {
  buildCookieHeader,
  buildSessionPayload,
  cookieAccessTokenIsFresh,
  readCookieFromHeader,
  sealSession,
  unsealSession,
} from "@/lib/auth-cookie.server";

const SyncBody = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().optional(),
});

function sessionJson(
  user: unknown,
  tokens: { access_token: string; refresh_token: string; expires_at?: number },
) {
  return {
    user,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
  };
}

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

        // Reuse a still-valid access token. refreshSession() rotates the
        // refresh token and signs other tabs (Cloud) out.
        if (sealed.access_token && cookieAccessTokenIsFresh(sealed)) {
          const { data, error } = await supabaseServerAuth.auth.getUser(
            sealed.access_token,
          );
          if (!error && data.user) {
            return new Response(
              JSON.stringify(
                sessionJson(data.user, {
                  access_token: sealed.access_token,
                  refresh_token: sealed.refresh_token,
                  expires_at: sealed.expires_at,
                }),
              ),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
        }

        const { data, error } = await supabaseServerAuth.auth.refreshSession({
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
        const nextCookie = sealSession(
          buildSessionPayload({
            userId: data.user.id,
            refreshToken: data.session.refresh_token,
            accessToken: data.session.access_token,
            expiresAt: data.session.expires_at,
          }),
        );
        return new Response(
          JSON.stringify(
            sessionJson(data.user, {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: data.session.expires_at,
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": buildCookieHeader(nextCookie, { requestHost }),
            },
          },
        );
      },
      POST: async ({ request }) => {
        const requestHost = new URL(request.url).host;
        let parsed;
        try {
          parsed = SyncBody.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { data, error } = await supabaseServerAuth.auth.getUser(
          parsed.access_token,
        );
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
