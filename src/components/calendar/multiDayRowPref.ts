/**
 * Whether the calendar multi-day / all-day row is hidden.
 * Stored on this device so it survives view changes, closing the
 * browser, and signing out.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "calendar:hideMultiDayRow";

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

export function subscribeHideMultiDayRow(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getHideMultiDayRow() {
  ensureHydrated();
  return hidden;
}

export function getHideMultiDayRowServer() {
  return false;
}

export function setHideMultiDayRow(next: boolean) {
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

export function useHideMultiDayRow() {
  return useSyncExternalStore(
    subscribeHideMultiDayRow,
    getHideMultiDayRow,
    getHideMultiDayRowServer,
  );
}
