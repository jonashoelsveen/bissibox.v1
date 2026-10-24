/**
 * Edge roll for the week and day time grids.
 *
 * Column headers stay put. Past the bottom, the top cell — the multi-day
 * row, or the hour row under the header — grows downward and keeps its
 * colour. Past the top, that cell and the grid under the header move up
 * together.
 */

export const EDGE_ROLL_MAX_PX = 72;

/** Rubber-band offset. Positive grows the top cell. Negative lifts the body. */
export function resistedEdgeOffset(current: number, delta: number, max = EDGE_ROLL_MAX_PX): number {
  if (!Number.isFinite(delta) || delta === 0) return current;
  if (current !== 0 && Math.sign(delta) !== Math.sign(current)) {
    const next = current + delta;
    if (Math.sign(next) !== Math.sign(current)) return 0;
    return next;
  }
  const room = Math.sign(delta) * max - current;
  if (room === 0 || Math.sign(room) !== Math.sign(delta)) return Math.sign(delta) * max;
  const step = room * (1 - Math.exp(-Math.abs(delta) / max));
  return current + step;
}

/** Hour row whose box is crossing the top of the scrollport. */
export function hourRowAtTop(scrollTop: number, hourPx: number, rowCount: number): number {
  if (hourPx <= 0 || rowCount <= 0) return 0;
  const row = Math.floor(Math.max(0, scrollTop) / hourPx);
  return Math.min(rowCount - 1, Math.max(0, row));
}

function paintOf(el: HTMLElement): string {
  const bg = getComputedStyle(el).backgroundColor;
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return "var(--card)";
  return bg;
}

function mark(el: HTMLElement) {
  if (el.dataset.edgeTouched === "1") return;
  el.dataset.edgeTouched = "1";
  el.dataset.edgePrevTransform = el.style.transform;
  el.dataset.edgePrevOverflow = el.style.overflow;
  el.dataset.edgePrevBorder = el.style.borderBottomColor;
  el.dataset.edgePrevHeight = el.style.height;
  el.dataset.edgePrevPosition = el.style.position;
  el.dataset.edgePrevBg = el.style.backgroundColor;
}

function setTransform(el: HTMLElement | null, y: number) {
  if (!el) return;
  mark(el);
  el.style.transform = y === 0 ? (el.dataset.edgePrevTransform ?? "") : `translate3d(0, ${y}px, 0)`;
}

/** A sticky gutter keeps its horizontal pin. Move the rows inside it. */
function setTransformContents(el: HTMLElement | null, y: number) {
  if (!el) return;
  if (getComputedStyle(el).position === "sticky") {
    Array.from(el.children).forEach((child) => {
      if (child instanceof HTMLElement) setTransform(child, y);
    });
    return;
  }
  setTransform(el, y);
}

function hangFill(el: HTMLElement, px: number) {
  mark(el);
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.style.overflow = "visible";
  el.style.borderBottomColor = "transparent";
  let fill = el.querySelector<HTMLElement>(":scope > [data-edge-fill]");
  if (!fill) {
    fill = document.createElement("div");
    fill.dataset.edgeFill = "";
    el.appendChild(fill);
  }
  fill.style.cssText = [
    "position:absolute",
    "left:0",
    "right:0",
    "top:100%",
    `height:${px}px`,
    `background:${paintOf(el)}`,
    "border-bottom:1px solid var(--hairline)",
    "pointer-events:none",
    "z-index:3",
  ].join(";");
}

function grow(el: HTMLElement, extra: number) {
  mark(el);
  const base = el.getBoundingClientRect().height;
  el.style.height = `${base + extra}px`;
}

export function clearTimedEdgeRoll(root: HTMLElement) {
  root.querySelectorAll("[data-edge-fill]").forEach((node) => node.remove());
  root.querySelectorAll<HTMLElement>("[data-edge-touched]").forEach((el) => {
    el.style.transform = el.dataset.edgePrevTransform ?? "";
    el.style.overflow = el.dataset.edgePrevOverflow ?? "";
    el.style.borderBottomColor = el.dataset.edgePrevBorder ?? "";
    el.style.height = el.dataset.edgePrevHeight ?? "";
    el.style.position = el.dataset.edgePrevPosition ?? "";
    el.style.backgroundColor = el.dataset.edgePrevBg ?? "";
    delete el.dataset.edgeTouched;
    delete el.dataset.edgePrevTransform;
    delete el.dataset.edgePrevOverflow;
    delete el.dataset.edgePrevBorder;
    delete el.dataset.edgePrevHeight;
    delete el.dataset.edgePrevPosition;
    delete el.dataset.edgePrevBg;
  });
}

function shown(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.getClientRects().length > 0;
}

/**
 * `offset > 0` stretches the top cell downward.
 * `offset < 0` lifts the top cell and the grid together.
 */
export function applyTimedEdgeRoll(opts: {
  root: HTMLElement;
  scroller: HTMLElement;
  offset: number;
}) {
  const { root, scroller } = opts;
  clearTimedEdgeRoll(root);
  const offset = Math.round(opts.offset);
  if (offset === 0) return;

  const band = root.querySelector<HTMLElement>("[data-cal-edge-band]");
  const grid = root.querySelector<HTMLElement>("[data-cal-edge-grid]");
  const gutter = root.querySelector<HTMLElement>("[data-cal-edge-gutter]");
  const expand = root.querySelector<HTMLElement>("[data-cal-edge-expand]");
  const sticky = root.querySelector<HTMLElement>("[data-cal-edge-sticky]");
  const stickyGutter = root.querySelector<HTMLElement>("[data-cal-edge-sticky-gutter]");

  if (offset < 0) {
    if (sticky) {
      mark(sticky);
      sticky.style.backgroundColor = "transparent";
    }
    if (stickyGutter) {
      mark(stickyGutter);
      stickyGutter.style.backgroundColor = "transparent";
    }
    setTransform(band, offset);
    setTransform(expand, offset);
    setTransform(grid, offset);
    setTransformContents(gutter, offset);
    return;
  }

  if (shown(band)) {
    if (scroller.contains(band)) {
      hangFill(band, offset);
      band.querySelectorAll<HTMLElement>("[data-allday-col]").forEach((col) => {
        mark(col);
        col.style.borderBottomColor = "transparent";
      });
      const button = expand?.querySelector<HTMLElement>("button");
      if (button) hangFill(button, offset);
      const side = band.parentElement?.querySelector<HTMLElement>("[data-cal-edge-band-side]");
      if (side) hangFill(side, offset);
      setTransform(grid, offset);
      setTransformContents(gutter, offset);
      return;
    }
    grow(band, offset);
    band.querySelectorAll<HTMLElement>("[data-allday-col], button").forEach((el) => grow(el, offset));
    const side = band.parentElement?.querySelector<HTMLElement>("[data-cal-edge-band-side]");
    if (side) grow(side, offset);
    return;
  }

  const rows = root.querySelectorAll<HTMLElement>("[data-hour-row]");
  if (rows.length === 0) return;
  let hourPx = 0;
  let rowCount = 0;
  rows.forEach((el) => {
    const row = Number(el.dataset.hourRow);
    if (Number.isFinite(row)) rowCount = Math.max(rowCount, row + 1);
    if (el.dataset.hourRow === "0" && hourPx <= 0) hourPx = el.getBoundingClientRect().height;
  });
  const row = hourRowAtTop(scroller.scrollTop, hourPx, rowCount);
  rows.forEach((el) => {
    const index = Number(el.dataset.hourRow);
    if (index === row) hangFill(el, offset);
    else if (index > row) setTransform(el, offset);
  });
}
