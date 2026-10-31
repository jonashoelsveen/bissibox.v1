/** Pixels of movement toward an edge before auto-scroll may start. */
const EDGE_SCROLL_ENGAGE_PX = 4;
/** Ignore sub-pixel jitter when deciding drag direction. */
const EDGE_SCROLL_INTENT_PX = 1;

export type EdgeScrollGesture = { intentY: number; engagePx: number };

export function createEdgeScrollGesture(): EdgeScrollGesture {
  return { intentY: 0, engagePx: 0 };
}

/** Track whether the pointer is being dragged toward one end of an axis. */
export function noteEdgeScrollMovementAlong(
  state: EdgeScrollGesture,
  movement: number,
  pointer: number,
  start: number,
  end: number,
  edge: number,
  startZone?: { pointer: number; edge: number },
): void {
  if (Math.abs(movement) >= EDGE_SCROLL_INTENT_PX) {
    state.intentY = Math.sign(movement);
  }
  const startPointer = startZone?.pointer ?? pointer;
  const startEdge = startZone?.edge ?? edge;
  const inStart = startPointer < start + startEdge;
  const inEnd = pointer > end - edge;
  if (inStart && movement < 0) state.engagePx += -movement;
  else if (inEnd && movement > 0) state.engagePx += movement;
  else if (
    (inStart && movement >= EDGE_SCROLL_INTENT_PX) ||
    (inEnd && movement <= -EDGE_SCROLL_INTENT_PX)
  ) {
    state.engagePx = 0;
  }
}

/** Track whether the pointer is being dragged toward the visible top/bottom. */
export function stickyHeaderInset(el: HTMLElement): number {
  return el.querySelector<HTMLElement>("[data-week-sticky-header]")?.offsetHeight ?? 0;
}

export function noteEdgeScrollMovement(
  state: EdgeScrollGesture,
  movementY: number,
  pointerY: number,
  el: HTMLElement,
  rowHeight: number,
  tileTop?: number,
): void {
  const rect = el.getBoundingClientRect();
  const top = rect.top + stickyHeaderInset(el);
  noteEdgeScrollMovementAlong(
    state,
    movementY,
    pointerY,
    top,
    rect.bottom,
    rowHeight,
    tileTop == null ? undefined : { pointer: tileTop, edge: 0 },
  );
}

export function engagedEdgeScrollIntent(state: EdgeScrollGesture): number {
  return state.engagePx >= EDGE_SCROLL_ENGAGE_PX ? state.intentY : 0;
}

/**
 * Edge auto-scroll for week/day drags.
 * Only scrolls toward an edge the pointer is actively dragged into — a click
 * held in the edge row, or a slight move the other way, must not browse the
 * opposite direction.
 */
export function applyEdgeScroll(opts: {
  scroll: number;
  pointer: number;
  movement: number;
  dt: number;
  edge: number;
  start: number;
  end: number;
  maxScroll: number;
  intent: number;
  /**
   * Pointer used only for the start edge. Week session drags pass the tile
   * top so scrolling waits until the tile itself crosses the line.
   */
  startPointer?: number;
  /**
   * How far inside the start edge the gesture may be and still scroll.
   * Defaults to `edge`. `0` means the start pointer must be strictly past
   * the line. The end edge always uses `edge`. Speed still caps at `edge`.
   */
  startArm?: number;
}): number {
  const { scroll, pointer, movement, dt, edge, start, end, maxScroll, intent } = opts;
  if (intent === 0) return scroll;
  const startPointer = opts.startPointer ?? pointer;
  const startArm = opts.startArm ?? edge;
  const startDist = startPointer - start;
  const endDist = end - pointer;
  const atStart = scroll <= 0;
  const atEnd = scroll >= maxScroll - 0.5;
  const tileTop = opts.startPointer != null;
  let delta = 0;
  if (!tileTop && startDist < 0) {
    if (intent < 0 && !atStart) {
      delta =
        movement < 0
          ? movement
          : -Math.min(edge, Math.max(0, -startDist) * 0.02 * dt);
    }
  } else if (!tileTop && endDist < 0) {
    if (intent > 0 && !atEnd) {
      delta =
        movement > 0
          ? movement
          : Math.min(edge, Math.max(0, -endDist) * 0.02 * dt);
    }
  } else if (!tileTop && startDist < edge && intent < 0) {
    if (!(atStart && movement === 0)) {
      const t = 1 - startDist / edge;
      delta = movement < 0 ? movement * t : -t * t * 0.45 * dt;
    }
  } else if (!tileTop && endDist < edge && intent > 0) {
    if (!(atEnd && movement === 0)) {
      const t = 1 - endDist / edge;
      delta = movement > 0 ? movement * t : t * t * 0.45 * dt;
    }
  } else if (tileTop && intent > 0 && endDist < 0 && !atEnd) {
    delta =
      movement > 0
        ? movement
        : Math.min(edge, Math.max(0, -endDist) * 0.02 * dt);
  } else if (tileTop && intent > 0 && endDist < edge) {
    if (!(atEnd && movement === 0)) {
      const t = 1 - endDist / edge;
      delta = movement > 0 ? movement * t : t * t * 0.45 * dt;
    }
  } else if (tileTop && intent < 0 && startDist < 0 && !atStart) {
    delta =
      movement < 0
        ? movement
        : -Math.min(edge, Math.max(0, -startDist) * 0.02 * dt);
  } else if (tileTop && intent < 0 && startDist < startArm) {
    if (!(atStart && movement === 0)) {
      const t = 1 - startDist / edge;
      delta = movement < 0 ? movement * t : -t * t * 0.45 * dt;
    }
  }
  if (delta === 0) return scroll;
  return Math.max(0, Math.min(maxScroll, scroll + delta));
}

