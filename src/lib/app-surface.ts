import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Canonical production account URL (menu label / explicit env target). */
export const ACCOUNT_URL_PRODUCTION = "https://account.bissibox.com";

/** Cookie + session flag for same-origin account surface (`?surface=account`). */
export const ACCOUNT_SURFACE_COOKIE = "bissibox_surface";
const ACCOUNT_SURFACE_STORAGE_KEY = "bissibox_app_surface";

const ACCOUNT_HOSTS = new Set(["account.bissibox.com", "account.localhost"]);

function hostnameFromHost(host: string): string {
  return host.toLowerCase().split(":")[0] ?? "";
}

/** Production + local dev hostnames for the account surface. */
export function isAccountHost(host: string): boolean {
  const h = hostnameFromHost(host);
  if (ACCOUNT_HOSTS.has(h)) return true;
  const override = import.meta.env.VITE_ACCOUNT_HOST?.toLowerCase();
  if (override && h === override) return true;
  return false;
}

function hasAccountSurfaceQuery(search: string): boolean {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("surface") === "account";
}

const ACCOUNT_SECTION_PREFIXES = [
  "/me",
  "/profiles",
  "/family",
  "/login-security-contact",
  "/storage",
  "/subscriptions",
  "/account",
];

function normalizePathname(pathname?: string): string {
  const path =
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Account-only routes. These are the account surface even without
 * `?surface=account` or a sticky cookie, so a copied `/me` (etc.) URL still
 * opens Account when pasted in Incognito.
 */
export function isAccountSectionPath(pathname?: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/") return false;
  return ACCOUNT_SECTION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Same-origin account mode: `?surface=account` or an account-only path.
 * Cloud apps (`/calendar`, `/entity`, …) must never inherit a leftover flag
 * from opening account or duplicating a tab.
 */
function hasClientAccountSurfacePreference(search?: string, pathname?: string): boolean {
  const q = search ?? (typeof window !== "undefined" ? window.location.search : "");
  if (hasAccountSurfaceQuery(q)) return true;
  return isAccountSectionPath(pathname);
}

function canPersistAccountSurface(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isAccountHost(window.location.hostname) ||
    hasAccountSurfaceQuery(window.location.search) ||
    isAccountSectionPath(window.location.pathname)
  );
}

/** Resolve surface from explicit host/search/path/cookie inputs (SSR-safe). */
export function resolveAppSurface(opts: {
  host: string;
  search?: string;
  pathname?: string;
  surfaceCookie?: boolean;
}): "cloud" | "account" {
  if (opts.host && isAccountHost(opts.host)) return "account";
  if (opts.search && hasAccountSurfaceQuery(opts.search)) return "account";
  if (isAccountSectionPath(opts.pathname)) return "account";
  return "cloud";
}

/** Remember same-origin account mode across account-section navigations (e.g. /?surface=account → /me). */
export function preferAccountSurface(): void {
  if (typeof document === "undefined") return;
  if (!canPersistAccountSurface()) return;
  document.cookie = `${ACCOUNT_SURFACE_COOKIE}=account; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  try {
    sessionStorage.setItem(ACCOUNT_SURFACE_STORAGE_KEY, "account");
  } catch {
    /* ignore */
  }
}

/** Leave same-origin account mode when returning to cloud. */
export function clearAccountSurfacePreference(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ACCOUNT_SURFACE_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
  try {
    sessionStorage.removeItem(ACCOUNT_SURFACE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Client-oriented surface resolver. On the server, prefer router context
 * (`appSurface`) set by the root `beforeLoad` — this falls back to window/host
 * only, so SSR callers should use context or `resolveAppSurface`.
 */
export function getAppSurface(host?: string): "cloud" | "account" {
  if (typeof window !== "undefined") {
    const resolved = host ?? window.location.hostname;
    if (resolved && isAccountHost(resolved)) return "account";
    if (hasClientAccountSurfacePreference()) return "account";
    return "cloud";
  }
  if (host && isAccountHost(host)) return "account";
  return "cloud";
}

/**
 * Recompute surface from the live URL and drop leftover same-origin flags when
 * this tab is on Cloud (so duplicating a tab or returning from Account cannot
 * leave Account chrome on `/calendar` and other Cloud routes).
 */
function syncLiveAppSurface(): "cloud" | "account" {
  if (typeof window === "undefined") return "cloud";
  const stayOnAccount =
    isAccountHost(window.location.hostname) ||
    hasAccountSurfaceQuery(window.location.search) ||
    isAccountSectionPath(window.location.pathname);
  if (!stayOnAccount) {
    clearAccountSurfacePreference();
  }
  const next = getAppSurface();
  if (next === "account" && hasAccountSurfaceQuery(window.location.search)) {
    preferAccountSurface();
  }
  return next;
}

/** Client hook — follows host, query, and router location (including back/forward). */
export function useAppSurface(initial?: "cloud" | "account"): "cloud" | "account" {
  const locationKey = useRouterState({
    select: (s) => `${s.location.pathname}|${s.location.searchStr}`,
  });
  const [surface, setSurface] = useState<"cloud" | "account">(() => {
    // On the client, always trust the live host/query/cookie — SSR context can
    // miss account.localhost when the request URL host isn't in location.href.
    if (typeof window !== "undefined") return getAppSurface();
    return initial ?? "cloud";
  });
  useEffect(() => {
    setSurface(syncLiveAppSurface());
  }, [locationKey]);
  useEffect(() => {
    const onResume = () => setSurface(syncLiveAppSurface());
    window.addEventListener("pageshow", onResume);
    window.addEventListener("popstate", onResume);
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("popstate", onResume);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, []);
  return surface;
}

export function isAccountApp(): boolean {
  return getAppSurface() === "account";
}

/**
 * URL for the account apps-menu link.
 * - Explicit VITE_ACCOUNT_URL / ACCOUNT_URL when set (e.g. https://account.bissibox.com)
 * - Otherwise same-origin `?surface=account` so the link works before account DNS exists
 *   and avoids cross-subdomain local-dev issues
 */
export function getAccountUrl(): string {
  if (typeof window !== "undefined") {
    const { protocol, port, hostname } = window.location;
    return accountUrlFromParts(protocol, hostname, port);
  }

  const override = process.env.VITE_ACCOUNT_URL ?? process.env.ACCOUNT_URL;
  if (override) return override;

  return ACCOUNT_URL_PRODUCTION;
}

/** Cloud home URL for the apps-menu (opposite of getAccountUrl). */
export function getCloudUrl(): string {
  if (typeof window === "undefined") return "/";
  const { protocol, port, hostname } = window.location;
  const portSuffix = port ? `:${port}` : "";

  if (hostname === "account.localhost") {
    return `${protocol}//localhost${portSuffix}/`;
  }
  if (isAccountHost(hostname)) {
    const cloudOverride = import.meta.env.VITE_CLOUD_URL;
    if (cloudOverride) return cloudOverride;
    return "https://bissiboxcloud.com/";
  }
  return `${protocol}//${hostname}${portSuffix}/`;
}

