/**
 * Per-scope client-side preferences for the library.
 * Stored in localStorage so the user controls them per-account / per-entity.
 *
 * Two responsibilities live here today:
 *   1. Autosave toggles for Notes and Meetings (default OFF).
 *   2. Profile visibility checklist (Memberships / Groups / Members / Events / Media / Contact).
 *
 * Components subscribe via `useLibrarySetting(key, default)` which re-renders
 * when the underlying value changes (including in other tabs/components).
 */

import { useEffect, useState, useCallback } from "react";

const EVENT = "library-settings:change";

export function readSetting<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeSetting<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
  } catch {
    /* ignore */
  }
}

export function useLibrarySetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => readSetting<T>(key, fallback));
  useEffect(() => {
    // Re-read whenever the key changes so subscribers tracking a dynamic key
    // (e.g. per-scope settings) reflect the new key's value immediately.
    setVal(readSetting<T>(key, fallback));
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ key: string }>;
      if (!ce.detail || ce.detail.key === key) {
        setVal(readSetting<T>(key, fallback));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setVal(readSetting<T>(key, fallback));
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback(
    (v: T) => {
      writeSetting(key, v);
      setVal(v);
    },
    [key],
  );
  return [val, set];
}

/* ───────── autosave keys ───────── */

export const notesAutosaveKey = (scope: string) => `library:autosave:notes:${scope}`;
export const meetingsAutosaveKey = (scope: string) => `library:autosave:meetings:${scope}`;
export const diaryAutosyncKey = (scope: string) => `diary:autosync:${scope}`;

/* ───────── profile visibility ───────── */

export const PROFILE_VISIBILITY_ITEMS = [
  "Memberships",
  "Groups",
  "Members",
  "Events",
  "Media",
  "Contact",
] as const;
export type ProfileVisibilityItem = (typeof PROFILE_VISIBILITY_ITEMS)[number];

export const profileVisibilityKey = (scopeKey: string) => `profile-visibility:${scopeKey}`;

export function useProfileVisibility(scopeKey: string) {
  const fallback = Object.fromEntries(
    PROFILE_VISIBILITY_ITEMS.map((i) => [i, true]),
  ) as Record<ProfileVisibilityItem, boolean>;
  return useLibrarySetting<Record<ProfileVisibilityItem, boolean>>(
    profileVisibilityKey(scopeKey),
    fallback,
  );
}

/* ───────── unsaved confirmation ─────────
 * The note/meeting editors register their dirty state + a saver here so that
 * the host (media.tsx) can prompt before closing a tab without saving.
 */

type UnsavedHandle = {
  isDirty: () => boolean;
  isNew: () => boolean;
  title: () => string;
  save: () => Promise<void>;
  discard: () => Promise<void>;
};
const handles = new Map<string, UnsavedHandle>();

export function registerUnsaved(id: string, handle: UnsavedHandle): () => void {
  handles.set(id, handle);
  return () => {
    if (handles.get(id) === handle) handles.delete(id);
  };
}
export function getUnsaved(id: string): UnsavedHandle | undefined {
  return handles.get(id);
}
