/**
 * Individual profile display name (`profiles.display_name`).
 * Shared across the profile menu and profile settings modal.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { clipProfileName, persistOptionalText } from "@/lib/profileName";

type Snapshot = { userId: string | null; name: string };

let snapshot: Snapshot = { userId: null, name: "" };
const listeners = new Set<() => void>();
let loadedFor: string | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistSeq = 0;

function emit() {
  listeners.forEach((l) => l());
}

function setSnapshot(next: Snapshot) {
  snapshot = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

async function persist(userId: string, name: string) {
  const seq = ++persistSeq;
  const display_name = persistOptionalText(name);
  const { error } = await supabase.from("profiles").update({ display_name }).eq("id", userId);
  if (error || seq !== persistSeq) return;
}

export function useProfileDisplayName(): {
  displayName: string;
  personalName: string;
  setDisplayName: (value: string) => void;
} {
  const { user } = useAuth();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      loadedFor = null;
      setSnapshot({ userId: null, name: "" });
      return;
    }
    if (loadedFor === userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      loadedFor = userId;
      const name = typeof data?.display_name === "string" ? data.display_name : "";
      setSnapshot({ userId, name });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setDisplayName = useCallback(
    (value: string) => {
      if (!userId) return;
      const name = clipProfileName(value);
      setSnapshot({ userId, name });
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        void persist(userId, name);
      }, 400);
    },
    [userId],
  );

  const timerRef = useRef(persistTimer);
  timerRef.current = persistTimer;
  useEffect(
    () => () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
    },
    [],
  );

  const displayName = state.userId === userId ? state.name : "";
  return {
    displayName,
    personalName: displayName.trim() ? displayName : "Me",
    setDisplayName,
  };
}
