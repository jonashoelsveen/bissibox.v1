/**
 * Whether the calendar hour scale is hidden on day and week.
 * Stored on this device so the left-panel setting and the grid
 * stay in step across views, closing the browser, and signing out.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "calendar:hideTimeScale";

let hidden = false;
let hydrated = false;
const listeners = new Set<() => void>();

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hidden = readStored();
  hydrated = true;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeHideTimeScale(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getHideTimeScale() {
  ensureHydrated();
  return hidden;
}

export function getHideTimeScaleServer() {
  return false;
}

export function setHideTimeScale(next: boolean) {
  ensureHydrated();
  if (hidden === next) return;
  hidden = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  emit();
}

export function useHideTimeScale() {
  return useSyncExternalStore(
    subscribeHideTimeScale,
    getHideTimeScale,
    getHideTimeScaleServer,
  );
}
