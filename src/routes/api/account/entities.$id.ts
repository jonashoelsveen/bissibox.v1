import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import {
  AccountEntityPatchBody,
  deleteAccountEntity,
  updateAccountEntity,
} from "@/lib/account-entities.server";
import { anyEntityFeatureAllowedForActor } from "@/lib/entity-feature.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const IdParam = z.string().uuid();

export const Route = createFileRoute("/api/account/entities/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        /** Entity update — Bucket A: blocked unless entityProfiles. */
        if (!(await anyEntityFeatureAllowedForActor(["entityProfiles"], auth.ctx))) {
          return json({ error: "Not found" }, 404);
        }

        const idParse = IdParam.safeParse(String(params.id ?? "").trim());
        if (!idParse.success) return json({ error: "Invalid entity" }, 400);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        let parsed;
        try {
          parsed = AccountEntityPatchBody.parse(body);
        } catch (e) {
          const message =
            e instanceof z.ZodError
              ? (e.issues[0]?.message ?? "Invalid entity data")
              : "Invalid request";
          return json({ error: message }, 400);
        }

        const result = await updateAccountEntity(auth.ctx, idParse.data, parsed);
        if (!result.ok) return json({ error: result.error }, result.status);
        return json({ group: result.group });
      },
      DELETE: async ({ request, params }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        /** Entity delete — Bucket A: blocked unless entityProfiles. */
        if (!(await anyEntityFeatureAllowedForActor(["entityProfiles"], auth.ctx))) {
          return json({ error: "Not found" }, 404);
        }

        const idParse = IdParam.safeParse(String(params.id ?? "").trim());
        if (!idParse.success) return json({ error: "Invalid entity" }, 400);

        const result = await deleteAccountEntity(auth.ctx, idParse.data);
        if (!result.ok) return json({ error: result.error }, result.status);
        return json({ ok: true });
      },
    },
  },
});
