/**
 * Local in-browser store for user-created groups. Backend wiring will
 * follow; for now we persist to localStorage and broadcast changes via a
 * custom event so any component using `useLocalGroups` stays in sync.
 */
import { useEffect, useState } from "react";

export interface LocalGroup {
  id: string;
  name: string;
}

const KEY = "aponna:local-groups";
const EVENT = "aponna:local-groups-changed";

function read(): LocalGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is LocalGroup =>
        !!g && typeof (g as LocalGroup).id === "string" && typeof (g as LocalGroup).name === "string",
    );
  } catch {
    return [];
  }
}

function write(groups: LocalGroup[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(groups));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function addLocalGroup(name: string): LocalGroup {
  const group: LocalGroup = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
  };
  const next = [...read(), group];
  write(next);
  return group;
}

export function useLocalGroups(): LocalGroup[] {
  const [groups, setGroups] = useState<LocalGroup[]>(() => read());
  useEffect(() => {
    const sync = () => setGroups(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return groups;
}
