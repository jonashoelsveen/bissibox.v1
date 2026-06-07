import { activityRowFromStrava, adminClient, getValidAccessToken } from "../_shared/strava.ts";

const VERIFY_TOKEN = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN")!;
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifyStravaSignature(body: string, sigHeader: string): Promise<boolean> {
  if (!STRAVA_CLIENT_SECRET || !sigHeader) return false;
  const provided = sigHeader.replace(/^sha256=/i, "").trim();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STRAVA_CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expectedHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(expectedHex, provided.toLowerCase());
}

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
    const rawBody = await req.text();
    const sigHeader =
      req.headers.get("X-Hub-Signature-256") ??
      req.headers.get("X-Hub-Signature") ??
      "";
    const ok = await verifyStravaSignature(rawBody, sigHeader);
    if (!ok) {
      console.warn("strava-webhook: invalid signature");
      return new Response("forbidden", { status: 403 });
    }
    const event = JSON.parse(rawBody);
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
