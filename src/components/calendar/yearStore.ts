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
import {
  isSessionRepeatRule,
  SESSION_REPEAT_DETACHED_VALUE,
  type SessionRepeatRule,
} from "@/lib/sessionRepeat";

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
import {
  notifyCalendarSessionsChanged,
  subscribeCalendarSessionsSync,
} from "@/lib/calendarSessionSync";
import {
  ackMergedCalendarWrites,
  compactCalendarSession,
  enqueueCalendarSessionWrite,
  drainCalendarSessionOutbox,
  fetchCalendarSessions,
  fetchEntityCalendarSessions,
  fetchMembershipSessions,
  isCalendarSessionWritePending,
  loadLocalCalendar,
  loadReplicaCalendar,
  persistCalendarSession,
  persistCalendarSessionDelete,
  persistRetryCalId,
  saveLocalCalendar,
  stageCalendarSessionDelete,
  stageCalendarSessionUpsert,
} from "@/lib/calendarSessionPersist";
import { mergeRemoteSessions } from "@/lib/calendarSessionMerge";
import { listMutations, replaceReplicaCalendar } from "@/lib/calendarSessionReplica";

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
  /** Free-text place / room shown in the session menu. */
  location?: string;
  /** Optional MazeMap (or other) deep link for the location text. */
  locationUrl?: string;
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
  /** Entity mode — scopes session to a roster group (`null` = entity-wide). */
  appGroupId?: string | null;
  /**
   * Owning entity when this session lives on a team calendar.
   * Overlay copies on the individual calendar set this so they stay read-only
   * and are never written into the personal store.
   */
  entityId?: string | null;
  /** Entity mode — when true, participant signup is enabled for this session. */
  signUpEnabled?: boolean;
  /** Recurrence rule when repeat is enabled (`null` = one-off). */
  repeatRule?: SessionRepeatRule | null;
  /** Shared id for instances materialised from one repeat create/edit. */
  repeatSeriesId?: string | null;
  /** True when this row was split out of a series (“This session”). */
  repeatDetached?: boolean;
}

export function isMembershipOverlayEvent(
  event: Pick<CalendarEvent, "entityId"> | null | undefined,
  calId?: string,
): boolean {
  const entityId = event?.entityId;
  if (typeof entityId !== "string" || !entityId) return false;
  if (!calId) return true;
  const teamId = calId.startsWith("diary:team:")
    ? calId.slice(11)
    : calId.startsWith("team:")
      ? calId.slice(5)
      : null;
  if (teamId) return entityId !== teamId;
  return true;
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
  diaryOnly?: boolean;
}
interface ScopeTeam {
  kind: "team";
  entityId: string;
  diaryOnly?: boolean;
}
interface ScopeClient {
  kind: "client";
  clientId: string;
  diaryOnly?: boolean;
}
type Scope = ScopeUser | ScopeTeam | ScopeClient | null;

function parseScope(calId: string): Scope {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (calId.startsWith("diary:user:")) {
    const userId = calId.slice(11);
    return UUID_RE.test(userId) ? { kind: "user", userId, diaryOnly: true } : null;
  }
  if (calId.startsWith("diary:team:")) {
    const entityId = calId.slice(11);
    return UUID_RE.test(entityId) ? { kind: "team", entityId, diaryOnly: true } : null;
  }
  if (calId.startsWith("diary:client:")) {
    const clientId = calId.slice(13);
    return UUID_RE.test(clientId) ? { kind: "client", clientId, diaryOnly: true } : null;
  }
  if (calId.startsWith("user:")) {
    const userId = calId.slice(5);
    return UUID_RE.test(userId) ? { kind: "user", userId } : null;
  }
  if (calId.startsWith("team:")) {
    const entityId = calId.slice(5);
    return UUID_RE.test(entityId) ? { kind: "team", entityId } : null;
  }
  if (calId.startsWith("client:")) {
    const clientId = calId.slice(7);
    return UUID_RE.test(clientId) ? { kind: "client", clientId } : null;
  }
  return null;
}

/** In-memory sessions keyed by calId so profile switches restore the last
 * known set immediately while in-flight writes flush, then the DB reload
 * confirms. Survives hook remounts within the same tab session. */
const eventsByCalId = new Map<string, CalendarEvent[]>();

function replicaToCalendarEvents(
  rows: Array<{
    id: string;
    title?: string;
    startISO?: string;
    endISO?: string;
    entityId?: string | null;
    entity_id?: string | null;
  }>,
): CalendarEvent[] {
  return rows
    .filter((row) => hasRenderableTitle(row.title) && !!row.startISO && !!row.endISO)
    .map((row) => {
      const entityId =
        typeof row.entityId === "string" && row.entityId
          ? row.entityId
          : typeof row.entity_id === "string" && row.entity_id
            ? row.entity_id
            : row.entityId;
      return { ...row, entityId, ...parseStoredRepeat(row) } as CalendarEvent;
    });
}

function persistRow(calId: string, row: { id: string }, event?: CalendarEvent): Promise<boolean> {
  return persistCalendarSession(calId, row as Record<string, unknown> & { id: string }, event ?? null);
}

