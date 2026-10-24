import {
  MONTH_CREATE_PULSE_HOLD_MS,
  MONTH_CREATE_PULSE_INTERVAL_MS,
  monthCreateEdgeZone,
} from "@/lib/monthVerticalScroll";
import { nextWeekOriginScroll } from "@/lib/weekHorizontalScroll";

/** One week glide. Short enough to feel immediate, long enough to read. */
const WEEK_EDGE_PULSE_MS = 360;

/**
 * Ease-out cubic. The week leaves at once and settles onto Monday,
 * with no slow crawl at the start.
 */
function weekEdgePulseScroll(from: number, target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return target;
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  if (t >= 1) return target;
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return from + (target - from) * eased;
}

export type WeekEdgePulse = {
  over: (clientX: number) => void;
  leave: () => void;
  stop: () => void;
  isPulsing: () => boolean;
};

/** A pulse that never scrolls. Used when the week strip is not mounted. */
export function inertWeekEdgePulse(): WeekEdgePulse {
  return {
    over() {},
    leave() {},
    stop() {},
    isPulsing: () => false,
  };
}

/**
 * One-week edge pulse. The first week arms in the outer band. After that,
 * the pointer has to stay on the rim or the next week is cancelled.
 */
export function createWeekEdgePulse(host: {
  scroller: () => HTMLElement | null;
  pane: () => { left: number; right: number } | null;
  dayWidth: () => number;
  lock: { current: boolean };
  prepare: (target: number) => void;
  sync: () => void;
  /** Scroll position only. Must not read layout or render. */
  onFrame: (scrollLeft: number) => void;
  onPulseEnd: () => void;
}): WeekEdgePulse {
  let raf = 0;
  let holdTimer = 0;
  let intervalTimer = 0;
  let removed = false;
  let edge: -1 | 0 | 1 = 0;
  let paging = false;
  let pointerX = 0;
  let paneCache: { left: number; right: number } | null = null;
  let pulse: { from: number; target: number; t0: number; dur: number } | null = null;

  const paneNow = () => {
    if (pulse && paneCache) return paneCache;
    paneCache = host.pane();
    return paneCache;
  };

  const clearPulseTimers = () => {
    if (holdTimer) window.clearTimeout(holdTimer);
    if (intervalTimer) window.clearTimeout(intervalTimer);
    holdTimer = 0;
    intervalTimer = 0;
  };

  const edgeAt = (clientX: number): -1 | 0 | 1 => {
    const pane = paneNow();
    if (!pane) return 0;
    return monthCreateEdgeZone(clientX, pane.left, pane.right, paging);
  };

  const stillAtRim = (repeat: boolean): boolean => {
    const pane = paneNow();
    if (!pane) return false;
    const zone = monthCreateEdgeZone(pointerX, pane.left, pane.right, repeat);
    edge = zone;
    return zone !== 0;
  };

  const finishPulse = () => {
    const el = host.scroller();
    if (el) el.style.willChange = "";
    pulse = null;
    host.onPulseEnd();
    host.lock.current = false;
    host.sync();
    if (removed || edge === 0) return;
    const wait = Math.max(0, MONTH_CREATE_PULSE_INTERVAL_MS - WEEK_EDGE_PULSE_MS);
    intervalTimer = window.setTimeout(() => {
      intervalTimer = 0;
      if (removed || !stillAtRim(true)) return;
      runPulse();
    }, wait);
  };

  const tick = (ts: number) => {
    raf = 0;
    if (removed || !pulse) return;
    const el = host.scroller();
    if (!el) {
      finishPulse();
      return;
    }
    if (pulse.t0 === 0) pulse.t0 = ts;
    const elapsed = ts - pulse.t0;
    const left = weekEdgePulseScroll(pulse.from, pulse.target, elapsed, pulse.dur);
    el.scrollLeft = left;
    host.onFrame(left);
    if (elapsed < pulse.dur) {
      raf = requestAnimationFrame(tick);
      return;
    }
    el.scrollLeft = pulse.target;
    host.onFrame(pulse.target);
    finishPulse();
  };

  const runPulse = () => {
    if (pulse || edge === 0 || removed) return;
    const el = host.scroller();
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const target = nextWeekOriginScroll(el.scrollLeft, edge, host.dayWidth(), max);
    if (target == null || Math.abs(target - el.scrollLeft) < 0.5) return;
    host.prepare(target);
    host.lock.current = true;
    el.style.willChange = "scroll-position";
    pulse = {
      from: el.scrollLeft,
      target,
      t0: 0,
      dur: WEEK_EDGE_PULSE_MS,
    };
    raf = requestAnimationFrame(tick);
  };

  return {
    over(clientX: number) {
      pointerX = clientX;
      if (removed) return;
      const next = edgeAt(clientX);
      if (next === edge) return;
      edge = next;
      clearPulseTimers();
      if (next === 0 || pulse) return;
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        if (removed || !stillAtRim(paging)) return;
        paging = true;
        runPulse();
      }, MONTH_CREATE_PULSE_HOLD_MS);
    },
    leave() {
      edge = 0;
      paging = false;
      clearPulseTimers();
    },
    stop() {
      removed = true;
      edge = 0;
      paging = false;
      clearPulseTimers();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pulse = null;
      const el = host.scroller();
      if (el) el.style.willChange = "";
      host.lock.current = false;
    },
    isPulsing: () => pulse != null,
  };
}
