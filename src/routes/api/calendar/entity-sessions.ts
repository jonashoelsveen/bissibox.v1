import { jsonSafeStringify } from "@/lib/calendarVisiblePayload";
import { createFileRoute } from "@tanstack/react-router";
import { resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { loadEntitySessionsForMember } from "@/lib/calendarMemberOverlay.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(jsonSafeStringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/calendar/entity-sessions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const entityId = new URL(request.url).searchParams.get("entityId") ?? "";
        if (!UUID_RE.test(entityId)) {
          return json({ error: "entityId is required" }, 400);
        }

        const visible = await loadEntitySessionsForMember(auth.ctx, entityId);
        const allowed = visible.memberships.some((row) => row.teamId === entityId);
        if (!allowed) {
          return json({ entityId, memberships: [], sessions: [] });
        }
        return json({
          entityId,
          memberships: visible.memberships,
          sessions: visible.sessions,
        });
      },
    },
  },
});
