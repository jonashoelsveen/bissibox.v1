import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { activityRowFromStrava, adminClient, getValidAccessToken, SUPABASE_URL } from "../_shared/strava.ts";

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    let userId: string | null = null;
    let days = 90;

    const body = await req.json().catch(() => ({}));
    if (body?.days) days = Math.max(1, Math.min(365, Number(body.days)));

    // Service-role internal call
    const auth = req.headers.get("Authorization") || "";
    if (auth.includes(SERVICE_ROLE) && body?.user_id) {
      userId = body.user_id;
    } else {
      const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      });
      const { data, error } = await sb.auth.getUser();
      if (error || !data?.user) return json({ error: "unauthorized" }, 401);
      userId = data.user.id;
    }

    if (!userId) return json({ error: "no user" }, 400);

    const accessToken = await getValidAccessToken(userId);
    const after = Math.floor(Date.now() / 1000) - days * 86400;

    const sb = adminClient();
    let page = 1;
    let total = 0;
    while (true) {
      const url = new URL("https://www.strava.com/api/v3/athlete/activities");
      url.searchParams.set("after", String(after));
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        return json({ error: `strava list failed: ${res.status}`, body: await res.text() }, 502);
      }
      const list = await res.json() as any[];
      if (!Array.isArray(list) || list.length === 0) break;
      const rows = list.map((a) => activityRowFromStrava(userId!, a));
      const { error: upErr } = await sb.from("activities").upsert(rows, {
        onConflict: "user_id,source,strava_activity_id",
      });
      if (upErr) return json({ error: upErr.message }, 500);
      total += rows.length;
      if (list.length < 100) break;
      page += 1;
      if (page > 10) break; // safety
    }

    return json({ ok: true, synced: total, days });
  } catch (e) {
    console.error("sync-recent error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
