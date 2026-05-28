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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

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

function hasCellPayload(cell: Partial<CellData>) {
  return Boolean(
    cell.text ||
    cell.bold ||
    cell.italic ||
    cell.underline ||
    cell.color ||
    cell.duration ||
    cell.description ||
    cell.layer ||
    cell.groupId ||
    cell.locationId ||
    cell.courseId,
  );
}

function sanitizeLoadedCells(raw: Record<string, CellData> | unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { cleaned: {} as Record<string, CellData>, changed: true };
  }

  let changed = false;
  const cleaned: Record<string, CellData> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      changed = true;
      continue;
    }

    const cell = value as Partial<CellData>;
    const legacyText = typeof cell.text === "string" ? cell.text.trim() : "";
    const stripLegacySession = legacyText.length > 0;

    const next: CellData = {
      id: typeof cell.id === "string" && cell.id ? cell.id : key,
      text: stripLegacySession ? "" : typeof cell.text === "string" ? cell.text : "",
      bold: stripLegacySession ? undefined : cell.bold,
      italic: stripLegacySession ? undefined : cell.italic,
      underline: stripLegacySession ? undefined : cell.underline,
      color: stripLegacySession ? undefined : cell.color,
      duration: typeof cell.duration === "string" ? cell.duration : undefined,
      description: typeof cell.description === "string" ? cell.description : undefined,
      layer:
        cell.layer === "events" || cell.layer === "meetings" || cell.layer === "trainings"
          ? cell.layer
          : undefined,
      groupId: typeof cell.groupId === "string" || cell.groupId === null ? cell.groupId : undefined,
      locationId:
        typeof cell.locationId === "string" || cell.locationId === null
          ? cell.locationId
          : undefined,
      courseId:
        typeof cell.courseId === "string" || cell.courseId === null ? cell.courseId : undefined,
    };

    if (stripLegacySession || next.id !== cell.id) changed = true;
    if (!hasCellPayload(next)) {
      changed = true;
      continue;
    }

    cleaned[key] = next;
  }

  return { cleaned, changed };
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
    const { cleaned, changed } = sanitizeLoadedCells(loaded);
    dataRef.current = cleaned;
    setData(cleaned);
    if (changed) writeJSON(dataKey(calId), cleaned);
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
    (
      next: Record<string, CellData>,
      opts?: { history?: boolean; prev?: Record<string, CellData> },
    ) => {
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

  return {
    data,
    meta,
    upsertCell,
    upsertCells,
    fillRange,
    setMeta: persistMeta,
    undo,
    redo,
    canUndo,
    canRedo,
  };
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
import { supabase } from "@/integrations/supabase/client";

export type IndividualCategory = "training" | "school" | "work" | "else";

export type DiaryActivity = "running" | "cycling" | "swimming" | "strength" | "xcskiing";

export interface CalendarEvent {
  id: string;
  startISO: string; // local ISO, e.g. "2026-05-04T09:30:00"
  endISO: string; // local ISO
  allDay: boolean;
  title: string;
  color: string | null; // hex
  category?: IndividualCategory;
  categoryId?: string | null;
  description?: string;
  activity?: DiaryActivity;
  distanceKm?: number;
  paceSecPerKm?: number;
  diaryType?: "training" | "note";
  diaryGroup?: string;
  diarySub?: string;
  sessionNote?: string;
  sessionNoteUpdatedAt?: string;
  activities?: { type: string; durationMin?: number; distanceKm?: number }[];
  stravaActivityId?: number;
  summaryPolyline?: string;
  totalElevationGainM?: number;
  averageHeartrate?: number;
  sportType?: string;
  subType?: string;
  sortIndex?: number;
  /** Coach workflow: set when a coach created this session in the client's calendar. */
  createdByCoachId?: string | null;
  /** True while a coach-created session is awaiting client acceptance. */
  coachPending?: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// calId convention:
//   "user:<uuid>"  → personal calendar (user_id = uuid, entity_id IS NULL)
//   "team:<uuid>"  → team / entity calendar (entity_id = uuid)
//   "client:<uuid>" → coach viewing a client's personal calendar
//                    (user_id = uuid, entity_id IS NULL)
// ──────────────────────────────────────────────────────────────────────

interface ScopeUser {
  kind: "user";
  userId: string;
}
interface ScopeTeam {
  kind: "team";
  entityId: string;
}
interface ScopeClient {
  kind: "client";
  clientId: string;
}
type Scope = ScopeUser | ScopeTeam | ScopeClient | null;

function parseScope(calId: string): Scope {
  if (calId.startsWith("user:")) return { kind: "user", userId: calId.slice(5) };
  if (calId.startsWith("team:")) return { kind: "team", entityId: calId.slice(5) };
  if (calId.startsWith("client:")) return { kind: "client", clientId: calId.slice(7) };
  return null;
}

/** Local-ISO (no timezone) ↔ timestamptz round-trip that preserves the
 * wall-clock string. We tag the local string with `Z` on write so Postgres
 * stores those exact digits in UTC, then strip the offset on read. */
function isoToDb(s: string): string {
  if (!s) return s;
  if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) return s;
  return s + "Z";
}
function dbToIso(s: string): string {
  if (!s) return s;
  return s.replace(/(Z|[+-]\d{2}:?\d{2})$/i, "").slice(0, 19);
}

function hasRenderableTitle(title: string | null | undefined): boolean {
  return typeof title === "string" && title.trim().length > 0;
}

interface Row {
  id: string;
  user_id: string;
  entity_id: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  title: string;
  color: string | null;
  category: string | null;
  category_id: string | null;
  description: string | null;
  activity: string | null;
  distance_km: number | null;
  pace_sec_per_km: number | null;
  diary_type: string | null;
  diary_group: string | null;
  diary_sub: string | null;
  session_note: string | null;
  session_note_updated_at: string | null;
  activities: CalendarEvent["activities"] | null;
  strava_activity_id: number | null;
  summary_polyline: string | null;
  total_elevation_gain_m: number | null;
  average_heartrate: number | null;
  sport_type: string | null;
  sub_type: string | null;
  sort_index: number | null;
  created_by_coach_id: string | null;
  coach_pending: boolean;
}

function rowToEvent(r: Row): CalendarEvent {
  return {
    id: r.id,
    startISO: dbToIso(r.starts_at),
    endISO: dbToIso(r.ends_at),
    allDay: r.all_day,
    title: r.title ?? "",
    color: r.color,
    category: (r.category ?? undefined) as IndividualCategory | undefined,
    categoryId: r.category_id,
    description: r.description ?? undefined,
    activity: (r.activity ?? undefined) as DiaryActivity | undefined,
    distanceKm: r.distance_km ?? undefined,
    paceSecPerKm: r.pace_sec_per_km ?? undefined,
    diaryType: (r.diary_type ?? undefined) as "training" | "note" | undefined,
    diaryGroup: r.diary_group ?? undefined,
    diarySub: r.diary_sub ?? undefined,
    sessionNote: r.session_note ?? undefined,
    sessionNoteUpdatedAt: r.session_note_updated_at ?? undefined,
    activities: r.activities ?? undefined,
    stravaActivityId: r.strava_activity_id ?? undefined,
    summaryPolyline: r.summary_polyline ?? undefined,
    totalElevationGainM: r.total_elevation_gain_m ?? undefined,
    averageHeartrate: r.average_heartrate ?? undefined,
    sportType: r.sport_type ?? undefined,
    subType: r.sub_type ?? undefined,
    sortIndex: r.sort_index ?? undefined,
    createdByCoachId: r.created_by_coach_id,
    coachPending: r.coach_pending,
  };
}

function eventToRow(e: CalendarEvent, scope: Scope, coachUserId: string | null): Partial<Row> {
  const base: Partial<Row> = {
    id: e.id,
    starts_at: isoToDb(e.startISO),
    ends_at: isoToDb(e.endISO),
    all_day: e.allDay,
    title: e.title ?? "",
    color: e.color ?? null,
    category: e.category ?? null,
    category_id: e.categoryId ?? null,
    description: e.description ?? null,
    activity: e.activity ?? null,
    distance_km: e.distanceKm ?? null,
    pace_sec_per_km: e.paceSecPerKm ?? null,
    diary_type: e.diaryType ?? null,
    diary_group: e.diaryGroup ?? null,
    diary_sub: e.diarySub ?? null,
    session_note: e.sessionNote ?? null,
    session_note_updated_at: e.sessionNoteUpdatedAt ?? null,
    activities: e.activities ?? null,
    strava_activity_id: e.stravaActivityId ?? null,
    summary_polyline: e.summaryPolyline ?? null,
    total_elevation_gain_m: e.totalElevationGainM ?? null,
    average_heartrate: e.averageHeartrate ?? null,
    sport_type: e.sportType ?? null,
    sub_type: e.subType ?? null,
    sort_index: e.sortIndex ?? null,
  };
  if (scope?.kind === "team") {
    base.entity_id = scope.entityId;
  } else if (scope?.kind === "client" && coachUserId) {
    base.user_id = scope.clientId;
    base.entity_id = null;
    base.created_by_coach_id = coachUserId;
    base.coach_pending = true;
  } else if (scope?.kind === "user") {
    base.user_id = scope.userId;
    base.entity_id = null;
    // Preserve the existing pending state: when an individual user edits a
    // coach-created session (drag, time edit, title edit, color change), the
    // pending stripe must remain until they explicitly accept it via Save /
    // Enter (handled by acceptCoachSession). Forcing false here would strip
    // the pending state on every auto-save side-effect.
    base.created_by_coach_id = e.createdByCoachId ?? null;
    base.coach_pending = e.coachPending === true;
  }
  return base;
}

export function useEventStore(calId: string) {
  const scope = useMemo(() => parseScope(calId), [calId]);
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const eventsRef = useRef<CalendarEvent[]>([]);
  const pendingDeleteIdsRef = useRef<Map<string, number>>(new Map());
  const pendingWriteByIdRef = useRef<Map<string, Promise<void>>>(new Map());
  const pastRef = useRef<CalendarEvent[][]>([]);
  const futureRef = useRef<CalendarEvent[][]>([]);
  const coachUserIdRef = useRef<string | null>(null);
  const [, forceTick] = useState(0);
  const bump = () => forceTick((n) => n + 1);

  const materializeRows = useCallback((rows: Row[]) => {
    const now = Date.now();
    const tombstones = pendingDeleteIdsRef.current;
    const liveIds = new Set(rows.map((row) => row.id));

    for (const [id, markedAt] of Array.from(tombstones.entries())) {
      if (!liveIds.has(id) || now - markedAt > 30_000) {
        tombstones.delete(id);
      }
    }

    return rows
      .filter((row) => hasRenderableTitle(row.title))
      .filter((row) => !tombstones.has(row.id))
      .map(rowToEvent);
  }, []);

  const cleanupUntitledRows = useCallback((rows: Row[]) => {
    const invalidIds = rows
      .filter((row) => !hasRenderableTitle(row.title))
      .map((row) => row.id);
    if (invalidIds.length === 0) return;
    for (const id of invalidIds) {
      pendingDeleteIdsRef.current.set(id, Date.now());
    }
    void supabase
      .from("calendar_sessions")
      .delete()
      .in("id", invalidIds)
      .then(({ error }) => {
        if (error) console.error("[calendar_sessions cleanup untitled]", error);
      });
  }, []);

  // Keep the current auth uid in sync so coach-created client sessions never
  // race an async auth lookup and lose `created_by_coach_id` on insert.
  useEffect(() => {
    coachUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // Initial load + realtime subscription.
  useEffect(() => {
    if (!scope) {
      eventsRef.current = [];
      pendingDeleteIdsRef.current.clear();
      pendingWriteByIdRef.current.clear();
      setEvents([]);
      return;
    }
    let cancelled = false;
    pendingDeleteIdsRef.current.clear();

    // For coaches viewing a client's calendar, the only sessions we may
    // surface are those whose `category_id` has been explicitly granted via
    // `calendar_category_coach_access`. Default = no access. We resolve the
    // allowed-category set once per (client, coach) pair and re-filter on
    // every reload (initial + realtime). If the coach is also the client
    // (viewing own calendar through a client URL), we skip the filter.
    let allowedCategoryIds: Set<string> | null = null;
    const isCoachViewingClient =
      scope.kind === "client" && !!user?.id && user.id !== (scope as ScopeClient).clientId;

    const refreshAllowedCategoryIds = async () => {
      if (!isCoachViewingClient) {
        allowedCategoryIds = null;
        return;
      }
      const { data } = await supabase
        .from("calendar_category_coach_access")
        .select("category_id")
        .eq("owner_id", (scope as ScopeClient).clientId)
        .eq("coach_user_id", user!.id);
      allowedCategoryIds = new Set(
        (data ?? [])
          .map((r) => r.category_id as string | null)
          .filter((id): id is string => !!id),
      );
    };

    const baseSelect = () => {
      let q = supabase.from("calendar_sessions").select("*");
      if (scope.kind === "team") q = q.eq("entity_id", scope.entityId);
      else if (scope.kind === "user") q = q.eq("user_id", scope.userId).is("entity_id", null);
      else q = q.eq("user_id", scope.clientId).is("entity_id", null);
      return q;
    };

    const filterRows = (rows: Row[]): Row[] => {
      if (!isCoachViewingClient || !allowedCategoryIds) return rows;
      const allowed = allowedCategoryIds;
      return rows.filter((r) => {
        const cid = (r as { category_id?: string | null }).category_id;
        return !!cid && allowed.has(cid);
      });
    };

    const reload = async () => {
      const { data } = await baseSelect();
      if (cancelled) return;
      const rows = (data ?? []) as Row[];
      cleanupUntitledRows(rows);
      const visible = filterRows(rows);
      const next = materializeRows(visible);
      eventsRef.current = next;
      setEvents(next);
    };

    void (async () => {
      await refreshAllowedCategoryIds();
      if (cancelled) return;
      await reload();
    })();

    const filter =
      scope.kind === "team"
        ? `entity_id=eq.${scope.entityId}`
        : scope.kind === "user"
          ? `user_id=eq.${scope.userId}`
          : `user_id=eq.${scope.clientId}`;

    const ch = supabase
      .channel(`calendar_sessions:${calId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_sessions", filter },
        () => {
          void reload();
        },
      )
      .subscribe();

    // When the client grants/revokes category access for this coach, refresh
    // the allowed set and re-filter the in-memory rows immediately.
    let accessCh: ReturnType<typeof supabase.channel> | null = null;
    if (isCoachViewingClient) {
      accessCh = supabase
        .channel(`ccca:${(scope as ScopeClient).clientId}:${user!.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "calendar_category_coach_access",
            filter: `owner_id=eq.${(scope as ScopeClient).clientId}`,
          },
          () => {
            void (async () => {
              await refreshAllowedCategoryIds();
              if (cancelled) return;
              await reload();
            })();
          },
        )
        .subscribe();
    }

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
      if (accessCh) void supabase.removeChannel(accessCh);
    };
  }, [calId, cleanupUntitledRows, materializeRows, scope, user?.id]);

  const applyLocal = useCallback((next: CalendarEvent[], opts?: { history?: boolean }) => {
    if (opts?.history !== false) {
      pastRef.current.push(eventsRef.current);
      if (pastRef.current.length > 100) pastRef.current.shift();
      futureRef.current = [];
      bump();
    }
    eventsRef.current = next;
    setEvents(next);
  }, []);

  const enqueueWrite = useCallback((id: string, task: () => Promise<void>) => {
    const previous = pendingWriteByIdRef.current.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    const tracked = next.then(
      () => undefined,
      (error) => {
        console.error("[calendar_sessions write queue]", error);
      },
    );
    pendingWriteByIdRef.current.set(id, tracked);
    void tracked.finally(() => {
      if (pendingWriteByIdRef.current.get(id) === tracked) {
        pendingWriteByIdRef.current.delete(id);
      }
    });
    return next;
  }, []);

  const canMutateEvent = useCallback(
    (event: CalendarEvent | undefined | null) => {
      if (!event) return false;
      if (scope?.kind !== "client") return true;
      const coachId = coachUserIdRef.current;
      return !!coachId && event.coachPending === true && event.createdByCoachId === coachId;
    },
    [scope],
  );

  const upsertEvent = useCallback(
    (
      patch:
        | (Partial<CalendarEvent> & Pick<CalendarEvent, "startISO" | "endISO" | "title">)
        | (Partial<CalendarEvent> & { id: string }),
    ) => {
      const current = eventsRef.current;
      const hasIdInPatch = (patch as { id?: string }).id != null;
      const id = (patch as { id?: string }).id ?? makeEventId();
      const existing = current.find((e) => e.id === id);
      if (existing && !canMutateEvent(existing)) {
        return existing;
      }
      const deletedAt = pendingDeleteIdsRef.current.get(id);
      if (deletedAt && Date.now() - deletedAt < 30_000) {
        return null as unknown as CalendarEvent;
      }
      // Guard: a patch that references an id we no longer have locally AND
      // doesn't bring its own timestamps would resurrect a ghost tile (empty
      // title, empty start/end) — happens when a late callback fires for an
      // event that was just deleted via the popover. Drop it silently.
      if (
        hasIdInPatch &&
        !existing &&
        (!(patch as Partial<CalendarEvent>).startISO || !(patch as Partial<CalendarEvent>).endISO)
      ) {
        return null as unknown as CalendarEvent;
      }
      pendingDeleteIdsRef.current.delete(id);
      const merged: CalendarEvent = {
        allDay: false,
        color: null,
        title: "",
        startISO: "",
        endISO: "",
        ...existing,
        ...patch,
        id,
      };
      const nextTitle = merged.title.trim();
      if (!nextTitle) {
        if (existing) {
          pendingDeleteIdsRef.current.set(id, Date.now());
          const next = current.filter((e) => e.id !== id);
          applyLocal(next);
          if (scope) {
            void enqueueWrite(id, async () => {
              const { error } = await supabase.from("calendar_sessions").delete().eq("id", id);
              if (error) console.error("[calendar_sessions delete]", error);
            });
          }
        }
        return merged;
      }
      merged.title = nextTitle;
      if (!existing && merged.sortIndex == null) merged.sortIndex = Date.now();
      const next = existing ? current.map((e) => (e.id === id ? merged : e)) : [...current, merged];
      applyLocal(next);

      if (scope) {
        // Guard against writing an empty timestamp to a timestamptz column —
        // happens if a patch (e.g. `{id, color}`) arrives for an event that
        // was just removed locally and `existing` is no longer in the ref.
        if (!merged.startISO || !merged.endISO) {
          console.warn("[calendar_sessions upsert] skipped: missing timestamps", merged.id);
          return merged;
        }
        const row = eventToRow(merged, scope, coachUserIdRef.current);
        void enqueueWrite(merged.id, async () => {
          const write = existing
            ? supabase.from("calendar_sessions").update(row as never).eq("id", merged.id)
            : supabase.from("calendar_sessions").insert(row as never);
          const { error } = await write;
          if (error) {
            console.error(existing ? "[calendar_sessions update]" : "[calendar_sessions insert]", error);
            return;
          }
          if (pendingDeleteIdsRef.current.has(merged.id)) {
            const { error: deleteError } = await supabase
              .from("calendar_sessions")
              .delete()
              .eq("id", merged.id);
            if (deleteError) console.error("[calendar_sessions cleanup delete]", deleteError);
          }
        });
      }
      return merged;
    },
    [applyLocal, canMutateEvent, enqueueWrite, scope],
  );

  const reorderEvents = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const current = eventsRef.current;
      const base = Date.now();
      const indexById = new Map<string, number>();
      ids.forEach((id, i) => indexById.set(id, base + i));
      let changed = false;
      const next = current.map((e) => {
        const si = indexById.get(e.id);
        if (si == null) return e;
        if (e.sortIndex === si) return e;
        changed = true;
        return { ...e, sortIndex: si };
      });
      if (!changed) return;
      applyLocal(next);
      const updates = next
        .filter((e) => indexById.has(e.id))
        .map((e) =>
          supabase
            .from("calendar_sessions")
            .update({ sort_index: e.sortIndex ?? null })
            .eq("id", e.id),
        );
      void Promise.all(updates);
    },
    [applyLocal],
  );

  const moveEvent = useCallback(
    (id: string, patch: Partial<Pick<CalendarEvent, "startISO" | "endISO" | "allDay">>) => {
      const current = eventsRef.current;
      const existing = current.find((e) => e.id === id);
      if (!existing || !canMutateEvent(existing)) return;
      // When the owner (client) drag-and-drops a coach-created pending
      // session, treat the drag as an implicit accept: clear coach_pending
      // so the tile returns to its normal color. The coach themselves keeps
      // the pending stripe until the client explicitly accepts.
      const viewerIsOwner =
        !!user?.id &&
        existing.createdByCoachId != null &&
        existing.createdByCoachId !== user.id;
      const shouldAccept = existing.coachPending === true && viewerIsOwner;
      const merged: CalendarEvent = {
        ...existing,
        ...patch,
        ...(shouldAccept ? { coachPending: false } : {}),
      };
      const next = current.map((e) => (e.id === id ? merged : e));
      applyLocal(next);
      const dbPatch: {
        starts_at?: string;
        ends_at?: string;
        all_day?: boolean;
        coach_pending?: boolean;
      } = {};
      if (patch.startISO != null) dbPatch.starts_at = isoToDb(patch.startISO);
      if (patch.endISO != null) dbPatch.ends_at = isoToDb(patch.endISO);
      if (patch.allDay != null) dbPatch.all_day = patch.allDay;
      if (shouldAccept) dbPatch.coach_pending = false;
      if (Object.keys(dbPatch).length > 0) {
        void enqueueWrite(id, async () => {
          const { error } = await supabase.from("calendar_sessions").update(dbPatch).eq("id", id);
          if (error) console.error("[calendar_sessions move]", error);
        });
      }
    },
    [applyLocal, canMutateEvent, enqueueWrite, user?.id],
  );

  const deleteEvent = useCallback(
    (id: string) => {
      const current = eventsRef.current;
      const existing = current.find((e) => e.id === id);
      if (!existing || !canMutateEvent(existing)) return;
      const next = current.filter((e) => e.id !== id);
      if (next.length === current.length) return;
      pendingDeleteIdsRef.current.set(id, Date.now());
      applyLocal(next);
      void enqueueWrite(id, async () => {
        const { error } = await supabase.from("calendar_sessions").delete().eq("id", id);
        if (error) console.error("[calendar_sessions delete]", error);
      });
    },
    [applyLocal, canMutateEvent, enqueueWrite],
  );

  /** Flip a coach-pending session into the accepted (owner) state. */
  const acceptCoachSession = useCallback(
    (id: string) => {
      const current = eventsRef.current;
      const next = current.map((e) => (e.id === id ? { ...e, coachPending: false } : e));
      applyLocal(next);
      void enqueueWrite(id, async () => {
        const { error } = await supabase
          .from("calendar_sessions")
          .update({ coach_pending: false })
          .eq("id", id);
        if (error) console.error("[calendar_sessions accept coach session]", error);
      });
    },
    [applyLocal, enqueueWrite],
  );

  const undoEvents = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(eventsRef.current);
    eventsRef.current = prev;
    setEvents(prev);
    bump();
    // Note: undo/redo currently only replays in memory; DB state will
    // resync from the next realtime tick if a write fails. Full DB undo
    // can be layered on later if needed.
  }, []);

  const redoEvents = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
    bump();
  }, []);

  return {
    events,
    upsertEvent,
    reorderEvents,
    moveEvent,
    deleteEvent,
    acceptCoachSession,
    undoEvents,
    redoEvents,
    canUndoEvents: pastRef.current.length > 0,
    canRedoEvents: futureRef.current.length > 0,
  };
}
