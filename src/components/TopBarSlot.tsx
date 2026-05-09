import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = {
  node: ReactNode;
  setNode: (n: ReactNode) => void;
};

const TopBarSlotContext = createContext<Ctx | null>(null);

export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  return (
    <TopBarSlotContext.Provider value={{ node, setNode }}>
      {children}
    </TopBarSlotContext.Provider>
  );
}

export function useTopBarSlotNode(): ReactNode {
  const ctx = useContext(TopBarSlotContext);
  return ctx?.node ?? null;
}

/**
 * Pages call this to publish a node (e.g. their open-tab strip) into the
 * universal top tab bar between the section icons and the search/plus icons.
 * The node is cleared automatically when the page unmounts or deps change.
 */
export function useTopBarSlot(node: ReactNode, deps: React.DependencyList) {
  const ctx = useContext(TopBarSlotContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setNode(node);
    return () => ctx.setNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