/** @deprecated Use getAccountUrl() — kept for imports that expect a constant name. */
export const ACCOUNT_URL = ACCOUNT_URL_PRODUCTION;

/**
 * True when the account surface reads the same `bissibox_session` cookie as the
 * current host (localhost ↔ account.localhost, or *.bissibox.com siblings).
 */
export function accountSessionSharesCookie(hostname?: string): boolean {
  const h = (
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "bissibox.com" || h.endsWith(".bissibox.com")) return true;
  // Same-origin account mode shares the host cookie automatically.
  if (!import.meta.env.VITE_ACCOUNT_URL) return true;
  return false;
}

/** Apps-menu link to account — SSO handoff when cloud session cannot cross domains. */
export function getAccountLinkUrl(isLoggedIn: boolean): string {
  if (typeof window !== "undefined" && isLoggedIn && !accountSessionSharesCookie()) {
    return "/api/auth/sso/redirect";
  }
  return getAccountUrl();
}

/** Navigate to the account surface from the apps menu (new browser tab). */
export function openAccountSurfaceInNewTab(isLoggedIn: boolean): void {
  void (async () => {
    if (typeof window === "undefined") return;
    if (isLoggedIn) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (session?.access_token && session.refresh_token) {
          await fetch("/api/auth/session", {
            method: "POST",
            credentials: "include",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
            }),
          });
        }
      } catch {
        /* still open Account */
      }
    }
    window.open(getAccountLinkUrl(isLoggedIn), "_blank", "noopener,noreferrer");
  })();
}

/** @deprecated Prefer openAccountSurfaceInNewTab — kept for any same-tab callers. */
export function navigateToAccountSurface(isLoggedIn: boolean): void {
  openAccountSurfaceInNewTab(isLoggedIn);
}

/** Navigate to the cloud surface from the apps menu (same tab). */
export function navigateToCloudSurface(): void {
  clearAccountSurfacePreference();
  window.location.assign(getCloudUrl());
}

/**
 * Search for the logged-out account home. Same-origin account mode must keep
 * `?surface=account` because `/` is not an account section path — without it,
 * Cloud home mounts and clears the sticky flag. The dedicated account host
 * does not need the query.
 */
export function accountHomeSearch(): { surface?: "account" } {
  if (typeof window !== "undefined" && isAccountHost(window.location.hostname)) {
    return {};
  }
  return { surface: "account" };
}

function accountUrlFromParts(protocol: string, hostname: string, port: string): string {
  const portSuffix = port ? `:${port}` : "";
  const clientOverride =
    typeof import.meta !== "undefined" ? import.meta.env.VITE_ACCOUNT_URL : undefined;
  if (clientOverride) return clientOverride;

  // Already on the account host — stay there.
  if (isAccountHost(hostname)) {
    return `${protocol}//${hostname}${portSuffix}/`;
  }

  // Same-origin account surface. Works in local/dev and in production before
  // account.bissibox.com DNS is configured. Set VITE_ACCOUNT_URL to force the
  // dedicated account host when it is live.
  return `${protocol}//${hostname}${portSuffix}/?surface=account`;
}

/** Resolve account URL on the server from an incoming request (SSO redirects). */
export function getAccountUrlFromRequest(request: Request): string {
  const envOverride = process.env.VITE_ACCOUNT_URL ?? process.env.ACCOUNT_URL;
  if (envOverride) return envOverride;

  const url = new URL(request.url);
  return accountUrlFromParts(url.protocol, url.hostname, url.port);
}

export function getAccountSsoRedeemUrl(transferToken: string, accountBase: string): string {
  const base = accountBase.replace(/\/$/, "");
  return `${base}/api/auth/sso/redeem?t=${encodeURIComponent(transferToken)}`;
}

export function surfaceCookieFromHeader(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(/;\s*/).some((part) => {
    const eq = part.indexOf("=");
    if (eq < 0) return false;
    return (
      part.slice(0, eq) === ACCOUNT_SURFACE_COOKIE && part.slice(eq + 1) === "account"
    );
  });
}
