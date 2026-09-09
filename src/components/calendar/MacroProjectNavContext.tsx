/**
 * Shared Macro drill-in state: which project is open in the left rail + Gantt.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface MacroProjectNavValue {
  openProjectId: string | null;
  setOpenProjectId: (id: string | null) => void;
}

const MacroProjectNavContext = createContext<MacroProjectNavValue | null>(null);

export function MacroProjectNavProvider({ children }: { children: ReactNode }) {
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ openProjectId, setOpenProjectId }),
    [openProjectId],
  );
  return (
    <MacroProjectNavContext.Provider value={value}>
      {children}
    </MacroProjectNavContext.Provider>
  );
}

export function useMacroProjectNav(): MacroProjectNavValue {
  const ctx = useContext(MacroProjectNavContext);
  if (!ctx) {
    throw new Error("useMacroProjectNav must be used within MacroProjectNavProvider");
  }
  return ctx;
}

/** Safe for surfaces that may render outside the provider (returns closed). */
export function useMacroProjectNavSafe(): MacroProjectNavValue {
  const ctx = useContext(MacroProjectNavContext);
  return ctx ?? { openProjectId: null, setOpenProjectId: () => {} };
}
