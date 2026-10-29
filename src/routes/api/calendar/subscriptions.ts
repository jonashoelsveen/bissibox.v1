import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { feedErrorJson, json, rejectDisallowedOrigin } from "@/lib/calendarFeed/http";
import { createSubscription } from "@/lib/calendarFeed/service";

const Body = z.object({
  url: z.string().trim().min(1).max(4000),
  label: z.string().trim().max(120).optional(),
  entityId: z.string().uuid().nullish(),
  appGroupId: z.string().uuid().nullish(),
});

function sessionExtra(setCookie: string | null): HeadersInit | undefined {
  return setCookie ? { "Set-Cookie": setCookie } : undefined;
}

export const Route = createFileRoute("/api/calendar/subscriptions")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        return json(request, null, 204);
      },
      POST: async ({ request }) => {
        const blocked = rejectDisallowedOrigin(request);
        if (blocked) return blocked;
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json(request, { error: auth.error }, auth.status);
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return json(request, { error: "The URL address is not valid.", code: "invalid_url" }, 400, sessionExtra(auth.sessionSetCookie));
        }
        try {
          const created = await createSubscription(auth.ctx.user.id, body);
          return json(request, created, 200, sessionExtra(auth.sessionSetCookie));
        } catch (error) {
          const response = feedErrorJson(request, error);
          const cookie = auth.sessionSetCookie;
          if (cookie) response.headers.append("Set-Cookie", cookie);
          return response;
        }
      },
    },
  },
});
