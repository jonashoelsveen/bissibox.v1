import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Mode = "participant" | "organizer" | "team";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  /** Currently selected entity (team/company/cooperation) id, or null when on the individual profile. */
  activeEntityId: string | null;
  /** Pass an entity id to switch into team mode for that entity, or null to switch back to the individual profile. */
  setActiveEntity: (id: string | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode>("participant");
  const [activeEntityId, setActiveEntityIdState] = useState<string | null>(null);

  useEffect(() => {
    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("rl_mode");
      if (stored === "organizer" || stored === "participant" || stored === "team") setModeState(stored);
      const eid = localStorage.getItem("rl_active_entity");
      if (eid) setActiveEntityIdState(eid);
    }

    return () => sub.subscription.unsubscribe();
  }, []);

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
    // Keep mode in sync so existing UI continues to work.
    const next: Mode = id ? "team" : "participant";
    setModeState(next);
    if (typeof window !== "undefined") localStorage.setItem("rl_mode", next);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, mode, setMode, activeEntityId, setActiveEntity, signOut }}
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