function unsyncedEventsToRetry(
  events: Array<{
    id: string;
    synced?: boolean;
    title?: string;
    startISO?: string;
    endISO?: string;
    entityId?: string | null;
  }>,
  pendingDeletes: Map<string, number>,
  calId: string,
) {
  return events.filter(
    (event) =>
      event.synced === false &&
      hasRenderableTitle(event.title) &&
      !!event.startISO &&
      !!event.endISO &&
      !pendingDeletes.has(event.id) &&
      persistRetryCalId(calId, event.entityId) != null,
  );
}

/** Local-ISO (no timezone) ↔ timestamptz round-trip that preserves the
 * wall-clock string. We tag the local string with `Z` on write so Postgres
 * stores those exact digits in UTC, then strip the offset on read. */
function isoToDb(s: string): string {
  if (!s) return s;
  if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) return s;
  return s + "Z";
}
function dbToIso(value: unknown): string {
  if (typeof value !== "string" || !value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().replace(/(Z|[+-]\d{2}:?\d{2})$/i, "").slice(0, 19);
    }
    return "";
  }
  return value.replace(" ", "T").replace(/(Z|[+-]\d{2}:?\d{2})$/i, "").slice(0, 19);
}

function rowEntityId(r: Row | Record<string, unknown>): string | null {
  const raw = (r as { entity_id?: unknown }).entity_id ?? (r as { entityId?: unknown }).entityId;
  return typeof raw === "string" && raw ? raw : null;
}

function hasRenderableTitle(title: string | null | undefined): boolean {
  return typeof title === "string" && title.trim().length > 0;
}

/** Compare editable session fields to skip no-op writes. */
function sessionSnapshotEqual(a: CalendarEvent, b: CalendarEvent): boolean {
  return (
    a.title === b.title &&
    a.startISO === b.startISO &&
    a.endISO === b.endISO &&
    a.allDay === b.allDay &&
    (a.color ?? null) === (b.color ?? null) &&
    (a.categoryId ?? null) === (b.categoryId ?? null) &&
    (a.category ?? null) === (b.category ?? null) &&
    (a.location ?? "") === (b.location ?? "") &&
    (a.locationUrl ?? "") === (b.locationUrl ?? "") &&
    (a.activity ?? null) === (b.activity ?? null) &&
    (a.diaryType ?? null) === (b.diaryType ?? null) &&
    (a.diaryGroup ?? null) === (b.diaryGroup ?? null) &&
    (a.diarySub ?? null) === (b.diarySub ?? null) &&
    (a.description ?? "") === (b.description ?? "") &&
    (a.appGroupId ?? null) === (b.appGroupId ?? null) &&
    !!a.signUpEnabled === !!b.signUpEnabled &&
    (a.distanceKm ?? null) === (b.distanceKm ?? null) &&
    (a.paceSecPerKm ?? null) === (b.paceSecPerKm ?? null) &&
    (a.sessionNote ?? "") === (b.sessionNote ?? "") &&
    (a.repeatRule ?? null) === (b.repeatRule ?? null) &&
    (a.repeatSeriesId ?? null) === (b.repeatSeriesId ?? null) &&
    !!a.repeatDetached === !!b.repeatDetached &&
    (a.sortIndex ?? null) === (b.sortIndex ?? null)
  );
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
  location: string | null;
  location_url: string | null;
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
  app_group_id: string | null;
  signup_enabled: boolean;
  repeat_rule: string | null;
  repeat_series_id: string | null;
}

function parseStoredRepeat(r: Row | Record<string, unknown>): {
  repeatRule: SessionRepeatRule | null;
  repeatSeriesId: string | null;
  repeatDetached: boolean;
} {
  const rawRule =
    (r as { repeat_rule?: unknown }).repeat_rule ??
    (r as { repeatRule?: unknown }).repeatRule ??
    null;
  const rawSeries =
    (r as { repeat_series_id?: string | null }).repeat_series_id ??
    (r as { repeatSeriesId?: string | null }).repeatSeriesId ??
    null;
  const detachedFlag = (r as { repeatDetached?: unknown }).repeatDetached === true;
  const detached = detachedFlag || rawRule === SESSION_REPEAT_DETACHED_VALUE;
  const rule = !detached && isSessionRepeatRule(rawRule) ? rawRule : null;
  return {
    repeatRule: rule,
    repeatSeriesId: detached ? null : rawSeries,
    repeatDetached: detached,
  };
}

