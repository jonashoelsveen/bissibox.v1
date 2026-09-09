import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PanelLeft } from "lucide-react";
import {
  SESSION_PANEL_CORNER_RADIUS_PX,
  SESSION_PANEL_DOCK_PLACEHOLDER_BG,
  SESSION_PANEL_DOCK_SLOT_BG,
} from "./sessionPanelDockUtils";

function DockGuide({
  left,
  top,
  width,
  height,
  variant,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  variant: "dock-slot" | "placeholder";
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[48]"
      style={{
        left,
        top,
        width,
        height,
        borderRadius: SESSION_PANEL_CORNER_RADIUS_PX,
        background: variant === "dock-slot" ? SESSION_PANEL_DOCK_SLOT_BG : SESSION_PANEL_DOCK_PLACEHOLDER_BG,
        transition: "opacity 160ms ease-out",
      }}
    />
  );
}

export function SessionPanelDockGuides({
  showDockSlot,
  showPlaceholder,
  dockSlot,
  placeholder,
}: {
  showDockSlot: boolean;
  showPlaceholder: boolean;
  dockSlot: { left: number; top: number; width: number; height: number };
  placeholder: { left: number; top: number; width: number; height: number };
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || (!showDockSlot && !showPlaceholder)) return null;

  return createPortal(
    <>
      {showDockSlot ? <DockGuide {...dockSlot} variant="dock-slot" /> : null}
      {showPlaceholder ? <DockGuide {...placeholder} variant="placeholder" /> : null}
    </>,
    document.body,
  );
}

export function SessionPanelDockButton({
  docked,
  onHoverChange,
  onToggle,
}: {
  docked: boolean;
  onHoverChange: (hovered: boolean) => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={docked ? "Detach session panel" : "Dock session panel to the right"}
      aria-pressed={docked}
      title={docked ? "Detach panel" : "Dock panel to the right"}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-ink"
    >
      <PanelLeft className="h-4 w-4" strokeWidth={2} />
      {docked ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 block h-px w-[18px] -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] bg-current opacity-80"
        />
      ) : null}
    </button>
  );
}

/** Header row: dock control (left) + optional after-dock control + session actions (right). */
export function SessionPanelHeaderRow({
  docked,
  onDockHoverChange,
  onDockToggle,
  afterDock,
  actions,
}: {
  docked: boolean;
  onDockHoverChange: (hovered: boolean) => void;
  onDockToggle: () => void;
  /** Optional control immediately to the right of the panel/dock icon. */
  afterDock?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <SessionPanelDockButton
          docked={docked}
          onHoverChange={onDockHoverChange}
          onToggle={onDockToggle}
        />
        {afterDock ?? null}
      </div>
      <div className="flex items-center justify-end gap-0.5">{actions}</div>
    </div>
  );
}
