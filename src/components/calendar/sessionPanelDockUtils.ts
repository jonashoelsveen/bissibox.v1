/** Periwinkle — matches platform training / session accent. */
export const SESSION_PANEL_PERIWINKLE = "#B8B8FF";

export const SESSION_PANEL_DOCK_EDGE_MARGIN = 12;
export const SESSION_PANEL_CORNER_RADIUS_PX = 12;
export const SESSION_PANEL_DOCK_SLOT_BG = "rgba(184, 184, 255, 0.18)";
export const SESSION_PANEL_DOCK_PLACEHOLDER_BG = "rgba(184, 184, 255, 0.14)";
export const SESSION_PANEL_DOCK_TRANSITION =
  "left 260ms cubic-bezier(0.2, 0, 0, 1), top 260ms cubic-bezier(0.2, 0, 0, 1)";

/** Frosted white shell for the floating/docked session panel (Notion-style). */
export const SESSION_PANEL_SHELL_CLASS =
  "rounded-xl border border-hairline shadow-lg backdrop-blur-md";

/** White card at 70% opacity with frosted blur. Dark theme swaps in the charcoal chrome. */
export const SESSION_PANEL_SHELL_STYLE = {
  backgroundColor:
    "var(--session-card-bg, color-mix(in oklch, var(--card) 70%, transparent))",
} as const;

/** Gap between the session card and map / sign-up panels. */
export const SESSION_PANEL_GAP_PX = 8;
/** Gap between the session card and colour / repeat / group listboxes. */
export const SESSION_SIDE_MENU_GAP_PX = 4;
export const SESSION_PANEL_VIEWPORT_MARGIN = 8;
/** Session card and map / sign-up side panels share this width. */
export const SESSION_CARD_WIDTH_PX = 280;

/** Dark charcoal shell for session submenus (Notion-like, not pure black). */
export const SESSION_SIDE_MENU_BG = "#1c1c1e";
export const SESSION_SIDE_MENU_SHELL_CLASS =
  "rounded-md border border-white/[0.08] shadow-[0_12px_32px_rgba(0,0,0,0.45)]";
export const SESSION_SIDE_MENU_SHELL_STYLE = {
  backgroundColor: SESSION_SIDE_MENU_BG,
} as const;
export const SESSION_SIDE_MENU_ITEM_CLASS =
  "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-white/90 hover:bg-white/[0.08] hover:text-white";

export type SessionBox = { left: number; right: number };

export type SessionAdjacentMenuPlacement = {
  left: number;
  top: number;
  side: "left" | "right";
};

function readTopbarLeftOffset(): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--topbar-left-offset")
    .trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * True when the session card + map panel can sit fully in the calendar pane.
 * When `sessionRight` is set (map already open), also require room for the map
 * immediately to the right of the session card — do not wait until the whole
 * pane is narrower than the cluster.
 */
export function sessionMapPanelFitsBesideMenu(
  panelWidth = SESSION_CARD_WIDTH_PX,
  viewportWidth?: number,
  sessionRight?: number | null,
): boolean {
  const vw =
    viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1280);
  const left = readTopbarLeftOffset();
  const need = panelWidth + SESSION_PANEL_GAP_PX + panelWidth;
  if (vw - left - 2 * SESSION_PANEL_VIEWPORT_MARGIN < need) return false;
  if (sessionRight == null) return true;
  return (
    sessionRight + SESSION_PANEL_GAP_PX + panelWidth <=
    vw - SESSION_PANEL_VIEWPORT_MARGIN + 0.5
  );
}

/**
 * Place a compact menu beside the session card (colour list).
 *
 * Default: to the right of the session card, same gap as map / sign-up.
 * If the card is flush to the right — or map / sign-up already occupy that
 * side — place to the left of the card. Fall back to the free side so the
 * menu stays fully on screen. Vertical: match `alignTop` (colour field)
 * when the full list fits; otherwise shift just enough to stay in view.
 */
