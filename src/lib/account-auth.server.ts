import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildCookieHeader,
  buildSessionPayload,
  cookieAccessTokenIsFresh,
  readCookieFromHeader,
  sealSession,
  unsealSession,
} from "@/lib/auth-cookie.server";
import { supabaseServerAuth } from "@/lib/supabase-server-auth";

export type AuthenticatedContext = {
  user: User;
  accessToken: string;
  refreshToken: string;
};

export type AuthenticatedRequest =
  | { ok: true; ctx: AuthenticatedContext; sessionSetCookie: string | null }
  | { ok: false; status: number; error: string };

/** JSON response that keeps the HTTP-only session cookie in sync after a refresh. */
export function jsonWithSessionCookie(
  data: unknown,
  status: number,
  sessionSetCookie: string | null,
  extraSetCookies: string[] = [],
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (sessionSetCookie) headers.append("Set-Cookie", sessionSetCookie);
  for (const cookie of extraSetCookies) {
    if (cookie) headers.append("Set-Cookie", cookie);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function supabaseUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  return url;
}

function supabasePublishableKey() {
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Supabase publishable key is not configured");
  return key;
}

/** User-scoped Supabase client — queries run through RLS as the signed-in user. */
export async function createUserSupabaseClient(
  accessToken: string,
  refreshToken?: string,
) {
  const client = createClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.error("[account] setSession failed:", error.message);
    }
  }

  return client;
}

export async function resolveAuthenticatedRequest(
  request: Request,
): Promise<AuthenticatedRequest> {
  const requestHost = new URL(request.url).host;
  const cookie = readCookieFromHeader(request.headers.get("cookie"));
  const sealed = unsealSession(cookie);

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  // Prefer the access token: getUser does not rotate the refresh token.
  // Refreshing the cookie on every account API call was invalidating the
  // HTTP-only session, so the next Verify request returned 401.
  if (token) {
    const { data, error } = await supabaseServerAuth.auth.getUser(token);
    if (!error && data.user) {
      return {
        ok: true,
        ctx: {
          user: data.user,
          accessToken: token,
          refreshToken: sealed?.refresh_token ?? "",
        },
        sessionSetCookie: null,
      };
    }
  }

  if (sealed) {
    if (sealed.access_token && cookieAccessTokenIsFresh(sealed)) {
      const { data, error } = await supabaseServerAuth.auth.getUser(sealed.access_token);
      if (!error && data.user) {
        return {
          ok: true,
          ctx: {
            user: data.user,
            accessToken: sealed.access_token,
            refreshToken: sealed.refresh_token,
          },
          sessionSetCookie: null,
        };
      }
    }

    const { data, error } = await supabaseServerAuth.auth.refreshSession({
      refresh_token: sealed.refresh_token,
    });
    if (!error && data.session && data.user) {
      return {
        ok: true,
        ctx: {
          user: data.user,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
        sessionSetCookie: buildCookieHeader(
          sealSession(
            buildSessionPayload({
              userId: data.user.id,
              refreshToken: data.session.refresh_token,
              accessToken: data.session.access_token,
              expiresAt: data.session.expires_at,
            }),
          ),
          { requestHost },
        ),
      };
    }
  }

  return { ok: false, status: 401, error: "Not authenticated" };
}

export function requestClientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}
