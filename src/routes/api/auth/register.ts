import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildCookieHeader, sealSession } from "@/lib/auth-cookie.server";

const Body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
});

export const Route = createFileRoute("/api/auth/register")({
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

        // Create user already email-confirmed so Supabase does NOT send
        // its own confirmation email (which links to lovable.app). The
        // Aponna in-app OTP step is the sole email verification gate.
        const { data: created, error: createErr } =
          await supabaseAdmin.auth.admin.createUser({
            email: parsed.email,
            password: parsed.password,
            email_confirm: true,
            user_metadata: {
              first_name: parsed.first_name ?? "",
              last_name: parsed.last_name ?? "",
            },
          });
        if (createErr || !created.user) {
          return new Response(
            JSON.stringify({ error: createErr?.message ?? "Sign-up failed" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        // Immediately sign the user in so the client has a session and the
        // OTP edge function's auth check passes.
        const { data: signInData, error: signInErr } =
          await supabaseAdmin.auth.signInWithPassword({
            email: parsed.email,
            password: parsed.password,
          });
        if (signInErr || !signInData.session || !signInData.user) {
          return new Response(
            JSON.stringify({ error: signInErr?.message ?? "Sign-in after sign-up failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const cookie = sealSession({
          refresh_token: signInData.session.refresh_token,
          user_id: signInData.user.id,
          issued_at: Date.now(),
        });
        const requestHost = new URL(request.url).host;
        return new Response(
          JSON.stringify({
            user: signInData.user,
            access_token: signInData.session.access_token,
            refresh_token: signInData.session.refresh_token,
            expires_at: signInData.session.expires_at,
            needsOtpVerification: true,
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
