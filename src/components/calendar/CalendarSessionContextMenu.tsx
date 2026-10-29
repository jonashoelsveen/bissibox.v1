import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Copy, CopyPlus, Trash2 } from "lucide-react";
import {
  isStandardWebAddressSession,
  type CalendarEvent,
} from "@/components/calendar/yearStore";
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
  copySessionsSuccessMessage,
  duplicateSessionSuccessMessage,
} from "@/lib/calendarClipboard";
import { sessionCopyMenu } from "@/lib/sessionCopyMenu";
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

type MenuState = {
  event: CalendarEvent;
  left: number;
  top: number;
  /** When set, the menu acts on every id (shift-marked set). */
  bulkIds: string[] | null;
  targets: CalendarEvent[];
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
    /** Ids currently shift-marked. Right-clicking one of them acts on the set. */
    getMarkedIds?: () => string[];
    /**
     * Sessions on screen, including web-address feed rows that are not in the
     * saved event store. Copy resolves titles and times from this list.
     */
    getVisibleEvents?: () => CalendarEvent[];
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
  const getVisibleEventsRef = useRef(opts?.getVisibleEvents);
  getVisibleEventsRef.current = opts?.getVisibleEvents;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const canMutateRef = useRef(canMutateEvent);
  canMutateRef.current = canMutateEvent;
  const onDeleteManyRef = useRef(opts?.onDeleteMany);
  onDeleteManyRef.current = opts?.onDeleteMany;
  const onClearMarksRef = useRef(opts?.onClearMarks);
  onClearMarksRef.current = opts?.onClearMarks;

  const closeMenu = useCallback(() => setMenu(null), []);

  const resolveEvent = useCallback((id: string, clicked?: CalendarEvent) => {
    const visible = getVisibleEventsRef.current?.() ?? [];
    return (
      visible.find((item) => item.id === id) ??
      eventsRef.current.find((item) => item.id === id) ??
      (clicked?.id === id ? clicked : undefined)
    );
  }, []);

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
      const ids = bulkIds ?? [event.id];
      const targets: CalendarEvent[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        const resolved = resolveEvent(id, event);
        if (!resolved || seen.has(resolved.id)) continue;
        seen.add(resolved.id);
        targets.push(resolved);
      }
      if (targets.length === 0) targets.push(event);
      const subscriptionOnly = targets.every((item) => isStandardWebAddressSession(item));
      const anyDeletable = targets.some(
        (item) => canMutateRef.current(item) && !isStandardWebAddressSession(item),
      );
      const singleCanDuplicate =
        targets.length === 1 &&
        (isStandardWebAddressSession(targets[0]!) || canMutateRef.current(targets[0]!));
      const rows = sessionCopyMenu({
        count: targets.length,
        subscriptionOnly,
        anyDeletable,
        singleCanDuplicate,
      }).rowCount;
      const rect = anchor.getBoundingClientRect();
      const pos = computePopoverPosition(rect, MENU_WIDTH, estimateSessionSideMenuHeight(rows));
      setMenu({ event, left: pos.left, top: pos.top, bulkIds, targets });
    },
    [resolveEvent],
  );

  const menuModel = menu
    ? sessionCopyMenu({
        count: menu.targets.length,
        subscriptionOnly: menu.targets.every((item) => isStandardWebAddressSession(item)),
        anyDeletable: menu.targets.some(
          (item) => canMutateEvent(item) && !isStandardWebAddressSession(item),
        ),
        singleCanDuplicate:
          menu.targets.length === 1 &&
          (isStandardWebAddressSession(menu.targets[0]!) || canMutateEvent(menu.targets[0]!)),
      })
    : null;

  const handleCopy = useCallback(() => {
    if (!menu || menu.targets.length === 0) return;
    copyEventsToClipboard(menu.targets, viewMode);
    setMenu(null);
    setToast(copySessionsSuccessMessage(menu.targets.length, menu.targets[0]?.title));
  }, [copyEventsToClipboard, menu, viewMode]);

  const handleDuplicate = useCallback(() => {
    if (!menu || menu.targets.length !== 1) return;
    const target = menu.targets[0]!;
    if (!isStandardWebAddressSession(target) && !canMutateEvent(target)) return;
    const visible = getVisibleEventsRef.current?.() ?? [];
    const created = duplicateEvent(target, visible);
    setMenu(null);
    if (created) setToast(duplicateSessionSuccessMessage(created.title));
  }, [canMutateEvent, duplicateEvent, menu]);

  const handleDelete = useCallback(() => {
    if (!menu) return;
    const ids = menu.targets
      .filter((item) => canMutateEvent(item) && !isStandardWebAddressSession(item))
      .map((item) => item.id);
    if (ids.length === 0) return;
    setMenu(null);
    if (menu.bulkIds && menu.bulkIds.length > 0) {
      if (onDeleteManyRef.current) onDeleteManyRef.current(ids);
      else ids.forEach((id) => deleteEvent(id));
      return;
    }
    const id = ids[0]!;
    if (onDeleteRef.current) onDeleteRef.current(id);
    else deleteEvent(id);
  }, [canMutateEvent, deleteEvent, menu]);

  useEffect(() => {
    if (!menu) return;
    const visible = getVisibleEventsRef.current?.() ?? [];
    const known =
      visible.some((item) => item.id === menu.event.id) ||
      events.some((item) => item.id === menu.event.id);
    if (!known) setMenu(null);
  }, [events, menu]);

  useEffect(() => {
    if (!menu || !menuModel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.copySession)) {
        if (!menuModel.showCopy) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleCopy();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.duplicateSession)) {
        if (!menuModel.duplicateEnabled) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleDuplicate();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.deleteSession)) {
        if (!menuModel.deleteEnabled) return;
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
  }, [menu, menuModel, handleCopy, handleDuplicate, handleDelete]);

  const overlay =
    menu && menuModel && typeof document !== "undefined"
      ? createPortal(
          <div
            role="menu"
            data-session-tile-menu="1"
            className={`fixed z-[121] min-w-[220px] overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
            style={{ ...SESSION_SIDE_MENU_SHELL_STYLE, left: menu.left, top: menu.top }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {menuModel.showCopy ? (
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
                <span>{menuModel.copyLabel}</span>
              </span>
              <MenuShortcut
                shortcut={SHORTCUTS.copySession}
                className="text-white/45 group-hover:text-white"
              />
            </button>
            ) : null}
            {menuModel.showDuplicate ? (
            <button
              type="button"
              role="menuitem"
              disabled={!menuModel.duplicateEnabled}
              aria-disabled={!menuModel.duplicateEnabled}
              aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.duplicateSession)}
              onClick={(e) => {
                e.stopPropagation();
                if (!menuModel.duplicateEnabled) return;
                handleDuplicate();
              }}
              className={[
                SESSION_ACTION_ITEM_CLASS,
                menuModel.duplicateEnabled
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
                  menuModel.duplicateEnabled
                    ? "text-white/45 group-hover:text-white"
                    : "text-white/25"
                }
              />
            </button>
            ) : null}
            {menuModel.showDelete ? (
            <button
              type="button"
              role="menuitem"
              disabled={!menuModel.deleteEnabled}
              aria-disabled={!menuModel.deleteEnabled}
              aria-keyshortcuts={shortcutAriaKeyshortcuts(SHORTCUTS.deleteSession)}
              onClick={(e) => {
                e.stopPropagation();
                if (!menuModel.deleteEnabled) return;
                handleDelete();
              }}
              className={sessionDeleteActionClass(menuModel.deleteEnabled)}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                <span>{menuModel.deleteLabel}</span>
              </span>
              <MenuShortcut
                shortcut={SHORTCUTS.deleteSession}
                className={
                  menuModel.deleteEnabled ? SESSION_DELETE_SHORTCUT_CLASS : "text-[#ED5C5C]/30"
                }
              />
            </button>
            ) : null}
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
