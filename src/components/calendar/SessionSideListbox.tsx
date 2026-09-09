import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { computeSessionAdjacentMenuPosition, SESSION_SIDE_MENU_GAP_PX, SESSION_SIDE_MENU_SHELL_CLASS, SESSION_SIDE_MENU_SHELL_STYLE } from "./sessionPanelDockUtils";

export { SESSION_SIDE_MENU_ITEM_CLASS } from "./sessionPanelDockUtils";

/** Matches `p-1` / `gap-1` on the side menus (4px). */
export const SESSION_SIDE_MENU_INSET_PX = 4;
/** Colour / group / repeat row: py-1.5 + 12px type. */
export const SESSION_SIDE_MENU_ROW_PX = 28;

export function estimateSessionSideMenuHeight(rowCount: number): number {
  if (rowCount <= 0) return SESSION_SIDE_MENU_INSET_PX * 2;
  return (
    SESSION_SIDE_MENU_INSET_PX * 2 +
    rowCount * SESSION_SIDE_MENU_ROW_PX +
    (rowCount - 1) * SESSION_SIDE_MENU_INSET_PX
  );
}

export function SessionSideListbox({
  open,
  onClose,
  fieldRef,
  sessionCardRef,
  clusterRef,
  rightOccupied = false,
  estimatedHeight,
  onSideChange,
  children,
}: {
  open: boolean;
  onClose: () => void;
  fieldRef: RefObject<HTMLElement | null>;
  sessionCardRef: RefObject<HTMLDivElement | null>;
  clusterRef: RefObject<HTMLDivElement | null>;
  rightOccupied?: boolean;
  estimatedHeight: number;
  onSideChange?: (side: "left" | "right" | null) => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{
    left: number;
    top: number;
    width: number;
    side: "left" | "right";
  } | null>(null);

  const placeMenu = useCallback(() => {
    const field = fieldRef.current;
    const card = sessionCardRef.current;
    if (!field || !card) return;
    const fieldRect = field.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const clusterRect = clusterRef.current?.getBoundingClientRect();
    const width = Math.round(fieldRect.width);
    const height = menuRef.current?.offsetHeight || estimatedHeight;
    const next = computeSessionAdjacentMenuPosition({
      sessionCard: cardRect,
      cluster: clusterRect,
      alignTop: fieldRect.top,
      menuWidth: width,
      menuHeight: height,
      preferRight: !rightOccupied,
      gap: SESSION_SIDE_MENU_GAP_PX,
    });
    setMenuPos({ ...next, width });
  }, [clusterRef, estimatedHeight, fieldRef, rightOccupied, sessionCardRef]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      onSideChange?.(null);
      return;
    }
    placeMenu();
    const ro = new ResizeObserver(() => placeMenu());
    if (sessionCardRef.current) ro.observe(sessionCardRef.current);
    if (clusterRef.current) ro.observe(clusterRef.current);
    if (fieldRef.current) ro.observe(fieldRef.current);
    if (menuRef.current) ro.observe(menuRef.current);
    window.addEventListener("resize", placeMenu);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", placeMenu);
    };
  }, [clusterRef, fieldRef, onSideChange, open, placeMenu, sessionCardRef]);

  useLayoutEffect(() => {
    onSideChange?.(menuPos?.side ?? null);
  }, [menuPos?.side, onSideChange]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (fieldRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [fieldRef, onClose, open]);

  if (!open) return null;
  const host = clusterRef.current;
  if (!host) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[10]"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={menuRef}
        role="listbox"
        data-session-side-menu="1"
        className={`fixed z-[60] cursor-default p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
        style={{
          ...SESSION_SIDE_MENU_SHELL_STYLE,
          left: menuPos?.left ?? -9999,
          top: menuPos?.top ?? 0,
          width: menuPos?.width ?? fieldRef.current?.offsetWidth,
        }}
      >
        <div className="flex flex-col gap-1">{children}</div>
      </div>
    </>,
    host,
  );
}
