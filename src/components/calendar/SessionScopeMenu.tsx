import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  SESSION_DELETE_LABELS,
  type SessionDeleteScope,
} from "@/lib/sessionRepeat";
import {
  SESSION_SIDE_MENU_GAP_PX,
  SESSION_SIDE_MENU_ITEM_CLASS,
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";

/** Shared with delete — PopoverEditor outside-click must ignore this menu. */
export const SESSION_SCOPE_MENU_ATTR = "data-session-delete-menu";

const MENU_ITEMS: SessionDeleteScope[] = ["this", "allInSeries"];

/** Click targets are often text nodes; `closest` needs an Element. */
export function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/**
 * Portal menu for this-session vs all-in-series scope — used by Gantt delete.
 * Session-menu edits use SessionSeriesScopeTabs instead.
 */
export function SessionScopeMenu({
  open,
  anchorRef,
  onSelect,
  onDismiss,
  heading,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onSelect: (scope: SessionDeleteScope) => void;
  onDismiss: () => void;
  heading?: string;
}) {
  const [menuPos, setMenuPos] = useState<{
    left: number;
    top: number;
    placeBelow: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gap = SESSION_SIDE_MENU_GAP_PX;
      const spaceAbove = rect.top - gap;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const placeBelow = spaceAbove < 96 && spaceBelow > spaceAbove;
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - 248),
      );
      setMenuPos({
        left,
        top: placeBelow ? rect.bottom + gap : rect.top - gap,
        placeBelow,
      });
    };
    update();
    const raf = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    let armed = false;
    const armId = window.setTimeout(() => {
      armed = true;
    }, 0);
    const onDoc = (e: MouseEvent) => {
      if (!armed) return;
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      const el = eventTargetElement(e.target);
      if (el?.closest(`[${SESSION_SCOPE_MENU_ATTR}]`)) return;
      // Map / session card clicks must not dismiss — the prompt is opened
      // from those surfaces, and Mapbox can emit extra pointer events.
      if (el?.closest('[data-role="popover"]')) return;
      if (el?.closest("[data-session-location-map]")) return;
      if (el?.closest("[data-session-location-field]")) return;
      onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onDismiss();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(armId);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onDismiss]);

  if (!open || !menuPos) return null;

  return createPortal(
    <div
      data-session-delete-menu
      role="menu"
      className={`fixed z-[80] min-w-[240px] p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
      style={{
        ...SESSION_SIDE_MENU_SHELL_STYLE,
        left: menuPos.left,
        top: menuPos.top,
        transform: menuPos.placeBelow ? undefined : "translateY(-100%)",
      }}
    >
      <div className="flex flex-col gap-1">
        {heading ? (
          <div className="px-2 py-1.5 text-[12px] text-white/50">{heading}</div>
        ) : null}
        {MENU_ITEMS.map((scope) => (
          <button
            key={scope}
            type="button"
            role="menuitem"
            // Select on mousedown (not click): the menu is portaled outside the
            // React root, so a naive dismiss listener can unmount us before click.
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(scope);
            }}
            className={SESSION_SIDE_MENU_ITEM_CLASS}
          >
            {SESSION_DELETE_LABELS[scope]}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
