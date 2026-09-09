import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { canAccessTeamPlan, type PlanTier } from "@/lib/features";

const SWITCHER_KEY = "@team_profile_switcher_enabled";
const ACTIVE_PROFILE_KEY = "@active_profile";

export type ActiveProfile =
  | { type: "individual"; userId: string }
  | { type: "team"; teamId: string; teamName: string; ownerId: string };

export interface AppTeam {
  id: string;
  name: string;
  owner_id: string;
}

interface ProfileContextValue {
  plan: PlanTier;
  canAccessTeam: boolean;
  profileSwitcherEnabled: boolean;
  enableProfileSwitcher: () => void;
  activeProfile: ActiveProfile | null;
  setActiveProfile: (p: ActiveProfile) => void;
  teams: AppTeam[];
  refreshTeams: () => Promise<void>;
  createTeam: (name: string, ownerEmail?: string) => Promise<{ team: AppTeam | null; error: string | null }>;
  updateTeam: (id: string, name: string) => Promise<{ ok: boolean; error: string | null }>;
  deleteTeam: (id: string) => Promise<{ ok: boolean; error: string | null }>;
  isTeamProfile: boolean;
  scopeUserId: string | null;
  scopeTeamId: string | null;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [plan, setPlan] = useState<PlanTier>("team");
  const [profileSwitcherEnabled, setProfileSwitcherEnabled] = useState(false);
  const [activeProfile, setActiveProfileState] = useState<ActiveProfile | null>(null);
  const [teams, setTeams] = useState<AppTeam[]>([]);

  const canAccessTeam = canAccessTeamPlan(plan);

  const persistProfile = useCallback((p: ActiveProfile) => {
    setActiveProfileState(p);
    void AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(p));
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("user_plans")
        .select("plan")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.plan === "free" || data?.plan === "team") {
        setPlan(data.plan);
      }

      const [[, switcher], [, storedProfile]] = await AsyncStorage.multiGet([
        SWITCHER_KEY,
        ACTIVE_PROFILE_KEY,
      ]);
      if (switcher === "true") setProfileSwitcherEnabled(true);

      if (storedProfile) {
        try {
          const parsed = JSON.parse(storedProfile) as ActiveProfile;
          if (parsed.type === "individual" && parsed.userId === userId) {
            setActiveProfileState(parsed);
          } else if (parsed.type === "team" && parsed.ownerId === userId) {
            setActiveProfileState(parsed);
          } else {
            setActiveProfileState({ type: "individual", userId });
          }
        } catch {
          setActiveProfileState({ type: "individual", userId });
        }
      } else {
        setActiveProfileState({ type: "individual", userId });
      }
    })();
  }, [userId]);

  const refreshTeams = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_teams")
      .select("id, name, owner_id")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    if (!error) {
      setTeams((data ?? []) as AppTeam[]);
    }
  }, [userId]);

  useEffect(() => {
    void refreshTeams();
  }, [refreshTeams]);

  // Drop stale team profiles (deleted entity) and refresh stored team names.
  useEffect(() => {
    if (activeProfile?.type !== "team") return;

    const team = teams.find((t) => t.id === activeProfile.teamId);
    if (!team) {
      const next: ActiveProfile = { type: "individual", userId };
      setActiveProfileState(next);
      void AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(next));
      return;
    }

    if (team.name !== activeProfile.teamName) {
      const next: ActiveProfile = {
        ...activeProfile,
        teamName: team.name,
      };
      setActiveProfileState(next);
      void AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(next));
    }
  }, [teams, activeProfile, userId]);

  const setActiveProfile = useCallback(
    (p: ActiveProfile) => {
      persistProfile(p);
    },
    [persistProfile],
  );

  const createTeam = useCallback(
    async (name: string, ownerEmail?: string) => {
      const trimmed = name.trim() || "New team";
      const { data, error } = await supabase
        .from("app_teams")
        .insert({ owner_id: userId, name: trimmed })
        .select("id, name, owner_id")
        .single();

      if (error || !data) {
        return { team: null, error: error?.message ?? "Failed to create team" };
      }

      const team = data as AppTeam;

      if (ownerEmail) {
        await supabase.from("app_team_admins").insert({
          team_id: team.id,
          email: ownerEmail.toLowerCase(),
          user_id: userId,
          status: "active",
        });
      }

      setTeams((prev) => (prev.some((t) => t.id === team.id) ? prev : [...prev, team]));
      return { team, error: null };
    },
    [userId],
  );

  const updateTeam = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      const { error } = await supabase
        .from("app_teams")
        .update({ name: trimmed, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) return { ok: false, error: error.message };

      setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, name: trimmed } : t)));
      setActiveProfileState((prev) => {
        if (prev?.type === "team" && prev.teamId === id) {
          const next = { ...prev, teamName: trimmed };
          void AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(next));
          return next;
        }
        return prev;
      });
      return { ok: true, error: null };
    },
    [],
  );

  const deleteTeam = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("app_teams").delete().eq("id", id);
      if (error) return { ok: false, error: error.message };

      setTeams((prev) => prev.filter((t) => t.id !== id));
      setActiveProfileState((prev) => {
        if (prev?.type === "team" && prev.teamId === id) {
          const next: ActiveProfile = { type: "individual", userId };
          void AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(next));
          return next;
        }
        return prev;
      });
      return { ok: true, error: null };
    },
    [userId],
  );

  const enableProfileSwitcher = useCallback(() => {
    setProfileSwitcherEnabled(true);
    void AsyncStorage.setItem(SWITCHER_KEY, "true");
  }, []);

  const isTeamProfile = activeProfile?.type === "team";
  const scopeUserId = userId;
  const scopeTeamId = activeProfile?.type === "team" ? activeProfile.teamId : null;

  const value = useMemo(
    () => ({
      plan,
      canAccessTeam,
      profileSwitcherEnabled,
      enableProfileSwitcher,
      activeProfile,
      setActiveProfile,
      teams,
      refreshTeams,
      createTeam,
      updateTeam,
      deleteTeam,
      isTeamProfile,
      scopeUserId,
      scopeTeamId,
    }),
    [
      plan,
      canAccessTeam,
      profileSwitcherEnabled,
      enableProfileSwitcher,
      activeProfile,
      setActiveProfile,
      teams,
      refreshTeams,
      createTeam,
      updateTeam,
      deleteTeam,
      isTeamProfile,
      scopeUserId,
      scopeTeamId,
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfileContext() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfileContext must be used within ProfileProvider");
  return ctx;
}
