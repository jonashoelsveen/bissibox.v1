import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  jsonWithSessionCookie,
  resolveAuthenticatedRequest,
} from "@/lib/account-auth.server";
import {
  AccountEmailSendBody,
  AccountEmailVerifyBody,
  confirmAccountEmailChange,
  emailChangeSetCookie,
  startAccountEmailChange,
} from "@/lib/account-email.server";
import {
  EMAIL_CHANGE_COOKIE_NAME,
  readNamedCookie,
  unsealEmailChangeChallenge,
} from "@/lib/auth-cookie.server";

export const Route = createFileRoute("/api/account/email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) {
          return jsonWithSessionCookie({ error: auth.error }, auth.status, null);
        }

        const requestHost = new URL(request.url).host;
        const sessionCookie = auth.sessionSetCookie;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithSessionCookie(
            { error: "Invalid request body" },
            400,
            sessionCookie,
          );
        }

        const asRecord = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        if (typeof asRecord.code === "string" && !("email" in asRecord)) {
          let parsed;
          try {
            parsed = AccountEmailVerifyBody.parse(body);
          } catch (e) {
            const message =
              e instanceof z.ZodError ? (e.issues[0]?.message ?? "Invalid code") : "Invalid request";
            return jsonWithSessionCookie({ error: message }, 400, sessionCookie);
          }
          const existing = unsealEmailChangeChallenge(
            readNamedCookie(request.headers.get("cookie"), EMAIL_CHANGE_COOKIE_NAME),
          );
          const result = await confirmAccountEmailChange(
            auth.ctx,
            existing,
            parsed.code,
            parsed.attempt_id,
          );
          return jsonWithSessionCookie(
            result.ok
              ? { ok: true }
              : {
                  error: result.error,
                  ...(result.code ? { code: result.code } : {}),
                  ...(typeof result.remaining === "number"
                    ? { remaining: result.remaining }
                    : {}),
                },
            result.ok ? 200 : result.status,
            sessionCookie,
            [emailChangeSetCookie(result.challenge, requestHost)],
          );
        }

        let parsed;
        try {
          parsed = AccountEmailSendBody.parse(body);
        } catch {
          return jsonWithSessionCookie({ error: "Enter a valid email" }, 400, sessionCookie);
        }
        const result = await startAccountEmailChange(auth.ctx, parsed.email);
        if (!result.ok) {
          return jsonWithSessionCookie(
            result.code
              ? { error: result.error, code: result.code }
              : { error: result.error },
            result.status,
            sessionCookie,
          );
        }
        return jsonWithSessionCookie(
          { masked: result.masked, attempt_id: result.challenge.attempt_id },
          200,
          sessionCookie,
          [emailChangeSetCookie(result.challenge, requestHost)],
        );
      },
    },
  },
});
