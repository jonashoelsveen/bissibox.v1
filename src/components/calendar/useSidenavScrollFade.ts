import { useCallback, useEffect, useRef } from "react";

/** Matches left-panel `.sidenav-scroll`: stay visible 800ms after last scroll. */
export const SIDENAV_SCROLL_FADE_MS = 800;

/**
 * Callback ref for a `.sidenav-scroll` element so `data-scrolling` is set
 * while the user scrolls and cleared after {@link SIDENAV_SCROLL_FADE_MS}.
 */
export function useSidenavScrollFade() {
  const hideTimerRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const setNode = useCallback((el: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;
    const onScroll = () => {
      el.setAttribute("data-scrolling", "1");
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        el.removeAttribute("data-scrolling");
        hideTimerRef.current = null;
      }, SIDENAV_SCROLL_FADE_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    cleanupRef.current = () => {
      el.removeEventListener("scroll", onScroll);
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return setNode;
}
