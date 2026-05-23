/**
 * Global hover/edit lock shared across session tiles and day-note buttons.
 *
 * When any panel is in a "sticky" / editing state (session edit panel,
 * session note panel, day-note edit panel, etc.) it acquires the lock with
 * a unique id. While the lock is held by one component, others must NOT
 * open their hover previews — the user has to click outside (which the
 * holder closes on) before any other hover can open.
 *
 * The grid's local `forceEditId` is still authoritative for its own click
 * routing; this lock is purely an additional cross-component gate.
 */
import { useEffect, useState } from "react";

let owner: string | null = null;
const listeners = new Set<() => void>();

export function getHoverLock(): string | null {
  return owner;
}

export function setHoverLock(next: string | null): void {
  if (owner === next) return;
  owner = next;
  listeners.forEach((l) => l());
}

/** Release the lock only if `id` currently owns it. */
export function releaseHoverLockIf(id: string): void {
  if (owner === id) setHoverLock(null);
}

export function useHoverLock(): string | null {
  const [v, setV] = useState<string | null>(owner);
  useEffect(() => {
    const cb = () => setV(owner);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return v;
}
