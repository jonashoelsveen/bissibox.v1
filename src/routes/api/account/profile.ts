import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  jsonWithSessionCookie,
  resolveAuthenticatedRequest,
} from "@/lib/account-auth.server";
import {
  AccountProfilePatchBody,
  ensureAccountProfile,
  patchAccountProfile,
} from "@/lib/account-profile.server";

export const Route = createFileRoute("/api/account/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) {
          return jsonWithSessionCookie({ error: auth.error }, auth.status, null);
        }

        const profile = await ensureAccountProfile(auth.ctx);
        return jsonWithSessionCookie({ profile }, 200, auth.sessionSetCookie);
      },
      PATCH: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) {
          return jsonWithSessionCookie({ error: auth.error }, auth.status, null);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonWithSessionCookie({ error: "Invalid request body" }, 400, auth.sessionSetCookie);
        }

        let parsed;
        try {
          parsed = AccountProfilePatchBody.parse(body);
        } catch (e) {
          const message =
            e instanceof z.ZodError
              ? (e.issues[0]?.message ?? "Invalid profile data")
              : "Invalid request";
          return jsonWithSessionCookie({ error: message }, 400, auth.sessionSetCookie);
        }

        const result = await patchAccountProfile(auth.ctx, request, parsed);
        if (!result.ok) {
          return jsonWithSessionCookie(
            { error: result.error },
            result.status,
            auth.sessionSetCookie,
          );
        }
        return jsonWithSessionCookie({ profile: result.profile }, 200, auth.sessionSetCookie);
      },
    },
  },
});
