import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import {
  SESSION_CARD_WIDTH_PX,
  SESSION_SIDE_MENU_GAP_PX,
  sessionAdjacentMenuFits,
} from "./sessionPanelDockUtils";

/** Inner width of a session-menu row (card minus horizontal padding). */
export const SESSION_MENU_FIELD_WIDTH_PX = SESSION_CARD_WIDTH_PX - 24;

/**
 * Whether a submenu of `menuWidth` can sit fully beside the session card.
 * Hides as soon as neither side fits, and comes back when the window does.
 */
export function useSessionAdjacentMenuFits(
  sessionRef: RefObject<HTMLElement | null>,
  clusterRef: RefObject<HTMLElement | null>,
  menuWidth = SESSION_MENU_FIELD_WIDTH_PX,
  preferRight = false,
): boolean {
  const [fits, setFits] = useState(true);
  const fitsRef = useRef(fits);
  fitsRef.current = fits;

  useLayoutEffect(() => {
    const update = () => {
      const card = sessionRef.current?.getBoundingClientRect();
      const cluster = clusterRef.current?.getBoundingClientRect();
      const next = card
        ? sessionAdjacentMenuFits({
            sessionCard: card,
            cluster: cluster ?? undefined,
            menuWidth,
            preferRight,
            gap: SESSION_SIDE_MENU_GAP_PX,
          })
        : window.innerWidth >= SESSION_CARD_WIDTH_PX + menuWidth + 64;
      if (next === fitsRef.current) return;
      fitsRef.current = next;
      flushSync(() => setFits(next));
    };

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const mo = new MutationObserver(update);
    const watchStyle = (node: HTMLElement | null | undefined) => {
      if (node) mo.observe(node, { attributes: true, attributeFilter: ["style"] });
    };
    watchStyle(document.documentElement);
    watchStyle(sessionRef.current);
    watchStyle(clusterRef.current);
    const ro = new ResizeObserver(update);
    if (sessionRef.current) ro.observe(sessionRef.current);
    if (clusterRef.current) ro.observe(clusterRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      mo.disconnect();
      ro.disconnect();
    };
  }, [clusterRef, menuWidth, preferRight, sessionRef]);

  return fits;
}
