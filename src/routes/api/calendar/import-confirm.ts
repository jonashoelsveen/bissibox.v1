import { createFileRoute } from "@tanstack/react-router";
import {
  createUserSupabaseClient,
  resolveAuthenticatedRequest,
} from "@/lib/account-auth.server";
import type { ImportedSession } from "@/lib/calendarImportParse";
import {
  assertCanImportToScope,
  parseImportCalId,
  sessionsToInsertRows,
} from "@/lib/calendarImport.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isImportedSession(v: unknown): v is ImportedSession {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.startISO === "string" &&
    typeof o.endISO === "string" &&
    o.allDay === false &&
    (o.color == null || typeof o.color === "string") &&
    (o.location == null || typeof o.location === "string") &&
    (o.locationUrl == null || typeof o.locationUrl === "string") &&
    (o.locationFull == null || typeof o.locationFull === "string") &&
    (o.description == null || typeof o.description === "string")
  );
}

/** Strip only columns named in `message`; keep location fields whenever possible. */
function stripFailingColumns(
  rows: ReturnType<typeof sessionsToInsertRows>,
  message: string,
) {
  const dropBatch = /import_batch_id/i.test(message);
  const dropLocationUrl = /location_url/i.test(message);
  // `\blocation\b` does not match `location_url`.
  const dropLocation = /\blocation\b/i.test(message);

  return rows.map((row) => {
    const next = { ...row } as Record<string, unknown>;
    if (dropBatch) delete next.import_batch_id;
    if (dropLocationUrl) delete next.location_url;
    if (dropLocation) delete next.location;
    return next;
  });
}

export const Route = createFileRoute("/api/calendar/import-confirm")({
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

        if (!body || typeof body !== "object") {
          return json({ error: "Invalid request body" }, 400);
        }

        const { calId, sessions: rawSessions } = body as {
          calId?: unknown;
          sessions?: unknown;
        };

        if (typeof calId !== "string" || !calId) {
          return json({ error: "calId is required" }, 400);
        }
        if (!Array.isArray(rawSessions)) {
          return json({ error: "sessions must be an array" }, 400);
        }
        if (rawSessions.length === 0) {
          return json({ inserted: 0, ids: [] });
        }
        if (rawSessions.length > 2000) {
          return json({ error: "Too many sessions (max 2000)" }, 400);
        }
        if (!rawSessions.every(isImportedSession)) {
          return json({ error: "Invalid session payload" }, 400);
        }

        const scope = parseImportCalId(calId);
        if (!scope) return json({ error: "Invalid calId" }, 400);

        const supabase = await createUserSupabaseClient(
          auth.ctx.accessToken,
          auth.ctx.refreshToken,
        );

        const access = await assertCanImportToScope(supabase, auth.ctx.user.id, scope);
        if (!access.ok) return json({ error: access.error }, access.status);

        // Persist the preview payload as-is — every session the user saw.
        const sessions = rawSessions as ImportedSession[];
        const rows = sessionsToInsertRows(sessions, scope, auth.ctx.user.id);
        let { data, error } = await supabase
          .from("calendar_sessions")
          .insert(rows as never)
          .select("id");

        // Progressive strip: never drop location unless that column itself fails.
        if (error) {
          const msg = error.message || "";
          if (/import_batch_id|location_url|\blocation\b/i.test(msg)) {
            const stripped = stripFailingColumns(rows, msg);
            ({ data, error } = await supabase
              .from("calendar_sessions")
              .insert(stripped as never)
              .select("id"));
          }
        }

        if (error) {
          console.error("[calendar import-confirm]", error);
          return json({ error: error.message || "Batch insert failed" }, 500);
        }

        const ids = (data ?? []).map((r) => r.id as string);

        return json({
          inserted: ids.length,
          ids,
        });
      },
    },
  },
});
