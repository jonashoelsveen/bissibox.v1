import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { signState } from "../_shared/strava.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const STRAVA_CLIENT_ID = (Deno.env.get("STRAVA_CLIENT_ID") ?? "").trim();
    const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const SUPABASE_ANON_KEY = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();

    if (!STRAVA_CLIENT_ID) {
      console.error("Missing STRAVA_CLIENT_ID env var");
      return json({ error: "Server configuration error: Missing Strava Client ID" }, 500);
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Missing Supabase env vars", { hasUrl: !!SUPABASE_URL, hasAnon: !!SUPABASE_ANON_KEY });
      return json({ error: "Server configuration error: Missing Supabase credentials" }, 500);
    }

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error } = await sb.auth.getUser();
    if (error || !userData?.user) return json({ error: "unauthorized" }, 401);

    const { redirect_to } = await req.json().catch(() => ({}));
    const state = await signState(userData.user.id);
    const callback = `${SUPABASE_URL}/functions/v1/strava-oauth-callback`;
    const url = new URL("https://www.strava.com/oauth/authorize");
    url.searchParams.set("client_id", String(STRAVA_CLIENT_ID));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("approval_prompt", "auto");
    url.searchParams.set("scope", "read,activity:read_all");
    url.searchParams.set("state", `${state}|${encodeURIComponent(redirect_to || "")}`);
    return json({ url: url.toString() });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
