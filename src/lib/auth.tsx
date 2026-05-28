import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (args: { email: string; password: string; first_name?: string; last_name?: string }) => Promise<{ error?: string; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface SessionResponse {
  user?: User | null;
  access_token?: string;
  refresh_token?: string;
  error?: string;
}

async function fetchSession(): Promise<SessionResponse | null> {
  try {
    const res = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return (await res.json()) as SessionResponse;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [mode, setModeState] = useState<Mode>("participant");
  const [activeEntityId, setActiveEntityIdState] = useState<string | null>(null);
  const bootedRef = useRef(false);
  const rehydratingRef = useRef(false);

  // Re-hydrate the Supabase client from the HTTP-only cookie. Used both on
  // boot and whenever the tab regains focus after long idle (otherwise the
  // in-memory access token can be silently expired, making queries fail and
  // pages render in a logged-out state).
  const rehydrate = useCallback(async (opts?: { onBoot?: boolean }) => {
    if (rehydratingRef.current) return;
    rehydratingRef.current = true;
    try {
      const data = await fetchSession();
      if (data && data.user && data.access_token && data.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        setUser(data.user);
      } else if (opts?.onBoot) {
        // Cookie missing/invalid on first load → clear any stale local state.
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* ignore */
        }
        setUser(null);
        setSession(null);
      }
      // On a focus-driven rehydrate we deliberately do NOT sign the user
      // out on a transient /api/auth/session failure (network blip, etc).
    } finally {
      rehydratingRef.current = false;
    }
  }, []);

  // Boot: hydrate from the HTTP-only cookie via /api/auth/session.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    // Listener for in-tab auth changes (token refresh, sign-out).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });

    (async () => {
      await rehydrate({ onBoot: true });
      setLoading(false);
      setAuthReady(true);
    })();

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("rl_mode");
      if (stored === "organizer" || stored === "participant" || stored === "team") setModeState(stored);
      const eid = localStorage.getItem("rl_active_entity");
      if (eid) setActiveEntityIdState(eid);
    }

    return () => sub.subscription.unsubscribe();
  }, [rehydrate]);

  // Refresh the session whenever the tab regains visibility/focus. After
  // several hours idle the in-memory Supabase access token has expired and
  // Supabase's own auto-refresh may have failed silently, causing queries
  // to return empty and the top tab-bar to render in a logged-out state.
  // Re-asking our cookie-backed /api/auth/session endpoint rotates the
  // refresh token and restores a valid bearer in one round-trip.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void rehydrate();
    };
    const onFocus = () => void rehydrate();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [rehydrate]);

  const setMode = (m: Mode) => {
    setModeState(m);
    if (typeof window !== "undefined") localStorage.setItem("rl_mode", m);
  };

  const setActiveEntity = (id: string | null) => {
    setActiveEntityIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem("rl_active_entity", id);
      else localStorage.removeItem("rl_active_entity");
    }
    const next: Mode = id ? "team" : "participant";
    setModeState(next);
    if (typeof window !== "undefined") localStorage.setItem("rl_mode", next);
  };

  const signIn = useCallback(async (email: string, password: string) => {
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
      await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      setUser(body.user);
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Network error" };
    }
  }, []);

  const signUp = useCallback(
    async (args: { email: string; password: string; first_name?: string; last_name?: string }) => {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const body = (await res.json().catch(() => ({}))) as SessionResponse & { needsEmailConfirmation?: boolean };
        if (!res.ok) return { error: body.error ?? "Sign-up failed" };
        if (body.needsEmailConfirmation) return { needsEmailConfirmation: true };
        if (body.user && body.access_token && body.refresh_token) {
          await supabase.auth.setSession({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
          });
          setUser(body.user);
        }
        return {};
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Network error" };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, authReady, mode, setMode, activeEntityId, setActiveEntity, signIn, signUp, signOut }}
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
