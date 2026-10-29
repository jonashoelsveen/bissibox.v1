import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getFeatureFlagVersion,
  isFeatureEnabled,
  setFeatureFlagSnapshot,
  subscribeFeatureFlags,
  type FeatureFlag,
} from "@/lib/features";

let loadGeneration = 0;

/** Drops an in-flight load and clears the client snapshot. */
export function clearFeatureFlagSnapshot(): void {
  loadGeneration += 1;
  setFeatureFlagSnapshot(null, null);
}

/** Loads accepted flag keys for this user. A failed lookup stays off. */
export async function loadAcceptedFeatureFlags(userId: string): Promise<void> {
  const ticket = ++loadGeneration;
  const { data, error } = await supabase
    .from("feature_flag_users")
    .select("flag_key")
    .eq("user_id", userId)
    .not("accepted_at", "is", null);
  if (ticket !== loadGeneration) return;
  if (error) {
    setFeatureFlagSnapshot(userId, null);
    return;
  }
  setFeatureFlagSnapshot(
    userId,
    new Set((data ?? []).map((row) => row.flag_key)),
  );
}

/** Re-renders when an accepted flag is stored, then reads that snapshot. */
export function useFeatureEnabled(flag: FeatureFlag, userId?: string | null): boolean {
  useSyncExternalStore(subscribeFeatureFlags, getFeatureFlagVersion, getFeatureFlagVersion);
  return isFeatureEnabled(flag, userId);
}

async function accessTokenForAccept(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const expiresAtMs = (data.session?.expires_at ?? 0) * 1000;
  if (data.session?.access_token && expiresAtMs > Date.now() + 15_000) {
    return data.session.access_token;
  }
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (!res.ok) return data.session?.access_token ?? null;
  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
  } | null;
  if (!body?.access_token) return data.session?.access_token ?? null;
  if (body.refresh_token) {
    await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
  }
  return body.access_token;
}

/** Sets accepted_at for the cookie session. A missing session leaves the row unchanged. */
export async function acceptSignedInFeatureFlags(userId: string): Promise<boolean> {
  const accessToken = await accessTokenForAccept();
  if (!accessToken) return false;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) return false;
  const res = await fetch(`${url}/rest/v1/rpc/accept_feature_flags`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) return false;
  const list = await fetch(
    `${url}/rest/v1/feature_flag_users?select=flag_key&user_id=eq.${encodeURIComponent(userId)}&accepted_at=not.is.null`,
    { headers: { apikey: key, Authorization: `Bearer ${accessToken}` } },
  );
  loadGeneration += 1;
  if (!list.ok) {
    setFeatureFlagSnapshot(userId, null);
    return true;
  }
  const rows = (await list.json().catch(() => null)) as { flag_key?: string }[] | null;
  setFeatureFlagSnapshot(
    userId,
    new Set((rows ?? []).map((row) => row.flag_key).filter((flag): flag is string => !!flag)),
  );
  return true;
}
