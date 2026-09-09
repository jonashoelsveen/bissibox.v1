/**
 * Shared event drafts for the /events layout — list + edit share one store so
 * opening an event from the left rail does not remount an empty loader.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  type CoOrganizerDraft,
  type EventDraft,
} from "./event-ui-types";
import {
  createEventInDb,
  getEventById,
  listEventsForScope,
  migrateLocalDraftsIfNeeded,
  updateEventInDb,
  type EventScope,
} from "./eventDb";

const SAVE_DEBOUNCE_MS = 400;
const EVENTS_REFRESH = "events:refresh";

type EventDraftsValue = {
  drafts: EventDraft[];
  loading: boolean;
  createDraft: (
    name: string,
    coOrganizers: CoOrganizerDraft[],
  ) => Promise<EventDraft>;
  updateDraft: (
    id: string,
    patch: Partial<Omit<EventDraft, "id" | "createdAt">>,
  ) => EventDraft | null;
  getDraft: (id: string) => EventDraft | null;
  /** Ensure a draft is in the store (list cache or fetch by id). */
  ensureDraft: (id: string) => Promise<EventDraft | null>;
  refetch: () => Promise<void>;
};

const EventDraftsContext = createContext<EventDraftsValue | null>(null);

export function EventDraftsProvider({ children }: { children: ReactNode }) {
  const { user, activeEntityId } = useAuth();
  const userId = user?.id ?? null;
  const teamId = activeEntityId ?? null;
  const scopeKey = `${userId ?? "anon"}:${teamId ?? "individual"}`;

  const [drafts, setDrafts] = useState<EventDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingSaves = useRef(new Map<string, EventDraft>());

  const scope = useCallback((): EventScope | null => {
    if (!userId) return null;
    return { userId, teamId };
  }, [userId, teamId]);

  const flushSave = useCallback(
    async (draft: EventDraft) => {
      const s = scope();
      if (!s) return;
      try {
        await updateEventInDb(s, draft);
      } catch (e) {
        console.error("[events] save failed", e);
        toast.error("Could not save event changes");
      }
    },
    [scope],
  );

  const scheduleSave = useCallback(
    (draft: EventDraft) => {
      pendingSaves.current.set(draft.id, draft);
      const existing = saveTimers.current.get(draft.id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        saveTimers.current.delete(draft.id);
        const latest = pendingSaves.current.get(draft.id);
        pendingSaves.current.delete(draft.id);
        if (latest) void flushSave(latest);
      }, SAVE_DEBOUNCE_MS);
      saveTimers.current.set(draft.id, t);
    },
    [flushSave],
  );

  useEffect(() => {
    return () => {
      for (const t of saveTimers.current.values()) clearTimeout(t);
      saveTimers.current.clear();
      const pending = [...pendingSaves.current.values()];
      pendingSaves.current.clear();
      for (const d of pending) void flushSave(d);
    };
  }, [flushSave]);

  const refetch = useCallback(async () => {
    const s = scope();
    if (!s) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await migrateLocalDraftsIfNeeded(s, scopeKey);
      const list = await listEventsForScope(s);
      setDrafts(list);
    } catch (e) {
      console.error("[events] load failed", e);
      toast.error("Could not load events");
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [scope, scopeKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = scope();
      if (!s) {
        if (!cancelled) {
          setDrafts([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        await migrateLocalDraftsIfNeeded(s, scopeKey);
        const list = await listEventsForScope(s);
        if (!cancelled) setDrafts(list);
      } catch (e) {
        console.error("[events] load failed", e);
        if (!cancelled) {
          toast.error("Could not load events");
          setDrafts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, scopeKey]);

  useEffect(() => {
    const onRefresh = () => {
      void refetch();
    };
    window.addEventListener(EVENTS_REFRESH, onRefresh);
    return () => window.removeEventListener(EVENTS_REFRESH, onRefresh);
  }, [refetch]);

  const createDraft = useCallback(
    async (name: string, coOrganizers: CoOrganizerDraft[]) => {
      const s = scope();
      if (!s) throw new Error("Sign in to create an event");
      const draft = await createEventInDb(s, name, coOrganizers);
      setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
      return draft;
    },
    [scope],
  );

  const updateDraft = useCallback(
    (id: string, patch: Partial<Omit<EventDraft, "id" | "createdAt">>) => {
      const prev = draftsRef.current.find((d) => d.id === id);
      if (!prev) return null;
      const next: EventDraft = {
        ...prev,
        ...patch,
        id: prev.id,
        createdAt: prev.createdAt,
        location: patch.location
          ? { ...prev.location, ...patch.location }
          : prev.location,
        subevents: patch.subevents ?? prev.subevents,
        participants: patch.participants ?? prev.participants,
        coOrganizers: patch.coOrganizers ?? prev.coOrganizers,
      };
      setDrafts((list) => list.map((d) => (d.id === id ? next : d)));
      scheduleSave(next);
      return next;
    },
    [scheduleSave],
  );

  const getDraft = useCallback(
    (id: string) => draftsRef.current.find((d) => d.id === id) ?? null,
    [drafts],
  );

  const ensureDraft = useCallback(
    async (id: string) => {
      const cached = draftsRef.current.find((d) => d.id === id);
      if (cached) return cached;
      const s = scope();
      if (!s) return null;
      try {
        const draft = await getEventById(s, id);
        if (!draft) return null;
        setDrafts((prev) =>
          prev.some((d) => d.id === draft.id) ? prev : [draft, ...prev],
        );
        return draft;
      } catch (e) {
        console.error("[events] ensureDraft failed", e);
        return null;
      }
    },
    [scope],
  );

  const value = useMemo(
    () => ({
      drafts,
      loading,
      createDraft,
      updateDraft,
      getDraft,
      ensureDraft,
      refetch,
    }),
    [
      drafts,
      loading,
      createDraft,
      updateDraft,
      getDraft,
      ensureDraft,
      refetch,
    ],
  );

  return (
    <EventDraftsContext.Provider value={value}>
      {children}
    </EventDraftsContext.Provider>
  );
}

export function useEventDrafts(): EventDraftsValue {
  const ctx = useContext(EventDraftsContext);
  if (!ctx) {
    throw new Error("useEventDrafts must be used within EventDraftsProvider");
  }
  return ctx;
}
