import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import {
  SESSION_CARD_WIDTH_PX,
  sessionMapPanelFitsBesideMenu,
} from "./sessionPanelDockUtils";

/**
 * Whether the session card + map panel can sit fully beside each other.
 * Pass `sessionRef` + `besideSession` while the map is open so shrinking
 * closes the map as soon as it would clip to the right of the session card.
 */
export function useSessionMapPanelFits(
  panelWidth = SESSION_CARD_WIDTH_PX,
  sessionRef?: RefObject<HTMLElement | null> | null,
  besideSession = false,
  onWillHide?: () => void,
): boolean {
  const [fits, setFits] = useState(() => sessionMapPanelFitsBesideMenu(panelWidth));
  const fitsRef = useRef(fits);
  fitsRef.current = fits;
  const besideRef = useRef(besideSession);
  besideRef.current = besideSession;
  const onWillHideRef = useRef(onWillHide);
  onWillHideRef.current = onWillHide;
  const sessionRefHeld = sessionRef;

  useLayoutEffect(() => {
    const readSessionRight = () =>
      besideRef.current ? sessionRefHeld?.current?.getBoundingClientRect().right ?? null : null;

    const update = () => {
      const next = sessionMapPanelFitsBesideMenu(
        panelWidth,
        undefined,
        readSessionRight(),
      );
      if (next === fitsRef.current) return;
      if (fitsRef.current && !next) onWillHideRef.current?.();
      fitsRef.current = next;
      flushSync(() => setFits(next));
    };

    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const root = document.documentElement;
    const mo = new MutationObserver(update);
    mo.observe(root, { attributes: true, attributeFilter: ["style"] });
    if (!besideSession) update();
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      mo.disconnect();
    };
  }, [panelWidth, besideSession, sessionRefHeld]);

  return fits;
}
