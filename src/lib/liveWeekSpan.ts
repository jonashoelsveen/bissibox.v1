import { useSyncExternalStore } from "react";

export type LiveWeekSpan = { start: Date; end: Date };

let current: LiveWeekSpan | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function dayTime(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The seven days currently on screen in week view. Listeners skip unchanged spans. */
export function setLiveWeekSpan(start: Date, end: Date): void {
  const startTime = dayTime(start);
  const endTime = dayTime(end);
  if (current && current.start.getTime() === startTime && current.end.getTime() === endTime) return;
  current = { start: new Date(startTime), end: new Date(endTime) };
  emit();
}

export function clearLiveWeekSpan(): void {
  if (!current) return;
  current = null;
  emit();
}

export function getLiveWeekSpan(): LiveWeekSpan | null {
  return current;
}

export function subscribeLiveWeekSpan(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveWeekSpan(): LiveWeekSpan | null {
  return useSyncExternalStore(subscribeLiveWeekSpan, getLiveWeekSpan, () => null);
}
