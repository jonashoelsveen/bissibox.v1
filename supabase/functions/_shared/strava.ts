// Shared Strava helpers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID")!;
export const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET")!;
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Sign / verify lightweight HMAC state tokens (user_id + nonce + ts)
async function hmac(data: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signState(userId: string): Promise<string> {
  const payload = `${userId}.${crypto.randomUUID()}.${Date.now()}`;
  const sig = await hmac(payload, STRAVA_CLIENT_SECRET);
  return `${btoa(payload).replace(/=+$/, "")}.${sig}`;
}

export async function verifyState(state: string): Promise<string | null> {
  try {
    const [b64, sig] = state.split(".");
    const payload = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    const expected = await hmac(payload, STRAVA_CLIENT_SECRET);
    if (expected !== sig) return null;
    const [userId, _nonce, ts] = payload.split(".");
    if (Date.now() - Number(ts) > 1000 * 60 * 30) return null; // 30-min validity
    return userId;
  } catch {
    return null;
  }
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number };
  scope?: string;
}

export async function exchangeCode(code: string): Promise<StravaTokens> {
  const res = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

export async function refreshTokens(refresh_token: string): Promise<StravaTokens> {
  const res = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

// Returns a valid access token, refreshing if needed and persisting back.
export async function getValidAccessToken(userId: string): Promise<string> {
  const sb = adminClient();
  const { data, error } = await sb.from("strava_auth").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("not connected");
  const expiresAtSec = Math.floor(new Date(data.expires_at).getTime() / 1000);
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAtSec - nowSec > 60) return data.access_token;
  const fresh = await refreshTokens(data.refresh_token);
  await sb.from("strava_auth").update({
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_at: new Date(fresh.expires_at * 1000).toISOString(),
  }).eq("user_id", userId);
  return fresh.access_token;
}

// Title-only XC ski technique classifier. No pace fallback.
export function classifySubType(sportType: string, name: string | null | undefined): string | null {
  if (sportType !== "NordicSki") return null;
  const t = (name || "").toLowerCase();
  const skate = /\b(skate|skating|skating\.?|fri|friteknikk|free|freestyle)\b/i;
  const classic = /\b(classic|klassisk|klassisk\.?|diagonal)\b/i;
  if (skate.test(t)) return "Skate";
  if (classic.test(t)) return "Classic";
  return null; // keep as general XC ski
}

export function activityRowFromStrava(userId: string, a: any) {
  return {
    user_id: userId,
    source: "strava",
    strava_activity_id: a.id,
    name: a.name ?? null,
    sport_type: a.sport_type ?? a.type ?? null,
    sub_type: classifySubType(a.sport_type ?? a.type, a.name),
    start_date: a.start_date ?? null,
    elapsed_time_sec: a.elapsed_time ?? null,
    moving_time_sec: a.moving_time ?? null,
    distance_m: a.distance ?? null,
    total_elevation_gain_m: a.total_elevation_gain ?? null,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    average_speed: a.average_speed ?? null,
    summary_polyline: a.map?.summary_polyline ?? null,
    map_polyline: a.map?.polyline ?? null,
    raw: a,
    sync_status: "completed",
    last_synced_at: new Date().toISOString(),
  };
}
