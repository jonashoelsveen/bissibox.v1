/**
 * Bottom of the weekday / day column-header row — the hairline between
 * headers and the first time row. Used as the min-top for week/day session
 * menus so they cannot sit on top of the headers.
 */
export function readCalendarGridHeaderBottom(): number {
  if (typeof document === "undefined") return 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  let headerBottom = 0;
  document.querySelectorAll<HTMLElement>('[data-grid-header="1"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) headerBottom = Math.max(headerBottom, r.bottom);
  });
  return headerBottom;
}

/** Week/day session menus must not cross the column-header / row divider. */
export function weekDaySessionMenuMinTop(viewMode?: string): number | undefined {
  if (viewMode !== "week" && viewMode !== "day") return undefined;
  const bottom = readCalendarGridHeaderBottom();
  return bottom > 0 ? bottom : undefined;
}

/**
 * Shared positioning heuristic for the session/diary popover editors.
 *
 * Priority:
 *   1. To the right of the anchor
 *   2. To the left of the anchor (without overlapping the left panel)
 *   3. Below the anchor (clamped horizontally)
 *   4. Above the anchor (clamped horizontally)
 *   5. Clamped fallback inside the visible area
 */
export function computePopoverPosition(
  anchor: DOMRect,
  width: number,
  height: number,
  margin = 8,
  minTopOverride?: number,
): { top: number; left: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  // Respect the open left panel — read the CSS var the LeftPanel sets.
  let panelOffset = 0;
  if (typeof document !== "undefined") {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--topbar-left-offset")
      .trim();
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) panelOffset = parsed;
  }
  const minLeft = panelOffset + margin;
  const maxLeft = vw - width - margin;
  const minTop =
    minTopOverride != null ? Math.max(margin, minTopOverride) : margin;
  const maxTop = vh - height - margin;

  const clampX = (x: number) =>
    maxLeft < minLeft ? minLeft : Math.max(minLeft, Math.min(maxLeft, x));
  const clampY = (y: number) =>
    maxTop < minTop ? minTop : Math.max(minTop, Math.min(maxTop, y));

  // 1. Right of anchor
  const rightLeft = anchor.right + margin;
  if (rightLeft + width <= vw - margin) {
    return { top: clampY(anchor.top), left: rightLeft };
  }

  // 2. Left of anchor (must not slip under the side panel)
  const leftLeft = anchor.left - width - margin;
  if (leftLeft >= minLeft) {
    return { top: clampY(anchor.top), left: leftLeft };
  }

  // 3. Below anchor
  const belowTop = anchor.bottom + margin;
  if (belowTop + height <= vh - margin) {
    return { top: belowTop, left: clampX(anchor.left) };
  }

  // 4. Above anchor
  const aboveTop = anchor.top - height - margin;
  if (aboveTop >= minTop) {
    return { top: aboveTop, left: clampX(anchor.left) };
  }

  // 5. Fallback — clamp inside the visible region
  return { top: clampY(anchor.top), left: clampX(anchor.left) };
}
