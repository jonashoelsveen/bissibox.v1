import {
  getAccountUrl,
  getAppSurface,
  getCloudUrl,
} from "@/lib/app-surface";
import { markCalendarSignedOut } from "@/lib/calendarSessionPersist";

const FORCED_LOGOUT_KEY = "aponna:forced-logout";
const CHANNEL_NAME = "aponna-auth";
const SESSION_COOKIE = "aponna_session";

function isAlreadyOnLoggedOutHome(): boolean {
  if (typeof window === "undefined") return true;
  const surface = getAppSurface();
  const path = window.location.pathname || "/";
  if (path !== "/" && path !== "") return false;
  return surface === "account" || surface === "cloud";
}

/** Send this tab to the logged-out Cloud or Account home for its surface. */
export function redirectToLoggedOutHome(): void {
  if (typeof window === "undefined") return;
  if (isAlreadyOnLoggedOutHome()) return;
  const dest = getAppSurface() === "account" ? getAccountUrl() : getCloudUrl();
  window.location.replace(dest);
}

/** Tell other same-origin tabs to log out immediately. */
export function broadcastForcedLogout(): void {
  if (typeof window === "undefined") return;
  markCalendarSignedOut();
  const token = String(Date.now());
  try {
    window.localStorage.setItem(FORCED_LOGOUT_KEY, token);
  } catch {
    /* ignore */
  }
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: "logout", token });
    ch.close();
  } catch {
    /* ignore */
  }
}

/**
 * Run `onLogout` in other tabs when this browser signs out or deletes the
 * account. Same-origin uses BroadcastChannel + storage. Cookie Store covers
 * shared `.aponna.com` session cookies across Cloud / Account hosts when
 * the browser supports it.
 */
export function subscribeForcedLogout(onLogout: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.storageArea !== window.localStorage) return;
    if (e.key === FORCED_LOGOUT_KEY && e.newValue) onLogout();
  };
  window.addEventListener("storage", onStorage);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "logout") onLogout();
    };
  } catch {
    channel = null;
  }

  const onCookieChange = (ev: Event) => {
    const detail = ev as Event & {
      deleted?: Array<{ name?: string }>;
      changed?: Array<{ name?: string }>;
    };
    const isSession = (c: { name?: string }) => c.name === SESSION_COOKIE;
    const gone = (detail.deleted ?? []).some(isSession);
    const replaced = (detail.changed ?? []).some(isSession);
    // Rotation is delete+set; only treat as logout when the cookie is gone
    // and not immediately replaced.
    if (gone && !replaced) onLogout();
  };
  const store = (window as unknown as { cookieStore?: EventTarget }).cookieStore;
  store?.addEventListener("change", onCookieChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
    store?.removeEventListener("change", onCookieChange);
  };
}
