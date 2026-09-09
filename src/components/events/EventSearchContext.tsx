import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface EventSearchResult {
  id: string;
  title: string;
}

interface EventSearchValue {
  active: boolean;
  setActive: (next: boolean) => void;
  query: string;
  setQuery: (next: string) => void;
  results: EventSearchResult[];
}

const Ctx = createContext<EventSearchValue | null>(null);

export function EventSearchProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState(false);
  const [query, setQueryState] = useState("");

  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
    if (!next) setQueryState("");
  }, []);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [];
  }, [query]);

  const value = useMemo(
    () => ({ active, setActive, query, setQuery, results }),
    [active, setActive, query, setQuery, results],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEventSearch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEventSearch must be used within EventSearchProvider");
  return ctx;
}
