import { createFileRoute } from "@tanstack/react-router";
import {
  createUserSupabaseClient,
  resolveAuthenticatedRequest,
} from "@/lib/account-auth.server";
import { parseCalendarImportFile } from "@/lib/calendarImportParse";
import { resolveMazemapUrlsForRooms } from "@/lib/mazemapNtnu.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/calendar/import-preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        // Touch user client so auth cookie refresh side-effects stay consistent
        await createUserSupabaseClient(auth.ctx.accessToken, auth.ctx.refreshToken);

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Expected multipart form data" }, 400);
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
          return json({ error: "Missing file field" }, 400);
        }

        const maxBytes = 8 * 1024 * 1024;
        if (file.size > maxBytes) {
          return json({ error: "File too large (max 8MB)" }, 413);
        }

        const buffer = await file.arrayBuffer();
        const result = parseCalendarImportFile(buffer, file.name || "import.csv");

        let sessions = result.sessions;
        if (result.profile === "bielsys") {
          const fullRooms = sessions
            .map((s) => s.locationFull)
            .filter((v): v is string => !!v?.trim());
          const urlByFull = await resolveMazemapUrlsForRooms(fullRooms);
          sessions = sessions.map((s) => {
            const full = s.locationFull?.trim();
            if (!full) return s;
            const locationUrl = urlByFull.get(full);
            return locationUrl ? { ...s, locationUrl } : s;
          });
        }

        return json({
          sessions,
          skipped: result.skipped,
          warnings: result.warnings,
          profile: result.profile,
        });
      },
    },
  },
});
