import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createUserSupabaseClient } from "@/lib/account-auth.server";
import { supabaseServerAuth } from "@/lib/supabase-server-auth";
import { buildCookieHeader, buildSessionPayload, sealSession } from "@/lib/auth-cookie.server";

const Body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
  first_name: z.string().min(1).max(120).optional(),
  last_name: z.string().min(1).max(120).optional(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function hasServiceRoleKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function persistSignupBirthDate(
  userId: string,
  birthDate: string,
  accessToken: string,
  refreshToken: string,
) {
  if (hasServiceRoleKey()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({ birth_date: birthDate })
        .eq("id", userId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[auth/register] birth_date persist failed:", error.message);
        break;
      }
      if (data) return;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }

  try {
    const client = await createUserSupabaseClient(accessToken, refreshToken);
    const { error } = await client
      .from("profiles")
      .update({ birth_date: birthDate })
      .eq("id", userId);
    if (error) {
      console.error("[auth/register] birth_date persist (user) failed:", error.message);
    }
  } catch (e) {
    console.error("[auth/register] birth_date persist (user) failed:", e);
  }
}

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let parsed;
          try {
            parsed = Body.parse(await request.json());
          } catch {
            return new Response(JSON.stringify({ error: "Invalid request" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const requestHost = new URL(request.url).host;
          let user;
          let session;

          if (hasServiceRoleKey()) {
            // Production path: create pre-confirmed user (no Supabase confirmation email).
            const { data: created, error: createErr } =
              await supabaseAdmin.auth.admin.createUser({
                email: parsed.email,
                password: parsed.password,
                email_confirm: true,
                user_metadata: {
                  first_name: parsed.first_name ?? "",
                  last_name: parsed.last_name ?? "",
                  ...(parsed.birth_date ? { birth_date: parsed.birth_date } : {}),
                },
              });
            if (createErr || !created.user) {
              return new Response(
                JSON.stringify({ error: createErr?.message ?? "Sign-up failed" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }

            const { data: signInData, error: signInErr } =
              await supabaseServerAuth.auth.signInWithPassword({
                email: parsed.email,
                password: parsed.password,
              });
            if (signInErr || !signInData.session || !signInData.user) {
              return new Response(
                JSON.stringify({ error: signInErr?.message ?? "Sign-in after sign-up failed" }),
                { status: 500, headers: { "Content-Type": "application/json" } },
              );
            }
            user = signInData.user;
            session = signInData.session;
          } else {
            // Local dev path: same flow as the mobile app (publishable key only).
            const { data, error } = await supabaseServerAuth.auth.signUp({
              email: parsed.email,
              password: parsed.password,
              options: {
                data: {
                  first_name: parsed.first_name ?? "",
                  last_name: parsed.last_name ?? "",
                  ...(parsed.birth_date ? { birth_date: parsed.birth_date } : {}),
                },
              },
            });
            if (error) {
              return new Response(
                JSON.stringify({ error: error.message }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
            if (!data.session || !data.user) {
              return new Response(
                JSON.stringify({ needsEmailConfirmation: true }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              );
            }
            user = data.user;
            session = data.session;
          }

          if (parsed.birth_date) {
            await persistSignupBirthDate(
              user.id,
              parsed.birth_date,
              session.access_token,
              session.refresh_token,
            );
          }

          const cookie = sealSession(
            buildSessionPayload({
              userId: user.id,
              refreshToken: session.refresh_token,
              accessToken: session.access_token,
              expiresAt: session.expires_at,
            }),
          );

          return new Response(
            JSON.stringify({
              user,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
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
        } catch (e) {
          console.error("[auth/register]", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Sign-up failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
