import { createFileRoute } from "@tanstack/react-router";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { NEW_PASSWORD_MATCHES_CURRENT } from "@/lib/account-password-messages";
import {
  AccountPasswordBody,
  changeAccountPassword,
} from "@/lib/account-profile.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/account/password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        const parsed = AccountPasswordBody.safeParse(body);
        if (!parsed.success) {
          const sameAsCurrent = parsed.error.issues.some(
            (issue) => issue.message === NEW_PASSWORD_MATCHES_CURRENT,
          );
          return json(
            {
              error: sameAsCurrent
                ? NEW_PASSWORD_MATCHES_CURRENT
                : "Invalid password data",
            },
            400,
          );
        }

        const result = await changeAccountPassword(auth.ctx, request, parsed.data);
        if (!result.ok) {
          return json(
            {
              error: result.error,
              ...(result.code ? { code: result.code } : {}),
              ...(typeof result.remaining === "number" ? { remaining: result.remaining } : {}),
            },
            result.status,
          );
        }
        if (result.pending) {
          return json({
            ok: true,
            pending: true,
            masked: result.masked,
            attempt_id: result.attempt_id,
          });
        }
        return json({ ok: true });
      },
    },
  },
});
