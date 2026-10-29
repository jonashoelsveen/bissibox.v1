import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Pencil, Copy, Trash2, Users, Check, ChevronRight } from "lucide-react";
import {
  DEFAULT_SESSION_COLOR,
  isSessionBlackColor,
  isSessionWhiteColor,
  STANDARD_COLORS_NAMED,
  type ColorValue,
} from "./sessionColors";
import {
  getSessionDefaultColor,
  setSessionDefaultColor,
  subscribeSessionDefaultColor,
} from "@/lib/sessionDefaultColor";

export type { ColorValue } from "./sessionColors";
export {
  DEFAULT_SESSION_COLOR,
  SESSION_COLOR_BLACK,
  SESSION_COLOR_WHITE,
  SESSION_WHITE_INK,
  STANDARD_COLORS,
  STANDARD_COLORS_8,
  STANDARD_COLORS_NAMED,
  isSessionBlackColor,
  isSessionWhiteColor,
  sessionMonthChipChrome,
  sessionTileChrome,
  sessionWeekDayTileFill,
  teamSessionMenuBackground,
  withTeamSessionStripes,
  standardColorLabel,
} from "./sessionColors";
export { getSessionDefaultColor, setSessionDefaultColor } from "@/lib/sessionDefaultColor";
export type { SessionTileChrome } from "./sessionColors";

// ---- Singleton coordinator: only one CategoryActionsMenu open at a time ----
let openMenuId: string | null = null;
const openMenuListeners = new Set<(id: string | null) => void>();
function setOpenMenuId(id: string | null) {
  if (openMenuId === id) return;
  openMenuId = id;
  openMenuListeners.forEach((l) => l(id));
}

/** Cursor point for submenu hover-intent geometry. */
type Pt = { x: number; y: number };

function pointInRect(p: Pt, r: DOMRect, pad = 0): boolean {
  return (
    p.x >= r.left - pad &&
    p.x <= r.right + pad &&
    p.y >= r.top - pad &&
    p.y <= r.bottom + pad
  );
}

function pointInTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const sign = (p1: Pt, p2: Pt, p3: Pt) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Notion-style aim wedge for a right-opening submenu:
 * triangle from the cursor (apex) to the list's top-left and bottom-left.
 * Staying inside that wedge keeps the list open while aiming — including
 * diagonally toward the bottom of the list — without holding it open when
 * the cursor moves onto other menu rows (outside the wedge).
 */
function isInAimTriangle(apex: Pt, p: Pt, sub: DOMRect): boolean {
  const topLeft: Pt = { x: sub.left, y: sub.top };
  const bottomLeft: Pt = { x: sub.left, y: sub.bottom };
  return pointInTriangle(p, apex, topLeft, bottomLeft);
}

/** Grace while the pointer is mid-flight inside the aim wedge. */
const AIM_GRACE_MS = 280;

export type CategoryExtraItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  top?: boolean;
};

export type CategoryActionsMenuProps = {
  trigger: ReactNode;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  currentColor: ColorValue;
  onColorChange: (color: ColorValue) => void;
  extraItems?: CategoryExtraItem[];
  allowColor?: boolean;
  allowCustomColor?: boolean;
  /** Prepend a Default row in the colour list (membership overlay). */
  includeDefaultColor?: boolean;
  /** Label for the colour row in the main menu. */
  colorLabel?: string;
  colorSwatches?: ColorValue[];
  accessPanel?: ReactNode;
};

/** Sentinel for “use each session’s original colour” in membership overlays. */
export const MEMBERSHIP_COLOR_DEFAULT: ColorValue = "";

const SUB_GAP = 4;

type SubPanel = "color" | "access" | null;

