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

  return { data, meta, upsertCell, fillRange, setMeta: persistMeta, undo, redo, canUndo, canRedo };
}
