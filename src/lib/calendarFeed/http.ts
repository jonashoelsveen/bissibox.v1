import { FeedError, type FeedErrorCode } from "./types.ts";

function hostIsApp(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1") return true;
  if (host === "bissibox.com" || host.endsWith(".bissibox.com")) return true;
  if (host === "bissiboxcloud.com" || host.endsWith(".bissiboxcloud.com")) return true;
  return false;
}

function originAllowed(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "::1") {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    if (url.protocol !== "https:") return false;
    return hostIsApp(host);
  } catch {
    return false;
  }
}

/** The page that loaded this app. A pasted feed URL is not an origin. */
function sameSite(request: Request, origin: string): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const forwarded = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwarded && originUrl.host.toLowerCase() === forwarded) return true;
  try {
    return new URL(request.url).origin === originUrl.origin;
  } catch {
    return false;
  }
}

function acceptOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (originAllowed(origin) || sameSite(request, origin)) return origin;
  return "";
}

export function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = acceptOrigin(request);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  return headers;
}

export function rejectDisallowedOrigin(request: Request): Response | null {
  if (acceptOrigin(request) !== "") return null;
  return json(request, { error: "Origin not allowed" }, 403);
}

export function json(request: Request, data: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "private, no-store");
  if (extra) {
    new Headers(extra).forEach((value, key) => headers.append(key, value));
  }
  return new Response(JSON.stringify(data), { status, headers });
}

const STATUS: Partial<Record<FeedErrorCode, number>> = {
  invalid_url: 400,
  forbidden_host: 400,
  not_calendar: 400,
  parse_failed: 400,
  too_large: 413,
  rate_limited: 429,
  forbidden: 403,
  timeout: 504,
  unreachable: 502,
};

export function feedErrorJson(request: Request, error: unknown): Response {
  if (error instanceof FeedError) {
    if (error.message === "Calendar not found.") return json(request, { error: error.message }, 404);
    return json(request, { error: error.message, code: error.code }, STATUS[error.code] ?? 502);
  }
  console.error("[calendar feed]", error instanceof Error ? error.name : "error");
  return json(request, { error: "The calendar could not be reached.", code: "unreachable" }, 502);
}
