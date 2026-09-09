import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import {
  AccountEntityCreateBody,
  createAccountEntity,
  listAccountEntities,
} from "@/lib/account-entities.server";
import { anyEntityFeatureAllowedForActor } from "@/lib/entity-feature.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/account/entities")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        /** Entity list/create — Bucket A: blocked unless entity profiles/switcher/workspace. */
        if (
          !(await anyEntityFeatureAllowedForActor(
            ["entityProfiles", "entityProfileSwitcher", "entityAppsLauncher", "entityWorkspace"],
            auth.ctx,
          ))
        ) {
          return json({ groups: [] });
        }
        const result = await listAccountEntities(auth.ctx);
        if (!result.ok) return json({ error: result.error }, result.status);
        return json({ groups: result.groups });
      },
      POST: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        /** Entity create — Bucket A: blocked unless entityProfiles. */
        if (!(await anyEntityFeatureAllowedForActor(["entityProfiles"], auth.ctx))) {
          return json({ error: "Not found" }, 404);
        }

        let body: unknown = {};
        try {
          const raw = await request.text();
          if (raw.trim()) body = JSON.parse(raw);
        } catch {
          return json({ error: "Invalid request body" }, 400);
        }

        let parsed;
        try {
          parsed = AccountEntityCreateBody.parse(body);
        } catch (e) {
          const message =
            e instanceof z.ZodError
              ? (e.issues[0]?.message ?? "Invalid entity data")
              : "Invalid request";
          return json({ error: message }, 400);
        }

        const result = await createAccountEntity(auth.ctx, parsed.name ?? "New entity");
        if (!result.ok) return json({ error: result.error }, result.status);
        return json({ group: result.group });
      },
    },
  },
});
