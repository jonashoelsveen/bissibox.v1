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
  // The profile key that the current URL "belongs to" — i.e. the profile
  // that was active the last time we either persisted or navigated. Used
  // to detect a profile switch and to avoid mis-attributing the previous
  // profile's path to the newly-activated one.
  const currentProfileRef = useRef<string | null>(null);

  // Handle profile switches: navigate to the new profile's last page (or
  // /home) BEFORE persisting anything. Runs first so persistence sees the
  // post-navigation path.
  useEffect(() => {
    if (!authReady || !user) {
      currentProfileRef.current = null;
      return;
    }
    const key = profileKey(user.id, activeEntityId);

    // First run after auth ready — record current profile but don't
    // override the URL the user landed on (e.g. via a deep link).
    if (currentProfileRef.current === null) {
      currentProfileRef.current = key;
      // Seed storage with the landed path so a switch-and-return restores it.
      const path = location.pathname + location.searchStr;
      if (isRememberablePath(location.pathname)) {
        try { localStorage.setItem(key, path); } catch { /* ignore */ }
      }
      return;
    }

    if (currentProfileRef.current === key) return;
    // Profile changed → resolve target for the new profile.
    currentProfileRef.current = key;

    let target = DEFAULT_PATH;
    try {
      const stored = localStorage.getItem(key);
      if (stored && isRememberablePath(stored.split("?")[0] ?? stored)) {
        target = stored;
      }
    } catch { /* ignore */ }

    const current = location.pathname + location.searchStr;
    if (target !== current) {
      void navigate({ to: target, replace: true });
    }
  }, [user, activeEntityId, authReady, navigate, location.pathname, location.searchStr]);

  // Persist current path under the active profile's key — but only when
  // the URL change happened WITHIN a profile (not as a side-effect of the
  // switch itself, which would overwrite the new profile's memory with
  // the previous profile's last page).
  useEffect(() => {
    if (!authReady || !user) return;
    const key = profileKey(user.id, activeEntityId);
    if (currentProfileRef.current !== key) return; // mid-switch, skip
    if (!isRememberablePath(location.pathname)) return;
    const path = location.pathname + location.searchStr;
    try {
      localStorage.setItem(key, path);
    } catch { /* ignore */ }
  }, [user, activeEntityId, authReady, location.pathname, location.searchStr]);

  return null;
}