export function CategoryActionsMenu({
  trigger,
  onRename,
  onDuplicate,
  onDelete,
  currentColor,
  onColorChange,
  extraItems = [],
  allowColor = true,
  includeDefaultColor = false,
  colorLabel = "Color",
  colorSwatches,
  accessPanel,
}: CategoryActionsMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [subPanel, setSubPanel] = useState<SubPanel>(null);

  const triggerRef = useRef<HTMLSpanElement>(null);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const subPanelRef = useRef<HTMLDivElement>(null);
  const colorRowRef = useRef<HTMLDivElement>(null);
  const accessRowRef = useRef<HTMLDivElement>(null);
  const subCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Latest / previous pointer for aim detection. */
  const pointerRef = useRef<Pt>({ x: 0, y: 0 });
  const prevPointerRef = useRef<Pt>({ x: 0, y: 0 });
  /** Leave point while a directed aim toward the submenu is active. */
  const aimApexRef = useRef<Pt | null>(null);
  /** While true, ignore sibling submenu rows only if aim is still directed at the list. */
  const intentFreezeRef = useRef(false);
  const subPanelStateRef = useRef<SubPanel>(null);
  subPanelStateRef.current = subPanel;

  const topExtras = extraItems.filter((i) => i.top);
  const bottomExtras = extraItems.filter((i) => !i.top);

  const [mainPos, setMainPos] = useState<{ top: number; left: number } | null>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);

  const measureSubPos = useCallback((panel: "color" | "access") => {
    const rowEl = (panel === "color" ? colorRowRef : accessRowRef).current;
    const mainEl = mainPanelRef.current;
    if (!rowEl || !mainEl) return null;
    const rowRect = rowEl.getBoundingClientRect();
    const mainRect = mainEl.getBoundingClientRect();
    return { top: rowRect.top, left: mainRect.right + SUB_GAP };
  }, []);

  const cancelCloseSub = useCallback(() => {
    if (subCloseTimerRef.current) {
      clearTimeout(subCloseTimerRef.current);
      subCloseTimerRef.current = null;
    }
  }, []);

  const closeSubNow = useCallback(() => {
    cancelCloseSub();
    // Keep ref in sync immediately so a same-tick re-hover can reopen cleanly.
    subPanelStateRef.current = null;
    aimApexRef.current = null;
    intentFreezeRef.current = false;
    setSubPos(null);
    setSubPanel(null);
  }, [cancelCloseSub]);

  const scheduledCloseSub = useCallback((ms = AIM_GRACE_MS) => {
    if (subCloseTimerRef.current) clearTimeout(subCloseTimerRef.current);
    subCloseTimerRef.current = setTimeout(() => {
      subCloseTimerRef.current = null;
      subPanelStateRef.current = null;
      aimApexRef.current = null;
      intentFreezeRef.current = false;
      setSubPos(null);
      setSubPanel(null);
    }, ms);
  }, []);

  const close = useCallback(() => {
    cancelCloseSub();
    subPanelStateRef.current = null;
    aimApexRef.current = null;
    intentFreezeRef.current = false;
    setSubPos(null);
    setSubPanel(null);
    setOpen(false);
    if (openMenuId === menuId) setOpenMenuId(null);
  }, [menuId, cancelCloseSub]);

  const openSub = useCallback((panel: "color" | "access") => {
    cancelCloseSub();
    aimApexRef.current = null;
    intentFreezeRef.current = false;
    subPanelStateRef.current = panel;
    const pos = measureSubPos(panel);
    if (pos) setSubPos(pos);
    setSubPanel(panel);
  }, [cancelCloseSub, measureSubPos]);

  const isAimingAtOpenSub = useCallback(() => {
    const subEl = subPanelRef.current;
    if (!subEl) return false;
    const sub = subEl.getBoundingClientRect();
    const p = pointerRef.current;
    if (pointInRect(p, sub, 2)) return true;
    const apex = aimApexRef.current ?? prevPointerRef.current;
    return (
      isInAimTriangle(apex, p, sub) ||
      isInAimTriangle(prevPointerRef.current, p, sub)
    );
  }, []);

  /**
   * Open a submenu on hover. Re-entering the same row always reopens it
   * (after visiting other menu rows), regardless of prior aim/close state.
   */
  const requestOpenSub = useCallback((panel: "color" | "access") => {
    const current = subPanelStateRef.current;
    // Only block switching to a *different* submenu while aimed at the open list.
    if (
      current &&
      current !== panel &&
      intentFreezeRef.current &&
      isAimingAtOpenSub()
    ) {
      return;
    }
    openSub(panel);
  }, [openSub, isAimingAtOpenSub]);

  const beginAimFromRow = useCallback((
    e: ReactPointerEvent<HTMLDivElement>,
    panel: "color" | "access",
  ) => {
    // Only start hover-intent when leaving the row that owns the open submenu.
    if (subPanelStateRef.current !== panel) return;

    const leave: Pt = { x: e.clientX, y: e.clientY };
    const prev = pointerRef.current;
    pointerRef.current = leave;
    prevPointerRef.current = prev;

    const subEl = subPanelRef.current;
    const row = e.currentTarget.getBoundingClientRect();
    const sub = subEl?.getBoundingClientRect() ?? null;
    if (!sub) {
      closeSubNow();
      return;
    }

    const intoGap =
      leave.x >= row.right - 6 &&
      leave.x <= sub.left + 2 &&
      leave.y >= row.top - 1 &&
      leave.y <= row.bottom + 1;
    // Exiting the row toward the list (right edge / aim wedge). Otherwise close.
    const towardList =
      intoGap ||
      leave.x >= row.right - 8 ||
      isInAimTriangle(prev, leave, sub);

    if (!towardList) {
      closeSubNow();
      return;
    }

    // Freeze apex at leave point — wedge runs to the list's bottom-left (Notion).
    aimApexRef.current = leave;
    intentFreezeRef.current = true;
    scheduledCloseSub(AIM_GRACE_MS);
  }, [scheduledCloseSub, closeSubNow]);

  useEffect(() => {
    const cb = (id: string | null) => {
      if (id !== menuId) {
        cancelCloseSub();
        subPanelStateRef.current = null;
        aimApexRef.current = null;
        intentFreezeRef.current = false;
        setSubPos(null);
        setSubPanel(null);
        setOpen(false);
      }
    };
    openMenuListeners.add(cb);
    return () => { openMenuListeners.delete(cb); };
  }, [menuId, cancelCloseSub]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        mainPanelRef.current?.contains(target) ||
        subPanelRef.current?.contains(target)
      ) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  // Keep submenu open while the cursor stays in the Notion aim wedge.
  useEffect(() => {
    if (!open) return;

    const onMove = (e: PointerEvent) => {
      prevPointerRef.current = pointerRef.current;
      pointerRef.current = { x: e.clientX, y: e.clientY };

      const active = subPanelStateRef.current;
      if (!active) return;

      const subEl = subPanelRef.current;
      if (!subEl) {
        // Panel state is open but portal not mounted yet — refresh position once.
        const pos = measureSubPos(active);
        if (pos) setSubPos(pos);
        return;
      }
      const sub = subEl.getBoundingClientRect();
      const rowEl = (active === "color" ? colorRowRef : accessRowRef).current;
      const row = rowEl?.getBoundingClientRect() ?? null;
      const p = pointerRef.current;
      const prev = prevPointerRef.current;

      if (pointInRect(p, sub, 1) || (row && pointInRect(p, row, 1))) {
        cancelCloseSub();
        intentFreezeRef.current = false;
        aimApexRef.current = null;
        return;
      }

      // Narrow bridge across the gap at the trigger row's height.
      const main = mainPanelRef.current?.getBoundingClientRect();
      if (
        main &&
        row &&
        p.x >= main.right - 1 &&
        p.x <= sub.left + 1 &&
        p.y >= row.top - 1 &&
        p.y <= row.bottom + 1
      ) {
        cancelCloseSub();
        intentFreezeRef.current = true;
        if (!aimApexRef.current) aimApexRef.current = prev;
        scheduledCloseSub(AIM_GRACE_MS);
        return;
      }

      // Aim wedge: leave/cursor apex → list top-left & bottom-left.
      const apex = aimApexRef.current ?? prev;
      if (isInAimTriangle(apex, p, sub) || isInAimTriangle(prev, p, sub)) {
        intentFreezeRef.current = true;
        if (!aimApexRef.current) aimApexRef.current = prev;
        cancelCloseSub();
        scheduledCloseSub(AIM_GRACE_MS);
        return;
      }

      // Left the wedge — close so other menu rows react immediately.
      if (subPanelStateRef.current) {
        closeSubNow();
      }
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, [open, cancelCloseSub, scheduledCloseSub, closeSubNow, measureSubPos]);

  useEffect(() => () => {
    if (subCloseTimerRef.current) clearTimeout(subCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open || !triggerRef.current) { setMainPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    setMainPos({ top: rect.top, left: rect.right + 4 });
  }, [open]);

  // Fallback measure if openSub ran before layout had row refs ready.
  useEffect(() => {
    if (!subPanel) return;
    if (subPos) return;
    const pos = measureSubPos(subPanel);
    if (pos) setSubPos(pos);
  }, [subPanel, subPos, measureSubPos]);

  const handleToggle = () => {
    if (open) {
      close();
    } else {
      setOpen(true);
      setOpenMenuId(menuId);
    }
  };

  const renderedTrigger = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        "data-state": open ? "open" : "closed",
        "aria-expanded": open,
      })
    : trigger;

  return (
    <>
      <span
        ref={triggerRef}
        onClickCapture={handleToggle}
        className="inline-flex shrink-0"
      >
        {renderedTrigger}
      </span>

      {open && mainPos && createPortal(
        <div
          ref={mainPanelRef}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: mainPos.top,
            left: mainPos.left,
            zIndex: 9999,
            minWidth: 176,
          }}
          className="mac-menu rounded-lg p-1 shadow-md"
        >
          {topExtras.map((it, i) => (
            <MenuItem
              key={`t-${i}`}
              icon={it.icon}
              label={it.label}
              destructive={it.destructive}
              onClick={() => { it.onClick(); close(); }}
            />
          ))}

          {onRename && (
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Rename"
              onClick={() => { onRename(); close(); }}
            />
          )}

          {onDuplicate && (
            <MenuItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Duplicate"
              onClick={() => { onDuplicate(); close(); }}
            />
          )}

          {allowColor && (
            <div
              ref={colorRowRef}
              onPointerEnter={(e) => {
                const p = { x: e.clientX, y: e.clientY };
                prevPointerRef.current = p;
                pointerRef.current = p;
                requestOpenSub("color");
              }}
              onPointerLeave={(e) => beginAimFromRow(e, "color")}
              className={`flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-ink hover:bg-secondary ${subPanel === "color" ? "bg-secondary" : ""}`}
            >
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/15"
                style={{ background: currentColor || "transparent" }}
              />
              <span className="flex-1">{colorLabel}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          )}

          {accessPanel && (
            <div
              ref={accessRowRef}
              onPointerEnter={(e) => {
                const p = { x: e.clientX, y: e.clientY };
                prevPointerRef.current = p;
                pointerRef.current = p;
                requestOpenSub("access");
              }}
              onPointerLeave={(e) => beginAimFromRow(e, "access")}
              className={`flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-ink hover:bg-secondary ${subPanel === "access" ? "bg-secondary" : ""}`}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="flex-1">Access</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </div>
          )}

          {(bottomExtras.length > 0 || onDelete) && (
            <div className="my-1 h-px bg-hairline" />
          )}

          {bottomExtras.map((it, i) => (
            <MenuItem
              key={`b-${i}`}
              icon={it.icon}
              label={it.label}
              destructive={it.destructive}
              onClick={() => { it.onClick(); close(); }}
            />
          ))}

          {onDelete && (
            <MenuItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Delete"
              destructive
              onClick={() => { onDelete(); close(); }}
            />
          )}
        </div>,
        document.body
      )}

      {open && subPanel && subPos && createPortal(
        <div
          ref={subPanelRef}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={cancelCloseSub}
          onPointerLeave={scheduledCloseSub}
          style={{
            position: "fixed",
            top: subPos.top,
            left: subPos.left,
            zIndex: 10000,
          }}
          className="mac-menu rounded-lg p-1 shadow-md"
        >
          {subPanel === "color" && (
            <ColorsPanel
              currentColor={currentColor}
              swatches={colorSwatches}
              showDefault={includeDefaultColor}
              onPick={(hex) => {
                onColorChange(hex);
              }}
            />
          )}
          {subPanel === "access" && accessPanel}
        </div>,
        document.body
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-ink hover:bg-secondary"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/**
 * 14×14 rounded colour chip. Fill is clipped inside the rim so a translucent
 * stroke does not composite over the colour and blur the corners.
 */
export function ColorSwatch({
  fill,
  dark = false,
  hatch = false,
}: {
  fill?: string;
  dark?: boolean;
  hatch?: boolean;
}) {
  const hatchId = `cs-hatch-${useId().replace(/:/g, "")}`;
  const fillKey = (fill ?? "").toLowerCase();
  const stroke = isSessionWhiteColor(fillKey)
    ? dark
      ? "#a1a1aa"
      : "rgba(0,0,0,0.18)"
    : isSessionBlackColor(fillKey)
      ? dark
        ? "rgba(255,255,255,0.38)"
        : "rgba(0,0,0,0.22)"
      : dark
        ? "rgba(255,255,255,0.2)"
        : "rgba(0,0,0,0.15)";
  return (
    <svg
      aria-hidden
      width={14}
      height={14}
      viewBox="0 0 14 14"
      className="block h-[14px] w-[14px] shrink-0"
      shapeRendering="geometricPrecision"
    >
      {hatch ? (
        <defs>
          <linearGradient id={hatchId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="46%" stopColor="#d4d4d8" />
            <stop offset="46%" stopColor="#d4d4d8" stopOpacity="0" />
            <stop offset="54%" stopColor="#d4d4d8" stopOpacity="0" />
            <stop offset="54%" stopColor="#d4d4d8" />
          </linearGradient>
        </defs>
      ) : null}
      <rect
        x="1"
        y="1"
        width="12"
        height="12"
        rx="2"
        ry="2"
        fill={hatch ? `url(#${hatchId})` : fill}
      />
      <rect
        x="0.5"
        y="0.5"
        width="13"
        height="13"
        rx="2.5"
        ry="2.5"
        fill="none"
        stroke={stroke}
        strokeWidth={1}
      />
    </svg>
  );
}

export function ColorsPanel({
  currentColor,
  onPick,
  swatches,
  showDefault = false,
  tone = "light",
  showMakeDefault = false,
}: {
  currentColor: ColorValue;
  onPick: (hex: ColorValue) => void;
  swatches?: ColorValue[];
  showDefault?: boolean;
  /** Dark charcoal items for session-menu listboxes. */
  tone?: "light" | "dark";
  /** Session colour list: hover circle marks this colour as the default for new sessions. */
  showMakeDefault?: boolean;
}) {
  const rows: { hex: ColorValue; name: string }[] = swatches
    ? swatches.map((hex) => {
        const named = STANDARD_COLORS_NAMED.find(
          (c) => c.hex.toLowerCase() === hex.toLowerCase(),
        );
        return { hex, name: named?.name ?? hex.toUpperCase() };
      })
    : STANDARD_COLORS_NAMED;

  const sessionDefaultHex = useSyncExternalStore(
    subscribeSessionDefaultColor,
    getSessionDefaultColor,
    () => DEFAULT_SESSION_COLOR,
  );

  const defaultSelected = showDefault && !currentColor;
  const dark = tone === "dark";
  const rowClass = dark
    ? "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-white/90 hover:bg-white/[0.08] hover:text-white"
    : "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ink transition hover:bg-secondary";
  const checkClass = dark
    ? "h-3.5 w-3.5 shrink-0 text-white"
    : "h-3.5 w-3.5 shrink-0 text-ink";

  return (
    <div className="flex flex-col gap-1 text-xs" style={{ minWidth: 168 }}>
      {showDefault ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPick(MEMBERSHIP_COLOR_DEFAULT);
          }}
          className={rowClass}
        >
          <ColorSwatch hatch dark={dark} />
          <span className="min-w-0 flex-1 truncate">Default</span>
          {defaultSelected && <Check className={checkClass} />}
        </button>
      ) : null}
      {rows.map(({ hex, name }) => {
        const selected = !!currentColor && currentColor.toLowerCase() === hex.toLowerCase();
        const isDefault = showMakeDefault && hex.toLowerCase() === sessionDefaultHex.toLowerCase();
        if (!showMakeDefault) {
          return (
            <button
              key={hex}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(hex); }}
              className={rowClass}
            >
              <ColorSwatch fill={hex} dark={dark} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {selected && <Check className={checkClass} />}
            </button>
          );
        }
        return (
          <div key={hex} data-color-row className="group relative rounded-sm hover:bg-white/[0.08]">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPick(hex);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 pr-7 text-left text-white/90 group-hover:text-white"
            >
              <ColorSwatch fill={hex} dark={dark} />
              <span className="min-w-0 flex-1 truncate">
                {name}
                {isDefault ? <span className="text-white/45"> Default</span> : null}
              </span>
              {selected && <Check className={checkClass} />}
            </button>
            <button
              type="button"
              data-color-default-arrow={hex}
              aria-label="Make default"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSessionDefaultColor(hex);
              }}
              className={[
                "absolute right-1 top-1/2 z-[1] -translate-y-1/2 cursor-default rounded-sm p-0.5 opacity-0 hover:text-white pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100",
                isDefault ? "text-white" : "text-white/45",
              ].join(" ")}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill={isDefault ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <circle cx="12" cy="12" r="10" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
