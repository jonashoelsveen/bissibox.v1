import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { feedErrorJson, json, rejectDisallowedOrigin } from "@/lib/calendarFeed/http";
import { deleteSubscription, updateSubscription } from "@/lib/calendarFeed/service";

const Id = z.string().uuid();
const Patch = z.object({
  label: z.string().trim().max(120).optional(),
  color: z.string().trim().max(32).optional(),
});

export const Route = createFileRoute("/api/calendar/subscriptions/$id")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        return json(request, null, 204);
      },
      PATCH: async ({ request, params }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json(request, { error: auth.error }, auth.status);
        const id = Id.safeParse(params.id);
        if (!id.success) return json(request, { error: "Calendar not found." }, 404);
        let body: z.infer<typeof Patch>;
        try {
          body = Patch.parse(await request.json());
        } catch {
          return json(request, { error: "That colour can't be used." }, 400);
        }
        try {
          const updated = await updateSubscription(auth.ctx.user.id, id.data, body);
          return json(request, updated);
        } catch (error) {
          return feedErrorJson(request, error);
        }
      },
      DELETE: async ({ request, params }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json(request, { error: auth.error }, auth.status);
        const id = Id.safeParse(params.id);
        if (!id.success) return json(request, { error: "Calendar not found." }, 404);
        try {
          await deleteSubscription(auth.ctx.user.id, id.data);
          return json(request, { ok: true });
        } catch (error) {
          return feedErrorJson(request, error);
        }
      },
    },
  },
});
