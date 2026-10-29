import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isEntityFeatureEnabled, setBetaTesterSnapshot } from "@/lib/features";
import { clearFeatureFlagSnapshot, loadAcceptedFeatureFlags } from "@/lib/featureFlags.client";
import {
  broadcastForcedLogout,
  redirectToLoggedOutHome,
  subscribeForcedLogout,
} from "@/lib/auth-cross-tab";
import { isCalendarExplicitlySignedOut } from "@/lib/calendarSessionPersist";

type Mode = "participant" | "organizer" | "team";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True once the initial session check (via /api/auth/session) has completed. */
  authReady: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  activeEntityId: string | null;
  setActiveEntity: (id: string | null) => void;
  /** `profiles.is_beta_tester` — entity flags apply at runtime while compile-time is off. */
  isBetaTester: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (args: { email: string; password: string; first_name?: string; last_name?: string; birth_date?: string }) => Promise<{ error?: string; needsEmailConfirmation?: boolean; needsOtpVerification?: boolean; userId?: string; email?: string; _pendingAccessToken?: string; _pendingRefreshToken?: string }>;
  activateSession: (accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LEGACY_ACTIVE_ENTITY_KEY = "rl_active_entity";
const INDIVIDUAL_PROFILE_VALUE = "__individual__";

function activeEntityStorageKey(userId: string) {
  return `${LEGACY_ACTIVE_ENTITY_KEY}:${userId}`;
}

function readStoredActiveEntity(userId: string): string | null {
  try {
    const perUser = localStorage.getItem(activeEntityStorageKey(userId));
    if (perUser === INDIVIDUAL_PROFILE_VALUE) return null;
    if (perUser) return perUser;
    return localStorage.getItem(LEGACY_ACTIVE_ENTITY_KEY);
  } catch {
    return null;
  }
}

function writeStoredActiveEntity(userId: string | null, id: string | null) {
  try {
    if (id) {
      localStorage.setItem(LEGACY_ACTIVE_ENTITY_KEY, id);
      if (userId) localStorage.setItem(activeEntityStorageKey(userId), id);
      return;
    }
    localStorage.removeItem(LEGACY_ACTIVE_ENTITY_KEY);
    if (userId) localStorage.setItem(activeEntityStorageKey(userId), INDIVIDUAL_PROFILE_VALUE);
  } catch {
    /* ignore */
  }
}

interface SessionResponse {
  user?: User | null;
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

type SessionFetchResult =
  | { kind: "authenticated"; data: SessionResponse }
  | { kind: "unauthenticated" }
  | { kind: "unavailable" };

async function fetchSession(): Promise<SessionFetchResult> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) return { kind: "unauthenticated" };
    if (!res.ok) return { kind: "unavailable" };
    const data = (await res.json()) as SessionResponse;
    if (data.user && data.access_token && data.refresh_token) {
      return { kind: "authenticated", data };
    }
    if (data.user == null) return { kind: "unauthenticated" };
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Survives Fast Refresh / provider remount so the top bar never flashes Log in. */
let lastKnownSession: Session | null = null;
let lastKnownUser: User | null = null;

/** Stable identity for skipping React updates that remount Calendar. */
function sessionIdentityKey(session: Session | null, user: User | null): string | null {
  const id = user?.id ?? session?.user?.id ?? null;
  const token = session?.access_token ?? null;
  if (!id && !token) return null;
  return `${id ?? ""}:${token ?? ""}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(lastKnownSession);
  const [user, setUser] = useState<User | null>(lastKnownUser);
  const [loading, setLoading] = useState(!lastKnownUser);
  const [authReady, setAuthReady] = useState(() => lastKnownUser != null);
  const [mode, setModeState] = useState<Mode>("participant");
  const [activeEntityId, setActiveEntityIdState] = useState<string | null>(null);
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [betaReady, setBetaReady] = useState(false);
  const bootedRef = useRef(false);
  const rehydrateInFlightRef = useRef<Promise<boolean> | null>(null);
  const signingOutRef = useRef(false);
  const userIdRef = useRef<string | null>(lastKnownUser?.id ?? null);
  const sessionTokenRef = useRef<string | null>(sessionIdentityKey(lastKnownSession, lastKnownUser));
  userIdRef.current = user?.id ?? null;

  const applySessionIfChanged = useCallback((nextSession: Session | null, nextUser: User | null) => {
    const key = sessionIdentityKey(nextSession, nextUser);
    if (key === sessionTokenRef.current) {
      if (key === null) {
        lastKnownSession = null;
        lastKnownUser = null;
      }
      return;
    }
    sessionTokenRef.current = key;
    lastKnownSession = nextSession;
    lastKnownUser = nextUser;
    setSession(nextSession);
    setUser(nextUser);
  }, []);

  const recoverFromLocalSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const localSession = sessionData.session ?? null;
      if (localSession?.user) {
        applySessionIfChanged(localSession, localSession.user);
        return true;
      }
      const { data: userData, error } = await supabase.auth.getUser();
      const localUser = userData.user ?? null;
      if (error || !localUser) return false;
      applySessionIfChanged(localSession, localUser);
      return true;
    } catch {
      return false;
    }
  }, [applySessionIfChanged]);

  const clearLocalAuth = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* ignore */
    }
    applySessionIfChanged(null, null);
  }, [applySessionIfChanged]);

  // Re-hydrate the Supabase client from the HTTP-only cookie. Used both on
  // boot and whenever the tab regains focus after long idle (otherwise the
  // in-memory access token can be silently expired, making queries fail and
  // pages render in a logged-out state).
  const rehydrate = useCallback(async (opts?: { onBoot?: boolean }): Promise<boolean> => {
    if (signingOutRef.current) return false;
    if (isCalendarExplicitlySignedOut()) {
      applySessionIfChanged(null, null);
      return false;
    }
    if (rehydrateInFlightRef.current) {
      return rehydrateInFlightRef.current;
    }
    const run = (async (): Promise<boolean> => {
      try {
        // Prefer a still-valid local session. /api/auth/session rotates the
        // refresh token, which signs other same-origin tabs out (Cloud loses
        // apps + left-panel profile when Account opens in a new tab).
        try {
          const { data: existing } = await supabase.auth.getSession();
          const local = existing.session;
          const expiresAtMs = (local?.expires_at ?? 0) * 1000;
          if (local?.user && local.access_token && expiresAtMs > Date.now() + 60_000) {
            applySessionIfChanged(local, local.user);
            await supabase.realtime.setAuth(local.access_token);
            return true;
          }
        } catch {
          /* fall through to cookie refresh */
        }
        const fetched = await fetchSession();
        if (fetched.kind === "authenticated") {
          const { data: nextSession } = await supabase.auth.setSession({
            access_token: fetched.data.access_token!,
            refresh_token: fetched.data.refresh_token!,
          });
          applySessionIfChanged(nextSession.session ?? null, nextSession.user ?? fetched.data.user ?? null);
          await supabase.realtime.setAuth(fetched.data.access_token!);
          void import("@/lib/calendarSessionPersist").then((m) => m.drainCalendarSessionOutbox());
          return true;
        }
        const localOk = await recoverFromLocalSession();
        if (localOk) return true;
        if (fetched.kind === "unavailable") {
          // Network / 5xx — keep whatever user we already have.
          return false;
        }
        // Cookie missing or expired. Only clear on first load, or when this
        // tab has no user yet. If we already have a signed-in user, keep them
        // — idle SIGNED_OUT / cookie 401 must not flash Log in on the platform.
        if (opts?.onBoot || !userIdRef.current) {
          await clearLocalAuth();
        }
        return false;
      } finally {
        rehydrateInFlightRef.current = null;
      }
    })();
    rehydrateInFlightRef.current = run;
    return run;
  }, [applySessionIfChanged, clearLocalAuth, recoverFromLocalSession]);

  // Boot: hydrate from the HTTP-only cookie via /api/auth/session.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    // Listener for in-tab auth changes (token refresh, sign-out).
    // CRITICAL: Supabase fires SIGNED_OUT whenever its in-memory /
    // localStorage refresh attempt fails (which happens silently after
    // long idle even when our HTTP-only cookie session is still valid).
    // Never treat that event as logout. Rehydrate from the cookie instead
    // and keep the existing user so the platform bar cannot show Log in.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (signingOutRef.current || isCalendarExplicitlySignedOut()) {
        applySessionIfChanged(null, null);
        return;
      }
      if (sess?.user) {
        applySessionIfChanged(sess, sess.user);
        return;
      }
      // Recover from cookie. Do not clear the user on SIGNED_OUT — that
      // event fires after idle refresh failures even when the cookie is
      // still valid. Clearing here is what put Log in on the platform bar.
      void rehydrate();
    });

    (async () => {
      await rehydrate({ onBoot: true });
      setLoading(false);
      setAuthReady(true);
    })();

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("rl_mode");
      if (stored === "organizer" || stored === "participant" || stored === "team") setModeState(stored);
    }

    const unsubForcedLogout = subscribeForcedLogout(() => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      applySessionIfChanged(null, null);
      setActiveEntityIdState(null);
      setIsBetaTester(false);
      setBetaTesterSnapshot(false);
      clearFeatureFlagSnapshot();
      setModeState("participant");
      void supabase.auth.signOut({ scope: "local" }).catch(() => {});
      redirectToLoggedOutHome();
    });

    return () => {
      sub.subscription.unsubscribe();
      unsubForcedLogout();
    };
  }, [rehydrate]);

  // Keep the in-memory access token fresh when it is actually near expiry,
  // and proactively every ~45 min (Supabase access tokens live ~60 min).
  // Do not also bind `window` focus — that retriggers on every DevTools /
  // iframe focus and was remounting the calendar. Tab re-entry must not
  // rehydrate (or getUser) while the local session still has >60s left.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const drainOutbox = () => {
      void import("@/lib/calendarSessionPersist").then((m) => m.drainCalendarSessionOutbox());
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        if (signingOutRef.current || isCalendarExplicitlySignedOut()) return;
        try {
          const { data: existing } = await supabase.auth.getSession();
          const local = existing.session;
          const expiresAtMs = (local?.expires_at ?? 0) * 1000;
          if (local?.user && local.access_token && expiresAtMs > Date.now() + 60_000) {
            drainOutbox();
            return;
          }
        } catch {
          /* fall through to rehydrate */
        }
        await rehydrate();
        drainOutbox();
      })();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { void rehydrate(); }, 45 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [rehydrate]);

  const setMode = (m: Mode) => {
    setModeState(m);
    if (typeof window !== "undefined") localStorage.setItem("rl_mode", m);
  };

  const applyActiveEntity = useCallback((id: string | null, persist: boolean) => {
    setActiveEntityIdState(id);
    const next: Mode = id ? "team" : "participant";
    setModeState(next);
    if (typeof window === "undefined") return;
    localStorage.setItem("rl_mode", next);
    if (persist) writeStoredActiveEntity(userIdRef.current, id);
  }, []);

  // Restore the last profile used by this account (individual or entity),
  // after is_beta_tester is known so public users cannot keep a stored entity.
  useEffect(() => {
    if (!user) {
      setIsBetaTester(false);
      setBetaTesterSnapshot(false);
      setBetaReady(true);
      return;
    }
    let cancelled = false;
    setBetaReady(false);
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_beta_tester")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const tester = data?.is_beta_tester === true;
      setIsBetaTester(tester);
      setBetaTesterSnapshot(tester);
      setBetaReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      clearFeatureFlagSnapshot();
      return;
    }
    void loadAcceptedFeatureFlags(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !betaReady) return;
    /** Force individual seat — Bucket A: leftover localStorage cannot enter entity mode. */
    if (!isEntityFeatureEnabled("entityProfileSwitcher")) {
      applyActiveEntity(null, true);
      return;
    }
    const stored = readStoredActiveEntity(user.id);
    applyActiveEntity(stored, false);
  }, [user?.id, betaReady, isBetaTester, applyActiveEntity]);

  const setActiveEntity = (id: string | null) => {
    /** Ignore stored/clicked entity id — Bucket A: switcher off means individual only. */
    if (id && !isEntityFeatureEnabled("entityProfileSwitcher")) return;
    applyActiveEntity(id, true);
  };

  const signIn = useCallback(async (email: string, password: string) => {
    signingOutRef.current = false;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json().catch(() => ({}))) as SessionResponse;
      if (!res.ok || !body.user || !body.access_token || !body.refresh_token) {
        return { error: body.error ?? "Sign-in failed" };
      }
      const { data } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      applySessionIfChanged(data.session ?? null, data.user ?? body.user);
      const { clearCalendarSignedOut, drainCalendarSessionOutbox } = await import("@/lib/calendarSessionPersist");
      clearCalendarSignedOut();
      void drainCalendarSessionOutbox();
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Network error" };
    }
  }, [applySessionIfChanged]);

  const signUp = useCallback(
    async (args: { email: string; password: string; first_name?: string; last_name?: string; birth_date?: string }) => {
      signingOutRef.current = false;
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const body = (await res.json().catch(() => ({}))) as SessionResponse & {
          needsEmailConfirmation?: boolean;
          needsOtpVerification?: boolean;
        };
        if (!res.ok) return { error: body.error ?? "Sign-up failed" };
        if (body.needsEmailConfirmation) return { needsEmailConfirmation: true };
        if (body.needsOtpVerification && body.user && body.access_token && body.refresh_token) {
          // Do NOT set session yet — the user must pass OTP first. The
          // modal holds the tokens in memory and calls activateSession()
          // after verification succeeds.
          return {
            needsOtpVerification: true,
            userId: body.user.id,
            email: args.email,
            _pendingAccessToken: body.access_token,
            _pendingRefreshToken: body.refresh_token,
          };
        }
        if (body.user && body.access_token && body.refresh_token) {
          const { data } = await supabase.auth.setSession({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
          });
          applySessionIfChanged(data.session ?? null, data.user ?? body.user);
        }
        return {};
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Network error" };
      }
    },
    [applySessionIfChanged],
  );

  const activateSession = useCallback(async (accessToken: string, refreshToken: string) => {
    signingOutRef.current = false;
    try {
      await fetch("/api/auth/activate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
      });
    } catch {
      /* cookie is best-effort; Bearer auth still works for account APIs */
    }
    const { data } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    applySessionIfChanged(data.session ?? null, data.user ?? null);
    const { clearCalendarSignedOut, drainCalendarSessionOutbox } = await import("@/lib/calendarSessionPersist");
    clearCalendarSignedOut();
    void drainCalendarSessionOutbox();
  }, [applySessionIfChanged]);

  const signOut = useCallback(async () => {
    // Industry-standard logout: flip the UI immediately, then revoke in the
    // background. Awaiting outbox drain + admin.signOut + global supabase
    // logout was stalling the profile-menu click for many seconds.
    signingOutRef.current = true;
    applySessionIfChanged(null, null);
    setActiveEntityIdState(null);
    setIsBetaTester(false);
    setBetaTesterSnapshot(false);
    clearFeatureFlagSnapshot();
    setModeState("participant");

    broadcastForcedLogout();
    void import("@/lib/calendarSessionPersist")
      .then((m) => {
        m.flushCalendarSessionOutboxKeepalive();
      })
      .catch(() => {});

    void fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});

    void supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }, [applySessionIfChanged]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, authReady, mode, setMode, activeEntityId, setActiveEntity, isBetaTester, signIn, signUp, activateSession, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
