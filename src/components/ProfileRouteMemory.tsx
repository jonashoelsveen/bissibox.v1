/**
 * ProfileRouteMemory — remembers the last visited app page per profile
 * (individual vs each team/entity) and navigates to that page when the
 * active profile changes. Without this, switching profile leaves the user
 * on the previous profile's page showing stale content until they pick a
 * new app from the nav.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

const STORAGE_PREFIX = "rl_last_path:";
const DEFAULT_PATH = "/home";

// Routes that should not be remembered as a profile's "last page" — these
// are auth flows, the bare root, or transient redirects.
const NON_APP_PREFIXES = ["/auth", "/login", "/accept-coach-invite", "/accept-leader-invite"];

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
  const prevProfileRef = useRef<string | null>(null);

  // Persist current path under the active profile's key.
  useEffect(() => {
    if (!authReady || !user) return;
    const path = location.pathname + location.searchStr;
    if (!isRememberablePath(location.pathname)) return;
    try {
      localStorage.setItem(profileKey(user.id, activeEntityId), path);
    } catch {
      /* ignore */
    }
  }, [user, activeEntityId, authReady, location.pathname, location.searchStr]);

  // When the active profile changes, navigate to that profile's last page.
  useEffect(() => {
    if (!authReady || !user) {
      prevProfileRef.current = null;
      return;
    }
    const key = profileKey(user.id, activeEntityId);
    if (prevProfileRef.current === null) {
      // First run after auth ready — just record current profile, don't
      // override the URL the user landed on (e.g. via a deep link).
      prevProfileRef.current = key;
      return;
    }
    if (prevProfileRef.current === key) return;
    prevProfileRef.current = key;

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
    if (target === current) return;
    void navigate({ to: target, replace: true });
  }, [user, activeEntityId, authReady, navigate, location.pathname, location.searchStr]);

  return null;
}
