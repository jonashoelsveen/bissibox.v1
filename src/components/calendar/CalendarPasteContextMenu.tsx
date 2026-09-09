import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClipboardPaste } from "lucide-react";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import { CalendarInfoToast } from "@/components/calendar/CalendarInfoToast";
import { useCalendarViewActions } from "@/components/calendar/CalendarViewActionsContext";
import { MenuShortcut } from "@/components/ui/MenuShortcut";
import {
  SHORTCUTS,
  matchesShortcut,
  shortcutAriaKeyshortcuts,
} from "@/lib/shortcuts";
import {
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";

type MenuState = { x: number; y: number; targetDate: Date; startMin?: number };

function forwardMouseEvent(
  type: "mousedown" | "contextmenu",
  source: ReactMouseEvent | MouseEvent,
  target: EventTarget,
) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: source.clientX,
      clientY: source.clientY,
      screenX: source.screenX,
      screenY: source.screenY,
      button: source.button,
      buttons: source.buttons,
      ctrlKey: source.ctrlKey,
      metaKey: source.metaKey,
      shiftKey: source.shiftKey,
      altKey: source.altKey,
    }),
  );
}

export function useCalendarPasteContextMenu(
  viewMode: ViewMode,
  opts?: { onPasteCommit?: () => void },
) {
  const { canPaste, pasteAtDate } = useCalendarViewActions();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pasteEnabled = canPaste(viewMode);
  const onPasteCommitRef = useRef(opts?.onPasteCommit);
  onPasteCommitRef.current = opts?.onPasteCommit;

  const onContextMenu = useCallback(
    (e: ReactMouseEvent, targetDate: Date, startMin?: number) => {
      if ((e.target as HTMLElement).closest('[data-real-event="1"], [data-role="item"]')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const pad = 8;
      const menuW = 220;
      const menuH = 40;
      const x = Math.min(e.clientX, window.innerWidth - menuW - pad);
      const y = Math.min(e.clientY, window.innerHeight - menuH - pad);
      setMenu({
        x: Math.max(pad, x),
        y: Math.max(pad, y),
        targetDate,
        startMin,
      });
    },
    [],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const handlePaste = useCallback(() => {
    if (!menu || !pasteEnabled) return;
    onPasteCommitRef.current?.();
    const ok = pasteAtDate(menu.targetDate, viewMode, menu.startMin);
    setMenu(null);
    if (ok) setToast("Session was pasted.");
  }, [menu, pasteAtDate, pasteEnabled, viewMode]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
      if (!matchesShortcut(e, SHORTCUTS.pasteSession)) return;
      if (!pasteEnabled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      handlePaste();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [menu, handlePaste, pasteEnabled]);

  const overlay =
    menu && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[120]"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                // Swallow left-click dismiss so week/day cells do not start
                // a hold-and-drag create mark when closing this menu.
                e.preventDefault();
                e.stopPropagation();
                closeMenu();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const overlay = e.currentTarget as HTMLElement;
                overlay.style.pointerEvents = "none";
                const under = document.elementFromPoint(e.clientX, e.clientY);
                overlay.style.pointerEvents = "";
                closeMenu();
                if (!(under instanceof Element) || overlay.contains(under)) return;
                forwardMouseEvent("mousedown", e, under);
                forwardMouseEvent("contextmenu", e, under);
              }}
            />
            <div
              role="menu"
              className={`fixed z-[121] min-w-[220px] overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
              style={{ ...SESSION_SIDE_MENU_SHELL_STYLE, left: menu.x, top: menu.y }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={!pasteEnabled}
                aria-disabled={!pasteEnabled}
                aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.pasteSession)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!pasteEnabled) return;
                  handlePaste();
                }}
                className={[
                  "group flex w-full cursor-default items-center gap-6 rounded-md px-2.5 py-1.5 text-left text-xs",
                  pasteEnabled
                    ? "text-white/90 hover:bg-white/[0.08] hover:text-white"
                    : "text-white/40",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <ClipboardPaste className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span>Paste session</span>
                </span>
                <MenuShortcut
                  shortcut={SHORTCUTS.pasteSession}
                  className={
                    pasteEnabled
                      ? "text-white/45 group-hover:text-white"
                      : "text-white/25"
                  }
                />
              </button>
            </div>
          </>,
          document.body,
        )
      : null;

  const toastNode = toast ? (
    <CalendarInfoToast message={toast} onDismiss={() => setToast(null)} />
  ) : null;

  return { onContextMenu, overlay, toastNode };
}

export function CalendarPasteLayer({
  viewMode,
  children,
}: {
  viewMode: ViewMode;
  children: (onContextMenu: (e: ReactMouseEvent, targetDate: Date, startMin?: number) => void) => ReactNode;
}) {
  const { onContextMenu, overlay, toastNode } = useCalendarPasteContextMenu(viewMode);
  return (
    <>
      {children(onContextMenu)}
      {overlay}
      {toastNode}
    </>
  );
}
