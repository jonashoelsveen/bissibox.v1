import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { getValidAccessToken, SUPABASE_URL } from "../_shared/strava.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: uerr } = await sb.auth.getUser();
    if (uerr || !u?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const activityId = Number(body?.activityId);
    if (!activityId) return json({ error: "activityId required" }, 400);

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(u.user.id);
    } catch (e) {
      // Viewer (e.g. a coach) is not connected to Strava — return empty
      // streams instead of 500 so the UI degrades gracefully.
      if (String((e as Error)?.message || e) === "not connected") {
        return json({ ok: true, altitude: [], distance: [], notConnected: true });
      }
      throw e;
    }
    const url = new URL(`https://www.strava.com/api/v3/activities/${activityId}/streams`);
    url.searchParams.set("keys", "altitude,distance");
    url.searchParams.set("key_by_type", "true");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      return json({ error: `strava streams failed: ${res.status}`, body: await res.text() }, 502);
    }
    const data = await res.json();
    const altitude: number[] = data?.altitude?.data ?? [];
    const distance: number[] = data?.distance?.data ?? [];
    return json({ ok: true, altitude, distance });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
