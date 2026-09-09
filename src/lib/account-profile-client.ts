import type { User } from "@supabase/supabase-js";
import { birthDateFromMetadata, normalizeBirthDate } from "@/lib/birth-date";
import { supabase } from "@/integrations/supabase/client";
import type { AccountProfile } from "@/hooks/useAccountProfile";

const PROFILE_SELECT =
  "first_name, last_name, birth_date, email, mobile, updated_at" as const;

/** Profile derived from auth when DB read is temporarily unavailable — UI still renders. */
export function profileFromAuthUser(user: User): AccountProfile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    first_name: typeof meta.first_name === "string" ? meta.first_name : null,
    last_name: typeof meta.last_name === "string" ? meta.last_name : null,
    birth_date: birthDateFromMetadata(meta),
    email: user.email ?? null,
    mobile: null,
    updated_at: "",
  };
}

function rowToProfile(
  row: {
    first_name: string | null;
    last_name: string | null;
    birth_date: unknown;
    email: string | null;
    mobile: string | null;
    updated_at: string;
  },
  user: User,
): AccountProfile {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    birth_date:
      normalizeBirthDate(row.birth_date) ??
      birthDateFromMetadata((user.user_metadata ?? {}) as Record<string, unknown>),
    email: row.email ?? user.email ?? null,
    mobile: row.mobile,
    updated_at: row.updated_at,
  };
}

/** Sync Supabase JS session from the HTTP-only cookie when localStorage is empty or expired. */
export async function ensureSupabaseSessionFromCookie(): Promise<string | undefined> {
  const { data: existing } = await supabase.auth.getSession();
  const expiresAtMs = (existing.session?.expires_at ?? 0) * 1000;
  if (existing.session?.access_token && expiresAtMs > Date.now() + 15_000) {
    return existing.session.access_token;
  }

  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return existing.session?.access_token;

    const body = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!body.access_token || !body.refresh_token) {
      return existing.session?.access_token;
    }

    const { data } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    return data.session?.access_token ?? body.access_token;
  } catch {
    return existing.session?.access_token;
  }
}

function accountAuthHeaders(accessToken: string | undefined) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

async function fetchAccountProfileViaServer(
  accessToken: string | undefined,
): Promise<AccountProfile | null> {
  try {
    const res = await fetch("/api/account/profile", {
      method: "GET",
      credentials: "include",
      headers: accountAuthHeaders(accessToken),
    });
    const body = (await res.json().catch(() => ({}))) as {
      profile?: AccountProfile;
    };
    if (res.ok && body.profile) return body.profile;
  } catch {
    /* fall through */
  }
  return null;
}

/** Read profile through Supabase RLS (requires authenticated JWT on the client). */
async function fetchAccountProfileViaClient(
  user: User,
): Promise<AccountProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[account] profile read failed:", error.message);
    return null;
  }

  if (data) return rowToProfile(data, user);

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const firstName = typeof meta.first_name === "string" ? meta.first_name : null;
  const lastName = typeof meta.last_name === "string" ? meta.last_name : null;

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? null,
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDateFromMetadata(meta),
    })
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (inserted) return rowToProfile(inserted, user);

  if (insertError) {
    console.error("[account] profile create failed:", insertError.message);
  }

  const { data: retry } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (retry) return rowToProfile(retry, user);
  return null;
}

/**
 * Load account profile for the signed-in user.
 * Server API first (creates row if missing), then client RLS, then auth metadata.
 */
export async function loadAccountProfileForUser(
  user: User,
): Promise<AccountProfile> {
  const accessToken = await ensureSupabaseSessionFromCookie();
  const fromMeta = birthDateFromMetadata(
    (user.user_metadata ?? {}) as Record<string, unknown>,
  );
  const mergeBirthDate = (profile: AccountProfile): AccountProfile =>
    profile.birth_date ? profile : { ...profile, birth_date: fromMeta };

  const fromServer = await fetchAccountProfileViaServer(accessToken);
  if (fromServer) return mergeBirthDate(fromServer);

  const fromClient = await fetchAccountProfileViaClient(user);
  if (fromClient) return mergeBirthDate(fromClient);

  return profileFromAuthUser(user);
}

export async function getAccountAccessToken(): Promise<string | undefined> {
  const token = await ensureSupabaseSessionFromCookie();
  if (token) return token;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
