import { createFileRoute } from "@tanstack/react-router";
import { jsonWithSessionCookie, resolveAuthenticatedRequest } from "@/lib/account-auth.server";
import { getSupabaseAdminOrNull } from "@/lib/supabase-admin.server";

export const Route = createFileRoute("/api/calendar/lookup-user")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await resolveAuthenticatedRequest(request);
        if (!auth.ok) {
          return jsonWithSessionCookie({ error: auth.error }, auth.status, null);
        }
        const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
        if (!email.includes("@")) {
          return jsonWithSessionCookie({ name: null }, 200, auth.sessionSetCookie);
        }
        const admin = await getSupabaseAdminOrNull();
        if (!admin) return jsonWithSessionCookie({ name: null }, 200, auth.sessionSetCookie);
        const { data } = await admin
          .from("profiles")
          .select("first_name, last_name, display_name")
          .ilike("email", email)
          .maybeSingle();
        const joined = [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim();
        const name = joined || data?.display_name || null;
        return jsonWithSessionCookie({ name }, 200, auth.sessionSetCookie);
      },
    },
  },
});
