/**
 * Calendar colour theme. Light is the existing paint.
 * Remembered on this device across reloads, closing the page, and the
 * next sign-in. Sign-out does not clear it.
 */

import { useLayoutEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "calendar:theme";
const COOKIE_NAME = "calendar-theme";
/** 400 days. Browsers cap persistent cookies here. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export type CalendarTheme = "light" | "dark";

/**
 * Runs in <head> before the app boots, so a reload paints the saved theme
 * instead of flashing light and then correcting it.
 */
export const CALENDAR_THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(STORAGE_KEY)};var t=null;try{t=localStorage.getItem(k)}catch(e){}if(t!=="dark"&&t!=="light"){var m=document.cookie.match(/(?:^|; )${COOKIE_NAME}=(light|dark)(?:;|$)/);if(m){t=m[1];try{localStorage.setItem(k,t)}catch(e){}}else{t="light"}}document.documentElement.setAttribute("data-calendar-theme",t);}catch(e){}})();`;

let theme: CalendarTheme = "light";
let hydrated = false;
const listeners = new Set<() => void>();

function isTheme(value: string | null | undefined): value is CalendarTheme {
  return value === "light" || value === "dark";
}

function readCookie(): CalendarTheme | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=(light|dark)(?:;|$)`),
  );
  return match && isTheme(match[1]) ? match[1] : null;
}

function writeCookie(next: CalendarTheme) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${next}; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

function readStored(): CalendarTheme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    /* private mode */
  }
  const cookie = readCookie();
  if (cookie) {
    try {
      window.localStorage.setItem(STORAGE_KEY, cookie);
    } catch {
      /* ignore */
    }
    return cookie;
  }
  return "light";
}

function persist(next: CalendarTheme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  writeCookie(next);
}

function applyTheme(next: CalendarTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.calendarTheme = next;
}

function adopt(next: CalendarTheme) {
  const changed = theme !== next;
  theme = next;
  applyTheme(next);
  if (changed) emit();
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  theme = readStored();
  hydrated = true;
  applyTheme(theme);
  // Repair the cookie if an older visit only wrote localStorage.
  if (readCookie() !== theme) writeCookie(theme);
  window.addEventListener("storage", (event) => {
    if (event.storageArea !== window.localStorage || event.key !== STORAGE_KEY) return;
    if (!isTheme(event.newValue)) return;
    adopt(event.newValue);
    if (readCookie() !== event.newValue) writeCookie(event.newValue);
  });
  window.addEventListener("pageshow", () => {
    adopt(readStored());
  });
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeCalendarTheme(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getCalendarTheme(): CalendarTheme {
  ensureHydrated();
  return theme;
}

export function getCalendarThemeServer(): CalendarTheme {
  return "light";
}

export function setCalendarTheme(next: CalendarTheme) {
  ensureHydrated();
  const changed = theme !== next;
  theme = next;
  persist(next);
  applyTheme(next);
  if (changed) emit();
}

export function useCalendarTheme() {
  const value = useSyncExternalStore(
    subscribeCalendarTheme,
    getCalendarTheme,
    getCalendarThemeServer,
  );
  useLayoutEffect(() => {
    applyTheme(getCalendarTheme());
  }, [value]);
  return value;
}
