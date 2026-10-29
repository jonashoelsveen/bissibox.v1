import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { feedErrorJson, json, rejectDisallowedOrigin } from "@/lib/calendarFeed/http";
import { subscriptionEvents } from "@/lib/calendarFeed/service";

const Id = z.string().uuid();

export const Route = createFileRoute("/api/calendar/subscriptions/$id/events")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        return json(request, null, 204);
      },
      GET: async ({ request, params }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json(request, { error: auth.error }, auth.status);
        const id = Id.safeParse(params.id);
        if (!id.success) return json(request, { error: "Calendar not found." }, 404);
        const url = new URL(request.url);
        const from = new Date(url.searchParams.get("from") ?? "");
        const to = new Date(url.searchParams.get("to") ?? "");
        const timeZone = url.searchParams.get("timeZone") || "UTC";
        try {
          const events = await subscriptionEvents(auth.ctx.user.id, id.data, from, to, timeZone);
          return json(request, { events });
        } catch (error) {
          return feedErrorJson(request, error);
        }
      },
    },
  },
});
