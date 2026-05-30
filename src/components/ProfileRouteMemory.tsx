/**
 * ProfileRouteMemory — remembers the last visited app page per profile
 * (individual vs each team/entity) and navigates to that page when the
 * active profile changes. Without this, switching profile leaves the
 * user on the previous profile's page showing stale content until they
 * pick a new app from the nav.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

const STORAGE_PREFIX = "rl_last_path:";
const DEFAULT_PATH = "/home";

// Paths that should not be remembered as a profile's "last page".
const NON_APP_PREFIXES = [
  "/auth",
  "/login",
  "/accept-coach-invite",
  "/accept-leader-invite",
];

function profileKey(userId: string, activeEntityId: string | null): string {
  return `${STORAGE_PREFIX}${userId}:${activeEntityId ?? "__individual__"}`;
}

function isRememberablePath(path: string): boolean {
  if (!path || path === "/") return false;
  return !NON_APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function ProfileRouteMemory() {
  const { user, activeEntityId, authReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // The profile key whose URL is currently displayed. Used to detect
  // profile switches and to gate persistence so we never overwrite the
  // new profile's saved path with the previous profile's stale path.
  const activeProfileRef = useRef<string | null>(null);

  // Profile-switch handler: when activeEntityId changes, jump to that
  // profile's saved page (or /home if it has none).
  useEffect(() => {
    if (!authReady || !user) {
      activeProfileRef.current = null;
      return;
    }
    const key = profileKey(user.id, activeEntityId);

    // First run: don't override the URL the user landed on (e.g. deep link).
    if (activeProfileRef.current === null) {
      activeProfileRef.current = key;
      if (isRememberablePath(location.pathname)) {
        try {
          localStorage.setItem(key, location.pathname + location.searchStr);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (activeProfileRef.current === key) return;

    // Resolve the target for the new profile BEFORE flipping the ref —
    // that way the persist effect (which runs after this one in the same
    // render) sees the old key and skips, instead of writing the previous
    // profile's path under the new profile's key.
    let target = DEFAULT_PATH;
    try {
      const stored = localStorage.getItem(key);
      if (stored && isRememberablePath(stored.split("?")[0] ?? stored)) {
        target = stored;
      }
    } catch {
      /* ignore */
    }

    const current = location.pathname + location.searchStr;
    if (target === current) {
      // Already where we want to be — safe to claim the URL for the new
      // profile right away.
      activeProfileRef.current = key;
      return;
    }

    // Trigger navigation. We DON'T flip activeProfileRef yet — it stays
    // pointing at the old profile until the location actually changes,
    // so the persist effect skips this render. The location-change
    // re-run (after navigate) will flip it.
    void navigate({ to: target, replace: true });
  }, [
    user,
    activeEntityId,
    authReady,
    navigate,
    location.pathname,
    location.searchStr,
  ]);

  // Persist the current path under the active profile — but only when
  // the displayed URL truly belongs to that profile. If a switch is
  // in-flight (activeProfileRef still points at the previous profile),
  // we skip and just adopt the new key, so the next intra-profile
  // navigation persists correctly.
  useEffect(() => {
    if (!authReady || !user) return;
    const key = profileKey(user.id, activeEntityId);
    if (activeProfileRef.current !== key) {
      // Profile just changed — adopt the new key without writing the
      // stale path that's still on screen.
      activeProfileRef.current = key;
      return;
    }
    if (!isRememberablePath(location.pathname)) return;
    try {
      localStorage.setItem(key, location.pathname + location.searchStr);
    } catch {
      /* ignore */
    }
  }, [
    user,
    activeEntityId,
    authReady,
    location.pathname,
    location.searchStr,
  ]);

  return null;
}
