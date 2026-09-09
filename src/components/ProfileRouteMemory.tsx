/**
 * ProfileRouteMemory — remembers the last visited app page per profile
 * and navigates to it when the active profile changes.
 *
 * Route permissions are enforced here: a stored path is only restored if
 * it is allowed for the target profile type. This is the single source of
 * truth for per-profile navigation — nothing else should navigate on
 * profile switch.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { isEntityFeatureEnabled, type FeatureFlag } from "@/lib/features";

// ─── Route permission registry ────────────────────────────────────────────────
// Add future routes here as the platform grows (e.g. /journal, /health).
// "individual" = activeEntityId is null (personal mode)
// "entity"     = activeEntityId is a team/company/cooperation id
//
// A prefix listed under "individual" only is NEVER restored for entity profiles
// (e.g. /diary is personal; a coach switching to their team must not land there).
// A prefix listed under "entity" only is NEVER restored for individual mode.
// A prefix listed under both is available in all modes.

type ProfileType = "individual" | "entity";

interface RoutePermission {
  prefix: string;
  allowed: ProfileType[];
  /** Exact match only (no prefix check). Default false. */
  exact?: boolean;
  /** When set, the route is only restoreable if this local flag is on. */
  feature?: FeatureFlag;
}

const ROUTE_PERMISSIONS: RoutePermission[] = [
  // Shared — available in all profile types
  { prefix: "/", allowed: ["individual", "entity"], exact: true }, // marketing home (logged-in users are sent to calendar)
  { prefix: "/calendar", allowed: ["individual", "entity"] },
  { prefix: "/projects", allowed: ["individual", "entity"], feature: "projectsApp" },
  { prefix: "/media",    allowed: ["individual", "entity"] },
  { prefix: "/events",   allowed: ["individual", "entity"], feature: "eventsApp" },
  { prefix: "/profile",  allowed: ["individual", "entity"] },
  /** Invite landing — Bucket A: currently live, hidden this round. */
  { prefix: "/accept-entity-invite", allowed: ["individual", "entity"], feature: "entityInviteFlow" },

  // Entity-only — the Entity app has no individual workspace.
  /** Entity workspace — Bucket A: currently live, hidden this round. */
  { prefix: "/entity", allowed: ["entity"], feature: "entityWorkspace" },
  /** Entity memberships — Bucket A: currently live, hidden this round. */
  { prefix: "/family", allowed: ["individual", "entity"], feature: "entityMembershipManagement" },
  /** Entities marketing page — Bucket A: currently live, hidden this round. */
  { prefix: "/cloud/entities", allowed: ["individual", "entity"], feature: "entityMarketing" },

  // Individual-only — Clients lives on the personal profile.
  { prefix: "/clients",  allowed: ["individual"], feature: "clientsApp" },
];

const DEFAULT_INDIVIDUAL_PATH = "/calendar";
const DEFAULT_ENTITY_PATH     = "/calendar";

function profileType(activeEntityId: string | null): ProfileType {
  return activeEntityId ? "entity" : "individual";
}

function defaultPath(activeEntityId: string | null): string {
  return activeEntityId ? DEFAULT_ENTITY_PATH : DEFAULT_INDIVIDUAL_PATH;
}

/** Returns true if `path` is permitted for the given profile type. */
function isAllowedForProfile(path: string, type: ProfileType): boolean {
  for (const rule of ROUTE_PERMISSIONS) {
    const matches = rule.exact ? path === rule.prefix : (path === rule.prefix || path.startsWith(rule.prefix + "/"));
    if (matches) {
      if (rule.feature && !isEntityFeatureEnabled(rule.feature)) return false;
      return rule.allowed.includes(type);
    }
  }
  // Unknown route — treat as shared (safe default; tightening can be done per-route above)
  return true;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_PREFIX = "rl_last_path:";

const NON_APP_PREFIXES = ["/auth", "/login", "/mail", "/accept-coach-invite", "/accept-leader-invite"];

function profileKey(userId: string, activeEntityId: string | null): string {
  return `${STORAGE_PREFIX}${userId}:${activeEntityId ?? "__individual__"}`;
}

function isRememberablePath(path: string): boolean {
  if (!path) return false;
  if (path === "/") return false; // marketing landing — logged-in default is /calendar
  return !NON_APP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Load the stored path for a profile. If the stored path is not permitted
 * for that profile type, fall back to the profile's default home.
 */
function resolveAllowedTarget(userId: string, activeEntityId: string | null): string {
  const type = profileType(activeEntityId);
  const fallback = defaultPath(activeEntityId);
  try {
    const stored = localStorage.getItem(profileKey(userId, activeEntityId));
    if (!stored) return fallback;
    const storedPath = stored.split("?")[0] ?? stored;
    if (!isRememberablePath(storedPath)) return fallback;
    if (!isAllowedForProfile(storedPath, type)) return fallback;
    return stored; // includes search string if any
  } catch {
    return fallback;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileRouteMemory() {
  const { user, activeEntityId, authReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const activeProfileRef = useRef<string | null>(null);

  // Profile-switch handler
  useEffect(() => {
    if (!authReady || !user) {
      activeProfileRef.current = null;
      return;
    }
    const key = profileKey(user.id, activeEntityId);

    if (activeProfileRef.current === null) {
      activeProfileRef.current = key;
      if (isRememberablePath(location.pathname)) {
        try {
          localStorage.setItem(key, location.pathname + location.searchStr);
        } catch { /* ignore */ }
      }
      return;
    }

    if (activeProfileRef.current === key) return;

    const target = resolveAllowedTarget(user.id, activeEntityId);
    const current = location.pathname + location.searchStr;

    if (target === current) {
      activeProfileRef.current = key;
      return;
    }

    void navigate({ to: target as never, replace: true });
  }, [user, activeEntityId, authReady, navigate, location.pathname, location.searchStr]);

  // Persist current path under the active profile
  useEffect(() => {
    if (!authReady || !user) return;
    const key = profileKey(user.id, activeEntityId);
    if (activeProfileRef.current !== key) {
      activeProfileRef.current = key;
      return;
    }
    if (!isRememberablePath(location.pathname)) return;
    try {
      localStorage.setItem(key, location.pathname + location.searchStr);
    } catch { /* ignore */ }
  }, [user, activeEntityId, authReady, location.pathname, location.searchStr]);

  return null;
}
