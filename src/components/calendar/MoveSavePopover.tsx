/**
 * MoveSavePopover — small inline popover shown next to a session tile
 * that was just drag-and-dropped to a new slot. Mirrors SessionPopoverEditor
 * positioning (right of the anchor when there is room, otherwise left).
 *
 * Layout: a header strip ("Save new time?") on top, and an equal-sized
 * footer row beneath it with a light-gray Cancel on the left and a black
 * Save button on the right.
 */

import { useEffect, useRef } from "react";

export interface MoveSavePopoverProps {
  anchor: DOMRect;
  onCancel: () => void;
  onSave: () => void;
}

const POPOVER_W = 280;
const ROW_H = 44;
const POPOVER_H = ROW_H * 2;

export function MoveSavePopover({ anchor, onCancel, onSave }: MoveSavePopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onSave();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onCancel();
    };
    window.addEventListener("keydown", onKey);
    // Defer so the click that ended the drag doesn't immediately close.
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", onDown);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.clearTimeout(t);
    };
  }, [onCancel, onSave]);

  const margin = 8;
  let top = anchor.top;
  let left = anchor.right + margin;
  if (left + POPOVER_W > window.innerWidth) {
    left = Math.max(margin, anchor.left - POPOVER_W - margin);
  }
  if (top + POPOVER_H > window.innerHeight) {
    top = Math.max(margin, window.innerHeight - POPOVER_H - margin);
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
      style={{ top, left, width: POPOVER_W }}
    >
      <div
        className="flex items-center justify-center border-b border-hairline px-3"
        style={{ height: ROW_H }}
      >
        <span className="text-[13px] font-medium text-ink">Save new time?</span>
      </div>
      <div
        className="flex items-center justify-between gap-2 px-3"
        style={{ height: ROW_H }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-muted px-3 py-1.5 text-[12px] font-medium text-ink/80 hover:bg-muted/80"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          autoFocus
          className="rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
          style={{ background: "hsl(var(--ink, 220 13% 13%))" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
