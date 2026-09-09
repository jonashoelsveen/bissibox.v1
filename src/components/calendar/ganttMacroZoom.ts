/**
 * Shared Macro Gantt time-zoom — header −/+ control and grid Ctrl+scroll.
 */

import { useSyncExternalStore } from "react";

export const GANTT_WEEK_W_MIN = 8;
/** Allows ~18px/day so weekday letters stay readable at max zoom. */
export const GANTT_WEEK_W_MAX = 126;
export const GANTT_WEEK_W_VAR = "--gantt-week-w";

const WEEK_W_STORAGE_KEY = "gantt-macro-week-w";
const BUTTON_ZOOM_FACTOR = 1.15;

export function clampGanttWeekW(w: number) {
  return Math.max(GANTT_WEEK_W_MIN, Math.min(GANTT_WEEK_W_MAX, w));
}

export function readStoredGanttWeekW(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WEEK_W_STORAGE_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? clampGanttWeekW(n) : null;
  } catch {
    return null;
  }
}

export function writeStoredGanttWeekW(w: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WEEK_W_STORAGE_KEY, String(clampGanttWeekW(w)));
  } catch {
    /* ignore quota / private mode */
  }
}

export type GanttZoomSnapshot = {
  weekW: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
};

type GanttZoomController = {
  getWeekW: () => number;
  setWeekW: (next: number, opts?: { anchorLocalX?: number }) => void;
};

let controller: GanttZoomController | null = null;
let snapshot: GanttZoomSnapshot = {
  weekW: GANTT_WEEK_W_MIN,
  canZoomIn: true,
  canZoomOut: false,
};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function publishGanttWeekW(weekW: number) {
  const w = clampGanttWeekW(weekW);
  const next: GanttZoomSnapshot = {
    weekW: w,
    canZoomIn: w < GANTT_WEEK_W_MAX - 0.01,
    canZoomOut: w > GANTT_WEEK_W_MIN + 0.01,
  };
  if (
    next.weekW === snapshot.weekW &&
    next.canZoomIn === snapshot.canZoomIn &&
    next.canZoomOut === snapshot.canZoomOut
  ) {
    return;
  }
  snapshot = next;
  emit();
}

export function registerGanttZoomController(c: GanttZoomController | null) {
  controller = c;
  if (c) publishGanttWeekW(c.getWeekW());
}

export function ganttZoomIn() {
  if (!controller) return;
  controller.setWeekW(controller.getWeekW() * BUTTON_ZOOM_FACTOR);
}

export function ganttZoomOut() {
  if (!controller) return;
  controller.setWeekW(controller.getWeekW() / BUTTON_ZOOM_FACTOR);
}

export function subscribeGanttZoom(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getGanttZoomSnapshot() {
  return snapshot;
}

export function useGanttMacroZoom() {
  return useSyncExternalStore(
    subscribeGanttZoom,
    getGanttZoomSnapshot,
    getGanttZoomSnapshot,
  );
}
