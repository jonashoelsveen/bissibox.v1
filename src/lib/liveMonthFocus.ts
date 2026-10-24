import { useSyncExternalStore } from "react";

export type LiveMonthFocus = { year: number; month: number };

let current: LiveMonthFocus | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** The month that has passed the midpoint of month view. Listeners skip an unchanged month. */
export function setLiveMonthFocus(year: number, month: number): void {
  if (current && current.year === year && current.month === month) return;
  current = { year, month };
  emit();
}

export function clearLiveMonthFocus(): void {
  if (!current) return;
  current = null;
  emit();
}

export function getLiveMonthFocus(): LiveMonthFocus | null {
  return current;
}

export function subscribeLiveMonthFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveMonthFocus(): LiveMonthFocus | null {
  return useSyncExternalStore(subscribeLiveMonthFocus, getLiveMonthFocus, () => null);
}
