import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Ctx = {
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
};

const TopBarSlotContext = createContext<Ctx | null>(null);

export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <TopBarSlotContext.Provider value={{ el, setEl }}>
      {children}
    </TopBarSlotContext.Provider>
  );
}

/** Mount point inside GlobalTopTabBar — captures the host DOM node. */
export function TopBarSlotMount({ className }: { className?: string }) {
  const ctx = useContext(TopBarSlotContext);
  if (!ctx) return null;
  return <div ref={ctx.setEl} className={className} />;
}

/**
 * Pages render this and pass children to publish them into the universal
 * top tab bar between the section icons and the search/plus icons.
 */
export function TopBarSlot({ children }: { children: ReactNode }) {
  const ctx = useContext(TopBarSlotContext);
  if (!ctx?.el) return null;
  return createPortal(children, ctx.el);
}
