/**
 * Calendar left-rail ⋯ control: Mini calendar vs Upcoming sessions.
 *
 * Portaled into the same 48px top strip as PanelLeft / search, right-aligned
 * in the 256px panel. The charcoal menu sits 6px past the panel's right edge
 * (same gap the profile menu uses above the profile row).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronsRight, MoreHorizontal } from "lucide-react";
import {
  SESSION_SIDE_MENU_ITEM_CLASS,
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";

export type CalendarLeftRailView = "mini" | "upcoming";

const PANEL_WIDTH = 256;
const TOGGLE_INSET = 12; // left-3
const BTN_SIZE = 28; // h-7 w-7
const BTN_TOP = 6;
const BTN_LEFT = PANEL_WIDTH - TOGGLE_INSET - BTN_SIZE; // 216
/** Profile menu uses mb-1.5 (6px) from the profile row. */
const MENU_GAP = 6;

const ITEMS: {
  id: CalendarLeftRailView;
  label: string;
  Icon: typeof CalendarDays;
}[] = [
  { id: "mini", label: "Mini calendar", Icon: CalendarDays },
  { id: "upcoming", label: "Upcoming sessions", Icon: ChevronsRight },
];

export function CalendarRailViewMenu({
  visible,
  view,
  onViewChange,
}: {
  visible: boolean;
  view: CalendarLeftRailView;
  onViewChange: (next: CalendarLeftRailView) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [menuTop, setMenuTop] = useState(BTN_TOP);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (btn) setMenuTop(btn.getBoundingClientRect().top);
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (typeof document === "undefined" || !visible) return null;

  return createPortal(
    <div ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Left panel view"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Left panel view"
        onClick={() => setOpen((v) => !v)}
        className="fixed z-[200] grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-ink data-[state=open]:bg-secondary/60 data-[state=open]:text-ink"
        style={{ left: BTN_LEFT, top: BTN_TOP }}
        data-state={open ? "open" : "closed"}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className={`fixed z-[200] min-w-[200px] overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
          style={{
            ...SESSION_SIDE_MENU_SHELL_STYLE,
            left: PANEL_WIDTH + MENU_GAP,
            top: menuTop,
          }}
        >
          {ITEMS.map(({ id, label, Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                aria-checked={active}
                onClick={() => {
                  onViewChange(id);
                  setOpen(false);
                }}
                className={`${SESSION_SIDE_MENU_ITEM_CLASS}${active ? " bg-white/[0.08]" : ""}`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-white/50" strokeWidth={2} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
