// Server-only HMAC-signed cookie helpers for the aponna_session cookie.
// Holds the Supabase refresh token (and minimal user metadata) sealed with
// APONNA_SESSION_SECRET. Not encrypted — Supabase refresh tokens are already
// opaque and HTTPS-only; HMAC prevents tampering.

import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "aponna_session";

export interface SessionPayload {
  refresh_token: string;
  user_id: string;
  issued_at: number;
}

function getSecret(): string {
  const s = process.env.APONNA_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("APONNA_SESSION_SECRET is missing or too short");
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function sealSession(payload: SessionPayload): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64urlEncode(
    createHmac("sha256", getSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

export function unsealSession(cookie: string | undefined | null): SessionPayload | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 0) return null;
  const body = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
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
    return JSON.parse(b64urlDecode(body).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
}

export function buildCookieHeader(
  value: string,
  opts: { maxAge?: number; clear?: boolean; requestHost?: string | null } = {},
): string {
  const parts: string[] = [`${SESSION_COOKIE_NAME}=${value}`];
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  // Always Secure — Lovable preview and prod are both HTTPS.
  parts.push("Secure");
  const domain = process.env.APONNA_COOKIE_DOMAIN;
  // Only attach Domain when the current request host is actually a
  // subdomain of the configured cookie domain. On Lovable preview hosts
  // (*.lovableproject.com / *.lovable.app) a Domain=.aponna.com cookie
  // would be silently dropped by the browser, causing /api/auth/session
  // to 401 on every page load and the top tab-bar to never render.
  if (domain && domain.length > 0) {
    const host = (opts.requestHost ?? "").toLowerCase();
    const bare = domain.replace(/^\./, "").toLowerCase();
    if (host === bare || host.endsWith("." + bare)) {
      parts.push(`Domain=${domain}`);
    }
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
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq);
    if (name === SESSION_COOKIE_NAME) return part.slice(eq + 1);
  }
  return null;
}
