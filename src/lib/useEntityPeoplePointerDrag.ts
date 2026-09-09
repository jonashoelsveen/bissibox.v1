/**
 * Pointer hit-test drag for moving selected entity people between groups.
 * Drop target = elementFromPoint → [data-entity-drop-group], not dnd-kit `over`.
 *
 * Commit is driven by a durable `commitRef` so spurious `pointercancel`
 * (DOM remount / lost capture mid-drag) cannot drop the payload before
 * `pointerup` runs the actual state update.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { isNoOpPeopleDrop, personRowIdsForSelection } from "@/lib/entityMemberMove";

export const ENTITY_DROP_GROUP_ATTR = "data-entity-drop-group";

const THRESHOLD_PX = 4;

export function readDropGroupFromPoint(x: number, y: number): string | null {
  if (typeof document === "undefined") return null;
  const stack =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(x, y)
      : (() => {
          const el = document.elementFromPoint(x, y);
          return el ? [el] : [];
        })();

  for (const node of stack) {
    if (!(node instanceof Element)) continue;
    const host = node.closest(`[${ENTITY_DROP_GROUP_ATTR}]`);
    const id = host?.getAttribute(ENTITY_DROP_GROUP_ATTR);
    if (id) return id;
  }
  return null;
}

export type PeoplePointerDrag = {
  rowIds: string[];
  /** Sticky last valid drop target (placeholders / commit). */
  overGroupId: string | null;
  /** Live hit under the pointer — null when not over a group (spring-load). */
  hoverGroupId: string | null;
  x: number;
  y: number;
};

type CommitPayload = {
  rowIds: string[];
  overGroupId: string | null;
};

export function useEntityPeoplePointerDrag(opts: {
  selected: Set<string>;
  onMove: (rowIds: string[], targetGroupId: string) => void | Promise<boolean>;
}) {
  const [drag, setDrag] = useState<PeoplePointerDrag | null>(null);
  const dragRef = useRef<PeoplePointerDrag | null>(null);
  /** Survives pointercancel / remount; cleared only after pointerup commit attempt. */
  const commitRef = useRef<CommitPayload | null>(null);
  const selectedRef = useRef(opts.selected);
  selectedRef.current = opts.selected;
  const onMoveRef = useRef(opts.onMove);
  onMoveRef.current = opts.onMove;

  const pendingRef = useRef<{
    rowIds: string[];
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending) {
        const dx = e.clientX - pending.x;
        const dy = e.clientY - pending.y;
        if (dx * dx + dy * dy < THRESHOLD_PX * THRESHOLD_PX) return;
        const hoverGroupId = readDropGroupFromPoint(e.clientX, e.clientY);
        const next: PeoplePointerDrag = {
          rowIds: pending.rowIds,
          overGroupId: hoverGroupId,
          hoverGroupId,
          x: e.clientX,
          y: e.clientY,
        };
        pendingRef.current = null;
        dragRef.current = next;
        commitRef.current = { rowIds: next.rowIds, overGroupId: hoverGroupId };
        setDrag(next);
        return;
      }
      if (!dragRef.current && !commitRef.current) return;

      const hit = readDropGroupFromPoint(e.clientX, e.clientY);
      const base = dragRef.current;
      const overGroupId =
        hit ?? base?.overGroupId ?? commitRef.current?.overGroupId ?? null;
      const rowIds = base?.rowIds ?? commitRef.current?.rowIds;
      if (!rowIds) return;

      commitRef.current = { rowIds, overGroupId };

      if (base) {
        const next: PeoplePointerDrag = {
          ...base,
          overGroupId,
          hoverGroupId: hit,
          x: e.clientX,
          y: e.clientY,
        };
        dragRef.current = next;
        setDrag(next);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (pendingRef.current) {
        pendingRef.current = null;
        commitRef.current = null;
        return;
      }

      const commit = commitRef.current;
      const active = dragRef.current;
      commitRef.current = null;
      dragRef.current = null;
      setDrag(null);

      const rowIds = commit?.rowIds ?? active?.rowIds;
      if (!rowIds?.length) return;

      // Prefer sticky target from the drag session (same signal as placeholders).
      const target =
        commit?.overGroupId ??
        active?.overGroupId ??
        readDropGroupFromPoint(e.clientX, e.clientY);
      if (!target || isNoOpPeopleDrop(rowIds, target)) return;
      void onMoveRef.current(rowIds, target);
    };

    const onCancel = () => {
      pendingRef.current = null;
      // Spurious cancel (lost capture / remount) must NOT drop commitRef —
      // pointerup still owns the data commit.
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, []);

  const beginDrag = useCallback((e: ReactPointerEvent, rowId: string) => {
    if (e.button !== 0) return;
    if (e.shiftKey) return;
    let sel = selectedRef.current;
    // Finder: mousedown on an unmarked row selects it, then drag can start.
    if (!sel.has(rowId)) {
      sel = new Set([rowId]);
      selectedRef.current = sel;
    }
    const rowIds = personRowIdsForSelection(sel);
    if (rowIds.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Window listeners still receive move/up.
    }
    pendingRef.current = {
      rowIds,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    commitRef.current = null;
  }, []);

  return {
    drag,
    draggingIds: drag?.rowIds ?? null,
    overGroupId: drag?.overGroupId ?? null,
    /** Non-sticky pointer hit — use for Finder spring-load dwell. */
    hoverGroupId: drag?.hoverGroupId ?? null,
    beginDrag,
    isDragging: drag != null,
  };
}