function rowToEvent(r: Row): CalendarEvent {
  const startRaw =
    (r as { starts_at?: unknown }).starts_at ?? (r as { startISO?: unknown }).startISO;
  const endRaw = (r as { ends_at?: unknown }).ends_at ?? (r as { endISO?: unknown }).endISO;
  return {
    id: r.id,
    startISO: dbToIso(startRaw),
    endISO: dbToIso(endRaw),
    allDay: !!(r.all_day ?? (r as { allDay?: unknown }).allDay),
    title: r.title ?? "",
    color: r.color,
    category: (r.category ?? undefined) as IndividualCategory | undefined,
    categoryId: r.category_id,
    description: r.description ?? undefined,
    location: r.location ?? undefined,
    locationUrl: r.location_url ?? undefined,
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
    appGroupId: r.app_group_id,
    entityId: rowEntityId(r),
    signUpEnabled: !!r.signup_enabled,
    ...parseStoredRepeat(r),
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
    location: e.location ?? null,
    location_url: e.locationUrl ?? null,
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
    app_group_id: e.appGroupId ?? null,
    signup_enabled: !!e.signUpEnabled,
    repeat_rule: e.repeatRule ?? (e.repeatDetached ? SESSION_REPEAT_DETACHED_VALUE : null),
    repeat_series_id: e.repeatSeriesId ?? null,
  };
  if (scope?.kind === "team") {
    base.entity_id = scope.entityId;
    if (coachUserId) base.user_id = coachUserId;
    base.created_by_coach_id = null;
    base.coach_pending = false;
  } else if (scope?.kind === "client" && coachUserId) {
    base.user_id = scope.clientId;
    base.entity_id = null;
    base.created_by_coach_id = coachUserId;
    base.coach_pending = true;
  } else if (scope?.kind === "user") {
    base.user_id = scope.userId;
    base.entity_id = null;
    if (e.coachPending === true && e.createdByCoachId) {
      base.created_by_coach_id = e.createdByCoachId;
      base.coach_pending = true;
    } else {
      base.created_by_coach_id = null;
      base.coach_pending = false;
    }
  }
  return base;
}

