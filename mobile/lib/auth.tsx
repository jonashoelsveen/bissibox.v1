import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{
    error?: string;
    needsOtpVerification?: boolean;
    userId?: string;
    _pendingAccessToken?: string;
    _pendingRefreshToken?: string;
  }>;
  signUp: (args: {
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }) => Promise<{
    error?: string;
    needsEmailConfirmation?: boolean;
    needsOtpVerification?: boolean;
    userId?: string;
    _pendingAccessToken?: string;
    _pendingRefreshToken?: string;
  }>;
  activateSession: (accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Suppress onAuthStateChange during OTP flows: signUp/signIn return a live session
  // that must not update user state until OTP is verified. Without this flag the
  // SIGNED_IN event would briefly set user → Home switches to CalendarView →
  // SignInView unmounts and all OTP state (mode, tokens, attempt ID) is lost.
  const suppressAuthRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      if (sess?.user) {
        // If the session belongs to an unverified account, clear it so the user
        // sees SignInView on restart instead of bypassing OTP. Calling signOut
        // here is intentional — the token is not needed at this point.
        const { data: profile } = await supabase
          .from("profiles")
          .select("email_verified")
          .eq("id", sess.user.id)
          .maybeSingle();
        if (profile?.email_verified === false) {
          await supabase.auth.signOut({ scope: "local" });
          setLoading(false);
          return;
        }
      }
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (suppressAuthRef.current) return;
      setSession(sess);
      setUser(sess?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Suppress auth state updates for the duration of sign-in so that if we
    // detect an unverified account we can sign out locally before the UI ever
    // transitions to CalendarView.
    suppressAuthRef.current = true;
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };

      const { data: profile } = await supabase
        .from("profiles")
        .select("email_verified")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile?.email_verified === false) {
        // Do NOT call signOut here — even scope:"local" sends POST /auth/v1/logout
        // to the server, which deletes the session row and invalidates the access
        // token before the OTP edge function can use it.
        // Stale sessions are cleaned up by the startup check in useEffect.
        return {
          needsOtpVerification: true,
          userId: data.user.id,
          _pendingAccessToken: data.session.access_token,
          _pendingRefreshToken: data.session.refresh_token,
        };
      }

      // Verified: manually propagate auth state since we suppressed the
      // automatic onAuthStateChange event above.
      setSession(data.session);
      setUser(data.user);
      return {};
    } finally {
      suppressAuthRef.current = false;
    }
  }, []);

  const signUp = useCallback(
    async (args: {
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
    }) => {
      // Block auth state updates for the duration of signup + local sign-out so
      // Home never switches to CalendarView mid-flow (which would unmount
      // SignInView and lose all OTP state).
      suppressAuthRef.current = true;
      try {
        const { error, data } = await supabase.auth.signUp({
          email: args.email,
          password: args.password,
          options: {
            data: {
              first_name: args.first_name,
              last_name: args.last_name,
            },
          },
        });
        if (error) return { error: error.message };

        if (data.session) {
          const accessToken = data.session.access_token;
          const refreshToken = data.session.refresh_token;
          const userId = data.user?.id ?? "";
          // Do NOT call signOut here — even scope:"local" sends POST /auth/v1/logout
          // to the server, which deletes the session row and invalidates the access
          // token before the OTP edge function can use it.
          // Stale sessions are cleaned up by the startup check in useEffect above.
          return {
            needsOtpVerification: true,
            userId,
            _pendingAccessToken: accessToken,
            _pendingRefreshToken: refreshToken,
          };
        }

        return { needsEmailConfirmation: true };
      } finally {
        suppressAuthRef.current = false;
      }
    },
    [],
  );

  // Called after OTP is verified — activates the pending session in the client
  // so the auth state change propagates and the user lands on the calendar.
  const activateSession = useCallback(
    async (accessToken: string, refreshToken: string) => {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    await AsyncStorage.multiRemove(["rl_mode", "rl_active_entity"]);
  }, []);

  const deleteAccount = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) return { error: "Not signed in" };
    try {
      const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
      if (error) return { error: error.message };
      await supabase.auth.signOut({ scope: "local" });
      setSession(null);
      setUser(null);
      await AsyncStorage.multiRemove(["rl_mode", "rl_active_entity"]);
      return {};
    } catch (e) {
      return { error: (e as Error).message || "Failed to delete account" };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, signUp, activateSession, signOut, deleteAccount }}
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
