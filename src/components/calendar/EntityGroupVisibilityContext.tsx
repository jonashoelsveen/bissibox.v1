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

export const ENTITY_GROUP_ALL_ID = "all";

type HiddenMap = Record<string, boolean>;

type EntityGroupVisibilityValue = {
  isHidden: (groupId: string) => boolean;
  toggleHidden: (groupId: string) => void;
  isSessionVisible: (appGroupId: string | null | undefined) => boolean;
};

const EntityGroupVisibilityContext = createContext<EntityGroupVisibilityValue | null>(null);

const PREFS_KEY = (userId: string, teamId: string) =>
  `calendar:entityGroupHidden:${userId}:${teamId}`;

function readHidden(userId: string, teamId: string): HiddenMap {
  try {
    const raw = localStorage.getItem(PREFS_KEY(userId, teamId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HiddenMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeHidden(userId: string, teamId: string, hidden: HiddenMap) {
  try {
    localStorage.setItem(PREFS_KEY(userId, teamId), JSON.stringify(hidden));
  } catch {
    /* ignore quota */
  }
}

function sessionGroupKey(appGroupId: string | null | undefined): string {
  return typeof appGroupId === "string" && appGroupId.length > 0
    ? appGroupId
    : ENTITY_GROUP_ALL_ID;
}

export function EntityGroupVisibilityProvider({
  children,
  enabled = true,
  teamId,
}: {
  children: ReactNode;
  enabled?: boolean;
  teamId?: string | null;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [hidden, setHidden] = useState<HiddenMap>({});

  useEffect(() => {
    if (!userId || !teamId || !enabled) {
      setHidden({});
      return;
    }
    setHidden(readHidden(userId, teamId));
  }, [enabled, teamId, userId]);

  const toggleHidden = useCallback(
    (groupId: string) => {
      if (!userId || !teamId) return;
      setHidden((prev) => {
        const next = { ...prev, [groupId]: !prev[groupId] };
        writeHidden(userId, teamId, next);
        return next;
      });
    },
    [teamId, userId],
  );

  const value = useMemo<EntityGroupVisibilityValue>(
    () => ({
      isHidden: (groupId) => !!hidden[groupId],
      toggleHidden,
      isSessionVisible: (appGroupId) => !hidden[sessionGroupKey(appGroupId)],
    }),
    [hidden, toggleHidden],
  );

  return (
    <EntityGroupVisibilityContext.Provider value={enabled ? value : null}>
      {children}
    </EntityGroupVisibilityContext.Provider>
  );
}

export function useEntityGroupVisibilitySafe(): EntityGroupVisibilityValue | null {
  return useContext(EntityGroupVisibilityContext);
}
