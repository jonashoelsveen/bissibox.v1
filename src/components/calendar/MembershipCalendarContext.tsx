import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth";
import { fetchMembershipSessions } from "@/lib/calendarSessionPersist";

export type IndividualMembership = {
  teamId: string;
  name: string;
  appGroupId: string | null;
  groupIds: string[];
};

type PrefsMap = Record<string, { hidden?: boolean; overlayColor?: string | null }>;

type MembershipCalendarValue = {
  memberships: IndividualMembership[];
  events: [];
  isHidden: (teamId: string) => boolean;
  overlayColor: (teamId: string) => string | null;
  toggleHidden: (teamId: string) => void;
  setOverlayColor: (teamId: string, color: string | null) => void;
};

const MembershipCalendarContext = createContext<MembershipCalendarValue | null>(null);

const PREFS_KEY = (userId: string) => `calendar:membershipPrefs:${userId}`;

function readPrefs(userId: string): PrefsMap {
  try {
    const raw = localStorage.getItem(PREFS_KEY(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PrefsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefs(userId: string, prefs: PrefsMap) {
  try {
    localStorage.setItem(PREFS_KEY(userId), JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

export function MembershipCalendarProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const { user, authReady } = useAuth();
  const userId = user?.id ?? null;
  const [memberships, setMemberships] = useState<IndividualMembership[]>([]);
  const [prefs, setPrefs] = useState<PrefsMap>({});

  useEffect(() => {
    if (!userId) {
      setPrefs({});
      return;
    }
    setPrefs(readPrefs(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId || !enabled || !authReady) {
      setMemberships([]);
      return;
    }
    let cancelled = false;
    const reload = async () => {
      const remote = await fetchMembershipSessions();
      if (cancelled) return;
      if (!remote.ok) {
        setMemberships([]);
        return;
      }
      setMemberships(
        remote.memberships.map((membership) => ({
          teamId: membership.teamId,
          name: membership.name,
          appGroupId: membership.appGroupId,
          groupIds: membership.groupIds ?? (membership.appGroupId ? [membership.appGroupId] : []),
        })),
      );
    };
    void reload();
    const id = window.setInterval(() => {
      void reload();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [authReady, enabled, userId]);

  const patchPrefs = useCallback(
    (teamId: string, patch: { hidden?: boolean; overlayColor?: string | null }) => {
      if (!userId) return;
      setPrefs((prev) => {
        const next = {
          ...prev,
          [teamId]: { ...prev[teamId], ...patch },
        };
        writePrefs(userId, next);
        return next;
      });
    },
    [userId],
  );

  const value = useMemo<MembershipCalendarValue>(
    () => ({
      memberships,
      events: [],
      isHidden: (teamId) => !!prefs[teamId]?.hidden,
      overlayColor: (teamId) => prefs[teamId]?.overlayColor ?? null,
      toggleHidden: (teamId) =>
        patchPrefs(teamId, { hidden: !prefs[teamId]?.hidden }),
      setOverlayColor: (teamId, color) => patchPrefs(teamId, { overlayColor: color }),
    }),
    [memberships, patchPrefs, prefs],
  );

  return (
    <MembershipCalendarContext.Provider value={value}>
      {children}
    </MembershipCalendarContext.Provider>
  );
}

export function useMembershipCalendarSafe(): MembershipCalendarValue | null {
  return useContext(MembershipCalendarContext);
}
