import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { ClipboardPaste, Copy, Trash2 } from "lucide-react";
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
  copyWeekSuccessMessage,
  eventsCoveringWeek,
} from "@/lib/calendarClipboard";
import { isMembershipOverlayEvent } from "@/components/calendar/yearStore";
import {
  SESSION_ACTION_ITEM_CLASS,
  sessionDeleteActionClass,
} from "./CalendarSessionContextMenu";
import {
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";

type MenuState = { x: number; y: number; weekStart: Date };

export function useCalendarWeekContextMenu(viewMode: ViewMode) {
  const {
    calId,
    events,
    copyEventsToClipboard,
    canPasteWeek,
    pasteWeekAt,
    deleteEvents,
    canMutateEvent,
  } = useCalendarViewActions();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pasteEnabled = canPasteWeek();

  const weekEvents = menu
    ? eventsCoveringWeek(events, menu.weekStart).filter(
        (event) => canMutateEvent(event) && !isMembershipOverlayEvent(event, calId),
      )
    : [];
  const canClear = weekEvents.length > 0;

  const onContextMenu = useCallback((e: ReactMouseEvent, weekStart: Date) => {
    e.preventDefault();
    e.stopPropagation();
    const pad = 8;
    const menuW = 220;
    const menuH = 112;
    const x = Math.min(e.clientX, window.innerWidth - menuW - pad);
    const y = Math.min(e.clientY, window.innerHeight - menuH - pad);
    setMenu({
      x: Math.max(pad, x),
      y: Math.max(pad, y),
      weekStart,
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleCopy = useCallback(() => {
    if (!menu) return;
    const toCopy = eventsCoveringWeek(events, menu.weekStart).filter(
      (event) => canMutateEvent(event) && !isMembershipOverlayEvent(event, calId),
    );
    copyEventsToClipboard(toCopy, viewMode, "week");
    setMenu(null);
    setToast(copyWeekSuccessMessage());
  }, [calId, canMutateEvent, copyEventsToClipboard, events, menu, viewMode]);

  const handlePaste = useCallback(() => {
    if (!menu || !pasteEnabled) return;
    const ok = pasteWeekAt(menu.weekStart, viewMode);
    setMenu(null);
    if (ok) setToast("Week was pasted.");
  }, [menu, pasteEnabled, pasteWeekAt, viewMode]);

  const handleClear = useCallback(() => {
    if (!menu || !canClear) return;
    const ids = eventsCoveringWeek(events, menu.weekStart)
      .filter((event) => canMutateEvent(event) && !isMembershipOverlayEvent(event, calId))
      .map((event) => event.id);
    setMenu(null);
    if (ids.length > 0) deleteEvents(ids);
  }, [calId, canClear, canMutateEvent, deleteEvents, events, menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.copySession)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCopy();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.pasteSession)) {
        if (!pasteEnabled) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handlePaste();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [menu, handleCopy, handlePaste, pasteEnabled]);

  const overlay =
    menu && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[120]"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                closeMenu();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeMenu();
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
                aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.copySession)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className={`${SESSION_ACTION_ITEM_CLASS} text-white/90 hover:bg-white/[0.08] hover:text-white`}
              >
                <span className="flex items-center gap-2">
                  <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span>Copy week</span>
                </span>
                <MenuShortcut
                  shortcut={SHORTCUTS.copySession}
                  className="text-white/45 group-hover:text-white"
                />
              </button>
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
                  SESSION_ACTION_ITEM_CLASS,
                  pasteEnabled
                    ? "text-white/90 hover:bg-white/[0.08] hover:text-white"
                    : "text-white/40",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <ClipboardPaste className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span>Paste week</span>
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
              <button
                type="button"
                role="menuitem"
                disabled={!canClear}
                aria-disabled={!canClear}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canClear) return;
                  handleClear();
                }}
                className={sessionDeleteActionClass(canClear)}
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span>Clear week</span>
                </span>
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