export function computeSessionAdjacentMenuPosition(args: {
  sessionCard: SessionBox;
  cluster?: SessionBox;
  alignTop: number;
  menuWidth: number;
  menuHeight: number;
  preferRight?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  gap?: number;
  margin?: number;
}): SessionAdjacentMenuPlacement | null {
  const vw =
    args.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
  const vh =
    args.viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 768);
  const gap = args.gap ?? SESSION_PANEL_GAP_PX;
  const margin = args.margin ?? SESSION_PANEL_VIEWPORT_MARGIN;
  const minLeft = readTopbarLeftOffset() + margin;
  const maxLeft = vw - args.menuWidth - margin;
  const preferRight = args.preferRight !== false;
  const clusterRight = args.cluster?.right ?? args.sessionCard.right;

  const rightOfSession = args.sessionCard.right + gap;
  const rightOfCluster = clusterRight + gap;
  const leftOfSession = args.sessionCard.left - gap - args.menuWidth;

  const fits = (x: number) => x >= minLeft && x <= maxLeft;

  const candidates: { side: "left" | "right"; left: number }[] = preferRight
    ? [
        { side: "right", left: rightOfSession },
        { side: "left", left: leftOfSession },
        { side: "right", left: rightOfCluster },
      ]
    : [
        { side: "left", left: leftOfSession },
        { side: "right", left: rightOfCluster },
        { side: "right", left: rightOfSession },
      ];

  const picked = candidates.find((c) => fits(c.left));
  // Never slide the menu onto the session card. If neither side has room
  // for the full menu plus the same gap the other submenus use, do not place it.
  if (!picked) return null;

  const maxTop = vh - args.menuHeight - margin;
  let top = args.alignTop;
  if (top > maxTop) top = Math.max(margin, maxTop);
  if (top < margin) top = margin;

  return { left: picked.left, top, side: picked.side };
}

/** True when the submenu can sit fully on the left or the right of the session card. */
export function sessionAdjacentMenuFits(args: {
  sessionCard: SessionBox;
  cluster?: SessionBox;
  menuWidth: number;
  preferRight?: boolean;
  viewportWidth?: number;
  gap?: number;
  margin?: number;
}): boolean {
  const vw =
    args.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
  const gap = args.gap ?? SESSION_PANEL_GAP_PX;
  const margin = args.margin ?? SESSION_PANEL_VIEWPORT_MARGIN;
  const minLeft = readTopbarLeftOffset() + margin;
  const maxLeft = vw - args.menuWidth - margin;
  const preferRight = args.preferRight !== false;
  const clusterRight = args.cluster?.right ?? args.sessionCard.right;
  const rightOfSession = args.sessionCard.right + gap;
  const rightOfCluster = clusterRight + gap;
  const leftOfSession = args.sessionCard.left - gap - args.menuWidth;
  const fits = (x: number) => x >= minLeft && x <= maxLeft;
  const candidates = preferRight
    ? [rightOfSession, leftOfSession, rightOfCluster]
    : [leftOfSession, rightOfCluster, rightOfSession];
  return candidates.some((left) => fits(left));
}

export function computeDockedPanelLeft(
  panelWidth: number,
  margin = SESSION_PANEL_DOCK_EDGE_MARGIN,
): number {
  if (typeof window === "undefined") return 0;
  return Math.max(margin, window.innerWidth - panelWidth - margin);
}

function clampAxis(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

/** Keep a floating/docked session cluster fully inside the calendar pane. */
export function clampSessionPanelPosition(args: {
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth?: number;
  viewportHeight?: number;
  margin?: number;
  /** Floor for `top` (e.g. week/day column-header / row divider). */
  minTop?: number;
}): { left: number; top: number } {
  const vw =
    args.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1024);
  const vh =
    args.viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : 768);
  const margin = args.margin ?? SESSION_PANEL_VIEWPORT_MARGIN;
  const minLeft = readTopbarLeftOffset() + margin;
  const minTop = args.minTop != null ? Math.max(margin, args.minTop) : margin;
  return {
    left: clampAxis(args.left, minLeft, vw - args.width - margin),
    top: clampAxis(args.top, minTop, vh - args.height - margin),
  };
}

export type SessionPanelFloatPosition = { left: number; top: number };

const SESSION_PANEL_DOCKED_KEY = "calendar.sessionPanel.docked";

let sessionPanelDockedPref = readSessionPanelDockedPref();
const sessionPanelDockedListeners = new Set<() => void>();

function readSessionPanelDockedPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_PANEL_DOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function getSessionPanelDocked(): boolean {
  return sessionPanelDockedPref;
}

export function setSessionPanelDocked(docked: boolean): void {
  if (sessionPanelDockedPref === docked) return;
  sessionPanelDockedPref = docked;
  try {
    sessionStorage.setItem(SESSION_PANEL_DOCKED_KEY, docked ? "1" : "0");
  } catch {
    // ignore quota / privacy mode
  }
  for (const listener of sessionPanelDockedListeners) listener();
}

export function subscribeSessionPanelDocked(onStoreChange: () => void): () => void {
  sessionPanelDockedListeners.add(onStoreChange);
  return () => {
    sessionPanelDockedListeners.delete(onStoreChange);
  };
}
