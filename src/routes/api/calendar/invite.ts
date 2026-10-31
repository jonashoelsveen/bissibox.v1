import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createUserSupabaseClient,
  jsonWithSessionCookie,
  resolveAuthenticatedRequest,
} from "@/lib/account-auth.server";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";
import { landingPrimaryButtonStyle } from "@/lib/cloud-landing-design";

const Body = z.object({
  calendarId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  role: z.enum(["member", "admin"]),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Account page profile name first, then first and last name. */
function profileName(
  profile: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null,
): string | null {
  const shown = profile?.display_name?.trim();
  if (shown) return shown;
  const joined = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return joined || null;
}

function envValue(name: string): string {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0 || trimmed.slice(0, eq).trim() !== name) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value.trim();
    }
  } catch {
    /* .env is optional in production */
  }
  return "";
}

/** Login email lives on the auth user. Profiles sometimes omit it. */
async function findAuthUserId(email: string): Promise<string | null> {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/auth/v1/admin/users?page=1&per_page=20&filter=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${key}`, apikey: key } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { users?: { id?: string; email?: string | null }[] };
    const match = (body.users ?? []).find((user) => (user.email ?? "").toLowerCase() === email);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

function appOrigin(request: Request) {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (origin) return origin;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }
  return "https://bissibox.com";
}

async function sendInviteEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = envValue("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "Could not send the invite email" };
  const from = envValue("RESEND_FROM_EMAIL") || "Bissibox <noreply@bissibox.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[calendar invite] resend", res.status, detail);
    return { ok: false, error: "Could not send the invite email" };
  }
  return { ok: true };
}

export const Route = createFileRoute("/api/calendar/invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return json({ error: "Enter a valid email" }, 400);
        }

        const email = parsed.email.toLowerCase();
        if (email === (auth.ctx.user.email ?? "").toLowerCase()) {
          return json({ error: "You can't invite the email you're logged in with." }, 400);
        }

        const userClient = await createUserSupabaseClient(
          auth.ctx.accessToken,
          auth.ctx.refreshToken,
        );
        const { data: calendar, error: calendarError } = await userClient
          .from("user_calendars")
          .select("id, name, owner_id")
          .eq("id", parsed.calendarId)
          .is("deleted_at", null)
          .maybeSingle();
        if (calendarError || !calendar) {
          return jsonWithSessionCookie({ error: "Calendar not found" }, 404, auth.sessionSetCookie);
        }

        const isOwner = calendar.owner_id === auth.ctx.user.id;
        if (!isOwner) {
          const { data: mine } = await userClient
            .from("user_calendar_members")
            .select("role, status")
            .eq("calendar_id", calendar.id)
            .eq("user_id", auth.ctx.user.id)
            .maybeSingle();
          if (mine?.role !== "admin" || mine.status !== "accepted") {
            return jsonWithSessionCookie({ error: "Only an admin can invite people" }, 403, auth.sessionSetCookie);
          }
        }

        const { data: existing } = await userClient
          .from("user_calendar_members")
          .select("id, status, user_id")
          .eq("calendar_id", calendar.id)
          .ilike("email", email)
          .maybeSingle();
        if (existing?.status === "accepted") {
          return jsonWithSessionCookie({ error: "That person already has this calendar" }, 400, auth.sessionSetCookie);
        }
        if (existing?.user_id && existing.user_id === calendar.owner_id) {
          return jsonWithSessionCookie({ error: "That person already has this calendar" }, 400, auth.sessionSetCookie);
        }

        const admin = await getSupabaseAdminOrNull();
        let displayName: string | null = null;
        let inviteeId: string | null = null;
        let inviterName = auth.ctx.user.email ?? "Someone";
        if (admin) {
          const [{ data: profile }, { data: inviter }] = await Promise.all([
            admin
              .from("profiles")
              .select("id, first_name, last_name, display_name")
              .ilike("email", email)
              .maybeSingle(),
            admin
              .from("profiles")
              .select("first_name, last_name, display_name")
              .eq("id", auth.ctx.user.id)
              .maybeSingle(),
          ]);
          displayName = profileName(profile);
          inviteeId = profile?.id ?? null;
          if (!inviteeId) inviteeId = await findAuthUserId(email);
          if (inviteeId && !displayName) {
            const { data: named } = await admin
              .from("profiles")
              .select("first_name, last_name, display_name")
              .eq("id", inviteeId)
              .maybeSingle();
            displayName = profileName(named);
          }
          inviterName = profileName(inviter) || inviterName;
        }

        if (inviteeId && inviteeId === calendar.owner_id) {
          return jsonWithSessionCookie(
            { error: "That person already has this calendar" },
            400,
            auth.sessionSetCookie,
          );
        }

        // An existing account is added at once. The signed-in client can only
        // insert a pending row, so the accepted membership is written with the
        // service role. Member stays read-only; admin matches the creator.
        const granted = Boolean(inviteeId);
        const token = granted ? null : randomBytes(24).toString("hex");
        const row = {
          email,
          role: parsed.role,
          status: granted ? ("accepted" as const) : ("pending" as const),
          user_id: inviteeId,
          invite_token: token,
          invited_by: auth.ctx.user.id,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        };
        const writer = granted && admin ? admin : userClient;
        const write = existing
          ? await writer.from("user_calendar_members").update(row).eq("id", existing.id)
          : await writer.from("user_calendar_members").insert({
              ...row,
              calendar_id: calendar.id,
            });
        if (write.error) {
          return jsonWithSessionCookie({ error: write.error.message }, 400, auth.sessionSetCookie);
        }

        const origin = appOrigin(request);
        const button = landingPrimaryButtonStyle;
        const calendarName = escapeHtml(calendar.name);
        const who = escapeHtml(inviterName);
        const acceptUrl = token ? `${origin}/accept-calendar-invite?token=${token}` : origin;
        const html = granted
          ? `
          <div style="font-family:${button.fontFamily};max-width:560px;margin:0 auto;padding:32px;color:#1d1d1f;">
            <p style="font-size:17px;line-height:1.4;"><strong>${who}</strong> added you to the calendar “${calendarName}”.</p>
            <p style="font-size:17px;line-height:1.4;">Open Bissibox and the calendar is in your list.</p>
            <p style="margin:28px 0;">
              <a href="${origin}" style="display:inline-block;background:${button.backgroundColor};color:${button.color};border-radius:980px;padding:14px 36px;font-size:17px;font-weight:500;text-decoration:none;">Open calendar</a>
            </p>
          </div>`
          : `
          <div style="font-family:${button.fontFamily};max-width:560px;margin:0 auto;padding:32px;color:#1d1d1f;">
            <p style="font-size:17px;line-height:1.4;"><strong>${who}</strong> invited you to the calendar “${calendarName}”.</p>
            <p style="font-size:17px;line-height:1.4;">To accept, click the accept button.</p>
            <p style="margin:28px 0;">
              <a href="${acceptUrl}" style="display:inline-block;background:${button.backgroundColor};color:${button.color};border-radius:980px;padding:14px 36px;font-size:17px;font-weight:500;text-decoration:none;">Accept</a>
            </p>
          </div>`;
        const subject = granted
          ? `${inviterName} added you to the calendar “${calendar.name}”`
          : `${inviterName} invited you to the calendar “${calendar.name}”`;
        try {
          const sent = await sendInviteEmail({
            to: email,
            subject,
            html,
            text: granted
              ? `${inviterName} added you to the calendar "${calendar.name}". Open ${origin}`
              : `${inviterName} invited you to the calendar "${calendar.name}". Accept: ${acceptUrl}`,
          });
          if (!sent.ok) {
            console.error("[calendar invite] membership saved, email not sent");
          }
        } catch (error) {
          console.error("[calendar invite] membership saved, email not sent", error);
        }

        return jsonWithSessionCookie({ ok: true }, 200, auth.sessionSetCookie);
      },
    },
  },
});
