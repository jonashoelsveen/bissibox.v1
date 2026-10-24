import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Copy, CopyPlus, Trash2 } from "lucide-react";
import type { CalendarEvent } from "@/components/calendar/yearStore";
import type { ViewMode } from "@/components/calendar/UnifiedElasticGrid";
import { CalendarInfoToast } from "@/components/calendar/CalendarInfoToast";
import { useCalendarViewActions } from "@/components/calendar/CalendarViewActionsContext";
import { MenuShortcut } from "@/components/ui/MenuShortcut";
import {
  SHORTCUTS,
  isEditableTarget,
  matchesShortcut,
  shortcutAriaKeyshortcuts,
} from "@/lib/shortcuts";
import {
  copySessionSuccessMessage,
  duplicateSessionSuccessMessage,
} from "@/lib/calendarClipboard";
import { isRepeatPreviewEventId } from "@/lib/sessionRepeat";
import { computePopoverPosition } from "./popoverPosition";
import { estimateSessionSideMenuHeight } from "./SessionSideListbox";
import { eventTargetElement } from "./SessionScopeMenu";
import {
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";

export const SESSION_TILE_MENU_ATTR = "data-session-tile-menu";

export const SESSION_ACTION_ITEM_CLASS =
  "group flex w-full cursor-default items-center gap-6 rounded-sm px-2.5 py-1.5 text-left text-xs";

/** Stronger than the last pass, still short of clicked-session red (#ef4444). */
export function sessionDeleteActionClass(enabled: boolean): string {
  return [
    SESSION_ACTION_ITEM_CLASS,
    enabled
      ? "text-[#ED5C5C] hover:bg-[#E44F4F] hover:text-white"
      : "text-[#ED5C5C]/40",
  ].join(" ");
}

export const SESSION_DELETE_SHORTCUT_CLASS = "text-[#ED5C5C]/70 group-hover:text-white";

const MENU_WIDTH = 220;
const MENU_ROWS = 3;

type MenuState = {
  event: CalendarEvent;
  left: number;
  top: number;
  /** When set, the menu is only Delete and it removes every id. */
  bulkIds: string[] | null;
};

export const SESSION_SHIFT_MARK_EVENT = "bissibox:session-shift-mark";

/** Session tile under a pointer event, including all-day chips whose id sits on the parent. */
export function sessionTileFromTarget(
  target: EventTarget | null,
): { id: string; el: HTMLElement } | null {
  const el = eventTargetElement(target);
  if (!el) return null;
  const tile =
    el.closest<HTMLElement>('[data-real-event="1"]') ??
    el.closest<HTMLElement>("[data-role='item'][data-event-id]");
  if (!tile) return null;
  const id =
    tile.getAttribute("data-event-id") ??
    tile.parentElement?.getAttribute("data-event-id");
  if (!id || isRepeatPreviewEventId(id)) return null;
  return { id, el: tile };
}

export function useCalendarSessionContextMenu(
  viewMode: ViewMode,
  opts?: {
    onOpen?: (event: CalendarEvent) => void;
    onDelete?: (id: string) => void;
    /** Right-click should cancel this session instead of opening the menu. */
    shouldDismiss?: (event: CalendarEvent) => boolean;
    onDismiss?: (event: CalendarEvent) => void;
    /** Ids currently shift-marked. Right-clicking one of them deletes the set. */
    getMarkedIds?: () => string[];
    onDeleteMany?: (ids: string[]) => void;
    /** A normal menu replaces the shift-mark set. */
    onClearMarks?: () => void;
  },
) {
  const {
    events,
    copyEventsToClipboard,
    duplicateEvent,
    deleteEvent,
    canMutateEvent,
  } = useCalendarViewActions();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const onOpenRef = useRef(opts?.onOpen);
  onOpenRef.current = opts?.onOpen;
  const onDeleteRef = useRef(opts?.onDelete);
  onDeleteRef.current = opts?.onDelete;
  const shouldDismissRef = useRef(opts?.shouldDismiss);
  shouldDismissRef.current = opts?.shouldDismiss;
  const onDismissRef = useRef(opts?.onDismiss);
  onDismissRef.current = opts?.onDismiss;
  const getMarkedIdsRef = useRef(opts?.getMarkedIds);
  getMarkedIdsRef.current = opts?.getMarkedIds;
  const onDeleteManyRef = useRef(opts?.onDeleteMany);
  onDeleteManyRef.current = opts?.onDeleteMany;
  const onClearMarksRef = useRef(opts?.onClearMarks);
  onClearMarksRef.current = opts?.onClearMarks;

  const closeMenu = useCallback(() => setMenu(null), []);

  const onSessionContextMenu = useCallback(
    (e: ReactMouseEvent, event: CalendarEvent, anchor: HTMLElement) => {
      if (isRepeatPreviewEventId(event.id)) return;
      e.preventDefault();
      e.stopPropagation();
      if (shouldDismissRef.current?.(event)) {
        onDismissRef.current?.(event);
        setMenu(null);
        return;
      }
      onOpenRef.current?.(event);
      const marked = (getMarkedIdsRef.current?.() ?? []).filter(
        (id) => !isRepeatPreviewEventId(id),
      );
      const bulkIds = marked.includes(event.id) ? marked : null;
      if (!bulkIds) onClearMarksRef.current?.();
      const rect = anchor.getBoundingClientRect();
      const pos = computePopoverPosition(
        rect,
        MENU_WIDTH,
        estimateSessionSideMenuHeight(bulkIds ? 1 : MENU_ROWS),
      );
      setMenu({ event, left: pos.left, top: pos.top, bulkIds });
    },
    [],
  );

  const canAct = menu
    ? menu.bulkIds
      ? menu.bulkIds.some((id) => {
          const ev = events.find((item) => item.id === id);
          return ev ? canMutateEvent(ev) : false;
        })
      : canMutateEvent(menu.event)
    : false;

  const handleCopy = useCallback(() => {
    if (!menu) return;
    copyEventsToClipboard([menu.event], viewMode);
    setMenu(null);
    setToast(copySessionSuccessMessage(menu.event.title));
  }, [copyEventsToClipboard, menu, viewMode]);

  const handleDuplicate = useCallback(() => {
    if (!menu || !canMutateEvent(menu.event)) return;
    const created = duplicateEvent(menu.event);
    setMenu(null);
    if (created) setToast(duplicateSessionSuccessMessage(created.title));
  }, [canMutateEvent, duplicateEvent, menu]);

  const handleDelete = useCallback(() => {
    if (!menu) return;
    if (menu.bulkIds && menu.bulkIds.length > 0) {
      const ids = menu.bulkIds;
      setMenu(null);
      if (onDeleteManyRef.current) onDeleteManyRef.current(ids);
      else ids.forEach((id) => deleteEvent(id));
      return;
    }
    if (!canMutateEvent(menu.event)) return;
    const id = menu.event.id;
    setMenu(null);
    if (onDeleteRef.current) onDeleteRef.current(id);
    else deleteEvent(id);
  }, [canMutateEvent, deleteEvent, menu]);

  useEffect(() => {
    if (!menu) return;
    if (!events.some((e) => e.id === menu.event.id)) setMenu(null);
  }, [events, menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.copySession)) {
        if (menu.bulkIds) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCopy();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.duplicateSession)) {
        if (menu.bulkIds) return;
        if (!canAct) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDuplicate();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.deleteSession)) {
        if (!canAct) return;
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDelete();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = eventTargetElement(e.target);
      if (el?.closest(`[${SESSION_TILE_MENU_ATTR}]`)) return;
      if (el?.closest('[data-real-event="1"][data-event-id]')) return;
      setMenu(null);
    };
    const onDocContextMenu = (e: Event) => {
      const el = eventTargetElement(e.target);
      if (el?.closest(`[${SESSION_TILE_MENU_ATTR}]`)) return;
      if (el?.closest('[data-real-event="1"][data-event-id]')) return;
      setMenu(null);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("contextmenu", onDocContextMenu, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("contextmenu", onDocContextMenu, true);
    };
  }, [menu, canAct, handleCopy, handleDuplicate, handleDelete]);

  const overlay =
    menu && typeof document !== "undefined"
      ? createPortal(
          <div
            role="menu"
            data-session-tile-menu="1"
            className={`fixed z-[121] min-w-[220px] overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
            style={{ ...SESSION_SIDE_MENU_SHELL_STYLE, left: menu.left, top: menu.top }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {!menu.bulkIds ? (
            <button
              type="button"
              role="menuitem"
              aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.copySession)}
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className={`${SESSION_ACTION_ITEM_CLASS} text-white/90 hover:bg-white/[0.08] hover:text-white`}
            >
              <span className="flex items-center gap-2">
                <Copy className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                <span>Copy session</span>
              </span>
              <MenuShortcut
                shortcut={SHORTCUTS.copySession}
                className="text-white/45 group-hover:text-white"
              />
            </button>
            ) : null}
            {!menu.bulkIds ? (
            <button
              type="button"
              role="menuitem"
              disabled={!canAct}
              aria-disabled={!canAct}
              aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.duplicateSession)}
              onClick={(e) => {
                e.stopPropagation();
                if (!canAct) return;
                handleDuplicate();
              }}
              className={[
                SESSION_ACTION_ITEM_CLASS,
                canAct
                  ? "text-white/90 hover:bg-white/[0.08] hover:text-white"
                  : "text-white/40",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <CopyPlus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                <span>Duplicate session</span>
              </span>
              <MenuShortcut
                shortcut={SHORTCUTS.duplicateSession}
                className={
                  canAct
                    ? "text-white/45 group-hover:text-white"
                    : "text-white/25"
                }
              />
            </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              disabled={!canAct}
              aria-disabled={!canAct}
              aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.deleteSession)}
              onClick={(e) => {
                e.stopPropagation();
                if (!canAct) return;
                handleDelete();
              }}
              className={sessionDeleteActionClass(canAct)}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                <span>{menu.bulkIds && menu.bulkIds.length > 1 ? "Delete sessions" : "Delete session"}</span>
              </span>
              <MenuShortcut
                shortcut={SHORTCUTS.deleteSession}
                className={
                  canAct ? SESSION_DELETE_SHORTCUT_CLASS : "text-[#ED5C5C]/30"
                }
              />
            </button>
          </div>,
          document.body,
        )
      : null;

  const toastNode = toast ? (
    <CalendarInfoToast message={toast} onDismiss={() => setToast(null)} />
  ) : null;

  return {
    onSessionContextMenu,
    closeMenu,
    overlay,
    toastNode,
    activeEventId: menu?.event.id ?? null,
  };
}
