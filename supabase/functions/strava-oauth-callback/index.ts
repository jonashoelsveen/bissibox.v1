import { adminClient, exchangeCode, verifyState } from "../_shared/strava.ts";

Deno.serve(async (req) => {
  const STRAVA_CLIENT_ID = (Deno.env.get("STRAVA_CLIENT_ID") ?? "").trim();
  const STRAVA_CLIENT_SECRET = (Deno.env.get("STRAVA_CLIENT_SECRET") ?? "").trim();
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    console.error("Missing Strava credentials in callback", {
      hasId: !!STRAVA_CLIENT_ID, hasSecret: !!STRAVA_CLIENT_SECRET,
    });
    return new Response("Server configuration error: Missing Strava credentials", { status: 500 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error");
  const [state, redirectEnc] = stateParam.split("|");
  let redirectTo = decodeURIComponent(redirectEnc || "") || "/settings/connectors";
  // Open-redirect guard: only allow same-origin relative paths.
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    redirectTo = "/settings/connectors";
  }

  if (error) return redirect(`${redirectTo}?strava=denied`);
  if (!code || !state) return redirect(`${redirectTo}?strava=error`);

  const userId = await verifyState(state);
  if (!userId) return redirect(`${redirectTo}?strava=invalid_state`);

  try {
    const tok = await exchangeCode(code);
    const sb = adminClient();
    await sb.from("strava_auth").upsert({
      user_id: userId,
      athlete_id: tok.athlete?.id ?? 0,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: new Date(tok.expires_at * 1000).toISOString(),
      scope: tok.scope ?? "read,activity:read_all",
    }, { onConflict: "user_id" });

    // Trigger initial sync (fire-and-forget)
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/strava-sync-recent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ user_id: userId, days: 90 }),
    }).catch(() => {});

    return redirect(`${redirectTo}?strava=connected`);
  } catch (e) {
    console.error("oauth callback error", e);
    return redirect(`${redirectTo}?strava=error`);
  }
});

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { Location: to } });
}