export function useEventStore(calId: string) {
  const scope = useMemo(() => parseScope(calId), [calId]);
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [realtimeEpoch, setRealtimeEpoch] = useState(0);
  const eventsRef = useRef<CalendarEvent[]>([]);
  const pendingDeleteIdsRef = useRef<Map<string, number>>(new Map());
  const persistedIdsRef = useRef<Set<string>>(new Set());
  const recentWriteAtRef = useRef<Map<string, number>>(new Map());
  const coachUserIdRef = useRef<string | null>(user?.id ?? null);

  const notifySessionSync = useCallback(async () => {
    if (!scope || !user) return;
    const syncUserId =
      scope.kind === "team"
        ? user.id
        : scope.kind === "user"
          ? scope.userId
          : scope.clientId;
    const syncTeamId = scope.kind === "team" ? scope.entityId : null;
    await notifyCalendarSessionsChanged(supabase, syncUserId, syncTeamId);
  }, [scope, user]);

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
      .filter((row) => !row.entity_id && !hasRenderableTitle(row.title))
      .map((row) => row.id);
    if (invalidIds.length === 0) return;
    for (const id of invalidIds) {
      pendingDeleteIdsRef.current.set(id, Date.now());
    }
    void persistCalendarSessionDelete(calId, invalidIds);
  }, [calId]);

  // Keep the current auth uid in sync so coach-created client sessions never
  // race an async auth lookup and lose `created_by_coach_id` on insert.
  useEffect(() => {
    coachUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    const { data: authSub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (
        (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") &&
        sess?.access_token
      ) {
        void supabase.realtime.setAuth(sess.access_token);
      }
    });
    return () => authSub.subscription.unsubscribe();
  }, []);

  // Initial load + realtime subscription.
  useEffect(() => {
    if (!scope) {
      eventsRef.current = [];
      pendingDeleteIdsRef.current.clear();
      persistedIdsRef.current.clear();
      setEvents([]);
      return;
    }

    const leftoverAnon = eventsByCalId.get("anon");
    if (leftoverAnon && leftoverAnon.length > 0) {
      const current = eventsByCalId.get(calId) ?? [];
      const byId = new Map<string, CalendarEvent>();
      for (const e of current) byId.set(e.id, e);
      for (const e of leftoverAnon) {
        if (hasRenderableTitle(e.title) && e.startISO && e.endISO) byId.set(e.id, e);
      }
      eventsByCalId.set(calId, [...byId.values()]);
      eventsByCalId.delete("anon");
    }

    let cancelled = false;
    pendingDeleteIdsRef.current.clear();
    const snapshot = replicaToCalendarEvents(loadLocalCalendar(user?.id, calId));
    const cached = eventsByCalId.get(calId);
    const seed =
      cached && cached.length > 0
        ? cached
        : snapshot;
    eventsRef.current = seed;
    eventsByCalId.set(calId, seed);
    setEvents(seed);

    const memberTeamIdsRef = { current: new Set<string>() };
    let memberBroadcastUnsubs: Array<() => void> = [];
    let memberSessionChannels: Array<ReturnType<typeof supabase.channel>> = [];
    let subscribedMemberTeamIds: string[] = [];

    const paint = (next: CalendarEvent[]) => {
      eventsByCalId.set(calId, next);
      eventsRef.current = next;
      setEvents(next);
    };

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

    const filterRows = (rows: Row[]): Row[] => {
      let next = scope.diaryOnly ? rows.filter((r) => r.diary_type != null) : rows;
      if (!isCoachViewingClient || !allowedCategoryIds) return next;
      const allowed = allowedCategoryIds;
      return next.filter((r) => {
        const cid = (r as { category_id?: string | null }).category_id;
        return !!cid && allowed.has(cid);
      });
    };

    const pullEntityOverlayRows = async (): Promise<Row[]> => {
      if (scope.kind !== "user") return [];
      const ids = [...memberTeamIdsRef.current];
      if (ids.length === 0) return [];
      const lists = await Promise.all(ids.map((entityId) => fetchEntityCalendarSessions(entityId)));
      const byId = new Map<string, Row>();
      for (const extra of lists) {
        for (const row of extra) {
          const typed = row as unknown as Row;
          if (typed?.id) byId.set(typed.id, typed);
        }
      }
      return [...byId.values()];
    };

    const reload = async (opts?: { reconcile?: boolean }) => {
      const replicaRows = await loadReplicaCalendar(calId);
      const mutations = await listMutations(calId);
      if (cancelled) return;

      const local = replicaToCalendarEvents(replicaRows).map((event) => ({
        ...event,
        synced: isCalendarSessionWritePending(event.id)
          ? false
          : replicaRows.find((row) => row.id === event.id)?.synced,
      }));
      const cached = eventsByCalId.get(calId) ?? [];
      for (const event of cached) {
        if (!hasRenderableTitle(event.title)) continue;
        const idx = local.findIndex((row) => row.id === event.id);
        if (idx < 0) {
          local.push({ ...event, synced: false });
          continue;
        }
        if (isCalendarSessionWritePending(event.id)) {
          local[idx] = { ...local[idx], ...event, synced: false };
        }
      }

      const remote = await fetchCalendarSessions(calId);
      if (cancelled) return;

      if (!remote.ok) {
        const merged = mergeRemoteSessions({
          remoteOk: false,
          remote: [],
          local,
          mutations,
        });
        const next = replicaToCalendarEvents(merged.next);
        persistedIdsRef.current = new Set(
          merged.next.filter((row) => row.synced !== false).map((row) => row.id),
        );
        paint(next);
        if (opts?.reconcile) {
          const unsynced = unsyncedEventsToRetry(merged.next, pendingDeleteIdsRef.current, calId);
          for (const event of unsynced) {
            const writeCalId = persistRetryCalId(calId, event.entityId);
            if (!writeCalId) continue;
            const calendarEvent = event as unknown as CalendarEvent;
            const row = eventToRow(calendarEvent, scope, coachUserIdRef.current);
            await persistRow(writeCalId, { ...row, id: event.id }, calendarEvent);
          }
        }
        return;
      }

      const rows = remote.rows as unknown as Row[];
      if (remote.memberships) {
        memberTeamIdsRef.current = new Set(remote.memberships.map((row) => row.teamId));
      }
      for (const row of rows) {
        const entityId = rowEntityId(row);
        if (entityId) memberTeamIdsRef.current.add(entityId);
      }
      syncMemberEntityRealtime();
      const overlayRows = await pullEntityOverlayRows();
      if (cancelled) return;
      const rowById = new Map<string, Row>();
      for (const row of rows) rowById.set(row.id, row);
      for (const row of overlayRows) rowById.set(row.id, row);
      const combined = [...rowById.values()];
      cleanupUntitledRows(combined);
      const visible = filterRows(combined);
      const remoteEvents = materializeRows(visible).map((event) => ({ ...event, synced: true as const }));
      const retainIds = new Set<string>();
      const retainCutoff = Date.now() - 30_000;
      for (const [id, at] of recentWriteAtRef.current) {
        if (at >= retainCutoff) retainIds.add(id);
        else recentWriteAtRef.current.delete(id);
      }
      for (const event of local) {
        if (event.synced !== true) retainIds.add(event.id);
      }
      let merged = mergeRemoteSessions({
        remoteOk: true,
        remote: remoteEvents,
        local,
        mutations,
        retainIds,
      });

      if (opts?.reconcile) {
        const unsynced = unsyncedEventsToRetry(merged.next, pendingDeleteIdsRef.current, calId);
        for (const event of unsynced) {
          const writeCalId = persistRetryCalId(calId, event.entityId);
          if (!writeCalId) continue;
          const calendarEvent = event as unknown as CalendarEvent;
          const row = eventToRow(calendarEvent, scope, coachUserIdRef.current);
          await persistRow(writeCalId, { ...row, id: event.id }, calendarEvent);
        }
        if (cancelled) return;
        const retry = await fetchCalendarSessions(calId);
        if (cancelled) return;
        const retryMutations = await listMutations(calId);
        if (retry.ok) {
          const retryRows = retry.rows as unknown as Row[];
          const retryOverlay = await pullEntityOverlayRows();
          if (cancelled) return;
          const retryById = new Map<string, Row>();
          for (const row of retryRows) retryById.set(row.id, row);
          for (const row of retryOverlay) retryById.set(row.id, row);
          const retryCombined = [...retryById.values()];
          cleanupUntitledRows(retryCombined);
          merged = mergeRemoteSessions({
            remoteOk: true,
            remote: materializeRows(filterRows(retryCombined)).map((event) => ({ ...event, synced: true as const })),
            local: merged.next,
            mutations: retryMutations,
            retainIds,
          });
        }
      }

      const next = replicaToCalendarEvents(merged.next);
      persistedIdsRef.current = new Set(
        merged.next.filter((row) => row.synced !== false).map((row) => row.id),
      );
      paint(next);
      await ackMergedCalendarWrites(merged.ackUpsertIds, merged.ackDeleteIds);
      await replaceReplicaCalendar(
        calId,
        next.map((event) => ({
          ...event,
          synced: merged.next.find((row) => row.id === event.id)?.synced !== false,
        })),
      );
    };

    void (async () => {
      if (scope.kind === "user") {
        const overlay = await fetchMembershipSessions();
        if (cancelled) return;
        if (overlay.ok) {
          memberTeamIdsRef.current = new Set(overlay.memberships.map((row) => row.teamId));
          const overlayRows = overlay.rows as unknown as Row[];
          for (const row of overlayRows) {
            const entityId = rowEntityId(row);
            if (entityId) memberTeamIdsRef.current.add(entityId);
          }
          syncMemberEntityRealtime();
          const overlayEvents = materializeRows(filterRows(overlayRows)).filter(
            (event) => hasRenderableTitle(event.title) && !!event.startISO && !!event.endISO,
          );
          if (overlayEvents.length > 0) {
            const byId = new Map(eventsRef.current.map((event) => [event.id, event]));
            for (const event of overlayEvents) {
              if (!byId.has(event.id)) byId.set(event.id, event);
            }
            paint([...byId.values()]);
          }
        }
      }
      const replica = replicaToCalendarEvents(await loadReplicaCalendar(calId));
      if (cancelled) return;
      if (replica.length > 0 && eventsRef.current.length === 0) paint(replica);
      else if (replica.length > 0) {
        const byId = new Map(eventsRef.current.map((event) => [event.id, event]));
        for (const event of replica) if (!byId.has(event.id)) byId.set(event.id, event);
        paint([...byId.values()]);
      }
      await drainCalendarSessionOutbox();
      if (cancelled) return;
      await refreshAllowedCategoryIds();
      if (cancelled) return;
      await reload({ reconcile: true });
    })();

    const syncUserId =
      scope.kind === "team"
        ? user?.id ?? null
        : scope.kind === "user"
          ? scope.userId
          : scope.clientId;
    const syncTeamId = scope.kind === "team" ? scope.entityId : null;

    const unsubBroadcast = syncUserId
      ? subscribeCalendarSessionsSync(
          supabase,
          syncUserId,
          syncTeamId,
          () => {
            void reload();
          },
        )
      : () => undefined;

    const rowMatchesScope = (row: Row): boolean => {
      if (!scope) return false;
      const entityId = rowEntityId(row);
      if (scope.kind === "team") return entityId === scope.entityId;
      if (scope.kind === "user") {
        if (row.user_id === scope.userId && !entityId) return true;
        if (typeof entityId !== "string" || !entityId) return false;
        if (memberTeamIdsRef.current.has(entityId)) return true;
        if (subscribedMemberTeamIds.includes(entityId)) {
          memberTeamIdsRef.current.add(entityId);
          return true;
        }
        return false;
      }
      return row.user_id === scope.clientId && !entityId;
    };

    const applyRowToEvents = (row: Row) => {
      if (!rowMatchesScope(row)) return;
      const existing = eventsRef.current.find((e) => e.id === row.id);
      if (isCalendarSessionWritePending(row.id)) return;
      if (!hasRenderableTitle(row.title)) {
        if (existing && hasRenderableTitle(existing.title)) return;
        const next = eventsRef.current.filter((e) => e.id !== row.id);
        if (next.length !== eventsRef.current.length) {
          eventsRef.current = next;
          setEvents(next);
        }
        return;
      }
      const visible = filterRows([row]);
      if (visible.length === 0) {
        if (existing && hasRenderableTitle(existing.title)) return;
        const next = eventsRef.current.filter((e) => e.id !== row.id);
        if (next.length !== eventsRef.current.length) {
          eventsRef.current = next;
          setEvents(next);
        }
        return;
      }
      const incoming = rowToEvent(row);
      if (
        existing &&
        hasRenderableTitle(existing.title) &&
        existing.startISO &&
        existing.endISO &&
        (!hasRenderableTitle(incoming.title) || !incoming.startISO || !incoming.endISO)
      ) {
        return;
      }
      const event =
        existing && hasRenderableTitle(existing.title) && existing.startISO && existing.endISO
          ? {
              ...existing,
              ...incoming,
              title: hasRenderableTitle(incoming.title) ? incoming.title : existing.title,
              startISO: incoming.startISO || existing.startISO,
              endISO: incoming.endISO || existing.endISO,
              entityId: incoming.entityId ?? existing.entityId,
            }
          : incoming;
      persistedIdsRef.current.add(event.id);
      const idx = eventsRef.current.findIndex((e) => e.id === event.id);
      const next =
        idx >= 0
          ? eventsRef.current.map((e) => (e.id === event.id ? event : e))
          : [...eventsRef.current, event];
      eventsRef.current = next;
      eventsByCalId.set(calId, next);
      setEvents(next);
    };

    const sameTeamIds = (ids: string[]) =>
      ids.length === subscribedMemberTeamIds.length &&
      ids.every((id) => subscribedMemberTeamIds.includes(id));

    const handleSessionPayload = (payload: {
      eventType?: string;
      old?: { id?: string };
      new?: Row;
    }) => {
      if (payload.eventType === "DELETE") {
        const deletedId = payload.old?.id;
        if (deletedId) {
          pendingDeleteIdsRef.current.delete(deletedId);
          const next = eventsRef.current.filter((e) => e.id !== deletedId);
          eventsRef.current = next;
          eventsByCalId.set(calId, next);
          setEvents(next);
        }
        return;
      }
      if (payload.eventType === "UPDATE") {
        const updatedId = payload.new?.id;
        if (updatedId && isCalendarSessionWritePending(updatedId)) return;
        applyRowToEvents(payload.new as Row);
        return;
      }
      if (payload.eventType === "INSERT") {
        const insertedId = payload.new?.id;
        if (insertedId && isCalendarSessionWritePending(insertedId)) return;
        applyRowToEvents(payload.new as Row);
      }
    };

    function syncMemberEntityRealtime() {
      if (scope.kind !== "user" || !syncUserId) return;
      const teamIds = [...memberTeamIdsRef.current];
      if (sameTeamIds(teamIds)) return;
      for (const unsub of memberBroadcastUnsubs) unsub();
      memberBroadcastUnsubs = [];
      for (const channel of memberSessionChannels) void supabase.removeChannel(channel);
      memberSessionChannels = [];
      subscribedMemberTeamIds = teamIds;
      memberBroadcastUnsubs = teamIds.map((teamId) =>
        subscribeCalendarSessionsSync(supabase, syncUserId, teamId, () => {
          pullLiveEntitySessions();
        }),
      );
      void (async () => {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.access_token) {
          await supabase.realtime.setAuth(data.session.access_token);
        }
        if (cancelled || !sameTeamIds([...memberTeamIdsRef.current])) return;
        memberSessionChannels = teamIds.map((teamId) =>
          supabase
            .channel(`calendar_sessions:member:${calId}:${teamId}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "calendar_sessions",
                filter: `entity_id=eq.${teamId}`,
              },
              (payload) => handleSessionPayload(payload),
            )
            .subscribe(),
        );
      })();
    }

    const filter =
      scope.kind === "team"
        ? `entity_id=eq.${scope.entityId}`
        : scope.kind === "user"
          ? `user_id=eq.${scope.userId}`
          : `user_id=eq.${scope.clientId}`;

    let pgCh: ReturnType<typeof supabase.channel> = supabase.channel(`calendar_sessions:${calId}`);

    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionData.session?.access_token) {
        await supabase.realtime.setAuth(sessionData.session.access_token);
      } else if (typeof window !== "undefined") {
        try {
          const res = await fetch("/api/auth/session", {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (res.ok) {
            const body = (await res.json()) as {
              access_token?: string;
              refresh_token?: string;
            };
            if (body.access_token && body.refresh_token) {
              await supabase.auth.setSession({
                access_token: body.access_token,
                refresh_token: body.refresh_token,
              });
              await supabase.realtime.setAuth(body.access_token);
            }
          }
        } catch {
          /* ignore */
        }
      }

      pgCh = pgCh
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "calendar_sessions", filter },
          (payload) => {
            if (payload.eventType === "DELETE") {
              const deletedId = (payload.old as { id?: string })?.id;
              if (deletedId) {
                pendingDeleteIdsRef.current.delete(deletedId);
                const next = eventsRef.current.filter((e) => e.id !== deletedId);
                eventsRef.current = next;
                eventsByCalId.set(calId, next);
                setEvents(next);
              }
              return;
            }
            if (payload.eventType === "UPDATE") {
              const updatedId = (payload.new as { id?: string })?.id;
              if (updatedId && isCalendarSessionWritePending(updatedId)) return;
              applyRowToEvents(payload.new as Row);
              return;
            }
            if (payload.eventType === "INSERT") {
              const insertedId = (payload.new as { id?: string })?.id;
              if (insertedId && isCalendarSessionWritePending(insertedId)) return;
              applyRowToEvents(payload.new as Row);
            }
          },
        )
        .subscribe();
    })();

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

    // Optimistic recolor: when the user changes a category color from the
    // side rail, recolor matching events in local state immediately so the
    // UI updates without waiting for the DB cascade + realtime round-trip.
    const onCategoryColorChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            categoryId: string;
            color: string;
            categoryName: string;
            kind: string;
            teamId: string | null;
            scopeUserId: string | null;
          }
        | undefined;
      if (!detail) return;
      // Only apply to the current scope so unrelated mounted stores ignore.
      if (scope.kind === "team") {
        if (detail.teamId !== scope.entityId) return;
      } else if (scope.kind === "user") {
        if (detail.teamId || detail.scopeUserId !== scope.userId) return;
      } else if (scope.kind === "client") {
        if (detail.teamId || detail.scopeUserId !== scope.clientId) return;
      }
      const name = (detail.categoryName ?? "").toLowerCase();
      const matchByName = detail.kind === "diary_activity" && !!name;
      let changed = false;
      const next = eventsRef.current.map((ev) => {
        const idMatch = !!ev.categoryId && ev.categoryId === detail.categoryId;
        const nameMatch =
          matchByName &&
          !ev.categoryId &&
          ((ev.diaryGroup === "endurance" && (ev.diarySub ?? "").toLowerCase() === name) ||
            (!ev.diarySub && (ev.diaryGroup ?? "").toLowerCase() === name));
        if (!idMatch && !nameMatch) return ev;
        if (ev.color === detail.color && ev.categoryId === detail.categoryId) return ev;
        changed = true;
        return { ...ev, color: detail.color, categoryId: detail.categoryId };
      });
      if (changed) {
        eventsRef.current = next;
        setEvents(next);
      }
    };
    window.addEventListener("calendar-category-color-changed", onCategoryColorChange);

    const pullLiveEntitySessions = () => {
      if (scope.kind !== "user") return;
      void (async () => {
        if (cancelled) return;
        if (memberTeamIdsRef.current.size === 0) {
          const overlay = await fetchMembershipSessions();
          if (cancelled || !overlay.ok) return;
          memberTeamIdsRef.current = new Set(overlay.memberships.map((row) => row.teamId));
          for (const row of overlay.rows as unknown as Row[]) {
            const entityId = rowEntityId(row);
            if (entityId) memberTeamIdsRef.current.add(entityId);
            applyRowToEvents(row);
          }
          syncMemberEntityRealtime();
        }
        const overlayRows = await pullEntityOverlayRows();
        if (cancelled) return;
        for (const row of overlayRows) {
          const entityId = rowEntityId(row);
          if (entityId) memberTeamIdsRef.current.add(entityId);
        }
        syncMemberEntityRealtime();
        for (const row of overlayRows) applyRowToEvents(row);
      })();
    };

    const overlayTimer =
      scope.kind === "user" ? window.setInterval(pullLiveEntitySessions, 4000) : 0;
    const onVisibility = () => {
      if (document.visibilityState === "visible") pullLiveEntitySessions();
    };
    if (scope.kind === "user") {
      document.addEventListener("visibilitychange", onVisibility);
      pullLiveEntitySessions();
    }

    return () => {
      cancelled = true;
      if (overlayTimer) window.clearInterval(overlayTimer);
      if (scope.kind === "user") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      unsubBroadcast();
      for (const unsub of memberBroadcastUnsubs) unsub();
      for (const channel of memberSessionChannels) void supabase.removeChannel(channel);
      void supabase.removeChannel(pgCh);
      if (accessCh) void supabase.removeChannel(accessCh);
      window.removeEventListener("calendar-category-color-changed", onCategoryColorChange);
    };
  }, [calId, cleanupUntitledRows, materializeRows, scope, user?.id, realtimeEpoch]);

  const applyLocal = useCallback((next: CalendarEvent[]) => {
    eventsRef.current = next;
    eventsByCalId.set(calId, next);
    setEvents(next);
    saveLocalCalendar(
      user?.id,
      calId,
      next.filter((e) => hasRenderableTitle(e.title) && !!e.startISO && !!e.endISO),
    );
  }, [calId, user?.id]);

  const enqueueWrite = useCallback((id: string, task: () => Promise<void>) => {
    return enqueueCalendarSessionWrite(id, task);
  }, []);

  const canMutateEvent = useCallback(
    (event: CalendarEvent | undefined | null) => {
      if (!event) return false;
      if (event.entityId && scope?.kind === "user") return false;
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
            stageCalendarSessionDelete(calId, id);
            void enqueueWrite(id, async () => {
              const ok = await persistCalendarSessionDelete(calId, [id]);
              if (!ok) console.error("[calendar_sessions delete]", id);
              else {
                persistedIdsRef.current.delete(id);
                await notifySessionSync();
              }
            });
          }
        }
        return merged;
      }
      merged.title = nextTitle;
      if (!existing && merged.sortIndex == null) merged.sortIndex = Date.now();
      if (scope?.kind === "team") merged.entityId = scope.entityId;
      const next = existing ? current.map((e) => (e.id === id ? merged : e)) : [...current, merged];
      recentWriteAtRef.current.set(merged.id, Date.now());
      applyLocal(next);

      const revertLocal = () => {
        const latest = eventsRef.current;
        const reverted = existing
          ? latest.map((e) => (e.id === id ? existing : e))
          : latest.filter((e) => e.id !== id);
        applyLocal(reverted);
      };

      if (!scope) {
        console.error("[calendar_sessions upsert] skipped: invalid calId", calId);
        revertLocal();
        return merged;
      }
      if (!merged.startISO || !merged.endISO) {
        console.warn("[calendar_sessions upsert] skipped: missing timestamps", merged.id);
        revertLocal();
        return merged;
      }
      const writeCalId = calId;
      const row = compactCalendarSession({
        ...eventToRow(merged, scope, coachUserIdRef.current),
        id: merged.id,
      } as Record<string, unknown> & { id: string });
      stageCalendarSessionUpsert(writeCalId, row, merged);
      void enqueueWrite(merged.id, async () => {
        const ok = await persistRow(writeCalId, row, merged);
        if (!ok) {
          console.error("[calendar_sessions upsert] database insert failed", merged.id, writeCalId);
          return;
        }
        persistedIdsRef.current.add(merged.id);
        recentWriteAtRef.current.set(merged.id, Date.now());
        if (pendingDeleteIdsRef.current.has(merged.id)) {
          const deleted = await persistCalendarSessionDelete(writeCalId, [merged.id]);
          if (!deleted) console.error("[calendar_sessions cleanup delete]", merged.id);
          else persistedIdsRef.current.delete(merged.id);
        }
        await notifySessionSync();
      });
      return merged;
    },
    [
      applyLocal,
      canMutateEvent,
      enqueueWrite,
      notifySessionSync,
      scope,
      calId,
    ],
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
      void Promise.all(updates).then(async () => {
        await notifySessionSync();
      });
    },
    [applyLocal, notifySessionSync],
  );

  const moveEvent = useCallback(
    (id: string, patch: Partial<Pick<CalendarEvent, "startISO" | "endISO" | "allDay" | "sortIndex">>) => {
      const current = eventsRef.current;
      const existing = current.find((e) => e.id === id);
      if (!existing || !canMutateEvent(existing)) return;
      const merged: CalendarEvent = { ...existing, ...patch };
      if (sessionSnapshotEqual(existing, merged)) return;
      const next = current.map((e) => (e.id === id ? merged : e));
      applyLocal(next);
      if (scope && merged.startISO && merged.endISO) {
        const row = compactCalendarSession({
          ...eventToRow(merged, scope, coachUserIdRef.current),
          id: merged.id,
        } as Record<string, unknown> & { id: string });
        stageCalendarSessionUpsert(calId, row, merged);
        void enqueueWrite(id, async () => {
          const ok = await persistRow(calId, row, merged);
          if (!ok) console.error("[calendar_sessions move] database write failed", id);
          else await notifySessionSync();
        });
      }
    },
    [applyLocal, calId, canMutateEvent, enqueueWrite, notifySessionSync, scope],
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
      stageCalendarSessionDelete(calId, id);
      void enqueueWrite(id, async () => {
        const ok = await persistCalendarSessionDelete(calId, [id]);
        if (!ok) console.error("[calendar_sessions delete]", id);
        else {
          persistedIdsRef.current.delete(id);
          await notifySessionSync();
        }
      });
    },
    [applyLocal, calId, canMutateEvent, enqueueWrite, notifySessionSync],
  );

  const deleteEvents = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const current = eventsRef.current;
      const idSet = new Set(ids);
      const removed = current.filter((e) => idSet.has(e.id) && canMutateEvent(e));
      if (!removed.length) return;
      const deleteIds = removed.map((e) => e.id);
      const deleteIdSet = new Set(deleteIds);
      const next = current.filter((e) => !deleteIdSet.has(e.id));
      for (const id of deleteIds) pendingDeleteIdsRef.current.set(id, Date.now());
      applyLocal(next);
      if (!scope) return;
      for (const id of deleteIds) stageCalendarSessionDelete(calId, id);
      const bulkKey = `bulk-delete:${deleteIds.join(",")}`;
      void enqueueWrite(bulkKey, async () => {
        const ok = await persistCalendarSessionDelete(calId, deleteIds);
        if (!ok) console.error("[calendar_sessions bulk delete]", deleteIds);
        else {
          for (const id of deleteIds) persistedIdsRef.current.delete(id);
          await notifySessionSync();
        }
      });
    },
    [applyLocal, calId, canMutateEvent, enqueueWrite, notifySessionSync, scope],
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
        else await notifySessionSync();
      });
    },
    [applyLocal, enqueueWrite, notifySessionSync],
  );

  /**
   * Record sessions already persisted elsewhere (e.g. file import confirm)
   * and merge them into the local store.
   * Pass `{ merge: false }` when sessions are already in the store (e.g. paste).
   */
  const recordCreatedSessions = useCallback(
    (sessions: CalendarEvent[], opts?: { merge?: boolean }) => {
      if (!sessions.length) return;
      if (opts?.merge !== false) {
        for (const s of sessions) pendingDeleteIdsRef.current.delete(s.id);
        const byId = new Map(eventsRef.current.map((e) => [e.id, e]));
        for (const s of sessions) byId.set(s.id, s);
        applyLocal([...byId.values()]);
      }
    },
    [applyLocal],
  );

  return {
    events,
    upsertEvent,
    reorderEvents,
    moveEvent,
    deleteEvent,
    deleteEvents,
    acceptCoachSession,
    canMutateEvent,
    recordCreatedSessions,
    /** Force a full reload from Supabase (e.g. after batch import). */
    refreshEvents: () => setRealtimeEpoch((n) => n + 1),
  };
}