export function applyTimedGridEdgeScroll(
  el: HTMLElement,
  pointerY: number,
  movementY: number,
  dt: number,
  rowHeight: number,
  maxScroll: number,
  intentY: number,
  tileTop?: number,
): void {
  const rect = el.getBoundingClientRect();
  const next = applyEdgeScroll({
    scroll: el.scrollTop,
    pointer: pointerY,
    movement: movementY,
    dt,
    edge: rowHeight,
    start: rect.top + stickyHeaderInset(el),
    end: rect.bottom,
    maxScroll,
    intent: intentY,
    startPointer: tileTop,
    startArm: tileTop == null ? undefined : 0,
  });
  if (next !== el.scrollTop) el.scrollTop = next;
}

export function pointerInTimedGridScrollEdge(
  el: HTMLElement,
  pointerY: number,
  rowHeight: number,
  tileTop?: number,
): boolean {
  const rect = el.getBoundingClientRect();
  const edge = rowHeight;
  const top = rect.top + stickyHeaderInset(el);
  const startPointer = tileTop ?? pointerY;
  const startArm = tileTop == null ? edge : 0;
  return startPointer < top + startArm || pointerY > rect.bottom - edge;
}

/**
 * The point on a session tile that must cross the top line before week
 * upward autoscroll starts: the tile's midpoint, so more than half the tile
 * is past the line.
 */
export function upwardTileScrollPoint(tile: { top: number; height: number }): number {
  return tile.top + Math.max(0, tile.height) / 2;
}

/**
 * The right column line is the pane's last pixel. `getBoundingClientRect().right`
 * sits on the outside of that pixel and is often fractional, while the cursor
 * hard against the line reports a whole pixel below it — especially when the
 * week view meets the window edge and the pointer cannot travel any farther.
 */
export function pointerTouchesRightEdge(pointerX: number, paneRight: number): boolean {
  return pointerX >= Math.floor(paneRight) - 1;
}

/**
 * The divider between the time column and the first day. Same pixel rule as
 * the right line: the boundary is often fractional, and the cursor on that
 * divider sits on the pixel just inside the day column.
 */
export function pointerTouchesLeftEdge(pointerX: number, paneLeft: number): boolean {
  return pointerX <= Math.floor(paneLeft) + 1;
}

/**
 * Horizontal autoscroll for a session tile. Scrolling starts once more than
 * half the tile is past the pane. Either edge also starts when the pointer
 * is on that line, before half the tile has crossed.
 */
export function tileMajorityPastPane(
  tile: { left: number; right: number },
  pane: { left: number; right: number },
  pointerX?: number,
): -1 | 0 | 1 {
  const width = tile.right - tile.left;
  if (pointerX != null && pointerTouchesRightEdge(pointerX, pane.right)) return 1;
  if (pointerX != null && pointerTouchesLeftEdge(pointerX, pane.left)) return -1;
  if (!(width > 0)) return 0;
  if (pane.left - tile.left > width * 0.5) return -1;
  if (tile.right - pane.right > width * 0.5) return 1;
  return 0;
}

/**
 * Month multi-day create. A week row is far taller than a week/day time slot,
 * so using it as the edge makes the scroll crawl and then lurch. This band
 * matches the week time-slot edge.
 */
export const MONTH_CREATE_EDGE_PX = 40;

/** Full-edge speed, pixels per millisecond. Brisk, without rushing a whole week row. */
const MONTH_CREATE_EDGE_MAX_SPEED = 0.7;

/** Ease into a steady edge speed, and into the week-line snap as it reconnects. */
const MONTH_CREATE_EDGE_ACCEL_TAU_MS = 90;

/** Ease back to rest when the pointer comes back off the edge. */
const MONTH_CREATE_EDGE_STOP_TAU_MS = 170;

/** Fastest the week-line snap may approach. A row is eased onto, not jumped. */
const MONTH_CREATE_SNAP_MAX_SPEED = 0.42;

