/**
 * yearStore — local persistence + state hook for the Year View.
 *
 * Data shape is "Nylas-ready": every cell has a stable unique ID derived
 * from `${calendarId}:${year}:${monthIndex}:${day}:${session}` so future
 * remote sync can map each cell 1:1 to an external event.
 *
 * Persistence is localStorage today (placeholder, same convention as the
 * rest of the calendar shell) — the hook signature is identical to what a
 * Supabase-backed version will expose later.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Session = 0 | 1; // 0 = upper / "AM", 1 = lower / "PM"

export type CalendarLayer = "events" | "meetings" | "trainings";

export interface CellData {
  id: string; // stable nylas-ready id
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string; // hex
  duration?: string; // free-form session length (e.g. "1t 30min")
  description?: string;
  layer?: CalendarLayer;
  groupId?: string | null; // for trainings, which group/team
  locationId?: string | null;
  courseId?: string | null;
}

export interface CellKey {
  year: number;
  month: number; // 0-11
  day: number; // 1-31
  session: Session;
}

export interface YearMeta {
  title: string;
  year: number;
}

const dataKey = (calId: string) => `calendar:year:data:${calId}`;
const metaKey = (calId: string) => `calendar:year:meta:${calId}`;

export function makeCellId(calId: string, k: CellKey): string {
  return `${calId}:${k.year}:${k.month}:${k.day}:${k.session}`;
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function useYearStore(calId: string, defaultTitle: string) {
  const [data, setData] = useState<Record<string, CellData>>({});
  const [meta, setMeta] = useState<YearMeta>({
    title: defaultTitle,
    year: new Date().getFullYear(),
  });
  const dataRef = useRef<Record<string, CellData>>({});
  // History stacks for undo/redo. Each entry is a full data snapshot.
  const pastRef = useRef<Record<string, CellData>[]>([]);
  const futureRef = useRef<Record<string, CellData>[]>([]);
  const [, forceTick] = useState(0);
  const bumpHistory = () => forceTick((n) => n + 1);

  // Load on calendar switch
  useEffect(() => {
    const loaded = readJSON<Record<string, CellData>>(dataKey(calId), {});
    dataRef.current = loaded;
    setData(loaded);
    setMeta(
      readJSON<YearMeta>(metaKey(calId), {
        title: defaultTitle,
        year: new Date().getFullYear(),
      }),
    );
    pastRef.current = [];
    futureRef.current = [];
    bumpHistory();
  }, [calId, defaultTitle]);

  const persist = useCallback(
    (next: Record<string, CellData>, opts?: { history?: boolean; prev?: Record<string, CellData> }) => {
      const prevSnapshot = opts?.prev ?? dataRef.current;
      if (opts?.history !== false) {
        pastRef.current.push(prevSnapshot);
        if (pastRef.current.length > 100) pastRef.current.shift();
        futureRef.current = [];
        bumpHistory();
      }
      dataRef.current = next;
      setData(next);
      writeJSON(dataKey(calId), next);
    },
    [calId],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(dataRef.current);
    dataRef.current = prev;
    setData(prev);
    writeJSON(dataKey(calId), prev);
    bumpHistory();
  }, [calId]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(dataRef.current);
    dataRef.current = next;
    setData(next);
    writeJSON(dataKey(calId), next);
    bumpHistory();
  }, [calId]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  const persistMeta = useCallback(
    (next: YearMeta) => {
      setMeta(next);
      writeJSON(metaKey(calId), next);
    },
    [calId],
  );

  const upsertCell = useCallback(
    (k: CellKey, patch: Partial<CellData>) => {
      const id = makeCellId(calId, k);
      const current = dataRef.current;
      const prev = current[id] ?? { id, text: "" };
      const merged: CellData = { ...prev, ...patch, id };
      // Strip empties so the store stays small
      if (
        !merged.text &&
        !merged.bold &&
        !merged.italic &&
        !merged.underline &&
        !merged.color &&
        !merged.duration &&
        !merged.description &&
        !merged.locationId &&
        !merged.courseId
      ) {
        const { [id]: _drop, ...rest } = current;
        persist(rest, { prev: current });
        return;
      }
      persist({ ...current, [id]: merged }, { prev: current });
    },
    [calId, persist],
  );

  const upsertCells = useCallback(
    (updates: Array<{ key: CellKey; patch: Partial<CellData> }>) => {
      if (updates.length === 0) return;
      const current = dataRef.current;
      let next = current;

      for (const { key, patch } of updates) {
        const id = makeCellId(calId, key);
        const prev = next[id] ?? { id, text: "" };
        const merged: CellData = { ...prev, ...patch, id };

        if (
          !merged.text &&
          !merged.bold &&
          !merged.italic &&
          !merged.underline &&
          !merged.color &&
          !merged.duration &&
          !merged.description &&
          !merged.locationId &&
          !merged.courseId
        ) {
          const { [id]: _drop, ...rest } = next;
          next = rest;
        } else {
          next = { ...next, [id]: merged };
        }
      }

      if (next !== current) persist(next, { prev: current });
    },
    [calId, persist],
  );

  const fillRange = useCallback(
    (source: CellKey, targets: CellKey[]) => {
      const current = dataRef.current;
      const sid = makeCellId(calId, source);
      const src = current[sid];
      if (!src) {
        // Clear the targets if the source is empty
        const next = { ...current };
        for (const t of targets) delete next[makeCellId(calId, t)];
        persist(next, { prev: current });
        return;
      }
      const next = { ...current };
      for (const t of targets) {
        const id = makeCellId(calId, t);
        next[id] = { ...src, id };
      }
      persist(next, { prev: current });
    },
    [calId, persist],
  );

  return { data, meta, upsertCell, upsertCells, fillRange, setMeta: persistMeta, undo, redo, canUndo, canRedo };
}

// ──────────────────────────────────────────────────────────────────────
// CalendarEvent store — single source of truth for both Month + Week views.
//
// Each event is keyed by its own stable id and carries real local-ISO
// timestamps. Both views read from the same `events` array and project
// it into their own visual model:
//   • Month view  → group by start-date day, render as chips
//   • Week view   → position absolutely between start/end pixel offsets
//                   inside the start-date column
//
// Persisted to localStorage under `calendar:events:{calId}`.
// ──────────────────────────────────────────────────────────────────────

import { makeEventId } from "./dateUtils";

export type IndividualCategory = "training" | "school" | "work" | "else";

export interface CalendarEvent {
  id: string;
  startISO: string;       // local ISO, e.g. "2026-05-04T09:30:00"
  endISO: string;         // local ISO
  allDay: boolean;
  title: string;
  color: string | null;   // hex
  category?: IndividualCategory;
  description?: string;
}

const eventsKey = (calId: string) => `calendar:events:${calId}`;

export function useEventStore(calId: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const eventsRef = useRef<CalendarEvent[]>([]);
  const pastRef = useRef<CalendarEvent[][]>([]);
  const futureRef = useRef<CalendarEvent[][]>([]);
  const [, forceTick] = useState(0);
  const bump = () => forceTick((n) => n + 1);

  // Load on calendar switch.
  useEffect(() => {
    const loaded = readJSON<CalendarEvent[]>(eventsKey(calId), []);
    eventsRef.current = loaded;
    setEvents(loaded);
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, [calId]);

  const persist = useCallback(
    (next: CalendarEvent[], opts?: { history?: boolean }) => {
      if (opts?.history !== false) {
        pastRef.current.push(eventsRef.current);
        if (pastRef.current.length > 100) pastRef.current.shift();
        futureRef.current = [];
        bump();
      }
      eventsRef.current = next;
      setEvents(next);
      writeJSON(eventsKey(calId), next);
    },
    [calId],
  );

  const upsertEvent = useCallback(
    (patch: Partial<CalendarEvent> & Pick<CalendarEvent, "startISO" | "endISO" | "title">) => {
      const current = eventsRef.current;
      const id = patch.id ?? makeEventId();
      const existing = current.find((e) => e.id === id);
      const merged: CalendarEvent = {
        allDay: false,
        color: null,
        ...existing,
        ...patch,
        id,
      };
      const next = existing
        ? current.map((e) => (e.id === id ? merged : e))
        : [...current, merged];
      persist(next);
      return merged;
    },
    [persist],
  );

  const moveEvent = useCallback(
    (id: string, patch: Partial<Pick<CalendarEvent, "startISO" | "endISO" | "allDay">>) => {
      const current = eventsRef.current;
      const next = current.map((e) => (e.id === id ? { ...e, ...patch } : e));
      persist(next);
    },
    [persist],
  );

  const deleteEvent = useCallback(
    (id: string) => {
      const current = eventsRef.current;
      const next = current.filter((e) => e.id !== id);
      if (next.length !== current.length) persist(next);
    },
    [persist],
  );

  const undoEvents = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(eventsRef.current);
    eventsRef.current = prev;
    setEvents(prev);
    writeJSON(eventsKey(calId), prev);
    bump();
  }, [calId]);

  const redoEvents = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
    writeJSON(eventsKey(calId), next);
    bump();
  }, [calId]);

  return {
    events,
    upsertEvent,
    moveEvent,
    deleteEvent,
    undoEvents,
    redoEvents,
    canUndoEvents: pastRef.current.length > 0,
    canRedoEvents: futureRef.current.length > 0,
  };
}
