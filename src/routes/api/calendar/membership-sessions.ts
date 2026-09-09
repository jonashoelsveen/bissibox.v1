import { jsonSafeStringify } from "@/lib/calendarVisiblePayload";
import { createFileRoute } from "@tanstack/react-router";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { loadVisibleCalendar } from "@/lib/calendarMemberOverlay.server";

function json(data: unknown, status = 200) {
  return new Response(jsonSafeStringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/calendar/membership-sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const visible = await loadVisibleCalendar(auth.ctx);
        return json({
          memberships: visible.memberships,
          sessions: visible.sessions,
        });
      },
    },
  },
});