/** How far (px) the snap looks ahead when choosing its speed. */
const MONTH_CREATE_SNAP_TAU_MS = 200;

/**
 * How strongly the week-line snap is connected.
 * 0 once the pointer is far enough into the rim: the scroll stays continuous.
 * 1 once the pointer comes back toward the center, still inside the edge band.
 */
export function monthCreateEdgeSnapGain(
  pointer: number,
  top: number,
  bottom: number,
  edge = MONTH_CREATE_EDGE_PX,
): number {
  if (edge <= 0) return 0;
  const intoTop = top + edge - pointer;
  const intoBottom = pointer - (bottom - edge);
  const rimPx = Math.max(intoTop, intoBottom);
  if (rimPx <= 0) return 1;
  const depth = Math.min(1, rimPx / edge);
  const u = Math.min(1, Math.max(0, (0.62 - depth) / 0.42));
  return u * u * (3 - 2 * u);
}

/** The week line just ahead. A position already on a line stays there. */
export function monthCreateSnapLine(
  scroll: number,
  direction: -1 | 1,
  rowHeight: number,
  maxScroll: number,
): number {
  if (rowHeight <= 0) return scroll;
  const max = Math.max(0, maxScroll);
  const y = Math.max(0, Math.min(max, scroll));
  const line =
    direction > 0
      ? Math.ceil((y - 1e-4) / rowHeight) * rowHeight
      : Math.floor((y + 1e-4) / rowHeight) * rowHeight;
  return Math.max(0, Math.min(max, line));
}

/**
 * One frame of month create-drag auto-scroll.
 * Far into the edge the week-line snap is off and the scroll stays continuous.
 * As the pointer comes back toward the center, the snap eases on and the view
 * settles onto the next week line without rushing past the row.
 */
export function stepMonthCreateEdgeScroll(opts: {
  scroll: number;
  pointer: number;
  dt: number;
  velocity: number;
  top: number;
  bottom: number;
  maxScroll: number;
  intent: number;
  edge?: number;
  rowHeight?: number;
}): { scroll: number; velocity: number } {
  const edge = opts.edge ?? MONTH_CREATE_EDGE_PX;
  const dt = Math.max(0, Math.min(34, opts.dt));
  const max = Math.max(0, opts.maxScroll);
  const row = opts.rowHeight ?? 0;
  let cruise = 0;
  if (edge > 0 && opts.intent < 0 && opts.scroll > 0) {
    const dist = opts.pointer - opts.top;
    if (dist < edge) {
      const depth = dist <= 0 ? 1 : 1 - dist / edge;
      const shaped = 0.65 + 0.35 * depth * depth;
      cruise = -MONTH_CREATE_EDGE_MAX_SPEED * shaped;
    }
  } else if (edge > 0 && opts.intent > 0 && opts.scroll < max - 0.5) {
    const dist = opts.bottom - opts.pointer;
    if (dist < edge) {
      const depth = dist <= 0 ? 1 : 1 - dist / edge;
      const shaped = 0.65 + 0.35 * depth * depth;
      cruise = MONTH_CREATE_EDGE_MAX_SPEED * shaped;
    }
  }
  const gain =
    opts.intent === 0 || row <= 0
      ? 0
      : monthCreateEdgeSnapGain(opts.pointer, opts.top, opts.bottom, edge);
  let magnet = 0;
  let snapLine: number | null = null;
  if (gain > 0 && opts.intent !== 0) {
    const dir: -1 | 1 = opts.intent > 0 ? 1 : -1;
    snapLine = monthCreateSnapLine(opts.scroll, dir, row, max);
    const gap = snapLine - opts.scroll;
    if (Math.abs(gap) > 0.4) {
      magnet = Math.sign(gap) * Math.min(MONTH_CREATE_SNAP_MAX_SPEED, Math.abs(gap) / MONTH_CREATE_SNAP_TAU_MS) * gain;
    }
  }
  const desired = cruise * (1 - gain) + magnet;
  const tau = desired === 0 ? MONTH_CREATE_EDGE_STOP_TAU_MS : MONTH_CREATE_EDGE_ACCEL_TAU_MS;
  const blend = dt <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  let velocity = opts.velocity + (desired - opts.velocity) * blend;
  if (desired === 0 && Math.abs(velocity) < 0.008) velocity = 0;
  if ((opts.scroll <= 0 && velocity < 0) || (opts.scroll >= max - 0.5 && velocity > 0)) {
    velocity = 0;
  }
  let scroll = Math.max(0, Math.min(max, opts.scroll + velocity * dt));
  if (snapLine != null && gain > 0.72) {
    const crossing = opts.intent > 0 ? scroll > snapLine : scroll < snapLine;
    if (crossing || Math.abs(snapLine - opts.scroll) <= 0.4) {
      scroll = snapLine;
      velocity = 0;
    }
  }
  return { scroll, velocity };
}
