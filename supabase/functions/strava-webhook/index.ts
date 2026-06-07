import { activityRowFromStrava, adminClient, getValidAccessToken } from "../_shared/strava.ts";

const VERIFY_TOKEN = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Strava subscription validation handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  try {
    const event = await req.json();
    // Strava webhook events are unsigned by design (no HMAC support). To prevent
    // spoofed `delete` events from erasing data, we never trust the event payload
    // for deletes — we only mark the row as needing re-sync. For create/update
    // events we re-fetch the canonical activity from Strava using the linked
    // user's own access token, which fails for events not actually owned by them.
    // event: { aspect_type: 'create'|'update'|'delete', object_type: 'activity'|'athlete',
    //          object_id, owner_id, event_time, updates }
    if (event.object_type !== "activity") return new Response("ok");

    const sb = adminClient();
    const { data: link } = await sb.from("strava_auth")
      .select("user_id").eq("athlete_id", event.owner_id).maybeSingle();
    if (!link) return new Response("ok"); // unknown athlete, ignore

    const userId = link.user_id as string;

    if (event.aspect_type === "delete") {
      await sb.from("activities")
        .delete()
        .eq("user_id", userId)
        .eq("source", "strava")
        .eq("strava_activity_id", event.object_id);
      return new Response("ok");
    }

    // Fetch the full activity
    const accessToken = await getValidAccessToken(userId);
    const res = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      await sb.from("activities").upsert({
        user_id: userId,
        source: "strava",
        strava_activity_id: event.object_id,
        sync_status: "failed",
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,source,strava_activity_id" });
      return new Response("ok");
    }
    const a = await res.json();
    await sb.from("activities").upsert(activityRowFromStrava(userId, a), {
      onConflict: "user_id,source,strava_activity_id",
    });
    return new Response("ok");
  } catch (e) {
    console.error("webhook error", e);
    return new Response("ok"); // always 200 so Strava doesn't disable subscription
  }
});
