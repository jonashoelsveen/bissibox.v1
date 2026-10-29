import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { feedErrorJson, json, rejectDisallowedOrigin } from "@/lib/calendarFeed/http";
import { refreshSubscription } from "@/lib/calendarFeed/service";

const Id = z.string().uuid();

export const Route = createFileRoute("/api/calendar/subscriptions/$id/refresh")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        return json(request, null, 204);
      },
      POST: async ({ request, params }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json(request, { error: auth.error }, auth.status);
        const id = Id.safeParse(params.id);
        if (!id.success) return json(request, { error: "Calendar not found." }, 404);
        try {
          const result = await refreshSubscription(auth.ctx.user.id, id.data);
          return json(request, result);
        } catch (error) {
          return feedErrorJson(request, error);
        }
      },
    },
  },
});
