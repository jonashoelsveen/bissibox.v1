// Server-only HMAC-signed cookie helpers for the bissibox_session cookie.
// Holds the Supabase refresh token (and minimal user metadata) sealed with
// BISSIBOX_SESSION_SECRET. Not encrypted — Supabase refresh tokens are already
// opaque and HTTPS-only; HMAC prevents tampering.

import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "bissibox_session";
export const EMAIL_CHANGE_COOKIE_NAME = "bissibox_email_change";

export interface SessionPayload {
  refresh_token: string;
  user_id: string;
  issued_at: number;
  access_token?: string;
  /** Unix seconds, matching Supabase `session.expires_at`. */
  expires_at?: number;
}

export function buildSessionPayload(input: {
  userId: string;
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: number | null;
}): SessionPayload {
  const payload: SessionPayload = {
    refresh_token: input.refreshToken,
    user_id: input.userId,
    issued_at: Date.now(),
  };
  if (input.accessToken) payload.access_token = input.accessToken;
  if (typeof input.expiresAt === "number" && Number.isFinite(input.expiresAt)) {
    payload.expires_at = input.expiresAt;
  }
  return payload;
}

/** True when the cookie still holds a usable access token (no refresh/rotate). */
export function cookieAccessTokenIsFresh(
  payload: SessionPayload,
  skewMs = 60_000,
): boolean {
  if (!payload.access_token) return false;
  if (typeof payload.expires_at === "number" && Number.isFinite(payload.expires_at)) {
    return payload.expires_at * 1000 > Date.now() + skewMs;
  }
  return payload.issued_at + 50 * 60 * 1000 > Date.now() + skewMs;
}

function getSecret(): string {
  const s = process.env.BISSIBOX_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") {
    return "local-dev-bissibox-session-secret";
  }
  throw new Error("BISSIBOX_SESSION_SECRET is missing or too short");
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function hostnameFromHost(host: string): string {
  return host.toLowerCase().split(":")[0] ?? "";
}

/** Cookie Domain attribute for cross-subdomain session sharing on this host. */
export function resolveSessionCookieDomain(requestHost: string | null | undefined): string | null {
  const hostname = hostnameFromHost(requestHost ?? "");
  if (!hostname) return null;

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return null;
  }

  if (hostname === "bissibox.com" || hostname.endsWith(".bissibox.com")) {
    return ".bissibox.com";
  }

  const domain = process.env.BISSIBOX_COOKIE_DOMAIN;
  if (domain && domain.length > 0) {
    const bare = domain.replace(/^\./, "").toLowerCase();
    if (hostname === bare || hostname.endsWith("." + bare)) {
      return domain.startsWith(".") ? domain : `.${domain}`;
    }
  }

  return null;
}

function sealPayload(payload: unknown): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64urlEncode(
    createHmac("sha256", getSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

function unsealPayload<T extends Record<string, unknown>>(sealed: string): T | null {
  const dot = sealed.lastIndexOf(".");
  if (dot < 0) return null;
  const body = sealed.slice(0, dot);
  const sig = sealed.slice(dot + 1);
  const expected = b64urlEncode(
    createHmac("sha256", getSecret()).update(body).digest(),
  );
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(b64urlDecode(body).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function sealSession(payload: SessionPayload): string {
  return sealPayload(payload);
}

export function unsealSession(cookie: string | undefined | null): SessionPayload | null {
  if (!cookie) return null;
  const parsed = unsealPayload<SessionPayload & { purpose?: string }>(cookie);
  if (!parsed || parsed.purpose) return null;
  if (!parsed.refresh_token || !parsed.user_id) return null;
  return parsed;
}

/** Short-lived signed token to hand a session to account.bissibox.com from another origin. */
export interface SsoTransferPayload {
  purpose: "sso";
  refresh_token: string;
  user_id: string;
  issued_at: number;
  exp: number;
  access_token?: string;
  expires_at?: number;
}

const SSO_TRANSFER_TTL_MS = 2 * 60 * 1000;

export function sealSsoTransfer(input: {
  refresh_token: string;
  user_id: string;
  access_token?: string;
  expires_at?: number;
}): string {
  const payload: SsoTransferPayload = {
    purpose: "sso",
    refresh_token: input.refresh_token,
    user_id: input.user_id,
    issued_at: Date.now(),
    exp: Date.now() + SSO_TRANSFER_TTL_MS,
  };
  if (input.access_token) payload.access_token = input.access_token;
  if (typeof input.expires_at === "number") payload.expires_at = input.expires_at;
  return sealPayload(payload);
}

export function unsealSsoTransfer(token: string | null | undefined): SsoTransferPayload | null {
  if (!token) return null;
  const parsed = unsealPayload<SsoTransferPayload>(token);
  if (!parsed || parsed.purpose !== "sso") return null;
  if (!parsed.refresh_token || !parsed.user_id) return null;
  if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
  return parsed;
}

export interface EmailChangeChallenge {
  purpose: "email_change";
  user_id: string;
  email: string;
  attempt_id: string;
  exp: number;
}

const EMAIL_CHANGE_TTL_MS = 10 * 60 * 1000;

export function sealEmailChangeChallenge(
  payload: Omit<EmailChangeChallenge, "purpose">,
): string {
  return sealPayload({ purpose: "email_change", ...payload });
}

export function unsealEmailChangeChallenge(
  cookie: string | null | undefined,
): EmailChangeChallenge | null {
  if (!cookie) return null;
  const parsed = unsealPayload<EmailChangeChallenge>(cookie);
  if (!parsed || parsed.purpose !== "email_change") return null;
  if (!parsed.user_id || !parsed.email || !parsed.attempt_id) return null;
  if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
  return parsed;
}

export function buildCookieHeader(
  value: string,
  opts: {
    maxAge?: number;
    clear?: boolean;
    requestHost?: string | null;
    name?: string;
  } = {},
): string {
  const parts: string[] = [`${opts.name ?? SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`];
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  const hostname = hostnameFromHost(opts.requestHost ?? "");
  const isLocalDev =
    hostname === "" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.startsWith("127.0.0.1") ||
    hostname.endsWith(".local");
  if (!isLocalDev) {
    parts.push("Secure");
  }
  const cookieDomain = resolveSessionCookieDomain(opts.requestHost ?? "");
  if (cookieDomain) {
    parts.push(`Domain=${cookieDomain}`);
  }
  if (opts.clear) {
    parts.push("Max-Age=0");
  } else if (opts.maxAge !== undefined) {
    parts.push(`Max-Age=${opts.maxAge}`);
  } else {
    // ~30 days — matches Supabase refresh token lifetime
    parts.push(`Max-Age=${60 * 60 * 24 * 30}`);
  }
  return parts.join("; ");
}

export function readCookieFromHeader(cookieHeader: string | null): string | null {
  return readNamedCookie(cookieHeader, SESSION_COOKIE_NAME);
}

export function readNamedCookie(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) {
      const raw = part.slice(eq + 1);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}
